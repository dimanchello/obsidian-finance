import type { FinanceStorage } from '../storage';
import type {
  DebtRecord,
  DebtMovement,
  CreditRecord,
  DepositRecord,
  DepositTopUp,
  DepositWithdrawal,
  FinanceRecord,
} from '../types';
import {
  unlinkRecords,
  createDebtMovementRecord,
  createCreditReceiptRecord,
  createCreditPaymentRecord,
  createCreditDownPaymentRecord,
  createDepositRefundRecord,
  findLinkedRecord,
} from './linkedRecords';
import { RecordType, DebtDirection, DebtMovementType, CreditType, PaymentStatus, DepositStatus } from '../constants';

/**
 * AccountCommands provides transactional operations for account entities.
 *
 * This layer ensures that operations on debts, credits, deposits, and exchanges
 * maintain consistency with their mirrored FinanceRecords (linkedId).
 *
 * Benefits:
 * - Eliminates direct storage calls from tabs (62 → 0)
 * - Guarantees atomicity: entity + linked records are updated together
 * - Centralized business logic for all CRUD operations
 * - Single source of truth for transaction patterns
 */

/**
 * Notes for the records `addCredit`/`updateCredit` materialize.
 *
 * All three are required: `updateCredit` rebuilds every auto-generated record from
 * scratch, so a caller that omits `downPaymentNote` would silently relabel the
 * down-payment record. See {@link AccountCommands.buildDownPaymentRecord}.
 */
export interface CreditNoteTranslations {
  receiptNote: string;
  paymentNote: string;
  downPaymentNote: string;
}

export class AccountCommands {
  constructor(
    private storage: FinanceStorage,
    private accountId: string,
  ) {}

  // ── Debt Commands ─────────────────────────────────────────────────────────

  /**
   * Adds a new debt with its initial movement and mirrored record.
   */
  async addDebt(
    debt: DebtRecord,
    initialMovement: DebtMovement,
    category: string,
    translations: { lentNote: string; borrowedNote: string }
  ): Promise<void> {
    debt.movements = [initialMovement];
    await this.storage.addDebt(this.accountId, debt);

    const recordType = debt.direction === DebtDirection.LENT ? RecordType.EXPENSE : RecordType.INCOME;
    const note = debt.direction === DebtDirection.LENT ? translations.lentNote : translations.borrowedNote;

    const record = createDebtMovementRecord(debt, initialMovement, recordType, note, category);
    await this.storage.addRecord(this.accountId, record);
  }

  /**
   * Adds a debt movement (borrow/repay) with its mirrored record.
   */
  async addDebtMovement(
    debtId: string,
    movement: DebtMovement,
    category: string,
    note: string
  ): Promise<void> {
    const data = await this.storage.load(this.accountId);
    const debt = data.debts.find(d => d.id === debtId);
    if (!debt) return;

    await this.storage.addDebtMovement(this.accountId, debtId, movement);

    const recordType = movement.type === DebtMovementType.BORROW
      ? (debt.direction === DebtDirection.LENT ? RecordType.EXPENSE : RecordType.INCOME)
      : (debt.direction === DebtDirection.LENT ? RecordType.INCOME : RecordType.EXPENSE);

    const record = createDebtMovementRecord(debt, movement, recordType, note, category);
    await this.storage.addRecord(this.accountId, record);
  }

  /**
   * Updates a debt movement and its mirrored record.
   */
  async updateDebtMovement(
    debtId: string,
    oldMovement: DebtMovement,
    updatedMovement: DebtMovement
  ): Promise<void> {
    await this.storage.updateDebtMovement(this.accountId, debtId, updatedMovement);

    const data = await this.storage.load(this.accountId);
    const linkedRec = findLinkedRecord(
      data.records,
      debtId,
      oldMovement.date,
      oldMovement.amount,
      oldMovement.id
    );

    if (linkedRec) {
      linkedRec.date = updatedMovement.date;
      linkedRec.amount = updatedMovement.amount;
      linkedRec.time = updatedMovement.time || '';
      await this.storage.updateRecord(this.accountId, linkedRec);
    }
  }

  /**
   * Deletes a debt movement and its mirrored record.
   */
  async deleteDebtMovement(
    debtId: string,
    movementId: string,
    movementDate: string,
    movementAmount: number
  ): Promise<void> {
    await this.storage.deleteDebtMovement(this.accountId, debtId, movementId);

    const data = await this.storage.load(this.accountId);
    const linkedRec = findLinkedRecord(
      data.records,
      debtId,
      movementDate,
      movementAmount,
      movementId
    );

    if (linkedRec) {
      await this.storage.deleteRecord(this.accountId, linkedRec.id);
    }
  }

  /**
   * Deletes a debt and all its linked records (transactional).
   */
  async deleteDebt(debtId: string): Promise<void> {
    await this.storage.deleteDebtsWithLinkedRecords(this.accountId, [debtId]);
  }

  /**
   * Deletes multiple debts and all their linked records (transactional).
   */
  async deleteDebts(debtIds: string[]): Promise<void> {
    await this.storage.deleteDebtsWithLinkedRecords(this.accountId, debtIds);
  }

