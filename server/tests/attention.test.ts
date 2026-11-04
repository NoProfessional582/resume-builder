import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import Fastify from 'fastify';
import { ZodError } from 'zod';

process.env.RB_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'resume-attention-test-'));
const { db, migrate } = await import('../src/db.ts');
const { config } = await import('../src/config.ts');
const { attentionList, attentionAction, saveAttentionSettings, dateInZone } = await import('../src/resume/attention.ts');
const { changeStage, addActivity } = await import('../src/resume/workspace.ts');
const { saveEvent } = await import('../src/resume/events.ts');
migrate();
const settings = {timezone:'America/Los_Angeles',applied:7,screened:7,interviewing:7,offer:3};
saveAttentionSettings(settings);
const at = (value: string) => Date.parse(value);
const now = at('2026-11-03T20:00:00Z');
const make = (id: number, stage?: string, date = '2026-10-27') => {
  db.prepare('INSERT INTO application(id,company,role_title,job_description,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'Company '+id,'Role '+id,'Posting',1,1);
  if (stage) changeStage(id,{stage,effectiveDate:date,offerOutcome:'pending',closureReason:'withdrawal'});
};
const forApp = (id: number, clock = now) => attentionList(clock).items.filter(i => i.applicationId === id);
const visible = (id: number, clock = now) => forApp(id,clock).filter(i => !i.suppression);
const event = (id: number, type: string, start: string, dateOnly = true) => ({title:'Commitment '+id,type,start,dateOnly,timezone:settings.timezone});

make(1,'applied');
// Calendar-day threshold includes the DST fallback; it is not a fixed 168-hour timer.
assert.equal(visible(1,at('2026-11-03T07:59:59Z')).length,0);
assert.equal(visible(1,at('2026-11-03T08:00:00Z')).length,1);
assert.equal(visible(1,at('2026-11-04T08:00:00Z')).length,1);
assert.equal(visible(1)[0].dueDate,'2026-11-03');
assert.equal(dateInZone(at('2026-03-08T08:00:00Z'),settings.timezone),'2026-03-08');
const originalKey = visible(1)[0].key;
db.prepare('UPDATE application SET updated_at=?,notes=? WHERE id=1').run(now,'Posting edit');
addActivity(1,{kind:'note',text:'Ordinary note',effectiveDate:'2026-11-03'});
assert.equal(visible(1)[0].key,originalKey);
attentionAction(1,{action:'dismiss',key:originalKey},now);
for (let i = 0; i < 3; i++) assert.equal(visible(1).length,0);
assert.equal(forApp(1)[0].suppression,'dismissed');
// Reopen the SQLite file and re-import the module: reads never recreate alerts.
const reopened = new DatabaseSync(config.dbFile);
assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM attention_dismissal').get()?.n,1);
reopened.close();
const reloaded = await import('../src/resume/attention.ts?restart');
assert.equal(reloaded.attentionList(now).items.filter(i => i.applicationId===1 && !i.suppression).length,0);
addActivity(1,{kind:'follow_up',text:'Sent follow-up',effectiveDate:'2026-11-03'});
assert.equal(visible(1).length,0);
assert.equal(visible(1,at('2026-11-10T08:00:00Z')).length,1);
assert.notEqual(visible(1,at('2026-11-10T08:00:00Z'))[0].key,originalKey);

make(2,'interviewing');
let item = visible(2)[0];
attentionAction(2,{action:'snooze',key:item.key,until:'2026-11-06'},now);
assert.equal(visible(2).length,0);
assert.equal(forApp(2)[0].snoozeUntil,'2026-11-06');
assert.equal(visible(2,at('2026-11-06T07:59:59Z')).length,0);
assert.equal(visible(2,at('2026-11-06T08:00:00Z')).length,1);
// Backdated communication starts a new cycle even if still stale.
addActivity(2,{kind:'inbound',text:'Backdated call',effectiveDate:'2026-10-26'});
assert.equal(visible(2).length,1);
assert.throws(() => attentionAction(2,{action:'dismiss',key:item.key},now),/changed/);
item = visible(2)[0];
assert.throws(() => attentionAction(2,{action:'snooze',key:item.key,until:'2026-11-03'},now),/future/);
assert.throws(() => attentionAction(2,{action:'snooze',key:item.key,until:'2026-02-30'},now));
attentionAction(2,{action:'dismiss',key:item.key},now);
changeStage(2,{stage:'screened',effectiveDate:'2026-10-25'});
assert.equal(visible(2).length,1);

make(3,'applied');
const response = saveEvent(3,event(3,'response','2026-11-04'));
assert.equal(visible(3).length,0);
const meeting = saveEvent(3,event(3,'interview','2026-11-10'));
assert.equal(visible(3,at('2026-11-04T08:00:00Z'))[0].kind,'explicit');
saveEvent(3,{...event(3,'response','2026-11-02'),notes:'Due yesterday'},response.id);
assert.equal(visible(3).length,1);
item = visible(3)[0];
attentionAction(3,{action:'dismiss',key:item.key},now);
saveEvent(3,{...event(3,'response','2026-11-02'),notes:'Updated note'},response.id);
assert.equal(visible(3).length,0);
saveEvent(3,event(3,'response','2026-11-03'),response.id);
assert.equal(visible(3).length,1);
saveEvent(3,{...event(3,'response','2026-11-03'),state:'cancelled'},response.id);
assert.equal(visible(3).length,0); // Future interview suppresses generic inactivity.
saveEvent(3,{...event(3,'interview','2026-11-10'),state:'cancelled'},meeting.id);
assert.equal(visible(3)[0].kind,'inactivity');
saveEvent(3,event(3,'interview','2026-11-01'),meeting.id);
assert.equal(visible(3)[0].kind,'inactivity'); // Past uncompleted meeting cannot suppress forever.
const timed = saveEvent(3,event(3,'follow_up','2026-11-03T13:00:00-08:00',false));
assert.equal(visible(3).length,0);
assert.equal(visible(3,at('2026-11-03T21:00:00Z'))[0].kind,'explicit');

make(4); // Unset legacy stage.
make(5,'closed');
make(6,'offer');
changeStage(6,{stage:'offer',offerOutcome:'accepted',effectiveDate:'2026-10-27'});
for (const id of [4,5,6]) {saveEvent(id,event(id,'deadline','2026-11-01')); assert.equal(forApp(id).length,0);}
make(7,'interested');
assert.equal(visible(7).length,0);
saveEvent(7,event(7,'follow_up','2026-11-03'));
assert.equal(visible(7)[0].kind,'explicit');
make(8);
db.prepare("UPDATE application SET stage='applied' WHERE id=8").run();
assert.equal(visible(8)[0].kind,'missing_date');
addActivity(8,{kind:'outbound',text:'Known submission',effectiveDate:'2026-11-03'});
assert.equal(visible(8).length,0);
make(9,'offer','2026-10-31');
assert.equal(visible(9)[0].dueDate,'2026-11-03');
saveAttentionSettings({...settings,offer:4});
assert.equal(visible(9).length,0);
assert.throws(() => saveAttentionSettings({...settings,offer:0}));
assert.throws(() => saveAttentionSettings({...settings,timezone:'Bad/Zone'}));
saveAttentionSettings(settings);
attentionAction(1,{action:'restore'},now);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attention_dismissal WHERE application_id=1').get()?.n,0);
// Correcting or removing communication resets the cycle and removes its date influence.
const activity = db.prepare('SELECT id FROM application_activity WHERE application_id=1 AND kind=?').get('follow_up')!;
db.prepare('UPDATE application_activity SET voided=1 WHERE id=?').run(activity.id!);
assert.equal(visible(1).length,1);
assert.notEqual(visible(1)[0].key,originalKey);

const { attentionRoutes } = await import('../src/routes/attention.ts');
const api = Fastify();
api.setErrorHandler((error,_req,reply) => reply.code(error instanceof ZodError ? 400 : (error as {statusCode?:number}).statusCode ?? 500).send({error:(error as Error).message}));
await api.register(attentionRoutes,{prefix:'/api'});
assert.equal((await api.inject({method:'GET',url:'/api/attention'})).statusCode,200);
assert.equal((await api.inject({method:'PUT',url:'/api/attention/settings',payload:{...settings,applied:-1}})).statusCode,400);
assert.equal((await api.inject({method:'POST',url:'/api/applications/1/attention',payload:{action:'dismiss',key:'stale'}})).statusCode,409);
assert.equal((await api.inject({method:'POST',url:'/api/applications/999/attention',payload:{action:'restore'}})).statusCode,404);
await api.close();
db.prepare('DELETE FROM application WHERE id=2').run();
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attention_dismissal WHERE application_id=2').get()?.n,0);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attention_snooze WHERE application_id=2').get()?.n,0);
db.close();
console.log('Phase 2B passed: clock boundaries, precedence, cycles, persistence, API validation and deletion.');
