import type {
  RecordType as RecordTypeConst,
  DebtDirection as DebtDirectionConst,
  DebtMovementType as DebtMovementTypeConst,
  CreditType as CreditTypeConst,
  CreditStatus as CreditStatusConst,
  EarlyRepaymentOption as EarlyRepaymentOptionConst,
  DepositType as DepositTypeConst,
  DepositStatus as DepositStatusConst,
  DepositAccrualType as DepositAccrualTypeConst,
  PaymentStatus as PaymentStatusConst,
  CurrencyOperationType as CurrencyOperationTypeConst,
} from './constants';

/** Value unions derived from `constants.ts` — the literals live there only. */
type ValueOf<T> = T[keyof T];

export type RecordType = ValueOf<typeof RecordTypeConst>;
export type SortField  = 'date' | 'amount' | 'category' | 'type' | 'payer' | 'tag';
export type SortDir    = 'asc'  | 'desc';
export type DebtMovementType = ValueOf<typeof DebtMovementTypeConst>;

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

export type DebtDirection = ValueOf<typeof DebtDirectionConst>;  // lent = мне должны, borrowed = я должен

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
export type OverviewGroupBy = 'category' | 'tag' | 'payer' | 'year' | 'month' | 'week';

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
  currencyActiveTab?: 'list' | 'analytics';
  recordsColumns?: Record<string, boolean>;
  debtsColumns?: Record<string, boolean>;
  creditsColumns?: Record<string, boolean>;
  depositsColumns?: Record<string, boolean>;
  currencyColumns?: Record<string, boolean>;
  debtExpandedId?: string;
  creditExpandedId?: string;
  depositExpandedId?: string;
  creditActiveTab?:          'list' | 'analytics';
  creditAnalyticsGroupBy?:   CreditAnalyticsGroupBy;
  creditAnalyticsDateFrom?:  string;
  creditAnalyticsDateTo?:    string;
  depositActiveTab?:         'list' | 'analytics';
  depositAnalyticsGroupBy?:  DepositAnalyticsGroupBy;
  depositAnalyticsDateFrom?: string;
  depositAnalyticsDateTo?:   string;
  overviewDateFrom?:         string;
  overviewDateTo?:           string;
  overviewGroupBy?:          OverviewGroupBy;
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
export const CHART_SVG_HEIGHT_COMPACT     = 140;
export const CHART_SVG_PAD_LEFT           = 45;
export const CHART_SVG_PAD_RIGHT          = 12;
export const CHART_SVG_PAD_TOP            = 18;
export const CHART_SVG_PAD_BOTTOM         = 96;
export const CHART_SVG_PAD_BOTTOM_COMPACT = 28;
export const CHART_COLOR_PRINCIPAL        = '#6366f1';
export const CHART_COLOR_INTEREST         = '#ef4444';
export const CHART_GRID_DIVISIONS_COMPACT = 3;
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
export const OVERVIEW_UPCOMING_DAYS = 30;
export const OVERVIEW_BURDEN_MONTHS = 3;
export const OVERVIEW_BURDEN_WARN   = 30;
export const OVERVIEW_BURDEN_DANGER = 50;
export const OVERVIEW_PRESET_MONTHS_3 = 3;
export const OVERVIEW_PRESET_MONTHS_6 = 6;
export const OVERVIEW_TREND_MONTHS = 6;
export const OVERVIEW_CHART_HEIGHT = 240;
export const OVERVIEW_CHART_PAD_LEFT = 50;
export const OVERVIEW_CHART_PAD_RIGHT = 16;
export const OVERVIEW_CHART_PAD_TOP = 16;
export const OVERVIEW_CHART_PAD_BOTTOM = 42;
export const OVERVIEW_LABEL_OFFSET_Y = 18;
export const OVERVIEW_BAR_GAP = 6;
export const OVERVIEW_GROUP_GAP = 18;
export const OVERVIEW_MIN_GROUP_W = 56;
export const OVERVIEW_MIN_GROUP_W_MOBILE = 44;
export const OVERVIEW_Y_TICKS = 4;
export const OVERVIEW_MIN_BAR_PCT = 2;
export const OVERVIEW_MAX_BAR_W = 40;
export const OVERVIEW_BAR_SPACING_PAD = 16;
export const OVERVIEW_BAR_RADIUS = 3;
export const OVERVIEW_LINE_STROKE_W = 2;
export const OVERVIEW_POINT_RADIUS = 4;
export const OVERVIEW_POINT_RADIUS_HOVER = 6;
export const OVERVIEW_SAVINGS_BENCHMARK = 20;
export const OVERVIEW_INPUT_DEBOUNCE_MS = 600;
export const OVERVIEW_DEPOSIT_CARD_MIN_W = 280;
export const OVERVIEW_DEPOSIT_TREND_MONTHS = 6;
export const CURRENCY_ROUNDING_PRECISION = 100;      // 2 decimal places
export const EXCHANGE_RATE_PRECISION = 10000;        // 4 decimal places

export type CreditType = ValueOf<typeof CreditTypeConst>;
export type CreditStatus = ValueOf<typeof CreditStatusConst>;
export type CreditPaymentStatus = ValueOf<typeof PaymentStatusConst>;

export interface CreditPayment {
  id: string;
  amount: number;
  dueDate: string;
  status: CreditPaymentStatus;
  paidDate?: string | undefined;
  note?: string | undefined;
  principalPart?: number | undefined;
  interestPart?: number | undefined;
  remainingDebt?: number | undefined;
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
  paymentDay?: number;
  createdAt: number;
  note: string;
  status: CreditStatus;
  earlyRepaymentOption: ValueOf<typeof EarlyRepaymentOptionConst> | null;
  payments: CreditPayment[];
  purchasePrice?: number;
  downPayment?: number;
  downPaymentType?: 'percent' | 'amount';
  downPaymentValue?: number;
  downPaymentDate?: string;
  downPaymentRecordId?: string | undefined;
  isEscrow?: boolean; // funds go to developer via escrow account, not added to balance
  attachmentPath?: string;
}

export type DepositType = ValueOf<typeof DepositTypeConst>;
export type DepositAccrualType = ValueOf<typeof DepositAccrualTypeConst>;
export type DepositStatus = ValueOf<typeof DepositStatusConst>;
export type DepositAccrualStatus = ValueOf<typeof PaymentStatusConst>;

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
  attachmentPath?: string;
}

export type CurrencyOperationType = ValueOf<typeof CurrencyOperationTypeConst>;
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
  attachmentPath?: string;
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
