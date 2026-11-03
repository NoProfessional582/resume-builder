const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-03" → "Mar 2024", "2019" → "2019" */
export function displayMonth(value: string | null): string {
  if (!value) return '';
  const [year, month] = value.split('-');
  return month ? `${MONTHS[Number(month) - 1]} ${year}` : year;
}

export function displayRange(start: string | null, end: string | null): string {
  if (!start && !end) return '';
  return `${displayMonth(start) || '?'} – ${end ? displayMonth(end) : 'Present'}`;
}
