import { DepositRecord } from '../types';
import { DepositAccrualType, DepositType, PaymentStatus } from '../constants';
import { safeEndDate } from './dateMath';
import { round2, sumMoney } from './money';
import { isFutureTransaction } from './records';
import type { Translations } from '../i18n';

export function getDepositEndDate(deposit: DepositRecord): string {
  return safeEndDate(deposit.startDate, deposit.termMonths);
}

export function getDepositAccrued(deposit: DepositRecord): number {
  return sumMoney((deposit.accruals ?? []).filter(a => a.status === PaymentStatus.PAID).map(a => a.amount));
}

export function getDepositProfit(deposit: DepositRecord): number {
  return sumMoney((deposit.accruals ?? []).map(a => a.amount));
}

export function getDepositInitialAmount(deposit: DepositRecord): number {
  const topUps = sumMoney((deposit.topUps ?? []).map(t => t.amount));
  const withdrawals = sumMoney((deposit.withdrawals ?? []).map(w => w.amount));
  const capitalizedInterest = deposit.accrualType === DepositAccrualType.CAPITALIZATION
    ? getDepositAccrued(deposit)
    : 0;
  return round2(Math.max(0, deposit.amount - topUps + withdrawals - capitalizedInterest));
}

/** Reconstructs the projected balance immediately before a date from the original principal and dated movements. */
export function getDepositProjectedBalanceBeforeDate(deposit: DepositRecord, date: string): number {
  const topUpsBeforeDate = sumMoney((deposit.topUps ?? [])
    .filter(topUp => topUp.date < date)
    .map(topUp => topUp.amount));
  const withdrawalsBeforeDate = sumMoney((deposit.withdrawals ?? [])
    .filter(withdrawal => withdrawal.date < date)
    .map(withdrawal => withdrawal.amount));
  const capitalizedInterestBeforeDate = deposit.accrualType === DepositAccrualType.CAPITALIZATION
    ? sumMoney((deposit.accruals ?? [])
      .filter(accrual => accrual.dueDate < date)
      .map(accrual => accrual.amount))
    : 0;

  return round2(Math.max(
    0,
    getDepositInitialAmount(deposit)
      + topUpsBeforeDate
      - withdrawalsBeforeDate
      + capitalizedInterestBeforeDate
  ));
}

export function getDepositCurrentAmount(deposit: DepositRecord, now = new Date()): number {
  const futureTopUps = sumMoney((deposit.topUps ?? [])
    .filter(topUp => isFutureTransaction(topUp, now))
    .map(topUp => topUp.amount));
  const futureWithdrawals = sumMoney((deposit.withdrawals ?? [])
    .filter(withdrawal => isFutureTransaction(withdrawal, now))
    .map(withdrawal => withdrawal.amount));
  return round2(Math.max(0, deposit.amount - futureTopUps + futureWithdrawals));
}

export function getDepositTypeLabel(type: DepositType, tr: Translations): string {
  switch (type) {
    case DepositType.DEMAND:
      return tr.depositTypeDemand;
    case DepositType.SAVINGS:
      return tr.depositTypeSavings;
    case DepositType.TERM:
    default:
      return tr.depositTypeTerm;
  }
}
