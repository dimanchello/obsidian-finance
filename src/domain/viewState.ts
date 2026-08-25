import {
  SortDir, ViewState,
  DEFAULT_FILTER, DEFAULT_SORT, DEFAULT_DEBT_FILTER, DEFAULT_CREDIT_FILTER, DEFAULT_DEPOSIT_FILTER,
  CreditAnalyticsGroupBy, DepositAnalyticsGroupBy, OverviewGroupBy,
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
    creditActiveTab: 'list',
    creditAnalyticsGroupBy: 'month',
    creditAnalyticsDateFrom: '',
    creditAnalyticsDateTo: '',
    depositActiveTab: 'list',
    depositAnalyticsGroupBy: 'month',
    depositAnalyticsDateFrom: '',
    depositAnalyticsDateTo: '',
    overviewDateFrom: '',
    overviewDateTo: '',
    overviewGroupBy: 'category',
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
    filter: { ...DEFAULT_FILTER },
    debtSort: sortState(raw.debtSort, ['date', 'amount', 'person'] as const, 'date'),
    debtFilter: { ...DEFAULT_DEBT_FILTER },
    creditSort: sortState(raw.creditSort, ['date', 'amount', 'bankName'] as const, 'date'),
    creditFilter: { ...DEFAULT_CREDIT_FILTER },
    depositSort: sortState(raw.depositSort, ['date', 'amount', 'bankName'] as const, 'date'),
    depositFilter: { ...DEFAULT_DEPOSIT_FILTER },
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

  const CREDIT_ANALYTICS_GROUP_BY: readonly CreditAnalyticsGroupBy[] = ['month', 'quarter', 'year', 'type', 'bank'];
  const DEPOSIT_ANALYTICS_GROUP_BY: readonly DepositAnalyticsGroupBy[] = ['month', 'quarter', 'year', 'type', 'bank'];
  const OVERVIEW_GROUP_BY: readonly OverviewGroupBy[] = ['category', 'tag', 'payer'];

  state.creditActiveTab = oneOf(raw.creditActiveTab, ['list', 'analytics'] as const, 'list');
  state.creditAnalyticsGroupBy = oneOf(raw.creditAnalyticsGroupBy, CREDIT_ANALYTICS_GROUP_BY, 'month');
  state.creditAnalyticsDateFrom = str(raw.creditAnalyticsDateFrom, '');
  state.creditAnalyticsDateTo = str(raw.creditAnalyticsDateTo, '');
  state.depositActiveTab = oneOf(raw.depositActiveTab, ['list', 'analytics'] as const, 'list');
  state.depositAnalyticsGroupBy = oneOf(raw.depositAnalyticsGroupBy, DEPOSIT_ANALYTICS_GROUP_BY, 'month');
  state.depositAnalyticsDateFrom = str(raw.depositAnalyticsDateFrom, '');
  state.depositAnalyticsDateTo = str(raw.depositAnalyticsDateTo, '');
  state.overviewDateFrom = str(raw.overviewDateFrom, '');
  state.overviewDateTo = str(raw.overviewDateTo, '');
  state.overviewGroupBy = oneOf(raw.overviewGroupBy, OVERVIEW_GROUP_BY, 'category');
  
  if (typeof raw.creditExpandedId === 'string') state.creditExpandedId = raw.creditExpandedId;
  if (typeof raw.debtExpandedId === 'string') state.debtExpandedId = raw.debtExpandedId;
  if (typeof raw.depositExpandedId === 'string') state.depositExpandedId = raw.depositExpandedId;

  return state;
}
