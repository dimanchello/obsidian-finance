import { CreditRecord, DebtRecord, DepositRecord } from '../types';
import { CreditStatus, DepositStatus, EntityListTab } from '../constants';
import { isDebtPaidOff } from './debtCalculations';

/** Open = still has a balance to settle / still running; closed = paid off or closed. */
export function isDebtOpen(debt: DebtRecord): boolean {
  return !isDebtPaidOff(debt);
}

export function isCreditOpen(credit: CreditRecord): boolean {
  return credit.status === CreditStatus.ACTIVE;
}

export function isDepositOpen(deposit: DepositRecord): boolean {
  return deposit.status === DepositStatus.ACTIVE;
}

export function matchesListTab(isOpen: boolean, tab: EntityListTab): boolean {
  if (tab === EntityListTab.ALL) return true;
  return tab === EntityListTab.OPEN ? isOpen : !isOpen;
}

/** Tab to show so that an entity reached via a deep link is visible. */
export function listTabFor(isOpen: boolean): EntityListTab {
  return isOpen ? EntityListTab.OPEN : EntityListTab.CLOSED;
}
