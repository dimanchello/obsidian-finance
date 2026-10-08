import { FinanceRecord } from '../types';
import { normalizeDateStr } from '../utils';

export function createLinkedRecord(
  deps: { newId: () => string; now: number; nowTime: string },
  fields: Pick<FinanceRecord, 'date' | 'type' | 'amount' | 'category' | 'payer' | 'note' | 'linkedId'>
): FinanceRecord {
  const record: FinanceRecord = {
    id: deps.newId(),
    createdAt: deps.now,
    date: normalizeDateStr(fields.date),
    time: deps.nowTime,
    type: fields.type,
    amount: fields.amount,
    category: fields.category,
    payer: fields.payer,
    note: fields.note || '',
    tag: '',
    attachmentPath: '',
    isInternal: true,
  };
  if (fields.linkedId !== undefined) {
    record.linkedId = fields.linkedId;
  }
  return record;
}

/**
 * Checks if a transaction (FinanceRecord or CurrencyExchange) has a future date/time.
 * Returns true if:
 * 1. date > today
 * 2. date === today AND time is present AND time > currentTime
 */
export function isFutureTransaction(
  item: { date: string; time?: string },
  now: Date = new Date()
): boolean {
  if (!item.date) return false;
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  if (item.date > today) return true;
  if (item.date === today && item.time) {
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const curTime = `${hours}:${minutes}`;
    const time = item.time.trim();
    if (time) {
      return time > curTime;
    }
  }
  return false;
}
