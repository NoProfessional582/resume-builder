import type { ImportView, PreviewResult, Role, TemplateSummary } from './resumeTypes';
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

  uploadResume: async (file: File) => {
    const res = await fetch('/api/imports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'x-filename': encodeURIComponent(file.name),
      },
      body: file,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error ?? `${res.status} ${res.statusText}`);
    return data as { id: number; runId: number };
  },
  getImport: (id: number) => request<ImportView>('GET', `/imports/${id}`),
  updateBlock: (id: number, index: number, change: { role?: Role; pattern?: string | null }) =>
    request<ImportView>('PUT', `/imports/${id}/blocks/${index}`, change),
  previewImport: (id: number) => request<PreviewResult>('POST', `/imports/${id}/preview`, {}),
  saveImport: (id: number, replaceContent: boolean) =>
    request<{ templateId: number }>('POST', `/imports/${id}/save`, { replaceContent }),
  getTemplate: () => request<TemplateSummary>('GET', '/template'),
  previewProfile: () => request<{ pages: number }>('POST', '/template/preview', {}),
};
