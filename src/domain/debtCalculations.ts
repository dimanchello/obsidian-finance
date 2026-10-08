import { DebtRecord } from '../types';
import { round2, sumMoney } from './money';
import { DebtMovementType } from '../constants';
import { isFutureTransaction } from './records';

const PERCENT_100 = 100;

export function getDebtRepaid(debt: DebtRecord): number {
  return sumMoney(debt.movements.filter(m => m.type === DebtMovementType.REPAY).map(m => m.amount));
}

export function getDebtOriginal(debt: DebtRecord): number {
  return sumMoney(debt.movements.filter(m => m.type === DebtMovementType.BORROW).map(m => m.amount));
}

export function getDebtWithInterest(debt: DebtRecord): number {
  const original = getDebtOriginal(debt);
  if (debt.interestRate <= 0) return original;
  return round2(original + (original * debt.interestRate / PERCENT_100));
}

export function getDebtOriginalAsOf(debt: DebtRecord, now = new Date()): number {
  return sumMoney(debt.movements
    .filter(movement => movement.type === DebtMovementType.BORROW && !isFutureTransaction(movement, now))
    .map(movement => movement.amount));
}

export function getDebtRepaidAsOf(debt: DebtRecord, now = new Date()): number {
  return sumMoney(debt.movements
    .filter(movement => movement.type === DebtMovementType.REPAY && !isFutureTransaction(movement, now))
    .map(movement => movement.amount));
}

export function getDebtWithInterestAsOf(debt: DebtRecord, now = new Date()): number {
  const original = getDebtOriginalAsOf(debt, now);
  if (debt.interestRate <= 0) return original;
  return round2(original + (original * debt.interestRate / PERCENT_100));
}

/** Current debt balance with future-dated movements excluded. */
export function getDebtAmountAsOf(debt: DebtRecord, now = new Date()): number {
  const futureBorrowed = sumMoney(debt.movements
    .filter(movement => movement.type === DebtMovementType.BORROW && isFutureTransaction(movement, now))
    .map(movement => movement.amount));
  const futureRepaid = sumMoney(debt.movements
    .filter(movement => movement.type === DebtMovementType.REPAY && isFutureTransaction(movement, now))
    .map(movement => movement.amount));
  return Math.max(0, round2(debt.amount - futureBorrowed + futureRepaid));
}

export function getDebtRemaining(debt: DebtRecord, now = new Date()): number {
  return Math.max(0, round2(getDebtWithInterestAsOf(debt, now) - getDebtRepaidAsOf(debt, now)));
}

export function isDebtPaidOff(debt: DebtRecord, now = new Date()): boolean {
  return getDebtRemaining(debt, now) <= 0;
}
