import { describe, it, expect, vi } from 'vitest';
import { getLocale, getLocaleFromApp, t, LOCALES } from '../i18n';
import { getLanguage } from 'obsidian';

describe('i18n', () => {
  describe('getLocale', () => {
    it('defaults to Russian', () => {
      expect(getLocale(undefined)).toBe('ru');
      expect(getLocale('de')).toBe('ru');
    });

    it('detects English', () => {
      expect(getLocale('en')).toBe('en');
      expect(getLocale('en-US')).toBe('en');
      expect(getLocale('English')).toBe('en');
    });
  });

  describe('translations', () => {
    it('has all required keys for both locales', () => {
      const ru = t('ru');
      const en = t('en');
      expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
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

  describe('getLocaleFromApp', () => {
    it('detects language from Obsidian getLanguage()', () => {
      vi.mocked(getLanguage).mockReturnValue('en');
      expect(getLocaleFromApp()).toBe('en');

      vi.mocked(getLanguage).mockReturnValue('ru');
      expect(getLocaleFromApp()).toBe('ru');
    });
  });
});