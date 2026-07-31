import { describe, it, expect } from 'vitest';
import { caretAfterFormat } from '../ui/AmountInput';
import { fmtAmount } from '../utils';

const NBSP = ' ';

describe('caretAfterFormat', () => {
  it('курсор в конце остаётся в конце после вставки разделителя', () => {
    // "1234" → "1 234", курсор был после 4-й цифры
    const raw = '1234';
    const formatted = fmtAmount(raw);
    expect(formatted).toBe(`1${NBSP}234`);
    expect(caretAfterFormat(raw, 4, formatted)).toBe(5);
  });

  it('курсор в середине сдвигается вместе с цифрой', () => {
    // "1234", курсор после "12" → в "1 234" это позиция после "2"
    const raw = '1234';
    const formatted = `1${NBSP}234`;
    expect(caretAfterFormat(raw, 2, formatted)).toBe(3);
  });

  it('курсор в начале остаётся в начале', () => {
    expect(caretAfterFormat('1234', 0, `1${NBSP}234`)).toBe(0);
  });

  it('набор дробной части не прыгает', () => {
    // "1 234,5" — курсор в конце
    const raw = `1${NBSP}234,5`;
    const formatted = fmtAmount(raw);
    expect(formatted).toBe(`1${NBSP}234,5`);
    expect(caretAfterFormat(raw, raw.length, formatted)).toBe(formatted.length);
  });

  it('ввод миллиона: два разделителя, курсор в конце', () => {
    const raw = '1000000';
    const formatted = fmtAmount(raw);
    expect(formatted).toBe(`1${NBSP}000${NBSP}000`);
    expect(caretAfterFormat(raw, 7, formatted)).toBe(9);
  });

  it('удаление цифры перед разделителем не ломает позицию', () => {
    // Было "12 345" → пользователь удалил "5", raw = "12 34", курсор в конце
    const raw = `12${NBSP}34`;
    const formatted = fmtAmount(raw);
    expect(formatted).toBe(`1${NBSP}234`);
    expect(caretAfterFormat(raw, raw.length, formatted)).toBe(formatted.length);
  });

  it('позиция не выходит за длину форматированной строки', () => {
    expect(caretAfterFormat('99999', 5, fmtAmount('99999'))).toBeLessThanOrEqual(fmtAmount('99999').length);
  });
});
