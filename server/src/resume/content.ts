/** Everything that goes into a resume except the page header (name, contact details). */
export interface ResumeContent {
  summary: string[];
  skills: SkillGroup[];
  positions: PositionContent[];
  education: EducationItem[];
  certifications: CertificationItem[];
  /** Other list sections (awards, volunteer work, ...), matched to the template by heading. */
  entries: EntrySection[];
}

export interface SkillGroup {
  category: string | null;
  items: string[];
}

export interface PositionContent {
  organization: string;
  title: string;
  location: string | null;
  /** "YYYY-MM" or "YYYY" */
  start: string | null;
  /** null = present */
  end: string | null;
  description: string | null;
  bullets: string[];
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

export interface EntrySection {
  heading: string;
  items: string[];
}

export const emptyContent = (): ResumeContent => ({
  summary: [],
  skills: [],
  positions: [],
  education: [],
  certifications: [],
  entries: [],
});

export const normalizeHeading = (h: string | null | undefined) =>
  (h ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
