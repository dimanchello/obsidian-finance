import type {
  FinanceRecord,
  DebtRecord,
  CreditRecord,
  DepositRecord,
  CurrencyExchange,
  DebtMovement,
  CreditPayment,
  DepositAccrual,
  DepositTopUp,
  DepositWithdrawal,
  RecordType,
  DebtDirection,
  DebtMovementType,
  CreditType,
  CreditStatus,
  EarlyRepaymentOption,
  DownPaymentType,
  DayCountConvention,
  PaymentStatus,
  DepositType,
  DepositAccrualType,
  DepositStatus,
  CurrencyOperationType,
} from '../../../types';
import { SQL_COLUMN } from '../../../constants';

/**
 * Mappers for converting between SQL row objects and TypeScript types.
 * All field names use SQL_COLUMN constants for consistency.
 */

// ── Records ──────────────────────────────────────────────────────────────

export function mapRowToRecord(row: Record<string, unknown>): FinanceRecord {
  return {
    id: row[SQL_COLUMN.ID] as string,
    createdAt: row[SQL_COLUMN.CREATED_AT] as number,
    date: row[SQL_COLUMN.DATE] as string,
    time: (row[SQL_COLUMN.TIME] as string) ?? '',
    type: row[SQL_COLUMN.TYPE] as RecordType,
    amount: row[SQL_COLUMN.AMOUNT] as number,
    category: row[SQL_COLUMN.CATEGORY] as string,
    tag: (row[SQL_COLUMN.TAG] as string) ?? '',
    payer: (row[SQL_COLUMN.PAYER] as string) ?? '',
    note: (row[SQL_COLUMN.NOTE] as string) ?? '',
    attachmentPath: (row[SQL_COLUMN.ATTACHMENT_PATH] as string) ?? '',
    isInternal: Boolean(row[SQL_COLUMN.IS_INTERNAL]),
    linkedId: (row[SQL_COLUMN.LINKED_ID] as string) ?? '',
    linkedMovementId: (row[SQL_COLUMN.LINKED_MOVEMENT_ID] as string) ?? '',
    exchangeRate: (row[SQL_COLUMN.EXCHANGE_RATE] as number) ?? undefined,
  };
}

export function mapRecordToParams(rec: FinanceRecord, accountId: string): unknown[] {
  return [
    rec.id,
    accountId,
    rec.createdAt,
    rec.date,
    rec.time ?? '',
    rec.type,
    rec.amount,
    rec.category,
    rec.tag ?? '',
    rec.payer ?? '',
    rec.note ?? '',
    rec.attachmentPath ?? '',
    rec.linkedId ?? null,
    rec.linkedMovementId ?? null,
    rec.isInternal ? 1 : 0,
    rec.exchangeRate ?? null,
  ];
}

// ── Debts ────────────────────────────────────────────────────────────────

export function mapRowToDebt(row: Record<string, unknown>): DebtRecord {
  return {
    id: row[SQL_COLUMN.ID] as string,
    person: row[SQL_COLUMN.PERSON] as string,
    amount: row[SQL_COLUMN.AMOUNT] as number,
    originalAmount: row[SQL_COLUMN.ORIGINAL_AMOUNT] as number,
    interestRate: row[SQL_COLUMN.INTEREST_RATE] as number,
    direction: row[SQL_COLUMN.DIRECTION] as DebtDirection,
    date: row[SQL_COLUMN.DATE] as string,
    time: (row[SQL_COLUMN.TIME] as string) ?? '',
    dueDate: (row[SQL_COLUMN.DUE_DATE] as string) ?? '',
    createdAt: row[SQL_COLUMN.CREATED_AT] as number,
    note: (row[SQL_COLUMN.NOTE] as string) ?? '',
    movements: [], // filled separately
  };
}

export function mapDebtToParams(debt: DebtRecord, accountId: string): unknown[] {
  return [
    debt.id,
    accountId,
    debt.person,
    debt.amount,
    debt.originalAmount,
    debt.interestRate,
    debt.direction,
    debt.date,
    debt.time ?? '',
    debt.dueDate ?? '',
    debt.createdAt,
    debt.note ?? '',
  ];
}

