import { parseBlocks } from '../docx/blocks.ts';

export interface TextDiff {
  same: number;
  /** Lines in the original that the rebuilt file doesn't have. */
  removed: string[];
  /** Lines in the rebuilt file that the original doesn't have. */
  added: string[];
}

/** The visible lines of a .docx body (table cells one per line), spacers skipped. */
export function documentLines(buffer: Buffer): string[] {
  return parseBlocks(buffer).flatMap((b) => {
    if (b.spacer) return [];
    if (b.type === 'table') return (b.cells ?? []).flat(2);
    return [b.text];
  });
}

/** Line-by-line comparison (longest common subsequence). */
export function diffLines(before: string[], after: string[]): TextDiff {
  const n = before.length;
  const m = after.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const diff: TextDiff = { same: 0, removed: [], added: [] };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      diff.same++;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) diff.removed.push(before[i++]);
    else diff.added.push(after[j++]);
  }
  diff.removed.push(...before.slice(i));
  diff.added.push(...after.slice(j));
  return diff;
}
