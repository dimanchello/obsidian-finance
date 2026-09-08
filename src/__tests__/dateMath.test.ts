import { describe, it, expect } from 'vitest';
import {
  addMonthsClamped, toDateStr, toDateTimeLocalStr, parseDateStr,
  daysBetweenStr, daysInMonth, isLeapYear, isoWeek, isoWeekRange,
  daysInYear, safeEndDate,
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

describe('isoWeek', () => {
  it('1 января в четверг попадает в неделю 1 своего года', () => {
    // 2026-01-01 — четверг
    expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 });
  });

  it('1 января в пятницу принадлежит последней неделе прошлого года', () => {
    // 2027-01-01 — пятница, неделя 53 2026-го
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 });
  });

  it('1 января в субботу принадлежит последней неделе прошлого года', () => {
    // 2022-01-01 — суббота, неделя 52 2021-го
    expect(isoWeek('2022-01-01')).toEqual({ year: 2021, week: 52 });
  });

  it('1 января в воскресенье принадлежит последней неделе прошлого года', () => {
    // 2023-01-01 — воскресенье, неделя 52 2022-го
    expect(isoWeek('2023-01-01')).toEqual({ year: 2022, week: 52 });
  });

  it('1 января в понедельник — неделя 1', () => {
    expect(isoWeek('2024-01-01')).toEqual({ year: 2024, week: 1 });
  });

  it('конец декабря может относиться к неделе 1 следующего года', () => {
    // 2025-12-29 — понедельник недели 1 2026-го
    expect(isoWeek('2025-12-29')).toEqual({ year: 2026, week: 1 });
  });

  it('год с 53 неделями', () => {
    expect(isoWeek('2026-12-31')).toEqual({ year: 2026, week: 53 });
  });

  it('воскресенье закрывает неделю, а не открывает следующую', () => {
    expect(isoWeek('2026-01-04')).toEqual({ year: 2026, week: 1 });
    expect(isoWeek('2026-01-05')).toEqual({ year: 2026, week: 2 });
  });

  it('возвращает null на некорректной дате', () => {
    expect(isoWeek('мусор')).toBeNull();
    expect(isoWeek('')).toBeNull();
  });
});

describe('isoWeekRange', () => {
  it('неделя 1 2026 года — с понедельника по воскресенье', () => {
    expect(isoWeekRange(2026, 1)).toEqual({ from: '2025-12-29', to: '2026-01-04' });
  });

  it('неделя 1 2024 года начинается 1 января', () => {
    expect(isoWeekRange(2024, 1)).toEqual({ from: '2024-01-01', to: '2024-01-07' });
  });

  it('53-я неделя 2026 года', () => {
    expect(isoWeekRange(2026, 53)).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('обратна isoWeek для любого дня недели', () => {
    for (const d of ['2026-01-01', '2022-01-01', '2025-12-29', '2026-06-15', '2027-01-01']) {
      const iso = isoWeek(d)!;
      const { from, to } = isoWeekRange(iso.year, iso.week);
      expect(from <= d && d <= to).toBe(true);
    }
  });
});

describe('daysInYear', () => {
  it('366 дней в високосном году, 365 в обычном', () => {
    expect(daysInYear(2024)).toBe(366);
    expect(daysInYear(2026)).toBe(365);
  });
});

describe('safeEndDate', () => {
  it('прибавляет срок в месяцах к дате начала', () => {
    expect(safeEndDate('2026-01-15', 12)).toBe('2027-01-15');
    expect(safeEndDate('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('срок не указан → дата начала без изменений', () => {
    expect(safeEndDate('2026-01-15')).toBe('2026-01-15');
    expect(safeEndDate('2026-01-15', 0)).toBe('2026-01-15');
  });

  it('пустая дата начала → пустая строка', () => {
    expect(safeEndDate('')).toBe('');
    expect(safeEndDate(undefined, 12)).toBe('');
  });

  it('некорректная дата начала → пустая строка вместо исключения', () => {
    expect(safeEndDate('not-a-date', 12)).toBe('');
    expect(safeEndDate('2026-13-01', 6)).toBe('');
  });
});
