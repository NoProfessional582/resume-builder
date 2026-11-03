import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { killTree } from '../agent/codexCli.ts';
import { config } from '../config.ts';

/**
 * Downloads a job posting page and boils it down to text an agent can read: embedded structured
 * data (schema.org JobPosting, JSON in scripts or hidden fields) as "key: value" lines, then the
 * visible text. Nothing here is specific to one job site; the agent does the actual parsing.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_DATA_CHARS = 40_000;
const MAX_TEXT_CHARS = 25_000;
/** Below this much text the page probably builds itself with JavaScript; render it with Edge. */
const MIN_USEFUL_CHARS = 1_500;

export interface PageContent {
  url: string;
  title: string | null;
  /** What the agent reads. */
  text: string;
  /** 'download' = plain HTTP; 'browser' = rendered with headless Edge. */
  source: 'download' | 'browser';
  htmlBytes: number;
}

export class FetchError extends Error {
  statusCode = 422;
}

export function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchError("That doesn't look like a web address.");
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('Only http and https links work.');
  // This runs on the user's PC; don't let a link point back at local services.
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?$|0\.0\.0\.0)/i.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) {
    throw new FetchError('Links to this computer or the local network are not allowed.');
  }
  return url;
}

export async function fetchPostingPage(rawUrl: string): Promise<PageContent> {
  const url = validateUrl(rawUrl);
  const html = await download(url);
  let content = condense(url.href, html, 'download');

  if (visibleLength(content.text) < MIN_USEFUL_CHARS) {
    const rendered = await renderWithEdge(url.href).catch((err) => {
      console.warn('[fetch] Edge render failed:', (err as Error).message);
      return null;
    });
    if (rendered) {
      const alt = condense(url.href, rendered, 'browser');
      if (visibleLength(alt.text) > visibleLength(content.text)) content = alt;
    }
  }
  if (visibleLength(content.text) < 200) {
    throw new FetchError("Couldn't read any text from that page. Paste the posting into the form instead.");
  }
  return content;
}

const visibleLength = (s: string) => s.replace(/\s+/g, '').length;

async function download(url: URL): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new FetchError(`Couldn't download the page: ${(err as Error).message}`);
  }
  if (!res.ok) throw new FetchError(`The site answered ${res.status} ${res.statusText}.`);
  const type = res.headers.get('content-type') ?? '';
  if (type && !/html|xml|text/i.test(type)) throw new FetchError(`That link is not a web page (${type}).`);
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_HTML_BYTES) throw new FetchError('The page is too large to read.');
  return new TextDecoder('utf-8').decode(body);
}

