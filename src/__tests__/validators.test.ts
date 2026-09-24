import { describe, it, expect } from 'vitest';
import {
  validatePositiveAmount,
  validateRequiredString,
  validatePositiveNumber,
  validateRequiredDate,
  validateAll,
} from '../domain/validators';

describe('validators', () => {
  describe('validatePositiveAmount', () => {
    it('возвращает amount для корректного значения', () => {
      const result = validatePositiveAmount('100', 'Invalid');
      expect(result).toEqual({ amount: 100 });
    });

    it('возвращает amount для значения с запятой', () => {
      const result = validatePositiveAmount('1 500,50', 'Invalid');
      expect(result).toEqual({ amount: 1500.50 });
    });

    it('возвращает ошибку для нуля', () => {
      const result = validatePositiveAmount('0', 'Invalid amount');
      expect(result).toEqual({ error: 'Invalid amount' });
    });

    it('возвращает ошибку для отрицательного числа', () => {
      const result = validatePositiveAmount('-10', 'Invalid amount');
      expect(result).toEqual({ error: 'Invalid amount' });
    });

    it('возвращает ошибку для пустой строки', () => {
      const result = validatePositiveAmount('', 'Invalid amount');
      expect(result).toEqual({ error: 'Invalid amount' });
    });
  });

  describe('validateRequiredString', () => {
    it('возвращает valid для непустой строки', () => {
      const result = validateRequiredString('test', 'Required');
      expect(result).toEqual({ valid: true });
    });

    it('возвращает valid для строки с пробелами по краям', () => {
      const result = validateRequiredString('  test  ', 'Required');
      expect(result).toEqual({ valid: true });
    });

    it('возвращает ошибку для пустой строки', () => {
      const result = validateRequiredString('', 'Field required');
      expect(result).toEqual({ valid: false, error: 'Field required' });
    });

    it('возвращает ошибку для строки только из пробелов', () => {
      const result = validateRequiredString('   ', 'Field required');
      expect(result).toEqual({ valid: false, error: 'Field required' });
    });
  });

  describe('validatePositiveNumber', () => {
    it('возвращает valid для положительного числа', () => {
      const result = validatePositiveNumber(100, 'Must be positive');
      expect(result).toEqual({ valid: true });
    });

    it('возвращает ошибку для нуля', () => {
      const result = validatePositiveNumber(0, 'Must be positive');
      expect(result).toEqual({ valid: false, error: 'Must be positive' });
    });

    it('возвращает ошибку для отрицательного числа', () => {
      const result = validatePositiveNumber(-10, 'Must be positive');
      expect(result).toEqual({ valid: false, error: 'Must be positive' });
    });
  });

  describe('validateRequiredDate', () => {
    it('возвращает valid для корректной даты', () => {
      const result = validateRequiredDate('2024-01-01', 'Date required');
      expect(result).toEqual({ valid: true });
    });

    it('возвращает ошибку для пустой строки', () => {
      const result = validateRequiredDate('', 'Date required');
      expect(result).toEqual({ valid: false, error: 'Date required' });
    });

    it('возвращает ошибку для строки только из пробелов', () => {
      const result = validateRequiredDate('   ', 'Date required');
      expect(result).toEqual({ valid: false, error: 'Date required' });
    });
  });

  describe('validateAll', () => {
    it('возвращает valid когда все результаты valid', () => {
      const result = validateAll(
        { valid: true },
        { valid: true },
        { valid: true },
      );
      expect(result).toEqual({ valid: true });
    });

    it('возвращает первую ошибку', () => {
      const result = validateAll(
        { valid: true },
        { valid: false, error: 'Error 1' },
        { valid: false, error: 'Error 2' },
      );
      expect(result).toEqual({ valid: false, error: 'Error 1' });
    });

    it('возвращает valid для пустого списка', () => {
      const result = validateAll();
      expect(result).toEqual({ valid: true });
    });
  });
});
