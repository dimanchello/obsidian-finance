import {
  CreditPayment, CreditRecord, ACCRUAL_STEP_MONTHLY, PERCENT_100, DAYS_IN_FIXED_MONTH,
} from '../types';
import { round2 } from './money';
import { addMonthsClamped, withDayClamped, safeEndDate, daysBetweenStr, daysInYear, parseDateStr } from './dateMath';
import { getTodayStr, normalizeDateStr } from '../utils';
import { PaymentStatus, CreditStatus, CreditType, DayCountConvention, DATE_FORMAT_LENGTH } from '../constants';
import type { Translations } from '../i18n';

const YEAR_START_SUFFIX = '01-01';
const YEAR_END_SUFFIX = '12-31';
const PAD_ZERO = '0';

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

export interface ShiftedPayment {
  prevPrincipal: number;
  fromDueDate: string;
  paidDate: string;
}

export interface PaymentPeriod {
  fromDate: string;
  toDate: string;
  shiftedFrom?: {
    prevPrincipal: number;
    paidDate: string;
  } | undefined;
}

/**
 * Builds an ACT/365-366 {@link PaymentPeriod} (including delayed-payment split info when applicable).
 */
export function buildPaymentPeriod(
  fromDate: string,
  toDate: string,
  dayCountConvention?: DayCountConvention,
  shift?: ShiftedPayment,
): PaymentPeriod | undefined {
  if (dayCountConvention !== DayCountConvention.ACTUAL || fromDate >= toDate) return undefined;
  if (shift?.fromDueDate === fromDate) {
    return {
      fromDate,
      toDate,
      shiftedFrom: { prevPrincipal: shift.prevPrincipal, paidDate: shift.paidDate },
    };
  }
  return { fromDate, toDate };
}

/**
 * Tracks a delayed actual payment (`paidDate > dueDate`) so the subsequent period splits accrual.
 */
export function resolvePaymentShift(
  dayCountConvention: DayCountConvention | undefined,
  prevPrincipal: number,
  dueDate: string,
  paidDate: string | undefined,
): ShiftedPayment | undefined {
  if (dayCountConvention !== DayCountConvention.ACTUAL || !paidDate || paidDate <= dueDate) {
    return undefined;
  }
  return { prevPrincipal, fromDueDate: dueDate, paidDate };
}

/**
 * Unrounded ACT/365-366 interest across year boundaries (Bank of Russia Regulation 39-P / 579-P).
 * Separated from {@link calculatePeriodInterest} so split periods can sum raw segments before rounding.
 */
export function calculatePeriodInterestRaw(
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
    const yearStr = String(curYear).padStart(DATE_FORMAT_LENGTH.YEAR, PAD_ZERO);
    const startStr = curYear === from.year ? fromDate : `${yearStr}-${YEAR_START_SUFFIX}`;
    const endStr = curYear === to.year ? toDate : `${yearStr}-${YEAR_END_SUFFIX}`;

    let days = daysBetweenStr(startStr, endStr);
    // Jan 1 of each subsequent year is included in that year's span because Dec 31 belonged to the previous year.
    if (curYear > from.year) {
      days += 1;
    }

    if (days > 0) {
      const diy = daysInYear(curYear);
      totalInterest += principal * (annualRate / PERCENT_100) * (days / diy);
    }
    curYear++;
  }

  return totalInterest;
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
  return round2(calculatePeriodInterestRaw(principal, annualRate, fromDate, toDate));
}

/**
 * Calculates interest when the previous payment's actual `paidDate` occurred after its `dueDate`
 * (e.g. weekend shift), splitting accrual between `prevPrincipal` up to `prevPaidDate` and
 * `currentPrincipal` thereafter.
 */
export function calculateSplitPeriodInterest(
  prevPrincipal: number,
  currentPrincipal: number,
  annualRate: number,
  prevDueDate: string,
  prevPaidDate: string | undefined,
  toDate: string,
): number {
  if (prevPaidDate && prevPaidDate > prevDueDate) {
    if (prevPaidDate < toDate) {
      return round2(
        calculatePeriodInterestRaw(prevPrincipal, annualRate, prevDueDate, prevPaidDate) +
        calculatePeriodInterestRaw(currentPrincipal, annualRate, prevPaidDate, toDate),
      );
    }
    return round2(calculatePeriodInterestRaw(prevPrincipal, annualRate, prevDueDate, toDate));
  }
  return calculatePeriodInterest(currentPrincipal, annualRate, prevDueDate, toDate);
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
    if (period.shiftedFrom && period.shiftedFrom.paidDate > period.fromDate) {
      interestPart = calculateSplitPeriodInterest(
        period.shiftedFrom.prevPrincipal,
        principalRemaining,
        annualRate,
        period.fromDate,
        period.shiftedFrom.paidDate,
        period.toDate,
      );
    } else {
      interestPart = calculatePeriodInterest(principalRemaining, annualRate, period.fromDate, period.toDate);
    }
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
  firstPaymentInterestOnly?: boolean | undefined;
  recalculateAll?: boolean | undefined;
  previousMonthlyPayment?: number | undefined;
  today?: string | undefined;
  newId?: (() => string) | undefined;
}

