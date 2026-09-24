import { CSS_CLASS } from '../../constants';
import type { ViewContext } from '../../context';
import type { TableSpec, DataTableApi } from './types';
import { FilterPanel } from './FilterPanel';
import { TableRenderer } from './TableRenderer';
import { CardRenderer } from './CardRenderer';
import { renderPagination } from '../pagination';
import { ColumnVisibilityModal } from '../../ColumnVisibilityModal';
import { ConfirmModal } from '../../ConfirmModal';

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
  private expandedId: string | null = null;
  private filterPanel: FilterPanel;

  constructor(spec: TableSpec<T>) {
    this.spec = spec;
    this.expandedId = spec.state.getExpandedId?.() ?? null;
    this.filterPanel = new FilterPanel(
      spec.ctx,
      spec.filterControls,
      spec.sortFields,
      spec.state,
      () => {
        spec.onFilterChange();
        spec.rerender();
      }
    );
  }

  private get ctx(): ViewContext { return this.spec.ctx; }
  private get tr() { return this.ctx.tr; }

  render(host: HTMLElement): void {
    this.spec.renderStats(host);
    this.renderToolbar(host);
    this.spec.renderPanels?.(host);

    const filtersEl = host.createDiv('finance-filters-container');
    filtersEl.toggleClass('is-hidden', !this.filtersOpen);
    if (this.filtersOpen) this.filterPanel.render(filtersEl);

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

    if (totalPages > 1) this.renderPaginationEl(paginationEl, totalPages, page);

    // Restore focus to search input after re-render
    const lastFocusedSearch = this.filterPanel.getLastFocusedSearch();
    if (lastFocusedSearch) {
      const activeEl = document.activeElement;
      if (!activeEl?.matches('input')) {
        lastFocusedSearch.focus();
        const len = lastFocusedSearch.value.length;
        lastFocusedSearch.setSelectionRange(len, len);
      }
    }
  }

  private renderEmpty(host: HTMLElement, spec: { icon: string; title: string; subtitle: string }): void {
    const e = host.createDiv('finance-empty-state');
    e.createDiv({ text: spec.icon, cls: 'finance-empty-icon' });
    e.createEl('p', { text: spec.title, cls: 'finance-empty-title' });
    e.createEl('p', { text: spec.subtitle, cls: CSS_CLASS.FINANCE_EMPTY_SUB });
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

  private renderInfoBar(container: HTMLElement, filtered: T[], start: number, pageSize: number): void {
    const infoBar = container.createDiv('finance-table-info-bar');
    const metaLeft = infoBar.createDiv('finance-table-meta');
    metaLeft.createSpan({
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
        columns: this.spec.columns.map(c => ({ key: c.key, label: c.label })),
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

  private toggleExpanded(id: string): void {
    this.expandedId = this.expandedId === id ? null : id;
    this.spec.state.setExpandedId?.(this.expandedId);
    if (this.spec.state.setExpandedId) this.ctx.saveState();
    this.spec.rerender();
  }

  private renderTable(container: HTMLElement, pageItems: T[]): void {
    const renderer = new TableRenderer(
      this.spec,
      this.bulkMode,
      this.selectedIds,
      this.expandedId,
      (id) => this.toggleSelected(id),
      (id) => this.toggleExpanded(id),
      () => this.spec.rerender()
    );
    renderer.render(container, pageItems);
  }

  private renderCards(container: HTMLElement, pageItems: T[]): void {
    const renderer = new CardRenderer(
      this.spec,
      this.bulkMode,
      this.selectedIds,
      this.expandedId,
      (id) => this.toggleSelected(id),
      (id) => this.toggleExpanded(id)
    );
    renderer.render(container, pageItems);
  }

  private renderPaginationEl(host: HTMLElement, totalPages: number, current: number): void {
    renderPagination({
      container: host,
      currentPage: current,
      totalPages,
      isMobile: this.ctx.isMobile,
      onPageChange: page => {
        this.spec.state.setPage(page);
        this.spec.rerender();
      },
    });
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
