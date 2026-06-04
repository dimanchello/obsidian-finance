export type RecordType = 'income' | 'expense';
export type SortField  = 'date' | 'amount' | 'category' | 'type' | 'payer' | 'tag' | 'createdAt';
export type SortDir    = 'asc'  | 'desc';
export type DebtMovementType = 'borrow' | 'repay';

export interface FinanceRecord {
  id:             string;
  createdAt:      number;   // ms timestamp — stable sort key
  date:           string;   // YYYY-MM-DD
  time:           string;   // HH:MM  or  ""
  type:           RecordType;
  amount:         number;
  category:       string;
  tag:            string;
  payer:          string;
  note:           string;
  attachmentPath: string;
  isInternal?:    boolean;  // if true, excluded from income/expense stats
  linkedId?:      string;   // links to credit/deposit/debt record (hidden from UI)
  exchangeRate?:  number;   // optional currency exchange rate (e.g., 95.5 for ₽→$)
}

export interface DebtMovement {
  id:        string;
  type:      DebtMovementType;
  amount:    number;
  date:      string;   // YYYY-MM-DD
  time:      string;   // HH:MM
  createdAt: number;
  note:      string;
}

export type DebtDirection = 'lent' | 'borrowed';  // lent = мне должны, borrowed = я должен

export interface DebtRecord {
  id:           string;
  person:       string;
  amount:       number;   // current total (sum borrow - sum repay) with interest
  originalAmount: number; // original amount without interest
  interestRate: number;   // percentage (e.g., 10 = 10%)
  direction:    DebtDirection;
  date:         string;   // creation date
  time:         string;
  dueDate:      string;   // deadline for repayment
  createdAt:    number;
  note:         string;
  movements:    DebtMovement[];
}

export interface AccountMeta {
  name:         string;   // custom display name; "" → use note filename
  currency:     string;   // "₽" | "$" | "BTC" etc.
  accentColor?: string;   // custom accent color for this account
}

export interface AccountData extends AccountMeta {
  version:    number;
  records:    FinanceRecord[];
  debts:      DebtRecord[];
  credits:    CreditRecord[];
  deposits:   DepositRecord[];
  categories: string[];
  tags:       string[];
  payers:     string[];
}

export interface FilterState {
  search: string; type: 'all' | RecordType;
  category: string; tag: string; payer: string;
  dateFrom: string; dateTo: string;
  showInternal?: 'all' | 'only';
}

export interface SortState { field: SortField; dir: SortDir; }

export type DebtSortField = 'date' | 'amount' | 'person' | 'createdAt';
export interface DebtFilterState {
  search: string;
  status: 'all' | 'paid' | 'unpaid';
  direction: 'all' | DebtDirection;
  dateFrom: string;
  dateTo: string;
  person: string;
}

export interface ViewState {
  sort: SortState; filter: FilterState; page: number; pageSize: number;
  debtPage?: number;
  debtSort?: { field: DebtSortField; dir: SortDir };
  debtFilter?: DebtFilterState;
  creditPage?: number;
  creditSort?: { field: CreditSortField; dir: SortDir };
  creditFilter?: CreditFilterState;
  depositPage?: number;
  depositSort?: { field: DepositSortField; dir: SortDir };
  depositFilter?: DepositFilterState;
  recordsColumns?: Record<string, boolean>;
  debtsColumns?: Record<string, boolean>;
  creditsColumns?: Record<string, boolean>;
  depositsColumns?: Record<string, boolean>;
}

export interface PluginSettings {
  defaultCurrency: string;
  defaultPageSize: number;
  customCurrencies: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultCurrency: '₽',
  defaultPageSize: 25,
  customCurrencies: ['₽'],
};

export const DEFAULT_FILTER: FilterState = {
  search: '', type: 'all', category: '', tag: '', payer: '', dateFrom: '', dateTo: '',
  showInternal: 'all',
};

export const DEFAULT_SORT: SortState = { field: 'createdAt', dir: 'desc' };

export const DEFAULT_DEBT_FILTER: DebtFilterState = {
  search: '', status: 'all', direction: 'all', dateFrom: '', dateTo: '', person: '',
};

export type CreditSortField = 'date' | 'amount' | 'bankName' | 'createdAt';
export interface CreditFilterState {
  search: string;
  status: 'all' | 'active' | 'paid';
  bankName: string;
  type: 'all' | CreditType;
  dateFrom: string;
  dateTo: string;
}

export type DepositSortField = 'date' | 'amount' | 'bankName' | 'createdAt';
export interface DepositFilterState {
  search: string;
  status: 'all' | 'active' | 'closed';
  bankName: string;
  type: 'all' | DepositType;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_CREDIT_FILTER: CreditFilterState = {
  search: '', status: 'all', bankName: '', type: 'all', dateFrom: '', dateTo: '',
};

export const DEFAULT_DEPOSIT_FILTER: DepositFilterState = {
  search: '', status: 'all', bankName: '', type: 'all', dateFrom: '', dateTo: '',
};

export const COMMON_CURRENCIES = [
  '₽', '$', '€', '£', '¥', '₸', '₴', '₾', 'CHF',
  'BTC', 'ETH', 'USDT', 'USDC', 'TON', 'SOL',
];

export const CREDIT_PAGE_SIZE = 20;
export const MOBILE_BREAKPOINT = 480;
export const SEARCH_DEBOUNCE_MS = 280;
export const PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100, 200, 500] as const;
export const PAGE_RANGE_THRESHOLD = 7;
export const FOCUS_DELAY_MS = 20;
export const SKELETON_CARD_COUNT = 3;
export const PLURAL_THRESHOLD = 5;

export type CreditType = 'consumer' | 'auto' | 'mortgage';
export type CreditStatus = 'active' | 'paid';
export type CreditPaymentStatus = 'pending' | 'paid';

export interface CreditPayment {
  id: string;
  amount: number;
  dueDate: string;
  status: CreditPaymentStatus;
  paidDate?: string;
  note?: string;
}

export interface CreditRecord {
  id: string;
  name: string;
  type: CreditType;
  bankName: string;
  originalAmount: number;
  currentAmount: number;
  interestRate: number;
  monthlyPayment: number;
  termMonths: number;
  startDate: string;
  createdAt: number;
  note: string;
  status: CreditStatus;
  earlyRepaymentOption: 'term' | 'amount' | null;
  payments: CreditPayment[];
}

export type DepositType = 'term' | 'demand' | 'savings';
export type DepositAccrualType = 'to_account' | 'capitalization';
export type DepositStatus = 'active' | 'closed';
export type DepositAccrualStatus = 'pending' | 'paid';

export interface DepositAccrual {
  id: string;
  amount: number;
  dueDate: string;
  status: DepositAccrualStatus;
  paidDate?: string;
  note?: string;
}

export interface DepositTopUp {
  id: string;
  amount: number;
  date: string;
  time: string;
  createdAt: number;
  note: string;
}

export interface DepositWithdrawal {
  id: string;
  amount: number;
  date: string;
  time: string;
  createdAt: number;
  note: string;
}

export interface DepositRecord {
  id: string;
  name: string;
  type: DepositType;
  bankName: string;
  amount: number;
  interestRate: number;
  startDate: string;
  termMonths: number;
  accrualType: DepositAccrualType;
  createdAt: number;
  note: string;
  status: DepositStatus;
  accruals: DepositAccrual[];
  topUps: DepositTopUp[];
  withdrawals: DepositWithdrawal[];
}
