/**
 * Balance metrics: Net balance, assets, liabilities, credit burden, upcoming payments
 */
import type { FinanceRecord, DebtRecord, CreditRecord, DepositRecord, CurrencyExchange } from '../../types';
import { OVERVIEW_UPCOMING_DAYS, OVERVIEW_BURDEN_MONTHS } from '../../types';
import { addMonthsClamped, addDays } from '../dateMath';
import { calculateRemainingPrincipal } from '../creditCalculations';
import { RecordType, DebtDirection, CreditStatus, DepositStatus, PaymentStatus } from '../../constants';
import { isFutureTransaction } from '../records';
import { getCurrencyBalances } from '../currencyBalance';
import { getDepositCurrentAmount } from '../depositCalculations';
import { getDebtAmountAsOf } from '../debtCalculations';

/**
 * Net balance = sum(income) - sum(expense), excluding isInternal and future records
 */
export function calcNetBalance(records: FinanceRecord[], now = new Date()): number {
  return records.reduce((sum, r) => {
    if (r.isInternal || isFutureTransaction(r, now)) return sum;
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
  now = new Date(),
): number {
  const depositSum = deposits
    .filter(d => d.status === DepositStatus.ACTIVE)
    .reduce((s, d) => s + getDepositCurrentAmount(d, now), 0);

  const currencyMap = getCurrencyBalances(exchanges, now);
  let exchangeSum = 0;
  currencyMap.forEach(m => {
    if (m.balance > 0) {
      const val = m.valueInAccountCurrency > 0
        ? m.valueInAccountCurrency
        : m.balance * (m.averageBuyRate > 0 ? m.averageBuyRate : 1);
      exchangeSum += val;
    }
  });

  const lentDebts = debts
    .filter(d => d.direction === DebtDirection.LENT)
    .reduce((s, d) => s + getDebtAmountAsOf(d, now), 0);

  return depositSum + exchangeSum + lentDebts;
}

/**
 * Total liabilities = sum of active credits remaining principal + borrowed debts (money I owe others)
 */
export function calcLiabilities(
  credits: CreditRecord[],
  debts: DebtRecord[],
  now = new Date(),
): number {
  const creditPrincipal = credits
    .filter(c => c.status === CreditStatus.ACTIVE)
    .reduce((sum, c) => {
      const remaining = calculateRemainingPrincipal(c);
      return sum + remaining;
    }, 0);

  const borrowedDebts = debts
    .filter(d => d.direction === DebtDirection.BORROWED)
    .reduce((s, d) => s + getDebtAmountAsOf(d, now), 0);

  return creditPrincipal + borrowedDebts;
}

/**
 * Credit burden % = (monthly payments on active credits / avg monthly income over last 3 months) * 100
 */
export function calcCreditBurden(
  credits: CreditRecord[],
  incomeRecords: FinanceRecord[],
  asOfDate: string,
  now = new Date(),
): number | null {
  const startDate = addMonthsClamped(asOfDate, -OVERVIEW_BURDEN_MONTHS);
  const relevantIncome = incomeRecords.filter(r =>
    r.type === RecordType.INCOME && !r.isInternal && !isFutureTransaction(r, now) && r.date >= startDate && r.date <= asOfDate
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
  now = new Date(),
): number {
  const endDate = addDays(asOfDate, OVERVIEW_UPCOMING_DAYS);

  const creditPayments = credits
    .filter(c => c.status === CreditStatus.ACTIVE)
    .flatMap(c => c.payments)
    .filter(p => p.status === PaymentStatus.PENDING && p.dueDate >= asOfDate && p.dueDate <= endDate)
    .reduce((s, p) => s + p.amount, 0);

  const debtPayments = debts
    .filter(d => d.direction === DebtDirection.BORROWED && d.dueDate >= asOfDate && d.dueDate <= endDate)
    .reduce((s, d) => s + getDebtAmountAsOf(d, now), 0);

  return creditPayments + debtPayments;
}
