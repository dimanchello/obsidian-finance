import { describe, it, expect } from 'vitest';
import { applyAutoTransactions, type AutoTxDeps } from '../domain/autoTransactions';
import type { AccountData, CreditRecord, DepositRecord, FinanceRecord } from '../types';

const LABELS = {
  depositInterestCat: 'Проценты по вкладу',
  depositInterestNote: 'Начисление по вкладу',
  depositRefundCat: 'Возврат вклада',
  depositRefundNote: 'Закрытие вклада',
  creditDefaultCat: 'Кредит',
  creditPaymentNote: 'Платёж по кредиту',
};

function mkDeps(today: string): AutoTxDeps {
  let n = 0;
  return { today, now: 1_700_000_000_000, nowTime: '12:00', newId: () => `gen-${++n}`, labels: LABELS };
}

function mkDeposit(over: Partial<DepositRecord> = {}): DepositRecord {
  return {
    id: 'dep-1', name: 'Вклад', type: 'term', bankName: 'Банк',
    amount: 100_000, interestRate: 12, startDate: '2026-01-15', termMonths: 12,
    accrualType: 'to_account', createdAt: 0, note: '', status: 'active',
    accruals: [], topUps: [], withdrawals: [], ...over,
  };
}

function mkCredit(over: Partial<CreditRecord> = {}): CreditRecord {
  return {
    id: 'cr-1', name: 'Кредит', type: 'consumer', bankName: 'Банк',
    originalAmount: 100_000, currentAmount: 100_000, interestRate: 15,
    monthlyPayment: 9_000, termMonths: 12, startDate: '2026-01-15',
    createdAt: 0, note: '', status: 'active', earlyRepaymentOption: null,
    payments: [], ...over,
  };
}

function mkData(over: Partial<AccountData> = {}): AccountData {
  return {
    version: 1, name: '', currency: '₽',
    records: [], debts: [], credits: [], deposits: [], exchanges: [],
    categories: [], tags: [], payers: [], ...over,
  };
}

describe('applyAutoTransactions — флаг changed', () => {
  it('не поднимает ни одного флага, когда менять нечего', () => {
    // Регрессия: depositsChanged = true стоял вне всех if, и файл вкладов
    // перезаписывался на каждом рендере даже без изменений.
    const data = mkData({ deposits: [mkDeposit({ termMonths: 0 })] });
    const res = applyAutoTransactions(data, mkDeps('2026-01-01'));
    expect(res.changed).toEqual({ records: false, deposits: false, credits: false });
  });

  it('пустой счёт не вызывает изменений', () => {
    const res = applyAutoTransactions(mkData(), mkDeps('2026-06-01'));
    expect(res.changed).toEqual({ records: false, deposits: false, credits: false });
  });

  it('повторный прогон на том же состоянии ничего не меняет', () => {
    const data = mkData({ deposits: [mkDeposit()], credits: [mkCredit()] });

    const first = applyAutoTransactions(data, mkDeps('2026-04-01'));
    expect(first.changed.deposits).toBe(true);
    expect(first.changed.credits).toBe(true);

    const second = applyAutoTransactions(
      mkData({ deposits: first.deposits, credits: first.credits, records: first.records }),
      mkDeps('2026-04-01'),
    );
    expect(second.changed).toEqual({ records: false, deposits: false, credits: false });
  });

  it('закрытый вклад и выплаченный кредит не трогаются', () => {
    const data = mkData({
      deposits: [mkDeposit({ status: 'closed' })],
      credits: [mkCredit({ status: 'paid' })],
    });
    const res = applyAutoTransactions(data, mkDeps('2027-01-01'));
    expect(res.changed).toEqual({ records: false, deposits: false, credits: false });
    expect(res.deposits[0].accruals).toEqual([]);
  });
});

