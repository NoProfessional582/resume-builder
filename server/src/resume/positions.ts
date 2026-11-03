import { z } from 'zod';
import { db, transaction } from '../db.ts';

/** Current roles first, then most recent end date, then most recent start. */
export const POSITION_ORDER = `(end_date IS NULL) DESC, end_date DESC, start_date DESC, sort_order, id`;

export class NotFoundError extends Error {
  statusCode = 404;
}

const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));
const yearMonth = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Use YYYY-MM or YYYY')
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const positionInput = z
  .object({
    organization: z.string().trim().min(1, 'Organization is required'),
    title: z.string().trim().min(1, 'Title is required'),
    location: optionalText,
    description: optionalText,
    start: yearMonth,
    end: yearMonth,
  })
  .refine((p) => !p.start || !p.end || p.end >= p.start, { message: 'End date is before the start date', path: ['end'] });
export type PositionInput = z.infer<typeof positionInput>;

export const storyText = z.string().trim().min(1, 'A story needs some text').max(20000);

export interface Story {
  id: number;
  positionId: number;
  text: string;
  /** Lessons learned: kept for interview prep, never printed on the résumé. */
  lessons: string | null;
  status: 'raw' | 'refined';
  sortOrder: number;
  versionCount: number;
  updatedAt: number;
  /** An unfinished refinement chat for this story, if any. */
  openSessionId: number | null;
}

export interface Position {
  id: number;
  organization: string;
  title: string;
  location: string | null;
  description: string | null;
  start: string | null;
  end: string | null;
  stories: Story[];
}

export interface StoryVersion {
  id: number;
  text: string;
  source: 'user' | 'import' | 'agent';
  createdAt: number;
}

interface PositionRow {
  id: number;
  organization: string;
  title: string;
  location: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface StoryRow {
  id: number;
  position_id: number;
  current_text: string;
  lessons: string | null;
  status: 'raw' | 'refined';
  sort_order: number;
  updated_at: number;
  version_count: number;
  open_session_id?: number | null;
}

const toStory = (r: StoryRow): Story => ({
  id: r.id,
  positionId: r.position_id,
  text: r.current_text,
  lessons: r.lessons,
  status: r.status,
  sortOrder: r.sort_order,
  versionCount: r.version_count,
  updatedAt: r.updated_at,
  openSessionId: r.open_session_id ?? null,
});

export function listPositions(): Position[] {
  const positions = db.prepare(`SELECT * FROM position ORDER BY ${POSITION_ORDER}`).all() as unknown as PositionRow[];
  const stories = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM story_version v WHERE v.story_id = s.id) AS version_count,
         (SELECT r.id FROM refine_session r WHERE r.story_id = s.id AND r.status = 'open' ORDER BY r.id DESC LIMIT 1)
           AS open_session_id
       FROM story s ORDER BY s.sort_order, s.id`,
    )
    .all() as unknown as StoryRow[];
  return positions.map((p) => ({
    id: p.id,
    organization: p.organization,
    title: p.title,
    location: p.location,
    description: p.description,
    start: p.start_date,
    end: p.end_date,
    stories: stories.filter((s) => s.position_id === p.id).map(toStory),
  }));
}

function requirePosition(id: number): void {
  if (!db.prepare('SELECT 1 FROM position WHERE id = ?').get(id)) throw new NotFoundError('Position not found');
}

function requireStory(id: number): StoryRow {
  const row = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM story_version v WHERE v.story_id = s.id) AS version_count FROM story s WHERE id = ?`,
    )
    .get(id) as StoryRow | undefined;
  if (!row) throw new NotFoundError('Story not found');
  return row;
}

export function createPosition(input: PositionInput): number {
  const now = Date.now();
  const { max } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM position').get() as { max: number };
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO position (organization, title, location, description, start_date, end_date, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.organization, input.title, input.location, input.description, input.start, input.end, max + 1, now, now);
  return Number(lastInsertRowid);
}

export function updatePosition(id: number, input: PositionInput): void {
  requirePosition(id);
  db.prepare(
    `UPDATE position SET organization = ?, title = ?, location = ?, description = ?, start_date = ?, end_date = ?, updated_at = ?
     WHERE id = ?`,
  ).run(input.organization, input.title, input.location, input.description, input.start, input.end, Date.now(), id);
}

