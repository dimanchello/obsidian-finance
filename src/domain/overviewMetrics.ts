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

export interface MonthGroup {
  label: string;
  income: number;
  expense: number;
  net: number;
}

/**
 * Group records by month (YYYY-MM) for chart display
 */
export function groupRecordsByMonth(records: FinanceRecord[]): MonthGroup[] {
  const map = new Map<string, { income: number; expense: number }>();

  records.forEach(r => {
    if (r.isInternal) return;
    const key = r.date.slice(0, 7); // YYYY-MM
    const existing = map.get(key) ?? { income: 0, expense: 0 };
    if (r.type === 'income') {
      existing.income += r.amount;
    } else {
      existing.expense += r.amount;
    }
    map.set(key, existing);
  });

  const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return sorted.map(([key, { income, expense }]) => ({
    label: key,
    income,
    expense,
    net: income - expense,
  }));
}

export interface CreditBurdenMonth {
  label: string;
  principal: number;
  interest: number;
  total: number;
  burdenPercent: number | null;
}

/**
 * Calculate monthly credit burden breakdown over last N months
 */
export function calcCreditBurdenOverTime(
  credits: CreditRecord[],
  records: FinanceRecord[],
  asOfDate: string,
  months: number = OVERVIEW_BURDEN_MONTHS
): CreditBurdenMonth[] {
  const result: CreditBurdenMonth[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = addMonthsClamped(asOfDate, -i);
    const monthEnd = addMonthsClamped(monthStart, 1);
    const label = monthStart.slice(0, 7); // YYYY-MM

    // Calculate monthly income for this month
    const monthIncome = records
      .filter(r => r.type === 'income' && !r.isInternal && r.date >= monthStart && r.date < monthEnd)
      .reduce((s, r) => s + r.amount, 0);

    // Calculate credit payments for this month
    let principal = 0;
    let interest = 0;

    credits.filter(c => c.status === 'active').forEach(c => {
      c.payments
        .filter(p => p.status === 'paid' && p.dueDate >= monthStart && p.dueDate < monthEnd)
        .forEach(p => {
          principal += p.principalPart ?? 0;
          interest += p.interestPart ?? 0;
        });
    });

    const total = principal + interest;
    const burdenPercent = monthIncome > 0 ? (total / monthIncome) * 100 : null;

    result.push({
      label,
      principal,
      interest,
      total,
      burdenPercent,
    });
  }

  return result;
}

export interface AssetLiabilityMonth {
  label: string;
  assets: number;
  liabilities: number;
  net: number;
}

/**
 * Calculate assets and liabilities trend over last N months
 */
export function calcAssetsLiabilitiesOverTime(
  deposits: DepositRecord[],
  exchanges: CurrencyExchange[],
  credits: CreditRecord[],
  debts: DebtRecord[],
  asOfDate: string,
  months = 6
): AssetLiabilityMonth[] {
  const result: AssetLiabilityMonth[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthDate = addMonthsClamped(asOfDate, -i);
    const label = monthDate.slice(0, 7); // YYYY-MM

    // Assets: active deposits + currency + lent debts at that point in time
    const assets = calcAssets(
      deposits.filter(d => d.status === 'active' && d.startDate <= monthDate),
      exchanges.filter(e => e.date <= monthDate),
      debts.filter(d => d.direction === 'lent' && d.date <= monthDate)
    );

    // Liabilities: active credits (remaining principal) + borrowed debts
    const activeCreditsPrincipal = credits
      .filter(c => c.status === 'active' && c.startDate <= monthDate)
      .reduce((sum, c) => {
        const remaining = calculateRemainingPrincipal(c);
        return sum + remaining;
      }, 0);

    const borrowedDebts = debts
      .filter(d => d.direction === 'borrowed' && d.date <= monthDate)
      .reduce((s, d) => s + d.amount, 0);

    const liabilities = activeCreditsPrincipal + borrowedDebts;

    result.push({
      label,
      assets,
      liabilities,
      net: assets - liabilities,
    });
  }

  return result;
}
