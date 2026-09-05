/**
 * Single source of truth for the string literals that describe entity state.
 *
 * The union types in `types.ts` are derived from these objects, and the runtime
 * validators in `domain/validate.ts` read their values — so a status exists in
 * exactly one place. Adding a member here widens the type and the validator at
 * the same time; there is no second list to keep in sync.
 *
 * Compared against `x.status === CreditStatus.PAID` rather than `'paid'`: the
 * literal form already type-checks, but the named form is greppable and renames
 * in one edit.
 */

// ── Records ───────────────────────────────────────────────────────────────

export const RecordType = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;

// ── Debts ─────────────────────────────────────────────────────────────────

/** `LENT` = money owed to the user, `BORROWED` = money the user owes. */
export const DebtDirection = {
  LENT: 'lent',
  BORROWED: 'borrowed',
} as const;

export const DebtMovementType = {
  BORROW: 'borrow',
  REPAY: 'repay',
} as const;

// ── Credits ───────────────────────────────────────────────────────────────

export const CreditType = {
  CONSUMER: 'consumer',
  AUTO: 'auto',
  MORTGAGE: 'mortgage',
} as const;

/** A credit ends as `PAID`; a deposit ends as `CLOSED`. Not interchangeable. */
export const CreditStatus = {
  ACTIVE: 'active',
  PAID: 'paid',
} as const;

export const EarlyRepaymentOption = {
  TERM: 'term',
  AMOUNT: 'amount',
} as const;

// ── Deposits ──────────────────────────────────────────────────────────────

export const DepositType = {
  TERM: 'term',
  DEMAND: 'demand',
  SAVINGS: 'savings',
} as const;

export const DepositStatus = {
  ACTIVE: 'active',
  CLOSED: 'closed',
} as const;

export const DepositAccrualType = {
  TO_ACCOUNT: 'to_account',
  CAPITALIZATION: 'capitalization',
} as const;

// ── Schedules (credit payments and deposit accruals share these) ──────────

export const PaymentStatus = {
  PENDING: 'pending',
  PAID: 'paid',
} as const;

// ── Currency exchange ─────────────────────────────────────────────────────

export const CurrencyOperationType = {
  BUY: 'buy',
  SELL: 'sell',
  ADD: 'add',
  SPEND: 'spend',
} as const;

// ── Default entity labels ─────────────────────────────────────────────────

export const DEFAULT_CREDIT_NAME = 'Кредит';
export const DEFAULT_DEPOSIT_NAME = 'Вклад';
export const DEFAULT_DEBT_CATEGORY = 'Долг';