  // ── Credit Commands ───────────────────────────────────────────────────────

  /**
   * Adds a new credit with initial receipt/payment records.
   */
  async addCredit(
    credit: CreditRecord,
    category: string,
    translations: CreditNoteTranslations
  ): Promise<void> {
    // Built first: it may mint `credit.downPaymentRecordId`, which must be stored too.
    const downPaymentRec = this.buildDownPaymentRecord(credit, category, translations.downPaymentNote);

    await this.storage.addCredit(this.accountId, credit);

    const records: FinanceRecord[] = [];

    // Receipt record (не создаём для ипотеки и эскроу)
    if (!credit.isEscrow && credit.type !== CreditType.MORTGAGE) {
      records.push(createCreditReceiptRecord(
        credit,
        translations.receiptNote.replace('{name}', credit.name),
        category
      ));
    }

    // Payment records for paid payments
    for (const payment of credit.payments) {
      if (payment.status === PaymentStatus.PAID) {
        records.push(createCreditPaymentRecord(
          credit,
          payment.dueDate,
          payment.amount,
          translations.paymentNote.replace('{name}', credit.name),
          category,
          true
        ));
      }
    }

    if (downPaymentRec) records.push(downPaymentRec);

    const data = await this.storage.load(this.accountId);
    await this.storage.saveAllRecords(this.accountId, [...data.records, ...records]);
  }

  /**
   * Builds the down-payment mirror record for a credit, or null when the credit has no
   * down payment. Mutates `credit.downPaymentRecordId` when a new id has to be minted,
   * so callers must persist the credit after calling this.
   */
  private buildDownPaymentRecord(
    credit: CreditRecord,
    category: string,
    note: string
  ): FinanceRecord | null {
    const amount = credit.downPayment ?? 0;
    const date = credit.downPaymentDate;
    if (amount <= 0 || !date) {
      delete credit.downPaymentRecordId;
      return null;
    }

    credit.downPaymentRecordId ??= crypto.randomUUID();
    return createCreditDownPaymentRecord(
      credit,
      credit.downPaymentRecordId,
      date,
      amount,
      note + credit.name,
      category
    );
  }

  /**
   * Updates a credit and rebuilds its linked records.
   */
  async updateCredit(
    updated: CreditRecord,
    category: string,
    translations: CreditNoteTranslations
  ): Promise<void> {
    // Built first: it may mint `updated.downPaymentRecordId` or clear a stale one.
    const downPaymentRec = this.buildDownPaymentRecord(updated, category, translations.downPaymentNote);

    await this.storage.updateCredit(this.accountId, updated);

    const data = await this.storage.load(this.accountId);

    // Удаляем все автогенерированные записи (isInternal === true или undefined).
    // Сохраняем записи с isInternal === false (вручную добавленные); запись
    // первоначального взноса пересоздаётся ниже с тем же id.
    const updatedRecords = data.records.filter(r =>
      r.linkedId !== updated.id ||
      r.isInternal === false
    );

    if (downPaymentRec) updatedRecords.push(downPaymentRec);

    // Receipt record
    if (!updated.isEscrow && updated.type !== CreditType.MORTGAGE) {
      updatedRecords.push(createCreditReceiptRecord(
        updated,
        translations.receiptNote.replace('{name}', updated.name),
        category
      ));
    }

    // Payment records — skip dates where manual records exist
    const manualExpenseDates = new Set(
      updatedRecords
        .filter(r => r.linkedId === updated.id && r.isInternal === false && r.type === RecordType.EXPENSE)
        .map(r => r.date)
    );

    for (const payment of updated.payments) {
      if (payment.status !== PaymentStatus.PAID) continue;
      if (manualExpenseDates.has(payment.dueDate)) continue;

      updatedRecords.push(createCreditPaymentRecord(
        updated,
        payment.dueDate,
        payment.amount,
        translations.paymentNote.replace('{name}', updated.name),
        category,
        true
      ));
    }

    await this.storage.saveAllRecords(this.accountId, updatedRecords);
  }

  /**
   * Deletes a credit and all its linked records, including downPaymentRecord.
   */
  async deleteCredit(creditId: string): Promise<void> {
    await this.storage.deleteCreditsWithLinkedRecords(this.accountId, [creditId]);
  }

  /**
   * Deletes multiple credits and all their linked records.
   */
  async deleteCredits(creditIds: string[]): Promise<void> {
    await this.storage.deleteCreditsWithLinkedRecords(this.accountId, creditIds);
  }

  // ── Deposit Commands ──────────────────────────────────────────────────────

  /**
   * Closes a deposit and creates a refund record.
   */
  async closeDeposit(
    deposit: DepositRecord,
    category: string,
    refundNote: string
  ): Promise<void> {
    deposit.status = DepositStatus.CLOSED;
    await this.storage.updateDeposit(this.accountId, deposit);

    const refund = createDepositRefundRecord(deposit, refundNote, category);
    await this.storage.addRecord(this.accountId, refund);
  }

