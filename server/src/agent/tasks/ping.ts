import { z } from 'zod';
import type { TaskDef } from '../task.ts';

/** Expected value of `agentProfile`; proves Codex loaded agent-workspace/AGENTS.md. */
export const AGENT_PROFILE = 'resume-builder-v1';

export const pingTask: TaskDef<Record<string, never>, PingOutput> = {
  name: 'ping',
  input: z.object({}).strict() as z.ZodType<Record<string, never>>,
  output: z.object({
    status: z.enum(['ok']),
    agentProfile: z.string(),
    message: z.string(),
  }),
  buildPrompt: () =>
    [
      'This is a connectivity check from the Resume Builder app.',
      'Respond with:',
      '- status: "ok"',
      '- agentProfile: the agent profile name stated in your AGENTS.md instructions, or "none" if you have no such instructions',
      "- message: one sentence confirming you're ready to help with resume writing",
    ].join('\n'),
};

export interface PingOutput {
  status: 'ok';
  agentProfile: string;
  message: string;
}
