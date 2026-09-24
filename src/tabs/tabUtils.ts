import { ViewContext } from '../context';
import { CSS_CLASS } from '../constants';
import { SortDir, ViewState } from '../types';

/**
 * Factory functions for DataTable state adapters.
 * Extracts common patterns from all tabs that use DataTable.
 */

export interface BaseTableStateAdapter {
  getPage: () => number;
  setPage: (p: number) => void;
  getSort: () => { field: string; dir: SortDir };
  setSort: (s: { field: string; dir: SortDir }) => void;
  resetFilter: () => void;
  getColumns: () => Record<string, boolean>;
  setColumns: (c: Record<string, boolean>) => void;
}

export interface ExpandableTableStateAdapter extends BaseTableStateAdapter {
  getExpandedId: () => string | null;
  setExpandedId: (id: string | null) => void;
}

/**
 * Creates a standard state adapter for a paginated, sortable, filterable table.
 */
export function createTableStateAdapter(
  ctx: ViewContext,
  stateKey: {
    page: keyof ViewState;
    sort: keyof ViewState;
    columns: keyof ViewState;
  },
  defaults: {
    sort: { field: string; dir: SortDir };
  },
  resetFilter: () => void
): BaseTableStateAdapter {
  return {
    getPage: () => (ctx.state[stateKey.page] as number | undefined) ?? 0,
    setPage: p => { (ctx.state[stateKey.page] as unknown) = p; },
    getSort: () => (ctx.state[stateKey.sort] as { field: string; dir: SortDir } | undefined) ?? defaults.sort,
    setSort: s => { (ctx.state[stateKey.sort] as unknown) = s; },
    resetFilter,
    getColumns: () => {
      const cols = ctx.state[stateKey.columns] as Record<string, boolean> | undefined;
      if (!cols) {
        (ctx.state[stateKey.columns] as unknown) = {};
        return ctx.state[stateKey.columns] as Record<string, boolean>;
      }
      return cols;
    },
    setColumns: c => { (ctx.state[stateKey.columns] as unknown) = c; },
  };
}

/**
 * Creates a state adapter with expandable row support.
 */
export function createExpandableTableStateAdapter(
  ctx: ViewContext,
  stateKey: {
    page: keyof ViewState;
    sort: keyof ViewState;
    columns: keyof ViewState;
    expandedId: keyof ViewState;
  },
  defaults: {
    sort: { field: string; dir: SortDir };
  },
  resetFilter: () => void
): ExpandableTableStateAdapter {
  const base = createTableStateAdapter(ctx, stateKey, defaults, resetFilter);
  return {
    ...base,
    getExpandedId: () => (ctx.state[stateKey.expandedId] as string | undefined) ?? null,
    setExpandedId: id => {
      if (id === null) {
        (ctx.state[stateKey.expandedId] as unknown) = undefined;
      } else {
        (ctx.state[stateKey.expandedId] as unknown) = id;
      }
    },
  };
}

/**
 * Creates a toolbar button for toggling analytics panel.
 * Common pattern across Credits, Deposits, and Currency tabs.
 */
export function createAnalyticsToggleButton(
  toolbar: HTMLElement,
  ctx: ViewContext,
  stateKey: 'creditActiveTab' | 'depositActiveTab',
  tr: { analytics: string },
  rerender: () => void,
  closeFilters: () => void
): HTMLButtonElement {
  const open = (ctx.state[stateKey] ?? 'list') === 'analytics';
  const toggleBtn = toolbar.createEl('button', {
    cls: `finance-analytics-toggle-btn${open ? ' active' : ''}`,
    text: `📈 ${tr.analytics} ${open ? '▲' : '▼'}`,
  });
  toggleBtn.addEventListener('click', () => {
    ctx.state[stateKey] = open ? 'list' : 'analytics';
    if (!open) closeFilters();
    ctx.saveState();
    rerender();
  });
  return toggleBtn;
}

/**
 * Renders date range filter controls (from/to inputs).
 * Common pattern across AnalyticsView, CreditsAnalyticsView, DepositsAnalyticsView.
 */
export function renderDateRangeFilter(
  container: HTMLElement,
  ctx: ViewContext,
  stateKeys: {
    from: keyof ViewContext['state'];
    to: keyof ViewContext['state'];
  },
  tr: { from: string; to: string },
  onChange: () => void
): { fromInput: HTMLInputElement; toInput: HTMLInputElement } {
  const row = container.createDiv('finance-filters-row finance-analytics-date-row');

  const fromG = row.createDiv('finance-filter-group');
  fromG.createEl('label', { text: tr.from, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
  const fromI = fromG.createEl('input', { type: 'date', cls: CSS_CLASS.FINANCE_FILTER_INPUT });
  fromI.value = (ctx.state[stateKeys.from] as string | undefined) ?? '';
  fromI.addEventListener('change', () => {
    (ctx.state[stateKeys.from] as any) = fromI.value;
    ctx.saveState();
    onChange();
  });

  const toG = row.createDiv('finance-filter-group');
  toG.createEl('label', { text: tr.to, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
  const toI = toG.createEl('input', { type: 'date', cls: CSS_CLASS.FINANCE_FILTER_INPUT });
  toI.value = (ctx.state[stateKeys.to] as string | undefined) ?? '';
  toI.addEventListener('change', () => {
    (ctx.state[stateKeys.to] as any) = toI.value;
    ctx.saveState();
    onChange();
  });

  return { fromInput: fromI, toInput: toI };
}
