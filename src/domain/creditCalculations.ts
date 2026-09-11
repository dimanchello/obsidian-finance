import { CreditPayment, CreditRecord, ACCRUAL_STEP_MONTHLY, PERCENT_100 } from '../types';
import { round2 } from './money';
import { addMonthsClamped, withDayClamped, safeEndDate } from './dateMath';
import { getTodayStr, normalizeDateStr } from '../utils';
import { PaymentStatus, CreditStatus, CreditType } from '../constants';
import type { Translations } from '../i18n';

/**
 * Calculates standard bank annuity monthly payment.
 * A = S * (i * (1 + i)^n) / ((1 + i)^n - 1)
 */
export function calculateAnnuityPayment(principal: number, annualRate: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  if (annualRate <= 0) return round2(principal / termMonths);

  const monthlyRate = annualRate / PERCENT_100 / ACCRUAL_STEP_MONTHLY;
  const factor = Math.pow(1 + monthlyRate, termMonths);
  if (!isFinite(factor) || factor <= 1) return round2(principal / termMonths);

  const payment = principal * (monthlyRate * factor) / (factor - 1);
  return round2(payment);
}

/**
 * Calculates single payment breakdown into principal repayment and bank interest.
 */
export function calculatePaymentBreakdown(
  principalRemaining: number,
  paymentAmount: number,
  annualRate: number,
  isLastPayment = false,
): { principalPart: number; interestPart: number; remainingDebt: number } {
  if (principalRemaining <= 0) {
    return { principalPart: 0, interestPart: 0, remainingDebt: 0 };
  }

  if (annualRate <= 0) {
    const principalPart = Math.min(principalRemaining, paymentAmount);
    const remainingDebt = Math.max(0, round2(principalRemaining - principalPart));
    return { principalPart: round2(principalPart), interestPart: 0, remainingDebt };
  }

  const monthlyRate = annualRate / PERCENT_100 / ACCRUAL_STEP_MONTHLY;
  const interestPart = round2(principalRemaining * monthlyRate);

  if (isLastPayment || paymentAmount >= round2(principalRemaining + interestPart)) {
    const principalPart = principalRemaining;
    return { principalPart, interestPart, remainingDebt: 0 };
  }

  let principalPart = Math.max(0, round2(paymentAmount - interestPart));
  if (principalPart > principalRemaining) {
    principalPart = principalRemaining;
  }
  const remainingDebt = Math.max(0, round2(principalRemaining - principalPart));

  return {
    principalPart: round2(principalPart),
    interestPart: round2(interestPart),
    remainingDebt: round2(remainingDebt),
  };
}

export interface GenerateScheduleParams {
  originalAmount: number;
  interestRate: number;
  termMonths: number;
  monthlyPayment: number;
  startDate: string;
  paymentDay?: number | undefined;
  existingPayments?: CreditPayment[] | undefined;
}

/**
 * Generates or updates a full bank annuity schedule.
 */
export function generateAnnuitySchedule(params: GenerateScheduleParams): {
  payments: CreditPayment[];
  currentAmount: number;
} {
  const {
    originalAmount,
    interestRate,
    termMonths,
    monthlyPayment,
    startDate,
    paymentDay,
    existingPayments = [],
  } = params;

  if (termMonths <= 0 || originalAmount <= 0) {
    return { payments: [], currentAmount: 0 };
  }

  const today = getTodayStr();
  const normStartDate = normalizeDateStr(startDate);
  const payments: CreditPayment[] = [];
  let runningPrincipal = originalAmount;
  let lastPaidRemainingDebt = originalAmount;
  let hasAnyPaid = false;

  for (let i = 1; i <= termMonths; i++) {
    const baseDate = addMonthsClamped(normStartDate, i);
    const dueDate = paymentDay !== undefined
      ? withDayClamped(baseDate, paymentDay)
      : baseDate;

    const existing = existingPayments[i - 1];
    const isPast = dueDate <= today;
    const isPaid = existing ? existing.status === PaymentStatus.PAID : isPast;
    const amount = existing?.amount ?? monthlyPayment;
    const isLast = i === termMonths || runningPrincipal <= 0;

    const breakdown = calculatePaymentBreakdown(runningPrincipal, amount, interestRate, isLast);

    const payment: CreditPayment = {
      id: existing?.id ?? crypto.randomUUID(),
      amount,
      dueDate,
      status: isPaid ? PaymentStatus.PAID : PaymentStatus.PENDING,
      paidDate: existing?.paidDate ?? (isPaid ? dueDate : undefined),
      note: existing?.note,
      principalPart: breakdown.principalPart,
      interestPart: breakdown.interestPart,
      remainingDebt: breakdown.remainingDebt,
    };

    payments.push(payment);
    runningPrincipal = breakdown.remainingDebt;

    if (isPaid) {
      lastPaidRemainingDebt = breakdown.remainingDebt;
      hasAnyPaid = true;
    }
  }

  const currentAmount = hasAnyPaid ? lastPaidRemainingDebt : originalAmount;

  return {
    payments,
    currentAmount: round2(currentAmount),
  };
}

/**
 * Accurately computes remaining principal balance of a credit.
 */
export function calculateRemainingPrincipal(credit: CreditRecord): number {
  if (credit.status === CreditStatus.PAID || credit.originalAmount <= 0) return 0;

  const paidPayments = credit.payments.filter(p => p.status === PaymentStatus.PAID);
  if (paidPayments.length === 0) return credit.originalAmount;

  const lastPaid = paidPayments[paidPayments.length - 1];
  if (lastPaid?.remainingDebt !== undefined) {
    return lastPaid.remainingDebt;
  }

  // Fallback simulation for historical legacy payments
  let runningPrincipal = credit.originalAmount;
  for (let i = 0; i < paidPayments.length; i++) {
    const p = paidPayments[i]!;
    const isLast = i === paidPayments.length - 1 && paidPayments.length === credit.termMonths;
    const breakdown = calculatePaymentBreakdown(runningPrincipal, p.amount, credit.interestRate, isLast);
    runningPrincipal = breakdown.remainingDebt;
  }

  return round2(runningPrincipal);
}

/**
 * Calculates total interest paid so far across all paid payments.
 */
export function calculateTotalInterestPaid(credit: CreditRecord): number {
  let totalInterest = 0;
  let runningPrincipal = credit.originalAmount;

  credit.payments.forEach((p, i) => {
    if (p.status !== PaymentStatus.PAID) return;
    if (p.interestPart !== undefined) {
      totalInterest += p.interestPart;
    } else {
      const isLast = i === credit.payments.length - 1;
      const breakdown = calculatePaymentBreakdown(runningPrincipal, p.amount, credit.interestRate, isLast);
      totalInterest += breakdown.interestPart;
      runningPrincipal = breakdown.remainingDebt;
    }
  });

  return round2(totalInterest);
}

export function calculateCreditEndDate(credit: CreditRecord): string {
  return safeEndDate(credit.startDate, credit.termMonths);
}

export function getCreditTypeLabel(type: CreditType, tr: Translations): string {
  switch (type) {
    case CreditType.MORTGAGE: return tr.creditTypeMortgage;
    case CreditType.AUTO: return tr.creditTypeAuto;
    case CreditType.CONSUMER:
    default: return tr.creditTypeConsumer;
  }
}
