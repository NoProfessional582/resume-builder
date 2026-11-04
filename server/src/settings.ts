import { z } from 'zod';
import { db } from './db.ts';

export const settingsSchema = z.object({
  displayTimezone: z.string().refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
    catch { return false; }
  }, 'Enter a valid IANA timezone').default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  /** Path to codex.js or codex.exe. Empty = find the global npm install automatically. */
  codexPath: z.string().trim().default(''),
  /** Model passed with -m. Empty = Codex default. */
  model: z.string().trim().default(''),
  reasoningEffort: z.enum(['', 'minimal', 'low', 'medium', 'high', 'xhigh']).default(''),
  timeoutSeconds: z.number().int().min(15).max(1800).default(180),
  /** Load ~/.codex/config.toml (MCP servers, profiles, etc). Off keeps runs predictable. */
  useUserConfig: z.boolean().default(false),
});

export type Settings = z.infer<typeof settingsSchema>;

export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const raw = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  // Ignore stored values that no longer validate rather than failing every request.
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export function updateSettings(patch: unknown): Settings {
  const next = settingsSchema.parse({ ...getSettings(), ...(patch as object) });
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const [key, value] of Object.entries(next)) upsert.run(key, JSON.stringify(value));
  return next;
}
