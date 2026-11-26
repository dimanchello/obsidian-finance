import { describe, it, expect } from 'vitest';
import {
  AMOUNT_INPUT_TYPE,
  caretAfterFormat,
  normalizeAmountInput,
  formatAmountValue,
  formatAmountOnBlur,
  resolveBeforeAmountInput,
  resolveAfterAmountInput,
} from '../ui/AmountInput';
import { STRING_SEPARATOR } from '../constants';
import { fmtAmount } from '../utils';

const NBSP = STRING_SEPARATOR.NBSP;

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

describe('normalizeAmountInput', () => {
  it('пустая строка остаётся пустой с курсором 0', () => {
    expect(normalizeAmountInput('', 0)).toEqual({ text: '', caret: 0 });
  });

  it('одинокая запятая дополняется ведущим нулём и ставит курсор после запятой', () => {
    expect(normalizeAmountInput(',', 1)).toEqual({ text: '0,', caret: 2 });
  });

  it('ведущая точка нормализуется в 0, и сдвигает курсор на +1', () => {
    expect(normalizeAmountInput('.5', 2)).toEqual({ text: '0,5', caret: 3 });
  });

  it('ведущая точка при курсоре сразу после разделителя ставит курсор между запятой и цифрой', () => {
    expect(normalizeAmountInput('.5', 1)).toEqual({ text: '0,5', caret: 2 });
  });

  it('ведущий разделитель при курсоре в самом начале оставляет курсор на 0', () => {
    expect(normalizeAmountInput(',5', 0)).toEqual({ text: '0,5', caret: 0 });
  });

  it('сохраняет завершающую запятую при вводе 1,', () => {
    expect(normalizeAmountInput('1,', 2)).toEqual({ text: '1,', caret: 2 });
  });

  it('сохраняет завершающую запятую при вводе 0,', () => {
    expect(normalizeAmountInput('0,', 2)).toEqual({ text: '0,', caret: 2 });
  });

  it('пошаговый ввод 0 -> 0, -> 0,5 не теряет разделитель', () => {
    expect(normalizeAmountInput('0,5', 3)).toEqual({ text: '0,5', caret: 3 });
  });

  it('группирует 1234 с курсором в начале без смещения курсора', () => {
    expect(normalizeAmountInput('1234', 0)).toEqual({ text: `1${NBSP}234`, caret: 0 });
  });

  it('группирует 1234 с курсором в середине с учётом NBSP', () => {
    expect(normalizeAmountInput('1234', 2)).toEqual({ text: `1${NBSP}234`, caret: 3 });
  });

  it('несколько запятых подряд дают 0, и не очищают поле', () => {
    expect(normalizeAmountInput(',,', 2)).toEqual({ text: '0,', caret: 2 });
  });

  it('точка и запятая подряд дают 0, и отбрасывают лишний разделитель', () => {
    expect(normalizeAmountInput('.,', 2)).toEqual({ text: '0,', caret: 2 });
  });

  it('буквы без цифр и разделителя дают пустую строку', () => {
    expect(normalizeAmountInput('abc', 3)).toEqual({ text: '', caret: 0 });
  });

  it('ограничивает дробную часть двумя знаками для "1 234,567"', () => {
    expect(normalizeAmountInput('1 234,567', 9)).toEqual({ text: `1${NBSP}234,56`, caret: 8 });
  });

  it('вставка цифры в начало дробной части сохраняет курсор после вставленной цифры', () => {
    expect(normalizeAmountInput(`1${NBSP}234,756`, 7)).toEqual({ text: `1${NBSP}234,75`, caret: 7 });
  });

  it('отрицательный знак отбрасывается с сохранением цифры', () => {
    expect(normalizeAmountInput('-5', 2)).toEqual({ text: '5', caret: 1 });
  });

  it('отбрасывает второй разделитель внутри числа, сохраняя дробные цифры', () => {
    expect(normalizeAmountInput('1,2.3', 4)).toEqual({ text: '1,23', caret: 3 });
  });

  it('клампит отрицательный или чрезмерный caret', () => {
    expect(normalizeAmountInput('1234', -5)).toEqual({ text: `1${NBSP}234`, caret: 0 });
    expect(normalizeAmountInput('1234', 99)).toEqual({ text: `1${NBSP}234`, caret: 5 });
  });
});

