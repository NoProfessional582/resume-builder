import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
process.env.RB_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'story-matching-'));
const { db, migrate } = await import('../src/db.ts');
const { createPosition, createStory, listPositions } = await import('../src/resume/positions.ts');
const { saveStoryMatches, suggestStoryMatches } = await import('../src/resume/storyMatching.ts');
const { getTailored } = await import('../src/resume/tailoring.ts');
const { runner } = await import('../src/agent/runner.ts');
migrate();
const base = { organization: 'Example', title: 'Lead', location: null, description: null, start: null, end: null };
const role = createPosition(base);
const other = createPosition({ ...base, organization: 'Other' });
const story = createStory(role, 'Led training for 50 customers, improving adoption by 20%.');
const second = createStory(role, 'Created the training curriculum.');
const unrelated = createStory(other, 'Led training.');
const profile = listPositions();
const content = { summary: [], skills: [], positions: [{ ...base, positionId: -1, bullets: [
  { text: 'Trained 50 customers and improved adoption by 20%.', sourceStoryIds: [], keywords: [] },
  { text: 'Won a company award.', sourceStoryIds: [], keywords: [] },
] }], education: [], certifications: [], entries: [], gaps: [], notes: '' };
db.prepare('INSERT INTO application(id,company,role_title,job_description,created_at,updated_at) VALUES(1,?,?,?,1,1)').run('Example', 'Lead', 'Posting');
db.prepare("INSERT INTO resume_import(id,filename,file_path,blocks,status,created_at) VALUES(1,'upload.docx','unused','[]','ready',1)").run();
db.prepare("INSERT INTO tailored_resume(id,application_id,status,settings,content,ai_content,created_at,source_import_id) VALUES(1,1,'ready','{}',?,?,1,1)").run(JSON.stringify(content), JSON.stringify(content));
const expectedContent = JSON.stringify(content);
const matches = [{ index: 0, positionId: role, bullets: [
  { index: 0, storyIds: [story.id, second.id], reason: 'Same training accomplishment.' },
  { index: 1, storyIds: [], reason: 'No supporting story.' },
] }];
const payload = { expectedContent, matches };
assert.throws(() => saveStoryMatches(1, { ...payload, matches: [{ ...matches[0], bullets: [{ ...matches[0].bullets[0], storyIds: [unrelated.id] }, matches[0].bullets[1]] }] }), /belong/);
assert.throws(() => saveStoryMatches(1, { ...payload, matches: [] }), /every uploaded role/);
assert.throws(() => saveStoryMatches(1, { ...payload, matches: [{ ...matches[0], bullets: [matches[0].bullets[0]] }] }), /every bullet/);
assert.throws(() => saveStoryMatches(1, { ...payload, expectedContent: 'stale' }), /changed/);
runner.run = (async () => ({ runId: 1, output: { matches } })) as typeof runner.run;
const suggestion = await suggestStoryMatches(1);
assert.deepEqual(suggestion.matches, matches);
assert.equal(getTailored(1).content!.positions[0].positionId, -1, 'Suggestions must not apply themselves');
const saved = saveStoryMatches(1, suggestion);
assert.equal(saved.content!.positions[0].positionId, role);
assert.deepEqual(saved.content!.positions[0].bullets[0].sourceStoryIds, [story.id, second.id]);
assert.deepEqual(saved.content!.positions[0].bullets[1].sourceStoryIds, []);
assert.deepEqual(saved.content!.positions[0].bullets.map(b => b.text), content.positions[0].bullets.map(b => b.text));
assert.deepEqual(listPositions(), profile, 'Matching must not modify work history');
assert.throws(() => saveStoryMatches(1, payload), /changed/);
const cleared = saveStoryMatches(1, { expectedContent: JSON.stringify(saved.content), matches: [{ ...matches[0], positionId: null, bullets: matches[0].bullets.map(b => ({ ...b, storyIds: [] })) }] });
assert.equal(cleared.content!.positions[0].positionId, -1);
assert.deepEqual(cleared.content!.positions[0].bullets[0].sourceStoryIds, []);

// Upload must finish matching before exposing a ready version and its checks.
const { attachApplicationResume } = await import('../src/resume/applicationResume.ts');
const { DEFAULT_DATE_FORMAT } = await import('../src/resume/dates.ts');
const texts = ['Lead at Example', ...content.positions[0].bullets.map(b => b.text)];
const blocks = texts.map((text, index) => ({ index, type: 'p', text, style: null, list: index > 0, align: null, bold: false, spacer: false }));
const analysis = {
  sections: [{ key: 'work', kind: 'experience', headingBlock: null }], dates: DEFAULT_DATE_FORMAT, notes: [],
  blocks: texts.map((text, i) => i === 0 ? { i, role: 'position_heading', section: 'work', pattern: '{title} at {organization}', fields: [{ name: 'title', value: 'Lead' }, { name: 'organization', value: 'Example' }] } :
    { i, role: 'position_bullet', section: 'work', pattern: '{text}', fields: [{ name: 'text', value: text }] }),
};
db.prepare("INSERT INTO resume_import(id,filename,file_path,blocks,analysis,status,created_at) VALUES(2,'new.docx','unused',?,?,'ready',1)").run(JSON.stringify(blocks), JSON.stringify(analysis));
db.prepare("INSERT INTO job_analysis(application_id,status,data,updated_at) VALUES(1,'ready',?,1)").run(JSON.stringify({ keywords: [] }));
let calls = 0;
runner.run = (async () => {
  calls++;
  await new Promise(resolve => setTimeout(resolve, 10));
  return { runId: 2, output: { matches } };
}) as typeof runner.run;
const [upload, retry] = await Promise.all([attachApplicationResume(1, 2), attachApplicationResume(1, 2)]);
assert.equal(calls, 1, 'Navigation retries must share the upload matching run');
assert.equal(upload.id, retry.id);
assert.equal(upload.content!.positions[0].positionId, role);
assert.deepEqual(upload.content!.positions[0].bullets[0].sourceStoryIds, [story.id, second.id]);
assert.deepEqual(upload.checks!.warnings.filter(w => w.bullet === 0 && (w.kind === 'source' || w.kind === 'number')), [], 'Supported claims must not warn when upload finishes');
assert.ok(upload.checks!.warnings.some(w => w.bullet === 1 && w.kind === 'source'), 'Unsupported bullets must still warn');
assert.equal((await attachApplicationResume(1, 2)).id, upload.id);
assert.equal(calls, 1, 'Already completed uploads must not rematch');
assert.deepEqual(listPositions(), profile);
console.log('Story matching tests passed');
