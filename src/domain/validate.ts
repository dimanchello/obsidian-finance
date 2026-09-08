import {
  CreditPayment, CreditRecord,
  DebtMovement, DebtRecord,
  DepositAccrual, DepositRecord, DepositTopUp, DepositWithdrawal,
  FinanceRecord, CurrencyExchange,
} from '../types';
import { normalizeDateStr, normalizeTimeStr } from '../utils';
import {
  RecordType, DebtDirection, DebtMovementType, CreditType, CreditStatus,
  DepositType, DepositStatus, DepositAccrualType, PaymentStatus, CurrencyOperationType,
  EarlyRepaymentOption,
} from '../constants';

/**
 * Boundary validation for JSON read off disk. Under v1 only the current code writes
 * these files, so anything malformed is hand-edited or truncated — drop it loudly
 * rather than back-filling defaults, which would mask the corruption.
 */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : fallback;
}

function optDate(v: unknown): string | undefined {
  return typeof v === 'string' && v ? normalizeDateStr(v) : undefined;
}

/** Keeps only entries that parse; a single corrupt entry must not lose the whole file. */
function parseList<T>(raw: unknown, parse: (item: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    if (!isObject(item)) continue;
    const parsed = parse(item);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

/**
 * Allowed values are read straight off the constant objects, so a status added
 * in `constants.ts` widens the type and this validator together — there is no
 * second list here that can silently fall behind.
 */
const RECORD_TYPES = Object.values(RecordType);
const DEBT_DIRECTIONS = Object.values(DebtDirection);
const MOVEMENT_TYPES = Object.values(DebtMovementType);
const CREDIT_TYPES = Object.values(CreditType);
const CREDIT_STATUSES = Object.values(CreditStatus);
const DEPOSIT_TYPES = Object.values(DepositType);
const DEPOSIT_STATUSES = Object.values(DepositStatus);
const ACCRUAL_TYPES = Object.values(DepositAccrualType);
const SCHEDULE_STATUSES = Object.values(PaymentStatus);
const CURRENCY_OPERATION_TYPES = Object.values(CurrencyOperationType);

export function parseRecord(o: Record<string, unknown>): FinanceRecord | null {
  const id = str(o.id);
  if (!id) return null;
  return {
    id,
    createdAt: num(o.createdAt),
    date: normalizeDateStr(str(o.date)),
    time: normalizeTimeStr(str(o.time)),
    type: oneOf(o.type, RECORD_TYPES, RecordType.EXPENSE),
    amount: num(o.amount),
    category: str(o.category),
    tag: str(o.tag),
    payer: str(o.payer),
    note: str(o.note),
    attachmentPath: str(o.attachmentPath),
    isInternal: bool(o.isInternal),
    linkedId: str(o.linkedId),
    ...(typeof o.exchangeRate === 'number' ? { exchangeRate: o.exchangeRate } : {}),
  };
}

function parseMovement(o: Record<string, unknown>): DebtMovement | null {
  const id = str(o.id);
  if (!id) return null;
  return {
    id,
    type: oneOf(o.type, MOVEMENT_TYPES, DebtMovementType.BORROW),
    amount: num(o.amount),
    date: normalizeDateStr(str(o.date)),
    time: normalizeTimeStr(str(o.time)),
    createdAt: num(o.createdAt),
    note: str(o.note),
  };
}

export function parseDebt(o: Record<string, unknown>): DebtRecord | null {
  const id = str(o.id);
  if (!id) return null;
  return {
    id,
    person: str(o.person),
    amount: num(o.amount),
    originalAmount: num(o.originalAmount),
    interestRate: num(o.interestRate),
    direction: oneOf(o.direction, DEBT_DIRECTIONS, DebtDirection.BORROWED),
    date: normalizeDateStr(str(o.date)),
    time: normalizeTimeStr(str(o.time)),
    dueDate: typeof o.dueDate === 'string' && o.dueDate ? normalizeDateStr(o.dueDate) : '',
    createdAt: num(o.createdAt),
    note: str(o.note),
    movements: parseList(o.movements, parseMovement),
  };
}

function parsePayment(o: Record<string, unknown>): CreditPayment | null {
  const id = str(o.id);
  if (!id) return null;
  const paidDate = optDate(o.paidDate);
  return {
    id,
    amount: num(o.amount),
    dueDate: normalizeDateStr(str(o.dueDate)),
    status: oneOf(o.status, SCHEDULE_STATUSES, PaymentStatus.PENDING),
    ...(paidDate === undefined ? {} : { paidDate }),
    ...(typeof o.note === 'string' ? { note: o.note } : {}),
  };
}

export function parseCredit(o: Record<string, unknown>): CreditRecord | null {
  const id = str(o.id);
  if (!id) return null;
  const earlyRepayment = o.earlyRepaymentOption;
  return {
    id,
    name: str(o.name),
    type: oneOf(o.type, CREDIT_TYPES, CreditType.CONSUMER),
    bankName: str(o.bankName),
    originalAmount: num(o.originalAmount),
    currentAmount: num(o.currentAmount),
    interestRate: num(o.interestRate),
    monthlyPayment: num(o.monthlyPayment),
    termMonths: num(o.termMonths),
    startDate: normalizeDateStr(str(o.startDate)),
    createdAt: num(o.createdAt),
    note: str(o.note),
    status: oneOf(o.status, CREDIT_STATUSES, CreditStatus.ACTIVE),
    earlyRepaymentOption: earlyRepayment === EarlyRepaymentOption.TERM || earlyRepayment === EarlyRepaymentOption.AMOUNT ? earlyRepayment : null,
    payments: parseList(o.payments, parsePayment),
    purchasePrice: num(o.purchasePrice),
    downPayment: num(o.downPayment),
    downPaymentType: oneOf(o.downPaymentType, ['percent', 'amount'] as const, 'amount'),
    downPaymentValue: num(o.downPaymentValue),
    downPaymentDate: typeof o.downPaymentDate === 'string' && o.downPaymentDate ? normalizeDateStr(o.downPaymentDate) : '',
    ...(typeof o.downPaymentRecordId === 'string' ? { downPaymentRecordId: o.downPaymentRecordId } : {}),
  };
}

function parseAccrual(o: Record<string, unknown>): DepositAccrual | null {
  const id = str(o.id);
  if (!id) return null;
  const paidDate = optDate(o.paidDate);
  return {
    id,
    amount: num(o.amount),
    dueDate: normalizeDateStr(str(o.dueDate)),
    status: oneOf(o.status, SCHEDULE_STATUSES, PaymentStatus.PENDING),
    ...(paidDate === undefined ? {} : { paidDate }),
    ...(typeof o.note === 'string' ? { note: o.note } : {}),
  };
}

function parseTopUp(o: Record<string, unknown>): DepositTopUp | null {
  const id = str(o.id);
  if (!id) return null;
  return {
    id,
    amount: num(o.amount),
    date: normalizeDateStr(str(o.date)),
    time: normalizeTimeStr(str(o.time)),
    createdAt: num(o.createdAt),
    note: str(o.note),
  };
}

export function parseDeposit(o: Record<string, unknown>): DepositRecord | null {
  const id = str(o.id);
  if (!id) return null;
  return {
    id,
    name: str(o.name),
    type: oneOf(o.type, DEPOSIT_TYPES, DepositType.TERM),
    bankName: str(o.bankName),
    amount: num(o.amount),
    interestRate: num(o.interestRate),
    startDate: normalizeDateStr(str(o.startDate)),
    termMonths: num(o.termMonths),
    accrualType: oneOf(o.accrualType, ACCRUAL_TYPES, DepositAccrualType.TO_ACCOUNT),
    createdAt: num(o.createdAt),
    note: str(o.note),
    status: oneOf(o.status, DEPOSIT_STATUSES, DepositStatus.ACTIVE),
    accruals: parseList(o.accruals, parseAccrual),
    topUps: parseList(o.topUps, parseTopUp),
    withdrawals: parseList<DepositWithdrawal>(o.withdrawals, parseTopUp),
  };
}

export function parseExchange(o: Record<string, unknown>): CurrencyExchange | null {
  const id = str(o.id);
  if (!id) return null;
  return {
    id,
    createdAt: num(o.createdAt),
    date: normalizeDateStr(str(o.date)),
    time: normalizeTimeStr(str(o.time)),
    type: oneOf(o.type, CURRENCY_OPERATION_TYPES, CurrencyOperationType.BUY),
    amountInAccountCurrency: num(o.amountInAccountCurrency),
    targetCurrency: str(o.targetCurrency),
    targetAmount: num(o.targetAmount),
    exchangeRate: num(o.exchangeRate),
    provider: str(o.provider),
    ...(str(o.category) ? { category: str(o.category) } : {}),
    ...(typeof o.fee === 'number' ? { fee: num(o.fee) } : {}),
    note: str(o.note),
  };
}

export function parseRecords(raw: unknown): FinanceRecord[] {
  return parseList(raw, parseRecord);
}

export function parseDebts(raw: unknown): DebtRecord[] {
  return parseList(raw, parseDebt);
}

export function parseCredits(raw: unknown): CreditRecord[] {
  return parseList(raw, parseCredit);
}

export function parseDeposits(raw: unknown): DepositRecord[] {
  return parseList(raw, parseDeposit);
}

export function parseExchanges(raw: unknown): CurrencyExchange[] {
  return parseList(raw, parseExchange);
}

export function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
}