describe('formatAmountValue', () => {
  it('форматирует положительное число с группировкой и запятой', () => {
    expect(formatAmountValue(1234.5)).toEqual({ value: 1234.5, text: `1${NBSP}234,5` });
  });

  it('округляет артефакты плавающей точки вроде 10.1 - 9.9', () => {
    expect(formatAmountValue(10.1 - 9.9)).toEqual({ value: 0.2, text: '0,2' });
  });

  it('возвращает 0 и пустую строку для нуля', () => {
    expect(formatAmountValue(0)).toEqual({ value: 0, text: '' });
  });

  it('возвращает 0 и пустую строку для отрицательных значений', () => {
    expect(formatAmountValue(-50)).toEqual({ value: 0, text: '' });
  });

  it('возвращает 0 и пустую строку для NaN и Infinity', () => {
    expect(formatAmountValue(NaN)).toEqual({ value: 0, text: '' });
    expect(formatAmountValue(Infinity)).toEqual({ value: 0, text: '' });
    expect(formatAmountValue(-Infinity)).toEqual({ value: 0, text: '' });
  });

  it('значения меньше половины копейки не превращаются в экспоненциальную запись', () => {
    expect(formatAmountValue(1e-7)).toEqual({ value: 0, text: '' });
  });

  it('очень большие конечные числа не превращаются в научную нотацию', () => {
    expect(formatAmountValue(1e21)).toEqual({
      value: 1e21,
      text: `1${NBSP}000${NBSP}000${NBSP}000${NBSP}000${NBSP}000${NBSP}000${NBSP}000`,
    });
  });
});

describe('formatAmountOnBlur', () => {
  it('пустое поле остаётся пустым при потере фокуса', () => {
    expect(formatAmountOnBlur('')).toEqual({ value: 0, text: '' });
  });

  it('явно набранный ноль ("0" и "000") сохраняется как "0"', () => {
    expect(formatAmountOnBlur('0')).toEqual({ value: 0, text: '0' });
    expect(formatAmountOnBlur('000')).toEqual({ value: 0, text: '0' });
  });

  it('незавершённый ноль с запятой ("0,") превращается в "0"', () => {
    expect(formatAmountOnBlur('0,')).toEqual({ value: 0, text: '0' });
  });

  it('завершающая запятая после числа отбрасывается при blur', () => {
    expect(formatAmountOnBlur(`1${NBSP}234,`)).toEqual({ value: 1234, text: `1${NBSP}234` });
  });

  it('лишний хвостовой ноль в дробной части нормализуется при blur', () => {
    expect(formatAmountOnBlur('1234,50')).toEqual({ value: 1234.5, text: `1${NBSP}234,5` });
  });
});

