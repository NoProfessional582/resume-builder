import type { ApplicationSummary } from './applicationTypes';
export const STAGES = ['interested', 'applied', 'screened', 'interviewing', 'offer', 'closed'] as const;
export const LABELS: Record<string, string> = {
  interested: 'Interested',
  applied: 'Applied',
  screened: 'Screened',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed: 'Cancelled/declined',
  unset: 'Set stage',
};
export const REASONS = ['employer_rejection', 'withdrawal', 'declined_offer', 'closed_posting', 'other'];
export interface Contact {
  id: number;
  name: string;
  organization: string;
  title: string;
  email: string;
  phone: string;
  profileUrl: string;
  notes: string;
  role?: string;
  linkCount?: number;
}
export interface Workspace {
  stage: string | null;
  offerOutcome: string | null;
  closureReason: string | null;
  lastActivityDate: string | null;
  history: {
    id: number;
    stage: string;
    offer_outcome: string | null;
    closure_reason: string | null;
    note: string;
    effective_date: string;
    recorded_at: number;
  }[];
  activities: {
    id: number;
    kind: string;
    text: string;
    effective_date: string;
    recorded_at: number;
    voided: number;
    replaces_id: number | null;
  }[];
  contacts: Contact[];
}
export interface Preferences {
  view: 'list' | 'board';
  search: string;
  companies: string[];
  visible: string[];
  group: boolean;
  sort: 'activity' | 'added' | 'title' | 'company';
  ascending: boolean;
}
export const defaults: Preferences = {
  view: 'list',
  search: '',
  companies: [],
  visible: [...STAGES, 'unset'],
  group: false,
  sort: 'activity',
  ascending: false,
};
export async function workspaceRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      data.issues?.map((v: { message: string }) => v.message).join('; ') ||
        data.error ||
        data.message ||
        'Unable to save. Try again.',
    );
  return data;
}
export const today = () => new Date().toLocaleDateString('en-CA');
export function filterApplications(all: ApplicationSummary[], p: Preferences) {
  return all
    .filter(
      (a) =>
        (!p.companies.length || p.companies.includes(a.company)) &&
        p.visible.includes(a.stage ?? 'unset') &&
        `${a.roleTitle} ${a.company} ${a.notes ?? ''}`.toLowerCase().includes(p.search.toLowerCase()),
    )
    .sort((a, b) => {
      let result = 0;
      if (p.sort === 'activity') {
        if (!a.lastActivityDate || !b.lastActivityDate)
          return a.lastActivityDate ? -1 : b.lastActivityDate ? 1 : a.id - b.id;
        result = a.lastActivityDate.localeCompare(b.lastActivityDate);
      } else if (p.sort === 'added') result = a.createdAt - b.createdAt;
      else
        result = (p.sort === 'title' ? a.roleTitle : a.company).localeCompare(
          p.sort === 'title' ? b.roleTitle : b.company,
        );
      return (p.ascending ? result : -result) || a.id - b.id;
    });
}
