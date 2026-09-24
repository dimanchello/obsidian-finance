/**
 * Balance metrics: Net balance, assets, liabilities, credit burden, upcoming payments
 */
import type { FinanceRecord, DebtRecord, CreditRecord, DepositRecord, CurrencyExchange } from '../../types';
import { OVERVIEW_UPCOMING_DAYS, OVERVIEW_BURDEN_MONTHS } from '../../types';
import { addMonthsClamped, parseDateStr } from '../dateMath';
import { calculateRemainingPrincipal } from '../creditCalculations';
import { RecordType, DebtDirection, CreditStatus, DepositStatus, PaymentStatus } from '../../constants';

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
