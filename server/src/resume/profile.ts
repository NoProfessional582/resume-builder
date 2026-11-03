import { db, transaction } from '../db.ts';
import type { TemplateLayout } from '../docx/layout.ts';
import { emptyContent, normalizeHeading, type ResumeContent } from './content.ts';
import { POSITION_ORDER } from './positions.ts';

export interface ProfileCounts {
  positions: number;
  stories: number;
  sections: number;
}

export function profileCounts(): ProfileCounts {
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { positions: count('position'), stories: count('story'), sections: count('section') };
}

/**
 * Replaces all work history and sections with imported content. Bullets become stories,
 * each with an "import" version so the original wording is kept.
 */
export function replaceProfile(content: ResumeContent, layout: TemplateLayout): void {
  const now = Date.now();
  transaction(() => {
    db.exec('DELETE FROM story_version; DELETE FROM story; DELETE FROM position; DELETE FROM section_item; DELETE FROM section;');

    const insertPosition = db.prepare(
      `INSERT INTO position (organization, title, location, description, start_date, end_date, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertStory = db.prepare(
      `INSERT INTO story (position_id, current_text, status, sort_order, created_at, updated_at) VALUES (?, ?, 'raw', ?, ?, ?)`,
    );
    const insertVersion = db.prepare(
      `INSERT INTO story_version (story_id, text, source, created_at) VALUES (?, ?, 'import', ?)`,
    );
    content.positions.forEach((p, i) => {
      const { lastInsertRowid: positionId } = insertPosition.run(
        p.organization, p.title, p.location, p.description, p.start, p.end, i, now, now,
      );
      p.bullets.forEach((text, j) => {
        const { lastInsertRowid: storyId } = insertStory.run(positionId, text, j, now, now);
        insertVersion.run(storyId, text, now);
      });
    });

    const insertSection = db.prepare('INSERT INTO section (kind, heading, sort_order) VALUES (?, ?, ?)');
    const insertItem = db.prepare('INSERT INTO section_item (section_id, data, sort_order) VALUES (?, ?, ?)');
    let order = 0;
    for (const s of layout.sections) {
      let items: unknown[] = [];
      if (s.kind === 'experience') continue;
      if (s.kind === 'summary') items = content.summary.map((text) => ({ text }));
      if (s.kind === 'skills') items = content.skills;
      if (s.kind === 'education') items = content.education;
      if (s.kind === 'certifications') items = content.certifications;
      if (s.kind === 'entries') {
        const entry = content.entries.find((e) => normalizeHeading(e.heading) === normalizeHeading(s.heading));
        items = (entry?.items ?? []).map((text) => ({ text }));
      }
      const { lastInsertRowid: sectionId } = insertSection.run(s.kind, s.heading, order++);
      items.forEach((item, j) => insertItem.run(sectionId, JSON.stringify(item), j));
    }
  });
}

/** The current profile as resume content (all positions, current story text). */
export function loadProfileContent(): ResumeContent {
  const content = emptyContent();
  const positions = db.prepare(`SELECT * FROM position ORDER BY ${POSITION_ORDER}`).all() as {
    id: number;
    organization: string;
    title: string;
    location: string | null;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
  }[];
  const storiesFor = db.prepare('SELECT current_text FROM story WHERE position_id = ? ORDER BY sort_order, id');
  for (const p of positions) {
    content.positions.push({
      organization: p.organization,
      title: p.title,
      location: p.location,
      start: p.start_date,
      end: p.end_date,
      description: p.description,
      bullets: (storiesFor.all(p.id) as { current_text: string }[]).map((s) => s.current_text),
    });
  }

  const sections = db.prepare('SELECT * FROM section ORDER BY sort_order, id').all() as {
    id: number;
    kind: string;
    heading: string | null;
  }[];
  const itemsFor = db.prepare('SELECT data FROM section_item WHERE section_id = ? ORDER BY sort_order, id');
  for (const s of sections) {
    const items = (itemsFor.all(s.id) as { data: string }[]).map((r) => JSON.parse(r.data));
    if (s.kind === 'summary') content.summary.push(...items.map((i) => i.text));
    if (s.kind === 'skills') content.skills.push(...items);
    if (s.kind === 'education') content.education.push(...items);
    if (s.kind === 'certifications') content.certifications.push(...items);
    if (s.kind === 'entries') content.entries.push({ heading: s.heading ?? '', items: items.map((i) => i.text) });
  }
  return content;
}
