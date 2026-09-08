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
  return DAYS_PER_MONTH[month - 1]!;
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

export function withDayClamped(dateStr: string, day: number): string {
  const parsed = parseDateStr(dateStr);
  if (!parsed) return dateStr;
  const clamped = Math.min(day, daysInMonth(parsed.year, parsed.month));
  return `${String(parsed.year).padStart(4, '0')}-${pad2(parsed.month)}-${pad2(clamped)}`;
}

export const MS_PER_DAY = 86_400_000;

/** Whole days between two `YYYY-MM-DD` strings; negative when `to` precedes `from`. */
export function daysBetweenStr(from: string, to: string): number {
  const a = parseDateStr(from);
  const b = parseDateStr(to);
  if (!a || !b) return 0;
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / MS_PER_DAY);
}

const DAYS_IN_WEEK = 7;
const THURSDAY = 4;

/**
 * ISO-8601 week: weeks start on Monday and week 1 is the one containing the first
 * Thursday, so the last days of December can belong to week 1 of the next year —
 * which is why the year is returned alongside and must be used for the bucket key.
 */
export function isoWeek(dateStr: string): { year: number; week: number } | null {
  const p = parseDateStr(dateStr);
  if (!p) return null;

  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dayOfWeek = d.getUTCDay() || DAYS_IN_WEEK; // Sunday 0 → 7

  // Step to the Thursday of this week: its calendar year is the ISO week-year.
  d.setUTCDate(d.getUTCDate() + THURSDAY - dayOfWeek);
  const year = d.getUTCFullYear();

  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((d.getTime() - jan1) / (DAYS_IN_WEEK * MS_PER_DAY)) + 1;

  return { year, week };
}

/** Inverse of {@link isoWeek}: the Monday and Sunday bounding an ISO week. */
export function isoWeekRange(year: number, week: number): { from: string; to: string } {
  // Jan 4 is always in ISO week 1, so its Monday anchors the whole year.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const isoDow = jan4.getUTCDay() || DAYS_IN_WEEK;
  const monday = new Date(Date.UTC(year, 0, 4 - (isoDow - 1) + (week - 1) * DAYS_IN_WEEK));
  const sunday = new Date(monday.getTime() + (DAYS_IN_WEEK - 1) * MS_PER_DAY);

  const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return { from: fmt(monday), to: fmt(sunday) };
}

/**
 * Returns the number of days in a year (365 or 366 for leap years).
 * Used for precise interest calculations that need actual/365 or actual/366 day count convention.
 */
export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/**
 * Maturity date of a term product (credit/deposit): `startDate` shifted by `termMonths`.
 * Returns '' for a missing or malformed start date instead of throwing, so callers can
 * render partially-filled entities without guarding every call site.
 */
export function safeEndDate(startDate?: string, termMonths?: number): string {
  if (!startDate) return '';
  try {
    return addMonthsClamped(startDate, termMonths ?? 0);
  } catch {
    return '';
  }
}


