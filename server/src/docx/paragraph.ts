import type { Element } from '@xmldom/xmldom';
import { child, children, descendants, wAttr } from './ooxml.ts';

/** A stretch of paragraph text and the run formatting (w:rPr) it was written with. */
export interface RunSpan {
  rPr: Element | null;
  text: string;
}

// Containers whose runs are part of the visible paragraph text.
const RUN_CONTAINERS = new Set(['w:hyperlink', 'w:ins', 'w:smartTag', 'w:customXml', 'w:fldSimple', 'w:sdt', 'w:sdtContent']);

/** The visible runs of a paragraph, in order. Tabs become "\t" and line breaks "\n". */
export function paragraphRuns(p: Element): RunSpan[] {
  const spans: RunSpan[] = [];
  const visit = (el: Element) => {
    for (const c of children(el)) {
      if (c.nodeName === 'w:r') {
        let text = '';
        for (const part of children(c)) {
          switch (part.nodeName) {
            case 'w:t':
              text += part.textContent ?? '';
              break;
            case 'w:tab':
            case 'w:ptab':
              text += '\t';
              break;
            case 'w:br':
            case 'w:cr':
              text += '\n';
              break;
            case 'w:noBreakHyphen':
              text += '-';
              break;
          }
        }
        if (text) spans.push({ rPr: child(c, 'w:rPr'), text });
      } else if (RUN_CONTAINERS.has(c.nodeName)) {
        visit(c);
      }
    }
  };
  visit(p);
  return spans;
}

export function paragraphText(p: Element): string {
  return paragraphRuns(p)
    .map((s) => s.text)
    .join('');
}

/** True when the paragraph contains a picture, shape or embedded object. */
export function hasGraphic(el: Element): boolean {
  return ['w:drawing', 'w:pict', 'w:object'].some((name) => descendants(el, name).length > 0);
}

export function isBold(rPr: Element | null): boolean {
  const b = child(rPr, 'w:b');
  if (!b) return false;
  const val = wAttr(b, 'val');
  return val === null || !['0', 'false', 'off'].includes(val);
}

/**
 * Collapses runs of spaces (not tabs or line breaks) and trims spaces at the ends.
 * Returns the normalized text and, for each kept character, its index in the original.
 */
export function normalizeWithMap(raw: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i] === ' ' ? ' ' : raw[i];
    if (ch === ' ' && (text.length === 0 || text.endsWith(' '))) continue;
    text += ch;
    map.push(i);
  }
  while (text.endsWith(' ')) {
    text = text.slice(0, -1);
    map.pop();
  }
  return { text, map };
}

export const normalizeText = (raw: string) => normalizeWithMap(raw).text;
