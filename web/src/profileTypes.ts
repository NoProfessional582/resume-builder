// Mirrors server/src/resume/positions.ts and sections.ts.

export interface Story {
  id: number;
  positionId: number;
  text: string;
  /** Lessons learned: interview prep, never printed. */
  lessons: string | null;
  status: 'raw' | 'refined';
  sortOrder: number;
  versionCount: number;
  updatedAt: number;
  openSessionId: number | null;
}

export type CoverageLevel = 'present' | 'partial' | 'missing';
export const COVERAGE_KEYS = ['context', 'action', 'metrics', 'impact', 'results', 'lessons'] as const;
export type Coverage = Record<(typeof COVERAGE_KEYS)[number], CoverageLevel>;

export interface RefineMessage {
  id: number;
  role: 'agent' | 'user';
  content: string;
  draft: string | null;
  lessons: string | null;
  questions: string[];
  coverage: Coverage | null;
  done: boolean;
  createdAt: number;
}

export interface RefineSession {
  id: number;
  storyId: number;
  status: 'open' | 'accepted' | 'discarded';
  originalText: string;
  focus: string | null;
  currentDraft: string;
  currentLessons: string | null;
  messages: RefineMessage[];
  runId: number | null;
  error: string | null;
  createdAt: number;
}

export interface Position {
  id: number;
  organization: string;
  title: string;
  location: string | null;
  description: string | null;
  start: string | null;
  end: string | null;
  stories: Story[];
}

export type PositionInput = Omit<Position, 'id' | 'stories'>;

export interface StoryVersion {
  id: number;
  text: string;
  source: 'user' | 'import' | 'agent';
  createdAt: number;
}

export type ProfileSectionKind = 'summary' | 'skills' | 'education' | 'certifications' | 'entries';

export interface SummaryItem {
  text: string;
}
export interface SkillGroup {
  category: string | null;
  items: string[];
}
export interface EducationItem {
  degree: string;
  school: string | null;
  location: string | null;
  dates: string | null;
  details: string | null;
}
export interface CertificationItem {
  name: string;
  issuer: string | null;
  date: string | null;
}
export interface EntryItem {
  text: string;
}

export interface ProfileSection {
  id: number;
  kind: ProfileSectionKind;
  heading: string | null;
  items: unknown[];
  inTemplate: boolean;
}

export const KIND_LABELS: Record<ProfileSectionKind, string> = {
  summary: 'Summary',
  skills: 'Skills',
  education: 'Education',
  certifications: 'Certifications',
  entries: 'List section',
};
