import { ViewContext } from '../context';
import { SortDir, SEARCH_DEBOUNCE_MS } from '../types';
import { Combobox, ComboOption } from './Combobox';
import { pageRange } from './pagination';
import { ColumnVisibilityModal } from '../ColumnVisibilityModal';
import { ConfirmModal } from '../ConfirmModal';

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
  renderCard: (block: HTMLElement, item: T) => void;
  expandable?: ExpandableSpec<T>;
  emptyState: { icon: string; title: string; subtitle: string };
  emptyFiltered: { icon: string; title: string; subtitle: string };
  hasAnyItems: () => boolean;
  actionsPosition?: 'inline' | 'above';
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

/**
 * The shared mechanism behind all four tabs: filter panel, sorting, pagination,
 * bulk select, column visibility, desktop table and mobile cards — written once.
 * A tab is reduced to its TableSpec.
 */
export class DataTable<T> {
  private spec: TableSpec<T>;
  private filtersOpen = false;
  private bulkMode = false;
  private selectedIds = new Set<string>();
  private filterDebounce: ReturnType<typeof setTimeout> | null = null;
  private expandedId: string | null = null;
  private lastFocusedSearch: HTMLInputElement | null = null;

  constructor(spec: TableSpec<T>) {
    this.spec = spec;
  }

  private get ctx(): ViewContext { return this.spec.ctx; }
  private get tr() { return this.ctx.tr; }

  render(host: HTMLElement): void {
    this.spec.renderStats(host);
    this.renderToolbar(host);
    this.spec.renderPanels?.(host);

    const filtersEl = host.createDiv('finance-filters-container');
    filtersEl.toggleClass('is-hidden', !this.filtersOpen);
    if (this.filtersOpen) this.renderFilters(filtersEl);

    if (!this.spec.hasAnyItems()) {
      this.renderEmpty(host, this.spec.emptyState);
      return;
    }

    const filtered = this.spec.items();
    if (!filtered.length) {
      this.renderEmpty(host, this.spec.emptyFiltered);
      return;
    }

    const tw = host.createDiv('finance-table-wrapper');
    const container = tw.createDiv('finance-table-container');
    const paginationEl = tw.createDiv('finance-pagination');

    const { pageSize } = this.ctx.state;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.max(0, Math.min(this.spec.state.getPage(), totalPages - 1));
    this.spec.state.setPage(page);
    const start = page * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    this.renderInfoBar(container, filtered, start, pageSize);

    if (this.ctx.isMobile && this.bulkMode && this.selectedIds.size > 0) {
      const mobileBar = container.createDiv('finance-mobile-bulk-bar');
      const deleteBtn = mobileBar.createEl('button', {
        cls: 'finance-bulk-delete-btn',
        text: `${this.tr.delete} (${this.selectedIds.size})`,
      });
      deleteBtn.addEventListener('click', () => this.confirmBulkDelete());
    }

    if (this.ctx.isMobile) {
      this.renderCards(container, pageItems);
    } else {
      this.renderTable(container, pageItems);
    }

    if (totalPages > 1) this.renderPagination(paginationEl, totalPages, page);

    if (this.lastFocusedSearch) {
      const activeEl = document.activeElement;
      if (!activeEl?.matches('input')) {
        this.lastFocusedSearch.focus();
        const len = this.lastFocusedSearch.value.length;
        this.lastFocusedSearch.setSelectionRange(len, len);
      }
    }
  }

  private renderEmpty(host: HTMLElement, spec: { icon: string; title: string; subtitle: string }): void {
    const e = host.createDiv('finance-empty-state');
    e.createEl('div', { text: spec.icon, cls: 'finance-empty-icon' });
    e.createEl('p', { text: spec.title, cls: 'finance-empty-title' });
    e.createEl('p', { text: spec.subtitle, cls: 'finance-empty-sub' });
  }

  private api(): DataTableApi {
    return {
      filtersOpen: this.filtersOpen,
      toggleFilters: () => { this.filtersOpen = !this.filtersOpen; this.spec.rerender(); },
      closeFilters: () => { if (this.filtersOpen) { this.filtersOpen = false; this.spec.rerender(); } },
      bulkMode: this.bulkMode,
      toggleBulkMode: () => this.toggleBulkMode(),
    };
  }

