import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

process.env.RB_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'application-resume-'));
const { db, migrate } = await import('../src/db.ts');
const { attachApplicationResume } = await import('../src/resume/applicationResume.ts');
const { DEFAULT_DATE_FORMAT } = await import('../src/resume/dates.ts');
migrate();
db.prepare('INSERT INTO application(id,company,role_title,job_description,created_at,updated_at) VALUES(1,?,?,?,1,1)').run('Example', 'Lead', 'Posting');
const text = 'Delivered customer training and improved adoption.';
const blocks = [{ index: 0, type: 'p', text, style: null, list: false, align: null, bold: false, spacer: false }];
const analysis = {
  sections: [{ key: 'summary', kind: 'summary', headingBlock: null }],
  blocks: [{ i: 0, role: 'summary_text', section: 'summary', pattern: '{text}', fields: [{ name: 'text', value: text }] }],
  dates: DEFAULT_DATE_FORMAT, notes: [],
};
db.prepare(`INSERT INTO resume_import(id,filename,file_path,blocks,analysis,status,created_at) VALUES(1,'submitted.docx','unused',?,?,'ready',1)`).run(JSON.stringify(blocks), JSON.stringify(analysis));
const profileBefore = db.prepare('SELECT * FROM position').all();
const templatesBefore = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%template%'").all().map(row => ({ name: row.name, rows: db.prepare(`SELECT * FROM ${row.name}`).all() }));
const first = attachApplicationResume(1, 1);
assert.equal(first.status, 'ready');
assert.deepEqual(first.content?.summary, [text]);
assert.match(first.label!, /submitted.docx/);
assert.equal(first.version, 1);
assert.equal(attachApplicationResume(1, 1).version, 2);
assert.deepEqual(db.prepare('SELECT * FROM position').all(), profileBefore);
for (const table of templatesBefore) assert.deepEqual(db.prepare(`SELECT * FROM ${table.name}`).all(), table.rows);
db.prepare("UPDATE resume_import SET status='analyzing',analysis=NULL WHERE id=1").run();
assert.throws(() => attachApplicationResume(1, 1), /finish parsing/);
assert.throws(() => attachApplicationResume(999, 1), /Application not found/);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tailored_resume').get()!.n, 2);
console.log('Application résumé import tests passed');
