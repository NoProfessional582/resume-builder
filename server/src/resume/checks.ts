import { readFileSync } from 'node:fs';
import type { JobAnalysis } from '../agent/tasks/analyzeJob.ts';
import { STYLE_GUIDE_FILE } from '../agent/styleGuide.ts';
import type { TailoredContent, TailorSettings } from './tailored.ts';

export interface CheckWarning {
  /** Where: a bullet (positionId + index), a position, or the whole résumé. */
  positionId: number | null;
  bullet: number | null;
  kind: 'number' | 'source' | 'language' | 'count' | 'missing';
  message: string;
}

export interface KeywordCoverage {
  term: string;
  importance: JobAnalysis['keywords'][number]['importance'];
  covered: boolean;
}

export interface Checks {
  warnings: CheckWarning[];
  coverage: KeywordCoverage[];
}

const NUMBER = /\$?\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m|b|thousand|million|billion)\b)?/gi;
const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };

/** Compares numbers by value, so "5.6K" = "5,600" and "$40M" = "$40 million". */
function numberKey(s: string): string {
  const m = /([\d,]*\.?\d+)\s*([a-z]*)/i.exec(s.replace(/\$/g, ''));
  if (!m) return s;
  const value = Number(m[1].replace(/,/g, '')) * (SCALE[m[2].toLowerCase()] ?? 1);
  return String(Math.round(value * 1000) / 1000);
}
const numbersIn = (text: string) => [...text.matchAll(NUMBER)].map((m) => m[0].trim());

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive whole-word(ish) match. */
function mentions(text: string, phrase: string): boolean {
  const p = phrase.trim();
  if (!p) return false;
  const start = /^\w/.test(p) ? '\\b' : '';
  const end = /\w$/.test(p) ? '(?:s|es)?\\b' : '';
  return new RegExp(`${start}${escapeRegex(p)}${end}`, 'i').test(text);
}

let phraseCache: { mtime: number; phrases: string[] } | null = null;

/** Phrases to avoid, read from the style guide's "Language to avoid" section. */
export function avoidPhrases(): string[] {
  try {
    const text = readFileSync(STYLE_GUIDE_FILE, 'utf8');
    const section = /## Language to avoid\s+([\s\S]*?)(?=\n## |\n# |$)/.exec(text)?.[1] ?? '';
    const list = /including:\s*([\s\S]*?)\.\s*\n/.exec(section)?.[1] ?? '';
    const phrases = list
      .replace(/\([^)]*\)/g, '')
      .split(',')
      .map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase())
      .filter(Boolean);
    // e.g. Avoid unnecessary intensifiers such as "highly," "extremely" and "exceptionally."
    const intensifiers = /intensifiers such as ([^\n]*)/.exec(section)?.[1] ?? '';
    for (const m of intensifiers.matchAll(/"([a-z][a-z ]*?)[,.]?"/gi)) phrases.push(m[1].toLowerCase());
    return [...new Set(phrases)];
  } catch {
    return [];
  }
}

/**
 * Plain-code checks on a tailored résumé: numbers that aren't in the cited stories, bullets citing
 * the wrong stories, avoid-list phrases, bullet counts, and job-keyword coverage.
 */
export function runChecks(
  content: TailoredContent,
  analysis: JobAnalysis,
  settings: TailorSettings,
  storiesById: Map<number, { positionId: number; text: string }>,
  positionDescriptions: Map<number, string | null>,
): Checks {
  const warnings: CheckWarning[] = [];
  const phrases = avoidPhrases();

  const checkLanguage = (text: string, positionId: number | null, bullet: number | null) => {
    for (const phrase of phrases) {
      if (mentions(text, phrase)) {
        warnings.push({ positionId, bullet, kind: 'language', message: `Uses "${phrase}" (on your avoid list).` });
      }
    }
    // These are only a problem as openers ("Responsible for managing…"), not mid-sentence.
    const opener = /^(responsible for|tasked with|duties included)\b/i.exec(text.trim());
    if (opener) {
      warnings.push({ positionId, bullet, kind: 'language', message: `Opens with "${opener[1]}"; lead with what was accomplished.` });
    }
  };

  content.summary.forEach((s) => checkLanguage(s, null, null));

  for (const p of content.positions) {
    const ownStories = [...storiesById.entries()].filter(([, s]) => s.positionId === p.positionId);
    if (p.description) {
      checkLanguage(p.description, p.positionId, null);
      const source = [positionDescriptions.get(p.positionId) ?? '', ...ownStories.map(([, s]) => s.text)].join(' ');
      const known = new Set(numbersIn(source).map(numberKey));
      for (const n of numbersIn(p.description)) {
        if (!known.has(numberKey(n))) {
          warnings.push({ positionId: p.positionId, bullet: null, kind: 'number', message: `Role overview: "${n}" isn't in this position's stories or description.` });
        }
      }
    }
    if (p.bullets.length < settings.minBullets || p.bullets.length > settings.maxBullets) {
      warnings.push({
        positionId: p.positionId,
        bullet: null,
        kind: 'count',
        message: `${p.bullets.length} bullets (setting: ${settings.minBullets}–${settings.maxBullets}).`,
      });
    }

    p.bullets.forEach((b, i) => {
      checkLanguage(b.text, p.positionId, i);
      const sources = b.sourceStoryIds.map((id) => ({ id, story: storiesById.get(id) }));
      if (!sources.length) {
        warnings.push({ positionId: p.positionId, bullet: i, kind: 'source', message: 'No source story; check every fact yourself.' });
      }
      for (const { id, story } of sources) {
        if (!story) warnings.push({ positionId: p.positionId, bullet: i, kind: 'source', message: `Cites story S${id}, which no longer exists.` });
        else if (story.positionId !== p.positionId) {
          warnings.push({ positionId: p.positionId, bullet: i, kind: 'source', message: `Cites story S${id} from a different position.` });
        }
      }
      const sourceText = [
        positionDescriptions.get(p.positionId) ?? '',
        ...sources.map((s) => s.story?.text ?? ''),
      ].join(' ');
      const known = new Set(numbersIn(sourceText).map(numberKey));
      for (const n of numbersIn(b.text)) {
        if (!known.has(numberKey(n))) {
          warnings.push({
            positionId: p.positionId,
            bullet: i,
            kind: 'number',
            message: `"${n}" isn't in the cited ${sources.length === 1 ? 'story' : 'stories'}; make sure it's accurate.`,
          });
        }
      }
    });
  }

  // Everything printed counts toward coverage, including education and certifications.
  const allText = [
    ...content.summary,
    ...content.skills.flatMap((g) => [g.category ?? '', ...g.items]),
    ...content.positions.flatMap((p) => [p.title, p.description ?? '', ...p.bullets.map((b) => b.text)]),
    ...content.education.map((e) => [e.degree, e.school, e.details].filter(Boolean).join(' ')),
    ...content.certifications.map((c) => [c.name, c.issuer].filter(Boolean).join(' ')),
    ...content.entries.flatMap((e) => e.items),
  ].join('\n');
  const coverage = analysis.keywords.map((k) => ({
    term: k.term,
    importance: k.importance,
    covered: [k.term, ...k.synonyms].some((t) => mentions(allText, t)),
  }));

  return { warnings, coverage };
}
