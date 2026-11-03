import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import PizZip from 'pizzip';
import { STYLE_GUIDE_FILE } from './agent/styleGuide.ts';
import { config } from './config.ts';
import { db } from './db.ts';

const BACKUP_DIR = resolve(config.dataDir, 'backups');
const KEEP = 20;
const AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000;
const NAME = /^backup-\d{8}-\d{6}\.zip$/;

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: number;
}

const RESTORE_README = `Resume Builder backup

Contents:
  app.db          the database (profile, stories, applications, tailored résumés)
  templates/      your résumé template file(s)
  STYLE_GUIDE.md  your writing rules

To restore:
  1. Stop the app:        npm run service:stop
  2. In the project's data folder, delete app.db, app.db-wal and app.db-shm,
     then copy app.db from this backup in their place.
  3. Copy the templates folder from this backup into data/templates.
  4. Optional: copy STYLE_GUIDE.md over agent-workspace/STYLE_GUIDE.md.
  5. Start the app:       npm run service:start

Generated .docx/.pdf files are not included; rebuild them from the Résumé tab.
`;

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? filesUnder(full) : [full];
  });
}

const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Writes data/backups/backup-YYYYMMDD-HHMMSS.zip and keeps the newest 20. */
export function createBackup(): BackupInfo {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `backup-${stamp()}.zip`;
  const tmp = resolve(BACKUP_DIR, `.tmp-${Date.now()}.db`);
  try {
    // A consistent copy of the live database, including anything still in the WAL file.
    db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
    const zip = new PizZip();
    zip.file('app.db', readFileSync(tmp));
    const templates = resolve(config.dataDir, 'templates');
    for (const file of filesUnder(templates)) {
      zip.file(`templates/${relative(templates, file).replaceAll('\\', '/')}`, readFileSync(file));
    }
    if (existsSync(STYLE_GUIDE_FILE)) zip.file('STYLE_GUIDE.md', readFileSync(STYLE_GUIDE_FILE));
    zip.file('README.txt', RESTORE_README);
    writeFileSync(resolve(BACKUP_DIR, name), zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer);
  } finally {
    rmSync(tmp, { force: true });
  }
  for (const old of listBackups().slice(KEEP)) rmSync(resolve(BACKUP_DIR, old.name), { force: true });
  return listBackups().find((b) => b.name === name)!;
}

export function listBackups(): BackupInfo[] {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((n) => NAME.test(n))
    .map((name) => {
      const s = statSync(resolve(BACKUP_DIR, name));
      return { name, size: s.size, createdAt: s.mtimeMs };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function backupPath(name: string): string | null {
  if (!NAME.test(name)) return null;
  const path = resolve(BACKUP_DIR, name);
  return existsSync(path) ? path : null;
}

/** On startup: back up if the newest backup is more than a day old. Never blocks startup. */
export function autoBackup(): void {
  try {
    const newest = listBackups()[0];
    if (!newest || Date.now() - newest.createdAt > AUTO_INTERVAL_MS) {
      const b = createBackup();
      console.log(`[backup] created ${b.name}`);
    }
  } catch (err) {
    console.error('[backup] automatic backup failed:', (err as Error).message);
  }
}
