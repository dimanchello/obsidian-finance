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
  categories: string[];
  tags:       string[];
  payers:     string[];
}

export interface FilterState {
  search: string; type: 'all' | RecordType;
  category: string; tag: string; payer: string;
  dateFrom: string; dateTo: string;
}

export interface SortState { field: SortField; dir: SortDir; }

export type DebtSortField = 'date' | 'amount' | 'person' | 'createdAt';
export type DebtFilterState = {
  search: string;
  status: 'all' | 'paid' | 'unpaid';
  direction: 'all' | DebtDirection;
  dateFrom: string;
  dateTo: string;
  person: string;
};

export interface ViewState {
  sort: SortState; filter: FilterState; page: number; pageSize: number;
  debtPage?: number;
  debtSort?: { field: DebtSortField; dir: SortDir };
  debtFilter?: DebtFilterState;
}

export interface PluginSettings {
  defaultPageSize:   number;
  defaultCurrency:   string;
  attachmentsFolder: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultPageSize: 100, defaultCurrency: '₽',
  attachmentsFolder: 'Finance/Attachments',
};

export const DEFAULT_FILTER: FilterState = {
  search: '', type: 'all', category: '', tag: '', payer: '', dateFrom: '', dateTo: '',
};

export const DEFAULT_SORT: SortState = { field: 'createdAt', dir: 'desc' };

export const DEFAULT_DEBT_FILTER: DebtFilterState = {
  search: '', status: 'all', direction: 'all', dateFrom: '', dateTo: '', person: '',
};

export const COMMON_CURRENCIES = [
  '₽', '$', '€', '£', '¥', '₸', '₴', '₾', 'CHF',
  'BTC', 'ETH', 'USDT', 'USDC', 'TON', 'SOL',
];
