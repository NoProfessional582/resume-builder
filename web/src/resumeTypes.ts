// Mirrors server/src/docx/roles.ts, layout.ts and resume/content.ts.

export const ROLES = [
  'section_heading',
  'summary_text',
  'skills_table',
  'skill_line',
  'org_heading',
  'position_heading',
  'position_meta',
  'position_description',
  'position_bullet',
  'education_item',
  'certification_item',
  'entry_item',
  'static',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  section_heading: 'Section heading',
  summary_text: 'Summary paragraph',
  skills_table: 'Skills table',
  skill_line: 'Skills line',
  org_heading: 'Employer line',
  position_heading: 'Position line',
  position_meta: 'Position details line',
  position_description: 'Position description',
  position_bullet: 'Bullet',
  education_item: 'Education item',
  certification_item: 'Certification',
  entry_item: 'Other item',
  static: 'Keep as is',
};

export const ROLE_FIELDS: Partial<Record<Role, string[]>> = {
  summary_text: ['text'],
  skill_line: ['category', 'items'],
  org_heading: ['organization', 'location', 'dates'],
  position_heading: ['title', 'organization', 'location', 'dates'],
  position_meta: ['organization', 'location', 'dates'],
  position_description: ['text'],
  position_bullet: ['text'],
  education_item: ['degree', 'school', 'location', 'dates', 'details'],
  certification_item: ['name', 'issuer', 'date'],
  entry_item: ['text'],
};

export interface BlockInfo {
  index: number;
  type: 'p' | 'table' | 'other';
  text: string;
  style: string | null;
  list: boolean;
  align: string | null;
  bold: boolean;
  spacer: boolean;
  cells?: string[][][];
}

export interface ResolvedBlock {
  index: number;
  role: Role | 'spacer';
  section: string | null;
  pattern: string | null;
  values: Record<string, string>;
  status: 'ok' | 'mismatch' | 'none';
  message: string | null;
}

export type SectionKind = 'summary' | 'skills' | 'experience' | 'education' | 'certifications' | 'entries';

export interface LayoutSection {
  key: string;
  kind: SectionKind;
  heading: string | null;
  headingBlock: number | null;
  prototypes: Partial<Record<Role, { block: number; pattern: string | null }>>;
}

export interface DateFormat {
  style: string;
  separator: string;
  presentLabel: string;
}

export interface TemplateLayout {
  dates: DateFormat;
  sections: LayoutSection[];
}

export interface PositionContent {
  organization: string;
  title: string;
  location: string | null;
  start: string | null;
  end: string | null;
  description: string | null;
  bullets: string[];
}

export interface ResumeContent {
  summary: string[];
  skills: { category: string | null; items: string[] }[];
  positions: PositionContent[];
  education: { degree: string; school: string | null; location: string | null; dates: string | null; details: string | null }[];
  certifications: { name: string; issuer: string | null; date: string | null }[];
  entries: { heading: string; items: string[] }[];
}

export interface ProfileCounts {
  positions: number;
  stories: number;
  sections: number;
}

export interface ImportView {
  id: number;
  filename: string;
  status: 'analyzing' | 'ready' | 'failed' | 'saved';
  error: string | null;
  runId: number | null;
  createdAt: number;
  blocks: BlockInfo[];
  resolved: ResolvedBlock[] | null;
  layout: TemplateLayout | null;
  content: ResumeContent | null;
  issues: { block: number | null; message: string }[];
  notes: string[];
  profile: ProfileCounts;
}

export interface PreviewResult {
  originalPages: number;
  renderedPages: number;
  diff: { same: number; removed: string[]; added: string[] };
}

export interface TemplateSummary {
  template: {
    id: number;
    importId: number | null;
    filename: string;
    createdAt: number;
    dates: DateFormat;
    sections: { kind: SectionKind; heading: string | null; roles: Role[] }[];
  } | null;
  profile: ProfileCounts;
}

export const SECTION_LABELS: Record<SectionKind, string> = {
  summary: 'Summary',
  skills: 'Skills',
  experience: 'Experience',
  education: 'Education',
  certifications: 'Certifications',
  entries: 'Other',
};
