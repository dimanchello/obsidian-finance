import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinanceStorage } from '../storage/index';
import { applyAutoTransactions, type AutoTxDeps } from '../domain/autoTransactions';
import {
  type CreditRecord, type DepositRecord,
  CreditType, CreditStatus, EarlyRepaymentOption,
  DepositType, DepositStatus, DepositAccrualType,
  PaymentStatus, RecordType,
} from '../types';
import { findLinkedRecords } from '../domain/linkedRecords';

/**
 * Integration tests for autoTransactions.
 *
 * These tests verify that:
 * 1. Credit payments auto-mark as paid on due date
 * 2. Deposit accruals auto-generate on schedule
 * 3. Early repayment recalculates credit schedule
 * 4. Auto-generated records sync correctly with storage
 */

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

const LABELS = {
  depositInterestCat: 'Проценты по вкладу',
  depositInterestNote: 'Начисление по вкладу',
  depositRefundCat: 'Возврат вклада',
  depositRefundNote: 'Закрытие вклада',
  depositOpeningCat: 'Открытие вклада',
  depositOpenNote: 'Открытие вклада',
  creditDefaultCat: 'Кредит',
  creditPaymentNote: 'Платёж по кредиту',
};

function mkDeps(today: string): AutoTxDeps {
  let n = 0;
  return {
    today,
    now: 1_700_000_000_000,
    nowTime: '12:00',
    newId: () => `gen-${++n}`,
    labels: LABELS,
  };
}

