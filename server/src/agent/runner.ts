import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { config } from '../config.ts';
import { db } from '../db.ts';
import { getSettings, type Settings } from '../settings.ts';
import { getCodexVersion, killTree, resolveCodex } from './codexCli.ts';
import { toStrictJsonSchema } from './jsonSchema.ts';
import type { TaskDef } from './task.ts';

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Run {
  id: number;
  task: string;
  status: RunStatus;
  input: unknown;
  prompt: string | null;
  output: unknown;
  error: string | null;
  attempts: number;
  model: string | null;
  codexVersion: string | null;
  threadId: string | null;
  usage: unknown;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
}

export type RunStreamEvent =
  | { kind: 'run'; run: Run }
  | { kind: 'codex'; attempt: number; event: unknown };

type Listener = (event: RunStreamEvent) => void;

const MAX_ATTEMPTS = 2;
const STDERR_LIMIT = 20_000;

export const isFinal = (status: RunStatus) =>
  status === 'succeeded' || status === 'failed' || status === 'cancelled';

interface RunRow {
  id: number;
  task: string;
  status: RunStatus;
  input: string | null;
  prompt: string | null;
  output: string | null;
  error: string | null;
  attempts: number;
  model: string | null;
  codex_version: string | null;
  thread_id: string | null;
  usage: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  duration_ms: number | null;
}

const parseJson = (s: string | null) => (s == null ? null : JSON.parse(s));

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    task: row.task,
    status: row.status,
    input: parseJson(row.input),
    prompt: row.prompt,
    output: parseJson(row.output),
    error: row.error,
    attempts: row.attempts,
    model: row.model,
    codexVersion: row.codex_version,
    threadId: row.thread_id,
    usage: parseJson(row.usage),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
  };
}

export function getRun(id: number): Run | null {
  const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) as RunRow | undefined;
  return row ? toRun(row) : null;
}

export function listRuns(limit = 100): Run[] {
  const rows = db
    .prepare('SELECT * FROM agent_runs ORDER BY id DESC LIMIT ?')
    .all(limit) as unknown as RunRow[];
  return rows.map(toRun);
}

/** Raw Codex JSONL events recorded for a run, oldest first. */
export function getRunEvents(id: number): { attempt: number; at: number; event: unknown }[] {
  const file = resolve(config.runsDir, String(id), 'events.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const COLUMN: Record<string, string> = {
  status: 'status',
  output: 'output',
  error: 'error',
  attempts: 'attempts',
  model: 'model',
  codexVersion: 'codex_version',
  threadId: 'thread_id',
  usage: 'usage',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
  durationMs: 'duration_ms',
};

function updateRun(id: number, patch: Partial<Run>): void {
  const entries = Object.entries(patch).filter(([key]) => key in COLUMN);
  if (!entries.length) return;
  const sets = entries.map(([key]) => `${COLUMN[key]} = ?`).join(', ');
  const values = entries.map(([key, value]) =>
    key === 'output' || key === 'usage' ? (value == null ? null : JSON.stringify(value)) : (value as never),
  );
  db.prepare(`UPDATE agent_runs SET ${sets} WHERE id = ?`).run(...values, id);
}

interface AttemptResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  /** Don't retry: timed out, cancelled, or Codex couldn't start. */
  fatal?: boolean;
}

/**
 * Runs agent tasks through `codex exec`, one at a time, in the order they were queued.
 * Each run gets a folder under data/runs/<id>/ with its schema, events and result.
 */
class Runner {
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Map<number, Set<Listener>>();
  private active = new Map<number, ChildProcess>();
  private cancelled = new Set<number>();

  /** Marks runs left mid-flight by a previous server process as failed. Call once after migrating. */
  recoverInterrupted(): void {
    db.prepare(
      `UPDATE agent_runs SET status = 'failed', error = 'Interrupted: the server restarted before this run finished.',
       finished_at = ? WHERE status IN ('queued', 'running')`,
    ).run(Date.now());
  }

