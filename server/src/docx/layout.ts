import { emptyContent, type ResumeContent } from '../resume/content.ts';
import { DEFAULT_DATE_FORMAT, parseDateRange, type DateFormat } from '../resume/dates.ts';
import type { BlockInfo } from './blocks.ts';
import { fillText, matchPattern, patternFields } from './pattern.ts';
import { normalizeText } from './paragraph.ts';
import { hasPattern, type FieldName, type Role, type SectionKind } from './roles.ts';

/** What the import agent returns (see agent/tasks/importResume.ts). */
export interface ResumeAnalysis {
  sections: { key: string; kind: SectionKind; headingBlock: number | null }[];
  blocks: {
    i: number;
    role: Role;
    section: string;
    pattern: string | null;
    fields: { name: FieldName; value: string }[];
  }[];
  dates: DateFormat;
  notes: string[];
}

/** User corrections from the Layout review, keyed by block index. */
export type BlockOverrides = Record<string, { role?: Role; pattern?: string | null }>;

export interface ResolvedBlock {
  index: number;
  role: Role | 'spacer';
  section: string | null;
  pattern: string | null;
  values: Record<string, string>;
  /** ok: pattern reproduces the text; mismatch: it doesn't; none: role has no pattern */
  status: 'ok' | 'mismatch' | 'none';
  message: string | null;
}

export interface Prototype {
  block: number;
  pattern: string | null;
  values: Record<string, string>;
}

export interface TemplateSection {
  key: string;
  kind: SectionKind;
  heading: string | null;
  headingBlock: number | null;
  /** Spacing (and fixed paragraphs) before the heading. */
  leading: number[];
  /** Spacing and fixed paragraphs between the heading and the first item. */
  afterHeading: number[];
  /** The sample paragraph cloned for each role. */
  prototypes: Partial<Record<Role, Prototype>>;
  /** Spacer paragraphs inserted between two roles, keyed "fromRole>toRole". */
  transitions: Record<string, number[]>;
}

export interface TemplateLayout {
  version: 1;
  dates: DateFormat;
  sections: TemplateSection[];
  /** Spacer paragraphs at the very end of the body. */
  trailing: number[];
}

export interface LayoutIssue {
  block: number | null;
  message: string;
}

const CONTENT_ROLES = new Set<Role>([
  'summary_text',
  'skills_table',
  'skill_line',
  'org_heading',
  'position_heading',
  'position_meta',
  'position_description',
  'position_bullet',
  'education_item',
  'certification_item',
  'entry_item',
]);

