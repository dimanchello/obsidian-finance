import { describe, it, expect } from 'vitest';
import { getCurrencyBalance, getCurrencyBalances, getCurrencyHistory } from '../domain/currencyBalance';
import { CurrencyExchange, CurrencyOperationType } from '../types';

function createMockExchange(overrides: Partial<CurrencyExchange> = {}): CurrencyExchange {
  return {
    id: 'ex-1',
    createdAt: 1000,
    date: '2026-01-01',
    time: '12:00',
    type: CurrencyOperationType.BUY,
    amountInAccountCurrency: 10000,
    targetCurrency: 'USD',
    targetAmount: 100,
    exchangeRate: 100,
    provider: 'Банк',
    note: '',
    ...overrides,
  };
}

describe('getCurrencyBalance', () => {
  it('returns 0 for empty exchange list', () => {
    expect(getCurrencyBalance([], 'USD')).toBe(0);
  });

  it('calculates balance for buy and add operations', () => {
    const exchanges: CurrencyExchange[] = [
      createMockExchange({ id: '1', type: CurrencyOperationType.BUY, targetCurrency: 'USD', targetAmount: 150 }),
      createMockExchange({ id: '2', type: CurrencyOperationType.ADD, targetCurrency: 'USD', targetAmount: 50 }),
      createMockExchange({ id: '3', type: CurrencyOperationType.BUY, targetCurrency: 'EUR', targetAmount: 200 }),
    ];
    expect(getCurrencyBalance(exchanges, 'USD')).toBe(200);
    expect(getCurrencyBalance(exchanges, 'EUR')).toBe(200);
  });

  it('subtracts sell and spend operations correctly', () => {
    const exchanges: CurrencyExchange[] = [
      createMockExchange({ id: '1', type: CurrencyOperationType.BUY, targetCurrency: 'USD', targetAmount: 500 }),
      createMockExchange({ id: '2', type: CurrencyOperationType.SELL, targetCurrency: 'USD', targetAmount: 200 }),
      createMockExchange({ id: '3', type: CurrencyOperationType.SPEND, targetCurrency: 'USD', targetAmount: 50 }),
    ];
    expect(getCurrencyBalance(exchanges, 'USD')).toBe(250);
  });

  it('handles fractional amounts without precision loss', () => {
    const exchanges: CurrencyExchange[] = [
      createMockExchange({ id: '1', type: CurrencyOperationType.BUY, targetCurrency: 'BTC', targetAmount: 0.123456 }),
      createMockExchange({ id: '2', type: CurrencyOperationType.SPEND, targetCurrency: 'BTC', targetAmount: 0.023456 }),
    ];
    expect(getCurrencyBalance(exchanges, 'BTC')).toBe(0.1);
  });
});

describe('getCurrencyBalances', () => {
  it('calculates comprehensive metrics per currency', () => {
    const exchanges: CurrencyExchange[] = [
      // Buy 100 USD for 9,000 RUB (rate = 90)
      createMockExchange({ id: '1', type: CurrencyOperationType.BUY, targetCurrency: 'USD', targetAmount: 100, amountInAccountCurrency: 9000, exchangeRate: 90 }),
      // Buy 100 USD for 10,000 RUB (rate = 100)
      createMockExchange({ id: '2', type: CurrencyOperationType.BUY, targetCurrency: 'USD', targetAmount: 100, amountInAccountCurrency: 10000, exchangeRate: 100 }),
      // Add 50 USD directly
      createMockExchange({ id: '3', type: CurrencyOperationType.ADD, targetCurrency: 'USD', targetAmount: 50 }),
      // Sell 50 USD
      createMockExchange({ id: '4', type: CurrencyOperationType.SELL, targetCurrency: 'USD', targetAmount: 50 }),
      // Spend 20 USD
      createMockExchange({ id: '5', type: CurrencyOperationType.SPEND, targetCurrency: 'USD', targetAmount: 20 }),

      // Buy 200 EUR for 22,000 RUB (rate = 110)
      createMockExchange({ id: '6', type: CurrencyOperationType.BUY, targetCurrency: 'EUR', targetAmount: 200, amountInAccountCurrency: 22000, exchangeRate: 110 }),
    ];

    const balances = getCurrencyBalances(exchanges);

    expect(balances.size).toBe(2);

    const usd = balances.get('USD')!;
    expect(usd).toBeDefined();
    // Balance: 100 + 100 + 50 - 50 - 20 = 180
    expect(usd.balance).toBe(180);
    expect(usd.totalBought).toBe(200);
    expect(usd.totalAdded).toBe(50);
    expect(usd.totalSold).toBe(50);
    expect(usd.totalSpent).toBe(20);
    // Average buy rate: (9000 + 10000) / 200 = 95
    expect(usd.averageBuyRate).toBe(95);
    // Value in account currency: 180 * 95 = 17100
    expect(usd.valueInAccountCurrency).toBe(17100);

    const eur = balances.get('EUR')!;
    expect(eur).toBeDefined();
    expect(eur.balance).toBe(200);
    expect(eur.totalBought).toBe(200);
    expect(eur.averageBuyRate).toBe(110);
    expect(eur.valueInAccountCurrency).toBe(22000);
  });

  it('handles currency with only add operations (0 average buy rate)', () => {
    const exchanges: CurrencyExchange[] = [
      createMockExchange({ id: '1', type: CurrencyOperationType.ADD, targetCurrency: 'USDT', targetAmount: 500 }),
    ];

    const balances = getCurrencyBalances(exchanges);
    const usdt = balances.get('USDT')!;
    expect(usdt.balance).toBe(500);
    expect(usdt.totalBought).toBe(0);
    expect(usdt.averageBuyRate).toBe(0);
    expect(usdt.valueInAccountCurrency).toBe(0);
  });
});

describe('getCurrencyHistory', () => {
  it('computes chronological running balance for target currency', () => {
    const exchanges: CurrencyExchange[] = [
      createMockExchange({ id: '1', type: CurrencyOperationType.BUY, targetCurrency: 'USD', targetAmount: 100, date: '2026-01-01' }),
      createMockExchange({ id: '2', type: CurrencyOperationType.BUY, targetCurrency: 'EUR', targetAmount: 500, date: '2026-01-02' }),
      createMockExchange({ id: '3', type: CurrencyOperationType.ADD, targetCurrency: 'USD', targetAmount: 50, date: '2026-01-03' }),
      createMockExchange({ id: '4', type: CurrencyOperationType.SELL, targetCurrency: 'USD', targetAmount: 30, date: '2026-01-04' }),
      createMockExchange({ id: '5', type: CurrencyOperationType.SPEND, targetCurrency: 'USD', targetAmount: 20, date: '2026-01-05' }),
    ];

    const usdHistory = getCurrencyHistory(exchanges, 'USD');
    expect(usdHistory).toHaveLength(4);
    expect(usdHistory[0].runningBalance).toBe(100);
    expect(usdHistory[1].runningBalance).toBe(150);
    expect(usdHistory[2].runningBalance).toBe(120);
    expect(usdHistory[3].runningBalance).toBe(100);
  });
});