  enqueue<I, O>(task: TaskDef<I, O>, rawInput: unknown): number {
    const input = task.input.parse(rawInput);
    const prompt = task.buildPrompt(input);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO agent_runs (task, status, input, prompt, created_at) VALUES (?, 'queued', ?, ?, ?)`,
      )
      .run(task.name, JSON.stringify(input), prompt, Date.now());
    const id = Number(lastInsertRowid);
    this.queue = this.queue.then(() => this.execute(id, task, prompt)).catch((err) => {
      console.error(`[runner] run ${id} crashed`, err);
      this.finish(id, { status: 'failed', error: `Internal error: ${(err as Error).message}` });
    });
    return id;
  }

  /** Runs a task and resolves with its validated output (throws if the run fails). */
  async run<I, O>(task: TaskDef<I, O>, input: unknown): Promise<{ runId: number; output: O }> {
    const runId = this.enqueue(task, input);
    const run = await this.waitFor(runId);
    if (run.status !== 'succeeded') throw new Error(run.error ?? `Run ${runId} ${run.status}`);
    return { runId, output: run.output as O };
  }

  waitFor(id: number): Promise<Run> {
    return new Promise((resolvePromise) => {
      const current = getRun(id);
      if (current && isFinal(current.status)) return resolvePromise(current);
      const unsubscribe = this.subscribe(id, (event) => {
        if (event.kind === 'run' && isFinal(event.run.status)) {
          unsubscribe();
          resolvePromise(event.run);
        }
      });
    });
  }

  subscribe(id: number, listener: Listener): () => void {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(id);
    };
  }

  cancel(id: number): boolean {
    const run = getRun(id);
    if (!run || isFinal(run.status)) return false;
    this.cancelled.add(id);
    const child = this.active.get(id);
    if (child) killTree(child);
    else this.finish(id, { status: 'cancelled', error: 'Cancelled before it started.' });
    return true;
  }

  /** Stops any running Codex process (used on server shutdown). */
  shutdown(): void {
    for (const child of this.active.values()) killTree(child);
  }

  private emit(id: number, event: RunStreamEvent): void {
    for (const listener of this.listeners.get(id) ?? []) {
      try {
        listener(event);
      } catch (err) {
        console.error('[runner] listener error', err);
      }
    }
  }

  private finish(id: number, patch: Partial<Run>): void {
    const run = getRun(id);
    const finishedAt = Date.now();
    updateRun(id, {
      ...patch,
      finishedAt,
      durationMs: run?.startedAt ? finishedAt - run.startedAt : null,
    });
    this.cancelled.delete(id);
    const updated = getRun(id);
    if (updated) this.emit(id, { kind: 'run', run: updated });
  }

  private async execute(id: number, task: TaskDef<unknown, unknown>, prompt: string): Promise<void> {
    if (this.cancelled.has(id) || getRun(id)?.status !== 'queued') return;

    const settings = getSettings();
    let cmd;
    try {
      cmd = resolveCodex(settings.codexPath);
    } catch (err) {
      updateRun(id, { status: 'running', startedAt: Date.now() });
      return this.finish(id, { status: 'failed', error: (err as Error).message });
    }

    updateRun(id, {
      status: 'running',
      startedAt: Date.now(),
      model: settings.model || 'default',
      codexVersion: await getCodexVersion(cmd),
    });
    this.emit(id, { kind: 'run', run: getRun(id)! });

    const runDir = resolve(config.runsDir, String(id));
    mkdirSync(runDir, { recursive: true });
    const schemaFile = resolve(runDir, 'schema.json');
    writeFileSync(schemaFile, JSON.stringify(toStrictJsonSchema(task.output), null, 2));

    let last: AttemptResult = { ok: false, error: 'Not run' };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      updateRun(id, { attempts: attempt });
      last = await this.attempt(id, attempt, cmd, settings, prompt, runDir, schemaFile, task);
      if (last.ok || last.fatal || this.cancelled.has(id)) break;
      console.warn(`[runner] run ${id} attempt ${attempt} failed: ${last.error}`);
    }

    if (this.cancelled.has(id)) this.finish(id, { status: 'cancelled', error: 'Cancelled.' });
    else if (last.ok) this.finish(id, { status: 'succeeded', output: last.output, error: null });
    else this.finish(id, { status: 'failed', error: last.error ?? 'Unknown error' });
  }

  private attempt(
    id: number,
    attempt: number,
    cmd: ReturnType<typeof resolveCodex>,
    settings: Settings,
    prompt: string,
    runDir: string,
    schemaFile: string,
    task: TaskDef<unknown, unknown>,
  ): Promise<AttemptResult> {
    const resultFile = resolve(runDir, 'result.json');
    const eventsFile = resolve(runDir, 'events.jsonl');
    rmSync(resultFile, { force: true });

    const args = [
      ...cmd.prefixArgs,
      'exec',
      '-', // prompt comes from stdin
      '--cd', config.agentWorkspace,
      '--sandbox', 'read-only',
      '--skip-git-repo-check',
      '--ephemeral',
      '--output-schema', schemaFile,
      '--output-last-message', resultFile,
      '--json',
      '--color', 'never',
    ];
    if (!settings.useUserConfig) args.push('--ignore-user-config');
    if (settings.model) args.push('--model', settings.model);
    if (settings.reasoningEffort) args.push('-c', `model_reasoning_effort="${settings.reasoningEffort}"`);

    return new Promise((resolvePromise) => {
      const child = spawn(cmd.file, args, { cwd: config.agentWorkspace, windowsHide: true });
      this.active.set(id, child);

      let stderr = '';
      let agentError: string | null = null;
      let timedOut = false;
      const timeoutSeconds = Math.max(settings.timeoutSeconds, task.minTimeoutSeconds ?? 0);

      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child);
      }, timeoutSeconds * 1000);

      child.stdin.on('error', () => {}); // codex may exit before reading stdin
      child.stdin.end(prompt);

      child.stderr.on('data', (chunk) => {
        stderr = (stderr + chunk).slice(-STDERR_LIMIT);
      });

      createInterface({ input: child.stdout }).on('line', (line) => {
        if (!line.trim()) return;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line);
        } catch {
          return; // not an event line
        }
        appendFileSync(eventsFile, JSON.stringify({ attempt, at: Date.now(), event }) + '\n');
        if (event.type === 'thread.started') updateRun(id, { threadId: String(event.thread_id) });
        if (event.type === 'turn.completed') updateRun(id, { usage: event.usage });
        if (event.type === 'turn.failed') agentError = errorText(event.error) ?? 'Codex turn failed';
        if (event.type === 'error') agentError = errorText(event) ?? 'Codex reported an error';
        this.emit(id, { kind: 'codex', attempt, event });
      });

      const done = (result: AttemptResult) => {
        clearTimeout(timer);
        this.active.delete(id);
        resolvePromise(result);
      };

      child.on('error', (err) => done({ ok: false, fatal: true, error: `Could not start Codex: ${err.message}` }));

      child.on('close', (code) => {
        if (this.cancelled.has(id)) return done({ ok: false, fatal: true, error: 'Cancelled.' });
        if (timedOut) {
          return done({ ok: false, fatal: true, error: `Timed out after ${timeoutSeconds}s.` });
        }
        if (code !== 0) {
          const detail = agentError ?? lastLines(stderr) ?? `exit code ${code}`;
          // Expired sign-ins are the most common cause; say how to fix it, and don't retry.
          if (/401|unauthori[sz]ed|not logged in|log ?in|sign ?in|token (has )?expired|refresh token/i.test(detail)) {
            return done({ ok: false, fatal: true, error: `Codex failed: ${detail}\nCodex may need you to sign in again: run "codex login" in a terminal.` });
          }
          return done({ ok: false, error: `Codex failed: ${detail}` });
        }
        if (!existsSync(resultFile)) return done({ ok: false, error: 'Codex finished without a final message.' });

        const text = readFileSync(resultFile, 'utf8').trim();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          return done({ ok: false, error: `Final message was not valid JSON: ${text.slice(0, 300)}` });
        }
        const parsed = task.output.safeParse(json);
        if (!parsed.success) {
          return done({ ok: false, error: `Output didn't match the expected shape: ${parsed.error.message}` });
        }
        done({ ok: true, output: parsed.data });
      });
    });
  }
}

function errorText(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const message = (value as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
}

function lastLines(text: string, count = 5): string | null {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  return lines.length ? lines.slice(-count).join('\n') : null;
}

export const runner = new Runner();
