export function fmtAmount(raw: string): string {
  const clean = raw.replace(/[^\d.,]/g, '');
  const dotPos = clean.search(/[.,]/);
  let intPart  = dotPos >= 0 ? clean.slice(0, dotPos)  : clean;
  let decPart  = dotPos >= 0 ? clean.slice(dotPos + 1) : '';
  decPart = decPart.slice(0, 2).replace(/[.,]/g, '');
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return decPart.length > 0 ? `${intPart},${decPart}` : intPart;
}

export function parseAmount(s: string): number {
  return parseFloat(s.replace(/\u00a0|\s/g, '').replace(',', '.')) || 0;
}

export function fmtDate(d: string, t = ''): string {
  if (!d) return '—';
  const parsed = parseDate(d);
  if (!parsed) return '—';
  const day = String(parsed.getDate()).padStart(2, '0');
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const y = parsed.getFullYear();
  const time = normalizeTimeStr(t);
  return time ? `${day}.${m}.${y}\u00a0${time}` : `${day}.${m}.${y}`;
}

export function fmt(n: number, cur: string): string {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0' + cur;
}

export function noteFilename(p: string): string {
  return p.split('/').pop()?.replace(/\.md$/i, '') ?? p;
}

export function parseDate(d: string): Date | null {
  if (!d) return null;
  d = d.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const parts = d.slice(0, 10).split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  const mDot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(d);
  if (mDot) {
    const day = parseInt(mDot[1], 10);
    const month = parseInt(mDot[2], 10) - 1;
    const year = parseInt(mDot[3], 10);
    return new Date(year, month, day);
  }
  const mSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(d);
  if (mSlash) {
    const day = parseInt(mSlash[1], 10);
    const month = parseInt(mSlash[2], 10) - 1;
    const year = parseInt(mSlash[3], 10);
    return new Date(year, month, day);
  }
  const parsed = new Date(d);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return null;
}

export function normalizeDateStr(d: string): string {
  const parsed = parseDate(d);
  if (!parsed) return getTodayStr();
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeTimeStr(t: string): string {
  if (!t) return '';
  t = t.trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (m) {
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  return '';
}

export function createDateObject(dateStr: string, timeStr = ''): Date {
  const d = parseDate(dateStr) ?? new Date();
  const t = normalizeTimeStr(timeStr);
  if (t) {
    const [h, m] = t.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

export function getDaysBetween(date1: string, date2: string): number {
  const d1 = parseDate(date1) ?? new Date();
  const d2 = parseDate(date2) ?? new Date();
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
