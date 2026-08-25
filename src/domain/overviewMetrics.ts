import type {
  FinanceRecord,
  DebtRecord,
  CreditRecord,
  DepositRecord,
  CurrencyExchange,
  OverviewGroupBy,
} from '../types';
import { OVERVIEW_UPCOMING_DAYS, OVERVIEW_BURDEN_MONTHS } from '../types';
import { addMonthsClamped, parseDateStr } from './dateMath';
import { calculateRemainingPrincipal, calculatePaymentBreakdown } from './creditCalculations';
import { getTodayStr } from '../utils';

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

export function getISOWeekString(dateStr: string): string {
  const parsed = parseDateStr(dateStr);
  if (!parsed) return dateStr;
  const d = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function resolveMonthRange(
  dateFrom?: string,
  dateTo?: string,
  asOfDate: string = getTodayStr(),
  defaultMonths = 6
): string[] {
  let startMonth: string;
  let endMonth: string;

  if (dateFrom && dateTo) {
    startMonth = dateFrom.slice(0, 7);
    endMonth = dateTo.slice(0, 7);
  } else if (dateFrom) {
    startMonth = dateFrom.slice(0, 7);
    endMonth = asOfDate.slice(0, 7);
  } else if (dateTo) {
    endMonth = dateTo.slice(0, 7);
    startMonth = addMonthsClamped(`${endMonth}-01`, -(defaultMonths - 1)).slice(0, 7);
  } else {
    endMonth = asOfDate.slice(0, 7);
    startMonth = addMonthsClamped(`${endMonth}-01`, -(defaultMonths - 1)).slice(0, 7);
  }

  if (startMonth > endMonth) {
    const tmp = startMonth;
    startMonth = endMonth;
    endMonth = tmp;
  }

  const result: string[] = [];
  let curr = `${startMonth}-01`;
  const end = `${endMonth}-01`;

  while (curr <= end) {
    result.push(curr.slice(0, 7));
    curr = addMonthsClamped(curr, 1);
  }

  return result;
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
 * Total assets = sum of active deposit amounts + positive currency balances + lent debts (money others owe me)
 */
export function calcAssets(
  deposits: DepositRecord[],
  exchanges: CurrencyExchange[],
  debts: DebtRecord[],
): number {
  const depositSum = deposits
    .filter(d => d.status === 'active')
    .reduce((s, d) => s + d.amount, 0);

  const exchangeSum = exchanges.reduce((s, e) => {
    const rate = typeof e.exchangeRate === 'number' ? e.exchangeRate : 1;
    const targetAmt = typeof e.targetAmount === 'number' ? e.targetAmount : 0;
    const val = targetAmt > 0 ? targetAmt * rate : 0;
    return s + val;
  }, 0);

  const lentDebts = debts
    .filter(d => d.direction === 'lent')
    .reduce((s, d) => s + d.amount, 0);

  return depositSum + exchangeSum + lentDebts;
}

/**
 * Total liabilities = sum of active credits remaining principal + borrowed debts (money I owe others)
 */
export function calcLiabilities(
  credits: CreditRecord[],
  debts: DebtRecord[],
): number {
  const creditPrincipal = credits
    .filter(c => c.status === 'active')
    .reduce((sum, c) => {
      const remaining = calculateRemainingPrincipal(c);
      return sum + remaining;
    }, 0);

  const borrowedDebts = debts
    .filter(d => d.direction === 'borrowed')
    .reduce((s, d) => s + d.amount, 0);

  return creditPrincipal + borrowedDebts;
}

/**
 * Credit burden % = (monthly payments on active credits / avg monthly income over last 3 months) * 100
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
 * Calculate monthly credit burden breakdown over date range or last N months
 */
export function calcCreditBurdenOverTime(
  credits: CreditRecord[],
  records: FinanceRecord[],
  dateFromOrAsOfDate?: string,
  dateToOrMonths?: string | number,
  asOfDate: string = getTodayStr(),
  defaultMonths: number = OVERVIEW_BURDEN_MONTHS
): CreditBurdenMonth[] {
  let monthsList: string[];

  if (typeof dateToOrMonths === 'number') {
    monthsList = resolveMonthRange(
      undefined,
      undefined,
      dateFromOrAsOfDate ?? asOfDate,
      dateToOrMonths
    );
  } else {
    monthsList = resolveMonthRange(
      dateFromOrAsOfDate,
      dateToOrMonths,
      asOfDate,
      defaultMonths
    );
  }

  return monthsList.map(month => {
    const monthStart = `${month}-01`;
    const monthEnd = addMonthsClamped(monthStart, 1);
    const label = month;

    const monthIncome = records
      .filter(r => r.type === 'income' && !r.isInternal && r.date >= monthStart && r.date < monthEnd)
      .reduce((s, r) => s + r.amount, 0);

    let principal = 0;
    let interest = 0;

    credits.filter(c => c.status === 'active').forEach(c => {
      const monthPayments = (c.payments ?? []).filter(
        p => (p.dueDate >= monthStart && p.dueDate < monthEnd) ||
             (p.paidDate && p.paidDate >= monthStart && p.paidDate < monthEnd)
      );

      if (monthPayments.length > 0) {
        monthPayments.forEach(p => {
          let pPart = p.principalPart;
          let iPart = p.interestPart;
          if (pPart === undefined || iPart === undefined) {
            const breakdown = calculatePaymentBreakdown(
              c.currentAmount ?? c.originalAmount,
              p.amount,
              c.interestRate
            );
            pPart = breakdown.principalPart;
            iPart = breakdown.interestPart;
          }
          principal += pPart ?? 0;
          interest += iPart ?? 0;
        });
      } else if (c.startDate < monthEnd && c.monthlyPayment > 0) {
        const breakdown = calculatePaymentBreakdown(
          c.currentAmount ?? c.originalAmount,
          c.monthlyPayment,
          c.interestRate
        );
        principal += breakdown.principalPart;
        interest += breakdown.interestPart;
      }
    });

    const total = principal + interest;
    const burdenPercent = monthIncome > 0 ? (total / monthIncome) * 100 : null;

    return {
      label,
      principal,
      interest,
      total,
      burdenPercent,
    };
  });
}

export interface AssetLiabilityMonth {
  label: string;
  assets: number;
  liabilities: number;
  net: number;
}

/**
 * Calculate assets and liabilities trend over date range or last N months
 */
export function calcAssetsLiabilitiesOverTime(
  deposits: DepositRecord[],
  exchanges: CurrencyExchange[],
  credits: CreditRecord[],
  debts: DebtRecord[],
  dateFromOrAsOfDate?: string,
  dateToOrMonths?: string | number,
  asOfDate: string = getTodayStr(),
  defaultMonths = 6
): AssetLiabilityMonth[] {
  let monthsList: string[];

  if (typeof dateToOrMonths === 'number') {
    monthsList = resolveMonthRange(
      undefined,
      undefined,
      dateFromOrAsOfDate ?? asOfDate,
      dateToOrMonths
    );
  } else {
    monthsList = resolveMonthRange(
      dateFromOrAsOfDate,
      dateToOrMonths,
      asOfDate,
      defaultMonths
    );
  }

  const today = getTodayStr();

  return monthsList.map(month => {
    const monthStart = `${month}-01`;
    const label = month;
    const checkDate = month === today.slice(0, 7) ? today : monthStart;

    const assets = calcAssets(
      deposits.filter(d => d.status === 'active' && d.startDate <= checkDate),
      exchanges.filter(e => e.date <= checkDate),
      debts.filter(d => d.direction === 'lent' && d.date <= checkDate)
    );

    const activeCreditsPrincipal = credits
      .filter(c => c.status === 'active' && c.startDate <= checkDate)
      .reduce((sum, c) => {
        const remaining = calculateRemainingPrincipal(c);
        return sum + remaining;
      }, 0);

    const borrowedDebts = debts
      .filter(d => d.direction === 'borrowed' && d.date <= checkDate)
      .reduce((s, d) => s + d.amount, 0);

    const liabilities = activeCreditsPrincipal + borrowedDebts;

    return {
      label,
      assets,
      liabilities,
      net: assets - liabilities,
    };
  });
}

export interface SavingsRateMonth {
  label: string;
  income: number;
  expense: number;
  savings: number;
  savingsRate: number; // in percent
}

/**
 * Calculate monthly savings rate (%) = (income - expense) / income * 100
 */
export function calcSavingsRateOverTime(
  records: FinanceRecord[],
  dateFrom?: string,
  dateTo?: string,
  asOfDate: string = getTodayStr(),
  defaultMonths = 6
): SavingsRateMonth[] {
  const monthsList = resolveMonthRange(dateFrom, dateTo, asOfDate, defaultMonths);

  return monthsList.map(month => {
    const monthStart = `${month}-01`;
    const monthEnd = addMonthsClamped(monthStart, 1);

    const monthRecords = records.filter(
      r => !r.isInternal && r.date >= monthStart && r.date < monthEnd
    );
    const income = monthRecords
      .filter(r => r.type === 'income')
      .reduce((s, r) => s + r.amount, 0);
    const expense = monthRecords
      .filter(r => r.type === 'expense')
      .reduce((s, r) => s + r.amount, 0);

    const savings = income - expense;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    return {
      label: month,
      income,
      expense,
      savings,
      savingsRate,
    };
  });
}

export interface DebtBreakdownItem {
  person: string;
  lent: number;       // мне должны
  borrowed: number;   // я должен
  net: number;        // lent - borrowed
}

/**
 * Aggregates debts per person
 */
export function calcDebtsBreakdown(debts: DebtRecord[]): DebtBreakdownItem[] {
  const map = new Map<string, { lent: number; borrowed: number }>();

  debts.forEach(d => {
    const person = d.person.trim() || '—';
    const cur = map.get(person) ?? { lent: 0, borrowed: 0 };
    if (d.direction === 'lent') {
      cur.lent += d.amount;
    } else {
      cur.borrowed += d.amount;
    }
    map.set(person, cur);
  });

  const result: DebtBreakdownItem[] = [];
  map.forEach((val, person) => {
    result.push({
      person,
      lent: val.lent,
      borrowed: val.borrowed,
      net: val.lent - val.borrowed,
    });
  });

  return result.sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.person.localeCompare(b.person));
}

export function filterRecordsByDateRange(
  records: FinanceRecord[],
  dateFrom?: string,
  dateTo?: string,
): FinanceRecord[] {
  return records.filter(r => {
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo && r.date > dateTo) return false;
    return true;
  });
}

