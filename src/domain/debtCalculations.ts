import { DebtMovement, DebtRecord, PERCENT_100 } from '../types';
import { round2, sumMoney } from './money';
import { DebtDirection, DebtMovementType } from '../constants';
import { isFutureTransaction } from './records';

export interface DebtsSummary {
  lentRemaining: number;
  lentCount: number;
  borrowedRemaining: number;
  borrowedCount: number;
}

const MOVEMENT_TYPE_ORDER: Record<DebtMovementType, number> = {
  [DebtMovementType.BORROW]: 0,
  [DebtMovementType.REPAY]: 1,
  [DebtMovementType.INTEREST]: 2,
};

export function getDebtMovementInterest(movement: DebtMovement): number {
  if (movement.type === DebtMovementType.INTEREST) {
    return round2(Math.max(0, movement.amount));
  }
  if (movement.type !== DebtMovementType.REPAY) return 0;
  return round2(Math.max(0, Math.min(movement.amount, movement.interestAmount ?? 0)));
}

export function getDebtMovementPrincipal(movement: DebtMovement): number {
  if (movement.type === DebtMovementType.BORROW) {
    return round2(Math.max(0, movement.amount));
  }
  if (movement.type === DebtMovementType.INTEREST) {
    return 0;
  }
  return round2(Math.max(0, movement.amount - getDebtMovementInterest(movement)));
}

/** Principal-first automatic interest: everything above remaining principal is interest. */
export function calcAutoRepaymentInterest(repayAmount: number, remainingPrincipal: number): number {
  const safeAmount = Math.max(0, repayAmount);
  const safePrincipal = Math.max(0, remainingPrincipal);
  return round2(Math.max(0, Math.min(safeAmount, safeAmount - safePrincipal)));
}

function movementTypeOrder(type: DebtMovementType): number {
  return MOVEMENT_TYPE_ORDER[type];
}

export function sortDebtMovementsChronologically(movements: DebtMovement[]): DebtMovement[] {
  return movements
    .map((movement, index) => ({ movement, index }))
    .sort((a, b) => {
      const dateCmp = a.movement.date.localeCompare(b.movement.date);
      if (dateCmp !== 0) return dateCmp;
      const timeCmp = a.movement.time.localeCompare(b.movement.time);
      if (timeCmp !== 0) return timeCmp;
      const typeCmp = movementTypeOrder(a.movement.type) - movementTypeOrder(b.movement.type);
      if (typeCmp !== 0) return typeCmp;
      if (a.movement.createdAt !== b.movement.createdAt) {
        return a.movement.createdAt - b.movement.createdAt;
      }
      return a.index - b.index;
    })
    .map(entry => entry.movement);
}

/** Current principal remaining (borrows minus principal portion of repayments), clamped to >= 0. */
export function calculateDebtPrincipalAmount(debt: DebtRecord): number {
  if (debt.movements.length === 0) {
    return Math.max(0, round2(debt.amount));
  }
  const hasBorrow = debt.movements.some(m => m.type === DebtMovementType.BORROW);
  const seed = hasBorrow ? 0 : Math.max(0, round2(debt.originalAmount));
  const delta = sumMoney(
    debt.movements.map(m =>
      m.type === DebtMovementType.BORROW
        ? round2(Math.max(0, m.amount))
        : -getDebtMovementPrincipal(m)
    )
  );
  return Math.max(0, round2(seed + delta));
}

function isRepayOrInterest(type: DebtMovementType): boolean {
  return type === DebtMovementType.REPAY || type === DebtMovementType.INTEREST;
}

function isBeforeRepayTarget(
  candidate: DebtMovement,
  target: Pick<DebtMovement, 'id' | 'type' | 'date' | 'time' | 'createdAt'>
): boolean {
  const dateCmp = candidate.date.localeCompare(target.date);
  if (dateCmp !== 0) return dateCmp < 0;
  const timeCmp = candidate.time.localeCompare(target.time);
  if (timeCmp !== 0) return timeCmp < 0;
  const orderCmp = movementTypeOrder(candidate.type) - movementTypeOrder(target.type);
  if (orderCmp !== 0) return orderCmp < 0;
  return candidate.createdAt < target.createdAt;
}

