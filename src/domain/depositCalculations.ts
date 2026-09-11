import { DepositRecord } from '../types';
import { DepositAccrualType, DepositType, PaymentStatus } from '../constants';
import { safeEndDate } from './dateMath';
import { round2, sumMoney } from './money';
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

export function getDepositCurrentAmount(deposit: DepositRecord): number {
  return round2(Math.max(0, deposit.amount));
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
