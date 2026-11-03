import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from '../config.ts';

const SCRIPT = resolve(config.repoRoot, 'scripts', 'word-export.ps1');
const TIMEOUT_MS = 120_000;

let queue: Promise<unknown> = Promise.resolve();

/** Converts a .docx to PDF with Microsoft Word. One conversion at a time. */
export function exportPdf(docxPath: string, pdfPath: string): Promise<{ pages: number }> {
  const job = queue.then(() => runExport(docxPath, pdfPath));
  queue = job.catch(() => {});
  return job;
}

function runExport(docxPath: string, pdfPath: string): Promise<{ pages: number }> {
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