/** Remaining principal immediately before `target` (for editing/inserting dated repayments). */
export function getRemainingPrincipalBeforeMovement(
  debt: DebtRecord,
  target?: Pick<DebtMovement, 'id' | 'type' | 'date' | 'time' | 'createdAt'>
): number {
  if (!target) {
    return calculateDebtPrincipalAmount(debt);
  }
  if (debt.movements.length === 0) {
    return Math.max(0, round2(debt.originalAmount > 0 ? debt.originalAmount : debt.amount));
  }

  const ordered = sortDebtMovementsChronologically(debt.movements);
  const hasBorrow = ordered.some(m => m.type === DebtMovementType.BORROW);
  let remaining = hasBorrow ? 0 : Math.max(0, round2(debt.originalAmount));

  for (const movement of ordered) {
    if (movement.id === target.id) continue;
    if (!isBeforeRepayTarget(movement, target)) break;
    if (movement.type === DebtMovementType.BORROW) {
      remaining = round2(remaining + Math.max(0, movement.amount));
    } else if (movement.type === DebtMovementType.REPAY) {
      remaining = Math.max(0, round2(remaining - getDebtMovementPrincipal(movement)));
    }
  }

  return remaining;
}

export function getDebtRepaid(debt: DebtRecord): number {
  return sumMoney(debt.movements.filter(m => isRepayOrInterest(m.type)).map(m => m.amount));
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
    .filter(movement => isRepayOrInterest(movement.type) && !isFutureTransaction(movement, now))
    .map(movement => movement.amount));
}

export function getDebtWithInterestAsOf(debt: DebtRecord, now = new Date()): number {
  const original = getDebtOriginalAsOf(debt, now);
  if (debt.interestRate <= 0) return original;
  return round2(original + (original * debt.interestRate / PERCENT_100));
}

/** Current debt principal balance with future-dated movements excluded. */
export function getDebtAmountAsOf(debt: DebtRecord, now = new Date()): number {
  const futureBorrowed = sumMoney(debt.movements
    .filter(movement => movement.type === DebtMovementType.BORROW && isFutureTransaction(movement, now))
    .map(movement => movement.amount));
  const futureRepaidPrincipal = sumMoney(debt.movements
    .filter(movement => movement.type === DebtMovementType.REPAY && isFutureTransaction(movement, now))
    .map(getDebtMovementPrincipal));
  return Math.max(0, round2(debt.amount - futureBorrowed + futureRepaidPrincipal));
}

export function getDebtRemaining(debt: DebtRecord, now = new Date()): number {
  const original = getDebtOriginalAsOf(debt, now);
  const withInterest = getDebtWithInterestAsOf(debt, now);
  const contractualInterest = Math.max(0, round2(withInterest - original));
  const pastSettlements = debt.movements.filter(
    movement => isRepayOrInterest(movement.type) && !isFutureTransaction(movement, now)
  );
  const totalRepaid = sumMoney(pastSettlements.map(m => m.amount));
  const interestRepaid = sumMoney(pastSettlements.map(getDebtMovementInterest));
  const extraInterest = Math.max(0, round2(interestRepaid - contractualInterest));
  const effectiveRepaid = round2(totalRepaid - extraInterest);
  return Math.max(0, round2(withInterest - effectiveRepaid));
}

export function isDebtPaidOff(debt: DebtRecord, now = new Date()): boolean {
  return getDebtRemaining(debt, now) <= 0;
}

export function calculateDebtsSummary(debts: DebtRecord[], now = new Date()): DebtsSummary {
  const openLent = debts.filter(d => d.direction === DebtDirection.LENT && !isDebtPaidOff(d, now));
  const openBorrowed = debts.filter(d => d.direction === DebtDirection.BORROWED && !isDebtPaidOff(d, now));

  return {
    lentRemaining: sumMoney(openLent.map(d => getDebtRemaining(d, now))),
    lentCount: openLent.length,
    borrowedRemaining: sumMoney(openBorrowed.map(d => getDebtRemaining(d, now))),
    borrowedCount: openBorrowed.length,
  };
}

