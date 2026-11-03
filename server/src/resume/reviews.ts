import { runner } from '../agent/runner.ts';
import { cleanReview, reviewResumeTask, type ResumeReview } from '../agent/tasks/reviewResume.ts';
import { db } from '../db.ts';
import { fetchPostingPage } from '../web/fetchPage.ts';
import { getApplication, type Application } from './applications.ts';
import { DEFAULT_DATE_FORMAT, formatDateRange } from './dates.ts';
import { NotFoundError } from './positions.ts';
import type { TailoredContent } from './tailored.ts';
import { getActiveTemplate } from './template.ts';

class ConflictError extends Error {
  statusCode = 409;
}

type Status = 'reviewing' | 'ready' | 'failed';

interface Row {
  tailored_id: number;
  status: Status;
  run_id: number | null;
  progress: string | null;
  error: string | null;
  data: string | null;
  posting_source: 'live' | 'saved' | null;
  posting_note: string | null;
  content_updated_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ReviewView {
  tailoredId: number;
  status: Status;
  runId: number | null;
  progress: string | null;
  error: string | null;
  review: ResumeReview | null;
  postingSource: 'live' | 'saved' | null;
  postingNote: string | null;
  /** The version was edited after this review. */
  stale: boolean;
  updatedAt: number;
}

interface TailoredRow {
  id: number;
  application_id: number;
  status: string;
  content: string | null;
  content_updated_at: number | null;
}

function getTailoredRow(id: number): TailoredRow {
  const row = db
    .prepare('SELECT id, application_id, status, content, content_updated_at FROM tailored_resume WHERE id = ?')
    .get(id) as TailoredRow | undefined;
  if (!row) throw new NotFoundError('Tailored résumé not found');
  return row;
}

const getRow = (tailoredId: number) =>
  db.prepare('SELECT * FROM resume_review WHERE tailored_id = ?').get(tailoredId) as Row | undefined;

function update(tailoredId: number, fields: Partial<Record<keyof Row, unknown>>): void {
  const entries = Object.entries({ ...fields, updated_at: Date.now() });
  db.prepare(`UPDATE resume_review SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE tailored_id = ?`).run(
    ...entries.map(([, v]) => v as never),
    tailoredId,
  );
}

/** The review of a version, or null if it hasn't been scored. */
export function getReview(tailoredId: number): ReviewView | null {
  const tailored = getTailoredRow(tailoredId);
  const row = getRow(tailoredId);
  if (!row) return null;
  return {
    tailoredId,
    status: row.status,
    runId: row.status === 'reviewing' ? row.run_id : null,
    progress: row.status === 'reviewing' ? row.progress : null,
    error: row.error,
    review: row.data ? JSON.parse(row.data) : null,
    postingSource: row.posting_source,
    postingNote: row.posting_note,
    stale: row.status === 'ready' && (tailored.content_updated_at ?? 0) > (row.content_updated_at ?? 0),
    updatedAt: row.updated_at,
  };
}

/** Marks reviews left running by a previous server process as failed. */
export function recoverReviews(): void {
  db.prepare(
    `UPDATE resume_review SET status = 'failed', progress = NULL,
       error = 'Interrupted: the server restarted before this finished. Try again.' WHERE status = 'reviewing'`,
  ).run();
}

/** Starts (or restarts) scoring a version against its job posting. */
export function startReview(tailoredId: number): ReviewView {
  const tailored = getTailoredRow(tailoredId);
  if (tailored.status !== 'ready' || !tailored.content) throw new ConflictError('This version has no content to score yet.');
  if (getRow(tailoredId)?.status === 'reviewing') throw new ConflictError('This version is already being scored.');
  const now = Date.now();
  db.prepare(
    `INSERT INTO resume_review (tailored_id, status, progress, content_updated_at, created_at, updated_at)
     VALUES (?, 'reviewing', ?, ?, ?, ?)
     ON CONFLICT(tailored_id) DO UPDATE SET status = 'reviewing', run_id = NULL, progress = excluded.progress, error = NULL,
       content_updated_at = excluded.content_updated_at, updated_at = excluded.updated_at`,
  ).run(tailoredId, 'Reading the job posting…', tailored.content_updated_at, now, now);
  void runReview(tailoredId, tailored);
  return getReview(tailoredId)!;
}

async function runReview(tailoredId: number, tailored: TailoredRow): Promise<void> {
  try {
    const app = getApplication(tailored.application_id);
    const posting = await loadPosting(app);
    if (!getRow(tailoredId)) return; // the version was deleted meanwhile
    update(tailoredId, {
      posting_source: posting.source,
      posting_note: posting.note,
      progress: 'Reviewing as the recruiter and hiring manager…',
    });
    const runId = runner.enqueue(reviewResumeTask, {
      company: app.company,
      roleTitle: app.roleTitle,
      postingSource: posting.source,
      url: app.url,
      postingText: posting.text,
      resumeText: resumeText(JSON.parse(tailored.content!) as TailoredContent),
    });
    update(tailoredId, { run_id: runId });
    const run = await runner.waitFor(runId);
    if (getRow(tailoredId)?.run_id !== runId) return; // deleted or restarted meanwhile
    if (run.status !== 'succeeded') throw new Error(run.error ?? `The agent run ${run.status}.`);
    update(tailoredId, {
      status: 'ready',
      progress: null,
      error: null,
      data: JSON.stringify(cleanReview(run.output as ResumeReview)),
    });
  } catch (err) {
    if (getRow(tailoredId)) update(tailoredId, { status: 'failed', progress: null, error: (err as Error).message });
  }
}

/**
 * The posting as the reviewer reads it: downloaded fresh from its link when there is one (the
 * original, unedited posting), otherwise the copy saved with the application.
 */
async function loadPosting(app: Application): Promise<{ source: 'live' | 'saved'; text: string; note: string | null }> {
  let note: string | null = null;
  if (app.url) {
    try {
      const page = await fetchPostingPage(app.url);
      return { source: 'live', text: page.text, note: null };
    } catch (err) {
      note = `Couldn't read the posting link (${(err as Error).message}), so the saved copy was used.`;
    }
  } else {
    note = 'This application has no posting link, so the saved copy was used.';
  }
  const parts = [
    `Job description:\n${app.jobDescription}`,
    app.requiredExperience && `Required qualifications:\n${app.requiredExperience}`,
    app.preferredExperience && `Preferred qualifications:\n${app.preferredExperience}`,
    app.notes && `Other details:\n${app.notes}`,
  ];
  return { source: 'saved', text: parts.filter(Boolean).join('\n\n'), note };
}

/** The résumé in reading order as plain text (what a recruiter sees, minus the contact header). */
export function resumeText(c: TailoredContent): string {
  const dates = getActiveTemplate()?.layout.dates ?? DEFAULT_DATE_FORMAT;
  const out: string[] = [];
  if (c.summary.length) out.push('SUMMARY', ...c.summary, '');
  const skills = c.skills.flatMap((g) => (g.category ? [`${g.category}: ${g.items.join(', ')}`] : g.items));
  if (skills.length) out.push('SKILLS', skills.join(' | '), '');
  if (c.positions.length) {
    out.push('EXPERIENCE');
    for (const p of c.positions) {
      out.push(
        [p.title, p.organization, p.location, formatDateRange(p.start, p.end, dates)].filter(Boolean).join(' | '),
      );
      if (p.description) out.push(p.description);
      for (const b of p.bullets) out.push(`- ${b.text}`);
      out.push('');
    }
  }
  if (c.education.length) {
    out.push('EDUCATION');
    for (const e of c.education) out.push([e.degree, e.school, e.location, e.dates, e.details].filter(Boolean).join(' | '));
    out.push('');
  }
  if (c.certifications.length) {
    out.push('CERTIFICATIONS');
    for (const x of c.certifications) out.push([x.name, x.issuer, x.date].filter(Boolean).join(' | '));
    out.push('');
  }
  for (const e of c.entries) out.push(e.heading.toUpperCase(), ...e.items.map((i) => `- ${i}`), '');
  return out.join('\n').trim();
}

/** Stops a running review (used when its version is deleted). */
export function cancelReview(tailoredId: number): void {
  const row = getRow(tailoredId);
  if (row?.status === 'reviewing' && row.run_id != null) runner.cancel(row.run_id);
}
