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

export function parseRate(s: string): number {
  return parseFloat(s.replace(',', '.')) || 0;
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
    const [year, month, day] = d.slice(0, 10).split('-').map(Number) as [number, number, number];
    return new Date(year, month - 1, day);
  }
  const mDot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(d);
  if (mDot) {
    return new Date(Number(mDot[3]), Number(mDot[2]) - 1, Number(mDot[1]));
  }
  const mSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(d);
  if (mSlash) {
    return new Date(Number(mSlash[3]), Number(mSlash[2]) - 1, Number(mSlash[1]));
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
    return `${m[1]!.padStart(2, '0')}:${m[2]}`;
  }
  return '';
}

export function createDateObject(dateStr: string, timeStr = ''): Date {
  const d = parseDate(dateStr) ?? new Date();
  const t = normalizeTimeStr(timeStr);
  if (t) {
    const [h, m] = t.split(':').map(Number) as [number, number];
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}


export function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getTodayTime(): string {
  return new Date().toTimeString().slice(0, 5);
}
