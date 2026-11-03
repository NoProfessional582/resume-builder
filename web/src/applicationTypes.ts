// Mirrors server/src/agent/tasks/analyzeJob.ts and server/src/resume/applications.ts.

export const KEYWORD_CATEGORIES = ['hard_skill', 'tool', 'domain', 'certification', 'soft_skill', 'methodology'] as const;
export type KeywordCategory = (typeof KEYWORD_CATEGORIES)[number];
export const IMPORTANCE = ['required', 'preferred', 'nice_to_have'] as const;
export type Importance = (typeof IMPORTANCE)[number];
export const ROLE_TYPES = ['technical', 'leadership', 'program', 'customer', 'other'] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

export const CATEGORY_LABELS: Record<KeywordCategory, string> = {
  hard_skill: 'Skill',
  tool: 'Tool',
  domain: 'Domain',
  certification: 'Certification',
  soft_skill: 'Soft skill',
  methodology: 'Method',
};

export const IMPORTANCE_LABELS: Record<Importance, string> = {
  required: 'Required',
  preferred: 'Preferred',
  nice_to_have: 'Nice to have',
};

export const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  technical: 'Technical',
  leadership: 'Leadership',
  program: 'Program / project',
  customer: 'Customer-facing',
  other: 'Other',
};

export interface Keyword {
  term: string;
  category: KeywordCategory;
  importance: Importance;
  synonyms: string[];
  evidence: string;
}

export interface KeyExperience {
  statement: string;
  importance: Importance;
  keywords: string[];
}

export interface JobAnalysis {
  roleSummary: string;
  seniority: string;
  roleTypes: RoleType[];
  keywords: Keyword[];
  keyExperiences: KeyExperience[];
  responsibilities: string[];
  notes: string[];
}

export interface ApplicationInput {
  /** Link to the original posting. */
  url: string | null;
  company: string;
  roleTitle: string;
  jobDescription: string;
  requiredExperience: string | null;
  preferredExperience: string | null;
  notes: string | null;
}

export interface Application extends ApplicationInput {
  id: number;
  createdAt: number;
  updatedAt: number;
  analysis: {
    status: 'analyzing' | 'ready' | 'failed';
    runId: number | null;
    error: string | null;
    data: JobAnalysis | null;
    userEdited: boolean;
    updatedAt: number;
  } | null;
}

export interface ParsedPosting {
  fields: ApplicationInput;
  problem: string | null;
  source: 'download' | 'browser';
  runId: number;
}

export interface ApplicationSummary {
  id: number;
  url: string | null;
  company: string;
  roleTitle: string;
  createdAt: number;
  analysisStatus: 'analyzing' | 'ready' | 'failed' | null;
  keywordCount: number;
  requiredCount: number;
}
