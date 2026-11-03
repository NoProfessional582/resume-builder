import type { CodexStatus, Run, RunDetail, Settings } from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const issues = data?.issues?.map((i: { path: string[]; message: string }) => `${i.path.join('.')}: ${i.message}`);
    throw new ApiError(res.status, issues?.join('; ') || data?.error || `${res.status} ${res.statusText}`);
  }
  return data as T;
}

export const api = {
  getSettings: () => request<Settings>('GET', '/settings'),
  saveSettings: (patch: Partial<Settings>) => request<Settings>('PUT', '/settings', patch),
  codexStatus: () => request<CodexStatus>('GET', '/codex/status'),
  testCodex: () => request<{ runId: number }>('POST', '/codex/test', {}),
  listRuns: () => request<Run[]>('GET', '/runs'),
  getRun: (id: number) => request<RunDetail>('GET', `/runs/${id}`),
  cancelRun: (id: number) => request<{ cancelled: boolean }>('POST', `/runs/${id}/cancel`, {}),
};
