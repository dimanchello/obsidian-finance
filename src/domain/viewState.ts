import {
  DebtFilterState, CreditFilterState, DepositFilterState, FilterState, SortDir, ViewState,
  DEFAULT_FILTER, DEFAULT_SORT, DEFAULT_DEBT_FILTER, DEFAULT_CREDIT_FILTER, DEFAULT_DEPOSIT_FILTER,
} from '../types';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : fallback;
}

function sortDir(v: unknown): SortDir {
  return oneOf(v, ['asc', 'desc'] as const, 'desc');
}

function sortState<F extends string>(v: unknown, fields: readonly F[], fallbackField: F): { field: F; dir: SortDir } {
  if (!isObject(v)) return { field: fallbackField, dir: 'desc' };
  return { field: oneOf(v.field, fields, fallbackField), dir: sortDir(v.dir) };
}

function filterState(v: unknown): FilterState {
  const d = DEFAULT_FILTER;
  if (!isObject(v)) return { ...d };
  return {
    search: str(v.search, d.search),
    type: oneOf(v.type, ['all', 'income', 'expense'] as const, 'all'),
    category: str(v.category, d.category),
    tag: str(v.tag, d.tag),
    payer: str(v.payer, d.payer),
    dateFrom: str(v.dateFrom, d.dateFrom),
    dateTo: str(v.dateTo, d.dateTo),
    showInternal: oneOf(v.showInternal, ['all', 'only'] as const, 'all'),
  };
}

function debtFilter(v: unknown): DebtFilterState {
  const d = DEFAULT_DEBT_FILTER;
  if (!isObject(v)) return { ...d };
  return {
    search: str(v.search, d.search),
    status: oneOf(v.status, ['all', 'paid', 'unpaid'] as const, 'all'),
    direction: oneOf(v.direction, ['all', 'lent', 'borrowed'] as const, 'all'),
    dateFrom: str(v.dateFrom, d.dateFrom),
    dateTo: str(v.dateTo, d.dateTo),
    person: str(v.person, d.person),
  };
}

function creditFilter(v: unknown): CreditFilterState {
  const d = DEFAULT_CREDIT_FILTER;
  if (!isObject(v)) return { ...d };
  return {
    search: str(v.search, d.search),
    status: oneOf(v.status, ['all', 'active', 'paid'] as const, 'all'),
    bankName: str(v.bankName, d.bankName),
    type: oneOf(v.type, ['all', 'consumer', 'auto', 'mortgage'] as const, 'all'),
    dateFrom: str(v.dateFrom, d.dateFrom),
    dateTo: str(v.dateTo, d.dateTo),
  };
}

function depositFilter(v: unknown): DepositFilterState {
  const d = DEFAULT_DEPOSIT_FILTER;
  if (!isObject(v)) return { ...d };
  return {
    search: str(v.search, d.search),
    status: oneOf(v.status, ['all', 'active', 'closed'] as const, 'all'),
    bankName: str(v.bankName, d.bankName),
    type: oneOf(v.type, ['all', 'term', 'demand', 'savings'] as const, 'all'),
    dateFrom: str(v.dateFrom, d.dateFrom),
    dateTo: str(v.dateTo, d.dateTo),
  };
}

function columns(v: unknown): Record<string, boolean> | undefined {
  if (!isObject(v)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'boolean') out[k] = val;
  }
  return out;
}

export function defaultViewState(pageSize: number): ViewState {
  return {
    sort: { ...DEFAULT_SORT },
    filter: { ...DEFAULT_FILTER },
    debtSort: { field: 'date', dir: 'desc' },
    debtFilter: { ...DEFAULT_DEBT_FILTER },
    creditSort: { field: 'date', dir: 'desc' },
    creditFilter: { ...DEFAULT_CREDIT_FILTER },
    depositSort: { field: 'date', dir: 'desc' },
    depositFilter: { ...DEFAULT_DEPOSIT_FILTER },
    page: 0,
    debtPage: 0,
    creditPage: 0,
    depositPage: 0,
    pageSize,
  };
}

/**
 * Explicit parse with defaults instead of a ladder of `??=` mutations.
 * v1, no migrations: an unrecognized shape simply falls back field by field.
 * Pages always reset to 0 — a stale page index against fresh data shows an empty list.
 */
export function parseViewState(raw: unknown, pageSize: number): ViewState {
  const base = defaultViewState(pageSize);
  if (!isObject(raw)) return base;

  const state: ViewState = {
    sort: sortState(raw.sort, ['date', 'amount', 'category', 'type', 'payer', 'tag'] as const, 'date'),
    filter: filterState(raw.filter),
    debtSort: sortState(raw.debtSort, ['date', 'amount', 'person'] as const, 'date'),
    debtFilter: debtFilter(raw.debtFilter),
    creditSort: sortState(raw.creditSort, ['date', 'amount', 'bankName'] as const, 'date'),
    creditFilter: creditFilter(raw.creditFilter),
    depositSort: sortState(raw.depositSort, ['date', 'amount', 'bankName'] as const, 'date'),
    depositFilter: depositFilter(raw.depositFilter),
    page: 0,
    debtPage: 0,
    creditPage: 0,
    depositPage: 0,
    pageSize: num(raw.pageSize, pageSize) || pageSize,
  };

  const recordsColumns = columns(raw.recordsColumns);
  const debtsColumns = columns(raw.debtsColumns);
  const creditsColumns = columns(raw.creditsColumns);
  const depositsColumns = columns(raw.depositsColumns);
  if (recordsColumns) state.recordsColumns = recordsColumns;
  if (debtsColumns) state.debtsColumns = debtsColumns;
  if (creditsColumns) state.creditsColumns = creditsColumns;
  if (depositsColumns) state.depositsColumns = depositsColumns;

  return state;
}