describe('applyAutoTransactions — дедупликация', () => {
  function mirroredRecord(over: Partial<FinanceRecord>): FinanceRecord {
    return {
      id: 'existing', createdAt: 0, date: '2026-02-15', time: '',
      type: 'income', amount: 986.3, category: LABELS.depositInterestCat,
      tag: '', payer: 'Банк', note: '', attachmentPath: '', linkedId: 'dep-1', ...over,
    };
  }

  it('не создаёт дубль записи по вкладу — правило то же, что у кредитов', () => {
    // Регрессия: дедупликация была только у кредитов, вклады плодили дубли.
    const accruals = [
      { id: 'a1', amount: 986.3, dueDate: '2026-02-15', status: 'paid' as const, paidDate: '2026-02-15' },
      { id: 'a2', amount: 986.3, dueDate: '2026-03-15', status: 'pending' as const },
    ];
    const data = mkData({
      deposits: [mkDeposit({ accruals })],
      records: [mirroredRecord({})],
    });

    const res = applyAutoTransactions(data, mkDeps('2026-02-20'));

    expect(res.records.filter(r => r.linkedId === 'dep-1' && r.date === '2026-02-15')).toHaveLength(1);
    expect(res.changed.records).toBe(false);
  });

  it('не создаёт дубль записи по кредиту', () => {
    const payments = [
      { id: 'p1', amount: 9_000, dueDate: '2026-02-15', status: 'paid' as const, paidDate: '2026-02-15' },
    ];
    const data = mkData({
      credits: [mkCredit({ payments })],
      records: [mirroredRecord({ type: 'expense', amount: 9_000, category: LABELS.creditDefaultCat, linkedId: 'cr-1' })],
    });

    const res = applyAutoTransactions(data, mkDeps('2026-02-20'));

    expect(res.records.filter(r => r.linkedId === 'cr-1')).toHaveLength(1);
    expect(res.changed.records).toBe(false);
  });

  it('запись о получении кредита не мешает записи о платеже в тот же день', () => {
    // Обе имеют категорию «Кредит» и один linkedId — различаются только типом
    const receipt = mirroredRecord({
      type: 'income', date: '2026-02-15', amount: 100_000,
      category: LABELS.creditDefaultCat, linkedId: 'cr-1',
    });
    const payments = [
      { id: 'p1', amount: 9_000, dueDate: '2026-02-15', status: 'paid' as const, paidDate: '2026-02-15' },
    ];
    const data = mkData({ credits: [mkCredit({ payments })], records: [receipt] });

    const res = applyAutoTransactions(data, mkDeps('2026-02-20'));

    expect(res.records).toHaveLength(2);
    expect(res.records.filter(r => r.type === 'expense')).toHaveLength(1);
  });

  it('не считает дублем запись без linkedId', () => {
    const manual: FinanceRecord = {
      id: 'manual', createdAt: 0, date: '2026-02-15', time: '', type: 'income',
      amount: 986.3, category: LABELS.depositInterestCat, tag: '', payer: 'Банк',
      note: '', attachmentPath: '',
    };
    const accruals = [
      { id: 'a1', amount: 986.3, dueDate: '2026-02-15', status: 'paid' as const, paidDate: '2026-02-15' },
    ];
    const data = mkData({ deposits: [mkDeposit({ accruals, termMonths: 1 })], records: [manual] });

    const res = applyAutoTransactions(data, mkDeps('2026-02-20'));

    expect(res.records.filter(r => r.linkedId === 'dep-1' && r.category === LABELS.depositInterestCat)).toHaveLength(1);
  });
});

describe('applyAutoTransactions — вклады', () => {
  it('генерирует график и зеркалит прошедшие начисления в записи', () => {
    const data = mkData({ deposits: [mkDeposit({ startDate: '2026-01-15', termMonths: 6 })] });

    const res = applyAutoTransactions(data, mkDeps('2026-04-01'));

    expect(res.deposits[0].accruals).toHaveLength(6);
    expect(res.records).toHaveLength(2);
    expect(res.records.map(r => r.date)).toEqual(['2026-02-15', '2026-03-15']);
    expect(res.records.every(r => r.type === 'income' && r.linkedId === 'dep-1')).toBe(true);
    expect(res.changed).toEqual({ records: true, deposits: true, credits: false });
  });

  it('капитализация не создаёт записей — проценты идут в тело', () => {
    const data = mkData({
      deposits: [mkDeposit({ accrualType: 'capitalization', startDate: '2026-01-15', termMonths: 6 })],
    });

    const res = applyAutoTransactions(data, mkDeps('2026-04-01'));

    expect(res.records).toHaveLength(0);
    expect(res.deposits[0].amount).toBeGreaterThan(100_000);
  });

  it('капитализация: тело растёт только на оплаченные начисления', () => {
    const data = mkData({
      deposits: [mkDeposit({ accrualType: 'capitalization', startDate: '2026-01-15', termMonths: 12 })],
    });

    const res = applyAutoTransactions(data, mkDeps('2026-03-01'));
    const deposit = res.deposits[0];
    const paidSum = deposit.accruals.filter(a => a.status === 'paid').reduce((s, a) => s + a.amount, 0);

    expect(deposit.accruals.filter(a => a.status === 'paid')).toHaveLength(1);
    expect(deposit.amount).toBeCloseTo(100_000 + paidSum, 2);
  });

  it('закрывает вклад по окончании срока и возвращает тело', () => {
    const data = mkData({ deposits: [mkDeposit({ startDate: '2026-01-15', termMonths: 3 })] });

    const res = applyAutoTransactions(data, mkDeps('2026-05-01'));
    const deposit = res.deposits[0];
    const refund = res.records.find(r => r.category === LABELS.depositRefundCat);

    expect(deposit.status).toBe('closed');
    expect(refund).toBeDefined();
    expect(refund!.amount).toBe(deposit.amount);
  });

  it('возврат датируется концом срока, а не днём открытия заметки', () => {
    const data = mkData({ deposits: [mkDeposit({ startDate: '2026-01-15', termMonths: 3 })] });

    const res = applyAutoTransactions(data, mkDeps('2027-11-30'));
    const refund = res.records.find(r => r.category === LABELS.depositRefundCat);

    expect(refund!.date).toBe('2026-04-15');
  });

  it('срок ещё не вышел — вклад остаётся активным', () => {
    const data = mkData({ deposits: [mkDeposit({ startDate: '2026-01-15', termMonths: 12 })] });
    const res = applyAutoTransactions(data, mkDeps('2026-06-01'));
    expect(res.deposits[0].status).toBe('active');
    expect(res.records.some(r => r.category === LABELS.depositRefundCat)).toBe(false);
  });

  it('добивает наступившие начисления в уже существующем графике', () => {
    const accruals = [
      { id: 'a1', amount: 100, dueDate: '2026-02-15', status: 'paid' as const, paidDate: '2026-02-15' },
      { id: 'a2', amount: 100, dueDate: '2026-03-15', status: 'pending' as const },
      { id: 'a3', amount: 100, dueDate: '2026-04-15', status: 'pending' as const },
    ];
    const data = mkData({ deposits: [mkDeposit({ accruals })] });

    const res = applyAutoTransactions(data, mkDeps('2026-03-20'));
    const deposit = res.deposits[0];

    expect(deposit.accruals.map(a => a.status)).toEqual(['paid', 'paid', 'pending']);
    expect(deposit.accruals[1].paidDate).toBe('2026-03-15');
    expect(res.records.map(r => r.date)).toEqual(['2026-02-15', '2026-03-15']);
  });

  it('не мутирует входные данные', () => {
    const data = mkData({ deposits: [mkDeposit()], credits: [mkCredit()] });
    const before = structuredClone(data);

    applyAutoTransactions(data, mkDeps('2026-06-01'));

    expect(data).toEqual(before);
  });
});

