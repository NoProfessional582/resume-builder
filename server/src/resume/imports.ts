import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { getRun, runner } from '../agent/runner.ts';
import { importResumeTask } from '../agent/tasks/importResume.ts';
import { config } from '../config.ts';
import { db, transaction } from '../db.ts';
import { parseBlocks, type BlockInfo } from '../docx/blocks.ts';
import {
  buildLayout,
  extractContent,
  resolveBlocks,
  type BlockOverrides,
  type LayoutIssue,
  type ResolvedBlock,
  type ResumeAnalysis,
  type TemplateLayout,
} from '../docx/layout.ts';
import { renderResume } from '../docx/render.ts';
import type { Role } from '../docx/roles.ts';
import { exportPdf } from '../word/word.ts';
import type { ResumeContent } from './content.ts';
import { profileCounts, replaceProfile, type ProfileCounts } from './profile.ts';
import { diffLines, documentLines, type TextDiff } from './textDiff.ts';

type ImportStatus = 'analyzing' | 'ready' | 'failed' | 'saved';

interface ImportRow {
  id: number;
  filename: string;
  file_path: string;
  blocks: string;
  run_id: number | null;
  analysis: string | null;
  overrides: string;
  status: ImportStatus;
  error: string | null;
  created_at: number;
}

export interface ImportView {
  id: number;
  filename: string;
  status: ImportStatus;
  error: string | null;
  runId: number | null;
  createdAt: number;
  blocks: BlockInfo[];
  resolved: ResolvedBlock[] | null;
  layout: TemplateLayout | null;
  content: ResumeContent | null;
  issues: LayoutIssue[];
  notes: string[];
  profile: ProfileCounts;
}

export class NotFoundError extends Error {
  statusCode = 404;
}
export class ConflictError extends Error {
  statusCode = 409;
}

const importDir = (id: number) => resolve(config.dataDir, 'imports', String(id));
const absolute = (relPath: string) => resolve(config.dataDir, relPath);

function getRow(id: number): ImportRow {
  const row = db.prepare('SELECT * FROM resume_import WHERE id = ?').get(id) as ImportRow | undefined;
  if (!row) throw new NotFoundError('Import not found');
  return row;
}

