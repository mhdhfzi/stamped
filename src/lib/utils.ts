export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const fmtDate = (
  t: number,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
) => new Date(t).toLocaleDateString('en-GB', opts);

export function dateRange(ts: number[]): string {
  if (!ts.length) return 'No moments yet';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
  const a = fmtDate(Math.min(...ts), opts);
  const b = fmtDate(Math.max(...ts), opts);
  return a === b ? a : `${a} – ${b}`;
}

/** yyyy-mm-dd in local time, for <input type="date"> */
export function toDateInput(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromDateInput(v: string): number {
  return new Date(`${v}T12:00:00`).getTime();
}

/** A pleasant fallback gradient for trips without a cover photo. */
export function gradientFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 38%), hsl(${(h + 50) % 360} 60% 18%))`;
}

/** Shrinks the giant card title so long names ("South Korea") still fit. */
export function fitTitleSize(title: string, width = 320, max = 96, min = 40): number {
  const est = Math.floor(width / Math.max(1, title.length * 0.6));
  return Math.max(min, Math.min(max, est));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Number of days from start to end inclusive (both yyyy-mm-dd). */
export function dayCount(start: string, end: string): number {
  return Math.max(1, Math.round((fromDateInput(end) - fromDateInput(start)) / 86_400_000) + 1);
}

/** yyyy-mm-dd of the n-th day (0-based) after start. */
export function addDays(start: string, n: number): string {
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toDateInput(d.getTime());
}
