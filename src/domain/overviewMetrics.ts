import type {
  FinanceRecord,
  DebtRecord,
  CreditRecord,
  DepositRecord,
  CurrencyExchange,
  OverviewGroupBy,
} from '../types';
import { OVERVIEW_UPCOMING_DAYS, OVERVIEW_BURDEN_MONTHS, OVERVIEW_TREND_MONTHS, OVERVIEW_MAX_TREND_MONTHS } from '../types';
import { addMonthsClamped, parseDateStr, isoWeek, MS_PER_DAY, MONTHS_IN_YEAR } from './dateMath';
import { calculateRemainingPrincipal, calculatePaymentBreakdown } from './creditCalculations';
import { getDebtRepaid, getDebtWithInterest } from './debtCalculations';
import { getTodayStr } from '../utils';
import {
  RecordType, DebtDirection, CreditStatus, DepositStatus, PaymentStatus,
  DepositType, DepositAccrualType,
} from '../constants';

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
  const iso = isoWeek(dateStr);
  if (!iso) return dateStr;
  return `${iso.year}-W${String(iso.week).padStart(2, '0')}`;
}

/**
 * Sentinel span: "all time" is a real selection, distinct from "no filter chosen yet".
 * Both arrive as empty date strings, so callers pass this to say which one they mean.
 */
export const ALL_TIME_MONTHS = 0;

/** Clamps an all-time span so one stray far-past date cannot produce hundreds of columns. */
function clampMonthSpan(startMonth: string, endMonth: string): string {
  const spanMonths = monthsBetween(startMonth, endMonth);
  if (spanMonths <= OVERVIEW_MAX_TREND_MONTHS) return startMonth;
  return addMonthsClamped(`${endMonth}-01`, -OVERVIEW_MAX_TREND_MONTHS).slice(0, 7);
}

function monthsBetween(startMonth: string, endMonth: string): number {
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  if (sy === undefined || sm === undefined || ey === undefined || em === undefined) return 0;
  return (ey - sy) * MONTHS_IN_YEAR + (em - sm);
}

