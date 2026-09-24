/**
 * Common filter utilities to consolidate repeated filter logic across tabs.
 * Provides reusable filter predicates and helpers.
 */

import { toDateStr } from './dateMath';

/**
 * Creates a text search predicate that matches against multiple fields.
 */
export function createSearchFilter(query: string): (text: string) => boolean {
  const q = query.toLowerCase().trim();
  if (!q) return () => true;
  return (text: string) => text.toLowerCase().includes(q);
}

/**
 * Tests if a value matches the filter (empty filter = match all).
 */
export function matchesStringFilter(value: string, filter: string): boolean {
  if (!filter) return true;
  return value === filter;
}

/**
 * Tests if a value contains the filter substring (case-insensitive).
 */
export function matchesSearchFilter(value: string, filter: string): boolean {
  if (!filter) return true;
  return value.toLowerCase().includes(filter.toLowerCase());
}

/**
 * Tests if a date is within the specified range.
 */
export function matchesDateRange(
  date: string,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
}

/**
 * Tests if any field in the haystack array contains the search query.
 */
export function matchesAnyField(fields: (string | number)[], query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = fields.map(f => String(f)).join(' ').toLowerCase();
  return haystack.includes(q);
}

/**
 * Generic filter builder for common filter patterns.
 */
export interface FilterPredicates<T> {
  search?: (item: T) => boolean;
  dateRange?: (item: T) => boolean;
  status?: (item: T) => boolean;
  custom?: ((item: T) => boolean)[];
}

/**
 * Applies a set of filter predicates to an array of items.
 */
export function applyFilters<T>(items: T[], predicates: FilterPredicates<T>): T[] {
  let result = items;

  if (predicates.search) {
    result = result.filter(predicates.search);
  }

  if (predicates.dateRange) {
    result = result.filter(predicates.dateRange);
  }

  if (predicates.status) {
    result = result.filter(predicates.status);
  }

  if (predicates.custom) {
    for (const predicate of predicates.custom) {
      result = result.filter(predicate);
    }
  }

  return result;
}

/**
 * Filter records by grouping criteria (used in chart drill-down modals).
 * Handles category, tag, payer, year, month, week grouping with "Other" support.
 */
export function filterRecordsByGrouping<T extends { category?: string; tag?: string; payer?: string; date: string }>(
  records: T[],
  groupBy: 'category' | 'tag' | 'payer' | 'year' | 'month' | 'week',
  groupKey: string,
  otherLabel: string
): {
  records: T[];
  dateFrom: string;
  dateTo: string;
} {
  let filtered: T[] = [];
  let dateFrom = '';
  let dateTo = '';

  if (groupBy === 'category') {
    filtered = records.filter(r =>
      groupKey === otherLabel ? !r.category?.trim() : r.category?.trim() === groupKey
    );
  } else if (groupBy === 'tag') {
    filtered = records.filter(r =>
      groupKey === otherLabel ? !r.tag?.trim() : r.tag?.trim() === groupKey
    );
  } else if (groupBy === 'payer') {
    filtered = records.filter(r =>
      groupKey === otherLabel ? !r.payer?.trim() : r.payer?.trim() === groupKey
    );
  } else if (groupBy === 'year') {
    if (groupKey === otherLabel) {
      filtered = records.filter(r => !r.date);
    } else {
      dateFrom = `${groupKey}-01-01`;
      dateTo = `${groupKey}-12-31`;
      filtered = records.filter(r => r.date >= dateFrom && r.date <= dateTo);
    }
  } else if (groupBy === 'month') {
    if (groupKey === otherLabel) {
      filtered = records.filter(r => !r.date);
    } else {
      const [y, m] = groupKey.split('-');
      const year = Number(y);
      const month = Number(m);
      const lastDay = new Date(year, month, 0).getDate();
      dateFrom = `${groupKey}-01`;
      dateTo = `${groupKey}-${String(lastDay).padStart(2, '0')}`;
      filtered = records.filter(r => r.date >= dateFrom && r.date <= dateTo);
    }
  } else if (groupBy === 'week') {
    if (groupKey === otherLabel) {
      filtered = records.filter(r => !r.date);
    } else {
      // Parse ISO week format: YYYY-Www
      const [yStr, wStr] = groupKey.split('-W');
      const year = Number(yStr);
      const week = Number(wStr);

      // Calculate ISO week date range
      const jan4 = new Date(year, 0, 4);
      const firstMonday = new Date(jan4);
      firstMonday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));

      const weekStart = new Date(firstMonday);
      weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      dateFrom = toDateStr(weekStart);
      dateTo = toDateStr(weekEnd);

      filtered = records.filter(r => r.date >= dateFrom && r.date <= dateTo);
    }
  }

  return { records: filtered, dateFrom, dateTo };
}
