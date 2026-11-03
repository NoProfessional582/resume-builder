import { DOMParser, XMLSerializer, type Document, type Element, type Node } from '@xmldom/xmldom';
import PizZip from 'pizzip';

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const ELEMENT_NODE = 1;

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

export function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

export function isElement(node: Node | null | undefined): node is Element {
  return !!node && node.nodeType === ELEMENT_NODE;
}

/** Direct child elements, optionally filtered by qualified name (e.g. "w:p"). */
export function children(el: Element, name?: string): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (isElement(n) && (!name || n.nodeName === name)) out.push(n);
  }
  return out;
}

export function child(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  return children(el, name)[0] ?? null;
}

export function descendants(el: Element, name: string): Element[] {
  return Array.from(el.getElementsByTagName(name)) as Element[];
}

export function wAttr(el: Element | null | undefined, name: string): string | null {
  return el?.getAttribute(`w:${name}`) ?? null;
}

export interface DocxPackage {
  zip: PizZip;
  doc: Document;
  body: Element;
}

export function openDocx(buffer: Buffer): DocxPackage {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new Error('The file is not a valid .docx (could not open it as a zip archive).');
  }
  const part = zip.file('word/document.xml');
  if (!part) throw new Error('The file is not a Word document (word/document.xml is missing).');
  const doc = parseXml(part.asText());
  const body = descendants(doc.documentElement!, 'w:body')[0];
  if (!body) throw new Error('The Word document has no body.');
  return { zip, doc, body };
}

export function saveDocx(pkg: DocxPackage): Buffer {
  pkg.zip.file('word/document.xml', serializeXml(pkg.doc));
  return pkg.zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/** Top-level body elements that count as blocks (everything except the section properties). */
export function bodyBlocks(body: Element): Element[] {
  return children(body).filter((el) => el.nodeName !== 'w:sectPr');
}