export function resolveMonthRange(
  dateFrom?: string,
  dateTo?: string,
  asOfDate: string = getTodayStr(),
  defaultMonths = 6,
  allTimeEarliestDate?: string
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
  } else if (defaultMonths === ALL_TIME_MONTHS) {
    // "All time": span the data itself, not a rolling window.
    endMonth = asOfDate.slice(0, 7);
    const earliest = allTimeEarliestDate ? allTimeEarliestDate.slice(0, 7) : endMonth;
    startMonth = earliest < endMonth ? clampMonthSpan(earliest, endMonth) : endMonth;
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
    return sum + (r.type === RecordType.INCOME ? r.amount : -r.amount);
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
    .filter(d => d.status === DepositStatus.ACTIVE)
    .reduce((s, d) => s + d.amount, 0);

  const exchangeSum = exchanges.reduce((s, e) => {
    const rate = typeof e.exchangeRate === 'number' ? e.exchangeRate : 1;
    const targetAmt = typeof e.targetAmount === 'number' ? e.targetAmount : 0;
    const val = targetAmt > 0 ? targetAmt * rate : 0;
    return s + val;
  }, 0);

  const lentDebts = debts
    .filter(d => d.direction === DebtDirection.LENT)
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
    .filter(c => c.status === CreditStatus.ACTIVE)
    .reduce((sum, c) => {
      const remaining = calculateRemainingPrincipal(c);
      return sum + remaining;
    }, 0);

  const borrowedDebts = debts
    .filter(d => d.direction === DebtDirection.BORROWED)
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
    r.type === RecordType.INCOME && !r.isInternal && r.date >= startDate && r.date <= asOfDate
  );

  if (relevantIncome.length === 0) return null;

  const totalIncome = relevantIncome.reduce((s, r) => s + r.amount, 0);
  const avgMonthlyIncome = totalIncome / OVERVIEW_BURDEN_MONTHS;

  const monthlyBurden = credits
    .filter(c => c.status === CreditStatus.ACTIVE)
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
    .filter(c => c.status === CreditStatus.ACTIVE)
    .flatMap(c => c.payments)
    .filter(p => p.status === PaymentStatus.PENDING && p.dueDate >= asOfDate && p.dueDate <= endDate)
    .reduce((s, p) => s + p.amount, 0);

  const debtPayments = debts
    .filter(d => d.direction === DebtDirection.BORROWED && d.dueDate >= asOfDate && d.dueDate <= endDate)
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
    if (r.type === RecordType.INCOME) {
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

/** Earliest non-empty `YYYY-MM-DD` across the given lists, or '' when they hold no dates. */
function earliestDate(...dateLists: string[][]): string {
  let earliest = '';
  dateLists.forEach(list => {
    list.forEach(d => {
      if (!d) return;
      if (!earliest || d < earliest) earliest = d;
    });
  });
  return earliest;
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
  const allTimeStart = earliestDate(
    credits.map(c => c.startDate),
    records.map(r => r.date)
  );

  if (typeof dateToOrMonths === 'number') {
    monthsList = resolveMonthRange(
      undefined,
      undefined,
      dateFromOrAsOfDate ?? asOfDate,
      dateToOrMonths,
      allTimeStart
    );
  } else {
    monthsList = resolveMonthRange(
      dateFromOrAsOfDate,
      dateToOrMonths,
      asOfDate,
      defaultMonths,
      allTimeStart
    );
  }

  return monthsList.map(month => {
    const monthStart = `${month}-01`;
    const monthEnd = addMonthsClamped(monthStart, 1);
    const label = month;

    const monthIncome = records
      .filter(r => r.type === RecordType.INCOME && !r.isInternal && r.date >= monthStart && r.date < monthEnd)
      .reduce((s, r) => s + r.amount, 0);

    let principal = 0;
    let interest = 0;

    credits.filter(c => c.status === CreditStatus.ACTIVE).forEach(c => {
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
  const allTimeStart = earliestDate(
    deposits.map(d => d.startDate),
    exchanges.map(e => e.date),
    credits.map(c => c.startDate),
    debts.map(d => d.date)
  );

  if (typeof dateToOrMonths === 'number') {
    monthsList = resolveMonthRange(
      undefined,
      undefined,
      dateFromOrAsOfDate ?? asOfDate,
      dateToOrMonths,
      allTimeStart
    );
  } else {
    monthsList = resolveMonthRange(
      dateFromOrAsOfDate,
      dateToOrMonths,
      asOfDate,
      defaultMonths,
      allTimeStart
    );
  }

  const today = getTodayStr();

  return monthsList.map(month => {
    const monthStart = `${month}-01`;
    const label = month;
    const checkDate = month === today.slice(0, 7) ? today : monthStart;

    const assets = calcAssets(
      deposits.filter(d => d.status === DepositStatus.ACTIVE && d.startDate <= checkDate),
      exchanges.filter(e => e.date <= checkDate),
      debts.filter(d => d.direction === DebtDirection.LENT && d.date <= checkDate)
    );

    const activeCreditsPrincipal = credits
      .filter(c => c.status === CreditStatus.ACTIVE && c.startDate <= checkDate)
      .reduce((sum, c) => {
        const remaining = calculateRemainingPrincipal(c);
        return sum + remaining;
      }, 0);

    const borrowedDebts = debts
      .filter(d => d.direction === DebtDirection.BORROWED && d.date <= checkDate)
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
  const monthsList = resolveMonthRange(
    dateFrom,
    dateTo,
    asOfDate,
    defaultMonths,
    earliestDate(records.filter(r => !r.isInternal).map(r => r.date))
  );

  return monthsList.map(month => {
    const monthStart = `${month}-01`;
    const monthEnd = addMonthsClamped(monthStart, 1);

    const monthRecords = records.filter(
      r => !r.isInternal && r.date >= monthStart && r.date < monthEnd
    );
    const income = monthRecords
      .filter(r => r.type === RecordType.INCOME)
      .reduce((s, r) => s + r.amount, 0);
    const expense = monthRecords
      .filter(r => r.type === RecordType.EXPENSE)
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
  lent: number;       // мне должны (текущий остаток)
  lentTotal: number;  // начальная сумма долга
  lentRepaid: number; // сколько уже возвращено
  lentRepaidPct: number; // % возврата (0–100)
  borrowed: number;   // я должен (текущий остаток)
  borrowedTotal: number; // начальная сумма
  borrowedRepaid: number; // сколько уже выплачено
  borrowedRepaidPct: number; // % возврата (0–100)
  net: number;        // lent - borrowed
}

/**
 * Aggregates debts per person with repayment progress
 */
export function calcDebtsBreakdown(debts: DebtRecord[]): DebtBreakdownItem[] {
  const map = new Map<
    string,
    {
      lent: number;
      lentTotal: number;
      lentRepaid: number;
      borrowed: number;
      borrowedTotal: number;
      borrowedRepaid: number;
    }
  >();

  debts.forEach(d => {
    const person = d.person.trim() || '—';
    const cur = map.get(person) ?? {
      lent: 0,
      lentTotal: 0,
      lentRepaid: 0,
      borrowed: 0,
      borrowedTotal: 0,
      borrowedRepaid: 0,
    };

    const repaid = getDebtRepaid(d);
    const withInterest = getDebtWithInterest(d);
    const total = withInterest > 0 ? withInterest : (d.originalAmount || d.amount);

    if (d.direction === DebtDirection.LENT) {
      cur.lent += d.amount;
      cur.lentTotal += total;
      cur.lentRepaid += repaid;
    } else {
      cur.borrowed += d.amount;
      cur.borrowedTotal += total;
      cur.borrowedRepaid += repaid;
    }
    map.set(person, cur);
  });

  const result: DebtBreakdownItem[] = [];
  map.forEach((val, person) => {
    const lentRepaidPct =
      val.lentTotal > 0
        ? Math.min(100, Math.max(0, Math.round((val.lentRepaid / val.lentTotal) * 100)))
        : 0;
    const borrowedRepaidPct =
      val.borrowedTotal > 0
        ? Math.min(100, Math.max(0, Math.round((val.borrowedRepaid / val.borrowedTotal) * 100)))
        : 0;

    result.push({
      person,
      lent: val.lent,
      lentTotal: val.lentTotal,
      lentRepaid: val.lentRepaid,
      lentRepaidPct,
      borrowed: val.borrowed,
      borrowedTotal: val.borrowedTotal,
      borrowedRepaid: val.borrowedRepaid,
      borrowedRepaidPct,
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
    if (r.type === RecordType.INCOME) {
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

export interface DepositInterestSegment {
  depositId: string;
  depositName: string;
  bankName: string;
  amount: number;
  status: PaymentStatus;
}

export interface DepositInterestMonth {
  monthKey: string;
  label: string;
  paidInterest: number;
  pendingInterest: number;
  total: number;
  cumulativeTotal: number;
  segments: DepositInterestSegment[];
}

export function resolveDepositMonthRange(
  deposits: DepositRecord[],
  dateFrom?: string,
  dateTo?: string,
  asOfDate: string = getTodayStr(),
  defaultMonths = OVERVIEW_TREND_MONTHS
): string[] {
  let startMonth: string;
  let endMonth: string;

  const allAccrualDates: string[] = [];
  deposits.forEach(d => {
    (d.accruals ?? []).forEach(a => {
      if (a.paidDate) allAccrualDates.push(a.paidDate);
      if (a.dueDate) allAccrualDates.push(a.dueDate);
    });
  });
  allAccrualDates.sort();

  const earliest = allAccrualDates[0];
  const latest = allAccrualDates[allAccrualDates.length - 1];
  const earliestAccrual = earliest ? earliest.slice(0, 7) : '';
  const latestAccrual = latest ? latest.slice(0, 7) : '';
  const asOfCurMonth = asOfDate.slice(0, 7);
  const halfMonths = Math.floor(defaultMonths / 2);

  if (dateFrom && dateTo) {
    startMonth = dateFrom.slice(0, 7);
    endMonth = dateTo.slice(0, 7);
  } else if (dateFrom) {
    startMonth = dateFrom.slice(0, 7);
    const fallbackEnd = addMonthsClamped(`${asOfCurMonth}-01`, halfMonths).slice(0, 7);
    endMonth = latestAccrual && latestAccrual > asOfCurMonth ? latestAccrual : fallbackEnd;
  } else if (dateTo) {
    endMonth = dateTo.slice(0, 7);
    const fallbackStart = addMonthsClamped(`${asOfCurMonth}-01`, -halfMonths).slice(0, 7);
    startMonth = earliestAccrual && earliestAccrual < asOfCurMonth ? earliestAccrual : fallbackStart;
  } else if (defaultMonths === ALL_TIME_MONTHS) {
    // "All time": span every accrual, past and scheduled, instead of a window around today.
    endMonth = latestAccrual > asOfCurMonth ? latestAccrual : asOfCurMonth;
    startMonth = earliestAccrual ? clampMonthSpan(earliestAccrual, endMonth) : asOfCurMonth;
  } else {
    const fallbackStart = addMonthsClamped(`${asOfCurMonth}-01`, -halfMonths).slice(0, 7);
    const fallbackEnd = addMonthsClamped(`${asOfCurMonth}-01`, halfMonths).slice(0, 7);
    startMonth = earliestAccrual && earliestAccrual < fallbackStart ? earliestAccrual : fallbackStart;
    endMonth = latestAccrual && latestAccrual > fallbackEnd ? latestAccrual : fallbackEnd;
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

export function calcDepositInterestOverTime(
  deposits: DepositRecord[],
  dateFromOrAsOfDate?: string,
  dateToOrMonths?: string | number,
  asOfDate: string = getTodayStr(),
  defaultMonths: number = OVERVIEW_TREND_MONTHS
): DepositInterestMonth[] {
  let monthsList: string[];

  if (typeof dateToOrMonths === 'number') {
    monthsList = resolveDepositMonthRange(
      deposits,
      undefined,
      undefined,
      dateFromOrAsOfDate ?? asOfDate,
      dateToOrMonths
    );
  } else {
    monthsList = resolveDepositMonthRange(
      deposits,
      dateFromOrAsOfDate,
      dateToOrMonths,
      asOfDate,
      defaultMonths
    );
  }

  let runningCumulative = 0;

  return monthsList.map(month => {
    const monthStart = `${month}-01`;
    const monthEnd = addMonthsClamped(monthStart, 1);
    const label = month;

    let paidInterest = 0;
    let pendingInterest = 0;
    const segments: DepositInterestSegment[] = [];

    deposits.forEach(d => {
      (d.accruals ?? []).forEach(a => {
        const accrualDate = a.dueDate;
        if (accrualDate >= monthStart && accrualDate < monthEnd) {
          if (a.status === PaymentStatus.PAID) {
            paidInterest += a.amount;
          } else {
            pendingInterest += a.amount;
          }
          segments.push({
            depositId: d.id,
            depositName: d.name || d.bankName || '—',
            bankName: d.bankName || '—',
            amount: a.amount,
            status: a.status,
          });
        }
      });
    });

    const monthTotal = paidInterest + pendingInterest;
    runningCumulative += monthTotal;

    return {
      monthKey: month,
      label,
      paidInterest,
      pendingInterest,
      total: monthTotal,
      cumulativeTotal: runningCumulative,
      segments,
    };
  });
}

export interface ActiveDepositProgress {
  id: string;
  name: string;
  bankName: string;
  amount: number;
  interestRate: number;
  startDate: string;
  endDate: string;
  isDemand: boolean;
  accrualType: DepositAccrualType;
  progressPercent: number;
  /** Interest already paid out (PAID accruals). */
  accruedProfit: number;
  /** Interest still scheduled but not yet paid (PENDING accruals). */
  pendingProfit: number;
  /** Lifetime interest across the whole term: accrued + pending. */
  totalProfit: number;
  totalEstimatedReturn: number;
  remainingDays: number | null;
  nextAccrualDate: string | null;
  nextAccrualAmount: number | null;
}

export function calcActiveDepositsProgress(
  deposits: DepositRecord[],
  asOfDate: string = getTodayStr()
): ActiveDepositProgress[] {
  const active = deposits.filter(d => d.status === DepositStatus.ACTIVE);
  const nowMs = new Date(asOfDate).getTime();

  return active.map(d => {
    const isDemand = d.type === DepositType.DEMAND || !d.termMonths || d.termMonths <= 0;
    let endDate = '';
    let progressPercent = 100;
    let remainingDays: number | null = null;

    if (!isDemand && d.startDate) {
      try {
        endDate = addMonthsClamped(d.startDate, d.termMonths);
        const startMs = new Date(d.startDate).getTime();
        const endMs = new Date(endDate).getTime();
        const totalMs = endMs - startMs;
        if (totalMs > 0) {
          progressPercent = Math.min(100, Math.max(0, ((nowMs - startMs) / totalMs) * 100));
        }
        const diffDays = Math.ceil((endMs - nowMs) / MS_PER_DAY);
        remainingDays = Math.max(0, diffDays);
      } catch {
        endDate = '';
        progressPercent = 100;
        remainingDays = null;
      }
    }

    const paidProfit = (d.accruals ?? [])
      .filter(a => a.status === PaymentStatus.PAID)
      .reduce((s, a) => s + a.amount, 0);

    const totalProfit = (d.accruals ?? []).reduce((s, a) => s + a.amount, 0);
    const accruedProfit = paidProfit;
    const pendingProfit = totalProfit - paidProfit;
    const totalEstimatedReturn = d.amount + totalProfit;

    const pendingAccruals = (d.accruals ?? [])
      .filter(a => a.status === PaymentStatus.PENDING && a.dueDate >= asOfDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const nextAccrual = pendingAccruals[0];
    const nextAccrualDate = nextAccrual ? nextAccrual.dueDate : null;
    const nextAccrualAmount = nextAccrual ? nextAccrual.amount : null;

    return {
      id: d.id,
      name: d.name || d.bankName || '—',
      bankName: d.bankName || '—',
      amount: d.amount,
      interestRate: d.interestRate,
      startDate: d.startDate,
      endDate,
      isDemand,
      accrualType: d.accrualType ?? DepositAccrualType.TO_ACCOUNT,
      progressPercent,
      accruedProfit,
      pendingProfit,
      totalProfit,
      totalEstimatedReturn,
      remainingDays,
      nextAccrualDate,
      nextAccrualAmount,
    };
  });
}