export interface BreakdownItem {
  key: string;
  income: number;
  expense: number;
  net: number;
  total: number;
}

export function calcGroupBreakdown(
  records: FinanceRecord[],
  groupBy: OverviewGroupBy,
  emptyLabel = '—',
): BreakdownItem[] {
  const map = new Map<string, { income: number; expense: number }>();

  records.forEach(r => {
    if (r.isInternal) return;
    let key = '';
    if (groupBy === 'category') {
      key = r.category.trim();
    } else if (groupBy === 'tag') {
      key = r.tag.trim();
    } else if (groupBy === 'payer') {
      key = r.payer.trim();
    } else if (groupBy === 'year') {
      key = r.date ? r.date.slice(0, 4) : emptyLabel;
    } else if (groupBy === 'month') {
      key = r.date ? r.date.slice(0, 7) : emptyLabel;
    } else if (groupBy === 'week') {
      key = r.date ? getISOWeekString(r.date) : emptyLabel;
    }
    if (!key) key = emptyLabel;

    const existing = map.get(key) ?? { income: 0, expense: 0 };
    if (r.type === 'income') {
      existing.income += r.amount;
    } else {
      existing.expense += r.amount;
    }
    map.set(key, existing);
  });

  const items: BreakdownItem[] = [];
  map.forEach(({ income, expense }, key) => {
    items.push({
      key,
      income,
      expense,
      net: income - expense,
      total: income + expense,
    });
  });

  if (groupBy === 'year' || groupBy === 'month' || groupBy === 'week') {
    return items.sort((a, b) => b.key.localeCompare(a.key));
  }

  return items.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}
