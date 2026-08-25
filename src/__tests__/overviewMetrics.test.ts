import { describe, it, expect } from 'vitest';
import type { FinanceRecord, DebtRecord, CreditRecord, DepositRecord, CurrencyExchange } from '../types';
import {
  calcNetBalance, calcAssets, calcLiabilities,
  calcCreditBurden, calcUpcomingPayments,
  groupRecordsByMonth, calcCreditBurdenOverTime,
  calcAssetsLiabilitiesOverTime, filterRecordsByDateRange,
  calcGroupBreakdown, calcSavingsRateOverTime,
  calcDebtsBreakdown, calcDepositInterestOverTime,
  calcActiveDepositsProgress,
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
      deposit({ status: 'active', startDate: '2026-01-01', amount: 50000 }),
    ];
    const exchanges: CurrencyExchange[] = [];
    const credits = [
      credit({
        startDate: '2026-01-15',
        originalAmount: 100000,
        payments: [
          { id: 'p1', amount: 5000, dueDate: '2026-02-15', status: 'paid', principalPart: 4000, interestPart: 1000 },
        ]
      }),
    ];
    const debts = [
      debt({ direction: 'borrowed', date: '2026-02-01', amount: 5000 }),
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

describe('filterRecordsByDateRange', () => {
  const records = [
    rec({ id: '1', date: '2026-01-10' }),
    rec({ id: '2', date: '2026-02-15' }),
    rec({ id: '3', date: '2026-03-20' }),
  ];

  it('фильтрует по dateFrom и dateTo', () => {
    const res = filterRecordsByDateRange(records, '2026-02-01', '2026-02-28');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('2');
  });

  it('фильтрует только по dateFrom', () => {
    const res = filterRecordsByDateRange(records, '2026-02-01');
    expect(res).toHaveLength(2);
    expect(res.map(r => r.id)).toEqual(['2', '3']);
  });

  it('фильтрует только по dateTo', () => {
    const res = filterRecordsByDateRange(records, undefined, '2026-02-01');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('1');
  });

  it('без фильтра возвращает все записи', () => {
    const res = filterRecordsByDateRange(records);
    expect(res).toHaveLength(3);
  });
});

describe('calcGroupBreakdown', () => {
  const records = [
    rec({ type: 'expense', category: 'Еда', tag: 'дом', payer: 'Иван', amount: 500 }),
    rec({ type: 'expense', category: 'Еда', tag: 'работа', payer: 'Иван', amount: 300 }),
    rec({ type: 'income', category: 'Зарплата', tag: 'работа', payer: 'ООО', amount: 5000 }),
    rec({ type: 'expense', category: 'Транспорт', tag: 'город', payer: 'Мария', amount: 200 }),
    rec({ type: 'expense', category: '', tag: '', payer: '', amount: 100 }),
    rec({ type: 'expense', category: 'Еда', amount: 1000, isInternal: true }),
  ];

  it('группирует по category и сортирует по total desc', () => {
    const breakdown = calcGroupBreakdown(records, 'category', 'Без категории');
    expect(breakdown[0]).toEqual({ key: 'Зарплата', income: 5000, expense: 0, net: 5000, total: 5000 });
    expect(breakdown[1]).toEqual({ key: 'Еда', income: 0, expense: 800, net: -800, total: 800 });
    expect(breakdown[2]).toEqual({ key: 'Транспорт', income: 0, expense: 200, net: -200, total: 200 });
    expect(breakdown[3]).toEqual({ key: 'Без категории', income: 0, expense: 100, net: -100, total: 100 });
  });

  it('группирует по tag', () => {
    const breakdown = calcGroupBreakdown(records, 'tag', 'Без тега');
    const work = breakdown.find(b => b.key === 'работа');
    expect(work).toEqual({ key: 'работа', income: 5000, expense: 300, net: 4700, total: 5300 });
  });

  it('группирует по payer', () => {
    const breakdown = calcGroupBreakdown(records, 'payer', 'Без плательщика');
    const ivan = breakdown.find(b => b.key === 'Иван');
    expect(ivan).toEqual({ key: 'Иван', income: 0, expense: 800, net: -800, total: 800 });
  });

  it('игнорирует isInternal записи', () => {
    const breakdown = calcGroupBreakdown(records, 'category');
    const food = breakdown.find(b => b.key === 'Еда');
    expect(food?.expense).toBe(800);
  });

  it('группирует по year', () => {
    const dateRecords = [
      rec({ date: '2024-05-10', type: 'income', amount: 3000 }),
      rec({ date: '2025-06-15', type: 'expense', amount: 1000 }),
      rec({ date: '2025-08-20', type: 'income', amount: 2000 }),
    ];
    const breakdown = calcGroupBreakdown(dateRecords, 'year');
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0].key).toBe('2025');
    expect(breakdown[0].income).toBe(2000);
    expect(breakdown[0].expense).toBe(1000);
    expect(breakdown[1].key).toBe('2024');
  });

  it('группирует по month', () => {
    const dateRecords = [
      rec({ date: '2026-01-10', type: 'income', amount: 3000 }),
      rec({ date: '2026-02-15', type: 'expense', amount: 1000 }),
    ];
    const breakdown = calcGroupBreakdown(dateRecords, 'month');
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0].key).toBe('2026-02');
    expect(breakdown[1].key).toBe('2026-01');
  });

  it('группирует по week', () => {
    const dateRecords = [
      rec({ date: '2026-08-25', type: 'expense', amount: 500 }),
    ];
    const breakdown = calcGroupBreakdown(dateRecords, 'week');
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].key).toContain('2026-W');
  });
});

