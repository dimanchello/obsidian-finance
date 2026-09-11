import { describe, it, expect } from 'vitest';
import { pageRange, compareValues, uniqueOptions, calculateEndDate } from '../ui/tabHelpers';

describe('pageRange', () => {
  it('returns all pages when total is small', () => {
    expect(pageRange(0, 5, false)).toEqual([0, 1, 2, 3, 4]);
    expect(pageRange(2, 7, false)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('adds ellipsis for large page counts on desktop', () => {
    // Current at beginning
    expect(pageRange(0, 20, false)).toEqual([0, 1, 2, -1, 19]);
    // Current in middle (current 10 with radius 2: 8, 9 on left and 11, 12 on right)
    expect(pageRange(10, 20, false)).toEqual([0, -1, 8, 9, 10, 11, 12, -1, 19]);
    // Current near end
    expect(pageRange(18, 20, false)).toEqual([0, -1, 16, 17, 18, 19]);
  });

  it('uses tighter radius on mobile', () => {
    expect(pageRange(5, 20, true)).toEqual([0, -1, 4, 5, 6, -1, 19]);
  });
});

describe('compareValues', () => {
  it('compares numbers correctly in asc and desc', () => {
    expect(compareValues(10, 20, 'asc')).toBeLessThan(0);
    expect(compareValues(20, 10, 'asc')).toBeGreaterThan(0);
    expect(compareValues(10, 10, 'asc')).toBe(0);

    expect(compareValues(10, 20, 'desc')).toBeGreaterThan(0);
    expect(compareValues(20, 10, 'desc')).toBeLessThan(0);
  });

  it('compares strings with locale', () => {
    expect(compareValues('Август', 'Борис', 'asc', 'ru')).toBeLessThan(0);
    expect(compareValues('Борис', 'Август', 'asc', 'ru')).toBeGreaterThan(0);
    expect(compareValues('Август', 'Борис', 'desc', 'ru')).toBeGreaterThan(0);
  });
});

describe('uniqueOptions', () => {
  it('extracts unique values with all option at beginning', () => {
    const items = [
      { category: 'Еда', amount: 100 },
      { category: 'Транспорт', amount: 50 },
      { category: 'Еда', amount: 200 },
      { category: '', amount: 10 },
    ];
    const opts = uniqueOptions(items, 'category', 'Все категории');
    expect(opts).toEqual([
      { value: '', label: 'Все категории' },
      { value: 'Еда', label: 'Еда' },
      { value: 'Транспорт', label: 'Транспорт' },
    ]);
  });
});

describe('calculateEndDate', () => {
  it('calculates end date given start date and term months', () => {
    expect(calculateEndDate('2026-01-15', 6)).toBe('2026-07-15');
    expect(calculateEndDate('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('handles empty or invalid start date', () => {
    expect(calculateEndDate('', 6)).toBeNull();
  });
});
