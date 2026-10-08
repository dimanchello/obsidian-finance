import { describe, it, expect } from 'vitest';
import { isFutureTransaction } from '../domain/records';
import { calcNetBalance, calcAssets, calcCreditBurden } from '../domain/metrics/balanceMetrics';
import { calcGroupBreakdown } from '../domain/metrics/breakdownMetrics';
import { getCurrencyBalance, getCurrencyBalances } from '../domain/currencyBalance';
import { FinanceRecord, CurrencyExchange } from '../types';
import { RecordType, CurrencyOperationType } from '../constants';

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

  it('calcCreditBurden ignores future records', () => {
    const burden = calcCreditBurden([], [baseRecord, futureRecord], '2020-03-01');
    expect(burden).toBe(0);
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
