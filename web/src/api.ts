import type {
  Position,
  PositionInput,
  ProfileSection,
  ProfileSectionKind,
  RefineSession,
  Story,
  StoryVersion,
} from './profileTypes';
import type { Application, ApplicationInput, ApplicationSummary, JobAnalysis, ParsedPosting } from './applicationTypes';
import type { ImportView, PreviewResult, Role, TemplateSummary } from './resumeTypes';
import type { ReviewView, TailoredContent, TailoredSummary, TailoredView, TailorSettings } from './tailoringTypes';
import type { CodexModel, CodexStatus, Run, RunDetail, Settings } from './types';

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
  const data = res.status === 204 ? null : await res.json().catch(() => null);
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
  codexModels: () => request<CodexModel[]>('GET', '/codex/models'),
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

  listPositions: () => request<Position[]>('GET', '/positions'),
  createPosition: (input: PositionInput) => request<Position>('POST', '/positions', input),
  updatePosition: (id: number, input: PositionInput) => request<Position>('PUT', `/positions/${id}`, input),
  deletePosition: (id: number) => request<void>('DELETE', `/positions/${id}`),
  createStory: (positionId: number, text: string) => request<Story>('POST', `/positions/${positionId}/stories`, { text }),
  reorderStories: (positionId: number, ids: number[]) =>
    request<{ ok: true }>('PUT', `/positions/${positionId}/stories/order`, { ids }),
  updateStory: (id: number, change: { text?: string; lessons?: string | null; positionId?: number }) =>
    request<Story>('PUT', `/stories/${id}`, change),
  deleteStory: (id: number) => request<void>('DELETE', `/stories/${id}`),
  storyVersions: (id: number) => request<StoryVersion[]>('GET', `/stories/${id}/versions`),
  restoreVersion: (id: number, versionId: number) => request<Story>('POST', `/stories/${id}/restore`, { versionId }),

  startRefine: (storyId: number, gap?: { versionId: number; gapIndex: number; reviewedAt: number } | { focus: string }) => request<RefineSession>('POST', `/stories/${storyId}/refine`, gap),
  getRefine: (id: number) => request<RefineSession>('GET', `/refine/${id}`),
  sendRefine: (id: number, content: string, draft: string, lessons: string) =>
    request<RefineSession>('POST', `/refine/${id}/messages`, { content, draft, lessons }),
  retryRefine: (id: number) => request<RefineSession>('POST', `/refine/${id}/retry`, {}),
  acceptRefine: (id: number, draft: string, lessons: string) =>
    request<RefineSession>('POST', `/refine/${id}/accept`, { draft, lessons }),
  discardRefine: (id: number) => request<RefineSession>('POST', `/refine/${id}/discard`, {}),

  listApplications: () => request<ApplicationSummary[]>('GET', '/applications'),
  createApplication: (input: ApplicationInput) => request<Application>('POST', '/applications', input),
  parsePostingUrl: (url: string) => request<ParsedPosting>('POST', '/applications/parse-url', { url }),
  getApplication: (id: number) => request<Application>('GET', `/applications/${id}`),
  updateApplication: (id: number, input: ApplicationInput) => request<Application>('PUT', `/applications/${id}`, input),
  deleteApplication: (id: number) => request<void>('DELETE', `/applications/${id}`),
  analyzeApplication: (id: number) => request<Application>('POST', `/applications/${id}/analyze`, {}),
  saveAnalysis: (id: number, analysis: JobAnalysis) => request<Application>('PUT', `/applications/${id}/analysis`, analysis),
  resetAnalysis: (id: number) => request<Application>('POST', `/applications/${id}/analysis/reset`, {}),

  listTailored: (applicationId: number) => request<TailoredSummary[]>('GET', `/applications/${applicationId}/tailored`),
  startTailoring: (applicationId: number, settings: TailorSettings) =>
    request<TailoredView>('POST', `/applications/${applicationId}/tailored`, settings),
  getTailored: (id: number) => request<TailoredView>('GET', `/tailored/${id}`),
  saveTailored: (id: number, content: TailoredContent) => request<TailoredView>('PUT', `/tailored/${id}/content`, content),
  resetTailored: (id: number) => request<TailoredView>('POST', `/tailored/${id}/reset`, {}),
  retryTailored: (id: number) => request<TailoredView>('POST', `/tailored/${id}/retry`, {}),
  generateTailored: (id: number) => request<TailoredView>('POST', `/tailored/${id}/generate`, {}),
  deleteTailored: (id: number) => request<void>('DELETE', `/tailored/${id}`),
  reviseTailored: (id: number, instruction: string) => request<TailoredView>('POST', `/tailored/${id}/revise`, { instruction }),
  fitTailored: (id: number, targetPages: number) => request<TailoredView>('POST', `/tailored/${id}/fit`, { targetPages }),
  getReview: (id: number) => request<ReviewView | null>('GET', `/tailored/${id}/review`),
  startReview: (id: number) => request<ReviewView>('POST', `/tailored/${id}/review`, {}),

  listBackups: () => request<{ name: string; size: number; createdAt: number }[]>('GET', '/backups'),
  createBackup: () => request<{ name: string; size: number; createdAt: number }>('POST', '/backups', {}),

  listSections: () => request<ProfileSection[]>('GET', '/sections'),
  createSection: (kind: ProfileSectionKind, heading: string | null) =>
    request<ProfileSection>('POST', '/sections', { kind, heading }),
  saveSection: (id: number, heading: string | null, items: unknown[]) =>
    request<ProfileSection>('PUT', `/sections/${id}`, { heading, items }),
  deleteSection: (id: number) => request<void>('DELETE', `/sections/${id}`),
  previewProfile: () => request<{ pages: number }>('POST', '/template/preview', {}),
};
