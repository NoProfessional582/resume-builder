import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
process.env.RB_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'resume-gap-test-'));
const { db, migrate } = await import('../src/db.ts');
const { runner } = await import('../src/agent/runner.ts');
const { createPosition, createStory, listPositions } = await import('../src/resume/positions.ts');
const { startOrResume, acceptDraft } = await import('../src/resume/refine.ts');
const { refineStoryTask } = await import('../src/agent/tasks/refineStory.ts');
migrate();
db.prepare("INSERT INTO agent_runs (id, task, status, created_at) VALUES (999, 'refine_story', 'running', 1)").run();
let input: any;
// Capture an agent request without calling the live CLI.
runner.enqueue = ((_task: unknown, value: unknown) => { input = value; return 999; }) as typeof runner.enqueue;
runner.waitFor = (() => new Promise(() => {})) as typeof runner.waitFor;
const position = createPosition({ title: 'Engineer', organization: 'Acme', location: null, description: null, start: null, end: null });
const story = createStory(position, 'I improved the deployment process.');
const context = 'Qualification: Lead cross-team projects\nReview finding: Scope is unclear';
const session = startOrResume(story.id, context);
assert.equal(input.qualificationContext, context);
assert.equal(input.currentDraft, story.text);
assert.match(refineStoryTask.buildPrompt(input), /Never invent experience/);
assert.equal(startOrResume(story.id, context).id, session.id);
assert.throws(() => startOrResume(story.id, 'A different qualification'), /Finish the existing/);
assert.equal(db.prepare('SELECT qualification_context FROM refine_session WHERE id = ?').get(session.id)?.qualification_context, context);
db.prepare('UPDATE refine_session SET current_run_id = NULL WHERE id = ?').run(session.id);
acceptDraft(session.id, 'I coordinated deployment improvements with two teams.', null);
assert.equal(listPositions()[0].stories[0].text, 'I coordinated deployment improvements with two teams.');
assert.equal(listPositions()[0].stories[0].versionCount, 2);
const focusedStory = createStory(position, 'I coordinated a project.');
const focused = startOrResume(focusedStory.id, 'Story development focus: Leadership and project scope');
assert.equal(focused.focus, 'Story development focus: Leadership and project scope');
assert.equal(input.qualificationContext, focused.focus);
assert.equal(startOrResume(focusedStory.id).id, focused.id);
assert.equal(startOrResume(focusedStory.id).focus, focused.focus);
const generalStory = createStory(position, 'I improved team reporting.');
const general = startOrResume(generalStory.id);
assert.equal(general.focus, null);
assert.equal(input.qualificationContext, undefined);
console.log('Qualification and work history conversations: persistence, focus, resume, conflicts and acceptance passed.');

// Exercise the HTTP boundary used by the work history panel.
const { default: Fastify } = await import('fastify');
const { ZodError } = await import('zod');
const { refineRoutes } = await import('../src/routes/refine.ts');
const app = Fastify();
app.setErrorHandler((error, _request, reply) => {
  reply.code(error instanceof ZodError ? 400 : 500).send({ error: error.message });
});
await app.register(refineRoutes);
for (const payload of [undefined, {}, { focus: 'Leadership and scope' }]) {
  const routeStory = createStory(position, 'I led a process improvement.');
  const response = await app.inject({ method: 'POST', url: `/stories/${routeStory.id}/refine`, ...(payload === undefined ? {} : { payload }) });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().focus, payload && 'focus' in payload ? 'Story development focus: Leadership and scope' : null);
}
for (const payload of [{ versionId: 1 }, { focus: '' }, { gapIndex: 0 }]) {
  const response = await app.inject({ method: 'POST', url: `/stories/${generalStory.id}/refine`, payload });
  assert.equal(response.statusCode, 400, response.body);
}
await app.close();
console.log('Story expansion routes accept general and focused requests and reject incomplete context.');

