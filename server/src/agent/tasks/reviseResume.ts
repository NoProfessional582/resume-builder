import { z } from 'zod';
import { MAX_SKILL_CHARS, MAX_SKILLS } from '../../resume/skills.ts';
import type { TailoredContent, TailorSettings } from '../../resume/tailored.ts';
import { styleGuide } from '../styleGuide.ts';
import type { TaskDef } from '../task.ts';
import { IMPORTANCE, type JobAnalysis } from './analyzeJob.ts';

export interface ReviseInput {
  mode: 'revise' | 'trim';
  /** revise: the user's request. trim: generated from the measured length. */
  instruction: string;
  job: { company: string; roleTitle: string; analysis: JobAnalysis };
  content: TailoredContent;
  /** The stories of each position, for checking facts. */
  stories: Record<number, { id: number; text: string }[]>;
  positionDescriptions: Record<number, string | null>;
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
        z.object({ text: z.string(), sourceStoryIds: z.array(z.number().int()), keywords: z.array(z.string()) }),
      ),
    }),
  ),
  gaps: z.array(z.object({ item: z.string(), importance: z.enum(IMPORTANCE), note: z.string() })),
  notes: z.string(),
});
export type ReviseOutput = z.infer<typeof output>;

function describeContent(input: ReviseInput): string {
  const c = input.content;
  const positions = c.positions
    .map((p) => {
      const stories = input.stories[p.positionId] ?? [];
      return `### P${p.positionId}: ${p.title}, ${p.organization}
Role overview: ${p.description ?? '(none)'}
Bullets:
${p.bullets.length ? p.bullets.map((b) => `- ${b.text} [sources: ${b.sourceStoryIds.map((s) => `S${s}`).join(', ') || 'none'}]`).join('\n') : '(none)'}
Source material for this position (facts must come from here):
Profile role description: ${input.positionDescriptions[p.positionId] ?? '(none)'}
${stories.map((s) => `- S${s.id}: ${s.text}`).join('\n') || '(no stories)'}`;
    })
    .join('\n\n');
  return `Summary:
${c.summary.join('\n\n')}

Skills:
${c.skills.map((g) => `${g.category ? `${g.category}: ` : ''}${g.items.join('; ')}`).join('\n')}

${positions}

Also on the résumé (not editable here): ${c.education.length} education item(s), ${c.certifications.length} certification(s)${
    c.entries.length ? `, ${c.entries.map((e) => `"${e.heading}"`).join(', ')}` : ''
  }.

Current gap notes:
${c.gaps.map((g) => `- [${g.importance}] ${g.item}: ${g.note}`).join('\n') || '(none)'}`;
}

const TRIM_GUIDE = `This is a length fix. Cut roughly the number of lines asked for, no more, in this order of
preference:
1. Tighten wordy bullets and overviews (shorter phrasing, same facts). A bullet that runs onto a
   third line wastes most of that line.
2. Remove role overviews from the oldest or least relevant positions.
3. Remove the least relevant bullets, starting with older and less relevant positions.
4. Shorten the summary.
Leave the skills as they are: they fill a fixed table, so cutting them saves no space. Keep every position. Keep bullets that carry required job keywords where possible. Never add facts.`;

export const reviseResumeTask: TaskDef<ReviseInput, ReviseOutput> = {
  name: 'revise_resume',
  minTimeoutSeconds: 900,
  input: z.any() as z.ZodType<ReviseInput>,
  output,
  buildPrompt: (input) => {
    const { analysis: a } = input.job;
    const keywords = IMPORTANCE.map((imp) => {
      const list = a.keywords.filter((k) => k.importance === imp).map((k) => k.term);
      return list.length ? `${imp}: ${list.join(', ')}` : '';
    })
      .filter(Boolean)
      .join('\n');
    return `You are revising a résumé that was tailored to a job. Change it as asked and return the full revised
content. Follow the user's style guide exactly. The source material listed under each position is
the only source of facts.

## Style guide
${styleGuide('common', 'resume', 'check')}

## The job
${input.job.roleTitle} at ${input.job.company}: ${a.roleSummary}
Keywords:
${keywords}

## The current résumé
${describeContent(input)}

## What to change
${input.instruction}
${input.mode === 'trim' ? `\n${TRIM_GUIDE}\n` : ''}
Bullets per position: between ${input.settings.minBullets} and ${input.settings.maxBullets}${
      input.mode === 'trim' ? ' (fewer is acceptable when needed to fit)' : ''
    }.
Role overviews: ${input.settings.includeDescriptions ? 'keep one per position unless trimming removes it.' : 'none; return null.'}

## What to return
The whole résumé after the change, in the same shape:
- summary: one paragraph.
- skillGroups: the skills section: at most ${MAX_SKILLS} skills, each at most ${MAX_SKILL_CHARS} characters including
  spaces (they fill a 3 × 3 table; longer ones are dropped).
- positions: one entry for every position (P ids), in the same order, with description (or null)
  and bullets. Each bullet lists sourceStoryIds (numbers after "S", only from that position) and the
  job keywords it uses (exact terms from the keyword list). Keep unchanged bullets exactly as they are.
- gaps: the gap notes, updated if the change affects them.
- notes: one or two sentences to the user on what you changed.
`;
  },
};
