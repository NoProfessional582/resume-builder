import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import { ZodError } from 'zod';

// This test always owns an isolated database; never run migrations on the user's data.
process.env.RB_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'resume-workspace-test-'));
const { db, migrate } = await import('../src/db.ts');
const dir = resolve(import.meta.dirname, '../migrations');
db.exec('CREATE TABLE _migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)');
for (const name of readdirSync(dir)
  .filter((n) => n.endsWith('.sql') && n < '010')
  .sort()) {
  db.exec(readFileSync(resolve(dir, name), 'utf8'));
  db.prepare('INSERT INTO _migrations VALUES(?,0)').run(name);
}
db.exec(`INSERT INTO application(id,company,role_title,job_description,created_at,updated_at) VALUES(1,'Acme','Engineer','Legacy posting',1,1),(2,'Beta','Manager','Other posting',2,2);
 INSERT INTO job_analysis(application_id,status,data,updated_at) VALUES(1,'ready','{"keywords":[]}',1);
 INSERT INTO tailored_resume(application_id,status,settings,content,created_at) VALUES(1,'ready','{}','{"summary":"Saved resume"}',1);
 INSERT INTO position(id,organization,title,sort_order,created_at,updated_at) VALUES(1,'Acme','Engineer',0,1,1);
 INSERT INTO story(position_id,current_text,sort_order,created_at,updated_at) VALUES(1,'Preserve my story',0,1,1);`);
const preserved = ['job_analysis', 'tailored_resume', 'story'].map((t) => db.prepare(`SELECT * FROM ${t}`).all());
migrate();
migrate();
assert.deepEqual(
  ['job_analysis', 'tailored_resume', 'story'].map((t) => db.prepare(`SELECT * FROM ${t}`).all()),
  preserved,
);
const { workspace, changeStage, addActivity } = await import('../src/resume/workspace.ts');
assert.equal(workspace(1).stage, null);
assert.deepEqual(workspace(1).history, []);
assert.equal(workspace(1).lastActivityDate, null);
assert.throws(() => changeStage(1, { stage: 'closed', effectiveDate: '2026-11-01' }));
assert.throws(() => changeStage(1, { stage: 'applied', effectiveDate: '2026-02-30' }));
changeStage(1, { stage: 'interviewing', effectiveDate: '2026-10-01' });
changeStage(1, { stage: 'applied', effectiveDate: '2026-09-01' });
assert.equal(workspace(1).stage, 'applied');
assert.equal(workspace(1).lastActivityDate, '2026-10-01');
changeStage(1, {
  stage: 'offer',
  offerOutcome: 'accepted',
  effectiveDate: '2026-10-02',
});
assert.equal(workspace(1).offerOutcome, 'accepted');
changeStage(1, {
  stage: 'offer',
  offerOutcome: 'declined',
  effectiveDate: '2026-10-03',
});
assert.equal(workspace(1).stage, 'closed');
assert.equal(workspace(1).closureReason, 'declined_offer');
changeStage(1, { stage: 'interviewing', effectiveDate: '2026-10-04' });
assert.equal(workspace(1).closureReason, null);
assert.equal(workspace(1).offerOutcome, null);
addActivity(1, {
  kind: 'note',
  text: 'Edited notes',
  effectiveDate: '2026-11-02',
});
assert.equal(workspace(1).lastActivityDate, '2026-10-04');
addActivity(1, {
  kind: 'inbound',
  text: 'Recruiter called',
  effectiveDate: '2026-11-01',
});
const inbound = workspace(1).activities.find((a) => a.text === 'Recruiter called') as { id: number };
addActivity(1, {
  kind: 'inbound',
  text: 'Correct date',
  effectiveDate: '2026-10-05',
  replacesId: inbound.id,
});
assert.equal(workspace(1).lastActivityDate, '2026-10-05');
assert.throws(() =>
  addActivity(2, {
    kind: 'inbound',
    text: 'Wrong application',
    effectiveDate: '2026-11-01',
    replacesId: inbound.id,
  }),
);
const app = Fastify();
app.setErrorHandler((err, _req, reply) =>
  reply
    .code(err instanceof ZodError ? 400 : ((err as { statusCode?: number }).statusCode ?? 500))
    .send({ error: (err as Error).message }),
);
const { workspaceRoutes } = await import('../src/routes/workspace.ts');
await app.register(workspaceRoutes);
async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  return app.inject({ method, url, payload });
}
const person = (await call('POST', '/contacts', { name: 'Alex' })).json();
assert.equal(
  (
    await call('PUT', `/applications/1/contacts/${person.id}`, {
      role: 'recruiter',
    })
  ).statusCode,
  200,
);
await call('PUT', `/applications/2/contacts/${person.id}`, {
  role: 'referral',
});
await call('DELETE', `/applications/1/contacts/${person.id}`);
assert.equal(workspace(2).contacts.length, 1);
assert.equal((await call('DELETE', `/contacts/${person.id}`, {})).statusCode, 400);
await call('PUT', `/applications/1/contacts/${person.id}`, {
  role: 'interviewer',
});
const second = (await call('POST', '/contacts', { name: 'Sam' })).json();
await call('PUT', `/applications/1/contacts/${second.id}`, { role: 'manager' });
assert.equal(workspace(1).contacts.length, 2);
await call('PUT', `/contacts/${person.id}`, {
  name: 'Alex Updated',
  organization: 'Acme',
});
assert.equal(workspace(2).contacts[0].name, 'Alex Updated');
db.prepare('DELETE FROM application WHERE id=1').run();
assert.equal(workspace(2).contacts.length, 1);
assert.equal((await call('GET', '/contacts')).json().length, 2);
await call('DELETE', `/contacts/${person.id}`, { confirm: true });
assert.equal(workspace(2).contacts.length, 0);
const { defaults, filterApplications } = await import('../../web/src/workspace.ts');
await call('PUT', '/workspace-preferences', {
  ...defaults,
  view: 'board',
  search: 'hello',
});
assert.equal((await call('GET', '/workspace-preferences')).json().search, 'hello');
const base = {
  url: null,
  company: 'Acme',
  roleTitle: 'Engineer',
  notes: 'Hello',
  createdAt: 0,
  analysisStatus: null,
  keywordCount: 0,
  requiredCount: 0,
  stage: 'applied',
  offerOutcome: null,
  closureReason: null,
};
const rows = [
  { ...base, id: 3, lastActivityDate: null },
  { ...base, id: 2, lastActivityDate: '2026-10-01' },
  { ...base, id: 1, lastActivityDate: '2026-10-01' },
];
for (const ascending of [true, false])
  assert.deepEqual(
    filterApplications(rows, { ...defaults, ascending }).map((a) => a.id),
    [1, 2, 3],
  );
assert.equal(
  filterApplications(rows, {
    ...defaults,
    search: 'HELLO',
    companies: ['Acme'],
  }).length,
  3,
);
assert.equal(
  filterApplications(rows, {
    ...defaults,
    search: 'HELLO',
    companies: ['Beta'],
  }).length,
  0,
);
assert.equal(filterApplications(rows, { ...defaults, visible: ['offer'] }).length, 0);
await app.close();
db.close();
const { DatabaseSync } = await import('node:sqlite');
const reopened = new DatabaseSync(resolve(process.env.RB_DATA_DIR, 'app.db'));
assert.equal(reopened.prepare('SELECT stage FROM application WHERE id=2').get()!.stage, null);
assert.match(String(reopened.prepare('SELECT data FROM workspace_preferences').get()!.data), /hello/);
reopened.close();
console.log('Phase 1 integration checks passed (isolated database).');
