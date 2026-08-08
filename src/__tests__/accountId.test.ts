import { describe, it, expect } from 'vitest';
import {
  parseAccountId, isValidAccountId, newAccountId, insertAccountId, collectAccountIds,
} from '../domain/accountId';

describe('parseAccountId', () => {
  it('читает корректный id', () => {
    expect(parseAccountId('id: a7f3c92b4e1d')).toEqual({ kind: 'ok', id: 'a7f3c92b4e1d' });
  });

  it('терпит пробелы и лишние строки вокруг', () => {
    expect(parseAccountId('\n\n   id:   a7f3c92b4e1d   \n\n')).toEqual({ kind: 'ok', id: 'a7f3c92b4e1d' });
  });

  it('пустой блок — id отсутствует', () => {
    expect(parseAccountId('')).toEqual({ kind: 'missing' });
    expect(parseAccountId('\n\n')).toEqual({ kind: 'missing' });
  });

  it('испорченный руками id не подменяется молча', () => {
    // Опечатка в одном символе иначе тихо отвязала бы счёт от его данных
    expect(parseAccountId('id: a7f3c92b4e1')).toEqual({ kind: 'invalid', raw: 'a7f3c92b4e1' });
    expect(parseAccountId('id: A7F3C92B4E1D')).toEqual({ kind: 'invalid', raw: 'A7F3C92B4E1D' });
    expect(parseAccountId('id: zzzzzzzzzzzz')).toEqual({ kind: 'invalid', raw: 'zzzzzzzzzzzz' });
    expect(parseAccountId('id:')).toEqual({ kind: 'invalid', raw: '' });
  });

  it('игнорирует посторонние строки', () => {
    expect(parseAccountId('note: что-то\nid: a7f3c92b4e1d')).toEqual({ kind: 'ok', id: 'a7f3c92b4e1d' });
    expect(parseAccountId('accountId: a7f3c92b4e1d')).toEqual({ kind: 'missing' });
  });

  it('берёт первую строку id, если их несколько', () => {
    expect(parseAccountId('id: a7f3c92b4e1d\nid: 000000000000')).toEqual({ kind: 'ok', id: 'a7f3c92b4e1d' });
  });
});

describe('isValidAccountId', () => {
  it('принимает только 12 hex-символов в нижнем регистре', () => {
    expect(isValidAccountId('a7f3c92b4e1d')).toBe(true);
    expect(isValidAccountId('000000000000')).toBe(true);
    expect(isValidAccountId('a7f3c92b4e1')).toBe(false);
    expect(isValidAccountId('a7f3c92b4e1dd')).toBe(false);
    expect(isValidAccountId('A7F3C92B4E1D')).toBe(false);
    expect(isValidAccountId('')).toBe(false);
  });
});

describe('newAccountId', () => {
  it('делает 12 hex-символов из UUID', () => {
    const id = newAccountId('a7f3c92b-4e1d-4f2a-9b3c-1d2e3f4a5b6c');
    expect(id).toBe('a7f3c92b4e1d');
    expect(isValidAccountId(id)).toBe(true);
  });

  it('приводит к нижнему регистру', () => {
    expect(newAccountId('A7F3C92B-4E1D-4F2A-9B3C-1D2E3F4A5B6C')).toBe('a7f3c92b4e1d');
  });
});

describe('insertAccountId', () => {
  const note = [
    '# Заметка',
    '',
    '```finance-account',
    '```',
    '',
    'Текст после.',
  ].join('\n');

  it('вписывает id внутрь блока', () => {
    const result = insertAccountId(note, 2, 3, 'a7f3c92b4e1d');
    expect(result).toBe([
      '# Заметка',
      '',
      '```finance-account',
      'id: a7f3c92b4e1d',
      '```',
      '',
      'Текст после.',
    ].join('\n'));
  });

  it('правит именно тот блок, на который указывает lineStart', () => {
    const twoBlocks = [
      '```finance-account',
      '```',
      '',
      '```finance-account',
      '```',
    ].join('\n');

    const result = insertAccountId(twoBlocks, 3, 4, 'bbbbbbbbbbbb');

    expect(result).toBe([
      '```finance-account',
      '```',
      '',
      '```finance-account',
      'id: bbbbbbbbbbbb',
      '```',
    ].join('\n'));
  });

  it('не пишет, если id уже есть — защита от повторного срабатывания', () => {
    const withId = ['```finance-account', 'id: a7f3c92b4e1d', '```'].join('\n');
    expect(insertAccountId(withId, 0, 2, 'bbbbbbbbbbbb')).toBeNull();
  });

  it('отказывается писать, когда границы блока не сходятся', () => {
    expect(insertAccountId(note, -1, 3, 'a7f3c92b4e1d')).toBeNull();
    expect(insertAccountId(note, 2, 99, 'a7f3c92b4e1d')).toBeNull();
    expect(insertAccountId(note, 3, 2, 'a7f3c92b4e1d')).toBeNull();
  });

  it('отказывается писать, если на lineStart не открывающая ограда', () => {
    // Смещение на строку испортило бы содержимое заметки
    expect(insertAccountId(note, 0, 3, 'a7f3c92b4e1d')).toBeNull();
  });

  it('сохраняет остальное содержимое байт-в-байт', () => {
    const result = insertAccountId(note, 2, 3, 'a7f3c92b4e1d');
    expect(result!.split('\n').filter(l => !l.startsWith('id: ')).join('\n')).toBe(note);
  });

  it('работает с блоком, у которого есть тело', () => {
    const withBody = ['```finance-account', 'note: текст', '```'].join('\n');
    expect(insertAccountId(withBody, 0, 2, 'a7f3c92b4e1d'))
      .toBe(['```finance-account', 'id: a7f3c92b4e1d', 'note: текст', '```'].join('\n'));
  });
});

describe('collectAccountIds', () => {
  it('собирает id из всех блоков заметки', () => {
    const note = [
      '```finance-account',
      'id: aaaaaaaaaaaa',
      '```',
      'текст',
      '```finance-account',
      'id: bbbbbbbbbbbb',
      '```',
    ].join('\n');

    expect(collectAccountIds(note)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
  });

  it('не берёт id из чужих блоков', () => {
    const note = [
      '```js',
      'id: aaaaaaaaaaaa',
      '```',
      'id: bbbbbbbbbbbb',
    ].join('\n');

    expect(collectAccountIds(note)).toEqual([]);
  });

  it('пропускает битые id', () => {
    const note = ['```finance-account', 'id: нехорошо', '```'].join('\n');
    expect(collectAccountIds(note)).toEqual([]);
  });

  it('заметка без блоков даёт пустой список', () => {
    expect(collectAccountIds('# Просто заметка')).toEqual([]);
    expect(collectAccountIds('')).toEqual([]);
  });
});
