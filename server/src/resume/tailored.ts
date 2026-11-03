import { z } from 'zod';
import type { CertificationItem, EducationItem, EntrySection, ResumeContent, SkillGroup } from './content.ts';

export const tailorSettingsSchema = z
  .object({
    targetPages: z.number().int().min(1).max(3).default(2),
    minBullets: z.number().int().min(0).max(8).default(1),
    maxBullets: z.number().int().min(1).max(10).default(4),
    includeDescriptions: z.boolean().default(true),
    instructions: z.string().trim().max(4000).default(''),
    /** After writing, build the .docx and trim until it fits the page target. */
    autoFit: z.boolean().default(true),
  })
  .refine((s) => s.minBullets <= s.maxBullets, { message: 'Minimum bullets is above the maximum', path: ['minBullets'] });
export type TailorSettings = z.infer<typeof tailorSettingsSchema>;

export interface TailoredBullet {
  text: string;
  /** Stories this bullet was written from (must belong to the same position). */
  sourceStoryIds: number[];
  /** Job keyword terms the bullet uses. */
  keywords: string[];
}

export interface TailoredPosition {
  positionId: number;
  organization: string;
  title: string;
  location: string | null;
  start: string | null;
  end: string | null;
  description: string | null;
  bullets: TailoredBullet[];
}

export interface Gap {
  item: string;
  importance: 'required' | 'preferred' | 'nice_to_have';
  note: string;
}

/** Everything printed on a tailored résumé, plus the agent's gap report and notes. */
export interface TailoredContent {
  summary: string[];
  skills: SkillGroup[];
  positions: TailoredPosition[];
  education: EducationItem[];
  certifications: CertificationItem[];
  entries: EntrySection[];
  gaps: Gap[];
  notes: string;
}

const nullable = z.string().nullable();

/** Validates content the user edited in the preview. */
export const tailoredContentSchema = z.object({
  summary: z.array(z.string()).transform((a) => a.map((s) => s.trim()).filter(Boolean)),
  skills: z
    .array(z.object({ category: nullable, items: z.array(z.string()) }))
    .transform((groups) =>
      groups.map((g) => ({ ...g, items: g.items.map((s) => s.trim()).filter(Boolean) })).filter((g) => g.items.length),
    ),
  positions: z.array(
    z.object({
      positionId: z.number().int(),
      organization: z.string(),
      title: z.string(),
      location: nullable,
      start: nullable,
      end: nullable,
      description: nullable.transform((s) => s?.trim() || null),
      bullets: z
        .array(z.object({ text: z.string(), sourceStoryIds: z.array(z.number().int()), keywords: z.array(z.string()) }))
        .transform((bs) => bs.map((b) => ({ ...b, text: b.text.trim() })).filter((b) => b.text)),
    }),
  ),
  education: z.array(
    z.object({ degree: z.string(), school: nullable, location: nullable, dates: nullable, details: nullable }),
  ),
  certifications: z.array(z.object({ name: z.string(), issuer: nullable, date: nullable })),
  entries: z.array(z.object({ heading: z.string(), items: z.array(z.string()) })),
  gaps: z.array(
    z.object({ item: z.string(), importance: z.enum(['required', 'preferred', 'nice_to_have']), note: z.string() }),
  ),
  notes: z.string(),
});

/** What the renderer needs from a tailored résumé. */
export function toResumeContent(t: TailoredContent): ResumeContent {
  return {
    summary: t.summary,
    skills: t.skills,
    positions: t.positions.map((p) => ({
      organization: p.organization,
      title: p.title,
      location: p.location,
      start: p.start,
      end: p.end,
      description: p.description,
      bullets: p.bullets.map((b) => b.text),
    })),
    education: t.education,
    certifications: t.certifications,
    entries: t.entries,
  };
}
