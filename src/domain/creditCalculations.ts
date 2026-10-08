import { CreditPayment, CreditRecord, ACCRUAL_STEP_MONTHLY, PERCENT_100 } from '../types';
import { round2 } from './money';
import { addMonthsClamped, withDayClamped, safeEndDate, daysBetweenStr, daysInYear, parseDateStr } from './dateMath';
import { getTodayStr, normalizeDateStr } from '../utils';
import { PaymentStatus, CreditStatus, CreditType, DayCountConvention } from '../constants';
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

export interface PaymentPeriod {
  fromDate: string;
  toDate: string;
}

/**
 * Calculates interest for a date range using actual calendar days (ACT/365 / ACT/366).
 * According to Russian banking standard (Bank of Russia Regulation 39-P / 579-P),
 * leap year days are divided by 366 and non-leap days by 365.
 */
export function calculatePeriodInterest(
  principal: number,
  annualRate: number,
  fromDate: string,
  toDate: string,
): number {
  if (principal <= 0 || annualRate <= 0 || fromDate >= toDate) return 0;
  const from = parseDateStr(fromDate);
  const to = parseDateStr(toDate);
  if (!from || !to) return 0;

  let totalInterest = 0;
  let curYear = from.year;

  while (curYear <= to.year) {
    const startStr = curYear === from.year ? fromDate : `${String(curYear).padStart(4, '0')}-01-01`;
    const endStr = curYear === to.year ? toDate : `${String(curYear).padStart(4, '0')}-12-31`;

    let days = daysBetweenStr(startStr, endStr);
    if (curYear < to.year) {
      days += 1;
    }

    if (days > 0) {
      const diy = daysInYear(curYear);
      totalInterest += principal * (annualRate / PERCENT_100) * (days / diy);
    }
    curYear++;
  }

  return round2(totalInterest);
}

/**
 * Calculates single payment breakdown into principal repayment and bank interest.
 * Supports both traditional monthly division (1/12) and actual calendar days (ACT/365).
 */
export function calculatePaymentBreakdown(
  principalRemaining: number,
  paymentAmount: number,
  annualRate: number,
  isLastPayment = false,
  period?: PaymentPeriod,
): { principalPart: number; interestPart: number; remainingDebt: number } {
  if (principalRemaining <= 0) {
    return { principalPart: 0, interestPart: 0, remainingDebt: 0 };
  }

  if (annualRate <= 0) {
    const principalPart = Math.min(principalRemaining, paymentAmount);
    const remainingDebt = Math.max(0, round2(principalRemaining - principalPart));
    return { principalPart: round2(principalPart), interestPart: 0, remainingDebt };
  }

  let interestPart: number;
  if (period && period.fromDate < period.toDate) {
    interestPart = calculatePeriodInterest(principalRemaining, annualRate, period.fromDate, period.toDate);
  } else {
    const monthlyRate = annualRate / PERCENT_100 / ACCRUAL_STEP_MONTHLY;
    interestPart = round2(principalRemaining * monthlyRate);
  }

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
  dayCountConvention?: DayCountConvention | undefined;
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
    dayCountConvention,
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
  let prevDate = normStartDate;

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

    // Preserve historical paid payment's breakdown if already recorded
    if (existing?.status === PaymentStatus.PAID && existing.remainingDebt !== undefined) {
      payments.push({
        ...existing,
        amount,
        dueDate: existing.dueDate || dueDate,
        status: PaymentStatus.PAID,
        paidDate: existing.paidDate ?? (isPaid ? dueDate : undefined),
      });
      runningPrincipal = existing.remainingDebt;
      lastPaidRemainingDebt = existing.remainingDebt;
      hasAnyPaid = true;
      prevDate = existing.paidDate ?? existing.dueDate ?? dueDate;
      continue;
    }

    const period: PaymentPeriod | undefined = dayCountConvention === DayCountConvention.ACTUAL
      ? { fromDate: prevDate, toDate: dueDate }
      : undefined;

    const breakdown = calculatePaymentBreakdown(runningPrincipal, amount, interestRate, isLast, period);

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
    prevDate = dueDate;

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

export interface CreditScheduleChartItem {
  id: string;
  label: string;
  dueDate: string;
  principalPart: number;
  interestPart: number;
  total: number;
  remainingDebt: number;
  status: PaymentStatus;
}

/**
 * Builds schedule chart data for a single credit: breakdown of each payment into
 * principal and interest, plus remaining debt after payment.
 */
export function buildCreditScheduleChartData(credit: CreditRecord): CreditScheduleChartItem[] {
  let runningPrincipal = credit.originalAmount;
  let prevDate = credit.startDate;
  return credit.payments.map((p, i) => {
    let principalPart = p.principalPart;
    let interestPart = p.interestPart;
    let remainingDebt = p.remainingDebt;

    if (principalPart === undefined || interestPart === undefined || remainingDebt === undefined) {
      const isLast = i === credit.payments.length - 1;
      const period: PaymentPeriod | undefined = credit.dayCountConvention === DayCountConvention.ACTUAL
        ? { fromDate: prevDate, toDate: p.dueDate }
        : undefined;
      const breakdown = calculatePaymentBreakdown(runningPrincipal, p.amount, credit.interestRate, isLast, period);
      principalPart = breakdown.principalPart;
      interestPart = breakdown.interestPart;
      remainingDebt = breakdown.remainingDebt;
    }
    runningPrincipal = remainingDebt;
    prevDate = p.dueDate;

    return {
      id: p.id,
      label: p.dueDate.slice(0, 7),
      dueDate: p.dueDate,
      principalPart,
      interestPart,
      total: p.amount,
      remainingDebt,
      status: p.status,
    };
  });
}

/**
 * Returns the date of the last paid payment, or credit.startDate if none.
 */
export function getLastPaidPaymentDate(credit: CreditRecord): string {
  for (let i = credit.payments.length - 1; i >= 0; i--) {
    const p = credit.payments[i];
    if (p?.status === PaymentStatus.PAID) {
      return p.paidDate ?? p.dueDate;
    }
  }
  return credit.startDate;
}
