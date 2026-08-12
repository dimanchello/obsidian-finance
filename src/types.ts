export type RecordType = 'income' | 'expense';
export type SortField  = 'date' | 'amount' | 'category' | 'type' | 'payer' | 'tag';
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
  linkedId?:        string;   // links to credit/deposit/debt record (hidden from UI)
  linkedMovementId?: string | undefined;   // links to the specific DebtMovement within a debt
  exchangeRate?:  number | undefined;   // optional currency exchange rate (e.g., 95.5 for ₽→$)
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
  amount:       number;   // current total (sum borrow - sum repay) WITHOUT interest
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
  accentColor?: string | undefined;   // custom accent color for this account
}

export interface AccountData extends AccountMeta {
  version:    number;
  records:    FinanceRecord[];
  debts:      DebtRecord[];
  credits:    CreditRecord[];
  deposits:   DepositRecord[];
  exchanges:  CurrencyExchange[];
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

export type DebtSortField = 'date' | 'amount' | 'person';
export interface DebtFilterState {
  search: string;
  status: 'all' | 'paid' | 'unpaid';
  direction: 'all' | DebtDirection;
  dateFrom: string;
  dateTo: string;
  person: string;
}

export type CreditAnalyticsGroupBy  = 'month' | 'quarter' | 'year' | 'type' | 'bank';
export type DepositAnalyticsGroupBy = 'month' | 'quarter' | 'year' | 'type' | 'bank';

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
  currencyPage?: number;
  currencySort?: { field: CurrencySortField; dir: SortDir };
  currencyFilter?: CurrencyFilterState;
  recordsColumns?: Record<string, boolean>;
  debtsColumns?: Record<string, boolean>;
  creditsColumns?: Record<string, boolean>;
  depositsColumns?: Record<string, boolean>;
  currencyColumns?: Record<string, boolean>;
  creditActiveTab?:          'list' | 'analytics';
  creditAnalyticsGroupBy?:   CreditAnalyticsGroupBy;
  creditAnalyticsDateFrom?:  string;
  creditAnalyticsDateTo?:    string;
  depositActiveTab?:         'list' | 'analytics';
  depositAnalyticsGroupBy?:  DepositAnalyticsGroupBy;
  depositAnalyticsDateFrom?: string;
  depositAnalyticsDateTo?:   string;
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

export const DEFAULT_SORT: SortState = { field: 'date', dir: 'desc' };

export const DEFAULT_DEBT_FILTER: DebtFilterState = {
  search: '', status: 'all', direction: 'all', dateFrom: '', dateTo: '', person: '',
};

export type CreditSortField = 'date' | 'amount' | 'bankName';
export interface CreditFilterState {
  search: string;
  status: 'all' | 'active' | 'paid';
  bankName: string;
  type: 'all' | CreditType;
  dateFrom: string;
  dateTo: string;
}

export type DepositSortField = 'date' | 'amount' | 'bankName';
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

export const DEFAULT_ACCENT_COLOR   = '#7c3aed';
export const CHART_COLOR_INCOME     = '#22c55e';
export const CHART_COLOR_EXPENSE    = '#ef4444';
export const CHART_PALETTE = [
  '#6366f1','#f59e0b','#10b981','#f43f5e','#3b82f6',
  '#8b5cf6','#14b8a6','#fb923c','#22c55e','#a855f7',
  '#06b6d4','#84cc16','#e879f9','#64748b',
];

export const CHART_SVG_HEIGHT             = 340;
export const CHART_SVG_PAD_LEFT           = 45;
export const CHART_SVG_PAD_RIGHT          = 12;
export const CHART_SVG_PAD_TOP            = 18;
export const CHART_SVG_PAD_BOTTOM         = 96;
export const CHART_MIN_GROUP_MOBILE       = 35;
export const CHART_MIN_GROUP_DESKTOP      = 60;
export const CHART_MAX_BAR_W_MOBILE       = 20;
export const CHART_MAX_BAR_W_SMALL        = 50;
export const CHART_MAX_BAR_W_MED          = 30;
export const CHART_MAX_BAR_W_LARGE        = 20;
export const CHART_BAR_RATIO_MOBILE       = 0.40;
export const CHART_BAR_RATIO_DESKTOP      = 0.35;
export const CHART_MAX_ITEMS              = 20;
export const CHART_BAR_GAP                = 2;
export const CHART_BAR_RADIUS             = 3;
export const CHART_LABEL_ROTATE_THRESHOLD = 10;

export const CREDIT_PAGE_SIZE = 20;
export const CREDIT_PAYMENT_PAGE_SIZE = 15;
export const DEPOSIT_ACCRUAL_PAGE_SIZE = 20;
export const MOBILE_BREAKPOINT = 480;
export const SEARCH_DEBOUNCE_MS = 280;
export const PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100, 200, 500] as const;
export const PAGE_RANGE_THRESHOLD = 7;
export const FOCUS_DELAY_MS = 20;
export const AUTOFILL_BADGE_MS = 6_000;
export const SKELETON_CARD_COUNT = 3;
export const PLURAL_THRESHOLD = 5;
export const DAYS_IN_YEAR = 365;
export const ACCRUAL_STEP_MONTHLY = 12;
export const ONE_WEEK_MS = 604_800_000;
export const AUTO_TX_INTERVAL_MS = 3_600_000;
export const MINT_GUARD_MS = 3_000;
export const PERCENT_100 = 100;

export type CreditType = 'consumer' | 'auto' | 'mortgage';
export type CreditStatus = 'active' | 'paid';
export type CreditPaymentStatus = 'pending' | 'paid';

export interface CreditPayment {
  id: string;
  amount: number;
  dueDate: string;
  status: CreditPaymentStatus;
  paidDate?: string | undefined;
  note?: string | undefined;
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
  purchasePrice?: number;
  downPayment?: number;
  downPaymentType?: 'percent' | 'amount';
  downPaymentValue?: number;
  downPaymentDate?: string;
  downPaymentRecordId?: string | undefined;
  isEscrow?: boolean; // funds go to developer via escrow account, not added to balance
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
  paidDate?: string | undefined;
  note?: string | undefined;
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

export type CurrencyOperationType = 'buy' | 'sell' | 'add' | 'spend';
export type CurrencySortField = 'date' | 'amount' | 'targetCurrency' | 'provider';

export interface CurrencyExchange {
  id: string;
  createdAt: number;
  date: string;
  time: string;
  type: CurrencyOperationType;
  amountInAccountCurrency: number;
  targetCurrency: string;
  targetAmount: number;
  exchangeRate: number;
  provider: string;
  category?: string;
  fee?: number;
  note: string;
}

export interface CurrencyFilterState {
  search: string;
  type: 'all' | CurrencyOperationType;
  targetCurrency: string;
  provider: string;
  category: string;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_CURRENCY_FILTER: CurrencyFilterState = {
  search: '', type: 'all', targetCurrency: '', provider: '', category: '', dateFrom: '', dateTo: '',
};
