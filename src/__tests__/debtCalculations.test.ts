import { describe, it, expect } from 'vitest';
import { DebtRecord, DebtDirection, DebtMovementType, RecordType } from '../types';
import {
  getDebtOriginal,
  getDebtRepaid,
  getDebtWithInterest,
  getDebtRemaining,
  isDebtPaidOff,
} from '../domain/debtCalculations';
import { createLinkedRecord } from '../domain/records';

function createMockDebt(overrides: Partial<DebtRecord> = {}): DebtRecord {
  return {
    id: 'debt-1',
    person: 'Иван',
    amount: 1000,
    originalAmount: 1000,
    interestRate: 0,
    direction: DebtDirection.LENT,
    date: '2026-01-01',
    time: '12:00',
    dueDate: '2026-06-01',
    createdAt: 1000000,
    note: '',
    movements: [
      {
        id: 'mov-1',
        type: DebtMovementType.BORROW,
        amount: 1000,
        date: '2026-01-01',
        time: '12:00',
        createdAt: 1000000,
        note: 'Занял',
      },
    ],
    ...overrides,
  };
}

describe('debtCalculations', () => {
  it('getDebtOriginal sums all borrow movements', () => {
    const debt = createMockDebt({
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: 500, date: '2026-01-01', time: '', createdAt: 1, note: '' },
        { id: 'm2', type: DebtMovementType.BORROW, amount: 300, date: '2026-01-02', time: '', createdAt: 2, note: '' },
        { id: 'm3', type: DebtMovementType.REPAY, amount: 200, date: '2026-01-03', time: '', createdAt: 3, note: '' },
      ],
    });
    expect(getDebtOriginal(debt)).toBe(800);
  });

  it('getDebtRepaid sums all repay movements', () => {
    const debt = createMockDebt({
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: 1000, date: '2026-01-01', time: '', createdAt: 1, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: 400, date: '2026-01-02', time: '', createdAt: 2, note: '' },
        { id: 'm3', type: DebtMovementType.REPAY, amount: 250, date: '2026-01-03', time: '', createdAt: 3, note: '' },
      ],
    });
    expect(getDebtRepaid(debt)).toBe(650);
  });

  it('getDebtWithInterest calculates interest correctly', () => {
    const debtNoInterest = createMockDebt({ interestRate: 0 });
    expect(getDebtWithInterest(debtNoInterest)).toBe(1000);

    const debtWithInterest = createMockDebt({ interestRate: 15 });
    expect(getDebtWithInterest(debtWithInterest)).toBe(1150);

    const debtFractional = createMockDebt({
      interestRate: 7.5,
      movements: [{ id: 'm1', type: DebtMovementType.BORROW, amount: 333.33, date: '2026-01-01', time: '', createdAt: 1, note: '' }],
    });
    expect(getDebtWithInterest(debtFractional)).toBe(358.33);
  });

  it('getDebtRemaining calculates remaining debt and clamps to 0', () => {
    const debt = createMockDebt({
      interestRate: 10, // original 1000 -> total 1100
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: 1000, date: '2026-01-01', time: '', createdAt: 1, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: 600, date: '2026-01-02', time: '', createdAt: 2, note: '' },
      ],
    });
    expect(getDebtRemaining(debt)).toBe(500);

    // Overpaid debt
    const overpaidDebt = createMockDebt({
      interestRate: 0,
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: 1000, date: '2026-01-01', time: '', createdAt: 1, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: 1200, date: '2026-01-02', time: '', createdAt: 2, note: '' },
      ],
    });
    expect(getDebtRemaining(overpaidDebt)).toBe(0);
  });

  it('isDebtPaidOff checks if remaining amount is 0 or less', () => {
    const unpaidDebt = createMockDebt({
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: 1000, date: '2026-01-01', time: '', createdAt: 1, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: 999.99, date: '2026-01-02', time: '', createdAt: 2, note: '' },
      ],
    });
    expect(isDebtPaidOff(unpaidDebt)).toBe(false);

    const paidDebt = createMockDebt({
      movements: [
        { id: 'm1', type: DebtMovementType.BORROW, amount: 1000, date: '2026-01-01', time: '', createdAt: 1, note: '' },
        { id: 'm2', type: DebtMovementType.REPAY, amount: 1000, date: '2026-01-02', time: '', createdAt: 2, note: '' },
      ],
    });
    expect(isDebtPaidOff(paidDebt)).toBe(true);
  });
});

describe('createLinkedRecord', () => {
  it('creates record with internal flag and linkedId', () => {
    const deps = {
      newId: () => 'uuid-123',
      now: 1700000000000,
      nowTime: '14:30',
    };
    const rec = createLinkedRecord(deps, {
      date: '2026-05-10',
      type: RecordType.EXPENSE,
      amount: 5000,
      category: 'Долг',
      payer: 'Банк',
      note: 'Возврат долга',
      linkedId: 'debt-456',
    });

    expect(rec).toEqual({
      id: 'uuid-123',
      createdAt: 1700000000000,
      date: '2026-05-10',
      time: '14:30',
      type: RecordType.EXPENSE,
      amount: 5000,
      category: 'Долг',
      payer: 'Банк',
      note: 'Возврат долга',
      tag: '',
      attachmentPath: '',
      isInternal: true,
      linkedId: 'debt-456',
    });
  });
});
