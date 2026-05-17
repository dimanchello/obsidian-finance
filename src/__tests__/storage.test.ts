import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinanceStorage } from '../storage';

interface MockAdapter {
  exists: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
}

interface MockApp {
  vault: { adapter: MockAdapter };
}

describe('FinanceStorage', () => {
  let storage: FinanceStorage;
  let mockApp: MockApp;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    mockApp = {
      vault: {
        adapter: {
          exists: vi.fn().mockResolvedValue(false),
          read: vi.fn().mockResolvedValue(null),
          write: vi.fn().mockResolvedValue(undefined),
          mkdir: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
    mockAdapter = mockApp.vault.adapter;
    storage = new FinanceStorage(mockApp as any, 'obsidian-finance', '₽');
  });

  describe('CRUD operations', () => {
    it('should add and load record', async () => {
      const notePath = 'test/note.md';
      const record = {
        id: 'rec-1',
        createdAt: 1700000000000,
        date: '2024-11-15',
        time: '10:00',
        type: 'expense' as const,
        amount: 500,
        category: 'Продукты',
        tag: 'еда',
        payer: '',
        note: '',
        attachmentPath: '',
      };

      await storage.addRecord(notePath, record);
      const data = await storage.load(notePath);

      expect(data.records).toHaveLength(1);
      expect(data.categories).toContain('Продукты');
    });

    it('should update record', async () => {
      const notePath = 'test/note.md';
      const record = {
        id: 'rec-1',
        createdAt: 1700000000000,
        date: '2024-11-15',
        time: '',
        type: 'expense' as const,
        amount: 500,
        category: 'Old',
        tag: '',
        payer: '',
        note: '',
        attachmentPath: '',
      };

      await storage.addRecord(notePath, record);
      await storage.updateRecord(notePath, { ...record, category: 'New', amount: 600 });

      const data = await storage.load(notePath);
      expect(data.records[0].category).toBe('New');
    });

    it('should delete record', async () => {
      const notePath = 'test/note.md';
      await storage.addRecord(notePath, {
        id: 'rec-1',
        createdAt: 1,
        date: '2024-01-01',
        time: '',
        type: 'expense',
        amount: 100,
        category: 'Test',
        tag: '',
        payer: '',
        note: '',
        attachmentPath: '',
      });

      await storage.deleteRecord(notePath, 'rec-1');

      const data = await storage.load(notePath);
      expect(data.records).toHaveLength(0);
    });

    it('should calculate debt amount from movements', async () => {
      const notePath = 'test/note.md';

      await storage.addDebt(notePath, {
        id: 'debt-1',
        person: 'Иван',
        amount: 5000,
        originalAmount: 5000,
        interestRate: 0,
        direction: 'lent' as const,
        date: '2024-11-01',
        time: '',
        dueDate: '',
        createdAt: 1700000000000,
        note: '',
        movements: [],
      });

      await storage.addDebtMovement(notePath, 'debt-1', {
        id: 'm1',
        type: 'borrow',
        amount: 5000,
        date: '2024-11-01',
        time: '',
        createdAt: 1,
        note: '',
      });

      await storage.addDebtMovement(notePath, 'debt-1', {
        id: 'm2',
        type: 'repay',
        amount: 2000,
        date: '2024-11-15',
        time: '',
        createdAt: 2,
        note: '',
      });

      const data = await storage.load(notePath);
      expect(data.debts[0].amount).toBe(3000);
    });

    it('should bulk import records', async () => {
      const notePath = 'test/note.md';
      const records = [
        { id: '1', createdAt: 1, date: '2024-01-01', time: '', type: 'income' as const, amount: 1000, category: 'Зарплата', tag: '', payer: '', note: '', attachmentPath: '' },
        { id: '2', createdAt: 2, date: '2024-01-02', time: '', type: 'expense' as const, amount: 500, category: 'Продукты', tag: '', payer: '', note: '', attachmentPath: '' },
      ];

      await storage.importRecords(notePath, records);

      const data = await storage.load(notePath);
      expect(data.records).toHaveLength(2);
      expect(data.categories).toContain('Зарплата');
    });
  });

  describe('backward compatibility', () => {
    it('adds missing fields for old data', async () => {
      const oldData = {
        version: 1,
        records: [{ id: '1', createdAt: 1, date: '2024-01-01', type: 'expense', amount: 100, category: '', tag: '', payer: '', note: '', attachmentPath: '' }],
      };

      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify(oldData));

      const data = await storage.load('test/path.md');
      expect(data.currency).toBe('₽');
      expect(data.records[0].time).toBe('');
    });
  });
});