  private renderToolbar(host: HTMLElement): void {
    const toolbar = host.createDiv('finance-debt-toolbar');

    if (this.spec.ownToolbar) {
      this.spec.ownToolbar(toolbar, this.api());
      return;
    }

    this.spec.toolbarButtons?.(toolbar, () => this.spec.rerender(), this.api());

    const filtBtn = toolbar.createEl('button', {
      cls: `finance-analytics-toggle-btn${this.filtersOpen ? ' active' : ''}`,
      text: `🔍 ${this.tr.filters} ${this.filtersOpen ? '▲' : '▼'}`,
    });
    filtBtn.addEventListener('click', () => {
      this.filtersOpen = !this.filtersOpen;
      if (this.filtersOpen) this.spec.onFiltersToggle?.();
      this.spec.rerender();
    });

    if (this.ctx.isMobile) {
      const bulkToggleBtn = toolbar.createEl('button', {
        cls: `finance-analytics-toggle-btn${this.bulkMode ? ' active' : ''}`,
        text: `☑️ ${this.tr.bulkSelect}`,
      });
      bulkToggleBtn.addEventListener('click', () => {
        this.toggleBulkMode();
      });
    }
  }

  private toggleBulkMode(): void {
    this.bulkMode = !this.bulkMode;
    if (!this.bulkMode) this.selectedIds.clear();
    this.spec.rerender();
  }

  private renderFilters(container: HTMLElement): void {
    const row1 = container.createDiv('finance-filters-row');
    const row2 = container.createDiv('finance-filters-row');
    const controls = this.spec.filterControls();

    // Распределяем фильтры логично: Поиск, Тип, Категория → row1; С, По, Плательщик, Тег, Внутренние → row2
    controls.forEach((control, i) => {
      const row = i < 3 ? row1 : row2;
      this.renderFilterControl(row, control);
    });

    const rG = row2.createDiv('finance-filter-group finance-filter-reset');
    rG.createEl('label', { text: ' ', cls: 'finance-filter-label' });
    rG.createEl('button', { text: this.tr.reset, cls: 'finance-reset-btn' })
      .addEventListener('click', () => {
        this.spec.state.resetFilter();
        this.spec.state.setPage(0);
        this.ctx.saveState();
        this.spec.onFilterChange();
        this.spec.rerender();
      });

    this.renderSortRow(container);
  }

  private renderFilterControl(row: HTMLElement, control: FilterControl): void {
    const apply = () => {
      this.spec.state.setPage(0);
      this.ctx.saveState();
      this.spec.onFilterChange();
      this.spec.rerender();
    };

    switch (control.kind) {
      case 'search': {
        const g = row.createDiv('finance-filter-group finance-filter-search');
        g.createEl('label', { text: control.label, cls: 'finance-filter-label' });
        const si = g.createEl('input', { type: 'text', cls: 'finance-filter-input', placeholder: control.placeholder });
        si.value = control.get();
        si.addEventListener('focus', () => { this.lastFocusedSearch = si; });
        si.addEventListener('blur', () => { this.lastFocusedSearch = null; });
        si.addEventListener('input', () => {
          control.set(si.value);
          if (this.filterDebounce) clearTimeout(this.filterDebounce);
          this.filterDebounce = setTimeout(() => apply(), SEARCH_DEBOUNCE_MS);
        });
        break;
      }
      case 'select': {
        const g = row.createDiv('finance-filter-group');
        g.createEl('label', { text: control.label, cls: 'finance-filter-label' });
        const sel = g.createEl('select', { cls: 'finance-filter-select' });
        control.options.forEach(({ value, label }) => {
          const o = sel.createEl('option', { text: label });
          o.value = value;
          o.selected = value === control.get();
        });
        sel.addEventListener('change', () => { control.set(sel.value); apply(); });
        break;
      }
      case 'searchSelect': {
        const g = row.createDiv('finance-filter-group');
        g.createEl('label', { text: control.label, cls: 'finance-filter-label' });
        new Combobox(g, {
          options: control.options(),
          value: control.get(),
          onChange: (v) => { control.set(v); apply(); },
          searchPlaceholder: this.tr.searchPlaceholder,
          emptyText: this.tr.noOptions,
        });
        break;
      }
      case 'date': {
        const g = row.createDiv('finance-filter-group');
        g.createEl('label', { text: control.label, cls: 'finance-filter-label' });
        const di = g.createEl('input', { type: 'date', cls: 'finance-filter-input' });
        di.value = control.get();
        di.addEventListener('change', () => { control.set(di.value); apply(); });
        break;
      }
      case 'custom':
        control.render(row, apply);
        break;
    }
  }

