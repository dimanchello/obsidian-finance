import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinanceStorage } from '../storage';

interface MockAdapter {
  exists: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
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
          remove: vi.fn().mockResolvedValue(undefined),
          rename: vi.fn().mockResolvedValue(undefined),
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
      const legacyData = {
        version: 1,
        name: 'Test',
        currency: '₽',
        records: [{ id: '1', createdAt: 1, date: '2024-01-01', type: 'expense', amount: 100, category: '', tag: '', payer: '', note: '', attachmentPath: '', time: '' }],
        categories: ['Test'],
        tags: [],
        payers: [],
        debts: [],
        credits: [],
        deposits: [],
      };

      const filesOnDisk = new Map<string, string>();
      mockAdapter.write.mockImplementation(async (path: string, content: string) => {
        filesOnDisk.set(path, content);
      });
      mockAdapter.exists.mockImplementation(async (path: string) => {
        if (path.endsWith('test_path.md.json')) return true;
        return filesOnDisk.has(path);
      });
      mockAdapter.read.mockImplementation(async (path: string) => {
        if (path.endsWith('test_path.md.json')) return JSON.stringify(legacyData);
        return filesOnDisk.get(path) ?? '';
      });
      mockAdapter.remove.mockResolvedValue(undefined);

      const data = await storage.load('test/path.md');
      expect(data.currency).toBe('₽');
      expect(data.records[0].time).toBe('');
    });
  });

  describe('noteFolder', () => {
    it('uses last 2 segments for nested paths', () => {
      const result = (storage as any).noteFolder('Люди/Я/Финансы/Счета/Доллары.md');
      expect(result).toContain('Счета_Доллары');
    });

    it('uses single segment for root notes', () => {
      const result = (storage as any).noteFolder('Доллары.md');
      expect(result).toContain('accounts_Доллары');
    });
  });

  describe('saveViewState / loadViewState', () => {
    it('saves and loads view state', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      const state = { filter: { search: '' }, sort: { field: 'date' as const, dir: 'asc' as const }, page: 0, pageSize: 25 };
      await storage.saveViewState('test/note.md', state as any);
      expect(mockAdapter.write).toHaveBeenCalled();

      mockAdapter.read.mockResolvedValue(JSON.stringify(state));
      const loaded = await storage.loadViewState('test/note.md');
      expect(loaded).toEqual(state);
    });

    it('returns null when no state file exists', async () => {
      mockAdapter.exists.mockResolvedValue(false);
      const result = await storage.loadViewState('test/note.md');
      expect(result).toBeNull();
    });
  });

  describe('debts CRUD', () => {
    it('manages debts and movements correctly', async () => {
      const filesOnDisk = new Map<string, string>();
      mockAdapter.write.mockImplementation(async (path: string, content: string) => {
        filesOnDisk.set(path, content);
      });
      mockAdapter.exists.mockImplementation(async (path: string) => {
        if (path.endsWith('meta.json')) return true;
        return filesOnDisk.has(path);
      });
      mockAdapter.read.mockImplementation(async (path: string) => {
        if (path.endsWith('debts.json')) return filesOnDisk.get(path) ?? '[]';
        if (path.endsWith('meta.json')) return JSON.stringify({ version: 4, name: 'Test', currency: '₽' });
        if (path.endsWith('records.json')) return JSON.stringify({ version: 4, records: [], categories: [], tags: [], payers: [] });
        return '[]';
      });

      const debt = {
        id: 'debt-1',
        person: 'Иван',
        amount: 1000,
        originalAmount: 1000,
        interestRate: 0,
        direction: 'lent' as const,
        date: '2024-01-01',
        time: '',
        dueDate: '',
        createdAt: Date.now(),
        note: '',
        movements: [
          {
            id: 'mov-init',
            type: 'borrow' as const,
            amount: 1000,
            date: '2024-01-01',
            time: '',
            createdAt: Date.now(),
            note: '',
          }
        ],
      };

      await storage.addDebt('test.md', debt);
      let data = await storage.load('test.md');
      expect(data.debts).toHaveLength(1);
      expect(data.debts[0].person).toBe('Иван');

      const movement = {
        id: 'mov-1',
        type: 'repay' as const,
        amount: 400,
        date: '2024-01-02',
        time: '',
        createdAt: Date.now(),
        note: '',
      };

      await storage.addDebtMovement('test.md', 'debt-1', movement);
      data = await storage.load('test.md');
      expect(data.debts[0].movements).toHaveLength(2);
      // Recalculates amount (remaining originalAmount - repaid)
      expect(data.debts[0].amount).toBe(600);
    });
  });

  describe('credits CRUD', () => {
    it('manages credits and payments correctly', async () => {
      const filesOnDisk = new Map<string, string>();
      mockAdapter.write.mockImplementation(async (path: string, content: string) => {
        filesOnDisk.set(path, content);
      });
      mockAdapter.exists.mockImplementation(async (path: string) => {
        if (path.endsWith('meta.json')) return true;
        return filesOnDisk.has(path);
      });
      mockAdapter.read.mockImplementation(async (path: string) => {
        if (path.endsWith('credits.json')) return filesOnDisk.get(path) ?? '[]';
        if (path.endsWith('meta.json')) return JSON.stringify({ version: 4, name: 'Test', currency: '₽' });
        if (path.endsWith('records.json')) return JSON.stringify({ version: 4, records: [], categories: [], tags: [], payers: [] });
        return '[]';
      });

      const credit = {
        id: 'credit-1',
        name: 'Ипотека',
        bankName: 'Сбер',
        amount: 10000,
        originalAmount: 10000,
        currentAmount: 10000,
        interestRate: 10,
        termMonths: 12,
        monthlyPayment: 1000,
        startDate: '2024-01-01',
        status: 'active' as const,
        payments: [],
        type: 'consumer' as const,
        createdAt: Date.now(),
        note: '',
        earlyRepaymentOption: 'term' as const,
      };

      await storage.addCredit('test.md', credit);
      let data = await storage.load('test.md');
      expect(data.credits).toHaveLength(1);
      expect(data.credits[0].name).toBe('Ипотека');
    });
  });

  describe('deposits CRUD', () => {
    it('manages deposits, topups and withdrawals correctly', async () => {
      const filesOnDisk = new Map<string, string>();
      mockAdapter.write.mockImplementation(async (path: string, content: string) => {
        filesOnDisk.set(path, content);
      });
      mockAdapter.exists.mockImplementation(async (path: string) => {
        if (path.endsWith('meta.json')) return true;
        return filesOnDisk.has(path);
      });
      mockAdapter.read.mockImplementation(async (path: string) => {
        if (path.endsWith('deposits.json')) return filesOnDisk.get(path) ?? '[]';
        if (path.endsWith('meta.json')) return JSON.stringify({ version: 4, name: 'Test', currency: '₽' });
        if (path.endsWith('records.json')) return JSON.stringify({ version: 4, records: [], categories: [], tags: [], payers: [] });
        return '[]';
      });

      const deposit = {
        id: 'dep-1',
        name: 'Накопительный',
        type: 'term' as const,
        bankName: 'Тинькофф',
        amount: 5000,
        interestRate: 8,
        startDate: '2024-01-01',
        termMonths: 6,
        accrualType: 'capitalization' as const,
        status: 'active' as const,
        accruals: [],
        topUps: [],
        withdrawals: [],
        createdAt: Date.now(),
        note: '',
      };

      await storage.addDeposit('test.md', deposit);
      let data = await storage.load('test.md');
      expect(data.deposits).toHaveLength(1);
      expect(data.deposits[0].name).toBe('Накопительный');
    });
  });
});