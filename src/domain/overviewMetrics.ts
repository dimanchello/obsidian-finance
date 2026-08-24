import type { FinanceRecord, DebtRecord, CreditRecord, DepositRecord, CurrencyExchange } from '../types';
import { OVERVIEW_UPCOMING_DAYS, OVERVIEW_BURDEN_MONTHS } from '../types';
import { addMonthsClamped, parseDateStr } from './dateMath';
import { calculateRemainingPrincipal } from './creditCalculations';

function addDays(dateStr: string, days: number): string {
  const parsed = parseDateStr(dateStr);
  if (!parsed) return dateStr;
  const d = new Date(parsed.year, parsed.month - 1, parsed.day);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Net balance = sum(income) - sum(expense), excluding isInternal records
 */
export function calcNetBalance(records: FinanceRecord[]): number {
  return records.reduce((sum, r) => {
    if (r.isInternal) return sum;
    return sum + (r.type === 'income' ? r.amount : -r.amount);
  }, 0);
}

/**
 * Assets = active deposits + currency holdings (targetAmount * exchangeRate) + lent debts
 */
export function calcAssets(
  deposits: DepositRecord[],
  exchanges: CurrencyExchange[],
  debts: DebtRecord[],
): number {
  const depositSum = deposits
    .filter(d => d.status === 'active')
    .reduce((s, d) => s + d.amount, 0);

  const currencySum = exchanges.reduce((s, e) => {
    return s + e.targetAmount * e.exchangeRate;
  }, 0);

  const debtSum = debts
    .filter(d => d.direction === 'lent')
    .reduce((s, d) => s + d.amount, 0);

  return depositSum + currencySum + debtSum;
}

/**
 * Liabilities = active credits remaining + borrowed debts
 */
export function calcLiabilities(credits: CreditRecord[], debts: DebtRecord[]): number {
  const creditSum = credits
    .filter(c => c.status === 'active')
    .reduce((s, c) => s + calculateRemainingPrincipal(c), 0);

  const debtSum = debts
    .filter(d => d.direction === 'borrowed')
    .reduce((s, d) => s + d.amount, 0);

  return creditSum + debtSum;
}

/**
 * Credit burden = (sum of monthly payments / average monthly income) * 100
 * Returns null if no income in last N months.
 */
export function calcCreditBurden(
  credits: CreditRecord[],
  incomeRecords: FinanceRecord[],
  asOfDate: string,
): number | null {
  const startDate = addMonthsClamped(asOfDate, -OVERVIEW_BURDEN_MONTHS);
  const relevantIncome = incomeRecords.filter(r =>
    r.type === 'income' && !r.isInternal && r.date >= startDate && r.date <= asOfDate
  );

  if (relevantIncome.length === 0) return null;

  const totalIncome = relevantIncome.reduce((s, r) => s + r.amount, 0);
  // Точно 3 месяца даже если записей меньше
  const avgMonthlyIncome = totalIncome / OVERVIEW_BURDEN_MONTHS;

  const monthlyBurden = credits
    .filter(c => c.status === 'active')
    .reduce((s, c) => s + c.monthlyPayment, 0);

  if (avgMonthlyIncome === 0) return null;
  return (monthlyBurden / avgMonthlyIncome) * 100;
}

/**
 * Upcoming payments = sum of pending credit payments + borrowed debts due within N days
 */
export function calcUpcomingPayments(
  credits: CreditRecord[],
  debts: DebtRecord[],
  asOfDate: string,
): number {
  const endDate = addDays(asOfDate, OVERVIEW_UPCOMING_DAYS);

  const creditPayments = credits
    .filter(c => c.status === 'active')
    .flatMap(c => c.payments)
    .filter(p => p.status === 'pending' && p.dueDate >= asOfDate && p.dueDate <= endDate)
    .reduce((s, p) => s + p.amount, 0);

  const debtPayments = debts
    .filter(d => d.direction === 'borrowed' && d.dueDate >= asOfDate && d.dueDate <= endDate)
    .reduce((s, d) => s + d.amount, 0);

  return creditPayments + debtPayments;
}