  private renderSortRow(container: HTMLElement): void {
    const sortRow = container.createDiv('finance-sort-row');
    sortRow.createEl('span', { text: this.tr.sortBy, cls: 'finance-sort-label' });

    const s = this.spec.state.getSort();
    this.spec.sortFields.forEach(({ field, label }) => {
      const active = s.field === field;
      const btn = sortRow.createEl('button', {
        cls: `finance-sort-btn${active ? ' active' : ''}`,
        text: label + (active ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''),
      });
      btn.addEventListener('click', () => {
        this.spec.state.setSort(s.field === field
          ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
          : { field, dir: 'desc' });
        this.spec.state.setPage(0);
        this.ctx.saveState();
        this.spec.rerender();
      });
    });
  }

  private allColumns(): ColumnSpec<T>[] {
    return this.spec.columns;
  }

  private visibleColumns(): ColumnSpec<T>[] {
    const vis = this.spec.state.getColumns();
    return this.allColumns().filter(c => vis[c.key] !== false);
  }

  private renderInfoBar(container: HTMLElement, filtered: T[], start: number, pageSize: number): void {
    const infoBar = container.createDiv('finance-table-info-bar');
    const metaLeft = infoBar.createDiv('finance-table-meta');
    metaLeft.createEl('span', {
      text: `${start + 1}–${Math.min(start + pageSize, filtered.length)} ${this.tr.fromLower} ${filtered.length}`,
      cls: 'finance-count-text',
    });

    this.spec.infoBarSums?.(infoBar, filtered);

    if (this.ctx.isMobile) return;

    const btnsContainer = infoBar.createDiv('finance-table-info-btns');

    const bulkToggle = btnsContainer.createEl('button', {
      cls: `finance-bulk-toggle-btn${this.bulkMode ? ' active' : ''}`,
      text: '☑️',
    });
    bulkToggle.addEventListener('click', () => this.toggleBulkMode());

    if (this.bulkMode && this.selectedIds.size > 0) {
      const bulkDeleteBtn = btnsContainer.createEl('button', {
        cls: 'finance-bulk-delete-btn',
        text: `${this.tr.delete} (${this.selectedIds.size})`,
      });
      bulkDeleteBtn.addEventListener('click', () => this.confirmBulkDelete());
    }

    const gearBtn = btnsContainer.createEl('button', { cls: 'finance-colvis-btn', text: '⚙️' });
    gearBtn.title = this.tr.columnSettings;
    gearBtn.addEventListener('click', () => {
      new ColumnVisibilityModal(this.ctx.app, {
        columns: this.allColumns().map(c => ({ key: c.key, label: c.label })),
        visibility: { ...this.spec.state.getColumns() },
        accentColor: this.ctx.data?.accentColor,
        onSave: (updated) => {
          this.spec.state.setColumns(updated);
          this.ctx.saveState();
          this.spec.rerender();
        },
      }).open();
    });
  }

  private toggleSelected(id: string): void {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.spec.rerender();
  }

  private mkActionBtn(parent: HTMLElement, a: ActionSpec): void {
    const btn = parent.createEl('button', { cls: 'finance-action-btn', text: a.icon });
    if (a.cls) btn.addClass(a.cls);
    btn.title = a.title;
    btn.addEventListener('click', a.onClick);
  }

