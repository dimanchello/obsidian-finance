import { describe, it, expect } from 'vitest';
import { isFutureTransaction } from '../domain/records';
import {
  calcNetBalance, calcAssets, calcLiabilities, calcCreditBurden, calcUpcomingPayments,
} from '../domain/metrics/balanceMetrics';
import { calcGroupBreakdown } from '../domain/metrics/breakdownMetrics';
import { calcCreditBurdenOverTime } from '../domain/metrics/trendMetrics';
import { getCurrencyBalance, getCurrencyBalances } from '../domain/currencyBalance';
import { getDepositCurrentAmount } from '../domain/depositCalculations';
import { getDebtRemaining } from '../domain/debtCalculations';
import { calcDebtsBreakdown } from '../domain/metrics/breakdownMetrics';
import type { CreditRecord, DebtRecord, DepositRecord, FinanceRecord, CurrencyExchange } from '../types';
import {
  RecordType, CurrencyOperationType, CreditType, CreditStatus, EarlyRepaymentOption,
  DebtDirection, DebtMovementType, DepositType, DepositStatus, DepositAccrualType,
} from '../constants';

const burdenCredit: CreditRecord = {
  id: 'credit-burden',
  name: 'Credit',
  type: CreditType.CONSUMER,
  bankName: '',
  originalAmount: 1200,
  currentAmount: 1200,
  interestRate: 0,
  monthlyPayment: 100,
  termMonths: 12,
  startDate: '2026-01-01',
  createdAt: 0,
  note: '',
  status: CreditStatus.ACTIVE,
  earlyRepaymentOption: EarlyRepaymentOption.TERM,
  payments: [],
};

describe('isFutureTransaction', () => {
  const referenceNow = new Date('2026-06-15T12:00:00');

  it('identifies past dates as non-future', () => {
    expect(isFutureTransaction({ date: '2026-06-14' }, referenceNow)).toBe(false);
  });

  it('identifies future dates as future', () => {
    expect(isFutureTransaction({ date: '2026-06-16' }, referenceNow)).toBe(true);
  });

  it('identifies past time on current date as non-future', () => {
    expect(isFutureTransaction({ date: '2026-06-15', time: '11:59' }, referenceNow)).toBe(false);
  });

  it('identifies future time on current date as future', () => {
    expect(isFutureTransaction({ date: '2026-06-15', time: '12:01' }, referenceNow)).toBe(true);
  });

  it('treats equal date and time as non-future', () => {
    expect(isFutureTransaction({ date: '2026-06-15', time: '12:00' }, referenceNow)).toBe(false);
  });

  it('treats today without time as non-future', () => {
    expect(isFutureTransaction({ date: '2026-06-15' }, referenceNow)).toBe(false);
  });
});

describe('Metrics future transactions exclusion', () => {
  const referenceNow = new Date('2026-06-15T12:00:00');

  const baseRecord: FinanceRecord = {
    id: 'r1',
    createdAt: 1000,
    date: '2020-01-01',
    time: '10:00',
    type: RecordType.INCOME,
    amount: 1000,
    category: 'Salary',
    tag: '',
    payer: '',
    note: '',
    attachmentPath: '',
  };

  const futureRecord: FinanceRecord = {
    ...baseRecord,
    id: 'r2',
    date: '2099-01-01',
    type: RecordType.INCOME,
    amount: 5000,
    category: 'Bonus',
  };

  const pastExpense: FinanceRecord = {
    ...baseRecord,
    id: 'r3',
    date: '2020-01-02',
    type: RecordType.EXPENSE,
    amount: 300,
    category: 'Food',
  };

  const futureExpense: FinanceRecord = {
    ...baseRecord,
    id: 'r4',
    date: '2099-01-02',
    type: RecordType.EXPENSE,
    amount: 700,
    category: 'Travel',
  };

  it('calcNetBalance ignores future income and expense', () => {
    const net = calcNetBalance([baseRecord, futureRecord, pastExpense, futureExpense]);
    expect(net).toBe(700); // 1000 - 300
  });

  it('calcAssets ignores future exchanges', () => {
    const pastEx: CurrencyExchange = {
      id: 'e1',
      createdAt: 1000,
      date: '2020-01-01',
      time: '10:00',
      type: CurrencyOperationType.BUY,
      amountInAccountCurrency: 7500,
      targetCurrency: 'USD',
      targetAmount: 100,
      exchangeRate: 75,
      provider: 'Bank',
      note: '',
    };
    const futureEx: CurrencyExchange = {
      id: 'e2',
      createdAt: 2000,
      date: '2099-01-01',
      time: '10:00',
      type: CurrencyOperationType.BUY,
      amountInAccountCurrency: 15000,
      targetCurrency: 'USD',
      targetAmount: 200,
      exchangeRate: 75,
      provider: 'Bank',
      note: '',
    };
    const assets = calcAssets([], [pastEx, futureEx], []);
    expect(assets).toBe(7500);
  });

  it('calcCreditBurden ignores future income dated inside the selected period', () => {
    const currentIncome = { ...baseRecord, date: '2026-06-10', amount: 1000 };
    const plannedIncome = { ...futureRecord, date: '2026-06-20', amount: 5000 };
    const burden = calcCreditBurden([burdenCredit], [currentIncome, plannedIncome], '2026-06-30', referenceNow);
    expect(burden).toBeCloseTo(30);
  });

  it('credit burden chart ignores future income inside the displayed month', () => {
    const currentIncome = { ...baseRecord, date: '2026-06-10', amount: 1000 };
    const plannedIncome = { ...futureRecord, date: '2026-06-20', amount: 5000 };
    const [month] = calcCreditBurdenOverTime(
      [burdenCredit],
      [currentIncome, plannedIncome],
      '2026-06-01',
      '2026-06-30',
      '2026-06-30',
      1,
      referenceNow,
    );
    expect(month?.burdenPercent).toBe(10);
  });

  it('calcGroupBreakdown ignores future records', () => {
    const breakdown = calcGroupBreakdown([baseRecord, futureRecord], 'category');
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]!.key).toBe('Salary');
    expect(breakdown[0]!.income).toBe(1000);
  });
});

