import { describe, it, expect } from 'vitest';
import {
  parseRecords, parseDebts, parseCredits, parseDeposits, parseStringList,
} from '../domain/validate';

describe('parseRecords', () => {
  const valid = {
    id: 'r1', createdAt: 1, date: '2026-01-15', time: '10:00', type: 'income',
    amount: 500, category: 'Зарплата', tag: 'т', payer: 'п', note: 'н', attachmentPath: '',
  };

  it('разбирает корректную запись', () => {
    expect(parseRecords([valid])[0]).toMatchObject({
      id: 'r1', type: 'income', amount: 500, category: 'Зарплата',
    });
  });

  it('нормализует дату и время', () => {
    const [r] = parseRecords([{ ...valid, date: '15.01.2026', time: '9:5' }]);
    expect(r.date).toBe('2026-01-15');
    expect(r.time).toBe('');
  });

  it('отбрасывает записи без id — это не бэкфилл, а отсев мусора', () => {
    expect(parseRecords([{ ...valid, id: '' }, { ...valid, id: 'ok' }])).toHaveLength(1);
  });

  it('одна битая запись не теряет весь файл', () => {
    expect(parseRecords([valid, null, 'мусор', 42, { ...valid, id: 'r2' }])).toHaveLength(2);
  });

  it('неизвестный тип превращается в expense, а не роняет разбор', () => {
    expect(parseRecords([{ ...valid, type: 'что-то' }])[0].type).toBe('expense');
  });

  it('нечисловая сумма становится нулём', () => {
    expect(parseRecords([{ ...valid, amount: 'сто' }])[0].amount).toBe(0);
    expect(parseRecords([{ ...valid, amount: NaN }])[0].amount).toBe(0);
  });

  it('не массив даёт пустой список', () => {
    expect(parseRecords(null)).toEqual([]);
    expect(parseRecords({})).toEqual([]);
    expect(parseRecords('[]')).toEqual([]);
  });

  it('сохраняет exchangeRate только когда он число', () => {
    expect(parseRecords([{ ...valid, exchangeRate: 95.5 }])[0].exchangeRate).toBe(95.5);
    expect(parseRecords([{ ...valid, exchangeRate: 'нет' }])[0].exchangeRate).toBeUndefined();
  });
});

describe('parseDebts', () => {
  const valid = {
    id: 'd1', person: 'Иван', amount: 1000, originalAmount: 1000, interestRate: 0,
    direction: 'lent', date: '2026-01-01', time: '', dueDate: '', createdAt: 1, note: '',
    movements: [{ id: 'm1', type: 'borrow', amount: 1000, date: '2026-01-01', time: '', createdAt: 1, note: '' }],
  };

  it('разбирает долг с движениями', () => {
    const [d] = parseDebts([valid]);
    expect(d.person).toBe('Иван');
    expect(d.movements).toHaveLength(1);
  });

  it('отсутствующие движения дают пустой список', () => {
    expect(parseDebts([{ ...valid, movements: undefined }])[0].movements).toEqual([]);
  });

  it('неизвестное направление становится borrowed', () => {
    expect(parseDebts([{ ...valid, direction: 'x' }])[0].direction).toBe('borrowed');
  });

  it('пустой dueDate остаётся пустым, а не превращается в сегодня', () => {
    expect(parseDebts([{ ...valid, dueDate: '' }])[0].dueDate).toBe('');
  });
});

describe('parseCredits', () => {
  const valid = {
    id: 'c1', name: 'Ипотека', type: 'mortgage', bankName: 'Банк',
    originalAmount: 10000, currentAmount: 10000, interestRate: 10, monthlyPayment: 1000,
    termMonths: 12, startDate: '2026-01-01', createdAt: 1, note: '', status: 'active',
    earlyRepaymentOption: 'term', payments: [],
  };

  it('разбирает кредит', () => {
    const [c] = parseCredits([valid]);
    expect(c).toMatchObject({ name: 'Ипотека', type: 'mortgage', status: 'active', earlyRepaymentOption: 'term' });
  });

  it('неизвестный earlyRepaymentOption становится null', () => {
    expect(parseCredits([{ ...valid, earlyRepaymentOption: 'нечто' }])[0].earlyRepaymentOption).toBeNull();
  });

  it('разбирает платежи и отбрасывает битые', () => {
    const payments = [
      { id: 'p1', amount: 1000, dueDate: '2026-02-01', status: 'paid', paidDate: '2026-02-01' },
      { amount: 1000, dueDate: '2026-03-01', status: 'pending' },
    ];
    const [c] = parseCredits([{ ...valid, payments }]);
    expect(c.payments).toHaveLength(1);
    expect(c.payments[0].paidDate).toBe('2026-02-01');
  });

  it('pending-платёж не получает paidDate', () => {
    const payments = [{ id: 'p1', amount: 1000, dueDate: '2026-03-01', status: 'pending' }];
    expect(parseCredits([{ ...valid, payments }])[0].payments[0].paidDate).toBeUndefined();
  });
});

describe('parseDeposits', () => {
  const valid = {
    id: 'dep1', name: 'Вклад', type: 'term', bankName: 'Банк', amount: 5000,
    interestRate: 8, startDate: '2026-01-01', termMonths: 6, accrualType: 'capitalization',
    createdAt: 1, note: '', status: 'active', accruals: [], topUps: [], withdrawals: [],
  };

  it('разбирает вклад', () => {
    expect(parseDeposits([valid])[0]).toMatchObject({ name: 'Вклад', accrualType: 'capitalization' });
  });

  it('неизвестный accrualType становится to_account', () => {
    expect(parseDeposits([{ ...valid, accrualType: 'x' }])[0].accrualType).toBe('to_account');
  });

  it('отсутствующие коллекции дают пустые списки, а не undefined', () => {
    const [d] = parseDeposits([{ ...valid, accruals: undefined, topUps: null, withdrawals: 'нет' }]);
    expect(d.accruals).toEqual([]);
    expect(d.topUps).toEqual([]);
    expect(d.withdrawals).toEqual([]);
  });

  it('termMonths не подменяется на 12 при нуле', () => {
    // Раньше storage делал `if (!d.termMonths) d.termMonths = 12` и маскировал ошибку ввода
    expect(parseDeposits([{ ...valid, termMonths: 0 }])[0].termMonths).toBe(0);
  });
});

describe('parseStringList', () => {
  it('оставляет только непустые строки', () => {
    expect(parseStringList(['а', '', 'б', null, 5, 'в'])).toEqual(['а', 'б', 'в']);
  });

  it('не массив даёт пустой список', () => {
    expect(parseStringList(null)).toEqual([]);
    expect(parseStringList('абв')).toEqual([]);
  });
});