/** Combines the agent's analysis with the user's corrections and checks every pattern. */
export function resolveBlocks(blocks: BlockInfo[], analysis: ResumeAnalysis, overrides: BlockOverrides): ResolvedBlock[] {
  const byIndex = new Map(analysis.blocks.map((b) => [b.i, b]));
  const sectionKeys = new Set(analysis.sections.map((s) => s.key));
  let lastSection: string | null = analysis.sections[0]?.key ?? null;

  const resolved: ResolvedBlock[] = blocks.map((block) => {
    if (block.spacer) {
      return { index: block.index, role: 'spacer', section: null, pattern: null, values: {}, status: 'none', message: null };
    }
    const ai = byIndex.get(block.index);
    const override = overrides[String(block.index)] ?? {};
    let role: Role = override.role ?? ai?.role ?? 'static';
    if (block.type === 'table' && role !== 'skills_table') role = 'static';
    if (block.type !== 'table' && role === 'skills_table') role = 'static';

    const section = ai && sectionKeys.has(ai.section) ? ai.section : lastSection;
    lastSection = section;

    if (!hasPattern(role)) {
      return { index: block.index, role, section, pattern: null, values: {}, status: 'none', message: null };
    }

    const patternOverridden = override.pattern !== undefined || (override.role !== undefined && override.role !== ai?.role);
    let pattern = patternOverridden ? (override.pattern ?? null) : (ai?.pattern ?? null);
    const fields = patternFields(pattern);
    if (!pattern || (fields.length === 1 && fields[0] === 'text')) {
      // Plain text roles take the whole paragraph.
      if (!pattern && ['summary_text', 'position_description', 'position_bullet', 'entry_item'].includes(role)) pattern = '{text}';
      if (pattern === '{text}') {
        return { index: block.index, role, section, pattern, values: { text: block.text }, status: 'ok', message: null };
      }
    }
    if (!pattern) {
      return { index: block.index, role, section, pattern: null, values: {}, status: 'mismatch', message: 'Needs a pattern.' };
    }

    const aiValues = patternOverridden ? {} : Object.fromEntries((ai?.fields ?? []).map((f) => [f.name, f.value]));
    for (const candidate of [aiValues, matchPattern(pattern, block.text)]) {
      if (candidate && normalizeText(fillText(pattern, candidate)) === block.text) {
        return { index: block.index, role, section, pattern, values: candidate, status: 'ok', message: null };
      }
    }
    return {
      index: block.index,
      role,
      section,
      pattern,
      values: aiValues,
      status: 'mismatch',
      message: "The pattern doesn't reproduce this paragraph's text.",
    };
  });

  // Spacers belong to the section of the next real block (or none, at the very end).
  let nextSection: string | null = null;
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (resolved[i].role === 'spacer') resolved[i].section = nextSection;
    else nextSection = resolved[i].section;
  }
  return resolved;
}

export function buildLayout(blocks: BlockInfo[], resolved: ResolvedBlock[], analysis: ResumeAnalysis): TemplateLayout {
  const trailing = resolved.filter((b) => b.role === 'spacer' && b.section === null).map((b) => b.index);
  const sections: TemplateSection[] = [];

  for (const def of analysis.sections) {
    const members = resolved.filter((b) => b.section === def.key);
    if (!members.some((b) => b.role !== 'spacer')) continue;

    const section: TemplateSection = {
      key: def.key,
      kind: def.kind,
      heading: null,
      headingBlock: null,
      leading: [],
      afterHeading: [],
      prototypes: {},
      transitions: {},
    };
    const candidates: Record<string, number[][]> = {};
    let previousContent: ResolvedBlock | null = null;
    let pendingSpacers: number[] = [];

    for (const b of members) {
      if (b.role === 'spacer') {
        if (previousContent) pendingSpacers.push(b.index);
        else (section.headingBlock === null ? section.leading : section.afterHeading).push(b.index);
      } else if (b.role === 'section_heading' && section.headingBlock === null && !previousContent) {
        section.headingBlock = b.index;
        section.heading = blocks[b.index].text;
      } else if (CONTENT_ROLES.has(b.role)) {
        if (previousContent) {
          const key = `${previousContent.role}>${b.role}`;
          (candidates[key] ??= []).push(pendingSpacers);
        }
        pendingSpacers = [];
        previousContent = b;
      } else if (!previousContent) {
        // Fixed paragraphs (or an extra heading) before the first item stay in place.
        (section.headingBlock === null ? section.leading : section.afterHeading).push(b.index);
      }
      // Fixed paragraphs between items can't be placed reliably and are left out.
    }

    // Prefer the most compact spacing seen for each transition (the first one on ties).
    for (const [key, options] of Object.entries(candidates)) {
      section.transitions[key] = options.reduce((best, o) => (o.length < best.length ? o : best));
    }

    // Prototype per role: a paragraph whose pattern checks out, with the most fields.
    for (const b of members) {
      if (!CONTENT_ROLES.has(b.role as Role)) continue;
      const role = b.role as Role;
      const current = section.prototypes[role];
      const score = (x: { pattern: string | null }, ok: boolean) => (ok ? 100 : 0) + patternFields(x.pattern).length;
      const currentOk = current ? resolved[current.block].status !== 'mismatch' : false;
      if (!current || score(b, b.status !== 'mismatch') > score(current, currentOk)) {
        section.prototypes[role] = { block: b.index, pattern: b.pattern, values: b.values };
      }
    }
    sections.push(section);
  }

  return { version: 1, dates: analysis.dates ?? DEFAULT_DATE_FORMAT, sections, trailing };
}

