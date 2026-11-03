/** What each paragraph in the uploaded resume is for. Shared by the import task and the layout code. */

export const SECTION_KINDS = ['summary', 'skills', 'experience', 'education', 'certifications', 'entries'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

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

export const FIELD_NAMES = [
  'text',
  'organization',
  'title',
  'location',
  'dates',
  'degree',
  'school',
  'details',
  'name',
  'issuer',
  'date',
  'category',
  'items',
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

/** Placeholders each role may use in its pattern. Roles not listed have no pattern. */
export const ROLE_FIELDS: Partial<Record<Role, FieldName[]>> = {
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

export const hasPattern = (role: Role) => role in ROLE_FIELDS;
