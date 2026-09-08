import { describe, it, expect } from 'vitest';
import {
  linkedRecordKey,
  matchesSpec,
  createLinkedRecord,
  ensureLinkedRecord,
  unlinkRecords,
  unlinkRecordsBatch,
  findLinkedRecords,
  findLinkedRecord,
  updateLinkedRecord,
  removeLinkedRecord,
  createDebtMovementRecord,
  createCreditReceiptRecord,
  createCreditPaymentRecord,
  createDepositRefundRecord,
  createExchangeRecord,
  findOrphanedLinkedRecords,
  findDuplicateLinkedRecords,
} from '../domain/linkedRecords';
import type { FinanceRecord, DebtRecord, CreditRecord, DepositRecord, CurrencyExchange, DebtMovement } from '../types';
import {
  RecordType, DebtDirection, DebtMovementType, CreditType, CreditStatus,
  DepositType, DepositStatus, DepositAccrualType, CurrencyOperationType,
} from '../types';

describe('linkedRecords', () => {
  describe('linkedRecordKey', () => {
    it('generates stable key from spec', () => {
      const spec = {
        entityId: 'debt-1',
        date: '2026-01-15',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Test',
        payer: 'John',
        note: 'Test note',
      };
      const key = linkedRecordKey(spec);
      expect(key).toBe('debt-1|2026-01-15|income|100|');
    });

    it('includes linkedMovementId in key', () => {
      const spec = {
        entityId: 'debt-1',
        date: '2026-01-15',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Test',
        payer: 'John',
        note: 'Test note',
        linkedMovementId: 'mov-1',
      };
      const key = linkedRecordKey(spec);
      expect(key).toBe('debt-1|2026-01-15|income|100|mov-1');
    });

    it('generates key from FinanceRecord', () => {
      const record: FinanceRecord = {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-15',
        time: '14:00',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Test',
        tag: '',
        payer: 'John',
        note: 'Test note',
        attachmentPath: '',
        linkedId: 'debt-1',
      };
      const key = linkedRecordKey(record);
      expect(key).toBe('debt-1|2026-01-15|income|100|');
    });
  });

  describe('matchesSpec', () => {
    it('returns true for matching record', () => {
      const record: FinanceRecord = {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-15',
        time: '14:00',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Test',
        tag: '',
        payer: 'John',
        note: 'Test note',
        attachmentPath: '',
        linkedId: 'debt-1',
      };
      const spec = {
        entityId: 'debt-1',
        date: '2026-01-15',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Test',
        payer: 'John',
        note: 'Test note',
      };
      expect(matchesSpec(record, spec)).toBe(true);
    });

    it('returns false for non-matching linkedId', () => {
      const record: FinanceRecord = {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-15',
        time: '14:00',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Test',
        tag: '',
        payer: 'John',
        note: 'Test note',
        attachmentPath: '',
        linkedId: 'debt-2',
      };
      const spec = {
        entityId: 'debt-1',
        date: '2026-01-15',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Test',
        payer: 'John',
        note: 'Test note',
      };
      expect(matchesSpec(record, spec)).toBe(false);
    });

    it('matches linkedMovementId when specified', () => {
      const record: FinanceRecord = {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-15',
        time: '14:00',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Test',
        tag: '',
        payer: 'John',
        note: 'Test note',
        attachmentPath: '',
        linkedId: 'debt-1',
        linkedMovementId: 'mov-1',
      };
      const spec = {
        entityId: 'debt-1',
        date: '2026-01-15',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Test',
        payer: 'John',
        note: 'Test note',
        linkedMovementId: 'mov-1',
      };
      expect(matchesSpec(record, spec)).toBe(true);
    });
  });

  describe('createLinkedRecord', () => {
    it('creates a valid FinanceRecord', () => {
      const spec = {
        entityId: 'debt-1',
        date: '2026-01-15',
        time: '14:00',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Debt',
        payer: 'John',
        note: 'Repayment',
      };
      const record = createLinkedRecord(spec);

      expect(record.id).toBeTruthy();
      expect(record.createdAt).toBeGreaterThan(0);
      expect(record.date).toBe('2026-01-15');
      expect(record.time).toBe('14:00');
      expect(record.type).toBe(RecordType.INCOME);
      expect(record.amount).toBe(100);
      expect(record.category).toBe('Debt');
      expect(record.payer).toBe('John');
      expect(record.note).toBe('Repayment');
      expect(record.linkedId).toBe('debt-1');
    });

    it('sets isInternal when specified', () => {
      const spec = {
        entityId: 'credit-1',
        date: '2026-01-15',
        type: RecordType.EXPENSE,
        amount: 1000,
        category: 'Credit',
        payer: 'Bank',
        note: 'Payment',
        isInternal: true,
      };
      const record = createLinkedRecord(spec);
      expect(record.isInternal).toBe(true);
    });
  });

  describe('ensureLinkedRecord', () => {
    it('adds record if not exists', () => {
      const records: FinanceRecord[] = [];
      const spec = {
        entityId: 'debt-1',
        date: '2026-01-15',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Debt',
        payer: 'John',
        note: 'Repayment',
      };

      const result = ensureLinkedRecord(records, spec);
      expect(result.length).toBe(1);
      expect(result[0].linkedId).toBe('debt-1');
    });

    it('does not add duplicate record', () => {
      const existing: FinanceRecord = {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-15',
        time: '14:00',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Debt',
        tag: '',
        payer: 'John',
        note: 'Repayment',
        attachmentPath: '',
        linkedId: 'debt-1',
      };
      const records = [existing];
      const spec = {
        entityId: 'debt-1',
        date: '2026-01-15',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Debt',
        payer: 'John',
        note: 'Repayment',
      };

      const result = ensureLinkedRecord(records, spec);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('rec-1');
    });

    it('adds record with different amount', () => {
      const existing: FinanceRecord = {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2026-01-15',
        time: '14:00',
        type: RecordType.INCOME,
        amount: 100,
        category: 'Debt',
        tag: '',
        payer: 'John',
        note: 'Repayment',
        attachmentPath: '',
        linkedId: 'debt-1',
      };
      const records = [existing];
      const spec = {
        entityId: 'debt-1',
        date: '2026-01-15',
        type: RecordType.INCOME,
        amount: 200,
        category: 'Debt',
        payer: 'John',
        note: 'Repayment',
      };

      const result = ensureLinkedRecord(records, spec);
      expect(result.length).toBe(2);
    });
  });

  describe('unlinkRecords', () => {
    it('removes all records linked to entity', () => {
      const records: FinanceRecord[] = [
        {
          id: 'rec-1',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
        {
          id: 'rec-2',
          createdAt: Date.now(),
          date: '2026-01-16',
          time: '',
          type: RecordType.EXPENSE,
          amount: 50,
          category: 'Test',
          tag: '',
          payer: 'Jane',
          note: '',
          attachmentPath: '',
        },
        {
          id: 'rec-3',
          createdAt: Date.now(),
          date: '2026-01-17',
          time: '',
          type: RecordType.INCOME,
          amount: 200,
          category: 'Test',
          tag: '',
          payer: 'Bob',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
      ];

      const result = unlinkRecords(records, 'debt-1');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('rec-2');
    });

    it('keeps all records if none match', () => {
      const records: FinanceRecord[] = [
        {
          id: 'rec-1',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
        },
      ];

      const result = unlinkRecords(records, 'debt-1');
      expect(result.length).toBe(1);
    });
  });

  describe('unlinkRecordsBatch', () => {
    it('removes records linked to multiple entities', () => {
      const records: FinanceRecord[] = [
        {
          id: 'rec-1',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
        {
          id: 'rec-2',
          createdAt: Date.now(),
          date: '2026-01-16',
          time: '',
          type: RecordType.EXPENSE,
          amount: 50,
          category: 'Test',
          tag: '',
          payer: 'Jane',
          note: '',
          attachmentPath: '',
          linkedId: 'credit-1',
        },
        {
          id: 'rec-3',
          createdAt: Date.now(),
          date: '2026-01-17',
          time: '',
          type: RecordType.INCOME,
          amount: 200,
          category: 'Test',
          tag: '',
          payer: 'Bob',
          note: '',
          attachmentPath: '',
        },
      ];

      const result = unlinkRecordsBatch(records, ['debt-1', 'credit-1']);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('rec-3');
    });
  });

  describe('findLinkedRecords', () => {
    it('finds all records linked to entity', () => {
      const records: FinanceRecord[] = [
        {
          id: 'rec-1',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
        {
          id: 'rec-2',
          createdAt: Date.now(),
          date: '2026-01-16',
          time: '',
          type: RecordType.EXPENSE,
          amount: 50,
          category: 'Test',
          tag: '',
          payer: 'Jane',
          note: '',
          attachmentPath: '',
        },
        {
          id: 'rec-3',
          createdAt: Date.now(),
          date: '2026-01-17',
          time: '',
          type: RecordType.INCOME,
          amount: 200,
          category: 'Test',
          tag: '',
          payer: 'Bob',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
      ];

      const result = findLinkedRecords(records, 'debt-1');
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('rec-1');
      expect(result[1].id).toBe('rec-3');
    });
  });

  describe('findLinkedRecord', () => {
    it('finds specific linked record', () => {
      const records: FinanceRecord[] = [
        {
          id: 'rec-1',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
      ];

      const result = findLinkedRecord(records, 'debt-1', '2026-01-15', 100);
      expect(result).toBeDefined();
      expect(result?.id).toBe('rec-1');
    });

    it('finds record by linkedMovementId', () => {
      const records: FinanceRecord[] = [
        {
          id: 'rec-1',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
          linkedMovementId: 'mov-1',
        },
      ];

      const result = findLinkedRecord(records, 'debt-1', '2026-01-15', 100, 'mov-1');
      expect(result).toBeDefined();
      expect(result?.id).toBe('rec-1');
    });

    it('returns undefined if not found', () => {
      const records: FinanceRecord[] = [];
      const result = findLinkedRecord(records, 'debt-1', '2026-01-15', 100);
      expect(result).toBeUndefined();
    });
  });

  describe('updateLinkedRecord', () => {
    it('updates record in collection', () => {
      const records: FinanceRecord[] = [
        {
          id: 'rec-1',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
      ];

      const result = updateLinkedRecord(records, 'rec-1', { amount: 200, date: '2026-01-20' });
      expect(result[0].amount).toBe(200);
      expect(result[0].date).toBe('2026-01-20');
    });
  });

  describe('removeLinkedRecord', () => {
    it('removes record by ID', () => {
      const records: FinanceRecord[] = [
        {
          id: 'rec-1',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
        {
          id: 'rec-2',
          createdAt: Date.now(),
          date: '2026-01-16',
          time: '',
          type: RecordType.EXPENSE,
          amount: 50,
          category: 'Test',
          tag: '',
          payer: 'Jane',
          note: '',
          attachmentPath: '',
        },
      ];

      const result = removeLinkedRecord(records, 'rec-1');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('rec-2');
    });
  });

  describe('Entity-specific helpers', () => {
    it('creates debt movement record', () => {
      const debt: DebtRecord = {
        id: 'debt-1',
        person: 'John',
        amount: 1000,
        originalAmount: 1000,
        interestRate: 0,
        direction: DebtDirection.BORROWED,
        date: '2026-01-01',
        time: '',
        dueDate: '',
        createdAt: Date.now(),
        note: '',
        movements: [],
      };
      const movement: DebtMovement = {
        id: 'mov-1',
        type: DebtMovementType.REPAY,
        amount: 100,
        date: '2026-01-15',
        time: '14:00',
        createdAt: Date.now(),
        note: 'Partial repayment',
      };

      const record = createDebtMovementRecord(debt, movement, RecordType.EXPENSE, 'Repayment: John', 'Debt');
      expect(record.linkedId).toBe('debt-1');
      expect(record.linkedMovementId).toBe('mov-1');
      expect(record.type).toBe(RecordType.EXPENSE);
      expect(record.amount).toBe(100);
      expect(record.payer).toBe('John');
    });

    it('creates credit receipt record', () => {
      const credit: CreditRecord = {
        id: 'credit-1',
        name: 'Car Loan',
        bankName: 'Bank',
        originalAmount: 500000,
        currentAmount: 500000,
        type: CreditType.CONSUMER,
        interestRate: 12,
        monthlyPayment: 15000,
        startDate: '2026-01-01',
        termMonths: 36,
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };

      const record = createCreditReceiptRecord(credit, 'Credit receipt: "Car Loan"', 'Credit');
      expect(record.linkedId).toBe('credit-1');
      expect(record.type).toBe(RecordType.INCOME);
      expect(record.amount).toBe(500000);
      expect(record.payer).toBe('Bank');
    });

    it('creates credit payment record', () => {
      const credit: CreditRecord = {
        id: 'credit-1',
        name: 'Car Loan',
        bankName: 'Bank',
        originalAmount: 500000,
        currentAmount: 480000,
        type: CreditType.CONSUMER,
        interestRate: 12,
        monthlyPayment: 15000,
        startDate: '2026-01-01',
        termMonths: 36,
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [],
        createdAt: Date.now(),
        note: '',
        isEscrow: false,
      };

      const record = createCreditPaymentRecord(credit, '2026-02-01', 20000, 'Payment: "Car Loan"', 'Credit');
      expect(record.linkedId).toBe('credit-1');
      expect(record.type).toBe(RecordType.EXPENSE);
      expect(record.amount).toBe(20000);
      expect(record.isInternal).toBe(true);
    });

    it('creates deposit refund record', () => {
      const deposit: DepositRecord = {
        id: 'deposit-1',
        name: 'Savings',
        type: DepositType.TERM,
        bankName: 'Bank',
        amount: 100000,
        interestRate: 5,
        startDate: '2026-01-01',
        termMonths: 12,
        accrualType: DepositAccrualType.TO_ACCOUNT,
        status: DepositStatus.CLOSED,
        accruals: [],
        topUps: [],
        withdrawals: [],
        createdAt: Date.now(),
        note: '',
      };

      const record = createDepositRefundRecord(deposit, 'Deposit refund: "Savings"', 'Deposit');
      expect(record.linkedId).toBe('deposit-1');
      expect(record.type).toBe(RecordType.INCOME);
      expect(record.amount).toBe(100000);
      expect(record.payer).toBe('Bank');
    });

    it('creates exchange record', () => {
      const exchange: CurrencyExchange = {
        id: 'ex-1',
        date: '2026-01-15',
        time: '14:00',
        type: CurrencyOperationType.BUY,
        amountInAccountCurrency: 9550,
        targetCurrency: '$',
        targetAmount: 100,
        exchangeRate: 95.5,
        provider: 'Bank',
        createdAt: Date.now(),
        note: '',
      };

      const record = createExchangeRecord(exchange, RecordType.EXPENSE, 9550, 'Exchange', 'RUB to USD');
      expect(record.linkedId).toBe('ex-1');
      expect(record.type).toBe(RecordType.EXPENSE);
      expect(record.amount).toBe(9550);
      expect(record.isInternal).toBe(true);
    });
  });

  describe('Validation', () => {
    it('finds orphaned linked records', () => {
      const records: FinanceRecord[] = [
        {
          id: 'rec-1',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
        {
          id: 'rec-2',
          createdAt: Date.now(),
          date: '2026-01-16',
          time: '',
          type: RecordType.EXPENSE,
          amount: 50,
          category: 'Test',
          tag: '',
          payer: 'Jane',
          note: '',
          attachmentPath: '',
          linkedId: 'credit-1',
        },
        {
          id: 'rec-3',
          createdAt: Date.now(),
          date: '2026-01-17',
          time: '',
          type: RecordType.INCOME,
          amount: 200,
          category: 'Test',
          tag: '',
          payer: 'Bob',
          note: '',
          attachmentPath: '',
        },
      ];

      const validIds = new Set(['debt-1']);
      const orphaned = findOrphanedLinkedRecords(records, validIds);
      expect(orphaned.length).toBe(1);
      expect(orphaned[0].id).toBe('rec-2');
    });

    it('finds duplicate linked records', () => {
      const records: FinanceRecord[] = [
        {
          id: 'rec-1',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
        {
          id: 'rec-2',
          createdAt: Date.now(),
          date: '2026-01-15',
          time: '',
          type: RecordType.INCOME,
          amount: 100,
          category: 'Test',
          tag: '',
          payer: 'John',
          note: '',
          attachmentPath: '',
          linkedId: 'debt-1',
        },
      ];

      const duplicates = findDuplicateLinkedRecords(records);
      expect(duplicates.size).toBe(1);
      const dupes = Array.from(duplicates.values())[0];
      expect(dupes.length).toBe(2);
    });
  });
});
