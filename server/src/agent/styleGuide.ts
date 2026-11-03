import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.ts';

/** The user's writing rules. Edit agent-workspace/STYLE_GUIDE.md; changes apply to the next prompt. */
export const STYLE_GUIDE_FILE = resolve(config.agentWorkspace, 'STYLE_GUIDE.md');

export type StylePart = 'common' | 'stories' | 'resume' | 'check';

/** Each part is a top-level "# Heading" in the file; matched by how the heading starts. */
const HEADINGS: Record<StylePart, string> = {
  common: 'rules for all writing',
  stories: 'stories',
  resume: 'résumé content',
  check: 'final quality check',
};

/** Returns the requested parts of the style guide, in the order given. */
export function styleGuide(...parts: StylePart[]): string {
  const text = readFileSync(STYLE_GUIDE_FILE, 'utf8');
  const sections = text
    .split(/^(?=# )/m)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('# '));
  const picked = parts.map((part) => {
    const section = sections.find((s) => s.slice(2).trim().toLowerCase().startsWith(HEADINGS[part]));
    if (!section) throw new Error(`STYLE_GUIDE.md has no "# ${HEADINGS[part]}" section.`);
    return section;
  });
  // Demote headings one level so they nest under the prompt's own "## Style guide" heading.
  return picked.join('\n\n').replace(/^(#+) /gm, '#$1 ');
}
