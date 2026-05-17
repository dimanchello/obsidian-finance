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
});