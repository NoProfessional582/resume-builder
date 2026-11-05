import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

process.env.RB_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'resume-role-selection-'));
const { db, migrate } = await import('../src/db.ts');
const { runner } = await import('../src/agent/runner.ts');
const { createPosition, listPositions } = await import('../src/resume/positions.ts');
const { startTailoring } = await import('../src/resume/tailoring.ts');
migrate();
const input = { organization: 'Example', location: null, description: null, start: null, end: null };
const keep = createPosition({ ...input, title: 'Current role' });
const omit = createPosition({ ...input, title: 'Early role' });
db.prepare('INSERT INTO application(id,company,role_title,job_description,created_at,updated_at) VALUES(1,?,?,?,1,1)').run('Example', 'Lead', 'Posting');
db.prepare("INSERT INTO job_analysis(application_id,status,data,updated_at) VALUES(1,'ready',?,1)").run(JSON.stringify({ roleSummary: '', seniority: '', roleTypes: [], keywords: [], keyExperiences: [], responsibilities: [], notes: [] }));
let expectedIds = [keep, omit];
runner.enqueue = (_task, raw) => {
  const input = raw as { profile: { positions: { id: number }[] } };
  assert.deepEqual(input.profile.positions.map(p => p.id), expectedIds);
  // Even if the agent returns an excluded role, the assembled draft must omit it.
  const output = { summary: '', skillGroups: [], positions: [keep, omit].map(positionId => ({ positionId, description: null, bullets: [] })), educationIndexes: [], certificationIndexes: [], entrySections: [], gaps: [], notes: '' };
  return Number(db.prepare("INSERT INTO agent_runs(task,status,output,created_at) VALUES('tailor_resume','succeeded',?,1)").run(JSON.stringify(output)).lastInsertRowid);
};
async function draft(settings: unknown) {
  const version = startTailoring(1, settings);
  for (let i = 0; i < 100; i++) {
    const row = db.prepare('SELECT status,settings,content FROM tailored_resume WHERE id=?').get(version.id)!;
    if (row.status !== 'tailoring') return { settings: JSON.parse(row.settings as string), content: JSON.parse(row.content as string) };
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Draft did not settle');
}
const original = await draft({ autoFit: false });
assert.deepEqual(original.content.positions.map((p: {positionId:number}) => p.positionId), [keep, omit]);
expectedIds = [keep];
const selected = await draft({ autoFit: false, excludedPositionIds: [omit] });
assert.deepEqual(selected.settings.excludedPositionIds, [omit]);
assert.deepEqual(selected.content.positions.map((p: {positionId:number}) => p.positionId), [keep]);
assert.deepEqual(listPositions().map(p => p.id), [keep, omit]);
assert.equal(original.content.positions.length, 2);
console.log('Role selection preserves work history and excludes unchecked roles from new drafts.');
