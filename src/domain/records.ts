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
