import { db } from '../db.ts';
import { getApplication } from './applications.ts';
import { getImportView } from './imports.ts';
import { tailoredContentSchema, tailorSettingsSchema } from './tailored.ts';
import { getTailored } from './tailoring.ts';
import { applyStoryMatches, matchResumeContent } from './storyMatching.ts';

const pending = new Map<string, Promise<ReturnType<typeof getTailored>>>();

/** Keep navigation or retries from launching duplicate matching runs. */
export async function attachApplicationResume(applicationId: number, importId: number) {
  const key = `${applicationId}:${importId}`;
  const current = pending.get(key);
  if (current) return current;
  const work = attach(applicationId, importId);
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

/** Copies parsed content into an application without changing the template or profile. */
async function attach(applicationId: number, importId: number) {
  getApplication(applicationId);
  const existing = db.prepare('SELECT id FROM tailored_resume WHERE application_id = ? AND source_import_id = ?')
    .get(applicationId, importId) as { id: number } | undefined;
  if (existing) return getTailored(existing.id);
  const imported = getImportView(importId);
  if (imported.status !== 'ready' || !imported.content) {
    throw Object.assign(new Error('Wait for the résumé to finish parsing before saving it.'), { statusCode: 409 });
  }
  const content = tailoredContentSchema.parse({
    ...imported.content,
    positions: imported.content.positions.map((p, index) => ({
      ...p,
      // Uploaded roles have no corresponding profile stories.
      positionId: -(index + 1),
      bullets: p.bullets.map(text => ({ text, sourceStoryIds: [], keywords: [] })),
    })),
    gaps: [],
    notes: 'Uploaded résumé. Supporting stories were matched automatically during upload; unmatched claims still need review.',
  });
  const now = Date.now();
  if (!content.summary.length && !content.positions.length && !content.skills.length &&
      !content.education.length && !content.certifications.length && !content.entries.length) {
    throw Object.assign(new Error('No résumé content was extracted. Try another document.'), { statusCode: 422 });
  }
  const matched = applyStoryMatches(content, await matchResumeContent(content));
  // The application may have been removed while the matching agent was working.
  getApplication(applicationId);
  const json = JSON.stringify(matched);
  const result = db.prepare(`INSERT INTO tailored_resume
    (application_id, status, settings, content, ai_content, content_updated_at, created_at, label, source_import_id)
    VALUES (?, 'ready', ?, ?, ?, ?, ?, ?, ?)`).run(
    applicationId, JSON.stringify(tailorSettingsSchema.parse({ autoFit: false })), json, json, now, now,
    `Uploaded · ${imported.filename}`, importId,
  );
  return getTailored(Number(result.lastInsertRowid));
}
