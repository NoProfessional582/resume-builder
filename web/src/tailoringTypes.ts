// Mirrors server/src/resume/tailored.ts, checks.ts and tailoring.ts.
import type { Importance } from './applicationTypes';

export interface TailorSettings {
  targetPages: number;
  minBullets: number;
  maxBullets: number;
  includeDescriptions: boolean;
  instructions: string;
  autoFit: boolean;
}

export const DEFAULT_SETTINGS: TailorSettings = {
  targetPages: 2,
  minBullets: 1,
  maxBullets: 4,
  includeDescriptions: true,
  instructions: '',
  autoFit: true,
};

export interface TailoredBullet {
  text: string;
  sourceStoryIds: number[];
  keywords: string[];
}

export interface TailoredPosition {
  positionId: number;
  organization: string;
  title: string;
  location: string | null;
  start: string | null;
  end: string | null;
  description: string | null;
  bullets: TailoredBullet[];
}

export interface TailoredContent {
  summary: string[];
  skills: { category: string | null; items: string[] }[];
  positions: TailoredPosition[];
  education: { degree: string; school: string | null; location: string | null; dates: string | null; details: string | null }[];
  certifications: { name: string; issuer: string | null; date: string | null }[];
  entries: { heading: string; items: string[] }[];
  gaps: { item: string; importance: Importance; note: string }[];
  notes: string;
}

export interface CheckWarning {
  positionId: number | null;
  bullet: number | null;
  kind: 'number' | 'source' | 'language' | 'count' | 'missing';
  message: string;
}

export interface Checks {
  warnings: CheckWarning[];
  coverage: { term: string; importance: Importance; covered: boolean }[];
}

export interface TailoredView {
  id: number;
  applicationId: number;
  version: number;
  label: string | null;
  status: 'tailoring' | 'ready' | 'failed';
  runId: number | null;
  progress: string | null;
  error: string | null;
  fitNote: string | null;
  settings: TailorSettings;
  content: TailoredContent | null;
  userEdited: boolean;
  checks: Checks | null;
  stories: Record<string, { positionId: number; text: string }>;
  generated: { pages: number | null; at: number; stale: boolean } | null;
  createdAt: number;
}

export interface TailoredSummary {
  id: number;
  version: number;
  label: string | null;
  status: 'tailoring' | 'ready' | 'failed';
  createdAt: number;
  generatedAt: number | null;
  pages: number | null;
}
