import {
  FinanceRecord, DebtRecord, CreditRecord, DepositRecord, CurrencyExchange,
  PERCENT_100, OVERVIEW_UPCOMING_DAYS, OVERVIEW_BURDEN_MONTHS,
} from '../types';
import { getDebtRemaining } from './debtCalculations';
import { calculateRemainingPrincipal } from './creditCalculations';
import { getCurrencyBalances } from './currencyBalance';
import { parseDateStr } from './dateMath';
import { round2, sumMoney } from './money';

function addDaysToDateStr(dateStr: string, days: number): string {
  const p = parseDateStr(dateStr);
  if (!p) return dateStr;
  const ms = Date.UTC(p.year, p.month - 1, p.day + days);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function calcNetBalance(records: FinanceRecord[]): number {
  let sum = 0;
  for (const r of records) {
    if (r.isInternal === true) continue;
    if (r.type === 'income') sum += r.amount;
    else sum -= r.amount;
  }
  return round2(sum);
}

export function calcAssets(
  deposits: DepositRecord[],
  exchanges: CurrencyExchange[],
  debts: DebtRecord[],
): number {
  const depositTotal = sumMoney(deposits.filter(d => d.status === 'active').map(d => d.amount));
  const balances = getCurrencyBalances(exchanges);
  let currencyTotal = 0;
  balances.forEach(metrics => {
    if (metrics.balance > 0) currencyTotal += metrics.balance * metrics.averageBuyRate;
  });
  const lentTotal = sumMoney(
    debts.filter(d => d.direction === 'lent').map(d => getDebtRemaining(d)),
  );
  return round2(depositTotal + currencyTotal + lentTotal);
}

export function calcLiabilities(credits: CreditRecord[], debts: DebtRecord[]): number {
  const creditTotal = sumMoney(
    credits.filter(c => c.status === 'active').map(c => calculateRemainingPrincipal(c)),
  );
  const debtTotal = sumMoney(
    debts.filter(d => d.direction === 'borrowed').map(d => getDebtRemaining(d)),
  );
  return round2(creditTotal + debtTotal);
}

export function calcCreditBurden(
  credits: CreditRecord[],
  records: FinanceRecord[],
  today: string,
): number | null {
  const monthlyBurden = sumMoney(
    credits.filter(c => c.status === 'active').map(c => c.monthlyPayment),
  );
  const todayParsed = parseDateStr(today);
  if (!todayParsed) return null;
  const monthKeys: string[] = [];
  for (let i = 1; i <= OVERVIEW_BURDEN_MONTHS; i++) {
    const totalM = todayParsed.year * 12 + (todayParsed.month - 1) - i;
    const y = Math.floor(totalM / 12);
    const m = totalM - y * 12 + 1;
    monthKeys.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
  }
  let totalIncome = 0;
  for (const r of records) {
    if (r.isInternal === true || r.type !== 'income') continue;
    if (monthKeys.includes(r.date.slice(0, 7))) totalIncome += r.amount;
  }
  const avg = round2(totalIncome / OVERVIEW_BURDEN_MONTHS);
  if (avg <= 0) return null;
  return round2((monthlyBurden / avg) * PERCENT_100);
}

export function calcUpcomingPayments(
  credits: CreditRecord[],
  debts: DebtRecord[],
  today: string,
): number {
  const deadline = addDaysToDateStr(today, OVERVIEW_UPCOMING_DAYS);
  let sum = 0;
  for (const c of credits) {
    for (const p of c.payments) {
      if (p.status === 'pending' && p.dueDate >= today && p.dueDate <= deadline)
        sum += p.amount;
    }
  }
  for (const d of debts) {
    if (!d.dueDate || d.dueDate < today || d.dueDate > deadline) continue;
    const remaining = getDebtRemaining(d);
    if (remaining > 0) sum += remaining;
  }
  return round2(sum);
}
