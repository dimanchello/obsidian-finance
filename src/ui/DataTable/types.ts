import type { ViewContext } from '../../context';
import type { SortDir } from '../../types';

export interface CellSpec {
  text: string;
  cls?: string;
}

export interface ColumnSpec<T> {
  key: string;
  label: string;
  cell: (item: T) => CellSpec;
}

export interface ActionSpec {
  icon: string;
  title: string;
  onClick: () => void;
  cls?: string;
}

export type FilterControl =
  | { kind: 'search'; label: string; placeholder: string; get: () => string; set: (v: string) => void }
  | { kind: 'select'; label: string; options: ComboOption[]; get: () => string; set: (v: string) => void }
  | { kind: 'searchSelect'; label: string; options: () => ComboOption[]; get: () => string; set: (v: string) => void }
  | { kind: 'date'; label: string; get: () => string; set: (v: string) => void }
  | { kind: 'custom'; render: (row: HTMLElement, onChange: () => void) => void };

export interface ComboOption {
  value: string;
  label: string;
}

export interface SortFieldSpec {
  field: string;
  label: string;
}

export interface TableStateAdapter {
  getPage(): number;
  setPage(page: number): void;
  getSort(): { field: string; dir: SortDir };
  setSort(sort: { field: string; dir: SortDir }): void;
  resetFilter(): void;
  getColumns(): Record<string, boolean>;
  setColumns(cols: Record<string, boolean>): void;
  getExpandedId?(): string | null;
  setExpandedId?(id: string | null): void;
}

export interface ExpandableSpec<T> {
  toggleLabel: (item: T) => string;
  render: (host: HTMLElement, item: T) => void;
  /** Desktop: how many columns the expanded row spans. */
  hasContent: (item: T) => boolean;
}

export interface DataTableApi {
  filtersOpen: boolean;
  toggleFilters: () => void;
  closeFilters: () => void;
  bulkMode: boolean;
  toggleBulkMode: () => void;
  clearSelection: () => void;
}

export interface EmptyStateSpec {
  icon: string;
  title: string;
  subtitle: string;
}

export interface TableSpec<T> {
  ctx: ViewContext;
  items: () => T[];
  itemId: (item: T) => string;
  columns: ColumnSpec<T>[];
  rowCls?: (item: T) => string[];
  rowActions: (item: T) => ActionSpec[];
  filterControls: () => FilterControl[];
  sortFields: SortFieldSpec[];
  state: TableStateAdapter;
  renderStats: (host: HTMLElement) => void;
  /** Inner list tabs: in the toolbar row on desktop, a separate row above it on mobile. */
  renderSubTabs?: (host: HTMLElement, api: DataTableApi) => void;
  renderCard: (block: HTMLElement, item: T) => void;
  expandable?: ExpandableSpec<T>;
  /** A function lets the message depend on the current state (e.g. the inner list tab). */
  emptyState: EmptyStateSpec | (() => EmptyStateSpec);
  emptyFiltered: EmptyStateSpec;
  hasAnyItems: () => boolean;
  actionsPosition?: 'inline' | 'above' | 'custom';
  cardCls?: string | ((item: T) => string[]);
  onCardClick?: (item: T) => void;
  /** Replaces the default toolbar content entirely when provided. */
  ownToolbar?: (toolbar: HTMLElement, api: DataTableApi) => void;
  toolbarButtons?: (toolbar: HTMLElement, rerender: () => void, api: DataTableApi) => void;
  /** Rendered between the toolbar and the filter panel (analytics, settings, …). */
  renderPanels?: (host: HTMLElement) => void;
  infoBarSums?: (host: HTMLElement, filtered: T[]) => void;
  onBulkDelete: (ids: string[]) => Promise<void>;
  confirmBulkDeleteText: (count: number) => string;
  onFilterChange: () => void;
  onFiltersToggle?: () => void;
  rerender: () => void;
}
