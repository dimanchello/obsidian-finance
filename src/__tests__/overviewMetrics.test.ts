import { describe, it, expect } from 'vitest';
import type { FinanceRecord, DebtRecord, CreditRecord, DepositRecord, CurrencyExchange } from '../types';
import {
  calcNetBalance, calcAssets, calcLiabilities,
  calcCreditBurden, calcUpcomingPayments,
  groupRecordsByMonth, calcCreditBurdenOverTime,
  calcAssetsLiabilitiesOverTime,
} from '../domain/overviewMetrics';

function rec(overrides: Partial<FinanceRecord> = {}): FinanceRecord {
  return { id: 'r1', createdAt: 0, date: '2026-01-15', time: '',
    type: 'income', amount: 1000, category: '', tag: '', payer: '',
    note: '', attachmentPath: '', ...overrides };
}
function debt(overrides: Partial<DebtRecord> = {}): DebtRecord {
  return { id: 'd1', person: 'А', amount: 1000, originalAmount: 1000,
    interestRate: 0, direction: 'lent', date: '2026-01-01', time: '',
    dueDate: '2027-01-01', createdAt: 0, note: '',
    movements: [{ id: 'm1', type: 'borrow', amount: 1000,
      date: '2026-01-01', time: '', createdAt: 0, note: '' }],
    ...overrides };
}
function credit(overrides: Partial<CreditRecord> = {}): CreditRecord {
  return { id: 'c1', name: '', type: 'consumer', bankName: '', originalAmount: 100000,
    currentAmount: 100000, interestRate: 10, monthlyPayment: 5000, termMonths: 24,
    startDate: '2025-01-01', createdAt: 0, note: '', status: 'active',
    earlyRepaymentOption: null, payments: [], ...overrides };
}
function deposit(overrides: Partial<DepositRecord> = {}): DepositRecord {
  return { id: 'dep1', name: '', type: 'term', bankName: '', amount: 50000,
    interestRate: 8, startDate: '2026-01-01', termMonths: 12, accrualType: 'to_account',
    createdAt: 0, note: '', status: 'active', accruals: [], topUps: [], withdrawals: [],
    ...overrides };
}
function exchange(overrides: Partial<CurrencyExchange> = {}): CurrencyExchange {
  return { id: 'e1', createdAt: 0, date: '2026-01-01', time: '',
    type: 'buy', amountInAccountCurrency: 9500, targetCurrency: 'USD',
    targetAmount: 100, exchangeRate: 95, provider: '', note: '', ...overrides };
}

describe('calcNetBalance', () => {
  it('доход минус расход', () => {
    expect(calcNetBalance([rec({ type: 'income', amount: 1000 }), rec({ type: 'expense', amount: 400 })])).toBe(600);
  });
  it('isInternal игнорируется', () => {
    expect(calcNetBalance([rec({ amount: 1000 }), rec({ type: 'expense', amount: 200, isInternal: true })])).toBe(1000);
  });
  it('пустой массив → 0', () => { expect(calcNetBalance([])).toBe(0); });
});

describe('calcAssets', () => {
  it('сумма депозита + валюта + одолженный долг', () => {
    const result = calcAssets(
      [deposit({ amount: 50000 })],
      [exchange({ targetAmount: 100, exchangeRate: 95, type: 'buy' })],
      [debt({ direction: 'lent' })],
    );
    expect(result).toBe(50000 + 100 * 95 + 1000);
  });
  it('закрытый депозит не считается', () => {
    expect(calcAssets([deposit({ status: 'closed' })], [], [])).toBe(0);
  });
  it('долг borrowed не входит в активы', () => {
    expect(calcAssets([], [], [debt({ direction: 'borrowed' })])).toBe(0);
  });
});

describe('calcLiabilities', () => {
  it('остаток по кредиту + взятый долг', () => {
    const c = credit({ payments: [] }); // все 100000 остаток
    const d = debt({ direction: 'borrowed' });
    expect(calcLiabilities([c], [d])).toBe(100000 + 1000);
  });
  it('погашенный кредит не считается', () => {
    expect(calcLiabilities([credit({ status: 'paid' })], [])).toBe(0);
  });
});

describe('calcCreditBurden', () => {
  it('нет дохода → null', () => {
    expect(calcCreditBurden([credit({ monthlyPayment: 5000 })], [], '2026-08-21')).toBeNull();
  });
  it('нагрузка = платёж / средний доход * 100', () => {
    const incomeRecords = [
      rec({ date: '2026-05-22', amount: 10000 }),
      rec({ date: '2026-06-22', amount: 10000 }),
      rec({ date: '2026-07-22', amount: 10000 }),
    ];
    // startDate = 2026-05-21, все 3 записи попадают
    // totalIncome=30000, avgMonthlyIncome=30000/3=10000
    // monthlyBurden=5000, burden=5000/10000*100=50%
    expect(calcCreditBurden([credit({ monthlyPayment: 5000 })], incomeRecords, '2026-08-21')).toBe(50);
  });
});

