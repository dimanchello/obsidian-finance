import { describe, it, expect } from 'vitest';
import { getDaysBetween } from '../utils';
import { DAYS_IN_YEAR, ACCRUAL_STEP_MONTHLY } from '../types';

describe('getDaysBetween', () => {
  it('same date returns 0', () => {
    expect(getDaysBetween('2024-01-15', '2024-01-15')).toBe(0);
  });

  it('consecutive days returns 1', () => {
    expect(getDaysBetween('2024-01-15', '2024-01-16')).toBe(1);
  });

  it('cross-month dates returns 31', () => {
    expect(getDaysBetween('2024-01-01', '2024-02-01')).toBe(31);
  });

  it('full year returns 365', () => {
    expect(getDaysBetween('2024-01-01', '2025-01-01')).toBe(366);
  });

  it('31 days in 30-day month', () => {
    expect(getDaysBetween('2024-06-07', '2024-07-08')).toBe(31);
  });

  it('30 days in 31-day month reversed', () => {
    expect(getDaysBetween('2024-07-08', '2024-08-07')).toBe(30);
  });
});

describe('Interest calculation with daily formula', () => {
  it('30 days accrual without capitalization', () => {
    const amount = 100000;
    const rate = 14;
    const days = 30;
    const interest = Math.round(amount * (rate / 100) * days / DAYS_IN_YEAR * 100) / 100;
    expect(interest).toBe(1150.68);
  });

  it('31 days accrual without capitalization', () => {
    const amount = 100000;
    const rate = 14;
    const days = 31;
    const interest = Math.round(amount * (rate / 100) * days / DAYS_IN_YEAR * 100) / 100;
    expect(interest).toBe(1189.04);
  });

  it('capitalization over multiple months', () => {
    const rate = 14;
    let amount = 100000;
    const steps = [
      { days: 30, expected: 1150.68 },
      { days: 31, expected: 1202.72 },
      { days: 30, expected: 1177.77 },
    ];
    for (const { days, expected } of steps) {
      const interest = amount * (rate / 100) * days / DAYS_IN_YEAR;
      amount += interest;
      expect(Math.round(interest * 100) / 100).toBe(expected);
    }
  });

  it('rounding to 2 decimal places', () => {
    const amount = 1100000;
    const rate = 14;
    const days = 30;
    const interest = Math.round(amount * (rate / 100) * days / DAYS_IN_YEAR * 100) / 100;
    expect(interest).toBe(12657.53);
  });

  it('rounding to 2 places 31 days', () => {
    const amount = 1112833.33;
    const rate = 14;
    const days = 31;
    const interest = Math.round(amount * (rate / 100) * days / DAYS_IN_YEAR * 100) / 100;
    expect(interest).toBe(13232.05);
  });
});

describe('Constants', () => {
  it('DAYS_IN_YEAR equals 365', () => {
    expect(DAYS_IN_YEAR).toBe(365);
  });

  it('ACCRUAL_STEP_MONTHLY equals 12', () => {
    expect(ACCRUAL_STEP_MONTHLY).toBe(12);
  });
});
