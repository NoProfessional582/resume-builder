import { z } from 'zod';
import type { CertificationItem, EducationItem, EntrySection, SkillGroup } from '../../resume/content.ts';
import { MAX_SKILL_CHARS, MAX_SKILLS } from '../../resume/skills.ts';
import type { TailorSettings } from '../../resume/tailored.ts';
import { styleGuide } from '../styleGuide.ts';
import type { TaskDef } from '../task.ts';
import { IMPORTANCE, type JobAnalysis } from './analyzeJob.ts';

export interface TailorInput {
  job: { company: string; roleTitle: string; analysis: JobAnalysis };
  profile: {
    summary: string[];
    skills: SkillGroup[];
    positions: {
      id: number;
      title: string;
      organization: string;
      location: string | null;
      dates: string;
      description: string | null;
      stories: { id: number; text: string }[];
    }[];
    education: EducationItem[];
    certifications: CertificationItem[];
    entries: EntrySection[];
  };
  settings: TailorSettings;
}

const output = z.object({
  summary: z.string(),
  skillGroups: z.array(z.object({ category: z.string().nullable(), items: z.array(z.string()) })),
  positions: z.array(
    z.object({
      positionId: z.number().int(),
      description: z.string().nullable(),
      bullets: z.array(
        z.object({
          text: z.string(),
          sourceStoryIds: z.array(z.number().int()),
          keywords: z.array(z.string()),
        }),
      ),
    }),
  ),
  educationIndexes: z.array(z.number().int()),
  certificationIndexes: z.array(z.number().int()),
  entrySections: z.array(z.object({ heading: z.string(), itemIndexes: z.array(z.number().int()) })),
  gaps: z.array(z.object({ item: z.string(), importance: z.enum(IMPORTANCE), note: z.string() })),
  notes: z.string(),
});
export type TailorOutput = z.infer<typeof output>;

const ROLE_TYPE_TEXT: Record<string, string> = {
  technical: 'technical',
  leadership: 'leadership and management',
  program: 'project and program management',
  customer: 'customer-facing',
  other: 'other',
};

function describeJob({ company, roleTitle, analysis: a }: TailorInput['job']): string {
  const keywordLines = IMPORTANCE.map((imp) => {
    const list = a.keywords.filter((k) => k.importance === imp);
    if (!list.length) return '';
    return `${imp}:\n${list.map((k) => `- ${k.term}${k.synonyms.length ? ` (also: ${k.synonyms.join(', ')})` : ''}`).join('\n')}`;
  })
    .filter(Boolean)
    .join('\n');
  return `Company: ${company}
Role: ${roleTitle}
Summary: ${a.roleSummary}
Level: ${a.seniority}
Emphasis: ${a.roleTypes.map((t) => ROLE_TYPE_TEXT[t]).join(', ')}

Keywords, by importance:
${keywordLines}

Key experiences the employer wants to see:
${a.keyExperiences.map((e) => `- [${e.importance}] ${e.statement}`).join('\n')}

Responsibilities:
${a.responsibilities.map((r) => `- ${r}`).join('\n')}
${a.notes.length ? `\nPractical notes:\n${a.notes.map((n) => `- ${n}`).join('\n')}` : ''}`;
}

function describeProfile(p: TailorInput['profile']): string {
  const positions = p.positions
    .map(
      (pos) => `### P${pos.id}: ${pos.title}, ${pos.organization}${pos.location ? `, ${pos.location}` : ''} (${pos.dates})
Role description: ${pos.description ?? '(none)'}
Stories:
${pos.stories.length ? pos.stories.map((s) => `- S${s.id}: ${s.text}`).join('\n') : '(none)'}`,
    )
    .join('\n\n');
  const list = <T>(items: T[], fmt: (t: T) => string) =>
    items.length ? items.map((t, i) => `${i}: ${fmt(t)}`).join('\n') : '(none)';
  return `Current summary:
${p.summary.join('\n\n') || '(none)'}

Skills:
${p.skills.map((g) => `${g.category ? `${g.category}: ` : ''}${g.items.join('; ')}`).join('\n') || '(none)'}

Positions (newest first):

${positions}

Education (index: item):
${list(p.education, (e) => [e.degree, e.school, e.location, e.dates, e.details].filter(Boolean).join(', '))}

Certifications (index: item):
${list(p.certifications, (c) => [c.name, c.issuer, c.date].filter(Boolean).join(', '))}

Other sections:
${p.entries.length ? p.entries.map((e) => `"${e.heading}":\n${list(e.items, (t) => t)}`).join('\n') : '(none)'}`;
}

export const tailorResumeTask: TaskDef<TailorInput, TailorOutput> = {
  name: 'tailor_resume',
  minTimeoutSeconds: 900,
  input: z.any() as z.ZodType<TailorInput>,
  output,
  buildPrompt: (input) => {
    const s = input.settings;
    return `You are tailoring the user's résumé to one job. Write the résumé's content (everything except the
page header) from the user's profile, following their style guide exactly. The profile is the only
source of facts.

## Style guide
${styleGuide('common', 'resume', 'check')}

## The job
${describeJob(input.job)}

## The user's profile
${describeProfile(input.profile)}

## Settings
- Target length: ${s.targetPages} page${s.targetPages === 1 ? '' : 's'} in the user's résumé template.
- Bullets per position: between ${s.minBullets} and ${s.maxBullets}. Give recent and most relevant
  positions more, older or less relevant ones fewer.
- Role descriptions: ${s.includeDescriptions ? 'write a role overview for each position, per the style guide.' : 'none; return null for every description.'}
${s.instructions ? `- The user's instructions for this résumé: ${s.instructions}` : ''}

## What to return
- summary: the professional summary, one paragraph, aligned to this role, per the style guide.
- skillGroups: the skills section, most relevant first: exactly ${MAX_SKILLS} skills in total (fewer only if
  the profile can't truthfully support ${MAX_SKILLS}). They fill a 3 × 3 table, so each skill must be at most
  ${MAX_SKILL_CHARS} characters including spaces; shorten a long name (e.g. "Stakeholder Communication"
  rather than "Cross-Functional Stakeholder Communication") or pick another skill. Longer ones are
  dropped. Use only skills from the profile's skills list or clearly demonstrated in its stories;
  prefer the posting's wording when it truthfully names the same skill and fits. Use a single group
  with category null unless the profile's skills use categories.
- positions: one entry for every position above (P ids), in the same order.
  - positionId: the number after "P".
  - description: the role overview, or null.
  - bullets: résumé bullets written from this position's stories. sourceStoryIds lists the story
    numbers (after "S") each bullet draws on — only stories of the same position. You may combine or
    split stories, but every fact must come from the cited stories or the position's role
    description. keywords lists the job keyword terms (exactly as written in the keyword list) the
    bullet uses; use a keyword only where the cited stories support it.
- educationIndexes, certificationIndexes: the items to include, in display order (usually all, most
  relevant first).
- entrySections: for each other section, its heading and the item indexes to include.
- gaps: required or preferred keywords or key experiences the profile does not support, each with a
  short, honest note (e.g. "No story mentions Power BI"). Don't paper over gaps.
- notes: 1–3 sentences to the user on the main choices you made.
`;
  },
};
