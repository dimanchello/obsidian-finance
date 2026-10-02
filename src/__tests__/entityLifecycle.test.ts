import { describe, it, expect } from 'vitest';
import {
  CreditRecord, DebtRecord, DepositRecord,
  CreditStatus, DepositStatus, DebtDirection, DebtMovementType, EntityListTab,
} from '../types';
import {
  isDebtOpen, isCreditOpen, isDepositOpen, matchesListTab, listTabFor,
} from '../domain/entityLifecycle';

function debt(movements: DebtRecord['movements'], interestRate = 0): DebtRecord {
  return {
    id: 'debt-1', person: 'Иван', amount: 1000, originalAmount: 1000, interestRate,
    direction: DebtDirection.BORROWED, date: '2026-01-01', time: '', dueDate: '',
    createdAt: 0, note: '', movements,
  };
}

function mov(type: DebtMovementType, amount: number) {
  return { id: `${type}-${String(amount)}`, type, amount, date: '2026-01-01', time: '', createdAt: 0, note: '' };
}

describe('entityLifecycle', () => {
  it('долг открыт, пока есть остаток', () => {
    expect(isDebtOpen(debt([mov(DebtMovementType.BORROW, 1000)]))).toBe(true);
    expect(isDebtOpen(debt([mov(DebtMovementType.BORROW, 1000), mov(DebtMovementType.REPAY, 400)]))).toBe(true);
    expect(isDebtOpen(debt([mov(DebtMovementType.BORROW, 1000), mov(DebtMovementType.REPAY, 1000)]))).toBe(false);
  });

  it('долг с процентами закрыт только после погашения процентов', () => {
    const repaidPrincipal = debt([mov(DebtMovementType.BORROW, 1000), mov(DebtMovementType.REPAY, 1000)], 10);
    expect(isDebtOpen(repaidPrincipal)).toBe(true);
    const repaidAll = debt([mov(DebtMovementType.BORROW, 1000), mov(DebtMovementType.REPAY, 1100)], 10);
    expect(isDebtOpen(repaidAll)).toBe(false);
  });

  it('кредит и вклад открыты по статусу', () => {
    expect(isCreditOpen({ status: CreditStatus.ACTIVE } as CreditRecord)).toBe(true);
    expect(isCreditOpen({ status: CreditStatus.PAID } as CreditRecord)).toBe(false);
    expect(isDepositOpen({ status: DepositStatus.ACTIVE } as DepositRecord)).toBe(true);
    expect(isDepositOpen({ status: DepositStatus.CLOSED } as DepositRecord)).toBe(false);
  });

  it('matchesListTab', () => {
    expect(matchesListTab(true, EntityListTab.ALL)).toBe(true);
    expect(matchesListTab(false, EntityListTab.ALL)).toBe(true);
    expect(matchesListTab(true, EntityListTab.OPEN)).toBe(true);
    expect(matchesListTab(false, EntityListTab.OPEN)).toBe(false);
    expect(matchesListTab(true, EntityListTab.CLOSED)).toBe(false);
    expect(matchesListTab(false, EntityListTab.CLOSED)).toBe(true);
  });

  it('listTabFor выбирает вкладку, где сущность видна', () => {
    expect(listTabFor(true)).toBe(EntityListTab.OPEN);
    expect(listTabFor(false)).toBe(EntityListTab.CLOSED);
  });
});
