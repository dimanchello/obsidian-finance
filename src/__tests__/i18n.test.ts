import { describe, it, expect } from 'vitest';
import { getLocale, t, LOCALES } from '../i18n';

describe('i18n', () => {
  describe('getLocale', () => {
    it('defaults to Russian', () => {
      expect(getLocale(undefined)).toBe('ru');
      expect(getLocale('de')).toBe('ru');
    });

    it('detects English', () => {
      expect(getLocale('en')).toBe('en');
      expect(getLocale('en-US')).toBe('en');
    });
  });

  describe('translations', () => {
    it('has all required keys for both locales', () => {
      const ru = t('ru');
      const en = t('en');
      const requiredKeys = ['pluginTitle', 'income', 'expense', 'save', 'cancel', 'search', 'balance', 'analytics'];

      for (const key of requiredKeys) {
        expect(ru).toHaveProperty(key);
        expect(en).toHaveProperty(key);
      }
    });

    it('returns correct Russian strings', () => {
      const ru = t('ru');
      expect(ru.income).toBe('↑ Доход');
      expect(ru.expense).toBe('↓ Расход');
    });

    it('returns correct English strings', () => {
      const en = t('en');
      expect(en.income).toBe('↑ Income');
      expect(en.expense).toBe('↓ Expense');
    });
  });

  describe('LOCALES', () => {
    it('contains ru and en', () => {
      expect(LOCALES.ru).toBe('Русский');
      expect(LOCALES.en).toBe('English');
    });
  });
});