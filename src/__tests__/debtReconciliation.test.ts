import { describe, it, expect } from 'vitest';
import {
  reconcileAllDebts,
  reconcileSingleDebt,
  type DebtRecordLabels,
} from '../domain/debtReconciliation';
import {
  DebtDirection,
  DebtMovementType,
  RecordType,
  type DebtRecord,
  type FinanceRecord,
} from '../types';

const PRINCIPAL_TEN_K = 10_000;
const PRINCIPAL_SIX_K = 6_000;
const PRINCIPAL_FOUR_K = 4_000;
const AMOUNT_FIVE_K = 5_000;
const AMOUNT_ELEVEN_K = 11_000;
const AMOUNT_TWELVE_K = 12_000;
const INTEREST_ONE_K = 1_000;
const INTEREST_FIVE_HUNDRED = 500;
const RATE_TEN = 10;
const RATE_TWENTY = 20;
const BASE_TS = 1_700_000_000_000;
const THREE_MOVEMENTS = 3;

const LABELS: DebtRecordLabels = {
  debtDefaultCat: 'Долг',
  debtRepayNote: 'Возврат долга',
  debtInterestNote: 'Проценты по долгу',
  debtInterestCategory: 'Проценты по долгу',
};

function mkDeps() {
  let seq = 0;
  return {
    newId: () => `gen-${++seq}`,
    now: BASE_TS,
  };
}

function mkDebt(over: Partial<DebtRecord> = {}): DebtRecord {
  return {
    id: 'debt-1',
    person: 'Иван',
    amount: PRINCIPAL_TEN_K,
    originalAmount: PRINCIPAL_TEN_K,
    interestRate: RATE_TEN,
    direction: DebtDirection.LENT,
    date: '2026-01-01',
    time: '10:00',
    dueDate: '',
    createdAt: BASE_TS,
    note: '',
    movements: [],
    ...over,
  };
}

function mkRecord(over: Partial<FinanceRecord> = {}): FinanceRecord {
  return {
    id: 'rec-1',
    createdAt: BASE_TS,
    date: '2026-02-01',
    time: '12:00',
    type: RecordType.INCOME,
    amount: AMOUNT_ELEVEN_K,
    category: LABELS.debtDefaultCat,
    tag: '',
    payer: 'Иван',
    note: `${LABELS.debtRepayNote}: Иван`,
    attachmentPath: '',
    isInternal: true,
    linkedId: 'debt-1',
    ...over,
  };
}

