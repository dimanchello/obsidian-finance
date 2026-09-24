import { describe, it, expect } from 'vitest';
import {
  createSearchFilter,
  matchesStringFilter,
  matchesSearchFilter,
  matchesDateRange,
  matchesAnyField,
  applyFilters,
  filterRecordsByGrouping,
} from '../domain/filterUtils';

describe('filterUtils', () => {
  describe('createSearchFilter', () => {
    it('возвращает функцию поиска', () => {
      const filter = createSearchFilter('test');
      expect(filter('This is a test')).toBe(true);
      expect(filter('Another string')).toBe(false);
    });

    it('игнорирует регистр', () => {
      const filter = createSearchFilter('TEST');
      expect(filter('this is a test')).toBe(true);
    });

    it('возвращает true для пустого запроса', () => {
      const filter = createSearchFilter('');
      expect(filter('anything')).toBe(true);
    });

    it('обрезает пробелы', () => {
      const filter = createSearchFilter('  test  ');
      expect(filter('test string')).toBe(true);
    });
  });

  describe('matchesStringFilter', () => {
    it('возвращает true для точного совпадения', () => {
      expect(matchesStringFilter('test', 'test')).toBe(true);
    });

    it('возвращает false для несовпадения', () => {
      expect(matchesStringFilter('test', 'other')).toBe(false);
    });

    it('возвращает true для пустого фильтра', () => {
      expect(matchesStringFilter('anything', '')).toBe(true);
    });
  });

  describe('matchesSearchFilter', () => {
    it('возвращает true для подстроки', () => {
      expect(matchesSearchFilter('hello world', 'world')).toBe(true);
    });

    it('игнорирует регистр', () => {
      expect(matchesSearchFilter('Hello World', 'WORLD')).toBe(true);
    });

    it('возвращает false для отсутствующей подстроки', () => {
      expect(matchesSearchFilter('hello', 'world')).toBe(false);
    });

    it('возвращает true для пустого фильтра', () => {
      expect(matchesSearchFilter('anything', '')).toBe(true);
    });
  });

  describe('matchesDateRange', () => {
    it('возвращает true когда дата в диапазоне', () => {
      expect(matchesDateRange('2024-06-15', '2024-06-01', '2024-06-30')).toBe(true);
    });

    it('возвращает true когда дата равна началу', () => {
      expect(matchesDateRange('2024-06-01', '2024-06-01', '2024-06-30')).toBe(true);
    });

    it('возвращает true когда дата равна концу', () => {
      expect(matchesDateRange('2024-06-30', '2024-06-01', '2024-06-30')).toBe(true);
    });

    it('возвращает false когда дата до начала', () => {
      expect(matchesDateRange('2024-05-31', '2024-06-01', '2024-06-30')).toBe(false);
    });

    it('возвращает false когда дата после конца', () => {
      expect(matchesDateRange('2024-07-01', '2024-06-01', '2024-06-30')).toBe(false);
    });

    it('возвращает true когда dateFrom пустой', () => {
      expect(matchesDateRange('2024-05-01', '', '2024-06-30')).toBe(true);
    });

    it('возвращает true когда dateTo пустой', () => {
      expect(matchesDateRange('2024-07-01', '2024-06-01', '')).toBe(true);
    });

    it('возвращает true когда оба пустые', () => {
      expect(matchesDateRange('2024-01-01', '', '')).toBe(true);
    });
  });

  describe('matchesAnyField', () => {
    it('возвращает true когда запрос найден в одном из полей', () => {
      expect(matchesAnyField(['John', 'Doe', 100], 'doe')).toBe(true);
    });

    it('игнорирует регистр', () => {
      expect(matchesAnyField(['John', 'Doe'], 'JOHN')).toBe(true);
    });

    it('преобразует числа в строки', () => {
      expect(matchesAnyField([100, 200], '100')).toBe(true);
    });

    it('возвращает false когда запрос не найден', () => {
      expect(matchesAnyField(['John', 'Doe'], 'smith')).toBe(false);
    });

    it('возвращает true для пустого запроса', () => {
      expect(matchesAnyField(['John', 'Doe'], '')).toBe(true);
    });
  });

  describe('applyFilters', () => {
    interface TestItem {
      name: string;
      date: string;
      status: string;
    }

    const items: TestItem[] = [
      { name: 'Item 1', date: '2024-01-01', status: 'active' },
      { name: 'Item 2', date: '2024-02-01', status: 'inactive' },
      { name: 'Test Item', date: '2024-03-01', status: 'active' },
    ];

    it('применяет search фильтр', () => {
      const result = applyFilters(items, {
        search: item => item.name.includes('Test'),
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Test Item');
    });

    it('применяет status фильтр', () => {
      const result = applyFilters(items, {
        status: item => item.status === 'active',
      });
      expect(result).toHaveLength(2);
    });

    it('применяет dateRange фильтр', () => {
      const result = applyFilters(items, {
        dateRange: item => item.date >= '2024-02-01',
      });
      expect(result).toHaveLength(2);
    });

    it('применяет custom фильтры', () => {
      const result = applyFilters(items, {
        custom: [
          item => item.name.startsWith('Item'),
          item => item.status === 'active',
        ],
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Item 1');
    });

    it('применяет все фильтры последовательно', () => {
      const result = applyFilters(items, {
        search: item => item.name.includes('Item'),
        status: item => item.status === 'active',
      });
      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('Item 1');
      expect(result[1]?.name).toBe('Test Item');
    });

    it('возвращает все элементы когда фильтры пустые', () => {
      const result = applyFilters(items, {});
      expect(result).toHaveLength(3);
    });
  });

  describe('filterRecordsByGrouping', () => {
    interface TestRecord {
      category?: string;
      tag?: string;
      payer?: string;
      date: string;
    }

    const records: TestRecord[] = [
      { category: 'Food', tag: 'lunch', payer: 'John', date: '2024-03-15' },
      { category: 'Transport', tag: '', payer: 'Jane', date: '2024-03-20' },
      { category: '', tag: 'important', payer: '', date: '2024-04-10' },
      { category: 'Food', tag: 'dinner', payer: 'John', date: '2024-01-05' },
      { category: 'Entertainment', tag: '', payer: 'Bob', date: '' },
    ];

    describe('category grouping', () => {
      it('фильтрует по категории', () => {
        const result = filterRecordsByGrouping(records, 'category', 'Food', 'Other');
        expect(result.records).toHaveLength(2);
        expect(result.records.every(r => r.category === 'Food')).toBe(true);
      });

      it('фильтрует пустые категории как Other', () => {
        const result = filterRecordsByGrouping(records, 'category', 'Other', 'Other');
        expect(result.records).toHaveLength(1);
        expect(result.records[0]?.category).toBe('');
      });
    });

    describe('tag grouping', () => {
      it('фильтрует по тегу', () => {
        const result = filterRecordsByGrouping(records, 'tag', 'lunch', 'Other');
        expect(result.records).toHaveLength(1);
        expect(result.records[0]?.tag).toBe('lunch');
      });

      it('фильтрует пустые теги как Other', () => {
        const result = filterRecordsByGrouping(records, 'tag', 'Other', 'Other');
        expect(result.records).toHaveLength(2);
      });
    });

    describe('payer grouping', () => {
      it('фильтрует по плательщику', () => {
        const result = filterRecordsByGrouping(records, 'payer', 'John', 'Other');
        expect(result.records).toHaveLength(2);
        expect(result.records.every(r => r.payer === 'John')).toBe(true);
      });

      it('фильтрует пустых плательщиков как Other', () => {
        const result = filterRecordsByGrouping(records, 'payer', 'Other', 'Other');
        expect(result.records).toHaveLength(1);
      });
    });

    describe('year grouping', () => {
      it('фильтрует по году', () => {
        const result = filterRecordsByGrouping(records, 'year', '2024', 'Other');
        expect(result.records).toHaveLength(4);
        expect(result.dateFrom).toBe('2024-01-01');
        expect(result.dateTo).toBe('2024-12-31');
      });

      it('фильтрует записи без даты как Other', () => {
        const result = filterRecordsByGrouping(records, 'year', 'Other', 'Other');
        expect(result.records).toHaveLength(1);
        expect(result.records[0]?.date).toBe('');
        expect(result.dateFrom).toBe('');
        expect(result.dateTo).toBe('');
      });
    });

    describe('month grouping', () => {
      it('фильтрует по месяцу', () => {
        const result = filterRecordsByGrouping(records, 'month', '2024-03', 'Other');
        expect(result.records).toHaveLength(2);
        expect(result.dateFrom).toBe('2024-03-01');
        expect(result.dateTo).toBe('2024-03-31');
      });

      it('обрабатывает февраль', () => {
        const result = filterRecordsByGrouping(records, 'month', '2024-02', 'Other');
        expect(result.dateTo).toBe('2024-02-29'); // 2024 високосный
      });

      it('фильтрует записи без даты как Other', () => {
        const result = filterRecordsByGrouping(records, 'month', 'Other', 'Other');
        expect(result.records).toHaveLength(1);
        expect(result.dateFrom).toBe('');
        expect(result.dateTo).toBe('');
      });
    });

    describe('week grouping', () => {
      it('фильтрует по неделе', () => {
        const result = filterRecordsByGrouping(records, 'week', '2024-W11', 'Other');
        expect(result.records.length).toBeGreaterThan(0);
        expect(result.dateFrom).toBeTruthy();
        expect(result.dateTo).toBeTruthy();
      });

      it('фильтрует записи без даты как Other', () => {
        const result = filterRecordsByGrouping(records, 'week', 'Other', 'Other');
        expect(result.records).toHaveLength(1);
        expect(result.records[0]?.date).toBe('');
        expect(result.dateFrom).toBe('');
        expect(result.dateTo).toBe('');
      });
    });
  });
});
