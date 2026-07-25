import { describe, it, expect } from 'vitest';
import {
  addMonthsClamped, toDateStr, toDateTimeLocalStr, parseDateStr,
  daysBetweenStr, daysInMonth, isLeapYear,
} from '../domain/dateMath';

describe('isLeapYear', () => {
  it('распознаёт високосные годы', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe('daysInMonth', () => {
  it('возвращает длину месяца', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('toDateStr', () => {
  it('использует локальные геттеры, а не UTC', () => {
    // toISOString() дал бы 2026-01-30 в поясах UTC+
    expect(toDateStr(new Date(2026, 0, 31))).toBe('2026-01-31');
  });

  it('дополняет нулями месяц и день', () => {
    expect(toDateStr(new Date(2026, 8, 5))).toBe('2026-09-05');
  });

  it('не сдвигает дату в полночь', () => {
    expect(toDateStr(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
  });
});

describe('toDateTimeLocalStr', () => {
  it('формирует значение для datetime-local', () => {
    expect(toDateTimeLocalStr(new Date(2026, 0, 31, 9, 5))).toBe('2026-01-31T09:05');
  });
});

describe('parseDateStr', () => {
  it('разбирает корректную дату', () => {
    expect(parseDateStr('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('отклоняет несуществующие даты', () => {
    expect(parseDateStr('2026-02-30')).toBeNull();
    expect(parseDateStr('2026-13-01')).toBeNull();
    expect(parseDateStr('2026-00-01')).toBeNull();
    expect(parseDateStr('2026-01-00')).toBeNull();
  });

  it('принимает 29 февраля только в високосный год', () => {
    expect(parseDateStr('2024-02-29')).not.toBeNull();
    expect(parseDateStr('2026-02-29')).toBeNull();
  });

  it('отклоняет неверный формат', () => {
    expect(parseDateStr('')).toBeNull();
    expect(parseDateStr('2026-1-1')).toBeNull();
    expect(parseDateStr('31.01.2026')).toBeNull();
    expect(parseDateStr('2026-01-31T00:00')).toBeNull();
  });
});

describe('addMonthsClamped', () => {
  it('прижимает к последнему дню короткого месяца', () => {
    // Date.setMonth дал бы 2026-03-03
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-30', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('учитывает високосный февраль', () => {
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsClamped('2024-01-31', 13)).toBe('2025-02-28');
  });

  it('прижимает только когда нужно — обычные дни не трогает', () => {
    expect(addMonthsClamped('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonthsClamped('2026-01-28', 1)).toBe('2026-02-28');
  });

  it('переходит через год', () => {
    expect(addMonthsClamped('2026-12-31', 1)).toBe('2027-01-31');
    expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonthsClamped('2026-01-31', 12)).toBe('2027-01-31');
    expect(addMonthsClamped('2026-01-31', 25)).toBe('2028-02-29');
  });

  it('работает с отрицательным сдвигом', () => {
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonthsClamped('2026-01-31', -12)).toBe('2025-01-31');
  });

  it('нулевой сдвиг — тождество', () => {
    expect(addMonthsClamped('2026-01-31', 0)).toBe('2026-01-31');
  });

  it('никогда не переносит на следующий месяц при последовательном сдвиге', () => {
    // Вклад, открытый 31 января: даты всех начислений должны быть в своих месяцах
    const dates = Array.from({ length: 12 }, (_, i) => addMonthsClamped('2026-01-31', i + 1));
    expect(dates).toEqual([
      '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
      '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30',
      '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31',
    ]);
  });

  it('бросает на некорректном входе', () => {
    expect(() => addMonthsClamped('нет даты', 1)).toThrow();
  });
});

describe('daysBetweenStr', () => {
  it('считает дни внутри месяца', () => {
    expect(daysBetweenStr('2026-01-01', '2026-01-31')).toBe(30);
  });

  it('считает дни через границу месяца и года', () => {
    expect(daysBetweenStr('2026-01-31', '2026-02-28')).toBe(28);
    expect(daysBetweenStr('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('учитывает високосный год', () => {
    expect(daysBetweenStr('2024-01-01', '2025-01-01')).toBe(366);
    expect(daysBetweenStr('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('возвращает отрицательное значение при обратном порядке', () => {
    expect(daysBetweenStr('2026-01-31', '2026-01-01')).toBe(-30);
  });

  it('одинаковые даты дают 0', () => {
    expect(daysBetweenStr('2026-01-31', '2026-01-31')).toBe(0);
  });

  it('не ломается на переходе летнего времени', () => {
    // В Europe/Moscow DST нет, но в других поясах локальная арифметика дала бы 29 или 31
    expect(daysBetweenStr('2026-03-01', '2026-03-31')).toBe(30);
    expect(daysBetweenStr('2026-10-01', '2026-10-31')).toBe(30);
  });

  it('возвращает 0 на некорректном входе', () => {
    expect(daysBetweenStr('', '2026-01-01')).toBe(0);
    expect(daysBetweenStr('2026-01-01', 'мусор')).toBe(0);
  });
});
