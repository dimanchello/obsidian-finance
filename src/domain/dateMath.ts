const DATE_STR_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS_IN_YEAR = 12;
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** month is 1-based */
export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_PER_MONTH[month - 1];
}

/** Local-calendar date string. Never uses toISOString, which shifts the day in UTC+ zones. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local `YYYY-MM-DDTHH:MM` for `<input type="datetime-local">`. */
export function toDateTimeLocalStr(d: Date): string {
  return `${toDateStr(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseDateStr(dateStr: string): { year: number; month: number; day: number } | null {
  const m = DATE_STR_RE.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > MONTHS_IN_YEAR) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/**
 * Shift by whole months, clamping to the last day of the target month:
 * 2026-01-31 +1 → 2026-02-28 (banking behaviour), not 2026-03-03 as `Date.setMonth` gives.
 */
export function addMonthsClamped(dateStr: string, months: number): string {
  const parsed = parseDateStr(dateStr);
  if (!parsed) throw new Error(`addMonthsClamped: expected YYYY-MM-DD, got "${dateStr}"`);

  const totalMonths = parsed.year * MONTHS_IN_YEAR + (parsed.month - 1) + months;
  const year = Math.floor(totalMonths / MONTHS_IN_YEAR);
  const month = totalMonths - year * MONTHS_IN_YEAR + 1;
  const day = Math.min(parsed.day, daysInMonth(year, month));

  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

const MS_PER_DAY = 86_400_000;

/** Whole days between two `YYYY-MM-DD` strings; negative when `to` precedes `from`. */
export function daysBetweenStr(from: string, to: string): number {
  const a = parseDateStr(from);
  const b = parseDateStr(to);
  if (!a || !b) return 0;
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / MS_PER_DAY);
}
