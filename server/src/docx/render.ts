import type { Document, Element } from '@xmldom/xmldom';
import { normalizeHeading, type ResumeContent } from '../resume/content.ts';
import { formatDateRange } from '../resume/dates.ts';
import type { TemplateLayout, TemplateSection } from './layout.ts';
import { bodyBlocks, child, children, descendants, openDocx, saveDocx, W_NS } from './ooxml.ts';
import { normalizeWithMap, paragraphRuns } from './paragraph.ts';
import { fillPattern, parsePattern } from './pattern.ts';
import type { Role } from './roles.ts';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

type Item =
  | { role: Exclude<Role, 'skills_table'>; values: Record<string, string | null> }
  | { role: 'skills_table'; items: string[] };

/**
 * Builds a resume .docx from the template file and content. Each item is a copy of the
 * template's sample paragraph for its role, with new text in the same formatting.
 */
export function renderResume(template: Buffer, layout: TemplateLayout, content: ResumeContent): Buffer {
  const pkg = openDocx(template);
  const { doc, body } = pkg;
  const original = bodyBlocks(body);
  const copy = (index: number) => original[index].cloneNode(true) as Element;
  const out: Element[] = [];

  for (const section of layout.sections) {
    const items = itemsFor(section, content, layout);
    if (!items.length) continue; // empty sections disappear, heading and all

    for (const i of section.leading) out.push(copy(i));
    if (section.headingBlock !== null) out.push(keepWithNext(doc, copy(section.headingBlock)));
    for (const i of section.afterHeading) out.push(copy(i));

    items.forEach((item, n) => {
      if (n > 0) for (const i of spacersBetween(section, items[n - 1].role, item.role)) out.push(copy(i));
      const proto = section.prototypes[item.role]!;
      let el: Element;
      if (item.role === 'skills_table') {
        el = fillTable(doc, original[proto.block], item.items);
      } else if (proto.pattern) {
        el = fillParagraph(doc, original[proto.block], proto.pattern, proto.values, item.values);
      } else {
        el = copy(proto.block);
      }
      out.push(HEADING_ROLES.has(item.role) ? keepWithNext(doc, el) : el);
    });
  }
  for (const i of layout.trailing) out.push(copy(i));

  const sectPr = child(body, 'w:sectPr');
  for (const el of original) body.removeChild(el);
  for (const el of out) body.insertBefore(el, sectPr);
  return saveDocx(pkg);
}

/** Lines that introduce what follows; they shouldn't end up alone at the bottom of a page. */
const HEADING_ROLES = new Set<Role>(['org_heading', 'position_heading', 'position_meta']);

/** Sets Word's "Keep with next" on a paragraph. */
function keepWithNext(doc: Document, p: Element): Element {
  if (p.nodeName !== 'w:p') return p;
  let pPr = child(p, 'w:pPr');
  if (!pPr) {
    pPr = doc.createElementNS(W_NS, 'w:pPr');
    p.insertBefore(pPr, p.firstChild);
  }
  if (child(pPr, 'w:keepNext')) return p;
  // Schema order: w:pStyle comes first, then w:keepNext.
  const style = child(pPr, 'w:pStyle');
  pPr.insertBefore(doc.createElementNS(W_NS, 'w:keepNext'), style ? style.nextSibling : pPr.firstChild);
  return p;
}

function spacersBetween(section: TemplateSection, from: Role, to: Role): number[] {
  return (
    section.transitions[`${from}>${to}`] ??
    (to === 'org_heading' ? section.transitions[`${from}>position_heading`] : undefined) ??
    []
  );
}

/** The paragraphs to produce for one section, in order. Roles without a sample are skipped. */
function itemsFor(section: TemplateSection, content: ResumeContent, layout: TemplateLayout): Item[] {
  const has = (role: Role) => !!section.prototypes[role];
  const items: Item[] = [];

  switch (section.kind) {
    case 'summary':
      if (has('summary_text')) for (const text of content.summary) items.push({ role: 'summary_text', values: { text } });
      break;

    case 'skills':
      if (has('skills_table')) {
        const all = content.skills.flatMap((g) => g.items);
        if (all.length) items.push({ role: 'skills_table', items: all });
      } else if (has('skill_line')) {
        for (const g of content.skills) {
          items.push({ role: 'skill_line', values: { category: g.category, items: g.items.join(', ') } });
        }
      }
      break;

    case 'experience': {
      let previousOrg: string | null = null;
      for (const p of content.positions) {
        const dates = formatDateRange(p.start, p.end, layout.dates);
        if (has('org_heading') && p.organization !== previousOrg) {
          items.push({ role: 'org_heading', values: { organization: p.organization } });
        }
        previousOrg = p.organization;
        items.push({
          role: 'position_heading',
          values: { title: p.title, organization: p.organization, location: p.location, dates },
        });
        if (has('position_meta')) {
          items.push({ role: 'position_meta', values: { organization: p.organization, location: p.location, dates } });
        }
        if (p.description && has('position_description')) {
          items.push({ role: 'position_description', values: { text: p.description } });
        }
        if (has('position_bullet')) for (const text of p.bullets) items.push({ role: 'position_bullet', values: { text } });
      }
      if (!has('position_heading')) return [];
      break;
    }

    case 'education':
      if (has('education_item')) {
        for (const e of content.education) items.push({ role: 'education_item', values: { ...e } });
      }
      break;

    case 'certifications':
      if (has('certification_item')) {
        for (const c of content.certifications) items.push({ role: 'certification_item', values: { ...c } });
      }
      break;

    case 'entries': {
      const entry = content.entries.find((e) => normalizeHeading(e.heading) === normalizeHeading(section.heading));
      if (entry && has('entry_item')) for (const text of entry.items) items.push({ role: 'entry_item', values: { text } });
      break;
    }
  }
  return items;
}

