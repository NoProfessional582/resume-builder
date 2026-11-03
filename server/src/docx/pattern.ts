/**
 * Line patterns describe how a paragraph's text is built from data, e.g.
 * "{title} | {location} | {dates}" or "{organization|upper}".
 */

export type Transform = 'upper' | 'lower';

export type Piece =
  | { kind: 'lit'; text: string }
  | { kind: 'field'; name: string; transform: Transform | null };

const PLACEHOLDER = /\{(\w+)(?:\|(upper|lower))?\}/g;

export function parsePattern(pattern: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of pattern.matchAll(PLACEHOLDER)) {
    if (m.index > last) pieces.push({ kind: 'lit', text: pattern.slice(last, m.index) });
    pieces.push({ kind: 'field', name: m[1], transform: (m[2] as Transform) ?? null });
    last = m.index + m[0].length;
  }
  if (last < pattern.length) pieces.push({ kind: 'lit', text: pattern.slice(last) });
  return pieces;
}

export function patternFields(pattern: string | null): string[] {
  if (!pattern) return [];
  return parsePattern(pattern)
    .filter((p): p is Extract<Piece, { kind: 'field' }> => p.kind === 'field')
    .map((p) => p.name);
}

/** One output stretch of a filled pattern, tagged with the piece it came from. */
export interface FilledPart {
  piece: number;
  text: string;
}

const SEPARATOR = /^[\s|,;:·•–—\-/(]+$/;
const OPENERS: Record<string, string> = { '(': ')', '[': ']' };

const applyTransform = (value: string, t: Transform | null) =>
  t === 'upper' ? value.toUpperCase() : t === 'lower' ? value.toLowerCase() : value;

/**
 * Fills a pattern with values. When a value is empty its field is dropped along with the
 * separator next to it, so "{title} | {location} | {dates}" without a location gives
 * "Title | Dates" rather than "Title |  | Dates".
 */
export function fillPattern(pieces: Piece[], values: Record<string, string | null | undefined>): FilledPart[] {
  const keep = pieces.map(() => true);
  const trimLeading = pieces.map(() => '');

  pieces.forEach((piece, i) => {
    if (piece.kind !== 'field' || (values[piece.name] ?? '').trim()) return;
    keep[i] = false;
    const prev = pieces[i - 1];
    const next = pieces[i + 1];
    if (prev?.kind === 'lit' && keep[i - 1] && SEPARATOR.test(prev.text)) {
      keep[i - 1] = false;
      // "({details})" → also drop the closing bracket.
      const opener = [...prev.text].reverse().find((ch) => ch in OPENERS);
      if (opener && next?.kind === 'lit') trimLeading[i + 1] = OPENERS[opener];
    } else if (next?.kind === 'lit' && SEPARATOR.test(next.text)) {
      keep[i + 1] = false;
    }
  });

  const parts: FilledPart[] = [];
  pieces.forEach((piece, i) => {
    if (!keep[i]) return;
    let text =
      piece.kind === 'lit' ? piece.text : applyTransform((values[piece.name] ?? '').trim(), piece.transform);
    if (trimLeading[i] && text.trimStart().startsWith(trimLeading[i])) {
      text = text.trimStart().slice(trimLeading[i].length);
    }
    if (text) parts.push({ piece: i, text });
  });
  // Separators can be left dangling at the ends when the first or last field is empty.
  while (parts.length && pieces[parts[0].piece].kind === 'lit' && SEPARATOR.test(parts[0].text)) parts.shift();
  while (parts.length && pieces[parts.at(-1)!.piece].kind === 'lit' && SEPARATOR.test(parts.at(-1)!.text)) parts.pop();
  return parts;
}

export const fillText = (pattern: string, values: Record<string, string | null | undefined>) =>
  fillPattern(parsePattern(pattern), values)
    .map((p) => p.text)
    .join('');

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Extracts field values from text using a pattern. Returns null if the text doesn't fit. */
export function matchPattern(pattern: string, text: string): Record<string, string> | null {
  const pieces = parsePattern(pattern);
  const names: string[] = [];
  const source = pieces
    .map((p) => {
      if (p.kind === 'lit') return escapeRegex(p.text);
      names.push(p.name);
      return '(.+?)';
    })
    .join('');
  const m = new RegExp(`^${source}$`, 'si').exec(text);
  if (!m) return null;
  return Object.fromEntries(names.map((name, i) => [name, m[i + 1].trim()]));
}
