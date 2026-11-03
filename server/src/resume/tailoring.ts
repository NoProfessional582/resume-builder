import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { runner } from '../agent/runner.ts';
import type { JobAnalysis } from '../agent/tasks/analyzeJob.ts';
import { reviseResumeTask, type ReviseInput, type ReviseOutput } from '../agent/tasks/reviseResume.ts';
import { tailorResumeTask, type TailorInput, type TailorOutput } from '../agent/tasks/tailorResume.ts';
import type { TaskDef } from '../agent/task.ts';
import { config } from '../config.ts';
import { db } from '../db.ts';
import { exportPdf, overflowLines, type PageLayout } from '../word/word.ts';
import { getApplication } from './applications.ts';
import { runChecks, type Checks } from './checks.ts';
import { normalizeHeading } from './content.ts';
import { DEFAULT_DATE_FORMAT, formatDateRange } from './dates.ts';
import { listPositions, NotFoundError } from './positions.ts';
import { loadProfileContent } from './profile.ts';
import {
  tailorSettingsSchema,
  tailoredContentSchema,
  toResumeContent,
  type TailoredContent,
  type TailorSettings,
} from './tailored.ts';
import { getActiveTemplate, renderWithActiveTemplate } from './template.ts';

class ConflictError extends Error {
  statusCode = 409;
}

type Status = 'tailoring' | 'ready' | 'failed';
type JobKind = 'tailor' | 'revise' | 'fit';

/** How many trimming rounds the fit loop tries before giving up. */
const MAX_FIT_ROUNDS = 3;

interface Row {
  id: number;
  application_id: number;
  status: Status;
  run_id: number | null;
  error: string | null;
  settings: string;
  content: string | null;
  ai_content: string | null;
  user_edited: number;
  content_updated_at: number | null;
  docx_path: string | null;
  pdf_path: string | null;
  page_count: number | null;
  generated_at: number | null;
  created_at: number;
  parent_id: number | null;
  label: string | null;
  job_kind: JobKind;
  job_instruction: string | null;
  progress: string | null;
  fit_note: string | null;
}

export interface TailoredView {
  id: number;
  applicationId: number;
  version: number;
  label: string | null;
  status: Status;
  runId: number | null;
  progress: string | null;
  error: string | null;
  settings: TailorSettings;
  content: TailoredContent | null;
  userEdited: boolean;
  checks: Checks | null;
  /** Story text by id, so the preview can show each bullet's sources. */
  stories: Record<number, { positionId: number; text: string }>;
  generated: { pages: number | null; at: number; stale: boolean } | null;
  fitNote: string | null;
  createdAt: number;
}

export interface TailoredSummary {
  id: number;
  version: number;
  label: string | null;
  status: Status;
  createdAt: number;
  generatedAt: number | null;
  pages: number | null;
}

function getRow(id: number): Row {
  const row = db.prepare('SELECT * FROM tailored_resume WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new NotFoundError('Tailored résumé not found');
  return row;
}

function versionOf(row: Row): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM tailored_resume WHERE application_id = ? AND id <= ?').get(row.application_id, row.id) as {
      n: number;
    }
  ).n;
}

/** Stored settings, with defaults for fields added since they were saved. */
function readSettings(row: Row): TailorSettings {
  const parsed = tailorSettingsSchema.safeParse(JSON.parse(row.settings));
  return parsed.success ? parsed.data : tailorSettingsSchema.parse({});
}