describe('calcSavingsRateOverTime', () => {
  it('нулевой доход даёт 0% savings rate, не -100%', () => {
    const records = [rec({ date: '2026-01-15', type: 'expense', amount: 500 })];
    const result = calcSavingsRateOverTime(records, '2026-01-01', '2026-01-31', '2026-08-25', 1);
    expect(result).toHaveLength(1);
    expect(result[0].income).toBe(0);
    expect(result[0].expense).toBe(500);
    expect(result[0].savingsRate).toBe(0);
  });

  it('положительный доход и расход даёт корректный процент', () => {
    const records = [
      rec({ date: '2026-01-15', type: 'income', amount: 1000 }),
      rec({ date: '2026-01-20', type: 'expense', amount: 600 }),
    ];
    const result = calcSavingsRateOverTime(records, '2026-01-01', '2026-01-31', '2026-08-25', 1);
    expect(result).toHaveLength(1);
    expect(result[0].income).toBe(1000);
    expect(result[0].expense).toBe(600);
    expect(result[0].savings).toBe(400);
    expect(result[0].savingsRate).toBe(40);
  });

  it('рассчитывает норму сбережений по месяцам', () => {
    const records = [
      rec({ date: '2026-01-10', type: 'income', amount: 10000 }),
      rec({ date: '2026-01-20', type: 'expense', amount: 6000 }),
      rec({ date: '2026-02-10', type: 'income', amount: 10000 }),
      rec({ date: '2026-02-20', type: 'expense', amount: 12000 }),
    ];

    const result = calcSavingsRateOverTime(records, '2026-01-01', '2026-02-28');
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('2026-01');
    expect(result[0].savings).toBe(4000);
    expect(result[0].savingsRate).toBe(40);

    expect(result[1].label).toBe('2026-02');
    expect(result[1].savings).toBe(-2000);
    expect(result[1].savingsRate).toBe(-20);
  });
});

describe('calcDebtsBreakdown', () => {
  it('агрегирует долги по людям и рассчитывает прогресс возврата', () => {
    const debts = [
      debt({
        person: 'Иван',
        amount: 5000,
        direction: 'lent',
        originalAmount: 6000,
        movements: [
          { id: 'm1', type: 'borrow', amount: 6000, date: '2026-01-01', time: '', createdAt: 1, note: '' },
          { id: 'm2', type: 'repay', amount: 1000, date: '2026-02-01', time: '', createdAt: 2, note: '' },
        ],
      }),
      debt({ person: 'Иван', amount: 2000, direction: 'borrowed' }),
      debt({ person: 'Анна', amount: 3000, direction: 'borrowed' }),
    ];

    const breakdown = calcDebtsBreakdown(debts);
    expect(breakdown).toHaveLength(2);
    const ivan = breakdown.find(b => b.person === 'Иван');
    expect(ivan?.lent).toBe(5000);
    expect(ivan?.lentRepaid).toBe(1000);
    expect(ivan?.lentTotal).toBe(6000);
    expect(ivan?.lentRepaidPct).toBe(17);
    expect(ivan?.borrowed).toBe(2000);
    expect(ivan?.net).toBe(3000);

    const anna = breakdown.find(b => b.person === 'Анна');
    expect(anna?.lent).toBe(0);
    expect(anna?.borrowed).toBe(3000);
    expect(anna?.net).toBe(-3000);
  });
});

