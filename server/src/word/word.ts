import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from '../config.ts';

const SCRIPT = resolve(config.repoRoot, 'scripts', 'word-export.ps1');
const TIMEOUT_MS = 120_000;

let queue: Promise<unknown> = Promise.resolve();

export interface PageLayout {
  pages: number;
  /** Word's line count (spacer paragraphs count as lines). */
  lines: number;
  /** How far down the last page the text ends: 0 = top margin, 1 = bottom margin. */
  lastPageFill: number | null;
}

/** Converts a .docx to PDF with Microsoft Word and measures its length. One conversion at a time. */
export function exportPdf(docxPath: string, pdfPath: string): Promise<PageLayout> {
  const job = queue.then(() => runExport(docxPath, pdfPath));
  queue = job.catch(() => {});
  return job;
}

/** Roughly how many lines must go for the document to fit on `targetPages` (0 if it already fits). */
export function overflowLines(layout: PageLayout, targetPages: number): number {
  if (layout.pages <= targetPages) return 0;
  const fill = layout.lastPageFill ?? 0.5;
  const linesPerPage = layout.lines / Math.max(1, layout.pages - 1 + fill);
  return Math.ceil((layout.pages - targetPages - 1 + fill) * linesPerPage);
}

function runExport(docxPath: string, pdfPath: string): Promise<PageLayout> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-InputPath', docxPath, '-PdfPath', pdfPath],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not start PowerShell: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = stdout.trim().split(/\r?\n/).at(-1) ?? '';
      try {
        if (code === 0) return resolvePromise(JSON.parse(line));
      } catch {
        // fall through to the error below
      }
      reject(new Error(`Word conversion failed: ${(stderr || stdout).trim().slice(0, 500) || `exit code ${code}`}`));
    });
  });
}