/** Renders a JavaScript-built page with headless Microsoft Edge and returns the resulting HTML. */
function renderWithEdge(url: string): Promise<string | null> {
  const edge = [
    resolve(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    resolve(process.env.ProgramFiles ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].find((p) => existsSync(p));
  if (!edge) return Promise.resolve(null);
  // A separate profile so it never touches the user's own Edge windows or sign-ins.
  const profile = resolve(config.dataDir, 'edge-profile');
  mkdirSync(profile, { recursive: true });

  return new Promise((resolvePromise) => {
    const child = spawn(
      edge,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profile}`,
        `--user-agent=${USER_AGENT}`,
        '--virtual-time-budget=15000',
        '--dump-dom',
        url,
      ],
      { windowsHide: true },
    );
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => killTree(child), 60_000);
    child.on('error', () => {
      clearTimeout(timer);
      resolvePromise(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolvePromise(out.trim() ? out : null);
    });
  });
}

// ---------------------------------------------------------------- Condensing

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', hellip: '…' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML fragment → plain text with line breaks for block elements and "- " for list items. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|section|article|h[1-6]|ul|ol|tr|table|header|footer|main)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, all) => l && (i === 0 || l !== all[i - 1]))
    .join('\n');
}

interface DataBlock {
  text: string;
  /** Longest single value; the posting's description is usually the longest text on the page. */
  weight: number;
}

/** Flattens parsed JSON into blocks: each object with real text becomes "key: value" lines. */
function jsonBlocks(value: unknown, out: DataBlock[], depth = 0): void {
  if (depth > 40 || value == null) return;
  if (Array.isArray(value)) {
    for (const v of value) jsonBlocks(v, out, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  const lines: string[] = [];
  let weight = 0;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') {
      // JSON stored as a string: read what's inside instead.
      const nested = tryParseJson(v);
      if (nested !== undefined) {
        jsonBlocks(nested, out, depth + 1);
        continue;
      }
      const text = /<[a-z][\s\S]*>/i.test(v) ? htmlToText(v) : decodeEntities(v).trim();
      if (!text || /^(https?:)?\/\//.test(text) || /^[A-Za-z0-9+/=_-]{60,}$/.test(text)) continue; // links, tokens
      if (looksLikeCode(text)) continue; // CSS, scripts, templates
      lines.push(`${key}: ${text}`);
      weight = Math.max(weight, text.length);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      if (lines.length) lines.push(`${key}: ${v}`);
    } else {
      jsonBlocks(v, out, depth + 1);
    }
  }
  // Skip objects that only hold short labels (site settings, translations).
  if (weight >= 25) out.push({ text: lines.join('\n'), weight });
}

/** Prose has few braces, semicolons and markup symbols; CSS and script are full of them. */
function looksLikeCode(text: string): boolean {
  if (text.length < 40) return false;
  const symbols = (text.match(/[{}<>;=#\\|$`]/g) ?? []).length;
  return symbols / text.length > 0.02;
}

function tryParseJson(s: string): unknown {
  const t = s.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

function dataBlocks(html: string): DataBlock[] {
  const blocks: DataBlock[] = [];
  // JSON in <script> tags (schema.org JobPosting, Next.js data, inline app state).
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const body = m[2];
    let parsed = tryParseJson(body);
    if (parsed === undefined) {
      const assigned = /=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(body.trim());
      if (assigned) parsed = tryParseJson(assigned[1]);
    }
    if (parsed !== undefined) jsonBlocks(parsed, blocks);
  }
  // JSON stored in attributes, e.g. <input type="hidden" value="{&quot;...">.
  for (const m of html.matchAll(/\b(?:value|data-[\w-]+)\s*=\s*"([^"]{200,})"/gi)) {
    const parsed = tryParseJson(decodeEntities(m[1]));
    if (parsed !== undefined) jsonBlocks(parsed, blocks);
  }
  // Longest first; drop exact duplicates.
  const seen = new Set<string>();
  return blocks
    .sort((a, b) => b.weight - a.weight)
    .filter((b) => (seen.has(b.text) ? false : (seen.add(b.text), true)));
}

export function condense(url: string, html: string, source: PageContent['source']): PageContent {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const data = dataBlocks(html);
  let dataText = '';
  for (const b of data) {
    if (dataText.length + b.text.length > MAX_DATA_CHARS) {
      if (!dataText) dataText = b.text.slice(0, MAX_DATA_CHARS);
      break;
    }
    dataText += `${b.text}\n---\n`;
  }
  const visible = htmlToText(/<body\b[\s\S]*<\/body>/i.exec(html)?.[0] ?? html)
    // Leftover template syntax from pages that render in the browser.
    .split('\n')
    .filter((l) => !/\{\{|\}\}|ng-|v-if|=>/.test(l))
    .join('\n')
    .slice(0, MAX_TEXT_CHARS);

  const parts = [`Page title: ${title ? decodeEntities(title).trim() : '(none)'}`, `Address: ${url}`];
  if (dataText) parts.push(`## Structured data found in the page (longest text first)\n${dataText.trim()}`);
  parts.push(`## Visible page text\n${visible || '(none)'}`);
  return { url, title: title ? decodeEntities(title).trim() : null, text: parts.join('\n\n'), source, htmlBytes: html.length };
}