describe('calcDepositInterestOverTime', () => {
  it('агрегирует выплаченные и плановые проценты по месяцам', () => {
    const deposits = [
      deposit({
        accruals: [
          { id: 'a1', amount: 500, dueDate: '2026-01-15', status: 'paid', paidDate: '2026-01-15' },
          { id: 'a2', amount: 600, dueDate: '2026-02-15', status: 'pending' },
          { id: 'a3', amount: 400, dueDate: '2026-02-20', status: 'paid', paidDate: '2026-02-20' },
        ],
      }),
    ];

    const result = calcDepositInterestOverTime(deposits, '2026-01-01', '2026-02-28');
    expect(result).toHaveLength(2);
    expect(result[0].monthKey).toBe('2026-01');
    expect(result[0].paidInterest).toBe(500);
    expect(result[0].pendingInterest).toBe(0);
    expect(result[0].total).toBe(500);

    expect(result[1].monthKey).toBe('2026-02');
    expect(result[1].paidInterest).toBe(400);
    expect(result[1].pendingInterest).toBe(600);
    expect(result[1].total).toBe(1000);
  });

  it('возвращает нули для месяцев без начислений', () => {
    const result = calcDepositInterestOverTime([], '2026-01-01', '2026-01-31');
    expect(result).toHaveLength(1);
    expect(result[0].paidInterest).toBe(0);
    expect(result[0].pendingInterest).toBe(0);
    expect(result[0].total).toBe(0);
  });

  it('включает будущие месяцы с плановыми начислениями при отсутствии фильтра по датам', () => {
    const deposits = [
      deposit({
        accruals: [
          { id: 'a1', amount: 500, dueDate: '2026-07-15', status: 'paid', paidDate: '2026-07-15' },
          { id: 'a2', amount: 500, dueDate: '2026-08-15', status: 'paid', paidDate: '2026-08-15' },
          { id: 'a3', amount: 500, dueDate: '2026-09-15', status: 'pending' },
          { id: 'a4', amount: 500, dueDate: '2026-10-15', status: 'pending' },
          { id: 'a5', amount: 500, dueDate: '2026-11-15', status: 'pending' },
        ],
      }),
    ];

    const result = calcDepositInterestOverTime(deposits, '', '', '2026-08-25');
    const months = result.map(r => r.monthKey);
    expect(months).toContain('2026-07');
    expect(months).toContain('2026-08');
    expect(months).toContain('2026-09');
    expect(months).toContain('2026-10');
    expect(months).toContain('2026-11');

    const nov = result.find(r => r.monthKey === '2026-11');
    expect(nov?.pendingInterest).toBe(500);
    expect(nov?.paidInterest).toBe(0);
    expect(nov?.cumulativeTotal).toBe(2500);
    expect(nov?.segments).toHaveLength(1);
    expect(nov?.segments[0].amount).toBe(500);
    expect(nov?.segments[0].status).toBe('pending');
  });
});

describe('calcActiveDepositsProgress', () => {
  it('рассчитывает прогресс срока, дату окончания и прибыль для активных вкладов', () => {
    const deposits = [
      deposit({
        id: 'dep1',
        name: 'Накопительный',
        bankName: 'Сбер',
        amount: 100000,
        interestRate: 16,
        startDate: '2026-01-01',
        termMonths: 12,
        status: 'active',
        accrualType: 'capitalization',
        accruals: [
          { id: 'a1', amount: 1300, dueDate: '2026-02-01', status: 'paid', paidDate: '2026-02-01' },
          { id: 'a2', amount: 1300, dueDate: '2026-08-01', status: 'pending' },
        ],
      }),
      deposit({
        id: 'dep2',
        status: 'closed',
      }),
    ];

    const result = calcActiveDepositsProgress(deposits, '2026-07-01');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('dep1');
    expect(result[0].name).toBe('Накопительный');
    expect(result[0].bankName).toBe('Сбер');
    expect(result[0].amount).toBe(100000);
    expect(result[0].interestRate).toBe(16);
    expect(result[0].endDate).toBe('2027-01-01');
    expect(result[0].isDemand).toBe(false);
    expect(result[0].accrualType).toBe('capitalization');
    expect(result[0].progressPercent).toBeGreaterThan(45);
    expect(result[0].progressPercent).toBeLessThan(55);
    expect(result[0].accruedProfit).toBe(1300);
    expect(result[0].totalEstimatedReturn).toBe(102600);
    expect(result[0].remainingDays).toBeGreaterThan(180);
    expect(result[0].nextAccrualDate).toBe('2026-08-01');
    expect(result[0].nextAccrualAmount).toBe(1300);
  });

  it('корректно обрабатывает бессрочные вклады (до востребования)', () => {
    const deposits = [
      deposit({
        id: 'dep_demand',
        type: 'demand',
        termMonths: 0,
        status: 'active',
      }),
    ];

    const result = calcActiveDepositsProgress(deposits, '2026-06-01');
    expect(result).toHaveLength(1);
    expect(result[0].isDemand).toBe(true);
    expect(result[0].endDate).toBe('');
    expect(result[0].progressPercent).toBe(100);
    expect(result[0].remainingDays).toBeNull();
  });
});

