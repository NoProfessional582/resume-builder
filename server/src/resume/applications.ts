import { changeStage, lifecycle } from './workspace.ts';
import { z } from 'zod';
import { getRun, isFinal, runner } from '../agent/runner.ts';
import { analyzeJobTask, jobAnalysisEditSchema, type JobAnalysis } from '../agent/tasks/analyzeJob.ts';
import { parseJobPostingTask } from '../agent/tasks/parseJobPosting.ts';
import { fetchPostingPage, type PageContent } from '../web/fetchPage.ts';
import { db } from '../db.ts';
import { NotFoundError } from './positions.ts';

const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const optionalUrl = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), { message: 'The posting link must start with http:// or https://' });

export const applicationInput = z.object({
  url: optionalUrl,
  company: z.string().trim().min(1, 'Company is required'),
  roleTitle: z.string().trim().min(1, 'Role title is required'),
  jobDescription: z.string().trim().min(50, 'Paste the job description (at least a few sentences)').max(100_000),
  requiredExperience: optionalText,
  preferredExperience: optionalText,
  notes: optionalText,
});
export type ApplicationInput = z.infer<typeof applicationInput>;

type AnalysisStatus = 'analyzing' | 'ready' | 'failed';

interface ApplicationRow {
  id: number;
  url: string | null;
  company: string;
  role_title: string;
  job_description: string;
  required_experience: string | null;
  preferred_experience: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface AnalysisRow {
  application_id: number;
  status: AnalysisStatus;
  run_id: number | null;
  error: string | null;
  data: string | null;
  ai_data: string | null;
  user_edited: number;
  updated_at: number;
}

export interface Application {
  id: number;
  /** Link to the original posting. */
  url: string | null;
  company: string;
  roleTitle: string;
  jobDescription: string;
  requiredExperience: string | null;
  preferredExperience: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  analysis: {
    status: AnalysisStatus;
    runId: number | null;
    error: string | null;
    data: JobAnalysis | null;
    userEdited: boolean;
    updatedAt: number;
  } | null;
}

export interface ApplicationSummary {
  id: number;
  url: string | null;
  company: string;
  roleTitle: string;
  createdAt: number;
  analysisStatus: AnalysisStatus | null;
  keywordCount: number;
  requiredCount: number;
}

class ConflictError extends Error {
  statusCode = 409;
}

function getRow(id: number): ApplicationRow {
  const row = db.prepare('SELECT * FROM application WHERE id = ?').get(id) as ApplicationRow | undefined;
  if (!row) throw new NotFoundError('Application not found');
  return row;
}

const getAnalysisRow = (id: number) =>
  db.prepare('SELECT * FROM job_analysis WHERE application_id = ?').get(id) as AnalysisRow | undefined;

/** Records a finished analysis run. */
function settle(id: number): AnalysisRow | undefined {
  const row = getAnalysisRow(id);
  if (!row || row.status !== 'analyzing' || row.run_id == null) return row;
  const run = getRun(row.run_id);
  if (!run || !isFinal(run.status)) return row;
  if (run.status === 'succeeded') {
    const json = JSON.stringify(run.output);
    db.prepare(
      `UPDATE job_analysis SET status = 'ready', error = NULL, data = ?, ai_data = ?, user_edited = 0, updated_at = ?
       WHERE application_id = ?`,
    ).run(json, json, Date.now(), id);
  } else {
    db.prepare(`UPDATE job_analysis SET status = 'failed', error = ?, updated_at = ? WHERE application_id = ?`).run(
      run.error ?? `Analysis ${run.status}`,
      Date.now(),
      id,
    );
  }
  return getAnalysisRow(id);
}

export function getApplication(id: number): Application {
  const a = getRow(id);
  const analysis = settle(id);
  return {
    id: a.id,
    url: a.url,
    company: a.company,
    roleTitle: a.role_title,
    jobDescription: a.job_description,
    requiredExperience: a.required_experience,
    preferredExperience: a.preferred_experience,
    notes: a.notes,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    analysis: analysis
      ? {
          status: analysis.status,
          runId: analysis.status === 'analyzing' ? analysis.run_id : null,
          error: analysis.error,
          data: analysis.data ? JSON.parse(analysis.data) : null,
          userEdited: !!analysis.user_edited,
          updatedAt: analysis.updated_at,
        }
      : null,
  };
}

export function listApplications(): ApplicationSummary[] {
  const rows = db.prepare('SELECT id FROM application ORDER BY created_at DESC, id DESC').all() as { id: number }[];
  return rows.map(({ id }) => {
    const a = getApplication(id);
    const keywords = a.analysis?.data?.keywords ?? [];
    return {
      ...lifecycle(a.id),
      notes: a.notes,
      id: a.id,
      url: a.url,
      company: a.company,
      roleTitle: a.roleTitle,
      createdAt: a.createdAt,
      analysisStatus: a.analysis?.status ?? null,
      keywordCount: keywords.length,
      requiredCount: keywords.filter((k) => k.importance === 'required').length,
    };
  });
}

export interface ParsedPosting {
  /** Form-ready fields; the user reviews them before saving. */
  fields: ApplicationInput;
  /** Anything the agent noticed (e.g. the description looks cut off). */
  problem: string | null;
  source: PageContent['source'];
  runId: number;
}

/** Downloads a posting page and has the agent pull out the application fields. */
export async function parseJobPostingUrl(url: string): Promise<ParsedPosting> {
  const page = await fetchPostingPage(url);
  const { runId, output } = await runner.run(parseJobPostingTask, { url: page.url, pageText: page.text });
  if (!output.found) {
    throw Object.assign(new Error(output.problem ?? "That page doesn't seem to contain a job posting."), {
      statusCode: 422,
    });
  }
  const clean = (s: string | null) => (s?.trim() ? s.trim() : null);
  return {
    fields: {
      url: page.url,
      company: output.company.trim(),
      roleTitle: output.roleTitle.trim(),
      jobDescription: output.jobDescription.trim(),
      requiredExperience: clean(output.requiredExperience),
      preferredExperience: clean(output.preferredExperience),
      notes: output.details.length ? output.details.map((d) => d.trim()).filter(Boolean).join('\n') : null,
    },
    problem: output.problem,
    source: page.source,
    runId,
  };
}

/** Starts (or restarts) the analysis. Replaces any previous analysis, including user edits. */
export function analyze(id: number): Application {
  const a = getRow(id);
  const current = settle(id);
  if (current?.status === 'analyzing') throw new ConflictError('The analysis is already running.');
  const runId = runner.enqueue(analyzeJobTask, {
    company: a.company,
    roleTitle: a.role_title,
    jobDescription: a.job_description,
    requiredExperience: a.required_experience,
    preferredExperience: a.preferred_experience,
    notes: a.notes,
  });
  db.prepare(
    `INSERT INTO job_analysis (application_id, status, run_id, updated_at) VALUES (?, 'analyzing', ?, ?)
     ON CONFLICT(application_id) DO UPDATE SET status = 'analyzing', run_id = excluded.run_id, error = NULL,
       updated_at = excluded.updated_at`,
  ).run(id, runId, Date.now());
  void runner.waitFor(runId).then(() => settle(id));
  return getApplication(id);
}

export function createApplication(input: ApplicationInput): Application {
  const now = Date.now();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO application (url, company, role_title, job_description, required_experience, preferred_experience, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.url,
      input.company,
      input.roleTitle,
      input.jobDescription,
      input.requiredExperience,
      input.preferredExperience,
      input.notes,
      now,
      now,
    );
  changeStage(Number(lastInsertRowid), {stage:'interested', effectiveDate: new Date().toLocaleDateString('en-CA')});
  return analyze(Number(lastInsertRowid));
}

/** Updates the posting details. The analysis is not re-run automatically. */
export function updateApplication(id: number, input: ApplicationInput): Application {
  getRow(id);
  db.prepare(
    `UPDATE application SET url = ?, company = ?, role_title = ?, job_description = ?, required_experience = ?,
       preferred_experience = ?, notes = ?, updated_at = ? WHERE id = ?`,
  ).run(
    input.url,
    input.company,
    input.roleTitle,
    input.jobDescription,
    input.requiredExperience,
    input.preferredExperience,
    input.notes,
    Date.now(),
    id,
  );
  return getApplication(id);
}

export function deleteApplication(id: number): void {
  getRow(id);
  const analysis = settle(id);
  if (analysis?.status === 'analyzing' && analysis.run_id != null) runner.cancel(analysis.run_id);
  db.prepare('DELETE FROM application WHERE id = ?').run(id);
}

function requireReadyAnalysis(id: number): AnalysisRow {
  getRow(id);
  const row = settle(id);
  if (!row || row.status !== 'ready') throw new ConflictError('There is no finished analysis to change.');
  return row;
}

/** Saves the user's edited analysis. */
export function saveAnalysis(id: number, raw: unknown): Application {
  requireReadyAnalysis(id);
  const parsed = jobAnalysisEditSchema.safeParse(raw);
  if (!parsed.success) {
    throw Object.assign(new Error(parsed.error.issues.map((i) => i.message).join('; ')), { statusCode: 400 });
  }
  db.prepare('UPDATE job_analysis SET data = ?, user_edited = 1, updated_at = ? WHERE application_id = ?').run(
    JSON.stringify(parsed.data),
    Date.now(),
    id,
  );
  return getApplication(id);
}

/** Throws away the user's edits and goes back to the agent's analysis. */
export function resetAnalysis(id: number): Application {
  requireReadyAnalysis(id);
  db.prepare('UPDATE job_analysis SET data = ai_data, user_edited = 0, updated_at = ? WHERE application_id = ?').run(
    Date.now(),
    id,
  );
  return getApplication(id);
}