describe('applyAutoTransactions — кредиты', () => {
  it('генерирует график и зеркалит прошедшие платежи в расходы', () => {
    const data = mkData({ credits: [mkCredit({ startDate: '2026-01-15', termMonths: 12 })] });

    const res = applyAutoTransactions(data, mkDeps('2026-04-01'));

    expect(res.credits[0].payments).toHaveLength(12);
    expect(res.records).toHaveLength(2);
    expect(res.records.every(r => r.type === 'expense')).toBe(true);
  });

  it('помечает кредит выплаченным, когда не осталось pending — без сравнения float с нулём', () => {
    // Регрессия: проверка была remainingAmount === 0 по сумме float-значений.
    const payments = [
      { id: 'p1', amount: 0.1, dueDate: '2026-02-15', status: 'pending' as const },
      { id: 'p2', amount: 0.2, dueDate: '2026-03-15', status: 'pending' as const },
    ];
    const data = mkData({ credits: [mkCredit({ payments })] });

    const res = applyAutoTransactions(data, mkDeps('2026-04-01'));

    expect(res.credits[0].payments.every(p => p.status === 'paid')).toBe(true);
    expect(res.credits[0].status).toBe('paid');
  });

  it('остаётся активным, пока есть pending', () => {
    const payments = [
      { id: 'p1', amount: 9_000, dueDate: '2026-02-15', status: 'paid' as const, paidDate: '2026-02-15' },
      { id: 'p2', amount: 9_000, dueDate: '2026-12-15', status: 'pending' as const },
    ];
    const data = mkData({ credits: [mkCredit({ payments })] });

    const res = applyAutoTransactions(data, mkDeps('2026-03-01'));

    expect(res.credits[0].status).toBe('active');
  });

  it('кредит без платежа и срока не создаёт график', () => {
    const data = mkData({ credits: [mkCredit({ monthlyPayment: 0 })] });
    const res = applyAutoTransactions(data, mkDeps('2026-06-01'));
    expect(res.credits[0].payments).toEqual([]);
    expect(res.changed.credits).toBe(false);
  });
});

describe('applyAutoTransactions — детерминированность', () => {
  it('одинаковый вход даёт побайтово одинаковый выход', () => {
    const build = () => mkData({ deposits: [mkDeposit()], credits: [mkCredit()] });

    const a = applyAutoTransactions(build(), mkDeps('2026-06-01'));
    const b = applyAutoTransactions(build(), mkDeps('2026-06-01'));

    expect(a).toEqual(b);
  });

  it('createdAt и time берутся из deps, а не из системных часов', () => {
    const data = mkData({ deposits: [mkDeposit({ termMonths: 2 })] });
    const res = applyAutoTransactions(data, mkDeps('2026-04-01'));

    expect(res.records.every(r => r.createdAt === 1_700_000_000_000)).toBe(true);
    expect(res.records.every(r => r.time === '12:00')).toBe(true);
    expect(res.records.every(r => r.id.startsWith('gen-'))).toBe(true);
  });
});
