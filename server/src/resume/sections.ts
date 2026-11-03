import { z } from 'zod';
import { db, transaction } from '../db.ts';
import { NotFoundError } from './positions.ts';

export const SECTION_KINDS = ['summary', 'skills', 'education', 'certifications', 'entries'] as const;
export type ProfileSectionKind = (typeof SECTION_KINDS)[number];

const nullableText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

/** Item shapes per section kind (stored as JSON in section_item.data). */
export const ITEM_SCHEMAS = {
  summary: z.object({ text: z.string().trim().min(1) }),
  skills: z.object({
    category: nullableText,
    items: z.array(z.string().trim().min(1)).min(1, 'Add at least one skill'),
  }),
  education: z.object({
    degree: z.string().trim().min(1, 'Degree or program is required'),
    school: nullableText,
    location: nullableText,
    dates: nullableText,
    details: nullableText,
  }),
  certifications: z.object({
    name: z.string().trim().min(1, 'Name is required'),
    issuer: nullableText,
    date: nullableText,
  }),
  entries: z.object({ text: z.string().trim().min(1) }),
} satisfies Record<ProfileSectionKind, z.ZodType>;

export interface ProfileSection {
  id: number;
  kind: ProfileSectionKind;
  heading: string | null;
  items: unknown[];
}

export function listSections(): ProfileSection[] {
  const sections = db.prepare('SELECT id, kind, heading FROM section ORDER BY sort_order, id').all() as {
    id: number;
    kind: ProfileSectionKind;
    heading: string | null;
  }[];
  const itemsFor = db.prepare('SELECT data FROM section_item WHERE section_id = ? ORDER BY sort_order, id');
  return sections.map((s) => ({
    ...s,
    items: (itemsFor.all(s.id) as { data: string }[]).map((r) => JSON.parse(r.data)),
  }));
}

function requireSection(id: number): { id: number; kind: ProfileSectionKind } {
  const row = db.prepare('SELECT id, kind FROM section WHERE id = ?').get(id) as
    | { id: number; kind: ProfileSectionKind }
    | undefined;
  if (!row) throw new NotFoundError('Section not found');
  return row;
}

export const sectionInput = z.object({
  kind: z.enum(SECTION_KINDS),
  heading: nullableText,
});

export function createSection(input: z.infer<typeof sectionInput>): number {
  const { max } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM section').get() as { max: number };
  const { lastInsertRowid } = db
    .prepare('INSERT INTO section (kind, heading, sort_order) VALUES (?, ?, ?)')
    .run(input.kind, input.heading, max + 1);
  return Number(lastInsertRowid);
}

/** Saves a section's heading and its full list of items in one go. */
export function saveSection(id: number, heading: string | null, rawItems: unknown[]): ProfileSection {
  const section = requireSection(id);
  const schema = ITEM_SCHEMAS[section.kind];
  const items = rawItems.map((item, i) => {
    const parsed = schema.safeParse(item);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      throw Object.assign(new Error(`Item ${i + 1}: ${message}`), { statusCode: 400 });
    }
    return parsed.data;
  });
  transaction(() => {
    db.prepare('UPDATE section SET heading = ? WHERE id = ?').run(heading, id);
    db.prepare('DELETE FROM section_item WHERE section_id = ?').run(id);
    const insert = db.prepare('INSERT INTO section_item (section_id, data, sort_order) VALUES (?, ?, ?)');
    items.forEach((item, i) => insert.run(id, JSON.stringify(item), i));
  });
  return listSections().find((s) => s.id === id)!;
}

export function deleteSection(id: number): void {
  requireSection(id);
  db.prepare('DELETE FROM section WHERE id = ?').run(id);
}

export function reorderSections(ids: number[]): void {
  transaction(() => {
    const update = db.prepare('UPDATE section SET sort_order = ? WHERE id = ?');
    ids.forEach((id, i) => update.run(i, id));
  });
}
