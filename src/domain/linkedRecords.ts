import { FinanceRecord, RecordType, CreditRecord, DebtRecord, DepositRecord, DebtMovement, CurrencyExchange } from '../types';
import { getTodayTime } from '../utils';

/**
 * Centralized logic for managing linkedId records.
 *
 * Linked records are FinanceRecord instances that are automatically created
 * to mirror actions in other entities (debts, credits, deposits, currency exchanges).
 * They are tagged with `linkedId` pointing to the parent entity's ID.
 *
 * This module eliminates duplication across DepositsTab, CreditsTab, DebtsTab, CurrencyTab.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface LinkedRecordSpec {
  entityId: string;
  date: string;
  time?: string;
  type: RecordType;
  amount: number;
  category: string;
  payer: string;
  note: string;
  isInternal?: boolean;
  linkedMovementId?: string;
}

export interface LinkedRecordKey {
  linkedId: string;
  date: string;
  type: RecordType;
  amount: number;
  linkedMovementId?: string;
}

// ── Key Generation ────────────────────────────────────────────────────────

/**
 * Creates a stable key for a linked record to detect duplicates.
 */
export function linkedRecordKey(spec: LinkedRecordSpec | FinanceRecord): string {
  const id = 'entityId' in spec ? spec.entityId : spec.linkedId ?? '';
  const movId = spec.linkedMovementId ?? '';
  return `${id}|${spec.date}|${spec.type}|${spec.amount}|${movId}`;
}

/**
 * Checks if a record matches the given spec's key.
 */
export function matchesSpec(record: FinanceRecord, spec: LinkedRecordSpec): boolean {
  return (
    record.linkedId === spec.entityId &&
    record.date === spec.date &&
    record.type === spec.type &&
    record.amount === spec.amount &&
    (spec.linkedMovementId === undefined || record.linkedMovementId === spec.linkedMovementId)
  );
}

// ── Record Creation ───────────────────────────────────────────────────────

/**
 * Creates a new linked FinanceRecord from a specification.
 */
export function createLinkedRecord(spec: LinkedRecordSpec): FinanceRecord {
  const record: FinanceRecord = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    date: spec.date,
    time: spec.time ?? getTodayTime(),
    type: spec.type,
    amount: spec.amount,
    category: spec.category,
    tag: '',
    payer: spec.payer,
    note: spec.note,
    attachmentPath: '',
    linkedId: spec.entityId,
    linkedMovementId: spec.linkedMovementId,
  };

  if (spec.isInternal !== undefined) {
    record.isInternal = spec.isInternal;
  }

  return record;
}

// ── Collection Operations ─────────────────────────────────────────────────

/**
 * Ensures a linked record exists in the collection.
 * If a record with the same key exists, returns the collection unchanged.
 * Otherwise, appends the new record.
 */
export function ensureLinkedRecord(
  records: FinanceRecord[],
  spec: LinkedRecordSpec
): FinanceRecord[] {
  const key = linkedRecordKey(spec);
  if (records.some(r => linkedRecordKey(r) === key)) {
    return records;
  }
  return [...records, createLinkedRecord(spec)];
}

/**
 * Removes all records linked to the given entity ID.
 */
export function unlinkRecords(
  records: FinanceRecord[],
  entityId: string
): FinanceRecord[] {
  return records.filter(r => r.linkedId !== entityId);
}

/**
 * Removes records linked to any of the given entity IDs.
 */
export function unlinkRecordsBatch(
  records: FinanceRecord[],
  entityIds: string[]
): FinanceRecord[] {
  const idSet = new Set(entityIds);
  return records.filter(r => !r.linkedId || !idSet.has(r.linkedId));
}

/**
 * Finds all records linked to the given entity ID.
 */
export function findLinkedRecords(
  records: FinanceRecord[],
  entityId: string
): FinanceRecord[] {
  return records.filter(r => r.linkedId === entityId);
}

/**
 * Finds a specific linked record by entity ID and optional movement ID.
 */
