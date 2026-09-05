import type { RecordType } from '../types';
import { RecordType as RecordTypeValue } from '../constants';

/**
 * RFC 4180 parse. A quoted field may contain commas, newlines and doubled quotes,
 * so the input cannot be split into lines before quotes are understood.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  const endField = () => { row.push(cur); cur = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;  // i < text.length guarantees defined

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === ',') endField();
    else if (ch === '\n') endRow();
    else if (ch === '\r') { if (text[i + 1] === '\n') { i++; } endRow(); }
    else cur += ch;
  }

  // A trailing newline closes the last row; anything else still pending is a row.
  if (cur !== '' || row.length) endRow();

  return rows.filter(r => r.some(f => f.trim() !== ''));
}

/** Header row + data rows → objects keyed by header name. */
export function csvToObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const table = parseCSV(text);
  const headers = table[0];
  if (!headers) return { headers: [], rows: [] };

  const rows = table.slice(1).map(vals => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });

  return { headers, rows };
}

export type TypeMode = 'field' | 'sign' | 'all_income' | 'all_expense';

export interface TypeMap { incomeVal: string; expenseVal: string }

/**
 * Returns null when the row's type cannot be determined — a typo must not
 * silently become an expense.
 */
export function resolveRecordType(
  mode: TypeMode, typeValue: string, amount: number, map: TypeMap,
): RecordType | null {
  if (mode === 'all_income') return RecordTypeValue.INCOME;
  if (mode === 'all_expense') return RecordTypeValue.EXPENSE;
  if (mode === 'sign') return amount >= 0 ? RecordTypeValue.INCOME : RecordTypeValue.EXPENSE;

  const v = typeValue.trim().toLowerCase();
  if (v === map.incomeVal.trim().toLowerCase()) return RecordTypeValue.INCOME;
  if (v === map.expenseVal.trim().toLowerCase()) return RecordTypeValue.EXPENSE;
  return null;
}