export function mapRowToDebtMovement(row: Record<string, unknown>): DebtMovement {
  return {
    id: row[SQL_COLUMN.ID] as string,
    type: row[SQL_COLUMN.MOVEMENT_TYPE] as DebtMovementType,
    amount: row[SQL_COLUMN.AMOUNT] as number,
    interestAmount: (row[SQL_COLUMN.INTEREST_AMOUNT] as number) ?? 0,
    date: row[SQL_COLUMN.DATE] as string,
    time: (row[SQL_COLUMN.TIME] as string) ?? '',
    createdAt: row[SQL_COLUMN.CREATED_AT] as number,
    note: (row[SQL_COLUMN.NOTE] as string) ?? '',
  };
}

export function mapDebtMovementToParams(movement: DebtMovement, debtId: string): unknown[] {
  return [
    movement.id,
    debtId,
    movement.type,
    movement.amount,
    movement.interestAmount ?? null,
    movement.date,
    movement.time ?? '',
    movement.createdAt,
    movement.note ?? '',
  ];
}

// ── Credits ──────────────────────────────────────────────────────────────

export function mapRowToCredit(row: Record<string, unknown>): CreditRecord {
  return {
    id: row[SQL_COLUMN.ID] as string,
    name: row[SQL_COLUMN.NAME] as string,
    type: row[SQL_COLUMN.TYPE] as CreditType,
    bankName: row[SQL_COLUMN.BANK_NAME] as string,
    originalAmount: row[SQL_COLUMN.ORIGINAL_AMOUNT] as number,
    currentAmount: row[SQL_COLUMN.CURRENT_AMOUNT] as number,
    interestRate: row[SQL_COLUMN.INTEREST_RATE] as number,
    monthlyPayment: row[SQL_COLUMN.MONTHLY_PAYMENT] as number,
    termMonths: row[SQL_COLUMN.TERM_MONTHS] as number,
    startDate: row[SQL_COLUMN.START_DATE] as string,
    paymentDay: (row[SQL_COLUMN.PAYMENT_DAY] as number | null) ?? undefined,
    createdAt: row[SQL_COLUMN.CREATED_AT] as number,
    note: (row[SQL_COLUMN.NOTE] as string) ?? '',
    status: row[SQL_COLUMN.STATUS] as CreditStatus,
    earlyRepaymentOption: (row[SQL_COLUMN.EARLY_REPAYMENT_OPTION] as EarlyRepaymentOption) ?? null,
    purchasePrice: (row[SQL_COLUMN.PURCHASE_PRICE] as number | null) ?? undefined,
    downPayment: (row[SQL_COLUMN.DOWN_PAYMENT] as number | null) ?? undefined,
    downPaymentType: (row[SQL_COLUMN.DOWN_PAYMENT_TYPE] as DownPaymentType | null) ?? undefined,
    downPaymentValue: (row[SQL_COLUMN.DOWN_PAYMENT_VALUE] as number | null) ?? undefined,
    downPaymentDate: (row[SQL_COLUMN.DOWN_PAYMENT_DATE] as string | null) ?? undefined,
    downPaymentRecordId: (row[SQL_COLUMN.DOWN_PAYMENT_RECORD_ID] as string | null) ?? undefined,
    isEscrow: Boolean(row[SQL_COLUMN.IS_ESCROW]),
    attachmentPath: (row[SQL_COLUMN.ATTACHMENT_PATH] as string | null) ?? undefined,
    dayCountConvention: (row[SQL_COLUMN.DAY_COUNT_CONVENTION] as DayCountConvention | null) ?? undefined,
    payments: [], // filled separately
  };
}

