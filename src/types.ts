export type RecordType = 'income' | 'expense';
export type SortField  = 'date' | 'amount' | 'category' | 'type' | 'payer' | 'tag' | 'createdAt';
export type SortDir    = 'asc'  | 'desc';

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

export interface AccountMeta {
  name:     string;   // custom display name; "" → use note filename
  currency: string;   // "₽" | "$" | "BTC" etc.
}

export interface AccountData extends AccountMeta {
  version:    number;
  records:    FinanceRecord[];
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

export interface ViewState {
  sort: SortState; filter: FilterState; page: number; pageSize: number;
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

export const COMMON_CURRENCIES = [
  '₽', '$', '€', '£', '¥', '₸', '₴', '₾', 'CHF',
  'BTC', 'ETH', 'USDT', 'USDC', 'TON', 'SOL',
];