function update(id: number, fields: Partial<Record<keyof Row, unknown>>): void {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  db.prepare(`UPDATE tailored_resume SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
    ...keys.map((k) => fields[k as keyof Row] as never),
    id,
  );
}

function requireAnalysis(applicationId: number): JobAnalysis {
  const app = getApplication(applicationId);
  if (app.analysis?.status !== 'ready' || !app.analysis.data) {
    throw new ConflictError('Finish the job analysis before tailoring.');
  }
  return app.analysis.data;
}

const cleanBullets = (bullets: ReviseOutput['positions'][number]['bullets']) =>
  bullets
    .map((b) => ({ text: b.text.trim(), sourceStoryIds: [...new Set(b.sourceStoryIds)], keywords: b.keywords }))
    .filter((b) => b.text);

const cleanSkills = (groups: ReviseOutput['skillGroups']) =>
  groups
    .map((g) => ({ category: g.category?.trim() || null, items: g.items.map((s) => s.trim()).filter(Boolean) }))
    .filter((g) => g.items.length);

/** Turns the tailoring agent's answer into full résumé content, using the profile for facts. */
function buildContent(out: TailorOutput, settings: TailorSettings): TailoredContent {
  const profile = loadProfileContent();
  const byId = new Map(out.positions.map((p) => [p.positionId, p]));
  const pick = <T>(items: T[], indexes: number[]) =>
    [...new Set(indexes)].filter((i) => i >= 0 && i < items.length).map((i) => items[i]);

  return {
    summary: out.summary.trim() ? [out.summary.trim()] : profile.summary,
    skills: cleanSkills(out.skillGroups),
    // Every position stays (no unexplained gaps); titles, employers and dates come from the profile.
    positions: listPositions().map((p) => {
      const t = byId.get(p.id);
      return {
        positionId: p.id,
        organization: p.organization,
        title: p.title,
        location: p.location,
        start: p.start,
        end: p.end,
        description: settings.includeDescriptions ? t?.description?.trim() || p.description : null,
        bullets: cleanBullets(t?.bullets ?? []),
      };
    }),
    education: pick(profile.education, out.educationIndexes),
    certifications: pick(profile.certifications, out.certificationIndexes),
    entries: profile.entries
      .map((e) => {
        const chosen = out.entrySections.find((s) => normalizeHeading(s.heading) === normalizeHeading(e.heading));
        return { heading: e.heading, items: chosen ? pick(e.items, chosen.itemIndexes) : e.items };
      })
      .filter((e) => e.items.length),
    gaps: out.gaps,
    notes: out.notes,
  };
}

/** Applies a revision to existing content. Positions' facts and the other sections stay as they were. */
function applyRevision(current: TailoredContent, out: ReviseOutput, settings: TailorSettings): TailoredContent {
  const byId = new Map(out.positions.map((p) => [p.positionId, p]));
  return {
    ...current,
    summary: out.summary.trim() ? [out.summary.trim()] : current.summary,
    skills: cleanSkills(out.skillGroups).length ? cleanSkills(out.skillGroups) : current.skills,
    positions: current.positions.map((p) => {
      const r = byId.get(p.positionId);
      if (!r) return p;
      return {
        ...p,
        description: settings.includeDescriptions ? r.description?.trim() || null : null,
        bullets: cleanBullets(r.bullets),
      };
    }),
    gaps: out.gaps,
    notes: out.notes,
  };
}

function storiesMap(): Map<number, { positionId: number; text: string }> {
  return new Map(listPositions().flatMap((p) => p.stories.map((s) => [s.id, { positionId: p.id, text: s.text }] as const)));
}

export function getTailored(id: number): TailoredView {
  const row = getRow(id);
  const settings = readSettings(row);
  const content = row.content ? (JSON.parse(row.content) as TailoredContent) : null;
  const stories = storiesMap();
  let checks: Checks | null = null;
  if (content) {
    const analysis = getApplication(row.application_id).analysis?.data;
    if (analysis) {
      const descriptions = new Map(listPositions().map((p) => [p.id, p.description]));
      checks = runChecks(content, analysis, settings, stories, descriptions);
    }
  }
  return {
    id: row.id,
    applicationId: row.application_id,
    version: versionOf(row),
    label: row.label,
    status: row.status,
    runId: row.status === 'tailoring' ? row.run_id : null,
    progress: row.status === 'tailoring' ? row.progress : null,
    error: row.error,
    settings,
    content,
    userEdited: !!row.user_edited,
    checks,
    stories: Object.fromEntries(stories),
    generated: row.generated_at
      ? { pages: row.page_count, at: row.generated_at, stale: (row.content_updated_at ?? 0) > row.generated_at }
      : null,
    fitNote: row.fit_note,
    createdAt: row.created_at,
  };
}

export function listTailored(applicationId: number): TailoredSummary[] {
  const rows = db
    .prepare('SELECT * FROM tailored_resume WHERE application_id = ? ORDER BY id')
    .all(applicationId) as unknown as Row[];
  return rows
    .map((r, i) => ({
      id: r.id,
      version: i + 1,
      label: r.label,
      status: r.status,
      createdAt: r.created_at,
      generatedAt: r.generated_at,
      pages: r.page_count,
    }))
    .reverse();
}

// --------------------------------------------------------------------- Jobs

function tailorInput(applicationId: number, settings: TailorSettings): TailorInput {
  const app = getApplication(applicationId);
  const analysis = requireAnalysis(applicationId);
  const profile = loadProfileContent();
  const positions = listPositions();
  if (!positions.length) throw new ConflictError('Add your work history before tailoring.');
  return {
    job: { company: app.company, roleTitle: app.roleTitle, analysis },
    profile: {
      summary: profile.summary,
      skills: profile.skills,
      positions: positions.map((p) => ({
        id: p.id,
        title: p.title,
        organization: p.organization,
        location: p.location,
        dates: formatDateRange(p.start, p.end, getActiveTemplate()?.layout.dates ?? DEFAULT_DATE_FORMAT),
        description: p.description,
        // Lessons learned stay out: they're for interviews, never printed.
        stories: p.stories.map((s) => ({ id: s.id, text: s.text })),
      })),
      education: profile.education,
      certifications: profile.certifications,
      entries: profile.entries,
    },
    settings,
    skillCount: Math.max(6, profile.skills.reduce((n, g) => n + g.items.length, 0)),
  };
}

function reviseInput(
  applicationId: number,
  content: TailoredContent,
  settings: TailorSettings,
  mode: ReviseInput['mode'],
  instruction: string,
): ReviseInput {
  const app = getApplication(applicationId);
  const positions = listPositions();
  return {
    mode,
    instruction,
    job: { company: app.company, roleTitle: app.roleTitle, analysis: requireAnalysis(applicationId) },
    content,
    stories: Object.fromEntries(positions.map((p) => [p.id, p.stories.map((s) => ({ id: s.id, text: s.text }))])),
    positionDescriptions: Object.fromEntries(positions.map((p) => [p.id, p.description])),
    settings,
  };
}

/** Runs one agent task for a version, recording the run so the UI can follow it. */
async function runAgent<I, O>(id: number, task: TaskDef<I, O>, input: I): Promise<O> {
  const runId = runner.enqueue(task, input);
  update(id, { run_id: runId });
  const run = await runner.waitFor(runId);
  if (run.status !== 'succeeded') throw new Error(run.error ?? `The agent run ${run.status}.`);
  return run.output as O;
}

function saveAgentContent(id: number, content: TailoredContent): void {
  const json = JSON.stringify(content);
  update(id, { content: json, ai_content: json, user_edited: 0, content_updated_at: Date.now() });
}

/** Renders the .docx, converts it with Word, and records the files and page count. */
async function buildFiles(id: number, content: TailoredContent): Promise<PageLayout | null> {
  const row = getRow(id);
  const docx = renderWithActiveTemplate(toResumeContent(content));
  const dir = resolve(config.dataDir, 'applications', String(row.application_id));
  mkdirSync(dir, { recursive: true });
  const docxPath = resolve(dir, `tailored-${id}.docx`);
  const pdfPath = resolve(dir, `tailored-${id}.pdf`);
  writeFileSync(docxPath, docx);
  let layout: PageLayout | null = null;
  try {
    layout = await exportPdf(docxPath, pdfPath);
  } catch (err) {
    console.warn(`[tailoring] Word conversion failed for ${id}:`, (err as Error).message);
  }
  update(id, {
    docx_path: relative(config.dataDir, docxPath),
    pdf_path: layout ? relative(config.dataDir, pdfPath) : null,
    page_count: layout?.pages ?? null,
    generated_at: Date.now(),
  });
  return layout;
}

/**
 * Builds the file and, while it runs past the page target, asks the agent to trim by the measured
 * overflow and rebuilds. Records how it went in fit_note.
 */
async function fitToTarget(id: number, start: TailoredContent, settings: TailorSettings): Promise<void> {
  const target = settings.targetPages;
  let content = start;
  for (let round = 0; ; round++) {
    update(id, { progress: round === 0 ? 'Building the Word file and measuring its length…' : `Round ${round}: rebuilding and measuring…` });
    const layout = await buildFiles(id, content);
    if (!layout) {
      update(id, { fit_note: "Couldn't measure the length: the Word conversion failed. Check that Microsoft Word works on this PC." });
      return;
    }
    if (layout.pages <= target) {
      update(id, { fit_note: round ? `Fitted to ${target} page${target === 1 ? '' : 's'} in ${round} trimming round${round === 1 ? '' : 's'}.` : null });
      return;
    }
    if (round >= MAX_FIT_ROUNDS) {
      update(id, {
        fit_note: `Still ${layout.pages} pages after ${MAX_FIT_ROUNDS} trimming rounds. Remove a few bullets by hand, or allow fewer bullets per position.`,
      });
      return;
    }
    // Ask for a bit more than the measured overflow: trims tend to come in short.
    const lines = Math.ceil(overflowLines(layout, target) * 1.15);
    update(id, {
      progress: `Round ${round + 1}: ${layout.pages} pages; trimming about ${lines} line${lines === 1 ? '' : 's'} to fit ${target}…`,
    });
    const instruction =
      `The résumé currently runs to ${layout.pages} pages and must fit on ${target} page${target === 1 ? '' : 's'}. ` +
      `Cut about ${lines + 2} lines of printed text (Word lines; a full-width line holds roughly 15 words, a bullet line a little less).`;
    const out = await runAgent(id, reviseResumeTask, reviseInput(getRow(id).application_id, content, settings, 'trim', instruction));
    content = applyRevision(content, out, settings);
    saveAgentContent(id, content);
  }
}

/** Runs a version's job in the background: write or revise, then build and (optionally) fit. */
async function runJob(id: number): Promise<void> {
  const row = getRow(id);
  const settings = readSettings(row);
  try {
    let content: TailoredContent;
    if (row.job_kind === 'tailor') {
      update(id, { progress: 'Writing your tailored résumé…' });
      const out = await runAgent(id, tailorResumeTask, tailorInput(row.application_id, settings));
      content = buildContent(out, settings);
    } else {
      const parent = row.parent_id ? getRow(row.parent_id) : null;
      if (!parent?.content) throw new Error('The version this was based on is gone.');
      const source = JSON.parse(parent.content) as TailoredContent;
      if (row.job_kind === 'revise') {
        update(id, { progress: 'Revising…' });
        const out = await runAgent(id, reviseResumeTask, reviseInput(row.application_id, source, settings, 'revise', row.job_instruction ?? ''));
        content = applyRevision(source, out, settings);
      } else {
        content = source;
      }
    }
    saveAgentContent(id, content);
    if (row.job_kind === 'fit' || settings.autoFit) await fitToTarget(id, content, settings);
    else {
      update(id, { progress: 'Building the Word file…' });
      await buildFiles(id, content);
    }
    update(id, { status: 'ready', error: null, progress: null });
  } catch (err) {
    update(id, { status: 'failed', error: (err as Error).message, progress: null });
  }
}

/** Marks jobs left running by a previous server process as failed (they can be retried). */
export function recoverTailoringJobs(): void {
  db.prepare(
    `UPDATE tailored_resume SET status = 'failed', progress = NULL,
       error = 'Interrupted: the server restarted before this finished. Try again.' WHERE status = 'tailoring'`,
  ).run();
}

function assertIdle(applicationId: number): void {
  const busy = db
    .prepare(`SELECT id FROM tailored_resume WHERE application_id = ? AND status = 'tailoring'`)
    .get(applicationId);
  if (busy) throw new ConflictError('A tailoring job for this job is already running.');
}

function createVersion(
  applicationId: number,
  settings: TailorSettings,
  kind: JobKind,
  extra: { parentId?: number; label?: string; instruction?: string } = {},
): TailoredView {
  assertIdle(applicationId);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO tailored_resume (application_id, status, settings, job_kind, parent_id, label, job_instruction, created_at)
       VALUES (?, 'tailoring', ?, ?, ?, ?, ?, ?)`,
    )
    .run(applicationId, JSON.stringify(settings), kind, extra.parentId ?? null, extra.label ?? null, extra.instruction ?? null, Date.now());
  const id = Number(lastInsertRowid);
  void runJob(id);
  return getTailored(id);
}

