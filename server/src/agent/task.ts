import type { z } from 'zod';

/** One kind of agent job: how to validate its input, build its prompt, and check its output. */
export interface TaskDef<I, O> {
  name: string;
  input: z.ZodType<I>;
  /** Shape of the final JSON. Use `.nullable()` rather than `.optional()` (strict schema rules). */
  output: z.ZodType<O>;
  buildPrompt(input: I): string;
}