export function deletePosition(id: number): void {
  requirePosition(id);
  db.prepare('DELETE FROM position WHERE id = ?').run(id); // stories and versions cascade
}

export function createStory(positionId: number, text: string): Story {
  requirePosition(positionId);
  const now = Date.now();
  return transaction(() => {
    const { max } = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM story WHERE position_id = ?')
      .get(positionId) as { max: number };
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO story (position_id, current_text, status, sort_order, created_at, updated_at) VALUES (?, ?, 'raw', ?, ?, ?)`,
      )
      .run(positionId, text, max + 1, now, now);
    const id = Number(lastInsertRowid);
    addVersion(id, text, 'user');
    return toStory(requireStory(id));
  });
}

function addVersion(storyId: number, text: string, source: StoryVersion['source']): void {
  db.prepare('INSERT INTO story_version (story_id, text, source, created_at) VALUES (?, ?, ?, ?)').run(
    storyId,
    text,
    source,
    Date.now(),
  );
}

/** Saves new story text. Each change is kept as a version; unchanged text is a no-op. */
export function updateStoryText(id: number, text: string, source: StoryVersion['source'] = 'user'): Story {
  const row = requireStory(id);
  if (row.current_text === text) return toStory(row);
  return transaction(() => {
    db.prepare('UPDATE story SET current_text = ?, updated_at = ? WHERE id = ?').run(text, Date.now(), id);
    addVersion(id, text, source);
    return toStory(requireStory(id));
  });
}

/** Sets a story's lessons learned (empty → none). Not versioned. */
export function updateStoryLessons(id: number, lessons: string | null): Story {
  requireStory(id);
  db.prepare('UPDATE story SET lessons = ?, updated_at = ? WHERE id = ?').run(lessons?.trim() || null, Date.now(), id);
  return toStory(requireStory(id));
}

export function deleteStory(id: number): void {
  requireStory(id);
  db.prepare('DELETE FROM story WHERE id = ?').run(id);
}

/** Sets the order of a position's stories. `ids` must be exactly that position's stories. */
export function reorderStories(positionId: number, ids: number[]): void {
  requirePosition(positionId);
  const current = (db.prepare('SELECT id FROM story WHERE position_id = ?').all(positionId) as { id: number }[]).map(
    (r) => r.id,
  );
  if (current.length !== ids.length || !current.every((id) => ids.includes(id))) {
    throw Object.assign(new Error("The list doesn't match this position's stories."), { statusCode: 400 });
  }
  transaction(() => {
    const update = db.prepare('UPDATE story SET sort_order = ? WHERE id = ?');
    ids.forEach((id, i) => update.run(i, id));
  });
}

/** Moves a story to another position (appended at the end). */
export function moveStory(id: number, positionId: number): Story {
  const row = requireStory(id);
  requirePosition(positionId);
  if (row.position_id === positionId) return toStory(row);
  const { max } = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM story WHERE position_id = ?')
    .get(positionId) as { max: number };
  db.prepare('UPDATE story SET position_id = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(
    positionId,
    max + 1,
    Date.now(),
    id,
  );
  return toStory(requireStory(id));
}

export function listVersions(storyId: number): StoryVersion[] {
  requireStory(storyId);
  return (
    db
      .prepare('SELECT id, text, source, created_at FROM story_version WHERE story_id = ? ORDER BY created_at DESC, id DESC')
      .all(storyId) as { id: number; text: string; source: StoryVersion['source']; created_at: number }[]
  ).map((v) => ({ id: v.id, text: v.text, source: v.source, createdAt: v.created_at }));
}

/** Makes an earlier version current again (recorded as a new version, so nothing is lost). */
export function restoreVersion(storyId: number, versionId: number): Story {
  const version = db.prepare('SELECT text FROM story_version WHERE id = ? AND story_id = ?').get(versionId, storyId) as
    | { text: string }
    | undefined;
  if (!version) throw new NotFoundError('Version not found');
  return updateStoryText(storyId, version.text, 'user');
}
