/**
 * Common validation utilities for forms and modals.
 * Extracts repeated validation patterns to eliminate duplication.
 */

import { parseAmount } from '../utils';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that an amount input contains a positive number.
 * Returns the parsed amount on success, null on failure.
 */
export function validatePositiveAmount(
  inputValue: string,
  errorMessage: string,
): { amount: number } | { error: string } {
  const amount = parseAmount(inputValue);
  if (!amount || amount <= 0) {
    return { error: errorMessage };
  }
  return { amount };
}

/**
 * Validates that a required string field is not empty after trimming.
 */
export function validateRequiredString(
  value: string,
  errorMessage: string,
): ValidationResult {
  if (!value.trim()) {
    return { valid: false, error: errorMessage };
  }
  return { valid: true };
}

/**
 * Validates that a number is positive.
 */
export function validatePositiveNumber(
  value: number,
  errorMessage: string,
): ValidationResult {
  if (value <= 0) {
    return { valid: false, error: errorMessage };
  }
  return { valid: true };
}

/**
 * Validates that a date string is not empty.
 */
export function validateRequiredDate(
  dateStr: string,
  errorMessage: string,
): ValidationResult {
  if (!dateStr?.trim()) {
    return { valid: false, error: errorMessage };
  }
  return { valid: true };
}

/**
 * Chains multiple validation results. Returns the first error encountered.
 */
export function validateAll(...results: ValidationResult[]): ValidationResult {
  const failed = results.find(r => !r.valid);
  return failed ?? { valid: true };
}