/** Saves the upload, parses it and queues the analysis. */
export function createImport(filename: string, buffer: Buffer): { id: number; runId: number } {
  const blocks = parseBlocks(buffer); // throws on files that aren't .docx
  if (!blocks.some((b) => !b.spacer)) throw Object.assign(new Error('The document looks empty.'), { statusCode: 400 });

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO resume_import (filename, file_path, blocks, status, created_at) VALUES (?, '', ?, 'analyzing', ?)`,
    )
    .run(basename(filename), JSON.stringify(blocks), Date.now());
  const id = Number(lastInsertRowid);

  const dir = importDir(id);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, 'original.docx');
  writeFileSync(file, buffer);

  const runId = runner.enqueue(importResumeTask, { blocks });
  db.prepare('UPDATE resume_import SET file_path = ?, run_id = ? WHERE id = ?').run(relative(config.dataDir, file), runId, id);
  void runner.waitFor(runId).then(() => refreshStatus(getRow(id)));
  return { id, runId };
}

/** Picks up the analysis once its run has finished. */
function refreshStatus(row: ImportRow): ImportRow {
  if (row.status !== 'analyzing' || row.run_id == null) return row;
  const run = getRun(row.run_id);
  if (!run) return row;
  if (run.status === 'succeeded') {
    db.prepare(`UPDATE resume_import SET analysis = ?, status = 'ready', error = NULL WHERE id = ?`).run(
      JSON.stringify(run.output),
      row.id,
    );
  } else if (run.status === 'failed' || run.status === 'cancelled') {
    db.prepare(`UPDATE resume_import SET status = 'failed', error = ? WHERE id = ?`).run(
      run.error ?? `Analysis ${run.status}`,
      row.id,
    );
  }
  return getRow(row.id);
}

interface Computed {
  blocks: BlockInfo[];
  analysis: ResumeAnalysis;
  resolved: ResolvedBlock[];
  layout: TemplateLayout;
  content: ResumeContent;
  issues: LayoutIssue[];
}

function compute(row: ImportRow): Computed | null {
  if (!row.analysis) return null;
  const blocks = JSON.parse(row.blocks) as BlockInfo[];
  const analysis = JSON.parse(row.analysis) as ResumeAnalysis;
  const overrides = JSON.parse(row.overrides) as BlockOverrides;
  const resolved = resolveBlocks(blocks, analysis, overrides);
  const layout = buildLayout(blocks, resolved, analysis);
  const { content, issues } = extractContent(blocks, resolved, layout);
  return { blocks, analysis, resolved, layout, content, issues };
}

export function getImportView(id: number): ImportView {
  const row = refreshStatus(getRow(id));
  const computed = compute(row);
  return {
    id: row.id,
    filename: row.filename,
    status: row.status,
    error: row.error,
    runId: row.run_id,
    createdAt: row.created_at,
    blocks: JSON.parse(row.blocks),
    resolved: computed?.resolved ?? null,
    layout: computed?.layout ?? null,
    content: computed?.content ?? null,
    issues: computed?.issues ?? [],
    notes: computed?.analysis.notes ?? [],
    profile: profileCounts(),
  };
}

export function setBlockOverride(id: number, index: number, change: { role?: Role; pattern?: string | null }): ImportView {
  const row = getRow(id);
  if (row.status !== 'ready') throw new ConflictError('This import can no longer be changed.');
  const overrides = JSON.parse(row.overrides) as BlockOverrides;
  overrides[String(index)] = { ...overrides[String(index)], ...change };
  db.prepare('UPDATE resume_import SET overrides = ? WHERE id = ?').run(JSON.stringify(overrides), id);
  return getImportView(id);
}

export interface PreviewResult {
  originalPages: number;
  renderedPages: number;
  diff: TextDiff;
}

/** Rebuilds the resume from the imported content and converts both versions to PDF. */
export async function buildPreview(id: number): Promise<PreviewResult> {
  const row = refreshStatus(getRow(id));
  const computed = compute(row);
  if (!computed) throw new ConflictError('The analysis has not finished yet.');

  const dir = importDir(id);
  const originalDocx = absolute(row.file_path);
  const original = readFileSync(originalDocx);
  const rendered = renderResume(original, computed.layout, computed.content);
  const renderedDocx = resolve(dir, 'rendered.docx');
  writeFileSync(renderedDocx, rendered);

  const originalPdf = resolve(dir, 'original.pdf');
  const pagesFile = resolve(dir, 'original-pages.json');
  let originalPages: number;
  if (existsSync(originalPdf) && existsSync(pagesFile)) {
    originalPages = JSON.parse(readFileSync(pagesFile, 'utf8')).pages;
  } else {
    originalPages = (await exportPdf(originalDocx, originalPdf)).pages;
    writeFileSync(pagesFile, JSON.stringify({ pages: originalPages }));
  }
  const renderedPages = (await exportPdf(renderedDocx, resolve(dir, 'rendered.pdf'))).pages;

  return { originalPages, renderedPages, diff: diffLines(documentLines(original), documentLines(rendered)) };
}

const PREVIEW_FILES: Record<string, string> = {
  'original.pdf': 'application/pdf',
  'rendered.pdf': 'application/pdf',
  'rendered.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function importFile(id: number, name: string): { path: string; type: string } {
  getRow(id);
  const type = PREVIEW_FILES[name];
  const path = resolve(importDir(id), name);
  if (!type || !existsSync(path)) throw new NotFoundError('File not found');
  return { path, type };
}

/** Makes this import the active template and (optionally) replaces the profile content. */
export function saveImport(id: number, replaceContent: boolean): { templateId: number } {
  const row = refreshStatus(getRow(id));
  if (row.status !== 'ready') throw new ConflictError('Only a finished, unsaved import can be saved.');
  const computed = compute(row)!;
  const blocking = computed.resolved.filter((b) => b.status === 'mismatch');
  if (blocking.length) {
    throw new ConflictError(`Fix the ${blocking.length} paragraph(s) marked in the Layout tab first.`);
  }

  return transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO resume_template (import_id, filename, file_path, layout, is_active, created_at) VALUES (?, ?, '', ?, 1, ?)`,
      )
      .run(id, row.filename, JSON.stringify(computed.layout), Date.now());
    const templateId = Number(lastInsertRowid);

    const dir = resolve(config.dataDir, 'templates', String(templateId));
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, 'template.docx');
    copyFileSync(absolute(row.file_path), file);

    db.prepare('UPDATE resume_template SET is_active = 0 WHERE id != ?').run(templateId);
    db.prepare('UPDATE resume_template SET file_path = ? WHERE id = ?').run(relative(config.dataDir, file), templateId);
    db.prepare(`UPDATE resume_import SET status = 'saved' WHERE id = ?`).run(id);
    if (replaceContent) replaceProfile(computed.content, computed.layout);
    return { templateId };
  });
}