describe('Currency balances future exchanges exclusion', () => {
  const pastExchange: CurrencyExchange = {
    id: 'e1',
    createdAt: 1000,
    date: '2020-01-01',
    time: '12:00',
    type: CurrencyOperationType.BUY,
    amountInAccountCurrency: 7500,
    targetCurrency: 'USD',
    targetAmount: 100,
    exchangeRate: 75,
    provider: 'Bank',
    note: '',
  };

  const futureExchange: CurrencyExchange = {
    id: 'e2',
    createdAt: 2000,
    date: '2099-01-01',
    time: '12:00',
    type: CurrencyOperationType.BUY,
    amountInAccountCurrency: 16000,
    targetCurrency: 'USD',
    targetAmount: 200,
    exchangeRate: 80,
    provider: 'Bank',
    note: '',
  };

  it('getCurrencyBalance excludes future exchanges', () => {
    const balance = getCurrencyBalance([pastExchange, futureExchange], 'USD');
    expect(balance).toBe(100);
  });

  it('getCurrencyBalances excludes future exchanges from aggregate metrics', () => {
    const map = getCurrencyBalances([pastExchange, futureExchange]);
    const metrics = map.get('USD');
    expect(metrics).toBeDefined();
    expect(metrics!.balance).toBe(100);
    expect(metrics!.totalBought).toBe(100);
    expect(metrics!.averageBuyRate).toBe(75);
  });
});

describe('Future deposit and debt movements exclusion', () => {
  const referenceNow = new Date('2026-06-15T12:00:00');

  it('does not include future deposit top-ups and withdrawals in current assets', () => {
    const deposit: DepositRecord = {
      id: 'dep-future',
      name: 'Savings',
      type: DepositType.TERM,
      bankName: '',
      amount: 55000,
      interestRate: 0,
      startDate: '2026-01-01',
      termMonths: 12,
      accrualType: DepositAccrualType.TO_ACCOUNT,
      createdAt: 0,
      note: '',
      status: DepositStatus.ACTIVE,
      accruals: [],
      topUps: [{ id: 'top-up-future', amount: 10000, date: '2026-06-16', time: '', createdAt: 1, note: '' }],
      withdrawals: [{ id: 'withdrawal-future', amount: 5000, date: '2026-06-17', time: '', createdAt: 2, note: '' }],
    };

    expect(getDepositCurrentAmount(deposit, referenceNow)).toBe(50000);
    expect(calcAssets([deposit], [], [], referenceNow)).toBe(50000);
  });

  it('excludes future debt borrowings and repayments from assets, liabilities, and upcoming debt totals', () => {
    const debt: DebtRecord = {
      id: 'debt-future',
      person: 'Alex',
      amount: 1100,
      originalAmount: 1000,
      interestRate: 0,
      direction: DebtDirection.BORROWED,
      date: '2026-01-01',
      time: '',
      dueDate: '2026-06-20',
      createdAt: 0,
      note: '',
      movements: [
        { id: 'movement-past', type: DebtMovementType.BORROW, amount: 1000, date: '2026-01-01', time: '', createdAt: 0, note: '' },
        { id: 'movement-future-borrow', type: DebtMovementType.BORROW, amount: 200, date: '2026-06-16', time: '', createdAt: 1, note: '' },
        { id: 'movement-future-repay', type: DebtMovementType.REPAY, amount: 100, date: '2026-06-17', time: '', createdAt: 2, note: '' },
      ],
    };

    expect(calcAssets([], [], [{ ...debt, direction: DebtDirection.LENT }], referenceNow)).toBe(1000);
    expect(calcLiabilities([], [debt], referenceNow)).toBe(1000);
    expect(calcUpcomingPayments([], [debt], '2026-06-15', referenceNow)).toBe(1000);
    expect(getDebtRemaining(debt, referenceNow)).toBe(1000);
    expect(calcDebtsBreakdown([debt], referenceNow)[0]?.borrowed).toBe(1000);
  });
});
