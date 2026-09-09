import { describe, it, expect } from 'vitest';
import { defaultViewState, parseViewState } from '../domain/viewState';

describe('defaultViewState', () => {
  it('заполняет все разделы и берёт pageSize из настроек', () => {
    const s = defaultViewState(50);
    expect(s.pageSize).toBe(50);
    expect(s.page).toBe(0);
    expect(s.sort).toEqual({ field: 'date', dir: 'desc' });
    expect(s.debtFilter).toBeDefined();
    expect(s.creditFilter).toBeDefined();
    expect(s.depositFilter).toBeDefined();
  });
});

describe('parseViewState', () => {
  it('незнакомая форма даёт дефолты, а не исключение', () => {
    expect(parseViewState(null, 25)).toEqual(defaultViewState(25));
    expect(parseViewState('мусор', 25)).toEqual(defaultViewState(25));
    expect(parseViewState([], 25)).toEqual(defaultViewState(25));
    expect(parseViewState({ совсем: 'не то' }, 25)).toEqual(defaultViewState(25));
  });

  it('сохраняет известные поля (только не фильтры)', () => {
    const s = parseViewState({
      sort: { field: 'amount', dir: 'asc' },
      pageSize: 100,
    }, 25);

    expect(s.sort).toEqual({ field: 'amount', dir: 'asc' });
    expect(s.pageSize).toBe(100);
  });

  it('страницы всегда сбрасываются в 0', () => {
    const s = parseViewState({ page: 7, debtPage: 3, creditPage: 2, depositPage: 9 }, 25);
    expect(s.page).toBe(0);
    expect(s.debtPage).toBe(0);
    expect(s.creditPage).toBe(0);
    expect(s.depositPage).toBe(0);
  });

  it('неизвестное поле сортировки откатывается на date', () => {
    const s = parseViewState({ sort: { field: 'createdAt', dir: 'вбок' } }, 25);
    expect(s.sort).toEqual({ field: 'date', dir: 'desc' });
  });



  it('видимость колонок принимает только булевы значения', () => {
    const s = parseViewState({
      recordsColumns: { date: true, amount: false, note: 'да' },
    }, 25);
    expect(s.recordsColumns).toEqual({ date: true, amount: false });
  });

  it('нулевой или отрицательный pageSize откатывается на настройку', () => {
    expect(parseViewState({ pageSize: 0 }, 25).pageSize).toBe(25);
    expect(parseViewState({ pageSize: -5 }, 25).pageSize).toBe(25);
    expect(parseViewState({ pageSize: NaN }, 25).pageSize).toBe(25);
  });

  it('сохраняет настройки вкладки обзора', () => {
    const s = parseViewState({
      overviewDateFrom: '2026-01-01',
      overviewDateTo: '2026-06-30',
      overviewGroupBy: 'tag',
    }, 25);
    expect(s.overviewDateFrom).toBe('2026-01-01');
    expect(s.overviewDateTo).toBe('2026-06-30');
    expect(s.overviewGroupBy).toBe('tag');
    expect(s.overviewAllTime).toBe(false);
  });

  it('сохраняет выбор "за всё время"', () => {
    expect(parseViewState({ overviewAllTime: true }, 25).overviewAllTime).toBe(true);
  });

  it('нелогическое значение overviewAllTime трактуется как false', () => {
    expect(parseViewState({ overviewAllTime: 'да' }, 25).overviewAllTime).toBe(false);
    expect(parseViewState({}, 25).overviewAllTime).toBe(false);
  });
});
