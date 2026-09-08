import { describe, it, expect } from 'vitest';
import { parseCSV, csvToObjects, resolveRecordType } from '../domain/csv';
import { RecordType } from '../types';

describe('parseCSV', () => {
  it('разбирает простые строки', () => {
    expect(parseCSV('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('понимает CRLF', () => {
    expect(parseCSV('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('понимает одиночный CR', () => {
    expect(parseCSV('a,b\r1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('сохраняет запятую внутри кавычек', () => {
    expect(parseCSV('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  it('сохраняет перенос строки внутри кавычек', () => {
    expect(parseCSV('a,"строка1\nстрока2",c\nx,y,z'))
      .toEqual([['a', 'строка1\nстрока2', 'c'], ['x', 'y', 'z']]);
  });

  it('сохраняет CRLF внутри кавычек как есть', () => {
    expect(parseCSV('a,"один\r\nдва"')).toEqual([['a', 'один\r\nдва']]);
  });

  it('удвоенная кавычка становится одной', () => {
    expect(parseCSV('a,"он сказал ""да""",b')).toEqual([['a', 'он сказал "да"', 'b']]);
  });

  it('пустые поля сохраняются', () => {
    expect(parseCSV('a,,c')).toEqual([['a', '', 'c']]);
  });

  it('пустые строки отбрасываются', () => {
    expect(parseCSV('a,b\n\n\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('пустой ввод даёт пустой список', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV('\n\n')).toEqual([]);
  });

  it('последняя строка без перевода строки не теряется', () => {
    expect(parseCSV('a,b\nc,d')).toHaveLength(2);
  });

  it('строка только из кавычек-обёрток не считается пустой, если внутри есть текст', () => {
    expect(parseCSV('"",""\n"x",""')).toEqual([['x', '']]);
  });
});

describe('csvToObjects', () => {
  it('складывает строки в объекты по заголовку', () => {
    const { headers, rows } = csvToObjects('date,amount\n2026-01-01,100');
    expect(headers).toEqual(['date', 'amount']);
    expect(rows).toEqual([{ date: '2026-01-01', amount: '100' }]);
  });

  it('добивает недостающие колонки пустой строкой', () => {
    const { rows } = csvToObjects('a,b,c\n1,2');
    expect(rows[0]).toEqual({ a: '1', b: '2', c: '' });
  });

  it('пустой файл не падает', () => {
    expect(csvToObjects('')).toEqual({ headers: [], rows: [] });
  });
});

describe('resolveRecordType', () => {
  const map = { incomeVal: RecordType.INCOME, expenseVal: RecordType.EXPENSE };

  it('режимы all_* игнорируют значение', () => {
    expect(resolveRecordType('all_income', 'что угодно', -5, map)).toBe(RecordType.INCOME);
    expect(resolveRecordType('all_expense', 'income', 5, map)).toBe(RecordType.EXPENSE);
  });

  it('режим sign смотрит на знак суммы', () => {
    expect(resolveRecordType('sign', '', 5, map)).toBe(RecordType.INCOME);
    expect(resolveRecordType('sign', '', -5, map)).toBe(RecordType.EXPENSE);
    expect(resolveRecordType('sign', '', 0, map)).toBe(RecordType.INCOME);
  });

  it('сверяет с обоими значениями без учёта регистра и пробелов', () => {
    expect(resolveRecordType('field', ' INCOME ', 0, map)).toBe(RecordType.INCOME);
    expect(resolveRecordType('field', 'Expense', 0, map)).toBe(RecordType.EXPENSE);
  });

  it('неизвестный тип не становится расходом', () => {
    expect(resolveRecordType('field', 'incme', 0, map)).toBeNull();
    expect(resolveRecordType('field', '', 0, map)).toBeNull();
  });
});