export function mapCreditToParams(credit: CreditRecord, accountId: string): unknown[] {
  return [
    credit.id,
    accountId,
    credit.name,
    credit.type,
    credit.bankName,
    credit.originalAmount,
    credit.currentAmount,
    credit.interestRate,
    credit.monthlyPayment,
    credit.termMonths,
    credit.startDate,
    credit.paymentDay ?? null,
    credit.createdAt,
    credit.note ?? '',
    credit.status,
    credit.earlyRepaymentOption ?? null,
    credit.purchasePrice ?? null,
    credit.downPayment ?? null,
    credit.downPaymentType ?? null,
    credit.downPaymentValue ?? null,
    credit.downPaymentDate ?? null,
    credit.downPaymentRecordId ?? null,
    credit.isEscrow ? 1 : 0,
    credit.attachmentPath ?? null,
    credit.dayCountConvention ?? null,
  ];
}

export function mapRowToCreditPayment(row: Record<string, unknown>): CreditPayment {
  return {
    id: row[SQL_COLUMN.ID] as string,
    amount: row[SQL_COLUMN.AMOUNT] as number,
    dueDate: row[SQL_COLUMN.DUE_DATE] as string,
    status: row[SQL_COLUMN.STATUS] as PaymentStatus,
    paidDate: (row[SQL_COLUMN.PAID_DATE] as string) ?? undefined,
    note: (row[SQL_COLUMN.NOTE] as string) ?? undefined,
    principalPart: (row[SQL_COLUMN.PRINCIPAL_PART] as number) ?? undefined,
    interestPart: (row[SQL_COLUMN.INTEREST_PART] as number) ?? undefined,
    remainingDebt: (row[SQL_COLUMN.REMAINING_DEBT] as number) ?? undefined,
  };
}

export function mapCreditPaymentToParams(payment: CreditPayment, creditId: string): unknown[] {
  return [
    payment.id,
    creditId,
    payment.amount,
    payment.dueDate,
    payment.status,
    payment.paidDate ?? null,
    payment.note ?? null,
    payment.principalPart ?? null,
    payment.interestPart ?? null,
    payment.remainingDebt ?? null,
  ];
}

// ── Deposits ─────────────────────────────────────────────────────────────

export function mapRowToDeposit(row: Record<string, unknown>): DepositRecord {
  return {
    id: row[SQL_COLUMN.ID] as string,
    name: row[SQL_COLUMN.NAME] as string,
    type: row[SQL_COLUMN.TYPE] as DepositType,
    bankName: row[SQL_COLUMN.BANK_NAME] as string,
    amount: row[SQL_COLUMN.AMOUNT] as number,
    interestRate: row[SQL_COLUMN.INTEREST_RATE] as number,
    startDate: row[SQL_COLUMN.START_DATE] as string,
    termMonths: row[SQL_COLUMN.TERM_MONTHS] as number,
    accrualType: row[SQL_COLUMN.ACCRUAL_TYPE] as DepositAccrualType,
    createdAt: row[SQL_COLUMN.CREATED_AT] as number,
    note: (row[SQL_COLUMN.NOTE] as string) ?? '',
    status: row[SQL_COLUMN.STATUS] as DepositStatus,
    attachmentPath: (row[SQL_COLUMN.ATTACHMENT_PATH] as string) ?? '',
    accruals: [], // filled separately
    topUps: [], // filled separately
    withdrawals: [], // filled separately
  };
}

export function mapDepositToParams(deposit: DepositRecord, accountId: string): unknown[] {
  return [
    deposit.id,
    accountId,
    deposit.name,
    deposit.type,
    deposit.bankName,
    deposit.amount,
    deposit.interestRate,
    deposit.startDate,
    deposit.termMonths,
    deposit.accrualType,
    deposit.createdAt,
    deposit.note ?? '',
    deposit.status,
    deposit.attachmentPath ?? null,
  ];
}

export function mapRowToDepositAccrual(row: Record<string, unknown>): DepositAccrual {
  return {
    id: row[SQL_COLUMN.ID] as string,
    amount: row[SQL_COLUMN.AMOUNT] as number,
    dueDate: row[SQL_COLUMN.DUE_DATE] as string,
    status: row[SQL_COLUMN.STATUS] as PaymentStatus,
    paidDate: (row[SQL_COLUMN.PAID_DATE] as string) ?? undefined,
    note: (row[SQL_COLUMN.NOTE] as string) ?? undefined,
  };
}