describe('resolveBeforeAmountInput', () => {
  it('игнорирует ввод минуса при выделенном значении', () => {
    const value = `1${NBSP}234`;
    expect(resolveBeforeAmountInput(value, 0, value.length, AMOUNT_INPUT_TYPE.INSERT_TEXT, '-')).toEqual({ action: 'prevent' });
  });

  it('игнорирует ввод буквы при выделенном значении', () => {
    const value = `1${NBSP}234`;
    expect(resolveBeforeAmountInput(value, 0, value.length, AMOUNT_INPUT_TYPE.INSERT_TEXT, 'a')).toEqual({ action: 'prevent' });
  });

  it('разрешает заменить выделенный текст запятой', () => {
    const value = `1${NBSP}234`;
    expect(resolveBeforeAmountInput(value, 0, value.length, AMOUNT_INPUT_TYPE.INSERT_TEXT, ',')).toEqual({ action: 'allow' });
  });

  it('игнорирует вставку текста без цифр и разделителей', () => {
    const value = `1${NBSP}234`;
    expect(resolveBeforeAmountInput(value, 0, value.length, AMOUNT_INPUT_TYPE.INSERT_FROM_PASTE, 'abc')).toEqual({ action: 'prevent' });
  });

  it('разрешает вставку нескольких разделителей вроде ",," для последующей нормализации в "0,"', () => {
    expect(resolveBeforeAmountInput('', 0, 0, AMOUNT_INPUT_TYPE.INSERT_FROM_PASTE, ',,')).toEqual({ action: 'allow' });
  });

  it('игнорирует повторный разделитель в конце числа, если разделитель уже есть', () => {
    expect(resolveBeforeAmountInput('12,34', 5, 5, AMOUNT_INPUT_TYPE.INSERT_TEXT, ',')).toEqual({ action: 'prevent' });
  });

  it('игнорирует повторный разделитель в начале числа, если разделитель уже есть', () => {
    expect(resolveBeforeAmountInput('12,34', 0, 0, AMOUNT_INPUT_TYPE.INSERT_TEXT, '.')).toEqual({ action: 'prevent' });
  });

  it('игнорирует разделитель в начале числа длиннее 2 цифр, чтобы не уничтожать цифры', () => {
    expect(resolveBeforeAmountInput(`1${NBSP}234`, 0, 0, AMOUNT_INPUT_TYPE.INSERT_TEXT, ',')).toEqual({ action: 'prevent' });
  });

  it('разрешает разделитель в начале числа из 1-2 цифр', () => {
    expect(resolveBeforeAmountInput('12', 0, 0, AMOUNT_INPUT_TYPE.INSERT_TEXT, ',')).toEqual({ action: 'allow' });
  });

  it('Backspace сразу после NBSP удаляет предыдущую цифру с первого нажатия', () => {
    expect(resolveBeforeAmountInput(`12${NBSP}345`, 3, 3, AMOUNT_INPUT_TYPE.DELETE_BACKWARD, '')).toEqual({
      action: 'replace',
      text: `1${NBSP}345`,
      caret: 1,
    });
  });

  it('Backspace сразу после первого NBSP убирает первую цифру и сам NBSP', () => {
    expect(resolveBeforeAmountInput(`1${NBSP}234`, 2, 2, AMOUNT_INPUT_TYPE.DELETE_BACKWARD, '')).toEqual({
      action: 'replace',
      text: '234',
      caret: 0,
    });
  });

  it('Delete прямо перед NBSP удаляет следующую цифру с первого нажатия', () => {
    expect(resolveBeforeAmountInput(`12${NBSP}345`, 2, 2, AMOUNT_INPUT_TYPE.DELETE_FORWARD, '')).toEqual({
      action: 'replace',
      text: `1${NBSP}245`,
      caret: 3,
    });
  });
});

describe('resolveAfterAmountInput', () => {
  it('не перезаписывает DOM, если строка уже нормализована', () => {
    expect(resolveAfterAmountInput('0,5', 3, AMOUNT_INPUT_TYPE.INSERT_TEXT, '0,', 2)).toEqual({
      text: '0,5',
      caret: 3,
      shouldUpdateDom: false,
    });
  });

  it('при неблокируемой вставке нецифрового символа поверх значения восстанавливает прежний текст', () => {
    const prev = `1${NBSP}234`;
    expect(resolveAfterAmountInput('a', 1, AMOUNT_INPUT_TYPE.INSERT_COMPOSITION_TEXT, prev, 5)).toEqual({
      text: prev,
      caret: 5,
      shouldUpdateDom: true,
    });
  });

  it('разрешает законное очищение поля через удаление', () => {
    expect(resolveAfterAmountInput('', 0, AMOUNT_INPUT_TYPE.DELETE_BACKWARD, `1${NBSP}234`, 5)).toEqual({
      text: '',
      caret: 0,
      shouldUpdateDom: false,
    });
  });

  it('fallback при вставке запятой в начало длинного числа без cancelable beforeinput', () => {
    const prev = `1${NBSP}234`;
    expect(resolveAfterAmountInput(`,${prev}`, 1, AMOUNT_INPUT_TYPE.INSERT_COMPOSITION_TEXT, prev, 0)).toEqual({
      text: prev,
      caret: 0,
      shouldUpdateDom: true,
    });
  });

  it('fallback Backspace по NBSP удаляет цифру перед разделителем', () => {
    expect(resolveAfterAmountInput('12345', 2, AMOUNT_INPUT_TYPE.DELETE_BACKWARD, `12${NBSP}345`, 3)).toEqual({
      text: `1${NBSP}345`,
      caret: 1,
      shouldUpdateDom: true,
    });
  });

  it('fallback Delete по NBSP удаляет цифру после разделителя', () => {
    expect(resolveAfterAmountInput('12345', 2, AMOUNT_INPUT_TYPE.DELETE_FORWARD, `12${NBSP}345`, 2)).toEqual({
      text: `1${NBSP}245`,
      caret: 3,
      shouldUpdateDom: true,
    });
  });
});