/**
 * Copies a sample paragraph and replaces its text. Each part of the pattern keeps the run
 * formatting it had in the sample, so a bold title next to italic dates stays that way.
 */
function fillParagraph(
  doc: Document,
  proto: Element,
  pattern: string,
  protoValues: Record<string, string>,
  values: Record<string, string | null>,
): Element {
  const pieces = parsePattern(pattern);
  const runs = paragraphRuns(proto);
  const charFormat: (Element | null)[] = runs.flatMap((r) => [...r.text].map(() => r.rPr));
  const { text: protoText, map } = normalizeWithMap(runs.map((r) => r.text).join(''));

  // Formatting used where the sample can't be matched up: the run with the most text.
  const fallback = mostUsed(runs);
  const pieceFormat: (Element | null)[] = pieces.map(() => fallback);
  const protoParts = fillPattern(pieces, protoValues);
  if (protoParts.map((p) => p.text).join('') === protoText) {
    let offset = 0;
    for (const part of protoParts) {
      pieceFormat[part.piece] = charFormat[map[offset]] ?? fallback;
      offset += part.text.length;
    }
  }

  const p = proto.cloneNode(true) as Element;
  for (const c of children(p)) if (c.nodeName !== 'w:pPr') p.removeChild(c);

  let current: { rPr: Element | null; text: string } | null = null;
  for (const part of fillPattern(pieces, values)) {
    const rPr = pieceFormat[part.piece];
    if (current && current.rPr === rPr) current.text += part.text;
    else {
      if (current) appendRun(doc, p, current.rPr, current.text);
      current = { rPr, text: part.text };
    }
  }
  if (current) appendRun(doc, p, current.rPr, current.text);
  return p;
}

function mostUsed(runs: { rPr: Element | null; text: string }[]): Element | null {
  const totals = new Map<Element | null, number>();
  for (const r of runs) totals.set(r.rPr, (totals.get(r.rPr) ?? 0) + r.text.length);
  let best: Element | null = runs[0]?.rPr ?? null;
  for (const [rPr, n] of totals) if (n > (totals.get(best) ?? 0)) best = rPr;
  return best;
}

function appendRun(doc: Document, p: Element, rPr: Element | null, text: string): void {
  const r = doc.createElementNS(W_NS, 'w:r');
  if (rPr) r.appendChild(rPr.cloneNode(true));
  for (const chunk of text.split(/(\t|\n)/)) {
    if (!chunk) continue;
    if (chunk === '\t') r.appendChild(doc.createElementNS(W_NS, 'w:tab'));
    else if (chunk === '\n') r.appendChild(doc.createElementNS(W_NS, 'w:br'));
    else {
      const t = doc.createElementNS(W_NS, 'w:t');
      t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      t.appendChild(doc.createTextNode(chunk));
      r.appendChild(t);
    }
  }
  p.appendChild(r);
}

/** Copies a skills table and fills its first row's cells, column by column. */
function fillTable(doc: Document, proto: Element, items: string[]): Element {
  const table = proto.cloneNode(true) as Element;
  const rows = children(table, 'w:tr');
  for (const row of rows.slice(1)) table.removeChild(row);
  const cells = children(rows[0], 'w:tc');

  const originalFirstCell = children(children(proto, 'w:tr')[0], 'w:tc')[0];
  const cellParagraphs = descendants(originalFirstCell, 'w:p');
  const sample = cellParagraphs.find((p) => paragraphRuns(p).some((r) => r.text.trim())) ?? cellParagraphs[0];
  const sampleText = normalizeWithMap(paragraphRuns(sample).map((r) => r.text).join('')).text;

  // Balance columns: 10 items over 3 cells → 4, 3, 3.
  const base = Math.floor(items.length / cells.length);
  const extra = items.length % cells.length;
  let next = 0;
  cells.forEach((cell, c) => {
    for (const p of children(cell, 'w:p')) cell.removeChild(p);
    const count = base + (c < extra ? 1 : 0);
    const cellItems = items.slice(next, next + count);
    next += count;
    for (const item of cellItems) {
      cell.appendChild(fillParagraph(doc, sample, '{text}', { text: sampleText }, { text: item }));
    }
    if (!cellItems.length) {
      const empty = sample.cloneNode(true) as Element;
      for (const ch of children(empty)) if (ch.nodeName !== 'w:pPr') empty.removeChild(ch);
      cell.appendChild(empty); // every cell needs a paragraph
    }
  });
  return table;
}
