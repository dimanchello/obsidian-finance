export const RecordType = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;

export const DebtDirection = {
  BORROWED: 'borrowed',
  LENT: 'lent',
} as const;

export const EntityStatus = {
  ACTIVE: 'active',
  CLOSED: 'closed',
} as const;

export const PaymentStatus = {
  PENDING: 'pending',
  PAID: 'paid',
} as const;

export const DepositType = {
  TERM: 'term',
  DEMAND: 'demand',
  SAVINGS: 'savings',
} as const;

export const CreditType = {
  CONSUMER: 'consumer',
  AUTO: 'auto',
  MORTGAGE: 'mortgage',
} as const;

export const DEFAULT_CREDIT_NAME = 'Кредит';
export const DEFAULT_DEPOSIT_NAME = 'Вклад';
export const DEFAULT_DEBT_CATEGORY = 'Долг';