/** Pulls the resume's content out of the labelled paragraphs. */
export function extractContent(
  blocks: BlockInfo[],
  resolved: ResolvedBlock[],
  layout: TemplateLayout,
): { content: ResumeContent; issues: LayoutIssue[] } {
  const content = emptyContent();
  const issues: LayoutIssue[] = [];
  const sectionByKey = new Map(layout.sections.map((s) => [s.key, s]));
  let currentOrg: string | null = null;
  let currentOrgLocation: string | null = null;
  let position: ResumeContent['positions'][number] | null = null;

  const applyDates = (b: ResolvedBlock, dates: string | undefined) => {
    if (!position || !dates) return;
    const range = parseDateRange(dates);
    if (!range) {
      issues.push({ block: b.index, message: `Couldn't read the dates "${dates}".` });
      return;
    }
    position.start = range.start;
    position.end = range.current ? null : range.end;
  };

  for (const b of resolved) {
    if (b.status === 'mismatch') issues.push({ block: b.index, message: b.message ?? 'Pattern problem.' });
    const v = b.values;
    const section = b.section ? sectionByKey.get(b.section) : undefined;

    switch (b.role) {
      case 'summary_text':
        content.summary.push(v.text);
        break;
      case 'skills_table': {
        const items = (blocks[b.index].cells ?? []).flat(2).filter(Boolean);
        if (items.length) content.skills.push({ category: null, items });
        break;
      }
      case 'skill_line':
        content.skills.push({
          category: v.category?.trim() || null,
          items: (v.items ?? '').split(/\s*[,;•·]\s*/).filter(Boolean),
        });
        break;
      case 'org_heading':
        currentOrg = v.organization ?? '';
        currentOrgLocation = v.location ?? null;
        position = null;
        break;
      case 'position_heading':
        position = {
          organization: v.organization ?? currentOrg ?? '',
          title: v.title ?? '',
          location: v.location ?? currentOrgLocation,
          start: null,
          end: null,
          description: null,
          bullets: [],
        };
        content.positions.push(position);
        if (!position.organization) issues.push({ block: b.index, message: 'No employer found for this position.' });
        applyDates(b, v.dates);
        break;
      case 'position_meta':
        if (!position) {
          issues.push({ block: b.index, message: 'Position details line without a position above it.' });
          break;
        }
        if (v.organization) position.organization = v.organization;
        if (v.location) position.location = v.location;
        applyDates(b, v.dates);
        break;
      case 'position_description':
        if (!position) issues.push({ block: b.index, message: 'Description without a position above it.' });
        else position.description = position.description ? `${position.description}\n${v.text}` : v.text;
        break;
      case 'position_bullet':
        if (!position) issues.push({ block: b.index, message: 'Bullet without a position above it.' });
        else position.bullets.push(v.text);
        break;
      case 'education_item':
        content.education.push({
          degree: v.degree ?? blocks[b.index].text,
          school: v.school ?? null,
          location: v.location ?? null,
          dates: v.dates ?? null,
          details: v.details ?? null,
        });
        break;
      case 'certification_item':
        content.certifications.push({ name: v.name ?? blocks[b.index].text, issuer: v.issuer ?? null, date: v.date ?? null });
        break;
      case 'entry_item': {
        const heading = section?.heading ?? '';
        let entry = content.entries.find((e) => e.heading === heading);
        if (!entry) content.entries.push((entry = { heading, items: [] }));
        entry.items.push(v.text);
        break;
      }
    }
  }

  for (const section of layout.sections) {
    if (section.kind === 'experience' && !section.prototypes.position_heading) {
      issues.push({ block: null, message: 'The experience section has no position line.' });
    }
  }
  return { content, issues };
}
