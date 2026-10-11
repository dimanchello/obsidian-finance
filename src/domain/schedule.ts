import { CreditPayment, CreditRecord, DepositAccrual, DepositRecord, PERCENT_100 } from '../types';
import { addMonthsClamped, withDayClamped, daysBetweenStr, parseDateStr, daysInYear } from './dateMath';
import { round2, sumMoney } from './money';
import { PaymentStatus, DepositAccrualType } from '../constants';
import { getDepositInitialAmount } from './depositCalculations';

/** Everything non-deterministic is passed in — that is what makes these functions testable. */
export interface ScheduleDeps {
  today: string;
  newId: () => string;
}

/**
 * Simple interest calculation with proper leap year handling.
 * Uses actual/365 or actual/366 day count convention depending on the year.
 *
 * @param principal - Principal amount
 * @param ratePercent - Annual interest rate as percentage (e.g., 10 for 10%)
 * @param days - Number of days in the period
 * @param year - Calendar year for the period (determines 365 vs 366 denominator)
 */
function simpleInterest(principal: number, ratePercent: number, days: number, year: number): number {
  return principal * (ratePercent / PERCENT_100) * days / daysInYear(year);
}

function canSchedule(startDate: string, termMonths: number): boolean {
  return termMonths > 0 && parseDateStr(startDate) !== null;
}

/**
 * Full accrual schedule for a fresh deposit.
 * `capitalization` compounds into the body; `to_account` pays interest out on a fixed base.
 * Past-due entries come back already marked paid — the caller mirrors them into records.
 */
