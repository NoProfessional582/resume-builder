import { z } from 'zod';
import type { BlockInfo } from '../../docx/blocks.ts';
import type { ResumeAnalysis } from '../../docx/layout.ts';
import { FIELD_NAMES, ROLE_FIELDS, ROLES, SECTION_KINDS } from '../../docx/roles.ts';
import { DATE_STYLES } from '../../resume/dates.ts';
import type { TaskDef } from '../task.ts';

export interface ImportResumeInput {
  blocks: BlockInfo[];
}

const output = z.object({
  sections: z.array(
    z.object({
      key: z.string(),
      kind: z.enum(SECTION_KINDS),
      headingBlock: z.number().int().nullable(),
    }),
  ),
  blocks: z.array(
    z.object({
      i: z.number().int(),
      role: z.enum(ROLES),
      section: z.string(),
      pattern: z.string().nullable(),
      fields: z.array(z.object({ name: z.enum(FIELD_NAMES), value: z.string() })),
    }),
  ),
  dates: z.object({
    style: z.enum(DATE_STYLES),
    separator: z.string(),
    presentLabel: z.string(),
  }),
  notes: z.array(z.string()),
});

const ROLE_HELP: Record<string, string> = {
  section_heading: 'a section title, e.g. "PROFESSIONAL EXPERIENCE"',
  summary_text: 'a summary / profile paragraph',
  skills_table: 'a table listing skills or competencies (tables only)',
  skill_line: 'a paragraph listing skills, optionally with a category label',
  org_heading: 'a line naming an employer that groups one or more positions listed under it',
  position_heading: 'the line that starts a position: job title, often with organization, location and dates',
  position_meta: 'a separate line with location / dates / organization for the position line just above it',
  position_description: 'a narrative paragraph describing a position (not a bullet)',
  position_bullet: 'a bullet point or accomplishment under a position',
  education_item: 'one degree, school or training program',
  certification_item: 'one certification or license',
  entry_item: 'one item in any other list section (awards, volunteer work, publications, ...)',
  static: 'anything else; it is kept exactly as is',
};

function compactBlock(b: BlockInfo) {
  if (b.type === 'table') return { i: b.index, type: 'table', cells: b.cells };
  return {
    i: b.index,
    type: b.type,
    style: b.style,
    list: b.list,
    align: b.align,
    bold: b.bold,
    text: b.text,
  };
}

export const importResumeTask: TaskDef<ImportResumeInput, ResumeAnalysis> = {
  name: 'import_resume',
  minTimeoutSeconds: 600,
  input: z.object({ blocks: z.array(z.any()) }) as z.ZodType<ImportResumeInput>,
  output: output as z.ZodType<ResumeAnalysis>,
  buildPrompt: ({ blocks }) => {
    const nonEmpty = blocks.filter((b) => !b.spacer);
    const roleLines = ROLES.map((role) => {
      const fields = ROLE_FIELDS[role];
      const placeholders = fields ? ` Placeholders: ${fields.map((f) => `{${f}}`).join(', ')}.` : ' Pattern: null.';
      return `- ${role}: ${ROLE_HELP[role]}.${placeholders}`;
    }).join('\n');

    return `The user uploaded their current resume (.docx). The app will reuse its formatting as a template
and import its content. Below is every non-empty block of the document body, in order, as JSON lines.
The page header (name and contact details) is handled separately and is not included. Empty spacer
paragraphs are left out, so block numbers skip.

Fields: i = block number; type = p (paragraph) or table; style = Word paragraph style; list = part of a
bulleted/numbered list; align = alignment; bold = mostly bold; text = the text (\\t = tab).

## Tasks

1. Split the document into sections in order. Section kinds: ${SECTION_KINDS.join(', ')}.
   Use "entries" for any other list-like section (awards, volunteer work, publications, ...).
   A section may have no heading (e.g. a summary paragraph or a skills table at the top).
   Give sections the keys "s1", "s2", ... in order, with the block number of their heading or null.

2. Give every block a role and the key of the section it belongs to. Roles:
${roleLines}

3. For each block whose role has placeholders, write a pattern: the block's text with each data value
   replaced by a placeholder, so that putting the values back reproduces the text exactly — same
   punctuation, spacing, tabs (\\t) and capitalization. Only use the placeholders listed for the role.
   - Put a whole date range like "03/2024 – Present" in one {dates} placeholder.
   - If the text shows a value in all capitals but it is normally written in mixed case, use
     {field|upper} and give the mixed-case value (e.g. text "ACME CORP" → pattern "{organization|upper}",
     value "Acme Corp").
   - Text the user may want to change (job titles, employers, schools) must be inside placeholders;
     only separators and fixed wording stay literal.

4. In fields, give the value of every placeholder used in the pattern. For roles whose pattern is just
   "{text}", leave fields empty (the app fills them in).

5. Describe how dates are written in the experience section: style, the separator between start and end
   (including spaces), and the word used for a current position.

6. notes: brief notes on anything unusual or uncertain (empty if none).

## Rules
- Do not change, correct or summarize any text.
- Every block number below must appear exactly once in blocks.

## Blocks
${nonEmpty.map((b) => JSON.stringify(compactBlock(b))).join('\n')}
`;
  },
};