/** Starts a new tailoring run (a new version) for an application. */
export function startTailoring(applicationId: number, rawSettings: unknown): TailoredView {
  const settings = tailorSettingsSchema.parse(rawSettings ?? {});
  tailorInput(applicationId, settings); // fail fast if the analysis or work history is missing
  return createVersion(applicationId, settings, 'tailor');
}

function requireReady(id: number): Row {
  const row = getRow(id);
  if (row.status !== 'ready' || !row.content) throw new ConflictError('This version has no content yet.');
  return row;
}

const shorten = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** New version: this one revised per the user's request. */
export function reviseTailored(id: number, instruction: string): TailoredView {
  const row = requireReady(id);
  return createVersion(row.application_id, readSettings(row), 'revise', {
    parentId: id,
    label: `Revised from v${versionOf(row)}: “${shorten(instruction)}”`,
    instruction,
  });
}

/** New version: this one trimmed to fit (optionally a different page target). */
export function fitTailored(id: number, targetPages?: number): TailoredView {
  const row = requireReady(id);
  const settings = { ...readSettings(row), ...(targetPages ? { targetPages } : {}) };
  if (row.page_count != null && row.page_count <= settings.targetPages && (row.content_updated_at ?? 0) <= (row.generated_at ?? 0)) {
    throw new ConflictError(`This version already fits on ${settings.targetPages} page${settings.targetPages === 1 ? '' : 's'}.`);
  }
  return createVersion(row.application_id, settings, 'fit', {
    parentId: id,
    label: `Fitted from v${versionOf(row)} to ${settings.targetPages} page${settings.targetPages === 1 ? '' : 's'}`,
  });
}

