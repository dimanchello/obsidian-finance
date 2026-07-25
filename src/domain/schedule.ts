import { CreditPayment, CreditRecord, DepositAccrual, DepositRecord, DAYS_IN_YEAR, PERCENT_100 } from '../types';
import { addMonthsClamped, daysBetweenStr, parseDateStr } from './dateMath';
import { round2 } from './money';

/** Everything non-deterministic is passed in — that is what makes these functions testable. */
export interface ScheduleDeps {
  today: string;
  newId: () => string;
}

function simpleInterest(principal: number, ratePercent: number, days: number): number {
  return principal * (ratePercent / PERCENT_100) * days / DAYS_IN_YEAR;
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

  const compounding = deposit.accrualType === 'capitalization';
  const accruals: DepositAccrual[] = [];
  let principal = deposit.amount;
  let prevDate = deposit.startDate;

  for (let i = 1; i <= deposit.termMonths; i++) {
    const dueDate = addMonthsClamped(deposit.startDate, i);
    const days = daysBetweenStr(prevDate, dueDate);
    const interest = round2(simpleInterest(principal, deposit.interestRate, days));
    if (compounding) principal = round2(principal + interest);

    const isPast = dueDate <= deps.today;
    accruals.push({
      id: deps.newId(),
      amount: interest,
      dueDate,
      status: isPast ? 'paid' : 'pending',
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
    const dueDate = addMonthsClamped(credit.startDate, i);
    const isPast = dueDate <= deps.today;
    payments.push({
      id: deps.newId(),
      amount: round2(credit.monthlyPayment),
      dueDate,
      status: isPast ? 'paid' : 'pending',
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
    .filter(a => a.dueDate > today && a.status === 'pending')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (!future.length) return accruals;

  // Hoisted out of the loop: recomputing it per iteration was O(N log N × M).
  const lastPaidDate = accruals
    .filter(a => a.status === 'paid')
    .reduce<string | null>((latest, a) => (latest === null || a.dueDate > latest ? a.dueDate : latest), null);

  const compounding = deposit.accrualType === 'capitalization';
  const repriced = new Map<string, number>();
  let principal = deposit.amount;
  let prevDate = lastPaidDate ?? deposit.startDate;

  for (const accrual of future) {
    const days = daysBetweenStr(prevDate, accrual.dueDate);
    const interest = round2(simpleInterest(principal, deposit.interestRate, days));
    if (compounding) principal = round2(principal + interest);
    repriced.set(accrual.id, interest);
    prevDate = accrual.dueDate;
  }

  return accruals.map(a => {
    const amount = repriced.get(a.id);
    return amount === undefined ? a : { ...a, amount };
  });
}
