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
  const [y, m, day] = d.split('-');
  return t ? `${day}.${m}.${y}\u00a0${t}` : `${day}.${m}.${y}`;
}

export function fmt(n: number, cur: string): string {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0' + cur;
}

export function noteFilename(p: string): string {
  return p.split('/').pop()?.replace(/\.md$/i, '') ?? p;
}