  private renderTable(container: HTMLElement, pageItems: T[]): void {
    const scroll = container.createDiv('finance-table-scroll');
    const table = scroll.createEl('table', { cls: 'finance-table' });
    const cols = this.visibleColumns();
    const colSpan = cols.length + (this.bulkMode ? 1 : 0) + (this.spec.actionsPosition !== 'above' ? 1 : 0);

    const hRow = table.createEl('thead').createEl('tr');
    if (this.bulkMode) {
      const th = hRow.createEl('th', { cls: 'finance-th finance-select-td' });
      const cb = th.createEl('input', { type: 'checkbox' });
      cb.checked = pageItems.length > 0 && pageItems.every(r => this.selectedIds.has(this.spec.itemId(r)));
      cb.addEventListener('change', () => {
        pageItems.forEach(r => {
          if (cb.checked) this.selectedIds.add(this.spec.itemId(r));
          else this.selectedIds.delete(this.spec.itemId(r));
        });
        this.spec.rerender();
      });
    }
    cols.forEach(c => hRow.createEl('th', { cls: 'finance-th', text: c.label }));
    if (this.spec.actionsPosition !== 'above') {
      hRow.createEl('th', { cls: 'finance-th' });
    }

    const frag = document.createDocumentFragment();

    pageItems.forEach(item => {
      const id = this.spec.itemId(item);
      const itemTbody = document.createElement('tbody');
      itemTbody.classList.add('finance-item-tbody');
      
      const tr = document.createElement('tr');
      tr.classList.add('finance-tr', 'finance-data-tr');
      this.spec.rowCls?.(item).forEach(c => {
        tr.classList.add(c);
        itemTbody.classList.add(c);
      });

      // Actions above
      if (this.spec.actionsPosition === 'above') {
        const actionTr = document.createElement('tr');
        actionTr.classList.add('finance-tr', 'finance-actions-tr');
        this.spec.rowCls?.(item).forEach(c => actionTr.classList.add(c));
        
        const actionTd = document.createElement('td');
        actionTd.colSpan = colSpan;
        actionTd.classList.add('finance-td', 'finance-actions-td-above');
        
        const actionsContainer = document.createElement('div');
        actionsContainer.classList.add('finance-actions-container-above');
        this.spec.rowActions(item).forEach(a => this.mkActionBtn(actionsContainer, a));
        actionTd.appendChild(actionsContainer);
        actionTr.appendChild(actionTd);
        itemTbody.appendChild(actionTr);
      }

      if (this.bulkMode) {
        const std = document.createElement('td');
        std.classList.add('finance-td', 'finance-select-td');
        const cb = std.createEl('input', { type: 'checkbox' });
        cb.checked = this.selectedIds.has(id);
        cb.addEventListener('change', (e) => { e.stopPropagation(); this.toggleSelected(id); });
        tr.appendChild(std);
      }

      cols.forEach(c => {
        const { text, cls } = c.cell(item);
        const td = document.createElement('td');
        td.classList.add('finance-td');
        if (cls) cls.split(' ').filter(Boolean).forEach(x => td.classList.add(x));
        td.setAttribute('data-label', c.label);
        td.textContent = text;
        tr.appendChild(td);
      });

      if (this.spec.actionsPosition !== 'above') {
        const atd = document.createElement('td');
        atd.classList.add('finance-td', 'finance-actions-td');
        atd.setAttribute('data-label', '');
        this.spec.rowActions(item).forEach(a => this.mkActionBtn(atd, a));
        tr.appendChild(atd);
      }

      itemTbody.appendChild(tr);

      const interactiveElements = [tr];
      if (this.spec.actionsPosition === 'above') {
        interactiveElements.push(itemTbody.firstChild as HTMLTableRowElement); // The actions row
      }

      if (this.bulkMode) {
        interactiveElements.forEach(el => el.classList.add('finance-tr-selectable'));
        interactiveElements.forEach(el => el.addEventListener('click', (e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === 'INPUT' || t.closest('.finance-action-btn')) return;
          this.toggleSelected(id);
        }));
      } else if (this.spec.expandable?.hasContent(item)) {
        interactiveElements.forEach(el => el.classList.add('finance-tr-expandable'));
        interactiveElements.forEach(el => el.addEventListener('click', (e) => {
          const t = e.target as HTMLElement;
          if (t.closest('.finance-action-btn')) return;
          this.expandedId = this.expandedId === id ? null : id;
          this.spec.rerender();
        }));
      }

      if (this.spec.expandable && this.expandedId === id && this.spec.expandable.hasContent(item)) {
        const exTr = document.createElement('tr');
        exTr.classList.add('finance-expand-row');
        const exTd = document.createElement('td');
        exTd.classList.add('finance-td');
        exTd.colSpan = colSpan;
        this.spec.expandable.render(exTd, item);
        exTr.appendChild(exTd);
        itemTbody.appendChild(exTr);
      }
      
      frag.appendChild(itemTbody);
    });

