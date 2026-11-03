import type { Element } from '@xmldom/xmldom';
import { bodyBlocks, child, children, descendants, openDocx, wAttr } from './ooxml.ts';
import { hasGraphic, isBold, normalizeText, paragraphRuns, paragraphText } from './paragraph.ts';

/** One top-level element of the document body, summarized for analysis and review. */
export interface BlockInfo {
  index: number;
  type: 'p' | 'table' | 'other';
  /** Normalized text (spaces collapsed; tabs and line breaks kept). */
  text: string;
  style: string | null;
  /** Paragraph is part of a bulleted or numbered list. */
  list: boolean;
  align: string | null;
  /** Most of the text is bold. */
  bold: boolean;
  /** Empty paragraph used for spacing. */
  spacer: boolean;
  /** For tables: text of each paragraph, per row and cell. */
  cells?: string[][][];
}

export function parseBlocks(buffer: Buffer): BlockInfo[] {
  const { body } = openDocx(buffer);
  return bodyBlocks(body).map((el, index) => describe(el, index));
}

function describe(el: Element, index: number): BlockInfo {
  if (el.nodeName === 'w:p') {
    const pPr = child(el, 'w:pPr');
    const runs = paragraphRuns(el);
    const text = normalizeText(runs.map((r) => r.text).join(''));
    const boldChars = runs.filter((r) => isBold(r.rPr)).reduce((n, r) => n + r.text.trim().length, 0);
    const totalChars = runs.reduce((n, r) => n + r.text.trim().length, 0);
    return {
      index,
      type: 'p',
      text: text || (hasGraphic(el) ? '[graphic]' : ''),
      style: wAttr(child(pPr, 'w:pStyle'), 'val'),
      list: !!child(pPr, 'w:numPr'),
      align: wAttr(child(pPr, 'w:jc'), 'val'),
      bold: totalChars > 0 && boldChars / totalChars > 0.5,
      spacer: !text && !hasGraphic(el),
    };
  }
  if (el.nodeName === 'w:tbl') {
    const cells = children(el, 'w:tr').map((tr) =>
      children(tr, 'w:tc').map((tc) =>
        descendants(tc, 'w:p')
          .map((p) => normalizeText(paragraphText(p)))
          .filter(Boolean),
      ),
    );
    const text = cells.flat(2).join(' | ');
    return { index, type: 'table', text, style: null, list: false, align: null, bold: false, spacer: false, cells };
  }
  const text = normalizeText(el.textContent ?? '');
  return {
    index,
    type: 'other',
    text,
    style: null,
    list: false,
    align: null,
    bold: false,
    spacer: !text && !hasGraphic(el),
  };
}
