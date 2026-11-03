import { useEffect, useState, type ReactNode } from 'react';
import { AutoTextarea, inputClass, LinkButton } from './ui';

/** Rows with add / remove / reorder controls. */
export function ListEditor<T>({
  items,
  onChange,
  blank,
  addLabel,
  renderItem,
  reorder = true,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  blank: () => T;
  addLabel: string;
  renderItem: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  reorder?: boolean;
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 rounded-md border border-slate-200 bg-slate-50/60 p-3">
          <div className="min-w-0 flex-1">
            {renderItem(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            {reorder && (
              <>
                <LinkButton onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</LinkButton>
                <LinkButton onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down">↓</LinkButton>
              </>
            )}
            <LinkButton danger onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove">✕</LinkButton>
          </div>
        </div>
      ))}
      <LinkButton onClick={() => onChange([...items, blank()])}>+ {addLabel}</LinkButton>
    </div>
  );
}

const normalizeList = (list: string[]) => list.map((s) => s.trim()).filter(Boolean).join('\u0000');

/**
 * Edits a string list as text (comma-separated or one per line). Keeps its own text so typing a
 * separator doesn't get swallowed, and resyncs when the list changes from outside (e.g. a reorder).
 */
export function ListTextInput({
  value,
  onChange,
  separator,
  placeholder,
  minRows = 3,
  className = '',
  'aria-label': ariaLabel,
}: {
  value: string[];
  onChange: (list: string[]) => void;
  separator: 'comma' | 'line';
  placeholder?: string;
  minRows?: number;
  className?: string;
  'aria-label'?: string;
}) {
  const join = (list: string[]) => list.join(separator === 'comma' ? ', ' : '\n');
  const split = (text: string) => text.split(separator === 'comma' ? ',' : '\n');
  const [text, setText] = useState(join(value));
  useEffect(() => {
    if (normalizeList(split(text)) !== normalizeList(value)) setText(join(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (next: string) => {
    setText(next);
    onChange(split(next));
  };
  return separator === 'comma' ? (
    <input
      className={`${inputClass} ${className}`}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => handle(e.target.value)}
    />
  ) : (
    <AutoTextarea
      minRows={minRows}
      className={className}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => handle(e.target.value)}
    />
  );
}