    table.appendChild(frag);
  }

  private renderCards(container: HTMLElement, pageItems: T[]): void {
    const list = container.createDiv('finance-records-list');
    const frag = document.createDocumentFragment();

    pageItems.forEach(item => {
      const id = this.spec.itemId(item);
      const block = document.createElement('div');
      block.classList.add('finance-record-block');
      this.spec.rowCls?.(item).forEach(c => block.classList.add(c));

      if (this.bulkMode) {
        const cb = block.createEl('input', { type: 'checkbox', cls: 'finance-block-checkbox' });
        cb.checked = this.selectedIds.has(id);
        cb.addEventListener('change', (e) => { e.stopPropagation(); this.toggleSelected(id); });
      }

      if (this.spec.actionsPosition === 'above') {
        const actionsTop = document.createElement('div');
        actionsTop.classList.add('finance-record-actions', 'finance-actions-above-card');
        this.spec.rowActions(item).forEach(a => this.mkActionBtn(actionsTop, a));
        block.appendChild(actionsTop);
      }

      this.spec.renderCard(block, item);

      if (this.spec.expandable?.hasContent(item)) {
        const open = this.expandedId === id;
        if (open) {
          const panel = block.createDiv('finance-debt-history-panel finance-debt-history-open');
          this.spec.expandable.render(panel, item);
        }
      }

      if (this.spec.actionsPosition !== 'above') {
        const actions = block.createDiv('finance-record-actions');
        this.spec.rowActions(item).forEach(a => this.mkActionBtn(actions, a));
      }

      if (this.bulkMode) {
        block.classList.add('finance-tr-selectable');
        block.addEventListener('click', (e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === 'INPUT' || t.closest('.finance-action-btn')) return;
          this.toggleSelected(id);
        });
      } else if (this.spec.expandable?.hasContent(item)) {
        block.classList.add('finance-tr-expandable');
        block.addEventListener('click', (e) => {
          const t = e.target as HTMLElement;
          if (t.closest('.finance-action-btn')) return;
          this.expandedId = this.expandedId === id ? null : id;
          this.spec.rerender();
        });
      }

      frag.appendChild(block);
    });

    list.appendChild(frag);
  }

  private renderPagination(host: HTMLElement, totalPages: number, current: number): void {
    const nav = host.createDiv('finance-pagination-nav');
    const go = (page: number) => {
      this.spec.state.setPage(page);
      this.spec.rerender();
    };

    const prev = nav.createEl('button', { cls: 'finance-page-btn', text: '←' });
    prev.disabled = current === 0;
    prev.addEventListener('click', () => go(current - 1));

    this.pageRange(current, totalPages).forEach(p => {
      if (p === -1) { nav.createEl('span', { text: '…', cls: 'finance-page-ellipsis' }); return; }
      const btn = nav.createEl('button', {
        text: String(p + 1),
        cls: `finance-page-btn${p === current ? ' active' : ''}`,
      });
      btn.addEventListener('click', () => go(p));
    });

    const next = nav.createEl('button', { cls: 'finance-page-btn', text: '→' });
    next.disabled = current >= totalPages - 1;
    next.addEventListener('click', () => go(current + 1));
  }

  private pageRange(cur: number, total: number): number[] {
    return pageRange(cur, total, this.ctx.isMobile);
  }

  private confirmBulkDelete(): void {
    const count = this.selectedIds.size;
    if (!count) return;
    const ids = [...this.selectedIds];
    new ConfirmModal(this.ctx.app, this.spec.confirmBulkDeleteText(count), async () => {
      await this.spec.onBulkDelete(ids);
      this.selectedIds.clear();
      this.bulkMode = false;
      this.spec.rerender();
    }).open();
  }
}
