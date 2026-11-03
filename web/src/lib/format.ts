import type { CodexEvent, Usage } from '../types';

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function formatTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTokens(usage: Usage | null | undefined): string {
  if (!usage) return '—';
  const fmt = (n = 0) => n.toLocaleString();
  return `${fmt(usage.input_tokens)} in / ${fmt(usage.output_tokens)} out`;
}

/** One-line, human description of a Codex JSONL event. */
export function describeEvent(event: CodexEvent): string {
  const item = event.item as { type?: string; command?: string; text?: string } | undefined;
  switch (event.type) {
    case 'thread.started':
      return 'Session started';
    case 'turn.started':
      return 'Working…';
    case 'item.started':
    case 'item.completed': {
      const verb = event.type === 'item.started' ? 'Started' : 'Finished';
      if (item?.type === 'agent_message') return 'Wrote the answer';
      if (item?.type === 'reasoning') return `${verb} reasoning`;
      if (item?.type === 'command_execution') return `${verb} command: ${item.command ?? ''}`;
      return `${verb} ${item?.type ?? 'step'}`;
    }
    case 'turn.completed':
      return `Done (${formatTokens(event.usage as Usage)})`;
    case 'turn.failed':
      return `Failed: ${(event.error as { message?: string })?.message ?? 'unknown error'}`;
    case 'error':
      return `Error: ${(event.message as string) ?? 'unknown'}`;
    default:
      return event.type;
  }
}
