import { describe, it, expect } from 'vitest';
import { round2, sumMoney, isZeroMoney } from '../domain/money';

describe('round2', () => {
  it('округляет до копеек', () => {
    expect(round2(1.006)).toBe(1.01);
    expect(round2(1.004)).toBe(1);
    expect(round2(2.676)).toBe(2.68);
  });

  it('округляет по двоичному представлению, а не по десятичной записи', () => {
    // 1.005 в float — это 1.00499…, поэтому вниз. Так же вёл себя код до вынесения round2.
    expect(round2(1.005)).toBe(1);
  });

  it('не портит уже округлённые значения', () => {
    expect(round2(100)).toBe(100);
    expect(round2(0)).toBe(0);
    expect(round2(12.34)).toBe(12.34);
  });

  it('чинит классическую float-погрешность', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('работает с отрицательными', () => {
    expect(round2(-1.005)).toBe(-1);
    expect(round2(-12.346)).toBe(-12.35);
  });

  it('нечисловые значения превращает в 0', () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe('sumMoney', () => {
  it('пустой список даёт 0', () => {
    expect(sumMoney([])).toBe(0);
  });

  it('суммирует без накопления погрешности', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
  });

  it('на длинной цепочке не расходится с ожидаемым', () => {
    const values = Array.from({ length: 120 }, () => 1234.56);
    expect(sumMoney(values)).toBe(148147.2);
  });

  it('учитывает знак', () => {
    expect(sumMoney([100, -50.5])).toBe(49.5);
  });
});

describe('isZeroMoney', () => {
  it('считает нулём остаток меньше половины копейки', () => {
    expect(isZeroMoney(0)).toBe(true);
    expect(isZeroMoney(0.001)).toBe(true);
    expect(isZeroMoney(-0.001)).toBe(true);
  });

  it('копейка нулём не считается', () => {
    expect(isZeroMoney(0.01)).toBe(false);
    expect(isZeroMoney(-0.01)).toBe(false);
    expect(isZeroMoney(100)).toBe(false);
  });
});
