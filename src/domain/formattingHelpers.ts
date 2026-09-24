/**
 * Formatting helpers for common display patterns.
 * Consolidates repeated formatting logic across the codebase.
 */

import { DEFAULT_NUMBER_LOCALE } from '../constants';

/**
 * Formats an amount with currency for chart display (no decimals).
 * Used by chart components for consistent number formatting.
 */
export function formatChartAmount(amount: number, currency: string): string {
  return (
    amount.toLocaleString(DEFAULT_NUMBER_LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) +
    ' ' +
    currency
  );
}
