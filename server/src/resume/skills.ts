import type { SkillGroup } from './content.ts';

/**
 * The template's skills table is 3 columns × 3 rows, so it holds 9 skills, and a skill longer than
 * 26 characters wraps inside its cell. Mirrored in web/src/tailoringTypes.ts.
 */
export const MAX_SKILLS = 9;
export const MAX_SKILL_CHARS = 26;

/**
 * Trims and drops empty skills, then drops any that are too long and keeps the first 9.
 * Returns the skills that were left out so the caller can tell the user.
 */
export function limitSkills(groups: SkillGroup[]): { skills: SkillGroup[]; dropped: string[] } {
  const dropped: string[] = [];
  let room = MAX_SKILLS;
  const skills = groups
    .map((g) => {
      const items: string[] = [];
      for (const raw of g.items) {
        const s = raw.trim();
        if (!s) continue;
        if (s.length > MAX_SKILL_CHARS || room === 0) dropped.push(s);
        else {
          items.push(s);
          room--;
        }
      }
      return { category: g.category?.trim() || null, items };
    })
    .filter((g) => g.items.length);
  return { skills, dropped };
}

/** A sentence for the agent's notes about skills that didn't fit, or '' when none were dropped. */
export function droppedSkillsNote(dropped: string[]): string {
  if (!dropped.length) return '';
  return ` Left out of the skills table (over ${MAX_SKILL_CHARS} characters or past ${MAX_SKILLS} skills): ${dropped.join('; ')}.`;
}
