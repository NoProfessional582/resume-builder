import { execSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

export interface CodexCommand {
  /** Executable to spawn (node.exe for codex.js, or codex.exe). */
  file: string;
  /** Args placed before the codex arguments (the script path when running codex.js). */
  prefixArgs: string[];
  /** The codex entry point that was found, for display. */
  path: string;
}

let npmRootCache: string | null | undefined;

function npmGlobalRoot(): string | null {
  if (npmRootCache === undefined) {
    try {
      npmRootCache = execSync('npm root -g', { encoding: 'utf8', windowsHide: true, timeout: 15000 }).trim();
    } catch {
      npmRootCache = null;
    }
  }
  return npmRootCache;
}

const PACKAGE_ENTRY = ['@openai', 'codex', 'bin', 'codex.js'];

/** Finds the Codex CLI: explicit setting, RB_CODEX_PATH, then the global npm install. */
export function resolveCodex(configuredPath: string): CodexCommand {
  const candidates: string[] = [];
  if (configuredPath) candidates.push(configuredPath);
  if (process.env.RB_CODEX_PATH) candidates.push(process.env.RB_CODEX_PATH);
  if (process.env.APPDATA) candidates.push(resolve(process.env.APPDATA, 'npm', 'node_modules', ...PACKAGE_ENTRY));
  const root = npmGlobalRoot();
  if (root) candidates.push(resolve(root, ...PACKAGE_ENTRY));

  for (const candidate of candidates) {
    const command = toCommand(candidate);
    if (command) return command;
  }
  throw new Error(
    'Codex CLI not found. Install it with "npm i -g @openai/codex" or set its path in Settings.',
  );
}

function toCommand(path: string): CodexCommand | null {
  const ext = extname(path).toLowerCase();
  if ((ext === '.js' || ext === '.mjs') && existsSync(path)) {
    return { file: process.execPath, prefixArgs: [path], path };
  }
  if (ext === '.exe' && existsSync(path)) {
    return { file: path, prefixArgs: [], path };
  }
  // npm shims (codex, codex.cmd, codex.ps1) sit next to node_modules; use the real script.
  if (ext === '' || ext === '.cmd' || ext === '.ps1') {
    const script = resolve(dirname(path), 'node_modules', ...PACKAGE_ENTRY);
    if (existsSync(script)) return { file: process.execPath, prefixArgs: [script], path: script };
  }
  return null;
}

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a short codex command (e.g. --version) and collects its output. */
export function runCodexCommand(cmd: CodexCommand, args: string[], timeoutMs = 20000): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd.file, [...cmd.prefixArgs, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => killTree(child), timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({ code: null, stdout, stderr: stderr + String(err) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

let versionCache: { path: string; version: string } | null = null;

export async function getCodexVersion(cmd: CodexCommand): Promise<string | null> {
  if (versionCache?.path === cmd.path) return versionCache.version;
  const result = await runCodexCommand(cmd, ['--version']);
  if (result.code !== 0) return null;
  const version = result.stdout.trim().replace(/^codex-cli\s*/i, '');
  versionCache = { path: cmd.path, version };
  return version;
}

export interface CodexStatus {
  path: string | null;
  version: string | null;
  loggedIn: boolean;
  loginMessage: string;
  error: string | null;
}

export async function getCodexStatus(configuredPath: string): Promise<CodexStatus> {
  let cmd: CodexCommand;
  try {
    cmd = resolveCodex(configuredPath);
  } catch (err) {
    return { path: null, version: null, loggedIn: false, loginMessage: '', error: (err as Error).message };
  }
  const [version, login] = await Promise.all([
    getCodexVersion(cmd),
    runCodexCommand(cmd, ['login', 'status']),
  ]);
  const loginMessage = (login.stdout + login.stderr).trim();
  return {
    path: cmd.path,
    version,
    loggedIn: login.code === 0 && /logged in/i.test(loginMessage),
    loginMessage,
    error: version ? null : 'Could not run "codex --version".',
  };
}

/** Kills a process and its children. codex.js starts a native child, so a plain kill isn't enough. */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGKILL');
  }
}