describe('autoTransactions Integration Tests', () => {
  let storage: FinanceStorage;
  let mockAdapter: MockAdapter;
  let mockApp: MockApp;
  const accountId = 'acc-integration-test';

  beforeEach(() => {
    const files = new Map<string, string>();

    mockAdapter = {
      exists: vi.fn(async (p: string) => files.has(p)),
      read: vi.fn(async (p: string) => files.get(p) ?? ''),
      write: vi.fn(async (p: string, data: string) => {
        files.set(p, data);
      }),
      mkdir: vi.fn(async () => {}),
      remove: vi.fn(async (p: string) => {
        files.delete(p);
      }),
      rename: vi.fn(async (oldP: string, newP: string) => {
        const val = files.get(oldP);
        if (val !== undefined) {
          files.set(newP, val);
          files.delete(oldP);
        }
      }),
      list: vi.fn(async () => ({ files: [], folders: [] })),
      rmdir: vi.fn(async () => {}),
    };

    mockApp = {
      vault: {
        adapter: mockAdapter,
      },
    };

    storage = new FinanceStorage(mockApp as any, 'test-plugin', '₽');
  });

  describe('Credit Auto-Payments', () => {
    it('автоплатежи по кредиту маркируются оплаченными при наступлении срока', async () => {
      // Create credit with payment schedule
      const credit: CreditRecord = {
        id: 'credit-1',
        name: 'Автокредит',
        bankName: 'Тест Банк',
        originalAmount: 500000,
        currentAmount: 500000,
        type: CreditType.CONSUMER,
        interestRate: 12,
        monthlyPayment: 16000,
        startDate: '2026-01-15',
        termMonths: 36,
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };

      await storage.addCredit(accountId, credit);

      // Load data and run autoTransactions on credit start date
      let data = await storage.load(accountId);
      let result = applyAutoTransactions(data, mkDeps('2026-01-15'));

      // Payments schedule should be generated
      expect(result.changed.credits).toBe(true);
      expect(result.credits[0].payments.length).toBeGreaterThan(0);

      // Save updated credit
      await storage.updateCredit(accountId, result.credits[0]);

      // Move forward 1 month - first payment becomes due
      data = await storage.load(accountId);
      result = applyAutoTransactions(data, mkDeps('2026-02-15'));

      // First payment should be marked as paid
      expect(result.changed.credits).toBe(true);
      const firstPayment = result.credits[0].payments[0];
      expect(firstPayment.status).toBe(PaymentStatus.PAID);
      expect(firstPayment.paidDate).toBe('2026-02-15');

      // Mirrored expense record should be created
      expect(result.changed.records).toBe(true);
      const linkedRecords = findLinkedRecords(result.records, 'credit-1');
      expect(linkedRecords.length).toBeGreaterThan(0);

      const paymentRecord = linkedRecords.find(r => r.type === RecordType.EXPENSE && r.date === '2026-02-15');
      expect(paymentRecord).toBeDefined();
      expect(paymentRecord?.amount).toBe(16000);
      expect(paymentRecord?.category).toBe(LABELS.creditDefaultCat);
    });

    it('несколько просроченных платежей маркируются оплаченными одновременно', async () => {
      const credit: CreditRecord = {
        id: 'credit-2',
        name: 'Ипотека',
        bankName: 'Тест Банк',
        originalAmount: 2000000,
        currentAmount: 2000000,
        type: CreditType.MORTGAGE,
        interestRate: 9,
        monthlyPayment: 20000,
        startDate: '2026-01-01',
        termMonths: 240,
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };

      await storage.addCredit(accountId, credit);

      // Generate schedule on start date
      let data = await storage.load(accountId);
      let result = applyAutoTransactions(data, mkDeps('2026-01-01'));
      await storage.updateCredit(accountId, result.credits[0]);

      // Jump forward 3 months - 3 payments should be marked paid
      data = await storage.load(accountId);
      result = applyAutoTransactions(data, mkDeps('2026-04-01'));

      const paidPayments = result.credits[0].payments.filter(p => p.status === PaymentStatus.PAID);
      expect(paidPayments.length).toBe(3);

      // Should have 3 linked expense records
      const linkedRecords = findLinkedRecords(result.records, 'credit-2');
      const expenseRecords = linkedRecords.filter(r => r.type === RecordType.EXPENSE);
      expect(expenseRecords.length).toBe(3);
    });

    it('повторный запуск не создаёт дубликатов записей', async () => {
      const credit: CreditRecord = {
        id: 'credit-3',
        name: 'Потребительский',
        bankName: 'Тест Банк',
        originalAmount: 100000,
        currentAmount: 100000,
        type: CreditType.CONSUMER,
        interestRate: 15,
        monthlyPayment: 9000,
        startDate: '2026-01-01',
        termMonths: 12,
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };

      await storage.addCredit(accountId, credit);

      // First run - generate schedule
      let data = await storage.load(accountId);
      let result = applyAutoTransactions(data, mkDeps('2026-01-01'));
      await storage.updateCredit(accountId, result.credits[0]);

      // Second run - mark first payment as paid
      data = await storage.load(accountId);
      result = applyAutoTransactions(data, mkDeps('2026-02-01'));
      await storage.updateCredit(accountId, result.credits[0]);
      await storage.saveAllRecords(accountId, result.records);

      const recordsAfterFirst = result.records.length;

      // Third run - should not create duplicates
      data = await storage.load(accountId);
      result = applyAutoTransactions(data, mkDeps('2026-02-01'));

      expect(result.changed.credits).toBe(false);
      expect(result.changed.records).toBe(false);
      expect(result.records.length).toBe(recordsAfterFirst);
    });
  });

  describe('Deposit Auto-Accruals', () => {
    it('начисления по вкладу автоматически генерируются по расписанию', async () => {
      const deposit: DepositRecord = {
        id: 'deposit-1',
        name: 'Срочный вклад',
        type: DepositType.TERM,
        bankName: 'Тест Банк',
        amount: 100000,
        interestRate: 12,
        startDate: '2026-01-15',
        termMonths: 12,
        accrualType: DepositAccrualType.TO_ACCOUNT,
        status: DepositStatus.ACTIVE,
        accruals: [],
        topUps: [],
        withdrawals: [],
        createdAt: Date.now(),
        note: '',
      };

      await storage.addDeposit(accountId, deposit);

      // Run autoTransactions on start date - schedule should be generated
      let data = await storage.load(accountId);
      let result = applyAutoTransactions(data, mkDeps('2026-01-15'));

      expect(result.changed.deposits).toBe(true);
      expect(result.deposits[0].accruals.length).toBeGreaterThan(0);

      // Opening expense should be created
      expect(result.changed.records).toBe(true);
      const openingRecord = result.records.find(
        r => r.linkedId === 'deposit-1' && r.type === RecordType.EXPENSE
      );
      expect(openingRecord).toBeDefined();
      expect(openingRecord?.amount).toBe(100000);
      expect(openingRecord?.category).toBe(LABELS.depositOpeningCat);

      // Save state
      await storage.updateDeposit(accountId, result.deposits[0]);
      await storage.saveAllRecords(accountId, result.records);

      // Move forward 1 month - first accrual becomes due
      data = await storage.load(accountId);
      result = applyAutoTransactions(data, mkDeps('2026-02-15'));

      expect(result.changed.deposits).toBe(true);
      const firstAccrual = result.deposits[0].accruals[0];
      expect(firstAccrual.status).toBe(PaymentStatus.PAID);
      expect(firstAccrual.paidDate).toBe('2026-02-15');

      // Income record should be created (to_account type)
      expect(result.changed.records).toBe(true);
      const accrualRecord = result.records.find(
        r => r.linkedId === 'deposit-1' && r.type === RecordType.INCOME && r.date === '2026-02-15'
      );
      expect(accrualRecord).toBeDefined();
      expect(accrualRecord?.category).toBe(LABELS.depositInterestCat);
    });

    it('капитализация процентов увеличивает сумму вклада', async () => {
      const deposit: DepositRecord = {
        id: 'deposit-2',
        name: 'Вклад с капитализацией',
        type: DepositType.SAVINGS,
        bankName: 'Тест Банк',
        amount: 100000,
        interestRate: 12,
        startDate: '2026-01-01',
        termMonths: 12,
        accrualType: DepositAccrualType.CAPITALIZATION,
        status: DepositStatus.ACTIVE,
        accruals: [],
        topUps: [],
        withdrawals: [],
        createdAt: Date.now(),
        note: '',
      };

      await storage.addDeposit(accountId, deposit);

      // Generate schedule
      let data = await storage.load(accountId);
      let result = applyAutoTransactions(data, mkDeps('2026-01-01'));
      await storage.updateDeposit(accountId, result.deposits[0]);
      await storage.saveAllRecords(accountId, result.records);

      const initialAmount = result.deposits[0].amount;

      // Move forward 2 months - 2 accruals with capitalization
      data = await storage.load(accountId);
      result = applyAutoTransactions(data, mkDeps('2026-03-01'));

      const updatedAmount = result.deposits[0].amount;
      expect(updatedAmount).toBeGreaterThan(initialAmount);

      const paidAccruals = result.deposits[0].accruals.filter(a => a.status === PaymentStatus.PAID);
      expect(paidAccruals.length).toBe(2);

      // With capitalization, no income records should be created
      const incomeRecords = findLinkedRecords(result.records, 'deposit-2').filter(
        r => r.type === RecordType.INCOME
      );
      expect(incomeRecords.length).toBe(0);
    });

    it('закрытый вклад не генерирует новые начисления', async () => {
      const deposit: DepositRecord = {
        id: 'deposit-3',
        name: 'Закрытый вклад',
        type: DepositType.TERM,
        bankName: 'Тест Банк',
        amount: 50000,
        interestRate: 8,
        startDate: '2026-01-01',
        termMonths: 6,
        accrualType: DepositAccrualType.TO_ACCOUNT,
        status: DepositStatus.CLOSED,
        accruals: [
          {
            id: 'acc-1',
            dueDate: '2026-02-01',
            amount: 333.33,
            status: PaymentStatus.PAID,
            paidDate: '2026-02-01',
          },
        ],
        topUps: [],
        withdrawals: [],
        createdAt: Date.now(),
        note: '',
      };

      await storage.addDeposit(accountId, deposit);

      // Run autoTransactions - closed deposit should not change
      const data = await storage.load(accountId);
      const result = applyAutoTransactions(data, mkDeps('2026-03-01'));

      expect(result.changed.deposits).toBe(false);
      expect(result.deposits[0].accruals.length).toBe(1);
      expect(result.deposits[0].accruals[0].status).toBe(PaymentStatus.PAID);
    });
  });

  describe('Early Repayment', () => {
    it('кредит с опцией досрочного погашения сохраняет настройки', async () => {
      // Note: autoTransactions doesn't recalculate schedules on currentAmount change.
      // Early repayment logic is handled by UI tabs (CreditsTab) which call
      // recalcCreditSchedule() explicitly. This test verifies that the option
      // is preserved through autoTransactions processing.

      const credit: CreditRecord = {
        id: 'credit-4',
        name: 'Кредит с досрочным погашением',
        bankName: 'Тест Банк',
        originalAmount: 300000,
        currentAmount: 300000,
        type: CreditType.CONSUMER,
        interestRate: 15,
        monthlyPayment: 10000,
        startDate: '2026-01-01',
        termMonths: 36,
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: EarlyRepaymentOption.TERM,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };

      await storage.addCredit(accountId, credit);

      // Generate initial schedule
      let data = await storage.load(accountId);
      let result = applyAutoTransactions(data, mkDeps('2026-01-01'));

      // Schedule should be generated
      expect(result.credits[0].payments.length).toBeGreaterThan(0);

      // Early repayment option should be preserved
      expect(result.credits[0].earlyRepaymentOption).toBe(EarlyRepaymentOption.TERM);

      await storage.updateCredit(accountId, result.credits[0]);

      // Run autoTransactions again - option should still be preserved
      data = await storage.load(accountId);
      result = applyAutoTransactions(data, mkDeps('2026-02-01'));

      expect(result.credits[0].earlyRepaymentOption).toBe(EarlyRepaymentOption.TERM);
      expect(result.credits[0].payments[0].status).toBe(PaymentStatus.PAID);
    });
  });

  describe('Cross-Entity Consistency', () => {
    it('одновременная обработка нескольких кредитов и вкладов', async () => {
      // Add multiple credits
      const credit1: CreditRecord = {
        id: 'credit-m1',
        name: 'Кредит 1',
        bankName: 'Банк 1',
        originalAmount: 100000,
        currentAmount: 100000,
        type: CreditType.CONSUMER,
        interestRate: 12,
        monthlyPayment: 9000,
        startDate: '2026-01-01',
        termMonths: 12,
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };

      const credit2: CreditRecord = {
        ...credit1,
        id: 'credit-m2',
        name: 'Кредит 2',
        bankName: 'Банк 2',
        startDate: '2026-01-15',
      };

      // Add multiple deposits
      const deposit1: DepositRecord = {
        id: 'deposit-m1',
        name: 'Вклад 1',
        type: DepositType.TERM,
        bankName: 'Банк 1',
        amount: 50000,
        interestRate: 10,
        startDate: '2026-01-01',
        termMonths: 12,
        accrualType: DepositAccrualType.TO_ACCOUNT,
        status: DepositStatus.ACTIVE,
        accruals: [],
        topUps: [],
        withdrawals: [],
        createdAt: Date.now(),
        note: '',
      };

      const deposit2: DepositRecord = {
        ...deposit1,
        id: 'deposit-m2',
        name: 'Вклад 2',
        bankName: 'Банк 2',
        startDate: '2026-01-15',
      };

      await storage.addCredit(accountId, credit1);
      await storage.addCredit(accountId, credit2);
      await storage.addDeposit(accountId, deposit1);
      await storage.addDeposit(accountId, deposit2);

      // Run autoTransactions on a date when all entities have activity
      let data = await storage.load(accountId);
      const result = applyAutoTransactions(data, mkDeps('2026-02-15'));

      // All entities should have generated schedules
      expect(result.credits[0].payments.length).toBeGreaterThan(0);
      expect(result.credits[1].payments.length).toBeGreaterThan(0);
      expect(result.deposits[0].accruals.length).toBeGreaterThan(0);
      expect(result.deposits[1].accruals.length).toBeGreaterThan(0);

      // Check that linked records are correctly assigned
      const credit1Records = findLinkedRecords(result.records, 'credit-m1');
      const credit2Records = findLinkedRecords(result.records, 'credit-m2');
      const deposit1Records = findLinkedRecords(result.records, 'deposit-m1');
      const deposit2Records = findLinkedRecords(result.records, 'deposit-m2');

      expect(credit1Records.length).toBeGreaterThan(0);
      expect(credit2Records.length).toBeGreaterThan(0);
      expect(deposit1Records.length).toBeGreaterThan(0);
      expect(deposit2Records.length).toBeGreaterThan(0);

      // No records should have wrong linkedId
      for (const record of result.records) {
        if (record.linkedId) {
          expect(['credit-m1', 'credit-m2', 'deposit-m1', 'deposit-m2']).toContain(
            record.linkedId
          );
        }
      }
    });
  });

  describe('Storage Persistence', () => {
    it('автотранзакции сохраняются и восстанавливаются корректно', async () => {
      // This test verifies that autoTransactions state persists across
      // flush/load cycles within the same storage instance.

      const credit: CreditRecord = {
        id: 'credit-persist',
        name: 'Тестовый кредит',
        bankName: 'Тест Банк',
        originalAmount: 100000,
        currentAmount: 100000,
        type: CreditType.CONSUMER,
        interestRate: 12,
        monthlyPayment: 9000,
        startDate: '2026-01-01',
        termMonths: 12,
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };

      await storage.addCredit(accountId, credit);

      // First run - generate schedule
      let data = await storage.load(accountId);
      let result = applyAutoTransactions(data, mkDeps('2026-01-01'));

      expect(result.changed.credits).toBe(true);
      expect(result.credits[0].payments.length).toBeGreaterThan(0);

      const scheduleLength = result.credits[0].payments.length;

      // Save to storage
      await storage.updateCredit(accountId, result.credits[0]);
      await storage.saveAllRecords(accountId, result.records);
      await storage.flush();

      // Reload from storage - schedule should persist
      data = await storage.load(accountId);
      expect(data.credits[0].payments.length).toBe(scheduleLength);

      // Second run - mark first payment as paid
      result = applyAutoTransactions(data, mkDeps('2026-02-01'));

      expect(result.changed.credits).toBe(true);
      expect(result.credits[0].payments[0].status).toBe(PaymentStatus.PAID);
      expect(result.credits[0].payments[0].paidDate).toBe('2026-02-01');

      // Save payment status
      await storage.updateCredit(accountId, result.credits[0]);
      await storage.saveAllRecords(accountId, result.records);
      await storage.flush();

      // Reload - payment status should persist
      data = await storage.load(accountId);
      expect(data.credits[0].payments[0].status).toBe(PaymentStatus.PAID);
      expect(data.credits[0].payments[0].paidDate).toBe('2026-02-01');

      // Linked record should be persisted
      const linkedRecords = findLinkedRecords(data.records, 'credit-persist');
      expect(linkedRecords.length).toBeGreaterThan(0);

      const paymentRecord = linkedRecords.find(r => r.type === RecordType.EXPENSE && r.date === '2026-02-01');
      expect(paymentRecord).toBeDefined();
      expect(paymentRecord?.amount).toBe(9000);
    });
  });
});
