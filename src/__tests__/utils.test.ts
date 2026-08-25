import { describe, it, expect } from 'vitest';
import { getTodayStr, fmtAmount, parseAmount, parseDate, normalizeDateStr, normalizeTimeStr, createDateObject, fmtDate, shiftMonths } from '../utils';
import { DAYS_IN_YEAR, ACCRUAL_STEP_MONTHLY } from '../types';


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

describe('getTodayStr', () => {
  it('returns YYYY-MM-DD format of current date', () => {
    const today = getTodayStr();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(today).toBe(expected);
  });
});

describe('fmtAmount and parseAmount', () => {
  it('parses formatted amount strings', () => {
    expect(parseAmount('1 000,50')).toBe(1000.5);
    expect(parseAmount('123')).toBe(123);
    expect(parseAmount('0')).toBe(0);
  });

  it('formats numeric strings', () => {
    expect(fmtAmount('1000.5')).toBe('1\u00a0000,5');
    expect(fmtAmount('1234567')).toBe('1\u00a0234\u00a0567');
  });
});

describe('Date/Time Unified Helpers', () => {
  describe('parseDate', () => {
    it('parses YYYY-MM-DD', () => {
      const d = parseDate('2026-07-12');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      expect(d!.getMonth()).toBe(6); // July
      expect(d!.getDate()).toBe(12);
    });

    it('parses DD.MM.YYYY', () => {
      const d = parseDate('12.07.2026');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      expect(d!.getMonth()).toBe(6); // July
      expect(d!.getDate()).toBe(12);
    });

    it('parses DD/MM/YYYY', () => {
      const d = parseDate('12/07/2026');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      expect(d!.getMonth()).toBe(6); // July
      expect(d!.getDate()).toBe(12);
    });

    it('returns null for invalid format', () => {
      expect(parseDate('not-a-date')).toBeNull();
    });
  });

  describe('normalizeDateStr', () => {
    it('normalizes DD.MM.YYYY to YYYY-MM-DD', () => {
      expect(normalizeDateStr('12.07.2026')).toBe('2026-07-12');
    });

    it('preserves YYYY-MM-DD', () => {
      expect(normalizeDateStr('2026-07-12')).toBe('2026-07-12');
    });

    it('returns today for invalid date', () => {
      const today = getTodayStr();
      expect(normalizeDateStr('blah')).toBe(today);
    });
  });

  describe('normalizeTimeStr', () => {
    it('normalizes HH:MM', () => {
      expect(normalizeTimeStr('20:15')).toBe('20:15');
      expect(normalizeTimeStr('9:05')).toBe('09:05');
      expect(normalizeTimeStr('  18:30  ')).toBe('18:30');
    });

    it('returns empty string for invalid time', () => {
      expect(normalizeTimeStr('')).toBe('');
      expect(normalizeTimeStr('abc')).toBe('');
    });
  });

  describe('createDateObject', () => {
    it('creates Date with correct year, month, date, hour, minute', () => {
      const d = createDateObject('12.07.2026', '20:15');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(6);
      expect(d.getDate()).toBe(12);
      expect(d.getHours()).toBe(20);
      expect(d.getMinutes()).toBe(15);
    });

    it('defaults time to 00:00 if not specified', () => {
      const d = createDateObject('2026-07-12');
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    });
  });

  describe('fmtDate', () => {
    it('formats YYYY-MM-DD to DD.MM.YYYY', () => {
      expect(fmtDate('2026-07-12')).toBe('12.07.2026');
    });

    it('formats DD.MM.YYYY to DD.MM.YYYY', () => {
      expect(fmtDate('12.07.2026')).toBe('12.07.2026');
    });

    it('formats YYYY-MM-DD with time', () => {
      expect(fmtDate('2026-07-12', '20:15')).toBe('12.07.2026\u00a020:15');
    });
  });

  describe('shiftMonths', () => {
    it('сдвигает месяцы назад с переданной датой', () => {
      expect(shiftMonths('2026-08-25', -3)).toBe('2026-05-25');
      expect(shiftMonths('2026-08-25', -6)).toBe('2026-02-25');
    });

    it('сдвигает месяцы вперед', () => {
      expect(shiftMonths('2026-01-15', 2)).toBe('2026-03-15');
    });

    it('поддерживает вызов с числом первым аргументом', () => {
      expect(shiftMonths(-3, '2026-08-25')).toBe('2026-05-25');
    });

    it('клампит конец месяца корректно', () => {
      expect(shiftMonths('2026-05-31', -1)).toBe('2026-04-30');
    });
  });
});
