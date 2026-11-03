import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from '../config.ts';
import { db } from '../db.ts';
import type { TemplateLayout } from '../docx/layout.ts';
import { renderResume } from '../docx/render.ts';
import { exportPdf } from '../word/word.ts';
import type { ResumeContent } from './content.ts';
import { loadProfileContent } from './profile.ts';

export interface ActiveTemplate {
  id: number;
  importId: number | null;
  filename: string;
  filePath: string;
  layout: TemplateLayout;
  createdAt: number;
}

export function getActiveTemplate(): ActiveTemplate | null {
  const row = db.prepare('SELECT * FROM resume_template WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() as
    | { id: number; import_id: number | null; filename: string; file_path: string; layout: string; created_at: number }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    importId: row.import_id,
    filename: row.filename,
    filePath: resolve(config.dataDir, row.file_path),
    layout: JSON.parse(row.layout),
    createdAt: row.created_at,
  };
}

/** Builds a .docx from the active template and the given content (default: the whole profile). */
export function renderWithActiveTemplate(content: ResumeContent = loadProfileContent()): Buffer {
  const template = getActiveTemplate();
  if (!template) throw Object.assign(new Error('No template yet. Upload your resume first.'), { statusCode: 409 });
  return renderResume(readFileSync(template.filePath), template.layout, content);
}

/** Renders the whole profile with the active template, saves .docx and .pdf, returns the page count. */
export async function previewProfile(): Promise<{ pages: number; docxPath: string; pdfPath: string }> {
  const template = getActiveTemplate()!;
  const docx = renderWithActiveTemplate();
  const docxPath = resolve(dirname(template.filePath), 'profile-preview.docx');
  const pdfPath = resolve(dirname(template.filePath), 'profile-preview.pdf');
  mkdirSync(dirname(docxPath), { recursive: true });
  writeFileSync(docxPath, docx);
  const { pages } = await exportPdf(docxPath, pdfPath);
  return { pages, docxPath, pdfPath };
}