interface ScheduleSlot {
  dueDate: string;
  isInterestOnly: boolean;
  existing?: CreditPayment | undefined;
}

/**
 * Determines the due date of the initial interest-only stub payment when the loan
 * starts on a different day of the month than `paymentDay`.
 */
export function resolveFirstInterestOnlyDate(startDate: string, paymentDay?: number): string | null {
  if (paymentDay === undefined) return null;
  const sameMonth = withDayClamped(startDate, paymentDay);
  if (sameMonth > startDate) return sameMonth;
  if (sameMonth < startDate) return withDayClamped(addMonthsClamped(startDate, 1), paymentDay);
  return null;
}

function buildScheduleSlots(
  normStartDate: string,
  termMonths: number,
  paymentDay: number | undefined,
  firstPaymentInterestOnly: boolean | undefined,
  existingPayments: CreditPayment[],
): ScheduleSlot[] {
  const firstInterestOnlyDate = firstPaymentInterestOnly
    ? resolveFirstInterestOnlyDate(normStartDate, paymentDay)
    : null;

  const slots: ScheduleSlot[] = [];
  if (firstInterestOnlyDate && paymentDay !== undefined) {
    slots.push({ dueDate: firstInterestOnlyDate, isInterestOnly: true });
    for (let i = 1; i <= termMonths; i++) {
      const baseDate = addMonthsClamped(firstInterestOnlyDate, i);
      slots.push({ dueDate: withDayClamped(baseDate, paymentDay), isInterestOnly: false });
    }
  } else {
    for (let i = 1; i <= termMonths; i++) {
      const baseDate = addMonthsClamped(normStartDate, i);
      const dueDate = paymentDay !== undefined ? withDayClamped(baseDate, paymentDay) : baseDate;
      slots.push({ dueDate, isInterestOnly: false });
    }
  }

  const usedIndices = new Set<number>();
  for (const slot of slots) {
    const idx = existingPayments.findIndex((p, i) => !usedIndices.has(i) && p.dueDate === slot.dueDate);
    if (idx !== -1) {
      slot.existing = existingPayments[idx];
      usedIndices.add(idx);
    }
  }
  for (const slot of slots) {
    if (slot.existing) continue;
    const slotMonth = slot.dueDate.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
    const idx = existingPayments.findIndex(
      (p, i) => !usedIndices.has(i) && p.dueDate.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH) === slotMonth,
    );
    if (idx !== -1) {
      slot.existing = existingPayments[idx];
      usedIndices.add(idx);
    }
  }

  const lastSlotDate = slots[slots.length - 1]?.dueDate ?? '';
  const extraPaidSlots: ScheduleSlot[] = existingPayments
    .filter((p, i) => !usedIndices.has(i) && p.status === PaymentStatus.PAID && p.dueDate >= normStartDate && p.dueDate <= lastSlotDate)
    .map(p => ({ dueDate: p.dueDate, isInterestOnly: false, existing: p }));

  if (extraPaidSlots.length === 0) return slots;
  return [...slots, ...extraPaidSlots].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function calculateInterestOnlyAmount(
  principal: number,
  annualRate: number,
  fromDate: string,
  toDate: string,
  dayCountConvention?: DayCountConvention,
): number {
  if (principal <= 0 || annualRate <= 0 || fromDate >= toDate) return 0;
  if (dayCountConvention === DayCountConvention.ACTUAL) {
    return calculatePeriodInterest(principal, annualRate, fromDate, toDate);
  }
  const days = daysBetweenStr(fromDate, toDate);
  return round2(
    principal * (annualRate / PERCENT_100 / ACCRUAL_STEP_MONTHLY) * (days / DAYS_IN_FIXED_MONTH),
  );
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
    firstPaymentInterestOnly,
    recalculateAll,
    previousMonthlyPayment,
  } = params;

  if (termMonths <= 0 || originalAmount <= 0) {
    return { payments: [], currentAmount: 0 };
  }

  const normStartDate = normalizeDateStr(startDate);
  if (!parseDateStr(normStartDate)) {
    return { payments: [], currentAmount: 0 };
  }

  const today = params.today ?? getTodayStr();
  const makeId = params.newId ?? (() => crypto.randomUUID());
  const timelineSlots = buildScheduleSlots(
    normStartDate,
    termMonths,
    paymentDay,
    firstPaymentInterestOnly,
    existingPayments,
  );

  const payments: CreditPayment[] = [];
  let runningPrincipal = originalAmount;
  let lastPaidRemainingDebt = originalAmount;
  let hasAnyPaid = false;
  let prevDueDate = normStartDate;
  let pendingShift: ShiftedPayment | undefined;

  for (let idx = 0; idx < timelineSlots.length; idx++) {
    const slot = timelineSlots[idx]!;
    const existing = slot.existing;

    // Stop generating trailing non-paid slots once the credit has already been paid off.
    if (runningPrincipal <= 0 && existing?.status !== PaymentStatus.PAID) {
      continue;
    }

    const isPast = slot.dueDate <= today;
    const isPaid = existing ? existing.status === PaymentStatus.PAID : isPast;
    const actualDueDate = existing?.status === PaymentStatus.PAID ? (existing.dueDate || slot.dueDate) : slot.dueDate;
    const paidDate = isPaid ? (existing?.paidDate ?? actualDueDate) : undefined;

    // Preserve historical paid payment's breakdown unless a full recalculation was requested.
    if (!recalculateAll && existing?.status === PaymentStatus.PAID && existing.remainingDebt !== undefined) {
      payments.push({
        ...existing,
        amount: existing.amount,
        dueDate: actualDueDate,
        status: PaymentStatus.PAID,
        paidDate,
      });
      const prevPrincipalBeforePayment = runningPrincipal;
      runningPrincipal = existing.remainingDebt;
      lastPaidRemainingDebt = existing.remainingDebt;
      hasAnyPaid = true;
      pendingShift = resolvePaymentShift(dayCountConvention, prevPrincipalBeforePayment, actualDueDate, paidDate);
      prevDueDate = actualDueDate;
      continue;
    }

    if (slot.isInterestOnly) {
      const interestPart = calculateInterestOnlyAmount(
        runningPrincipal,
        interestRate,
        prevDueDate,
        actualDueDate,
        dayCountConvention,
      );
      const roundedPrincipal = round2(runningPrincipal);
      payments.push({
        id: existing?.id ?? makeId(),
        amount: interestPart,
        dueDate: actualDueDate,
        status: isPaid ? PaymentStatus.PAID : PaymentStatus.PENDING,
        paidDate,
        note: existing?.note,
        principalPart: 0,
        interestPart,
        remainingDebt: roundedPrincipal,
      });
      if (isPaid) {
        lastPaidRemainingDebt = roundedPrincipal;
        hasAnyPaid = true;
      }
      pendingShift = isPaid
        ? resolvePaymentShift(dayCountConvention, runningPrincipal, actualDueDate, paidDate)
        : undefined;
      prevDueDate = actualDueDate;
      continue;
    }

    let amount = monthlyPayment;
    if (existing) {
      amount = recalculateAll && previousMonthlyPayment !== undefined && existing.amount === previousMonthlyPayment
        ? monthlyPayment
        : (existing.amount ?? monthlyPayment);
    }

    const isLast = idx === timelineSlots.length - 1 || runningPrincipal <= 0;
    const period = buildPaymentPeriod(prevDueDate, actualDueDate, dayCountConvention, pendingShift);

    const breakdown = calculatePaymentBreakdown(runningPrincipal, amount, interestRate, isLast, period);
    const exactPayoff = round2(breakdown.principalPart + breakdown.interestPart);
    const shouldCapNew = !existing && breakdown.remainingDebt === 0 && exactPayoff < amount;
    const isTrackedRegularPending = previousMonthlyPayment === undefined
      || existing?.amount === previousMonthlyPayment
      || existing?.amount === monthlyPayment
      || (isLast && !existing?.note && exactPayoff <= monthlyPayment);
    const shouldCapRecalcPending = recalculateAll === true
      && existing?.status === PaymentStatus.PENDING
      && breakdown.remainingDebt === 0
      && exactPayoff !== amount
      && (exactPayoff < amount || (isLast && !existing.note))
      && isTrackedRegularPending;
    if (shouldCapNew || shouldCapRecalcPending) {
      amount = exactPayoff;
    }

    payments.push({
      id: existing?.id ?? makeId(),
      amount,
      dueDate: actualDueDate,
      status: isPaid ? PaymentStatus.PAID : PaymentStatus.PENDING,
      paidDate,
      note: existing?.note,
      principalPart: breakdown.principalPart,
      interestPart: breakdown.interestPart,
      remainingDebt: breakdown.remainingDebt,
    });

    const prevPrincipalBeforePayment = runningPrincipal;
    runningPrincipal = breakdown.remainingDebt;
    if (isPaid) {
      lastPaidRemainingDebt = breakdown.remainingDebt;
      hasAnyPaid = true;
    }
    pendingShift = isPaid
      ? resolvePaymentShift(dayCountConvention, prevPrincipalBeforePayment, actualDueDate, paidDate)
      : undefined;
    prevDueDate = actualDueDate;
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
      label: p.dueDate.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH),
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
