import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const dataDir = resolve(process.env.RB_DATA_DIR ?? resolve(repoRoot, 'data'));

export const config = {
  repoRoot,
  dataDir,
  dbFile: resolve(dataDir, 'app.db'),
  runsDir: resolve(dataDir, 'runs'),
  logsDir: resolve(dataDir, 'logs'),
  pidFile: resolve(dataDir, 'server.pid'),
  migrationsDir: resolve(repoRoot, 'server', 'migrations'),
  agentWorkspace: resolve(repoRoot, 'agent-workspace'),
  webDist: resolve(repoRoot, 'web', 'dist'),
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 4310),
};

for (const dir of [config.dataDir, config.runsDir, config.logsDir]) {
  mkdirSync(dir, { recursive: true });
}
