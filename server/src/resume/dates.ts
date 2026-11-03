/** Position dates are stored as "YYYY-MM" (or "YYYY") and formatted per the template. */

export const DATE_STYLES = ['MM/YYYY', 'M/YYYY', 'MM/YY', 'Mon YYYY', 'Month YYYY', 'YYYY'] as const;
export type DateStyle = (typeof DATE_STYLES)[number];

export interface DateFormat {
  style: DateStyle;
  /** Between start and end, e.g. " – " */
  separator: string;
  /** Shown for a current position, e.g. "Present" */
  presentLabel: string;
}

export const DEFAULT_DATE_FORMAT: DateFormat = { style: 'MM/YYYY', separator: ' – ', presentLabel: 'Present' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseOne(token: string): string | null {
  const t = token.trim().replace(/\s+/g, ' ');
  let m = /^(\d{1,2})\s*\/\s*(\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = /^(\d{1,2})\s*\/\s*(\d{2})$/.exec(t);
  if (m) return `20${m[2]}-${m[1].padStart(2, '0')}`;
  m = /^([A-Za-z]{3,})\.?,? (\d{4})$/.exec(t);
  if (m) {
    const index = MONTHS.findIndex((name) => name.toLowerCase().startsWith(m![1].slice(0, 3).toLowerCase()));
    if (index >= 0) return `${m[2]}-${String(index + 1).padStart(2, '0')}`;
  }
  m = /^(\d{4})$/.exec(t);
  if (m) return m[1];
  return null;
}

const PRESENT = /^(present|current|now|ongoing|today)$/i;

export interface ParsedRange {
  start: string | null;
  end: string | null;
  current: boolean;
}

/** Parses "03/2024 – Present", "Jan 2020 - Mar 2022", "2019 to 2021", etc. */
export function parseDateRange(text: string | null | undefined): ParsedRange | null {
  if (!text?.trim()) return null;
  const parts = text.split(/\s*(?:–|—|-|\bto\b|\bthrough\b)\s*/i).filter(Boolean);
  if (parts.length === 1) {
    const single = parseOne(parts[0]);
    return single ? { start: single, end: single, current: false } : null;
  }
  if (parts.length !== 2) return null;
  const start = parseOne(parts[0]);
  if (!start) return null;
  if (PRESENT.test(parts[1].trim())) return { start, end: null, current: true };
  const end = parseOne(parts[1]);
  return end ? { start, end, current: false } : null;
}

export function formatDate(value: string | null, style: DateStyle): string {
  if (!value) return '';
  const [year, month] = value.split('-');
  if (!month || style === 'YYYY') return year;
  const m = Number(month);
  switch (style) {
    case 'MM/YYYY':
      return `${month}/${year}`;
    case 'M/YYYY':
      return `${m}/${year}`;
    case 'MM/YY':
      return `${month}/${year.slice(2)}`;
    case 'Mon YYYY':
      return `${MONTHS[m - 1].slice(0, 3)} ${year}`;
    case 'Month YYYY':
      return `${MONTHS[m - 1]} ${year}`;
  }
}

export function formatDateRange(start: string | null, end: string | null, format: DateFormat): string {
  if (!start && !end) return '';
  const from = formatDate(start, format.style);
  const to = end ? formatDate(end, format.style) : format.presentLabel;
  return from ? `${from}${format.separator}${to}` : to;
}
