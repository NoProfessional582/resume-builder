import { z } from 'zod';
import { db, transaction } from '../db.ts';
import { requireApplication } from './workspace.ts';
import { NotFoundError } from './positions.ts';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, 'Invalid date');
const instant = z.string().datetime({ offset: true });
export const eventInput = z.object({
 title: z.string().trim().min(1).max(300),
 type: z.enum(['screening','interview','assessment','deadline','follow_up','response']),
 dateOnly: z.boolean(), start: z.string(), end: z.string().nullable().default(null),
 timezone: z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }, 'Choose a valid IANA timezone'),
 participants: z.array(z.number().int().positive()).max(100).default([]),
 location: z.string().trim().max(2000).default(''), notes: z.string().trim().max(10000).default(''),
 state: z.enum(['scheduled','completed','cancelled']).default('scheduled'),
}).superRefine((v,c) => {
 const schema = v.dateOnly ? date : instant;
 for (const key of ['start','end'] as const) if (v[key] !== null && !schema.safeParse(v[key]).success) c.addIssue({ code:'custom',path:[key],message: v.dateOnly ? 'Enter a valid date' : 'Enter a timestamp with UTC offset' });
 if (v.end && (v.dateOnly ? v.end < v.start : Date.parse(v.end) <= Date.parse(v.start))) c.addIssue({code:'custom',path:['end'],message:'End must follow start'});
});
export function listEvents(applicationId?: number) {
 if (applicationId) requireApplication(applicationId);
 return (db.prepare(`SELECT e.*,a.company,a.role_title,a.stage,a.offer_outcome FROM application_event e JOIN application a ON a.id=e.application_id ${applicationId ? 'WHERE e.application_id=?' : ''} ORDER BY e.start,e.id`).all(...(applicationId ? [applicationId] : []))).map(e => ({...e, dateOnly: Boolean(e.date_only), participants: db.prepare('SELECT c.id,c.name FROM event_participant p JOIN contact c ON c.id=p.contact_id WHERE p.event_id=? ORDER BY c.name').all(e.id!), history: db.prepare('SELECT * FROM event_history WHERE event_id=? ORDER BY recorded_at DESC,id DESC').all(e.id!)}));
}
export function saveEvent(applicationId: number, raw: unknown, eventId?: number) {
 requireApplication(applicationId);
 const v = eventInput.parse(raw);
 return transaction(() => {
  if (eventId && !db.prepare('SELECT id FROM application_event WHERE id=? AND application_id=?').get(eventId,applicationId)) throw new NotFoundError('Event not found');
  for (const contactId of v.participants) {
   const linked = db.prepare('SELECT 1 FROM application_contact WHERE application_id=? AND contact_id=?').get(applicationId,contactId);
   const retained = eventId && db.prepare('SELECT 1 FROM event_participant WHERE event_id=? AND contact_id=?').get(eventId,contactId);
   if (!linked && !retained) throw Object.assign(new Error('New participants must be linked to this application'),{statusCode:400});
  }
  const start = v.dateOnly ? v.start : new Date(v.start).toISOString();
  const end = v.end ? (v.dateOnly ? v.end : new Date(v.end).toISOString()) : null;
  const values = [v.title,v.type,Number(v.dateOnly),start,end,v.timezone,v.location,v.notes,v.state,Date.now()];
  const id = eventId ?? Number(db.prepare('INSERT INTO application_event(title,type,date_only,start,end,timezone,location,notes,state,updated_at,application_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(...values,applicationId).lastInsertRowid);
  if (eventId) db.prepare('UPDATE application_event SET title=?,type=?,date_only=?,start=?,end=?,timezone=?,location=?,notes=?,state=?,updated_at=? WHERE id=?').run(...values,id);
  db.prepare('DELETE FROM event_participant WHERE event_id=?').run(id);
  for (const contactId of new Set(v.participants)) db.prepare('INSERT INTO event_participant VALUES(?,?)').run(id,contactId);
  db.prepare('INSERT INTO event_history(event_id,recorded_at,summary) VALUES(?,?,?)').run(id,Date.now(),`${eventId ? 'Updated' : 'Created'}: ${v.title} · ${v.state} · ${start}${end ? ' → '+end : ''} · ${v.timezone}`);
  return {id};
 });
}
