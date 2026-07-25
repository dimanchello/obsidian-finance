const CENTS = 100;

/** Every amount that reaches storage must pass through this. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * CENTS) / CENTS;
}

/** Rounds at each step so a long accrual chain cannot drift on float error. */
export function sumMoney(values: number[]): number {
  return values.reduce((acc, v) => round2(acc + round2(v)), 0);
}

/** Float sums never land exactly on 0 — compare within half a cent. */
export function isZeroMoney(n: number): boolean {
  return Math.abs(n) < 1 / (2 * CENTS);
}