export function mapDepositAccrualToParams(accrual: DepositAccrual, depositId: string): unknown[] {
  return [
    accrual.id,
    depositId,
    accrual.amount,
    accrual.dueDate,
    accrual.status,
    accrual.paidDate ?? null,
    accrual.note ?? null,
  ];
}

export function mapRowToDepositTopUp(row: Record<string, unknown>): DepositTopUp {
  return {
    id: row[SQL_COLUMN.ID] as string,
    amount: row[SQL_COLUMN.AMOUNT] as number,
    date: row[SQL_COLUMN.DATE] as string,
    time: (row[SQL_COLUMN.TIME] as string) ?? '',
    createdAt: row[SQL_COLUMN.CREATED_AT] as number,
    note: (row[SQL_COLUMN.NOTE] as string) ?? '',
  };
}

export function mapDepositTopUpToParams(topUp: DepositTopUp, depositId: string): unknown[] {
  return [
    topUp.id,
    depositId,
    topUp.amount,
    topUp.date,
    topUp.time ?? '',
    topUp.createdAt,
    topUp.note ?? '',
  ];
}

export function mapRowToDepositWithdrawal(row: Record<string, unknown>): DepositWithdrawal {
  return {
    id: row[SQL_COLUMN.ID] as string,
    amount: row[SQL_COLUMN.AMOUNT] as number,
    date: row[SQL_COLUMN.DATE] as string,
    time: (row[SQL_COLUMN.TIME] as string) ?? '',
    createdAt: row[SQL_COLUMN.CREATED_AT] as number,
    note: (row[SQL_COLUMN.NOTE] as string) ?? '',
  };
}

export function mapDepositWithdrawalToParams(withdrawal: DepositWithdrawal, depositId: string): unknown[] {
  return [
    withdrawal.id,
    depositId,
    withdrawal.amount,
    withdrawal.date,
    withdrawal.time ?? '',
    withdrawal.createdAt,
    withdrawal.note ?? '',
  ];
}

// ── Exchanges ────────────────────────────────────────────────────────────

export function mapRowToExchange(row: Record<string, unknown>): CurrencyExchange {
  return {
    id: row[SQL_COLUMN.ID] as string,
    createdAt: row[SQL_COLUMN.CREATED_AT] as number,
    date: row[SQL_COLUMN.DATE] as string,
    time: (row[SQL_COLUMN.TIME] as string) ?? '',
    type: row[SQL_COLUMN.TYPE] as CurrencyOperationType,
    amountInAccountCurrency: row[SQL_COLUMN.AMOUNT_IN_ACCOUNT_CURRENCY] as number,
    targetCurrency: row[SQL_COLUMN.TARGET_CURRENCY] as string,
    targetAmount: row[SQL_COLUMN.TARGET_AMOUNT] as number,
    exchangeRate: row[SQL_COLUMN.EXCHANGE_RATE] as number,
    provider: (row[SQL_COLUMN.PROVIDER] as string) ?? '',
    category: (row[SQL_COLUMN.CATEGORY] as string | null) ?? undefined,
    fee: (row[SQL_COLUMN.FEE] as number | null) ?? undefined,
    note: (row[SQL_COLUMN.NOTE] as string) ?? '',
    attachmentPath: (row[SQL_COLUMN.ATTACHMENT_PATH] as string | null) ?? undefined,
  };
}

export function mapExchangeToParams(exchange: CurrencyExchange, accountId: string): unknown[] {
  return [
    exchange.id,
    accountId,
    exchange.createdAt,
    exchange.date,
    exchange.time ?? '',
    exchange.type,
    exchange.amountInAccountCurrency,
    exchange.targetCurrency,
    exchange.targetAmount,
    exchange.exchangeRate,
    exchange.provider ?? '',
    exchange.category ?? null,
    exchange.fee ?? null,
    exchange.note ?? '',
    exchange.attachmentPath ?? null,
  ];
}


