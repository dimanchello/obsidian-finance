import { CurrencyExchange, CURRENCY_ROUNDING_PRECISION, CurrencyOperationType } from '../types';

export function getCurrencyBalance(exchanges: CurrencyExchange[], currency: string): number {
  const balance = exchanges
    .filter(e => e.targetCurrency === currency)
    .reduce((sum, e) => {
      if (e.type === CurrencyOperationType.BUY || e.type === CurrencyOperationType.ADD) return sum + e.targetAmount;
      if (e.type === CurrencyOperationType.SELL || e.type === CurrencyOperationType.SPEND) return sum - e.targetAmount;
      return sum;
    }, 0);

  return Math.round(balance * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION;
}

export interface CurrencyBalanceMetrics {
  balance: number;
  totalBought: number;
  totalAdded: number;
  totalSold: number;
  totalSpent: number;
  averageBuyRate: number;
  valueInAccountCurrency: number;
}

export function getCurrencyBalances(exchanges: CurrencyExchange[]): Map<string, CurrencyBalanceMetrics> {
  const currencies = new Set(exchanges.map(e => e.targetCurrency));
  const result = new Map<string, CurrencyBalanceMetrics>();
  
  for (const currency of currencies) {
    const ops = exchanges.filter(e => e.targetCurrency === currency);
    const buys = ops.filter(e => e.type === CurrencyOperationType.BUY);
    const adds = ops.filter(e => e.type === CurrencyOperationType.ADD);
    const sells = ops.filter(e => e.type === CurrencyOperationType.SELL);
    const spends = ops.filter(e => e.type === CurrencyOperationType.SPEND);
    
    const totalBought = buys.reduce((sum, e) => sum + e.targetAmount, 0);
    const totalAdded = adds.reduce((sum, e) => sum + e.targetAmount, 0);
    const totalSold = sells.reduce((sum, e) => sum + e.targetAmount, 0);
    const totalSpent = spends.reduce((sum, e) => sum + e.targetAmount, 0);
    const balance = Math.round((totalBought + totalAdded - totalSold - totalSpent) * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION;

    // Weighted average buy rate (only buy operations)
    const totalSpentOnBuys = buys.reduce((sum, e) => sum + e.amountInAccountCurrency, 0);
    const averageBuyRate = totalBought > 0 ? totalSpentOnBuys / totalBought : 0;

    // Value estimation
    const valueInAccountCurrency = balance * averageBuyRate;

    result.set(currency, {
      balance,
      totalBought: Math.round(totalBought * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION,
      totalAdded: Math.round(totalAdded * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION,
      totalSold: Math.round(totalSold * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION,
      totalSpent: Math.round(totalSpent * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION,
      averageBuyRate,
      valueInAccountCurrency
    });
  }
  
  return result;
}

/**
 * Returns a list of exchanges with a running balance for the target currency at the time of each operation.
 * Assumes the list of exchanges is sorted chronologically (oldest first).
 */
export function getCurrencyHistory(exchanges: CurrencyExchange[], currency: string): (CurrencyExchange & { runningBalance: number })[] {
  const ops = exchanges.filter(e => e.targetCurrency === currency);
  let currentBalance = 0;
  
  return ops.map(e => {
    if (e.type === CurrencyOperationType.BUY || e.type === CurrencyOperationType.ADD) {
      currentBalance += e.targetAmount;
    } else if (e.type === CurrencyOperationType.SELL || e.type === CurrencyOperationType.SPEND) {
      currentBalance -= e.targetAmount;
    }

    return {
      ...e,
      runningBalance: Math.round(currentBalance * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION,
    };
  });
}
