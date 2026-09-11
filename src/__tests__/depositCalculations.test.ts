import { describe, it, expect } from 'vitest';
import {
  getDepositEndDate,
  getDepositAccrued,
  getDepositProfit,
  getDepositInitialAmount,
  getDepositCurrentAmount,
  getDepositTypeLabel,
} from '../domain/depositCalculations';
import { DepositRecord } from '../types';
import { DepositAccrualType, DepositStatus, DepositType, PaymentStatus } from '../constants';
import { t } from '../i18n';

describe('depositCalculations', () => {
  const baseDeposit: DepositRecord = {
    id: 'dep-1',
    name: 'Test Deposit',
    bankName: 'Test Bank',
    type: DepositType.TERM,
    amount: 100000,
    interestRate: 10,
    termMonths: 12,
    accrualType: DepositAccrualType.CAPITALIZATION,
    startDate: '2026-01-01',
    status: DepositStatus.ACTIVE,
    createdAt: 123456789,
    note: '',
    topUps: [],
    withdrawals: [],
    accruals: [
      { id: 'acc-1', dueDate: '2026-02-01', amount: 800, status: PaymentStatus.PAID, paidDate: '2026-02-01' },
      { id: 'acc-2', dueDate: '2026-03-01', amount: 800, status: PaymentStatus.PAID, paidDate: '2026-03-01' },
      { id: 'acc-3', dueDate: '2026-04-01', amount: 800, status: PaymentStatus.PENDING },
    ],
  };

  it('calculates end date accurately', () => {
    expect(getDepositEndDate(baseDeposit)).toBe('2027-01-01');
  });

  it('calculates accrued profit from paid accruals only', () => {
    expect(getDepositAccrued(baseDeposit)).toBe(1600);
  });

  it('calculates total expected profit across all accruals', () => {
    expect(getDepositProfit(baseDeposit)).toBe(2400);
  });

  it('returns current amount directly from deposit', () => {
    expect(getDepositCurrentAmount(baseDeposit)).toBe(100000);
  });

  it('calculates initial amount by reversing topUps, withdrawals and capitalized interest', () => {
    const depWithMovements: DepositRecord = {
      ...baseDeposit,
      amount: 116600, // 100000 initial + 20000 topup - 5000 withdrawal + 1600 capitalized
      topUps: [
        { id: 'tu-1', amount: 20000, date: '2026-02-15', time: '', createdAt: 1, note: '' },
      ],
      withdrawals: [
        { id: 'wd-1', amount: 5000, date: '2026-03-10', time: '', createdAt: 2, note: '' },
      ],
    };
    // 116600 - 20000 + 5000 - 1600 = 100000
    expect(getDepositInitialAmount(depWithMovements)).toBe(100000);
  });

  it('does not subtract accrued interest from initial amount if paid to account', () => {
    const depToAccount: DepositRecord = {
      ...baseDeposit,
      amount: 115000, // 100000 initial + 20000 topup - 5000 withdrawal
      accrualType: DepositAccrualType.TO_ACCOUNT,
      topUps: [
        { id: 'tu-1', amount: 20000, date: '2026-02-15', time: '', createdAt: 1, note: '' },
      ],
      withdrawals: [
        { id: 'wd-1', amount: 5000, date: '2026-03-10', time: '', createdAt: 2, note: '' },
      ],
    };
    expect(getDepositInitialAmount(depToAccount)).toBe(100000);
  });

  it('handles demand deposit and missing dates gracefully', () => {
    const demandDeposit: DepositRecord = {
      ...baseDeposit,
      type: DepositType.DEMAND,
      termMonths: 0,
      startDate: '',
      accruals: [],
    };
    expect(getDepositEndDate(demandDeposit)).toBe('');
    expect(getDepositAccrued(demandDeposit)).toBe(0);
    expect(getDepositProfit(demandDeposit)).toBe(0);
    expect(getDepositInitialAmount(demandDeposit)).toBe(100000);
  });

  it('returns proper type label based on translations', () => {
    const ru = t('ru');
    expect(getDepositTypeLabel(DepositType.TERM, ru)).toBe(ru.depositTypeTerm);
    expect(getDepositTypeLabel(DepositType.DEMAND, ru)).toBe(ru.depositTypeDemand);
    expect(getDepositTypeLabel(DepositType.SAVINGS, ru)).toBe(ru.depositTypeSavings);
  });
});
