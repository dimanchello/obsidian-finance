import { DebtRecord } from '../types';
import { round2, sumMoney } from './money';
import { DebtMovementType } from '../constants';

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

export function getDebtRemaining(debt: DebtRecord): number {
  return Math.max(0, round2(getDebtWithInterest(debt) - getDebtRepaid(debt)));
}

export function isDebtPaidOff(debt: DebtRecord): boolean {
  return getDebtRemaining(debt) <= 0;
}
