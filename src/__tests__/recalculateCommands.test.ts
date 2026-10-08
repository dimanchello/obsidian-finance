import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { App } from 'obsidian';
import { AccountCommands } from '../domain/AccountCommands';
import { FinanceStorage } from '../storage/index';
import {
  DebtRecord, CreditRecord, DepositRecord, DebtMovement,
  RecordType, DebtDirection, DebtMovementType, CreditType, CreditStatus,
  PaymentStatus, DepositType, DepositStatus, DepositAccrualType,
  EarlyRepaymentOption,
} from '../types';
import type { AutoTxDeps } from '../domain/autoTransactions';

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

describe('Recalculate Commands in AccountCommands', () => {
  let commands: AccountCommands;
  let storage: FinanceStorage;
  let mockApp: MockApp;
  const accountId = 'test-account';

  const autoTxDeps: AutoTxDeps = {
    today: '2026-06-01',
    now: 1772400000000,
    nowTime: '12:00',
    newId: () => crypto.randomUUID(),
    labels: {
      depositInterestCat: 'Deposit Interest',
      depositInterestNote: 'Interest for',
      depositRefundCat: 'Deposit Refund',
      depositRefundNote: 'Refund for',
      depositOpeningCat: 'Deposit Opening',
      depositOpenNote: 'Opened deposit',
      creditDefaultCat: 'Credit Payment',
      creditPaymentNote: 'Payment for',
    },
  };

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
    storage = new FinanceStorage(mockApp as unknown as App, 'test-plugin', '₽');
    commands = new AccountCommands(storage, accountId);
  });

  describe('Debt update', () => {
    it('updateDebt synchronizes initial movement amount and linked record', async () => {
      const initialMov: DebtMovement = {
        id: 'mov-1',
        type: DebtMovementType.BORROW,
        amount: 1000,
        date: '2026-01-01',
        time: '10:00',
        createdAt: 1000,
        note: 'Дано в долг',
      };
      const debt: DebtRecord = {
        id: 'debt-1',
        person: 'Alice',
        amount: 1000,
        originalAmount: 1000,
        interestRate: 0,
        direction: DebtDirection.LENT,
        date: '2026-01-01',
        time: '10:00',
        dueDate: '',
        createdAt: 1000,
        note: '',
        movements: [initialMov],
      };

      await commands.addDebt(debt, initialMov, 'Debts', {
        lentNote: 'Дано в долг',
        borrowedNote: 'Взято в долг',
      });

      const originalRecord = (await storage.load(accountId)).records[0]!;
      await storage.updateRecord(accountId, { ...originalRecord, category: 'Custom Category' });

      const updatedDebt: DebtRecord = {
        ...debt,
        person: 'Alice Updated',
        originalAmount: 1500,
        amount: 1500,
        movements: [{ ...initialMov, amount: 1500 }],
      };

      await commands.updateDebt(updatedDebt, {
        lentNote: 'Дано в долг',
        borrowedNote: 'Взято в долг',
      });

      const data = await storage.load(accountId);
      expect(data.debts[0]!.person).toBe('Alice Updated');
      expect(data.debts[0]!.movements[0]!.amount).toBe(1500);
      expect(data.records[0]!.amount).toBe(1500);
      expect(data.records[0]!.payer).toBe('Alice Updated');
      expect(data.records[0]!.category).toBe('Custom Category');
    });
  });

  describe('Credit recalculation', () => {
    it('recalculateCredit generates annuity schedule, sets status, and creates records', async () => {
      const credit: CreditRecord = {
        id: 'credit-1',
        name: 'Car Loan',
        type: CreditType.AUTO,
        bankName: 'Alpha Bank',
        originalAmount: 120000,
        currentAmount: 120000,
        earlyRepaymentOption: EarlyRepaymentOption.TERM,
        interestRate: 12,
        startDate: '2026-01-01',
        termMonths: 12,
        monthlyPayment: 10661.85,
        paymentDay: 1,
        createdAt: 1000,
        note: '',
        status: CreditStatus.ACTIVE,
        payments: [],
      };

      await storage.addCredit(accountId, credit);
      await storage.addRecord(accountId, {
        id: 'manual-credit-record',
        createdAt: 2000,
        date: '2026-02-15',
        time: '',
        type: RecordType.EXPENSE,
        amount: 125,
        category: 'Manual Credit Adjustment',
        tag: '',
        payer: '',
        note: '',
        attachmentPath: '',
        linkedId: credit.id,
        isInternal: false,
      });

      await commands.recalculateCredit('credit-1', 'Credit', {
        receiptNote: 'Получен кредит {name}',
        paymentNote: 'Платеж по кредиту {name}',
        downPaymentNote: 'Первоначальный взнос ',
      });

      const data = await storage.load(accountId);
      const updatedCredit = data.credits[0]!;
      expect(updatedCredit.payments).toHaveLength(12);

      // Payments with dueDate <= today should be PAID
      const paidPayments = updatedCredit.payments.filter(p => p.status === PaymentStatus.PAID);
      expect(paidPayments.length).toBeGreaterThan(0);

      // In records: 1 receipt record + 1 record for each paid payment
      const receipts = data.records.filter(r => r.type === RecordType.INCOME);
      const paymentRecords = data.records.filter(r => r.type === RecordType.EXPENSE && r.isInternal !== false);
      expect(receipts).toHaveLength(1);
      expect(paymentRecords).toHaveLength(paidPayments.length);
      expect(data.records.find(r => r.id === 'manual-credit-record')?.amount).toBe(125);
    });
  });

  describe('Deposit recalculation', () => {
    it('recalculateDeposit builds fresh schedule and mirrors opening and accruals', async () => {
      const deposit: DepositRecord = {
        id: 'dep-1',
        name: 'Savings',
        type: DepositType.TERM,
        bankName: 'Best Bank',
        amount: 100000,
        interestRate: 10,
        startDate: '2026-01-01',
        termMonths: 6,
        accrualType: DepositAccrualType.TO_ACCOUNT,
        createdAt: 1000,
        note: '',
        status: DepositStatus.ACTIVE,
        accruals: [],
        topUps: [],
        withdrawals: [],
      };

      await storage.addDeposit(accountId, deposit);

      await commands.recalculateDeposit('dep-1', autoTxDeps);

      const data = await storage.load(accountId);
      const updatedDeposit = data.deposits[0]!;
      expect(updatedDeposit.accruals).toHaveLength(6);

      // Opening expense record was created
      const openingRecord = data.records.find(r => r.category === autoTxDeps.labels.depositOpeningCat);
      expect(openingRecord).toBeDefined();
      expect(openingRecord!.amount).toBe(100000);

      // Interest income records for due accruals
      const interestRecords = data.records.filter(r => r.category === autoTxDeps.labels.depositInterestCat);
      const paidAccruals = updatedDeposit.accruals.filter(a => a.status === PaymentStatus.PAID);
      expect(interestRecords).toHaveLength(paidAccruals.length);
    });

    it('preserves top-ups, withdrawals, their records, and recalculates from the initial balance', async () => {
      const deposit: DepositRecord = {
        id: 'dep-movements',
        name: 'Savings with movements',
        type: DepositType.TERM,
        bankName: 'Best Bank',
        amount: 100000,
        interestRate: 10,
        startDate: '2026-01-01',
        termMonths: 6,
        accrualType: DepositAccrualType.TO_ACCOUNT,
        createdAt: 1000,
        note: '',
        status: DepositStatus.ACTIVE,
        accruals: [],
        topUps: [],
        withdrawals: [],
      };
      const topUp = {
        id: 'top-up-1', amount: 20000, date: '2026-02-01', time: '', createdAt: 2000, note: '',
      };
      const withdrawal = {
        id: 'withdrawal-1', amount: 5000, date: '2026-03-01', time: '', createdAt: 3000, note: '',
      };

      await storage.addDeposit(accountId, deposit);
      await commands.addDepositTopUp('dep-movements', topUp, 'Top Ups', 'Added funds');
      await commands.addDepositWithdrawal('dep-movements', withdrawal, 'Withdrawals', 'Removed funds');
      await commands.recalculateDeposit('dep-movements', autoTxDeps);

      const data = await storage.load(accountId);
      const updatedDeposit = data.deposits.find(d => d.id === 'dep-movements')!;
      expect(updatedDeposit.amount).toBe(115000);
      expect(updatedDeposit.topUps).toEqual([topUp]);
      expect(updatedDeposit.withdrawals).toEqual([withdrawal]);
      expect(updatedDeposit.accruals[0]!.amount).toBeCloseTo(849.32, 2);
      expect(updatedDeposit.accruals[1]!.amount).toBeCloseTo(920.55, 2);
      expect(data.records.find(r => r.linkedMovementId === topUp.id)?.amount).toBe(topUp.amount);
      expect(data.records.find(r => r.linkedMovementId === withdrawal.id)?.amount).toBe(withdrawal.amount);
      expect(data.records.find(r => r.category === autoTxDeps.labels.depositOpeningCat)?.amount).toBe(100000);
    });

    it('does not recalculate or reopen a closed deposit', async () => {
      const closedDeposit: DepositRecord = {
        id: 'dep-closed',
        name: 'Closed Savings',
        type: DepositType.TERM,
        bankName: 'Best Bank',
        amount: 25000,
        interestRate: 10,
        startDate: '2026-01-01',
        termMonths: 6,
        accrualType: DepositAccrualType.TO_ACCOUNT,
        createdAt: 1000,
        note: '',
        status: DepositStatus.CLOSED,
        accruals: [{ id: 'closed-accrual', amount: 100, dueDate: '2026-07-01', status: PaymentStatus.PENDING }],
        topUps: [],
        withdrawals: [],
      };
      await storage.addDeposit(accountId, closedDeposit);

      await commands.recalculateDeposit('dep-closed', autoTxDeps);

      const data = await storage.load(accountId);
      expect(data.deposits[0]).toEqual(closedDeposit);
      expect(data.records).toHaveLength(0);
    });
  });
});