export function retryTailoring(id: number): TailoredView {
  const row = getRow(id);
  if (row.status !== 'failed') throw new ConflictError('Only a failed run can be retried.');
  assertIdle(row.application_id);
  update(id, { status: 'tailoring', error: null, fit_note: null });
  void runJob(id);
  return getTailored(id);
}

export function saveTailoredContent(id: number, raw: unknown): TailoredView {
  requireReady(id);
  const parsed = tailoredContentSchema.safeParse(raw);
  if (!parsed.success) {
    throw Object.assign(new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')), {
      statusCode: 400,
    });
  }
  update(id, { content: JSON.stringify(parsed.data), user_edited: 1, content_updated_at: Date.now() });
  return getTailored(id);
}

export function resetTailoredContent(id: number): TailoredView {
  requireReady(id);
  db.prepare('UPDATE tailored_resume SET content = ai_content, user_edited = 0, content_updated_at = ? WHERE id = ?').run(
    Date.now(),
    id,
  );
  return getTailored(id);
}

/** Rebuilds the .docx from the current content (no trimming). */
export async function generateDocx(id: number): Promise<TailoredView> {
  const row = requireReady(id);
  await buildFiles(id, JSON.parse(row.content!));
  return getTailored(id);
}

/** Path and download name of a generated file. */
export function tailoredFile(id: number, kind: 'docx' | 'pdf'): { path: string; downloadName: string } {
  const row = getRow(id);
  const rel = kind === 'docx' ? row.docx_path : row.pdf_path;
  if (!rel) throw new NotFoundError('Not generated yet');
  const app = getApplication(row.application_id);
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const version = versionOf(row);
  return {
    path: resolve(config.dataDir, rel),
    downloadName: `Resume - ${safe(app.company)} - ${safe(app.roleTitle)}${version > 1 ? ` (v${version})` : ''}.${kind}`,
  };
}

export function deleteTailored(id: number): void {
  const row = getRow(id);
  if (row.status === 'tailoring' && row.run_id != null) runner.cancel(row.run_id);
  db.prepare('DELETE FROM tailored_resume WHERE id = ?').run(id);
}