describe('debtReconciliation', () => {
  it('splits lent full repayment into internal principal and external income', () => {
    const debt = mkDebt({
      amount: -INTEREST_ONE_K,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: AMOUNT_ELEVEN_K, interestAmount: 0, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
      ],
    });
    const records = [
      mkRecord({ id: 'r1', date: '2026-01-01', type: RecordType.EXPENSE, amount: PRINCIPAL_TEN_K, linkedMovementId: 'm1' }),
      mkRecord({ id: 'r2', date: '2026-02-01', type: RecordType.INCOME, amount: AMOUNT_ELEVEN_K, linkedMovementId: 'm2' }),
    ];

    const res = reconcileAllDebts([debt], records, LABELS, mkDeps());

    expect(res.changed).toEqual({ debts: true, records: true });
    expect(res.debts[0]!.amount).toBe(0);
    expect(res.debts[0]!.movements).toHaveLength(THREE_MOVEMENTS);
    const repayMov = res.debts[0]!.movements[1]!;
    const interestMov = res.debts[0]!.movements[2]!;
    expect(repayMov).toMatchObject({ id: 'm2', type: DebtMovementType.REPAY, amount: PRINCIPAL_TEN_K });
    expect(interestMov).toMatchObject({ type: DebtMovementType.INTEREST, amount: INTEREST_ONE_K });

    expect(res.records.find(r => r.linkedMovementId === repayMov.id)).toMatchObject({
      type: RecordType.INCOME,
      amount: PRINCIPAL_TEN_K,
      isInternal: true,
    });
    expect(res.records.find(r => r.linkedMovementId === interestMov.id)).toMatchObject({
      type: RecordType.INCOME,
      amount: INTEREST_ONE_K,
      category: LABELS.debtInterestCategory,
      isInternal: false,
    });
  });

  it('splits borrowed full repayment into internal principal and external expense', () => {
    const debt = mkDebt({
      direction: DebtDirection.BORROWED,
      amount: -INTEREST_ONE_K,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: AMOUNT_ELEVEN_K, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
      ],
    });
    const records = [
      mkRecord({ id: 'r1', date: '2026-01-01', type: RecordType.INCOME, amount: PRINCIPAL_TEN_K, linkedMovementId: 'm1' }),
      mkRecord({ id: 'r2', date: '2026-02-01', type: RecordType.EXPENSE, amount: AMOUNT_ELEVEN_K, linkedMovementId: 'm2' }),
    ];

    const res = reconcileAllDebts([debt], records, LABELS, mkDeps());

    const interestMov = res.debts[0]!.movements.find(m => m.type === DebtMovementType.INTEREST)!;
    expect(res.records.find(r => r.linkedMovementId === 'm2')).toMatchObject({
      type: RecordType.EXPENSE,
      amount: PRINCIPAL_TEN_K,
      isInternal: true,
    });
    expect(res.records.find(r => r.linkedMovementId === interestMov.id)).toMatchObject({
      type: RecordType.EXPENSE,
      amount: INTEREST_ONE_K,
      isInternal: false,
    });
  });

  it('keeps partial repayment within principal internal and splits crossing repayment', () => {
    const debt = mkDebt({
      amount: -INTEREST_ONE_K,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: PRINCIPAL_SIX_K, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
        { id: 'm3', type: DebtMovementType.REPAY, amount: AMOUNT_FIVE_K, date: '2026-03-01', time: '12:00', createdAt: BASE_TS + 2, note: '' },
      ],
    });
    const records = [
      mkRecord({ id: 'r2', date: '2026-02-01', type: RecordType.INCOME, amount: PRINCIPAL_SIX_K, linkedMovementId: 'm2' }),
      mkRecord({ id: 'r3', date: '2026-03-01', type: RecordType.INCOME, amount: AMOUNT_FIVE_K, linkedMovementId: 'm3' }),
    ];

    const res = reconcileAllDebts([debt], records, LABELS, mkDeps());

    expect(res.records.filter(r => r.linkedMovementId === 'm2')).toMatchObject([
      { amount: PRINCIPAL_SIX_K, isInternal: true },
    ]);
    const interestMov = res.debts[0]!.movements.find(m => m.type === DebtMovementType.INTEREST)!;
    expect(res.records.find(r => r.linkedMovementId === 'm3')).toMatchObject({
      amount: PRINCIPAL_FOUR_K,
      isInternal: true,
    });
    expect(res.records.find(r => r.linkedMovementId === interestMov.id)).toMatchObject({
      amount: INTEREST_ONE_K,
      isInternal: false,
    });
  });

  it('converts repayment entirely beyond principal into a single external record', () => {
    const debt = mkDebt({
      amount: -INTEREST_ONE_K,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: PRINCIPAL_TEN_K, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
        { id: 'm3', type: DebtMovementType.REPAY, amount: INTEREST_ONE_K, date: '2026-03-01', time: '12:00', createdAt: BASE_TS + 2, note: '' },
      ],
    });
    const records = [
      mkRecord({ id: 'r2', date: '2026-02-01', type: RecordType.INCOME, amount: PRINCIPAL_TEN_K, linkedMovementId: 'm2' }),
      mkRecord({ id: 'r3', date: '2026-03-01', type: RecordType.INCOME, amount: INTEREST_ONE_K, linkedMovementId: 'm3' }),
    ];

    const res = reconcileAllDebts([debt], records, LABELS, mkDeps());

    expect(res.debts[0]!.movements[2]).toMatchObject({
      id: 'm3',
      type: DebtMovementType.INTEREST,
      amount: INTEREST_ONE_K,
    });
    const m3Records = res.records.filter(r => r.linkedMovementId === 'm3');
    expect(m3Records).toHaveLength(1);
    expect(m3Records[0]).toMatchObject({
      id: 'r3',
      type: RecordType.INCOME,
      amount: INTEREST_ONE_K,
      isInternal: false,
      category: LABELS.debtInterestCategory,
    });
  });

  it('splits overpayment on zero-interest debt', () => {
    const debt = mkDebt({
      interestRate: 0,
      amount: -INTEREST_ONE_K,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: AMOUNT_ELEVEN_K, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
      ],
    });
    const records = [
      mkRecord({ id: 'r2', date: '2026-02-01', type: RecordType.INCOME, amount: AMOUNT_ELEVEN_K, linkedMovementId: 'm2' }),
    ];

    const res = reconcileAllDebts([debt], records, LABELS, mkDeps());

    const interestMov = res.debts[0]!.movements.find(m => m.type === DebtMovementType.INTEREST)!;
    expect(res.records.find(r => r.linkedMovementId === 'm2')?.amount).toBe(PRINCIPAL_TEN_K);
    expect(res.records.find(r => r.linkedMovementId === interestMov.id)?.amount).toBe(INTEREST_ONE_K);
  });

  it('matches legacy records without linkedMovementId and omits dangling separator on empty note', () => {
    const debt = mkDebt({
      interestRate: RATE_TWENTY,
      amount: -INTEREST_ONE_K,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: AMOUNT_TWELVE_K, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
      ],
    });
    const records = [
      mkRecord({ id: 'r2', date: '2026-02-01', type: RecordType.INCOME, amount: AMOUNT_TWELVE_K, note: '' }),
    ];

    const res = reconcileAllDebts([debt], records, LABELS, mkDeps());
    const interestMov = res.debts[0]!.movements.find(m => m.type === DebtMovementType.INTEREST)!;
    const interestRec = res.records.find(r => !r.isInternal);

    expect(interestRec?.note).toBe(`${LABELS.debtRepayNote}: Иван — ${LABELS.debtInterestNote}`);
    expect(interestRec?.linkedMovementId).toBe(interestMov.id);
  });

  it('fixes legacy principal repayment wrongly marked non-internal', () => {
    const debt = mkDebt({
      amount: PRINCIPAL_FOUR_K,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: PRINCIPAL_SIX_K, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
      ],
    });
    const records = [
      mkRecord({ id: 'r2', date: '2026-02-01', type: RecordType.INCOME, amount: PRINCIPAL_SIX_K, isInternal: false, linkedMovementId: 'm2' }),
    ];

    const res = reconcileAllDebts([debt], records, LABELS, mkDeps());

    expect(res.changed.records).toBe(true);
    expect(res.records[0]?.isInternal).toBe(true);
    expect(res.records[0]?.amount).toBe(PRINCIPAL_SIX_K);
  });

  it('preserves manual interest split during migration and subsequent reconciliation', () => {
    const debt = mkDebt({
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: AMOUNT_FIVE_K, interestAmount: INTEREST_FIVE_HUNDRED, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
      ],
    });
    const records = [
      mkRecord({ id: 'r2-p', date: '2026-02-01', type: RecordType.INCOME, amount: AMOUNT_FIVE_K - INTEREST_FIVE_HUNDRED, isInternal: true, linkedMovementId: 'm2' }),
      mkRecord({ id: 'r2-i', date: '2026-02-01', type: RecordType.INCOME, amount: INTEREST_FIVE_HUNDRED, isInternal: false, category: LABELS.debtInterestCategory, linkedMovementId: 'm2' }),
    ];

    const migrated = reconcileAllDebts([debt], records, LABELS, mkDeps());
    expect(migrated.debts[0]!.movements).toHaveLength(THREE_MOVEMENTS);
    expect(migrated.debts[0]!.movements[1]).toMatchObject({
      id: 'm2',
      type: DebtMovementType.REPAY,
      amount: AMOUNT_FIVE_K - INTEREST_FIVE_HUNDRED,
    });
    expect(migrated.debts[0]!.movements[2]).toMatchObject({
      type: DebtMovementType.INTEREST,
      amount: INTEREST_FIVE_HUNDRED,
    });

    const resynced = reconcileSingleDebt(migrated.debts[0]!, migrated.records, LABELS, mkDeps());
    expect(resynced.debtChanged).toBe(false);
    expect(resynced.recordsChanged).toBe(false);
  });

  it('does not recreate records manually deleted by the user', () => {
    const debt = mkDebt({
      amount: -INTEREST_ONE_K,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: AMOUNT_ELEVEN_K, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
      ],
    });

    const res = reconcileAllDebts([debt], [], LABELS, mkDeps());

    expect(res.records).toHaveLength(0);
    expect(res.changed.records).toBe(false);
    expect(res.debts[0]!.movements).toHaveLength(THREE_MOVEMENTS);
    expect(res.debts[0]!.movements[1]!.amount).toBe(PRINCIPAL_TEN_K);
    expect(res.debts[0]!.movements[2]).toMatchObject({ type: DebtMovementType.INTEREST, amount: INTEREST_ONE_K });
    expect(res.debts[0]!.amount).toBe(0);
  });

  it('reconciles standalone INTEREST movement linked record to non-internal', () => {
    const debt = mkDebt({
      amount: 0,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: PRINCIPAL_TEN_K, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
        { id: 'm3', type: DebtMovementType.INTEREST, amount: INTEREST_ONE_K, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 2, note: '' },
      ],
    });
    const records = [
      mkRecord({ id: 'r2', date: '2026-02-01', type: RecordType.INCOME, amount: PRINCIPAL_TEN_K, isInternal: true, linkedMovementId: 'm2' }),
      mkRecord({ id: 'r3', date: '2026-02-01', type: RecordType.INCOME, amount: INTEREST_ONE_K, isInternal: true, linkedMovementId: 'm3' }),
    ];

    const res = reconcileAllDebts([debt], records, LABELS, mkDeps());

    expect(res.changed).toEqual({ debts: false, records: true });
    expect(res.records.find(r => r.id === 'r3')).toMatchObject({
      isInternal: false,
      amount: INTEREST_ONE_K,
      category: LABELS.debtInterestCategory,
      linkedMovementId: 'm3',
    });
  });

  it('is idempotent when executed twice', () => {
    const debt = mkDebt({
      amount: -INTEREST_ONE_K,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: PRINCIPAL_TEN_K, date: '2026-01-01', time: '10:00', createdAt: BASE_TS, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: AMOUNT_ELEVEN_K, date: '2026-02-01', time: '12:00', createdAt: BASE_TS + 1, note: '' },
      ],
    });
    const records = [
      mkRecord({ id: 'r2', date: '2026-02-01', type: RecordType.INCOME, amount: AMOUNT_ELEVEN_K, linkedMovementId: 'm2' }),
    ];

    const first = reconcileAllDebts([debt], records, LABELS, mkDeps());
    const second = reconcileAllDebts(first.debts, first.records, LABELS, mkDeps());

    expect(second.changed).toEqual({ debts: false, records: false });
    expect(second.records).toEqual(first.records);
    expect(second.debts).toEqual(first.debts);
  });
});
