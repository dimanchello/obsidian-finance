import { describe, it, expect } from 'vitest';
import { pageRange } from '../ui/pagination';

describe('pageRange', () => {
  it('короткий список показывает все страницы', () => {
    expect(pageRange(0, 5, false)).toEqual([0, 1, 2, 3, 4]);
  });

  it('первая и последняя страницы всегда видны', () => {
    const p = pageRange(50, 100, false);
    expect(p[0]).toBe(0);
    expect(p[p.length - 1]).toBe(99);
  });

  it('число кнопок ограничено независимо от количества страниц', () => {
    for (const total of [50, 500, 5000, 100000]) {
      for (const cur of [0, 1, Math.floor(total / 2), total - 2, total - 1]) {
        expect(pageRange(cur, total, false).length).toBeLessThanOrEqual(11);
        expect(pageRange(cur, total, true).length).toBeLessThanOrEqual(7);
      }
    }
  });

  it('многоточие стоит ровно там, где есть разрыв', () => {
    for (const cur of [0, 3, 4, 50, 95, 96, 99]) {
      const p = pageRange(cur, 100, false);
      for (let i = 1; i < p.length; i++) {
        const prev = p[i - 1];
        const next = p[i];
        if (prev === -1 || next === -1) continue;
        expect(next - prev).toBe(1);
      }
      // Разрыв всегда закрыт многоточием
      expect(p.filter(x => x === -1).length).toBeGreaterThan(0);
    }
    expect(pageRange(50, 100, false).filter(p => p === -1)).toHaveLength(2);
    expect(pageRange(99, 100, false).filter(p => p === -1)).toHaveLength(1);
    expect(pageRange(0, 100, false).filter(p => p === -1)).toHaveLength(1);
  });

  it('страницы идут по возрастанию и без повторов', () => {
    const p = pageRange(50, 100, false).filter(x => x !== -1);
    expect(p).toEqual([...new Set(p)].sort((a, b) => a - b));
  });

  it('текущая страница всегда в списке', () => {
    for (const cur of [0, 3, 4, 50, 95, 96, 99]) {
      expect(pageRange(cur, 100, false)).toContain(cur);
      expect(pageRange(cur, 100, true)).toContain(cur);
    }
  });

  it('на мобильном окно уже', () => {
    expect(pageRange(50, 100, true).length).toBeLessThan(pageRange(50, 100, false).length);
  });
});
