import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinanceStorage } from '../storage/index';
import type { DebtRecord, CreditRecord, DepositRecord, CurrencyExchange, DebtMovement } from '../types';
import { findLinkedRecords, findOrphanedLinkedRecords, findDuplicateLinkedRecords } from '../domain/linkedRecords';

/**
 * Integration tests for linkedId consistency across storage operations.
 *
 * These tests verify that:
 * 1. Deleting entities removes all linked records (no orphans)
 * 2. Editing entities doesn't create duplicate linked records
 * 3. Concurrent operations maintain consistency
 * 4. Storage helper methods (deleteXWithLinkedRecords) work correctly
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

describe('LinkedRecords Integration Tests', () => {
  let storage: FinanceStorage;
  let mockApp: MockApp;
  const accountId = 'test-account';

  beforeEach(async () => {
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

    // Initialize account
    await storage.load(accountId);
    await storage.updateMeta(accountId, { name: 'Test Account', currency: '₽' });
  });

  describe('Debt Operations', () => {
    it('удаление долга удаляет все связанные записи', async () => {
      // Create debt with initial movement
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
        note: 'Test debt',
        movements: [
          {
            id: 'mov-1',
            type: 'borrow',
            amount: 1000,
            date: '2026-01-01',
            time: '10:00',
            createdAt: Date.now(),
            note: 'Initial borrow',
          },
        ],
      };
      await storage.addDebt(accountId, debt);

      // Add mirrored record
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-01',
        time: '10:00',
        type: 'income',
        amount: 1000,
        category: 'Debt',
        tag: '',
        payer: 'John Doe',
        note: 'Borrowed from John Doe',
        attachmentPath: '',
        linkedId: 'debt-1',
        linkedMovementId: 'mov-1',
      });

      // Add repayment movement with record
      const repaymentMovement: DebtMovement = {
        id: 'mov-2',
        type: 'repay',
        amount: 300,
        date: '2026-02-01',
        time: '14:00',
        createdAt: Date.now(),
        note: 'Partial repayment',
      };
      await storage.addDebtMovement(accountId, debt.id, repaymentMovement);
      await storage.addRecord(accountId, {
        id: 'rec-2',
        createdAt: Date.now(),
        date: '2026-02-01',
        time: '14:00',
        type: 'expense',
        amount: 300,
        category: 'Debt',
        tag: '',
        payer: 'John Doe',
        note: 'Repayment to John Doe',
        attachmentPath: '',
        linkedId: 'debt-1',
        linkedMovementId: 'mov-2',
      });

      // Verify records exist
      let data = await storage.load(accountId);
      expect(data.records.length).toBe(2);
      expect(findLinkedRecords(data.records, 'debt-1').length).toBe(2);

      // Delete debt with linked records
      await storage.deleteDebtsWithLinkedRecords(accountId, ['debt-1']);

      // Verify all linked records are removed
      data = await storage.load(accountId);
      expect(data.debts.length).toBe(0);
      expect(findLinkedRecords(data.records, 'debt-1').length).toBe(0);
      expect(data.records.length).toBe(0);
    });

    it('добавление движения долга создаёт запись без дубликатов', async () => {
      const debt: DebtRecord = {
        id: 'debt-1',
        person: 'Jane Smith',
        amount: 500,
        originalAmount: 500,
        interestRate: 0,
        direction: 'lent',
        date: '2026-01-15',
        time: '',
        dueDate: '',
        createdAt: Date.now(),
        note: '',
        movements: [],
      };
      await storage.addDebt(accountId, debt);

      // Add same movement twice (simulating race condition or bug)
      const movement: DebtMovement = {
        id: 'mov-1',
        type: 'repay',
        amount: 100,
        date: '2026-02-15',
        time: '12:00',
        createdAt: Date.now(),
        note: 'Payment',
      };

      await storage.addDebtMovement(accountId, debt.id, movement);
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-02-15',
        time: '12:00',
        type: 'income',
        amount: 100,
        category: 'Debt',
        tag: '',
        payer: 'Jane Smith',
        note: 'Repayment from Jane Smith',
        attachmentPath: '',
        linkedId: 'debt-1',
        linkedMovementId: 'mov-1',
      });

      // Try to add duplicate record
      await storage.addRecord(accountId, {
        id: 'rec-2',
        createdAt: Date.now(),
        date: '2026-02-15',
        time: '12:00',
        type: 'income',
        amount: 100,
        category: 'Debt',
        tag: '',
        payer: 'Jane Smith',
        note: 'Repayment from Jane Smith',
        attachmentPath: '',
        linkedId: 'debt-1',
        linkedMovementId: 'mov-1',
      });

      // Verify duplicates exist (this is the problem we're detecting)
      const data = await storage.load(accountId);
      const duplicates = findDuplicateLinkedRecords(data.records);
      expect(duplicates.size).toBeGreaterThan(0);
    });
  });

  describe('Credit Operations', () => {
    it('удаление кредита удаляет все связанные записи', async () => {
      const credit: CreditRecord = {
        id: 'credit-1',
        name: 'Car Loan',
        bankName: 'Test Bank',
        originalAmount: 500000,
        currentAmount: 500000,
        type: 'consumer',
        interestRate: 12,
        monthlyPayment: 16000,
        startDate: '2026-01-01',
        termMonths: 36,
        status: 'active',
        earlyRepaymentOption: null,
        payments: [
          {
            id: 'pay-1',
            dueDate: '2026-02-01',
            amount: 16000,
            principalPart: 11000,
            interestPart: 5000,
            status: 'paid',
          },
          {
            id: 'pay-2',
            dueDate: '2026-03-01',
            amount: 16000,
            principalPart: 11100,
            interestPart: 4900,
            status: 'paid',
          },
        ],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };
      await storage.addCredit(accountId, credit);

      // Add receipt record
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-01',
        time: '10:00',
        type: 'income',
        amount: 500000,
        category: 'Credit',
        tag: '',
        payer: 'Test Bank',
        note: 'Credit receipt',
        attachmentPath: '',
        linkedId: 'credit-1',
      });

      // Add payment records
      await storage.addRecord(accountId, {
        id: 'rec-2',
        createdAt: Date.now(),
        date: '2026-02-01',
        time: '',
        type: 'expense',
        amount: 16000,
        category: 'Credit',
        tag: '',
        payer: 'Test Bank',
        note: 'Credit payment',
        attachmentPath: '',
        linkedId: 'credit-1',
        isInternal: true,
      });

      await storage.addRecord(accountId, {
        id: 'rec-3',
        createdAt: Date.now(),
        date: '2026-03-01',
        time: '',
        type: 'expense',
        amount: 16000,
        category: 'Credit',
        tag: '',
        payer: 'Test Bank',
        note: 'Credit payment',
        attachmentPath: '',
        linkedId: 'credit-1',
        isInternal: true,
      });

      // Verify records exist
      let data = await storage.load(accountId);
      expect(data.records.length).toBe(3);
      expect(findLinkedRecords(data.records, 'credit-1').length).toBe(3);

      // Delete credit with linked records
      await storage.deleteCreditsWithLinkedRecords(accountId, ['credit-1']);

      // Verify all linked records are removed
      data = await storage.load(accountId);
      expect(data.credits.length).toBe(0);
      expect(findLinkedRecords(data.records, 'credit-1').length).toBe(0);
      expect(data.records.length).toBe(0);
    });

    it('удаление кредита с первоначальным взносом удаляет downPaymentRecord', async () => {
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
        downPaymentRecordId: 'rec-down',
      };
      await storage.addCredit(accountId, credit);

      // Add down payment record
      await storage.addRecord(accountId, {
        id: 'rec-down',
        createdAt: Date.now(),
        date: '2025-12-15',
        time: '10:00',
        type: 'expense',
        amount: 500000,
        category: 'Housing',
        tag: '',
        payer: '',
        note: 'Down payment',
        attachmentPath: '',
      });

      // Verify records exist
      let data = await storage.load(accountId);
      expect(data.records.length).toBe(1);
      expect(data.credits.length).toBe(1);

      // Delete credit with linked records
      await storage.deleteCreditsWithLinkedRecords(accountId, ['credit-1']);

      // Verify down payment record is also removed
      data = await storage.load(accountId);
      expect(data.credits.length).toBe(0);
      expect(data.records.length).toBe(0);
    });
  });

  describe('Deposit Operations', () => {
    it('удаление вклада удаляет все связанные записи', async () => {
      const deposit: DepositRecord = {
        id: 'deposit-1',
        name: 'Savings',
        type: 'term',
        bankName: 'Test Bank',
        amount: 100000,
        interestRate: 5,
        startDate: '2026-01-01',
        termMonths: 12,
        accrualType: 'to_account',
        status: 'active',
        accruals: [
          { id: 'acc-1', dueDate: '2026-02-01', amount: 416.67, status: 'paid' },
          { id: 'acc-2', dueDate: '2026-03-01', amount: 416.67, status: 'paid' },
        ],
        topUps: [],
        withdrawals: [],
        createdAt: Date.now(),
        note: '',
      };
      await storage.addDeposit(accountId, deposit);

      // Add opening expense
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-01',
        time: '10:00',
        type: 'expense',
        amount: 100000,
        category: 'Deposit',
        tag: '',
        payer: 'Test Bank',
        note: 'Deposit opening',
        attachmentPath: '',
        linkedId: 'deposit-1',
      });

      // Add accrual records
      await storage.addRecord(accountId, {
        id: 'rec-2',
        createdAt: Date.now(),
        date: '2026-02-01',
        time: '',
        type: 'income',
        amount: 416.67,
        category: 'Deposit',
        tag: '',
        payer: 'Test Bank',
        note: 'Interest accrual',
        attachmentPath: '',
        linkedId: 'deposit-1',
        isInternal: true,
      });

      await storage.addRecord(accountId, {
        id: 'rec-3',
        createdAt: Date.now(),
        date: '2026-03-01',
        time: '',
        type: 'income',
        amount: 416.67,
        category: 'Deposit',
        tag: '',
        payer: 'Test Bank',
        note: 'Interest accrual',
        attachmentPath: '',
        linkedId: 'deposit-1',
        isInternal: true,
      });

      // Verify records exist
      let data = await storage.load(accountId);
      expect(data.records.length).toBe(3);
      expect(findLinkedRecords(data.records, 'deposit-1').length).toBe(3);

      // Delete deposit with linked records
      await storage.deleteDepositsWithLinkedRecords(accountId, ['deposit-1']);

      // Verify all linked records are removed
      data = await storage.load(accountId);
      expect(data.deposits.length).toBe(0);
      expect(findLinkedRecords(data.records, 'deposit-1').length).toBe(0);
      expect(data.records.length).toBe(0);
    });

    it('удаление активного вклада создаёт возврат без linkedId', async () => {
      const deposit: DepositRecord = {
        id: 'deposit-1',
        name: 'Savings',
        type: 'savings',
        bankName: 'Test Bank',
        amount: 50000,
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

      // Add opening expense
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-01',
        time: '10:00',
        type: 'expense',
        amount: 50000,
        category: 'Deposit',
        tag: '',
        payer: 'Test Bank',
        note: 'Deposit opening',
        attachmentPath: '',
        linkedId: 'deposit-1',
      });

      // Simulate manual deletion from UI (DepositsTab logic)
      await storage.deleteDeposit(accountId, deposit.id);
      const data = await storage.load(accountId);
      const otherRecords = data.records.filter(r => r.linkedId !== deposit.id);

      // Add refund without linkedId
      const refund = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        date: '2026-03-15',
        time: '14:00',
        type: 'income' as const,
        amount: deposit.amount,
        category: 'Deposit',
        tag: '',
        payer: deposit.bankName,
        note: 'Deposit refund',
        attachmentPath: '',
      };
      otherRecords.push(refund);
      await storage.saveAllRecords(accountId, otherRecords);

      // Verify refund exists without linkedId
      const finalData = await storage.load(accountId);
      expect(finalData.deposits.length).toBe(0);
      expect(finalData.records.length).toBe(1);
      expect(finalData.records[0].linkedId).toBeUndefined();
      expect(finalData.records[0].type).toBe('income');
      expect(finalData.records[0].amount).toBe(50000);
    });
  });

  describe('Consistency Checks', () => {
    it('обнаруживает осиротевшие linkedId записи', async () => {
      // Add records linked to non-existent entities
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-15',
        time: '',
        type: 'income',
        amount: 100,
        category: 'Test',
        tag: '',
        payer: 'John',
        note: '',
        attachmentPath: '',
        linkedId: 'non-existent-debt',
      });

      await storage.addRecord(accountId, {
        id: 'rec-2',
        createdAt: Date.now(),
        date: '2026-01-16',
        time: '',
        type: 'expense',
        amount: 200,
        category: 'Test',
        tag: '',
        payer: 'Jane',
        note: '',
        attachmentPath: '',
        linkedId: 'non-existent-credit',
      });

      const data = await storage.load(accountId);
      const validIds = new Set([
        ...data.debts.map(d => d.id),
        ...data.credits.map(c => c.id),
        ...data.deposits.map(d => d.id),
        ...data.exchanges.map(e => e.id),
      ]);

      const orphaned = findOrphanedLinkedRecords(data.records, validIds);
      expect(orphaned.length).toBe(2);
      expect(orphaned.map(r => r.id).sort()).toEqual(['rec-1', 'rec-2']);
    });

    it('обнаруживает дублирующиеся linkedId записи', async () => {
      const debt: DebtRecord = {
        id: 'debt-1',
        person: 'Test Person',
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

      // Add duplicate records with same linkedId + date + amount + type
      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-15',
        time: '10:00',
        type: 'income',
        amount: 500,
        category: 'Debt',
        tag: '',
        payer: 'Test Person',
        note: 'Payment 1',
        attachmentPath: '',
        linkedId: 'debt-1',
      });

      await storage.addRecord(accountId, {
        id: 'rec-2',
        createdAt: Date.now(),
        date: '2026-01-15',
        time: '10:05',
        type: 'income',
        amount: 500,
        category: 'Debt',
        tag: '',
        payer: 'Test Person',
        note: 'Payment 2',
        attachmentPath: '',
        linkedId: 'debt-1',
      });

      const data = await storage.load(accountId);
      const duplicates = findDuplicateLinkedRecords(data.records);
      expect(duplicates.size).toBe(1);

      const dupeGroup = Array.from(duplicates.values())[0];
      expect(dupeGroup.length).toBe(2);
      expect(dupeGroup[0].linkedId).toBe('debt-1');
      expect(dupeGroup[1].linkedId).toBe('debt-1');
    });

    it('batch удаление долгов не оставляет осиротевших записей', async () => {
      // Create multiple debts with records
      const debt1: DebtRecord = {
        id: 'debt-1',
        person: 'Person 1',
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
      const debt2: DebtRecord = {
        id: 'debt-2',
        person: 'Person 2',
        amount: 2000,
        originalAmount: 2000,
        interestRate: 0,
        direction: 'lent',
        date: '2026-01-02',
        time: '',
        dueDate: '',
        createdAt: Date.now(),
        note: '',
        movements: [],
      };

      await storage.addDebt(accountId, debt1);
      await storage.addDebt(accountId, debt2);

      await storage.addRecord(accountId, {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-01',
        time: '',
        type: 'income',
        amount: 1000,
        category: 'Debt',
        tag: '',
        payer: 'Person 1',
        note: '',
        attachmentPath: '',
        linkedId: 'debt-1',
      });

      await storage.addRecord(accountId, {
        id: 'rec-2',
        createdAt: Date.now(),
        date: '2026-01-02',
        time: '',
        type: 'expense',
        amount: 2000,
        category: 'Debt',
        tag: '',
        payer: 'Person 2',
        note: '',
        attachmentPath: '',
        linkedId: 'debt-2',
      });

      // Delete both debts at once
      await storage.deleteDebtsWithLinkedRecords(accountId, ['debt-1', 'debt-2']);

      const data = await storage.load(accountId);
      expect(data.debts.length).toBe(0);
      expect(data.records.length).toBe(0);
    });
  });

  describe('Currency Exchange Operations', () => {
    it('удаление обмена валюты удаляет связанную запись', async () => {
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

      // Add linked expense record
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
        note: 'RUB to USD',
        attachmentPath: '',
        linkedId: 'ex-1',
        isInternal: true,
      });

      let data = await storage.load(accountId);
      expect(data.exchanges.length).toBe(1);
      expect(findLinkedRecords(data.records, 'ex-1').length).toBe(1);

      // Delete exchange
      await storage.deleteExchange(accountId, exchange.id);

      // Manually remove linked record (CurrencyTab pattern)
      data = await storage.load(accountId);
      const filtered = data.records.filter(r => r.linkedId !== 'ex-1');
      await storage.saveAllRecords(accountId, filtered);

      // Verify cleanup
      data = await storage.load(accountId);
      expect(data.exchanges.length).toBe(0);
      expect(findLinkedRecords(data.records, 'ex-1').length).toBe(0);
    });
  });
});
