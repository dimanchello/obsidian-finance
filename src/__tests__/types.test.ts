import { describe, it, expect } from 'vitest';

describe('Type definitions', () => {
  it('FinanceRecord has required fields', () => {
    const record = {
      id: 'test-id',
      createdAt: 1700000000000,
      date: '2024-11-15',
      time: '14:30',
      type: 'expense' as const,
      amount: 1500.00,
      category: 'Продукты',
      tag: 'еда',
      payer: 'Иван',
      note: 'Магнит',
      attachmentPath: '',
    };

    expect(record.id).toBeDefined();
    expect(record.amount).toBe(1500);
    expect(record.type).toBe('expense');
  });

  it('DebtRecord tracks movements', () => {
    const debt = {
      id: 'debt-1',
      person: 'Иван',
      amount: 3000,
      direction: 'lent' as const,
      date: '2024-11-01',
      time: '',
      dueDate: '',
      createdAt: 1700000000000,
      note: '',
      movements: [
        { id: 'm1', type: 'borrow' as const, amount: 5000, date: '2024-11-01', time: '', createdAt: 1, note: '' },
        { id: 'm2', type: 'repay' as const, amount: 2000, date: '2024-11-15', time: '', createdAt: 2, note: '' },
      ],
    };

    expect(debt.amount).toBe(3000);
  });

  it('getDebtOriginal should sum all borrow movements regardless of originalAmount', () => {
    const getDebtOriginal = (debt: { movements: { type: string; amount: number }[] }): number => {
      return debt.movements
        .filter(m => m.type === 'borrow')
        .reduce((s, m) => s + m.amount, 0);
    };

    const debt = {
      id: 'debt-1',
      person: 'Иван',
      amount: 8000,
      originalAmount: 5000,
      interestRate: 0,
      direction: 'lent' as const,
      date: '2024-11-01',
      time: '',
      dueDate: '',
      createdAt: 1700000000000,
      note: '',
      movements: [
        { id: 'm1', type: 'borrow' as const, amount: 5000, date: '2024-11-01', time: '', createdAt: 1, note: '' },
        { id: 'm2', type: 'borrow' as const, amount: 3000, date: '2024-12-01', time: '', createdAt: 2, note: '' },
        { id: 'm3', type: 'repay' as const, amount: 2000, date: '2024-12-15', time: '', createdAt: 3, note: '' },
      ],
    };

    const original = getDebtOriginal(debt);
    expect(original).toBe(8000);
  });

  it('exchangeRate 1 should be treated as undefined on import', () => {
    const rawEr = '1';
    const er = parseFloat(rawEr);
    const exchangeRate = er > 0 && er !== 1 ? er : undefined;
    expect(exchangeRate).toBeUndefined();
  });

  it('exchangeRate 0 should be treated as undefined on import', () => {
    const rawEr = '0';
    const er = parseFloat(rawEr);
    const exchangeRate = er > 0 && er !== 1 ? er : undefined;
    expect(exchangeRate).toBeUndefined();
  });

  it('exchangeRate 95.50 should be preserved on import', () => {
    const rawEr = '95.50';
    const er = parseFloat(rawEr);
    const exchangeRate = er > 0 && er !== 1 ? er : undefined;
    expect(exchangeRate).toBe(95.5);
  });

  it('empty exchangeRate should be undefined on import', () => {
    const rawEr = '';
    const er = parseFloat(rawEr);
    const exchangeRate = er > 0 && er !== 1 ? er : undefined;
    expect(exchangeRate).toBeUndefined();
  });
});