export function buildDepositSchedule(deposit: DepositRecord, deps: ScheduleDeps): DepositAccrual[] {
  if (deposit.amount <= 0 || !canSchedule(deposit.startDate, deposit.termMonths)) return [];

  const compounding = deposit.accrualType === DepositAccrualType.CAPITALIZATION;
  const accruals: DepositAccrual[] = [];
  const events = [
    ...(deposit.topUps ?? []).map(movement => ({
      date: movement.date,
      time: movement.time,
      delta: movement.amount,
    })),
    ...(deposit.withdrawals ?? []).map(movement => ({
      date: movement.date,
      time: movement.time,
      delta: -movement.amount,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  let principal = getDepositInitialAmount(deposit);
  let eventIndex = 0;
  let prevDate = deposit.startDate;

  while (eventIndex < events.length && events[eventIndex]!.date <= deposit.startDate) {
    principal = round2(Math.max(0, principal + events[eventIndex]!.delta));
    eventIndex++;
  }

  for (let i = 1; i <= deposit.termMonths; i++) {
    const dueDate = addMonthsClamped(deposit.startDate, i);
    let periodInterest = 0;

    while (eventIndex < events.length && events[eventIndex]!.date <= dueDate) {
      const event = events[eventIndex]!;
      if (event.date >= prevDate) {
        const days = daysBetweenStr(prevDate, event.date);
        const year = parseDateStr(event.date)?.year ?? new Date().getFullYear();
        periodInterest += simpleInterest(principal, deposit.interestRate, days, year);
        prevDate = event.date;
      }
      principal = round2(Math.max(0, principal + event.delta));
      eventIndex++;
    }

    const days = daysBetweenStr(prevDate, dueDate);
    // Use the year of the period end for leap year determination
    const year = parseDateStr(dueDate)?.year ?? new Date().getFullYear();
    periodInterest += simpleInterest(principal, deposit.interestRate, days, year);
    const interest = round2(periodInterest);
    if (compounding) principal = round2(principal + interest);

    const isPast = dueDate <= deps.today;
    accruals.push({
      id: deps.newId(),
      amount: interest,
      dueDate,
      status: isPast ? PaymentStatus.PAID : PaymentStatus.PENDING,
      ...(isPast ? { paidDate: dueDate } : {}),
    });
    prevDate = dueDate;
  }

  return accruals;
}

/** Full payment schedule for a fresh credit — equal monthly payments over the term. */
export function buildCreditSchedule(credit: CreditRecord, deps: ScheduleDeps): CreditPayment[] {
  if (credit.monthlyPayment <= 0 || !canSchedule(credit.startDate, credit.termMonths)) return [];

  const payments: CreditPayment[] = [];
  for (let i = 1; i <= credit.termMonths; i++) {
    const base = addMonthsClamped(credit.startDate, i);
    const dueDate = credit.paymentDay !== undefined ? withDayClamped(base, credit.paymentDay) : base;
    const isPast = dueDate <= deps.today;
    payments.push({
      id: deps.newId(),
      amount: round2(credit.monthlyPayment),
      dueDate,
      status: isPast ? PaymentStatus.PAID : PaymentStatus.PENDING,
      ...(isPast ? { paidDate: dueDate } : {}),
    });
  }
  return payments;
}

/**
 * Re-price pending future accruals after the body changed (top-up / withdrawal).
 * Past accruals are already paid out and must not move. Returns a new array.
 */
export function recalcFutureAccruals(deposit: DepositRecord, today: string): DepositAccrual[] {
  const accruals = deposit.accruals;
  const future = accruals
    .filter(a => a.dueDate > today && a.status === PaymentStatus.PENDING)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (!future.length) return accruals;

  // Hoisted out of the loop: recomputing it per iteration was O(N log N × M).
  const lastPaidDate = accruals
    .filter(a => a.status === PaymentStatus.PAID)
    .reduce<string | null>((latest, a) => (latest === null || a.dueDate > latest ? a.dueDate : latest), null);

  const compounding = deposit.accrualType === DepositAccrualType.CAPITALIZATION;
  const repriced = new Map<string, number>();
  const movementsAfterPaidDate = [
    ...(deposit.topUps ?? []).filter(movement => movement.date > (lastPaidDate ?? deposit.startDate)).map(movement => movement.amount),
    ...(deposit.withdrawals ?? []).filter(movement => movement.date > (lastPaidDate ?? deposit.startDate)).map(movement => -movement.amount),
  ];
  let principal = round2(Math.max(0, deposit.amount - sumMoney(movementsAfterPaidDate)));
  let prevDate = lastPaidDate ?? deposit.startDate;

  const futureEvents = [
    ...(deposit.topUps ?? []).map(movement => ({
      date: movement.date,
      time: movement.time,
      delta: movement.amount,
    })),
    ...(deposit.withdrawals ?? []).map(movement => ({
      date: movement.date,
      time: movement.time,
      delta: -movement.amount,
    })),
  ].filter(event => event.date > prevDate && event.date <= future[future.length - 1]!.dueDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  let eventIndex = 0;

  for (const accrual of future) {
    let periodInterest = 0;
    while (eventIndex < futureEvents.length && futureEvents[eventIndex]!.date <= accrual.dueDate) {
      const event = futureEvents[eventIndex]!;
      const days = daysBetweenStr(prevDate, event.date);
      const year = parseDateStr(event.date)?.year ?? new Date().getFullYear();
      periodInterest += simpleInterest(principal, deposit.interestRate, days, year);
      prevDate = event.date;
      principal = round2(Math.max(0, principal + event.delta));
      eventIndex++;
    }
    const days = daysBetweenStr(prevDate, accrual.dueDate);
    // Use the year of the accrual due date for leap year handling
    const year = parseDateStr(accrual.dueDate)?.year ?? new Date().getFullYear();
    periodInterest += simpleInterest(principal, deposit.interestRate, days, year);
    const interest = round2(periodInterest);
    if (compounding) principal = round2(principal + interest);
    repriced.set(accrual.id, interest);
    prevDate = accrual.dueDate;
  }

  return accruals.map(a => {
    const amount = repriced.get(a.id);
    return amount === undefined ? a : { ...a, amount };
  });
}