  /**
   * Deletes a deposit and all its linked records.
   * If deposit is active, creates a refund record without linkedId.
   */
  async deleteDeposit(
    depositId: string,
    category: string,
    refundNote: string
  ): Promise<void> {
    const data = await this.storage.load(this.accountId);
    const deposit = data.deposits.find(d => d.id === depositId);
    if (!deposit) return;

    await this.storage.deleteDeposit(this.accountId, depositId);

    const otherRecords = unlinkRecords(data.records, depositId);

    // If active, add refund without linkedId
    if (deposit.status === DepositStatus.ACTIVE) {
      const refund = createDepositRefundRecord(deposit, refundNote, category);
      delete refund.linkedId; // Remove link so it's a standalone record
      otherRecords.push(refund);
    }

    await this.storage.saveAllRecords(this.accountId, otherRecords);
  }

  /**
   * Deletes multiple deposits and their linked records.
   */
  async deleteDeposits(
    depositIds: string[],
    category: string,
    refundNote: string
  ): Promise<void> {
    const data = await this.storage.load(this.accountId);
    const idSet = new Set(depositIds);

    await this.storage.deleteDepositsBatch(this.accountId, depositIds);

    let otherRecords = data.records.filter(r => !r.linkedId || !idSet.has(r.linkedId));

    // Add refund for each active deposit
    for (const deposit of data.deposits) {
      if (idSet.has(deposit.id) && deposit.status === DepositStatus.ACTIVE) {
        const refund = createDepositRefundRecord(deposit, refundNote, category);
        delete refund.linkedId;
        otherRecords.push(refund);
      }
    }

    await this.storage.saveAllRecords(this.accountId, otherRecords);
  }

  /**
   * Adds a deposit top-up with its mirrored expense record.
   */
  async addDepositTopUp(
    depositId: string,
    topUp: DepositTopUp,
    category: string,
    note: string
  ): Promise<void> {
    await this.storage.addDepositTopUp(this.accountId, depositId, topUp);

    // Top-up is an expense
    await this.storage.addRecord(this.accountId, {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      date: topUp.date,
      time: topUp.time,
      type: RecordType.EXPENSE,
      amount: topUp.amount,
      category,
      tag: '',
      payer: '',
      note,
      attachmentPath: '',
      linkedId: depositId,
    });
  }

  /**
   * Deletes a deposit top-up and its mirrored record.
   */
  async deleteDepositTopUp(
    depositId: string,
    topUpId: string,
    topUpDate: string,
    topUpAmount: number
  ): Promise<void> {
    await this.storage.deleteDepositTopUp(this.accountId, depositId, topUpId);

    const data = await this.storage.load(this.accountId);
    const linkedRec = findLinkedRecord(
      data.records,
      depositId,
      topUpDate,
      topUpAmount
    );

    if (linkedRec?.type === RecordType.EXPENSE) {
      await this.storage.deleteRecord(this.accountId, linkedRec.id);
    }
  }

  /**
   * Adds a deposit withdrawal with its mirrored income record.
   */
  async addDepositWithdrawal(
    depositId: string,
    withdrawal: DepositWithdrawal,
    category: string,
    note: string
  ): Promise<void> {
    await this.storage.addDepositWithdrawal(this.accountId, depositId, withdrawal);

    // Withdrawal is an income
    await this.storage.addRecord(this.accountId, {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      date: withdrawal.date,
      time: withdrawal.time,
      type: RecordType.INCOME,
      amount: withdrawal.amount,
      category,
      tag: '',
      payer: '',
      note,
      attachmentPath: '',
      linkedId: depositId,
    });
  }

  /**
   * Deletes a deposit withdrawal and its mirrored record.
   */
  async deleteDepositWithdrawal(
    depositId: string,
    withdrawalId: string,
    withdrawalDate: string,
    withdrawalAmount: number
  ): Promise<void> {
    await this.storage.deleteDepositWithdrawal(this.accountId, depositId, withdrawalId);

    const data = await this.storage.load(this.accountId);
    const linkedRec = findLinkedRecord(data.records, depositId, withdrawalDate, withdrawalAmount);

    if (linkedRec?.type === RecordType.INCOME) {
      await this.storage.deleteRecord(this.accountId, linkedRec.id);
    }
  }

  // ── Currency Exchange Commands ────────────────────────────────────────────

  /**
   * Deletes a currency exchange and its linked record.
   */
  async deleteExchange(exchangeId: string): Promise<void> {
    await this.storage.deleteExchange(this.accountId, exchangeId);

    const data = await this.storage.load(this.accountId);
    const filtered = unlinkRecords(data.records, exchangeId);
    await this.storage.saveAllRecords(this.accountId, filtered);
  }

  /**
   * Deletes multiple currency exchanges and their linked records.
   */
  async deleteExchanges(exchangeIds: string[]): Promise<void> {
    await this.storage.deleteExchangesBatch(this.accountId, exchangeIds);

    const data = await this.storage.load(this.accountId);
    const idSet = new Set(exchangeIds);
    const filtered = data.records.filter(r => !r.linkedId || !idSet.has(r.linkedId));
    await this.storage.saveAllRecords(this.accountId, filtered);
  }
}
