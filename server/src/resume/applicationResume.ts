import { db } from '../db.ts';
import { getApplication } from './applications.ts';
import { getImportView } from './imports.ts';
import { tailoredContentSchema, tailorSettingsSchema } from './tailored.ts';
import { getTailored } from './tailoring.ts';

/** Copies parsed content into an application without changing the template or profile. */
export function attachApplicationResume(applicationId: number, importId: number) {
  getApplication(applicationId);
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
    notes: 'Uploaded résumé. Source stories have not been linked to your work history.',
  });
  const now = Date.now();
  if (!content.summary.length && !content.positions.length && !content.skills.length &&
      !content.education.length && !content.certifications.length && !content.entries.length) {
    throw Object.assign(new Error('No résumé content was extracted. Try another document.'), { statusCode: 422 });
  }
  const json = JSON.stringify(content);
  const result = db.prepare(`INSERT INTO tailored_resume
    (application_id, status, settings, content, ai_content, content_updated_at, created_at, label)
    VALUES (?, 'ready', ?, ?, ?, ?, ?, ?)`).run(
    applicationId, JSON.stringify(tailorSettingsSchema.parse({ autoFit: false })), json, json, now, now,
    `Uploaded · ${imported.filename}`,
  );
  return getTailored(Number(result.lastInsertRowid));
}