describe('calcUpcomingPayments', () => {
  it('платёж кредита в пределах 30 дней', () => {
    const c = credit({ payments: [{ id: 'p1', amount: 5000, dueDate: '2026-09-01',
      status: 'pending' }] });
    expect(calcUpcomingPayments([c], [], '2026-08-21')).toBe(5000);
  });
  it('просроченный платёж (в прошлом) не включается', () => {
    const c = credit({ payments: [{ id: 'p1', amount: 5000, dueDate: '2026-07-01',
      status: 'pending' }] });
    expect(calcUpcomingPayments([c], [], '2026-08-21')).toBe(0);
  });
  it('долг с dueDate в диапазоне', () => {
    const d = debt({ direction: 'borrowed', dueDate: '2026-09-01' });
    expect(calcUpcomingPayments([], [d], '2026-08-21')).toBe(1000);
  });
});

describe('groupRecordsByMonth', () => {
  it('группирует записи по месяцам', () => {
    const records = [
      rec({ date: '2026-01-15', type: 'income', amount: 1000 }),
      rec({ date: '2026-01-20', type: 'expense', amount: 400 }),
      rec({ date: '2026-02-10', type: 'income', amount: 2000 }),
    ];
    const groups = groupRecordsByMonth(records);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ label: '2026-01', income: 1000, expense: 400, net: 600 });
    expect(groups[1]).toEqual({ label: '2026-02', income: 2000, expense: 0, net: 2000 });
  });
  it('isInternal игнорируется', () => {
    const records = [
      rec({ date: '2026-01-15', type: 'income', amount: 1000 }),
      rec({ date: '2026-01-20', type: 'expense', amount: 400, isInternal: true }),
    ];
    const groups = groupRecordsByMonth(records);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ label: '2026-01', income: 1000, expense: 0, net: 1000 });
  });
  it('пустой массив → пустой результат', () => {
    expect(groupRecordsByMonth([])).toEqual([]);
  });
});

describe('calcCreditBurdenOverTime', () => {
  it('рассчитывает нагрузку по месяцам', () => {
    const credits = [
      credit({
        payments: [
          { id: 'p1', amount: 5000, dueDate: '2026-05-15', status: 'paid', principalPart: 4000, interestPart: 1000 },
          { id: 'p2', amount: 5000, dueDate: '2026-06-15', status: 'paid', principalPart: 4100, interestPart: 900 },
        ]
      })
    ];
    const incomeRecords = [
      rec({ date: '2026-05-10', amount: 10000 }),
      rec({ date: '2026-06-10', amount: 10000 }),
    ];
    const result = calcCreditBurdenOverTime(credits, incomeRecords, '2026-07-01', 3);
    expect(result).toHaveLength(3);

    // Май: платёж 4000+1000=5000, доход 10000 → 50%
    const may = result.find(r => r.label === '2026-05');
    expect(may?.principal).toBe(4000);
    expect(may?.interest).toBe(1000);
    expect(may?.total).toBe(5000);
    expect(may?.burdenPercent).toBe(50);

    // Июнь: платёж 4100+900=5000, доход 10000 → 50%
    const jun = result.find(r => r.label === '2026-06');
    expect(jun?.principal).toBe(4100);
    expect(jun?.interest).toBe(900);
    expect(jun?.burdenPercent).toBe(50);
  });

  it('нет дохода → burdenPercent = null', () => {
    const credits = [
      credit({
        payments: [{ id: 'p1', amount: 5000, dueDate: '2026-05-15', status: 'paid', principalPart: 4000, interestPart: 1000 }]
      })
    ];
    const result = calcCreditBurdenOverTime(credits, [], '2026-05-31', 1);
    expect(result[0].burdenPercent).toBeNull();
  });
});

describe('calcAssetsLiabilitiesOverTime', () => {
  it('рассчитывает активы и обязательства по месяцам', () => {
    const deposits = [
      deposit({ status: 'active', startDate: '2026-01-01', balance: 50000 }),
    ];
    const exchanges: CurrencyExchange[] = [];
    const credits = [
      credit({
        startDate: '2026-01-15',
        amount: 100000,
        payments: [
          { id: 'p1', amount: 5000, dueDate: '2026-02-15', status: 'paid', principalPart: 4000, interestPart: 1000 },
        ]
      }),
    ];
    const debts = [
      debt({ direction: 'borrowed', dateCreated: '2026-02-01', amount: 5000 }),
    ];

    const result = calcAssetsLiabilitiesOverTime(deposits, exchanges, credits, debts, '2026-03-01', 3);
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe('2026-01');
    expect(result[1].label).toBe('2026-02');
    expect(result[2].label).toBe('2026-03');

    // Январь: deposits 50k
    expect(result[0].assets).toBe(50000);

    // Февраль: после платежа кредита + долг
    expect(result[1].liabilities).toBeGreaterThan(90000); // ~96k credit + 5k debt
  });
});
