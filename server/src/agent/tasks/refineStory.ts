import { z } from 'zod';
import { styleGuide } from '../styleGuide.ts';
import type { TaskDef } from '../task.ts';

export const COVERAGE_KEYS = ['context', 'action', 'metrics', 'impact', 'results', 'lessons'] as const;
const level = z.enum(['present', 'partial', 'missing']);

export interface RefineStoryInput {
  qualificationContext?: string;
  position: {
    title: string;
    organization: string;
    location: string | null;
    dates: string;
    description: string | null;
  };
  otherStories: string[];
  originalText: string;
  currentDraft: string;
  currentLessons: string | null;
  /** True when the user edited the draft or lessons by hand since the last turn. */
  editedByUser: boolean;
  transcript: { role: 'agent' | 'user'; text: string }[];
}

const output = z.object({
  draft: z.string(),
  lessons: z.string().nullable(),
  note: z.string(),
  questions: z.array(z.string()),
  coverage: z.object({
    context: level,
    action: level,
    metrics: level,
    impact: level,
    results: level,
    lessons: level,
  }),
  done: z.boolean(),
});
export type RefineStoryOutput = z.infer<typeof output>;

export const refineStoryTask: TaskDef<RefineStoryInput, RefineStoryOutput> = {
  name: 'refine_story',
  minTimeoutSeconds: 240,
  input: z.any() as z.ZodType<RefineStoryInput>,
  output,
  buildPrompt: (input) => {
    const { position: p } = input;
    const others = input.otherStories.length
      ? input.otherStories.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '(none)';
    const transcript = input.transcript.length
      ? input.transcript.map((m) => `${m.role === 'agent' ? 'You asked' : 'User answered'}: ${m.text}`).join('\n\n')
      : '(this is the first turn)';

    return `You are helping the user strengthen one "story" from their work history. Stories are the raw
material the app later turns into tailored résumé bullets. Follow the user's style guide below.

${input.qualificationContext ? `## Conversation focus
${input.qualificationContext}
Focus this multi-turn conversation on real evidence for the requested topic. Ask one focused question at a time about personal role, actions, scope and results. Never treat the requirement as a fact about the user. Never invent experience, numbers or credentials. If the user lacks this experience or wants to skip, acknowledge that and stop probing; preserve only confirmed facts. Keep unrelated existing story facts.
` : ""}
## Style guide
${styleGuide('common', 'stories')}

## Position
${p.title} at ${p.organization}${p.location ? ` (${p.location})` : ''}, ${p.dates || 'dates unknown'}
${p.description ? `Description: ${p.description}` : ''}

## Other stories for this position (context only; don't merge them into this one)
${others}

## The story
Original text:
${input.originalText}

Current draft:
${input.currentDraft}

Current lessons learned: ${input.currentLessons || '(none yet)'}
${input.editedByUser ? '\nThe user edited the draft and/or lessons by hand since your last turn. Keep their edits.\n' : ''}
## Conversation so far
${transcript}

## Your turn
1. draft: the story text after a light edit per the style guide, with every fact from the user's
   answers worked in. No lessons learned in the draft; if the current draft contains a lesson,
   move it to the lessons field.
2. lessons: the user's lessons learned for this story, from what they said (keep their meaning and
   wording; tidy grammar). Keep existing lessons unless the user changed them. null if there are none.
3. coverage: rate the draft and lessons on context, action (what the user personally did and their
   role), metrics, impact, results and lessons as present, partial or missing.
4. questions: at most 3, following the style guide's question order. Empty when nothing important is
   missing.
5. note: one or two plain sentences telling the user what you changed this turn.
6. done: true when there's nothing important left to ask (questions must then be empty).
`;
  },
};
