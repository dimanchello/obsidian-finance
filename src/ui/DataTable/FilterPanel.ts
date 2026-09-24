import { CSS_CLASS } from '../../constants';
import type { ViewContext } from '../../context';
import type { FilterControl, SortFieldSpec, TableStateAdapter } from './types';
import { Combobox } from '../Combobox';
import { SEARCH_DEBOUNCE_MS } from '../../types';

export class FilterPanel {
  private filterDebounce: number | null = null;
  private lastFocusedSearch: HTMLInputElement | null = null;

  constructor(
    private ctx: ViewContext,
    private filterControls: () => FilterControl[],
    private sortFields: SortFieldSpec[],
    private state: TableStateAdapter,
    private onApply: () => void
  ) {}

  getLastFocusedSearch(): HTMLInputElement | null {
    return this.lastFocusedSearch;
  }

  render(container: HTMLElement): void {
    const row1 = container.createDiv('finance-filters-row');
    const row2 = container.createDiv('finance-filters-row');
    const controls = this.filterControls();

    // Distribute filters logically: Search, Type, Category → row1; From, To, Payer, Tag, Internal → row2
    controls.forEach((control, i) => {
      const row = i < 3 ? row1 : row2;
      this.renderFilterControl(row, control);
    });

    const rG = row2.createDiv('finance-filter-group finance-filter-reset');
    rG.createEl('label', { text: ' ', cls: CSS_CLASS.FINANCE_FILTER_LABEL });
    rG.createEl('button', { text: this.ctx.tr.reset, cls: 'finance-reset-btn' })
      .addEventListener('click', () => {
        this.state.resetFilter();
        this.state.setPage(0);
        this.ctx.saveState();
        this.onApply();
      });

    this.renderSortRow(container);
  }

  private renderFilterControl(row: HTMLElement, control: FilterControl): void {
    const apply = () => {
      this.state.setPage(0);
      this.ctx.saveState();
      this.onApply();
    };

    switch (control.kind) {
      case 'search': {
        const g = row.createDiv('finance-filter-group finance-filter-search');
        g.createEl('label', { text: control.label, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
        const si = g.createEl('input', { type: 'text', cls: CSS_CLASS.FINANCE_FILTER_INPUT, placeholder: control.placeholder });
        si.value = control.get();
        si.addEventListener('focus', () => { this.lastFocusedSearch = si; });
        si.addEventListener('blur', () => { this.lastFocusedSearch = null; });
        si.addEventListener('input', () => {
          if (this.filterDebounce !== null) window.clearTimeout(this.filterDebounce);
          this.filterDebounce = window.setTimeout(() => {
            control.set(si.value);
            apply();
          }, SEARCH_DEBOUNCE_MS);
        });
        break;
      }
      case 'select': {
        const g = row.createDiv('finance-filter-group');
        g.createEl('label', { text: control.label, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
        const sel = g.createEl('select', { cls: CSS_CLASS.FINANCE_FILTER_SELECT });
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
        g.createEl('label', { text: control.label, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
        new Combobox(g, {
          options: control.options(),
          value: control.get(),
          onChange: (v) => { control.set(v); apply(); },
          searchPlaceholder: this.ctx.tr.searchPlaceholder,
          emptyText: this.ctx.tr.noOptions,
        });
        break;
      }
      case 'date': {
        const g = row.createDiv('finance-filter-group');
        g.createEl('label', { text: control.label, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
        const di = g.createEl('input', { type: 'date', cls: CSS_CLASS.FINANCE_FILTER_INPUT });
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
    sortRow.createSpan({ text: this.ctx.tr.sortBy, cls: 'finance-sort-label' });

    const s = this.state.getSort();
    this.sortFields.forEach(({ field, label }) => {
      const active = s.field === field;
      const btn = sortRow.createEl('button', {
        cls: `finance-sort-btn${active ? ' active' : ''}`,
        text: label + (active ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''),
      });
      btn.addEventListener('click', () => {
        this.state.setSort(s.field === field
          ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
          : { field, dir: 'desc' });
        this.state.setPage(0);
        this.ctx.saveState();
        this.onApply();
      });
    });
  }
}