export function findLinkedRecord(
  records: FinanceRecord[],
  entityId: string,
  date: string,
  amount: number,
  linkedMovementId?: string
): FinanceRecord | undefined {
  return records.find(r =>
    r.linkedId === entityId &&
    r.date === date &&
    r.amount === amount &&
    (linkedMovementId === undefined || r.linkedMovementId === linkedMovementId)
  );
}

/**
 * Updates a linked record in the collection.
 * Returns a new array with the record updated in place.
 */
export function updateLinkedRecord(
  records: FinanceRecord[],
  recordId: string,
  updates: Partial<FinanceRecord>
): FinanceRecord[] {
  return records.map(r => r.id === recordId ? { ...r, ...updates } : r);
}

/**
 * Removes a specific linked record by ID.
 */
export function removeLinkedRecord(
  records: FinanceRecord[],
  recordId: string
): FinanceRecord[] {
  return records.filter(r => r.id !== recordId);
}

// ── Entity-Specific Helpers ──────────────────────────────────────────────

/**
 * Creates a linked record for a debt movement.
 */
export function createDebtMovementRecord(
  debt: DebtRecord,
  movement: DebtMovement,
  type: RecordType,
  note: string,
  category: string
): FinanceRecord {
  return createLinkedRecord({
    entityId: debt.id,
    date: movement.date,
    time: movement.time,
    type,
    amount: movement.amount,
    category,
    payer: debt.person,
    note,
    linkedMovementId: movement.id,
  });
}

/**
 * Creates a linked record for a credit receipt (when credit is issued).
 */
export function createCreditReceiptRecord(
  credit: CreditRecord,
  note: string,
  category: string
): FinanceRecord {
  return createLinkedRecord({
    entityId: credit.id,
    date: credit.startDate,
    type: 'income',
    amount: credit.originalAmount,
    category,
    payer: credit.bankName,
    note,
  });
}

/**
 * Creates a linked record for a credit payment.
 */
export function createCreditPaymentRecord(
  credit: CreditRecord,
  paymentDate: string,
  paymentAmount: number,
  note: string,
  category: string,
  isInternal = true
): FinanceRecord {
  return createLinkedRecord({
    entityId: credit.id,
    date: paymentDate,
    type: 'expense',
    amount: paymentAmount,
    category,
    payer: credit.bankName,
    note,
    isInternal,
  });
}

/**
 * Creates a linked record for deposit refund (when deposit is closed).
 */
export function createDepositRefundRecord(
  deposit: DepositRecord,
  note: string,
  category: string
): FinanceRecord {
  return createLinkedRecord({
    entityId: deposit.id,
    date: deposit.startDate,
    type: 'income',
    amount: deposit.amount,
    category,
    payer: deposit.bankName,
    note,
  });
}

/**
 * Creates a linked record for currency exchange.
 */
export function createExchangeRecord(
  exchange: CurrencyExchange,
  type: RecordType,
  amount: number,
  category: string,
  note: string
): FinanceRecord {
  return createLinkedRecord({
    entityId: exchange.id,
    date: exchange.date,
    time: exchange.time,
    type,
    amount,
    category,
    payer: '',
    note,
    isInternal: true,
  });
}

// ── Validation ────────────────────────────────────────────────────────────

/**
 * Checks if there are orphaned linked records (linkedId points to non-existent entity).
 */
export function findOrphanedLinkedRecords(
  records: FinanceRecord[],
  validEntityIds: Set<string>
): FinanceRecord[] {
  return records.filter(r => r.linkedId && !validEntityIds.has(r.linkedId));
}

/**
 * Checks if there are duplicate linked records (same key appears multiple times).
 */
export function findDuplicateLinkedRecords(
  records: FinanceRecord[]
): Map<string, FinanceRecord[]> {
  const keyMap = new Map<string, FinanceRecord[]>();

  for (const record of records) {
    if (!record.linkedId) continue;
    const key = linkedRecordKey(record);
    const existing = keyMap.get(key) ?? [];
    existing.push(record);
    keyMap.set(key, existing);
  }

  // Keep only keys with duplicates
  for (const [key, recs] of keyMap.entries()) {
    if (recs.length < 2) keyMap.delete(key);
  }

  return keyMap;
}
