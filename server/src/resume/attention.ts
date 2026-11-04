import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.ts';
import { requireApplication } from './workspace.ts';

const timezone = z.string().refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
}, 'Enter a valid IANA timezone');
const days = z.number().int().min(1).max(365);
export const attentionSettingsInput = z.object({ timezone, applied: days, screened: days, interviewing: days, offer: days });
export type AttentionSettings = z.infer<typeof attentionSettingsInput>;
export function attentionSettings(): AttentionSettings {
  const saved = db.prepare('SELECT timezone,applied,screened,interviewing,offer FROM attention_settings WHERE id=1').get();
  return saved as AttentionSettings | undefined ?? {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    applied: 7, screened: 7, interviewing: 7, offer: 3,
  };
}
export function saveAttentionSettings(raw: unknown) {
  const v = attentionSettingsInput.parse(raw);
  db.prepare(`INSERT INTO attention_settings VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    timezone=excluded.timezone,applied=excluded.applied,screened=excluded.screened,
    interviewing=excluded.interviewing,offer=excluded.offer`).run(v.timezone,v.applied,v.screened,v.interviewing,v.offer);
  return v;
}
export function dateInZone(now: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (name: string) => parts.find(p => p.type === name)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Application = { id: number; company: string; role_title: string; stage: string | null; offer_outcome: string | null };
type Event = { id: number; title: string; type: string; start: string; end: string | null; date_only: number; state: string };
export interface AttentionItem {
  applicationId: number; company: string; roleTitle: string; stage: string;
  key: string; cycle: string; kind: 'explicit' | 'inactivity' | 'missing_date';
  explanation: string; dueDate: string | null; eventId?: number;
  suppression: 'snoozed' | 'dismissed' | null; snoozeUntil: string | null;
}

/** No materialized alerts or read-side writes: every read reconciles against the supplied clock. */
export function attentionList(now = Date.now()) {
  const settings = attentionSettings();
  const today = dateInZone(now, settings.timezone);
  const result: AttentionItem[] = [];
  const applications = db.prepare('SELECT id,company,role_title,stage,offer_outcome FROM application ORDER BY id').all() as Application[];
  for (const a of applications) {
    if (!a.stage || a.stage === 'closed' || a.offer_outcome === 'accepted') continue;
    const history = db.prepare('SELECT id,effective_date FROM application_stage_history WHERE application_id=? ORDER BY id').all(a.id) as { id: number; effective_date: string }[];
    const activities = db.prepare("SELECT id,effective_date,voided FROM application_activity WHERE application_id=? AND kind!='note' ORDER BY id").all(a.id) as { id: number; effective_date: string; voided: number }[];
    const cycle = digest([a.id, a.stage, a.offer_outcome, history, activities]);
    const lastDate = [...history, ...activities.filter(r => !r.voided)].map(r => r.effective_date).sort().at(-1);
    const events = db.prepare("SELECT id,title,type,start,end,date_only,state FROM application_event WHERE application_id=? AND state='scheduled' ORDER BY start,id").all(a.id) as Event[];
    const snooze = db.prepare('SELECT cycle,until_date FROM attention_snooze WHERE application_id=?').get(a.id) as {cycle: string; until_date: string} | undefined;
    const add = (item: Pick<AttentionItem, 'key' | 'kind' | 'explanation' | 'dueDate' | 'eventId'>) => {
      const dismissed = !!db.prepare('SELECT 1 FROM attention_dismissal WHERE application_id=? AND reason_key=?').get(a.id,item.key);
      const snoozed = snooze?.cycle === cycle && snooze.until_date > today;
      result.push({ applicationId: a.id, company: a.company, roleTitle: a.role_title, stage: a.stage!, cycle, ...item,
        suppression: snoozed ? 'snoozed' : dismissed ? 'dismissed' : null,
        snoozeUntil: snoozed ? snooze.until_date : null });
    };
    const explicit = events.filter(e => ['follow_up','response','deadline'].includes(e.type));
    if (explicit.length) {
      for (const e of explicit) {
        const due = e.date_only ? e.start <= today : Date.parse(e.start) <= now;
        if (!due) continue;
        // Ordinary event edits and unrelated activity cannot revive the same dismissed commitment.
        const key = 'explicit:' + digest([e.id,e.type,e.start,e.date_only,history.at(-1)?.id ?? a.stage]);
        add({ key, kind: 'explicit', eventId: e.id, dueDate: e.date_only ? e.start : dateInZone(Date.parse(e.start),settings.timezone),
          explanation: `${e.title} is due ${e.date_only ? e.start : new Intl.DateTimeFormat('en', {timeZone:settings.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(e.start))}. Review this explicit next action.` });
      }
      // A future explicit date represents an agreed wait; due items stay independent of meetings.
      continue;
    }
    if (events.some(e => ['screening','interview','assessment'].includes(e.type) && (e.date_only ? e.start >= today : Date.parse(e.start) > now))) continue;
    if (a.stage === 'interested') continue;
    if (!lastDate) {
      add({key:'missing:'+cycle,kind:'missing_date',dueDate:null,explanation:'No meaningful activity date is known. Record a dated communication or correct the application stage date to calculate follow-up timing.'});
      continue;
    }
    const threshold = settings[a.stage as 'applied' | 'screened' | 'interviewing' | 'offer'];
    const dueDate = new Date(Date.parse(lastDate + 'T00:00:00Z') + threshold * 86400000).toISOString().slice(0,10);
    if (today >= dueDate) add({ key:'inactivity:'+cycle,kind:'inactivity',dueDate,
      explanation:`No meaningful activity recorded since ${lastDate}. Your ${a.stage} follow-up threshold is ${threshold} calendar days. Consider following up.` });
  }
  return { settings, today, items: result.sort((a,b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.applicationId-b.applicationId || a.key.localeCompare(b.key)) };
}
const validDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, 'Enter a valid date');
export function attentionAction(id: number, raw: unknown, now = Date.now()) {
  requireApplication(id);
  const v = z.discriminatedUnion('action', [
    z.object({action:z.literal('dismiss'),key:z.string().min(1)}),
    z.object({action:z.literal('snooze'),key:z.string().min(1),until:validDate}),
    z.object({action:z.literal('restore')}),
  ]).parse(raw);
  if (v.action === 'restore') {
    db.prepare('DELETE FROM attention_snooze WHERE application_id=?').run(id);
    db.prepare('DELETE FROM attention_dismissal WHERE application_id=?').run(id);
  } else {
    const current = attentionList(now);
    const item = current.items.find(i => i.applicationId === id && i.key === v.key);
    if (!item) throw Object.assign(new Error('This alert changed. Refresh and try again.'), {statusCode:409});
    if (v.action === 'dismiss') db.prepare('INSERT OR IGNORE INTO attention_dismissal VALUES(?,?,?)').run(id,v.key,now);
    else {
      if (v.until <= current.today) throw Object.assign(new Error('Choose a future snooze date'), {statusCode:400});
      db.prepare('INSERT INTO attention_snooze VALUES(?,?,?) ON CONFLICT(application_id) DO UPDATE SET cycle=excluded.cycle,until_date=excluded.until_date').run(id,item.cycle,v.until);
    }
  }
  return attentionList(now);
}
