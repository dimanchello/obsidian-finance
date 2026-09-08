import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinanceStorage } from '../storage';
import { AccountFiles } from '../storage/AccountFiles';
import {
  RecordType, DebtDirection, DebtMovementType, CreditType, CreditStatus,
  EarlyRepaymentOption, DepositType, DepositStatus, DepositAccrualType, CurrencyOperationType,
} from '../types';

interface MockAdapter {
  exists: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  rmdir: ReturnType<typeof vi.fn>;
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
          list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
          rmdir: vi.fn().mockResolvedValue(undefined),
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
        type: RecordType.EXPENSE,
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
        type: RecordType.EXPENSE,
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
        type: RecordType.EXPENSE,
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

    it('should delete records in batch', async () => {
      const notePath = 'test/note.md';
      const r1 = { id: 'rec-1', createdAt: 1, date: '2024-01-01', time: '', type: RecordType.EXPENSE, amount: 100, category: 'Test', tag: '', payer: '', note: '', attachmentPath: '' };
      const r2 = { id: 'rec-2', createdAt: 2, date: '2024-01-02', time: '', type: RecordType.EXPENSE, amount: 200, category: 'Test', tag: '', payer: '', note: '', attachmentPath: '' };
      await storage.addRecord(notePath, r1);
      await storage.addRecord(notePath, r2);

      await storage.deleteRecordsBatch(notePath, ['rec-1', 'rec-2']);

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
        direction: DebtDirection.LENT,
        date: '2024-11-01',
        time: '',
        dueDate: '',
        createdAt: 1700000000000,
        note: '',
        movements: [],
      });

      await storage.addDebtMovement(notePath, 'debt-1', {
        id: 'm1',
        type: DebtMovementType.BORROW,
        amount: 5000,
        date: '2024-11-01',
        time: '',
        createdAt: 1,
        note: '',
      });

