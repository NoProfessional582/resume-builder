import { z } from 'zod';
import { db, transaction } from '../db.ts';
import { NotFoundError } from './positions.ts';

export const stages = ['interested', 'applied', 'screened', 'interviewing', 'offer', 'closed'] as const;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Enter a valid date');
export const stageInput = z
  .object({
    stage: z.enum(stages),
    effectiveDate: date,
    offerOutcome: z.enum(['pending', 'accepted', 'declined']).nullable().optional(),
    closureReason: z
      .enum(['employer_rejection', 'withdrawal', 'declined_offer', 'closed_posting', 'other'])
      .nullable()
      .optional(),
    note: z.string().trim().max(5000).default(''),
  })
  .superRefine((v, c) => {
    if (v.stage === 'closed' && !v.closureReason)
      c.addIssue({
        code: 'custom',
        message: 'Choose a closure reason',
        path: ['closureReason'],
      });
    if (v.stage === 'offer' && !v.offerOutcome)
      c.addIssue({
        code: 'custom',
        message: 'Choose an offer outcome',
        path: ['offerOutcome'],
      });
  });
export function requireApplication(id: number) {
  if (!db.prepare('SELECT id FROM application WHERE id=?').get(id)) throw new NotFoundError('Application not found');
}
export function lifecycle(id: number) {
  requireApplication(id);
  return db
    .prepare(
      `SELECT stage, offer_outcome AS offerOutcome, closure_reason AS closureReason,
 (SELECT MAX(d) FROM (SELECT effective_date AS d FROM application_stage_history WHERE application_id=? UNION ALL SELECT effective_date FROM application_activity WHERE application_id=? AND voided=0 AND kind!='note')) AS lastActivityDate
 FROM application WHERE id=?`,
    )
    .get(id, id, id);
}
export function changeStage(id: number, raw: unknown) {
  const v = stageInput.parse(raw);
  requireApplication(id);
  const declined = v.stage === 'offer' && v.offerOutcome === 'declined';
  const stage = declined ? 'closed' : v.stage;
  const outcome = v.stage === 'offer' ? v.offerOutcome! : null;
  const reason = declined ? 'declined_offer' : stage === 'closed' ? v.closureReason! : null;
  transaction(() => {
    db.prepare('UPDATE application SET stage=?,offer_outcome=?,closure_reason=? WHERE id=?').run(
      stage,
      outcome,
      reason,
      id,
    );
    db.prepare(
      'INSERT INTO application_stage_history(application_id,stage,offer_outcome,closure_reason,note,effective_date,recorded_at) VALUES(?,?,?,?,?,?,?)',
    ).run(id, stage, outcome, reason, v.note, v.effectiveDate, Date.now());
  });
  return workspace(id);
}
export const activityInput = z.object({
  kind: z.enum(['note', 'inbound', 'outbound', 'follow_up']),
  text: z.string().trim().min(1).max(10000),
  effectiveDate: date,
  replacesId: z.number().int().positive().optional(),
});
export function addActivity(id: number, raw: unknown) {
  requireApplication(id);
  const v = activityInput.parse(raw);
  transaction(() => {
    if (v.replacesId) {
      const r = db
        .prepare('UPDATE application_activity SET voided=1 WHERE id=? AND application_id=? AND voided=0')
        .run(v.replacesId, id);
      if (!r.changes) throw new NotFoundError('Activity already corrected or removed');
    }
    db.prepare(
      'INSERT INTO application_activity(application_id,kind,text,effective_date,recorded_at,replaces_id) VALUES(?,?,?,?,?,?)',
    ).run(id, v.kind, v.text, v.effectiveDate, Date.now(), v.replacesId ?? null);
  });
  return workspace(id);
}
export const contactInput = z.object({
  name: z.string().trim().min(1),
  organization: z.string().trim().default(''),
  title: z.string().trim().default(''),
  email: z.union([z.literal(''), z.string().email()]).default(''),
  phone: z.string().trim().default(''),
  profileUrl: z
    .union([
      z.literal(''),
      z
        .string()
        .url()
        .regex(/^https?:\/\//),
    ])
    .default(''),
  notes: z.string().trim().default(''),
});
export function contacts() {
  return db
    .prepare(
      'SELECT id,name,organization,title,email,phone,profile_url AS profileUrl,notes,(SELECT COUNT(*) FROM application_contact WHERE contact_id=contact.id) AS linkCount FROM contact ORDER BY name,id',
    )
    .all();
}
export function saveContact(raw: unknown, id?: number) {
  const v = contactInput.parse(raw);
  const values = [v.name, v.organization, v.title, v.email, v.phone, v.profileUrl, v.notes];
  if (id) {
    if (
      !db
        .prepare('UPDATE contact SET name=?,organization=?,title=?,email=?,phone=?,profile_url=?,notes=? WHERE id=?')
        .run(...values, id).changes
    )
      throw new NotFoundError('Contact not found');
    return id;
  }
  return Number(
    db
      .prepare('INSERT INTO contact(name,organization,title,email,phone,profile_url,notes) VALUES(?,?,?,?,?,?,?)')
      .run(...values).lastInsertRowid,
  );
}
export function workspace(id: number) {
  return {
    ...lifecycle(id),
    history: db
      .prepare(
        'SELECT * FROM application_stage_history WHERE application_id=? ORDER BY effective_date DESC,recorded_at DESC,id DESC',
      )
      .all(id),
    activities: db
      .prepare(
        'SELECT * FROM application_activity WHERE application_id=? ORDER BY effective_date DESC,recorded_at DESC,id DESC',
      )
      .all(id),
    contacts: db
      .prepare(
        'SELECT c.*, c.profile_url AS profileUrl,l.role FROM contact c JOIN application_contact l ON c.id=l.contact_id WHERE l.application_id=? ORDER BY c.name,c.id',
      )
      .all(id),
  };
}
