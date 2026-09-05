import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccountCommands } from '../domain/AccountCommands';
import { FinanceStorage } from '../storage/index';
import type { DebtRecord, CreditRecord, DepositRecord, CurrencyExchange, DebtMovement } from '../types';
import { findLinkedRecords } from '../domain/linkedRecords';

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

describe('AccountCommands', () => {
  let commands: AccountCommands;
  let storage: FinanceStorage;
  let mockApp: MockApp;
  const accountId = 'test-account';

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
    storage = new FinanceStorage(mockApp as any, 'test-plugin', '₽');
    commands = new AccountCommands(storage, accountId);
  });

  describe('Debt Commands', () => {
    it('addDebt создаёт долг с начальным движением и записью', async () => {
      const debt: DebtRecord = {
        id: 'debt-1',
        person: 'John Doe',
        amount: 1000,
        originalAmount: 1000,
        interestRate: 0,
        direction: 'borrowed',
        date: '2026-01-01',
        time: '10:00',
        dueDate: '',
        createdAt: Date.now(),
        note: '',
        movements: [],
      };

      const initialMovement: DebtMovement = {
        id: 'mov-1',
        type: 'borrow',
        amount: 1000,
        date: '2026-01-01',
        time: '10:00',
        createdAt: Date.now(),
        note: 'Initial borrow',
      };

      await commands.addDebt(debt, initialMovement, 'Debt', {
        lentNote: 'Lent to {person}',
        borrowedNote: 'Borrowed from {person}',
      });

      const data = await storage.load(accountId);
      expect(data.debts.length).toBe(1);
      expect(data.debts[0].movements.length).toBe(1);
      expect(data.records.length).toBe(1);
      expect(data.records[0].linkedId).toBe('debt-1');
      expect(data.records[0].type).toBe('income');
      expect(data.records[0].amount).toBe(1000);
    });

    it('addDebtMovement создаёт движение с зеркальной записью', async () => {
      const debt: DebtRecord = {
        id: 'debt-1',
        person: 'Jane Smith',
        amount: 500,
        originalAmount: 500,
        interestRate: 0,
        direction: 'lent',
        date: '2026-01-01',
        time: '',
        dueDate: '',
        createdAt: Date.now(),
        note: '',
        movements: [],
      };
      await storage.addDebt(accountId, debt);

      const movement: DebtMovement = {
        id: 'mov-1',
        type: 'repay',
        amount: 100,
        date: '2026-02-01',
        time: '14:00',
        createdAt: Date.now(),
        note: 'Partial repayment',
      };

      await commands.addDebtMovement(debt.id, movement, 'Debt', 'Repayment from Jane');

      const data = await storage.load(accountId);
      const linkedRecords = findLinkedRecords(data.records, debt.id);
      expect(linkedRecords.length).toBe(1);
      expect(linkedRecords[0].type).toBe('income'); // lent → repay → income
      expect(linkedRecords[0].amount).toBe(100);
      expect(linkedRecords[0].linkedMovementId).toBe('mov-1');
    });

    it('deleteDebt удаляет долг и все связанные записи', async () => {
      const debt: DebtRecord = {
        id: 'debt-1',
        person: 'Bob',
        amount: 1000,
        originalAmount: 1000,
        interestRate: 0,
        direction: 'borrowed',
        date: '2026-01-01',
        time: '',
        dueDate: '',
        createdAt: Date.now(),
        note: '',
        movements: [],
      };
      await storage.addDebt(accountId, debt);
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-01',
        time: '',
        type: 'income',
        amount: 1000,
        category: 'Debt',
        tag: '',
        payer: 'Bob',
        note: '',
        attachmentPath: '',
        linkedId: 'debt-1',
      });

      await commands.deleteDebt(debt.id);

      const data = await storage.load(accountId);
      expect(data.debts.length).toBe(0);
      expect(data.records.length).toBe(0);
    });
  });

  describe('Credit Commands', () => {
    it('addCredit создаёт кредит с записью получения', async () => {
      const credit: CreditRecord = {
        id: 'credit-1',
        name: 'Car Loan',
        bankName: 'Test Bank',
        originalAmount: 500000,
        currentAmount: 500000,
        type: 'consumer',
        interestRate: 12,
        monthlyPayment: 15000,
        startDate: '2026-01-01',
        termMonths: 36,
        status: 'active',
        earlyRepaymentOption: null,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };

      await commands.addCredit(credit, 'Credit', {
        receiptNote: 'Credit receipt: "{name}"',
        paymentNote: 'Payment: "{name}"',
      });

      const data = await storage.load(accountId);
      expect(data.credits.length).toBe(1);
      expect(data.records.length).toBe(1);
      expect(data.records[0].type).toBe('income');
      expect(data.records[0].amount).toBe(500000);
      expect(data.records[0].linkedId).toBe('credit-1');
    });

    it('addCredit не создаёт запись получения для ипотеки', async () => {
      const credit: CreditRecord = {
        id: 'credit-1',
        name: 'Mortgage',
        bankName: 'Test Bank',
        originalAmount: 2000000,
        currentAmount: 2000000,
        type: 'mortgage',
        interestRate: 8,
        monthlyPayment: 18000,
        startDate: '2026-01-01',
        termMonths: 240,
        status: 'active',
        earlyRepaymentOption: null,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };

      await commands.addCredit(credit, 'Credit', {
        receiptNote: 'Credit receipt: "{name}"',
        paymentNote: 'Payment: "{name}"',
      });

      const data = await storage.load(accountId);
      expect(data.credits.length).toBe(1);
      expect(data.records.length).toBe(0);
    });

    it('deleteCredit удаляет кредит и все связанные записи', async () => {
      const credit: CreditRecord = {
        id: 'credit-1',
        name: 'Loan',
        bankName: 'Bank',
        originalAmount: 100000,
        currentAmount: 100000,
        type: 'consumer',
        interestRate: 10,
        monthlyPayment: 9000,
        startDate: '2026-01-01',
        termMonths: 12,
        status: 'active',
        earlyRepaymentOption: null,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };
      await storage.addCredit(accountId, credit);
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-01',
        time: '',
        type: 'income',
        amount: 100000,
        category: 'Credit',
        tag: '',
        payer: 'Bank',
        note: '',
        attachmentPath: '',
        linkedId: 'credit-1',
      });

      await commands.deleteCredit(credit.id);

      const data = await storage.load(accountId);
      expect(data.credits.length).toBe(0);
      expect(data.records.length).toBe(0);
    });
  });

  describe('Deposit Commands', () => {
    it('closeDeposit закрывает вклад и создаёт возврат', async () => {
      const deposit: DepositRecord = {
        id: 'deposit-1',
        name: 'Savings',
        type: 'term',
        bankName: 'Test Bank',
        amount: 50000,
        interestRate: 5,
        startDate: '2026-01-01',
        termMonths: 12,
        accrualType: 'to_account',
        status: 'active',
        accruals: [],
        topUps: [],
        withdrawals: [],
        createdAt: Date.now(),
        note: '',
      };
      await storage.addDeposit(accountId, deposit);

      await commands.closeDeposit(deposit, 'Deposit', 'Deposit refund: "Savings"');

      const data = await storage.load(accountId);
      expect(data.deposits[0].status).toBe('closed');
      expect(data.records.length).toBe(1);
      expect(data.records[0].type).toBe('income');
      expect(data.records[0].amount).toBe(50000);
      expect(data.records[0].linkedId).toBe('deposit-1');
    });

    it('deleteDeposit создаёт возврат без linkedId для активного вклада', async () => {
      const deposit: DepositRecord = {
        id: 'deposit-1',
        name: 'Savings',
        type: 'savings',
        bankName: 'Test Bank',
        amount: 30000,
        interestRate: 4,
        startDate: '2026-01-01',
        termMonths: 6,
        accrualType: 'capitalization',
        status: 'active',
        accruals: [],
        topUps: [],
        withdrawals: [],
        createdAt: Date.now(),
        note: '',
      };
      await storage.addDeposit(accountId, deposit);
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-01',
        time: '',
        type: 'expense',
        amount: 30000,
        category: 'Deposit',
        tag: '',
        payer: 'Test Bank',
        note: '',
        attachmentPath: '',
        linkedId: 'deposit-1',
      });

      await commands.deleteDeposit(deposit.id, 'Deposit', 'Refund: "Savings"');

      const data = await storage.load(accountId);
      expect(data.deposits.length).toBe(0);
      expect(data.records.length).toBe(1);
      expect(data.records[0].linkedId).toBeUndefined();
      expect(data.records[0].type).toBe('income');
      expect(data.records[0].amount).toBe(30000);
    });

    it('deleteDeposit не создаёт возврат для закрытого вклада', async () => {
      const deposit: DepositRecord = {
        id: 'deposit-1',
        name: 'Closed Savings',
        type: 'term',
        bankName: 'Test Bank',
        amount: 20000,
        interestRate: 3,
        startDate: '2026-01-01',
        termMonths: 12,
        accrualType: 'to_account',
        status: 'closed',
        accruals: [],
        topUps: [],
        withdrawals: [],
        createdAt: Date.now(),
        note: '',
      };
      await storage.addDeposit(accountId, deposit);

      await commands.deleteDeposit(deposit.id, 'Deposit', 'Refund');

      const data = await storage.load(accountId);
      expect(data.deposits.length).toBe(0);
      expect(data.records.length).toBe(0);
    });
  });

  describe('Currency Exchange Commands', () => {
    it('deleteExchange удаляет обмен и связанную запись', async () => {
      const exchange: CurrencyExchange = {
        id: 'ex-1',
        date: '2026-01-15',
        time: '14:00',
        type: 'buy',
        amountInAccountCurrency: 9550,
        targetCurrency: '$',
        targetAmount: 100,
        exchangeRate: 95.5,
        provider: 'Bank',
        createdAt: Date.now(),
        note: 'Test exchange',
      };
      await storage.addExchange(accountId, exchange);
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-15',
        time: '14:00',
        type: 'expense',
        amount: 9550,
        category: 'Exchange',
        tag: '',
        payer: '',
        note: '',
        attachmentPath: '',
        linkedId: 'ex-1',
        isInternal: true,
      });

      await commands.deleteExchange(exchange.id);

      const data = await storage.load(accountId);
      expect(data.exchanges.length).toBe(0);
      expect(data.records.length).toBe(0);
    });
  });

  describe('Missing Coverage: Debt Movement Updates', () => {
    it('updateDebtMovement изменяет сумму и дату движения и зеркальной записи', async () => {
      const debt: DebtRecord = {
        id: 'debt-1', person: 'Alice', amount: 500, originalAmount: 500,
        interestRate: 0, direction: 'borrowed', date: '2026-01-01', time: '10:00',
        dueDate: '', createdAt: Date.now(), note: '', movements: [
          { id: 'mov-1', type: 'borrow', amount: 500, date: '2026-01-01', time: '10:00', createdAt: Date.now(), note: '' },
          { id: 'mov-2', type: 'repay', amount: 100, date: '2026-02-01', time: '12:00', createdAt: Date.now(), note: '' },
        ],
      };
      await storage.addDebt(accountId, debt);
      await storage.addRecord(accountId, {
        id: 'rec-2', createdAt: Date.now(), date: '2026-02-01', time: '12:00',
        type: 'expense', amount: 100, category: 'Repay', linkedId: 'debt-1',
        linkedMovementId: 'mov-2', tag: '', payer: '', note: '', attachmentPath: '', isInternal: false,
      });

      const oldMovement = debt.movements[1];
      await commands.updateDebtMovement('debt-1', oldMovement, {
        id: 'mov-2', type: 'repay', amount: 200, date: '2026-02-05', time: '15:00',
        createdAt: Date.now(), note: 'Увеличено',
      });

      const data = await storage.load(accountId);
      const updated = data.debts[0].movements.find(m => m.id === 'mov-2');
      expect(updated?.amount).toBe(200);
      expect(updated?.date).toBe('2026-02-05');
      expect(updated?.note).toBe('Увеличено');

      const rec = data.records.find(r => r.linkedMovementId === 'mov-2');
      expect(rec?.amount).toBe(200);
      expect(rec?.date).toBe('2026-02-05');
    });

    it('deleteDebtMovement удаляет движение и его зеркальную запись', async () => {
      const debt: DebtRecord = {
        id: 'debt-1', person: 'Bob', amount: 300, originalAmount: 500,
        interestRate: 0, direction: 'lent', date: '2026-01-01', time: '10:00',
        dueDate: '', createdAt: Date.now(), note: '', movements: [
          { id: 'mov-1', type: 'borrow', amount: 500, date: '2026-01-01', time: '10:00', createdAt: Date.now(), note: '' },
          { id: 'mov-2', type: 'repay', amount: 200, date: '2026-02-01', time: '12:00', createdAt: Date.now(), note: '' },
        ],
      };
      await storage.addDebt(accountId, debt);
      await storage.addRecord(accountId, {
        id: 'rec-2', createdAt: Date.now(), date: '2026-02-01', time: '12:00',
        type: 'income', amount: 200, category: 'Repay', linkedId: 'debt-1',
        linkedMovementId: 'mov-2', tag: '', payer: '', note: '', attachmentPath: '', isInternal: false,
      });

      await commands.deleteDebtMovement('debt-1', 'mov-2', '2026-02-01', 200);

      const data = await storage.load(accountId);
      expect(data.debts[0].movements.length).toBe(1);
      expect(data.debts[0].movements.find(m => m.id === 'mov-2')).toBeUndefined();
      expect(data.records.find(r => r.linkedMovementId === 'mov-2')).toBeUndefined();
    });
  });

  describe('Missing Coverage: Credit Updates', () => {
    it('updateCredit изменяет данные кредита', async () => {
      const credit: CreditRecord = {
        id: 'cr-1', name: 'Car Loan', originalAmount: 500_000, interestRate: 10,
        termMonths: 36, startDate: '2026-01-01', monthlyPayment: 16_000, currentAmount: 500_000,
        status: 'active', createdAt: Date.now(), note: '', payments: [], bankName: 'TestBank',
        type: 'consumer', earlyRepaymentOption: null,
      };
      await storage.addCredit(accountId, credit);

      await commands.updateCredit(
        { ...credit, name: 'Renamed Loan', interestRate: 12, note: 'Updated note' },
        'Credit',
        { receiptNote: 'Receipt for {name}', paymentNote: 'Payment for {name}' }
      );

      const data = await storage.load(accountId);
      expect(data.credits[0].name).toBe('Renamed Loan');
      expect(data.credits[0].interestRate).toBe(12);
      expect(data.credits[0].note).toBe('Updated note');
    });
  });

  describe('Missing Coverage: Batch Deletes', () => {
    it('deleteDebts удаляет несколько долгов и их записи', async () => {
      await storage.addDebt(accountId, {
        id: 'd1', person: 'A', amount: 100, originalAmount: 100, interestRate: 0,
        direction: 'borrowed', date: '2026-01-01', time: '10:00', dueDate: '',
        createdAt: Date.now(), note: '', movements: [],
      });
      await storage.addDebt(accountId, {
        id: 'd2', person: 'B', amount: 200, originalAmount: 200, interestRate: 0,
        direction: 'lent', date: '2026-01-02', time: '10:00', dueDate: '',
        createdAt: Date.now(), note: '', movements: [],
      });
      await storage.addRecord(accountId, {
        id: 'r1', createdAt: Date.now(), date: '2026-01-01', time: '10:00',
        type: 'income', amount: 100, category: 'Debt', linkedId: 'd1',
        tag: '', payer: '', note: '', attachmentPath: '', isInternal: false,
      });
      await storage.addRecord(accountId, {
        id: 'r2', createdAt: Date.now(), date: '2026-01-02', time: '10:00',
        type: 'expense', amount: 200, category: 'Debt', linkedId: 'd2',
        tag: '', payer: '', note: '', attachmentPath: '', isInternal: false,
      });

      await commands.deleteDebts(['d1', 'd2']);

      const data = await storage.load(accountId);
      expect(data.debts.length).toBe(0);
      expect(data.records.length).toBe(0);
    });

    it('deleteCredits удаляет несколько кредитов и их записи', async () => {
      await storage.addCredit(accountId, {
        id: 'c1', name: 'Loan 1', originalAmount: 100_000, interestRate: 10,
        termMonths: 12, startDate: '2026-01-01', monthlyPayment: 8_800, currentAmount: 100_000,
        status: 'active', createdAt: Date.now(), note: '', payments: [], bankName: 'Bank1',
        type: 'consumer', earlyRepaymentOption: null,
      });
      await storage.addCredit(accountId, {
        id: 'c2', name: 'Loan 2', originalAmount: 200_000, interestRate: 12,
        termMonths: 24, startDate: '2026-01-01', monthlyPayment: 9_400, currentAmount: 200_000,
        status: 'active', createdAt: Date.now(), note: '', payments: [], bankName: 'Bank2',
        type: 'consumer', earlyRepaymentOption: null,
      });
      await storage.addRecord(accountId, {
        id: 'r1', createdAt: Date.now(), date: '2026-01-01', time: '10:00',
        type: 'income', amount: 100_000, category: 'Credit', linkedId: 'c1',
        tag: '', payer: '', note: '', attachmentPath: '', isInternal: false,
      });
      await storage.addRecord(accountId, {
        id: 'r2', createdAt: Date.now(), date: '2026-01-01', time: '10:00',
        type: 'income', amount: 200_000, category: 'Credit', linkedId: 'c2',
        tag: '', payer: '', note: '', attachmentPath: '', isInternal: false,
      });

      await commands.deleteCredits(['c1', 'c2']);

      const data = await storage.load(accountId);
      expect(data.credits.length).toBe(0);
      expect(data.records.length).toBe(0);
    });

    it('deleteDeposits удаляет несколько вкладов и создаёт возвраты для активных', async () => {
      await storage.addDeposit(accountId, {
        id: 'dep1', name: 'Deposit 1', type: 'term', bankName: 'Bank1', amount: 50_000,
        interestRate: 8, startDate: '2026-01-01', termMonths: 12, accrualType: 'to_account',
        createdAt: Date.now(), note: '', status: 'active', accruals: [], topUps: [], withdrawals: [],
      });
      await storage.addDeposit(accountId, {
        id: 'dep2', name: 'Deposit 2', type: 'savings', bankName: 'Bank2', amount: 0,
        interestRate: 6, startDate: '2026-01-01', termMonths: 12, accrualType: 'to_account',
        createdAt: Date.now(), note: '', status: 'closed', accruals: [], topUps: [], withdrawals: [],
      });
      await storage.addRecord(accountId, {
        id: 'r1', createdAt: Date.now(), date: '2026-01-01', time: '10:00',
        type: 'expense', amount: 50_000, category: 'Deposit', linkedId: 'dep1',
        tag: '', payer: '', note: '', attachmentPath: '', isInternal: false,
      });

      await commands.deleteDeposits(['dep1', 'dep2'], 'Deposit', 'Deposit refund');

      const data = await storage.load(accountId);
      expect(data.deposits.length).toBe(0);
      // dep1 был активный → создастся возврат; dep2 закрыт → нет
      const refunds = data.records.filter(r => r.category === 'Deposit' && r.type === 'income');
      expect(refunds.length).toBe(1);
      expect(refunds[0].amount).toBe(50_000);
    });
  });

  describe('Missing Coverage: Deposit Top-ups and Withdrawals', () => {
    it('addDepositTopUp увеличивает сумму вклада и создаёт запись', async () => {
      await storage.addDeposit(accountId, {
        id: 'dep1', name: 'Savings', type: 'savings', bankName: 'Bank', amount: 100_000,
        interestRate: 5, startDate: '2026-01-01', termMonths: 12, accrualType: 'to_account',
        createdAt: Date.now(), note: '', status: 'active', accruals: [], topUps: [], withdrawals: [],
      });

      await commands.addDepositTopUp('dep1', {
        id: 'top-1', amount: 20_000, date: '2026-02-01', time: '12:00',
        createdAt: Date.now(), note: 'Bonus',
      }, 'Deposit', 'Top-up to Savings');

      const data = await storage.load(accountId);
      expect(data.deposits[0].amount).toBe(120_000);
      expect(data.deposits[0].topUps.length).toBe(1);

      const rec = data.records.find(r => r.linkedId === 'dep1' && r.type === 'expense');
      expect(rec?.amount).toBe(20_000);
    });

    it('deleteDepositTopUp откатывает пополнение и удаляет запись', async () => {
      await storage.addDeposit(accountId, {
        id: 'dep1', name: 'Savings', type: 'savings', bankName: 'Bank', amount: 120_000,
        interestRate: 5, startDate: '2026-01-01', termMonths: 12, accrualType: 'to_account',
        createdAt: Date.now(), note: '', status: 'active', accruals: [],
        topUps: [{ id: 'top-1', amount: 20_000, date: '2026-02-01', time: '12:00', createdAt: Date.now(), note: '' }],
        withdrawals: [],
      });
      await storage.addRecord(accountId, {
        id: 'rec-top', createdAt: Date.now(), date: '2026-02-01', time: '12:00',
        type: 'expense', amount: 20_000, category: 'Deposit', linkedId: 'dep1',
        tag: '', payer: '', note: '', attachmentPath: '', isInternal: false,
      });

      await commands.deleteDepositTopUp('dep1', 'top-1', '2026-02-01', 20_000);

      const data = await storage.load(accountId);
      expect(data.deposits[0].amount).toBe(100_000);
      expect(data.deposits[0].topUps.length).toBe(0);
      expect(data.records.find(r => r.linkedId === 'dep1' && r.date === '2026-02-01')).toBeUndefined();
    });

    it('addDepositWithdrawal уменьшает сумму вклада и создаёт запись', async () => {
      await storage.addDeposit(accountId, {
        id: 'dep1', name: 'Savings', type: 'savings', bankName: 'Bank', amount: 100_000,
        interestRate: 5, startDate: '2026-01-01', termMonths: 12, accrualType: 'to_account',
        createdAt: Date.now(), note: '', status: 'active', accruals: [], topUps: [], withdrawals: [],
      });

      await commands.addDepositWithdrawal('dep1', {
        id: 'wd-1', amount: 15_000, date: '2026-03-01', time: '14:00',
        createdAt: Date.now(), note: 'Emergency',
      }, 'Deposit', 'Withdrawal from Savings');

      const data = await storage.load(accountId);
      expect(data.deposits[0].amount).toBe(85_000);
      expect(data.deposits[0].withdrawals.length).toBe(1);

      const rec = data.records.find(r => r.linkedId === 'dep1' && r.type === 'income');
      expect(rec?.amount).toBe(15_000);
    });

    it('deleteDepositWithdrawal возвращает снятую сумму и удаляет запись', async () => {
      await storage.addDeposit(accountId, {
        id: 'dep1', name: 'Savings', type: 'savings', bankName: 'Bank', amount: 85_000,
        interestRate: 5, startDate: '2026-01-01', termMonths: 12, accrualType: 'to_account',
        createdAt: Date.now(), note: '', status: 'active', accruals: [], topUps: [],
        withdrawals: [{ id: 'wd-1', amount: 15_000, date: '2026-03-01', time: '14:00', createdAt: Date.now(), note: '' }],
      });
      await storage.addRecord(accountId, {
        id: 'rec-wd', createdAt: Date.now(), date: '2026-03-01', time: '14:00',
        type: 'income', amount: 15_000, category: 'Deposit', linkedId: 'dep1',
        tag: '', payer: '', note: '', attachmentPath: '', isInternal: false,
      });

      await commands.deleteDepositWithdrawal('dep1', 'wd-1', '2026-03-01', 15_000);

      const data = await storage.load(accountId);
      expect(data.deposits[0].amount).toBe(100_000);
      expect(data.deposits[0].withdrawals.length).toBe(0);
      expect(data.records.find(r => r.linkedId === 'dep1' && r.date === '2026-03-01')).toBeUndefined();
    });
  });
});
