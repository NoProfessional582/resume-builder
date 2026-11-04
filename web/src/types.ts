// Mirrors the server's API shapes (server/src/agent/runner.ts, settings.ts, codexCli.ts).

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Usage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

export interface Run {
  id: number;
  task: string;
  status: RunStatus;
  input?: unknown;
  prompt?: string | null;
  output: unknown;
  error: string | null;
  attempts: number;
  model: string | null;
  codexVersion: string | null;
  threadId: string | null;
  usage: Usage | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
}

export interface CodexEvent {
  type: string;
  [key: string]: unknown;
}

export interface RunEventRecord {
  attempt: number;
  at: number;
  event: CodexEvent;
}

export interface RunDetail extends Run {
  events: RunEventRecord[];
}

export type RunStreamEvent =
  | { kind: 'run'; run: Run }
  | { kind: 'codex'; attempt: number; event: CodexEvent };

export interface Settings {
  displayTimezone: string;
  codexPath: string;
  model: string;
  reasoningEffort: '' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  timeoutSeconds: number;
  useUserConfig: boolean;
}

export interface CodexStatus {
  path: string | null;
  version: string | null;
  loggedIn: boolean;
  loginMessage: string;
  error: string | null;
}

export const isFinal = (status: RunStatus) =>
  status === 'succeeded' || status === 'failed' || status === 'cancelled';

export interface CodexModel {
  slug: string;
  displayName: string;
  description: string;
}