      await storage.addDebtMovement(notePath, 'debt-1', {
        id: 'm2',
        type: DebtMovementType.REPAY,
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
        { id: '1', createdAt: 1, date: '2024-01-01', time: '', type: RecordType.INCOME, amount: 1000, category: 'Зарплата', tag: '', payer: '', note: '', attachmentPath: '' },
        { id: '2', createdAt: 2, date: '2024-01-02', time: '', type: RecordType.EXPENSE, amount: 500, category: 'Продукты', tag: '', payer: '', note: '', attachmentPath: '' },
      ];

      await storage.importRecords(notePath, records);

      const data = await storage.load(notePath);
      expect(data.records).toHaveLength(2);
      expect(data.categories).toContain('Зарплата');
    });
  });

  describe('boundary validation', () => {
    it('не читает старый плоский файл — миграций больше нет', async () => {
      const legacyData = {
        version: 1, name: 'Test', currency: '₽',
        records: [{ id: '1', createdAt: 1, date: '2024-01-01', type: RecordType.EXPENSE, amount: 100, category: 'Старое', tag: '', payer: '', note: '', attachmentPath: '', time: '' }],
        categories: ['Старое'], tags: [], payers: [], debts: [], credits: [], deposits: [],
      };
      mockAdapter.exists.mockImplementation(async (path: string) => path.endsWith('test_path.md.json'));
      mockAdapter.read.mockImplementation(async () => JSON.stringify(legacyData));

      const data = await storage.load('test/path.md');

      expect(data.records).toHaveLength(0);
      expect(data.version).toBe(1);
    });

    it('повреждённый JSON даёт пустой счёт, а не исключение', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue('{ не json');

      const data = await storage.load('test/note.md');

      expect(data.records).toEqual([]);
      expect(data.debts).toEqual([]);
      expect(data.currency).toBe('₽');
    });

    it('отбрасывает записи без id и оставляет годные', async () => {
      mockAdapter.exists.mockImplementation(async (path: string) => path.endsWith('records.json'));
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        version: 1,
        records: [
          { id: '', date: '2024-01-01', type: RecordType.EXPENSE, amount: 1 },
          { id: 'ok', createdAt: 1, date: '2024-01-01', time: '', type: RecordType.EXPENSE, amount: 100, category: 'Т', tag: '', payer: '', note: '', attachmentPath: '' },
        ],
        categories: ['Т'], tags: [], payers: [],
      }));

      const data = await storage.load('test/note.md');

      expect(data.records).toHaveLength(1);
      expect(data.records[0].id).toBe('ok');
    });
  });

  describe('AccountFiles', () => {
    it('папка называется по id и ни от чего внешнего не зависит', () => {
      const files = new AccountFiles('obsidian-finance');
      expect(files.folder('a7f3c92b4e1d')).toContain('accounts_a7f3c92b4e1d');
    });

    it('один и тот же id всегда даёт одну и ту же папку', () => {
      const files = new AccountFiles('obsidian-finance');
      expect(files.folder('a7f3c92b4e1d')).toBe(files.folder('a7f3c92b4e1d'));
    });

    it('разные id не сталкиваются', () => {
      const files = new AccountFiles('obsidian-finance');
      expect(files.folder('aaaaaaaaaaaa')).not.toBe(files.folder('bbbbbbbbbbbb'));
    });
  });

  describe('findOrphanedAccounts', () => {
    it('возвращает папки, чей id не встречается ни в одном блоке', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.list.mockResolvedValue({
        files: [],
        folders: ['.obsidian/plugins/obsidian-finance/accounts/aaaaaaaaaaaa',
                  '.obsidian/plugins/obsidian-finance/accounts/bbbbbbbbbbbb'],
      });

      const orphans = await storage.findOrphanedAccounts(new Set(['aaaaaaaaaaaa']));

      expect(orphans).toEqual(['bbbbbbbbbbbb']);
    });

    it('пустой список, когда папки счетов ещё нет', async () => {
      mockAdapter.exists.mockResolvedValue(false);
      expect(await storage.findOrphanedAccounts(new Set())).toEqual([]);
    });
  });

  describe('saveViewState / loadViewState', () => {
    it('saves and loads view state', async () => {
      const state = { filter: { search: '' }, sort: { field: 'date' as const, dir: 'asc' as const }, page: 0, pageSize: 25 };
      await storage.saveViewState('a7f3c92b4e1d', state as any);
      await storage.flush();
      // atomicWrite: содержимое уходит во временный файл
      const stateWrite = mockAdapter.write.mock.calls.find((args: unknown[]) => (args[0] as string).includes('state.json'));
      expect(stateWrite).toBeDefined();
      expect(JSON.parse(stateWrite![1] as string)).toEqual(state);

      const loaded = await storage.loadViewState('a7f3c92b4e1d');
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
        if (path.endsWith('meta.json')) return JSON.stringify({ version: 1, name: 'Test', currency: '₽' });
        if (path.endsWith('records.json')) return JSON.stringify({ version: 1, records: [], categories: [], tags: [], payers: [] });
        return '[]';
      });

      const debt = {
        id: 'debt-1',
        person: 'Иван',
        amount: 1000,
        originalAmount: 1000,
        interestRate: 0,
        direction: DebtDirection.LENT,
        date: '2024-01-01',
        time: '',
        dueDate: '',
        createdAt: Date.now(),
        note: '',
        movements: [
          {
            id: 'mov-init',
            type: DebtMovementType.BORROW,
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
        type: DebtMovementType.REPAY,
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
        if (path.endsWith('meta.json')) return JSON.stringify({ version: 1, name: 'Test', currency: '₽' });
        if (path.endsWith('records.json')) return JSON.stringify({ version: 1, records: [], categories: [], tags: [], payers: [] });
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
        status: CreditStatus.ACTIVE,
        payments: [],
        type: CreditType.CONSUMER,
        createdAt: Date.now(),
        note: '',
        earlyRepaymentOption: EarlyRepaymentOption.TERM,
      };

      await storage.addCredit('test.md', credit);
      let data = await storage.load('test.md');
      expect(data.credits).toHaveLength(1);
      expect(data.credits[0].name).toBe('Ипотека');
    });

    it('поля предоплаты получают явные значения при разборе', async () => {
      mockAdapter.exists.mockImplementation(async (path: string) => {
        if (path.endsWith('meta.json')) return true;
        if (path.endsWith('credits.json')) return true;
        return false;
      });
      mockAdapter.read.mockImplementation(async (path: string) => {
        if (path.endsWith('credits.json')) {
          return JSON.stringify([{
            id: 'credit-1',
            name: 'Ипотека',
            bankName: 'Сбер',
            originalAmount: 10000,
            currentAmount: 10000,
            interestRate: 10,
            termMonths: 12,
            monthlyPayment: 1000,
            startDate: '2024-01-01',
            status: CreditStatus.ACTIVE,
            payments: [],
            type: CreditType.CONSUMER,
            createdAt: 1700000000000,
            note: '',
            earlyRepaymentOption: EarlyRepaymentOption.TERM,
          }]);
        }
        if (path.endsWith('meta.json')) return JSON.stringify({ version: 1, name: 'Test', currency: '₽' });
        return '[]';
      });

      const data = await storage.load('test-parse.md');
      expect(data.credits).toHaveLength(1);
      const c = data.credits[0];
      expect(c.purchasePrice).toBe(0);
      expect(c.downPayment).toBe(0);
      expect(c.downPaymentType).toBe('amount');
      expect(c.downPaymentValue).toBe(0);
      expect(c.downPaymentDate).toBe('');
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
        if (path.endsWith('meta.json')) return JSON.stringify({ version: 1, name: 'Test', currency: '₽' });
        if (path.endsWith('records.json')) return JSON.stringify({ version: 1, records: [], categories: [], tags: [], payers: [] });
        return '[]';
      });

      const deposit = {
        id: 'dep-1',
        name: 'Накопительный',
        type: DepositType.TERM,
        bankName: 'Тинькофф',
        amount: 5000,
        interestRate: 8,
        startDate: '2024-01-01',
        termMonths: 6,
        accrualType: DepositAccrualType.CAPITALIZATION,
        status: DepositStatus.ACTIVE,
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

      // TopUp
      await storage.addDepositTopUp('test.md', 'dep-1', {
        id: 'top-1',
        amount: 2000,
        date: '2024-02-01',
        time: '',
        createdAt: 1,
        note: '',
      });
      data = await storage.load('test.md');
      expect(data.deposits[0].topUps).toHaveLength(1);
      expect(data.deposits[0].amount).toBe(7000);

      // Withdrawal
      await storage.addDepositWithdrawal('test.md', 'dep-1', {
        id: 'w-1',
        amount: 1000,
        date: '2024-03-01',
        time: '',
        createdAt: 2,
        note: '',
      });
      data = await storage.load('test.md');
      expect(data.deposits[0].withdrawals).toHaveLength(1);
      expect(data.deposits[0].amount).toBe(6000);

      // Delete topUp
      await storage.deleteDepositTopUp('test.md', 'dep-1', 'top-1');
      data = await storage.load('test.md');
      expect(data.deposits[0].topUps).toHaveLength(0);
      expect(data.deposits[0].amount).toBe(4000);

      // Delete withdrawal
      await storage.deleteDepositWithdrawal('test.md', 'dep-1', 'w-1');
      data = await storage.load('test.md');
      expect(data.deposits[0].withdrawals).toHaveLength(0);
      expect(data.deposits[0].amount).toBe(5000);
    });
  });

  describe('cascade deletion with linked records', () => {
    it('deleteDebtsWithLinkedRecords deletes debts and all linked records without leaving orphans', async () => {
      const notePath = 'test-cascade-debts.md';
      await storage.addRecord(notePath, { id: 'r1', createdAt: 1, date: '2024-01-01', time: '', type: RecordType.EXPENSE, amount: 1000, category: 'Долг', tag: '', payer: 'Иван', note: '', attachmentPath: '', linkedId: 'debt-1' });
      await storage.addRecord(notePath, { id: 'r2', createdAt: 2, date: '2024-01-02', time: '', type: RecordType.INCOME, amount: 500, category: 'Долг', tag: '', payer: 'Иван', note: '', attachmentPath: '', linkedId: 'debt-1' });
      await storage.addRecord(notePath, { id: 'r3', createdAt: 3, date: '2024-01-03', time: '', type: RecordType.EXPENSE, amount: 200, category: 'Еда', tag: '', payer: '', note: '', attachmentPath: '' });
      await storage.addDebt(notePath, { id: 'debt-1', person: 'Иван', amount: 500, originalAmount: 1000, interestRate: 0, direction: DebtDirection.LENT, date: '2024-01-01', time: '', dueDate: '', createdAt: 1, note: '', movements: [] });

      await storage.deleteDebtsWithLinkedRecords(notePath, ['debt-1']);

      const data = await storage.load(notePath);
      expect(data.debts).toHaveLength(0);
      expect(data.records).toHaveLength(1);
      expect(data.records[0].id).toBe('r3');
    });

    it('deleteCreditsWithLinkedRecords deletes credits, linked payments, and down payment records', async () => {
      const notePath = 'test-cascade-credits.md';
      await storage.addRecord(notePath, { id: 'dp-rec-1', createdAt: 1, date: '2024-01-01', time: '', type: RecordType.EXPENSE, amount: 20000, category: 'Кредит', tag: '', payer: 'Банк', note: 'Первоначальный взнос', attachmentPath: '' });
      await storage.addRecord(notePath, { id: 'pay-1', createdAt: 2, date: '2024-02-01', time: '', type: RecordType.EXPENSE, amount: 5000, category: 'Кредит', tag: '', payer: 'Банк', note: 'Платёж', attachmentPath: '', linkedId: 'cr-1' });
      await storage.addRecord(notePath, { id: 'regular-rec', createdAt: 3, date: '2024-02-02', time: '', type: RecordType.INCOME, amount: 50000, category: 'Зарплата', tag: '', payer: '', note: '', attachmentPath: '' });

      await storage.addCredit(notePath, {
        id: 'cr-1', name: 'Автокредит', bankName: 'Банк', originalAmount: 100000, currentAmount: 100000, interestRate: 10, termMonths: 12, monthlyPayment: 5000, startDate: '2024-01-01', status: CreditStatus.ACTIVE, payments: [], type: CreditType.AUTO, createdAt: 1, note: '', downPaymentRecordId: 'dp-rec-1', earlyRepaymentOption: null
      });

      await storage.deleteCreditsWithLinkedRecords(notePath, ['cr-1']);

      const data = await storage.load(notePath);
      expect(data.credits).toHaveLength(0);
      expect(data.records).toHaveLength(1);
      expect(data.records[0].id).toBe('regular-rec');
    });

    it('deleteDepositsWithLinkedRecords deletes deposits and all linked transactions', async () => {
      const notePath = 'test-cascade-deposits.md';
      await storage.addRecord(notePath, { id: 'r-open', createdAt: 1, date: '2024-01-01', time: '', type: RecordType.EXPENSE, amount: 100000, category: 'Вклад', tag: '', payer: 'Банк', note: '', attachmentPath: '', linkedId: 'dep-1' });
      await storage.addRecord(notePath, { id: 'r-int', createdAt: 2, date: '2024-02-01', time: '', type: RecordType.INCOME, amount: 1000, category: 'Проценты', tag: '', payer: 'Банк', note: '', attachmentPath: '', linkedId: 'dep-1' });
      await storage.addRecord(notePath, { id: 'r-unrelated', createdAt: 3, date: '2024-02-02', time: '', type: RecordType.EXPENSE, amount: 300, category: 'Кафе', tag: '', payer: '', note: '', attachmentPath: '' });

      await storage.addDeposit(notePath, {
        id: 'dep-1', name: 'Вклад', type: DepositType.TERM, bankName: 'Банк', amount: 100000, interestRate: 12, startDate: '2024-01-01', termMonths: 6, accrualType: DepositAccrualType.TO_ACCOUNT, status: DepositStatus.ACTIVE, accruals: [], topUps: [], withdrawals: [], createdAt: 1, note: ''
      });

      await storage.deleteDepositsWithLinkedRecords(notePath, ['dep-1']);

      const data = await storage.load(notePath);
      expect(data.deposits).toHaveLength(0);
      expect(data.records).toHaveLength(1);
      expect(data.records[0].id).toBe('r-unrelated');
    });
  });

  describe('currency exchanges CRUD', () => {
    it('adds, updates, and deletes currency exchanges', async () => {
      const notePath = 'test-exchanges.md';
      const ex = {
        id: 'ex-1',
        createdAt: 1,
        date: '2024-01-01',
        time: '',
        type: CurrencyOperationType.BUY,
        amountInAccountCurrency: 9000,
        targetCurrency: 'USD',
        targetAmount: 100,
        exchangeRate: 90,
        provider: 'Сбер',
        note: '',
      };

      await storage.addExchange(notePath, ex);
      let data = await storage.load(notePath);
      expect(data.exchanges).toHaveLength(1);
      expect(data.exchanges[0].targetCurrency).toBe('USD');

      await storage.updateExchange(notePath, { ...ex, targetAmount: 150, amountInAccountCurrency: 13500 });
      data = await storage.load(notePath);
      expect(data.exchanges[0].targetAmount).toBe(150);

      await storage.deleteExchange(notePath, 'ex-1');
      data = await storage.load(notePath);
      expect(data.exchanges).toHaveLength(0);
    });
  });
});