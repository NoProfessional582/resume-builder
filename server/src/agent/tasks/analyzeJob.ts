import { z } from 'zod';
import type { TaskDef } from '../task.ts';

export const KEYWORD_CATEGORIES = ['hard_skill', 'tool', 'domain', 'certification', 'soft_skill', 'methodology'] as const;
export const IMPORTANCE = ['required', 'preferred', 'nice_to_have'] as const;
export const ROLE_TYPES = ['technical', 'leadership', 'program', 'customer', 'other'] as const;

/** The analysis shape the agent returns (kept free of constraints strict JSON Schema may reject). */
export const jobAnalysisSchema = z.object({
  roleSummary: z.string(),
  seniority: z.string(),
  roleTypes: z.array(z.enum(ROLE_TYPES)),
  keywords: z.array(
    z.object({
      term: z.string(),
      category: z.enum(KEYWORD_CATEGORIES),
      importance: z.enum(IMPORTANCE),
      synonyms: z.array(z.string()),
      evidence: z.string(),
    }),
  ),
  keyExperiences: z.array(
    z.object({
      statement: z.string(),
      importance: z.enum(IMPORTANCE),
      keywords: z.array(z.string()),
    }),
  ),
  responsibilities: z.array(z.string()),
  notes: z.array(z.string()),
  expectedQuestions: z.array(z.object({question:z.string(), competency:z.string(), rationale:z.string(), evidence:z.string()})),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

const cleanList = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);

/** The same shape, validated and tidied when the user saves edits. */
export const jobAnalysisEditSchema = jobAnalysisSchema
  .extend({
    expectedQuestions: jobAnalysisSchema.shape.expectedQuestions.default([]),
    keywords: z.array(
      jobAnalysisSchema.shape.keywords.element.extend({ term: z.string().trim().min(1, 'A keyword is empty') }),
    ),
    keyExperiences: z.array(
      jobAnalysisSchema.shape.keyExperiences.element.extend({
        statement: z.string().trim().min(1, 'A key experience is empty'),
      }),
    ),
  })
  .transform((a) => ({
    ...a,
    roleSummary: a.roleSummary.trim(),
    seniority: a.seniority.trim(),
    keywords: a.keywords.map((k) => ({ ...k, synonyms: cleanList(k.synonyms), evidence: k.evidence.trim() })),
    keyExperiences: a.keyExperiences.map((e) => ({ ...e, keywords: cleanList(e.keywords) })),
    responsibilities: cleanList(a.responsibilities),
    notes: cleanList(a.notes),
  }));

export interface AnalyzeJobInput {
  company: string;
  roleTitle: string;
  jobDescription: string;
  requiredExperience: string | null;
  preferredExperience: string | null;
  notes: string | null;
}

export const analyzeJobTask: TaskDef<AnalyzeJobInput, JobAnalysis> = {
  name: 'analyze_job',
  minTimeoutSeconds: 300,
  input: z.any() as z.ZodType<AnalyzeJobInput>,
  output: jobAnalysisSchema,
  buildPrompt: (job) => `Analyze this job posting so the app can tailor the user's résumé to it. Extract only what
the posting says or clearly implies. Don't add requirements that aren't there, and don't judge the
user's fit (that happens later).

## Job
Company: ${job.company}
Role: ${job.roleTitle}

Job description:
${job.jobDescription}
${job.requiredExperience ? `\nRequired experience (as listed in the posting):\n${job.requiredExperience}\n` : ''}${
    job.preferredExperience ? `\nPreferred experience (as listed in the posting):\n${job.preferredExperience}\n` : ''
  }${job.notes ? `\nUser's notes about this job (context, not part of the posting):\n${job.notes}\n` : ''}
## Output
- roleSummary: 2–3 plain sentences: what the role is for, who it serves, and what success looks like.
- seniority: a short phrase, e.g. "Mid-level individual contributor" or "Senior manager (manages managers)".
- roleTypes: one or more of technical, leadership, program, customer, other, by what the role emphasizes
  (technical = systems and technical problem-solving; leadership = managing people and organizations;
  program = planning, delivery and cross-functional coordination; customer = relationships, adoption
  and customer outcomes).
- keywords: about 15–40 terms a recruiter or applicant tracking system would look for.
  - term: the posting's exact wording.
  - synonyms: up to 3 variants the same thing might appear as in a résumé (abbreviation, spelled-out
    form, common alternate wording). Empty if none.
  - category: hard_skill, tool, domain, certification, soft_skill or methodology.
  - importance: required (listed as required, minimum or must-have), preferred (preferred, bonus,
    plus, nice to have), or nice_to_have (mentioned in duties or culture but not as a qualification).
  - evidence: a short quote (at most ~15 words) from the posting showing where it appears.
  Don't list generic filler ("team player", "fast-paced") unless the posting stresses it.
- keyExperiences: 4–10 statements of experience the employer wants to see demonstrated, written as
  experience (e.g. "Led enterprise customer adoption programs"), each with importance and the related
  keyword terms. Years of experience, degrees and clearances are not key experiences; put them in notes.
- responsibilities: the main duties as short phrases, at most 10.
- notes: practical facts the posting states: years of experience, degree, clearance, location or
  remote policy, travel, salary range. Only list facts that are stated; never note what is missing.
  Empty if none.
- expectedQuestions: 6–10 plausible behavioral interview questions inferred from this posting, not claims about what the employer will actually ask. Each has question, competency, rationale (why preparation matters), and evidence (a short exact posting quote). Cover the most important required experiences and responsibilities. Questions should invite concrete examples and reflection/lessons.
`,
};
