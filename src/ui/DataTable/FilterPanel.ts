import { CSS_CLASS } from '../../constants';
import type { ViewContext } from '../../context';
import type { FilterControl, SortFieldSpec, TableStateAdapter } from './types';
import { Combobox } from '../Combobox';
import { SEARCH_DEBOUNCE_MS } from '../../types';

export class FilterPanel {
  private filterDebounce: number | null = null;
  private focusedControlIndex: number | null = null;
  private focusedSelection: [number | null, number | null] | null = null;

  constructor(
    private ctx: ViewContext,
    private filterControls: () => FilterControl[],
    private sortFields: SortFieldSpec[],
    private state: TableStateAdapter,
    private onApply: (fullRerender?: boolean) => void
  ) {}

  destroy(): void {
    if (this.filterDebounce !== null) {
      window.clearTimeout(this.filterDebounce);
      this.filterDebounce = null;
    }
  }

  render(container: HTMLElement): void {
    const row1 = container.createDiv('finance-filters-row');
    const row2 = container.createDiv('finance-filters-row');
    const controls = this.filterControls();

    let elToFocus: HTMLInputElement | null = null;
    let selectionToRestore: [number | null, number | null] | null = null;

    for (let i = 0; i < controls.length; i++) {
      const control = controls[i];
      if (!control) continue;
      const row = i < 3 ? row1 : row2;
      const inputEl = this.renderFilterControl(row, control, i);
      if (this.focusedControlIndex === i && inputEl) {
        elToFocus = inputEl;
        selectionToRestore = this.focusedSelection;
      }
    }

    const rG = row2.createDiv('finance-filter-group finance-filter-reset');
    rG.createEl('label', { text: ' ', cls: CSS_CLASS.FINANCE_FILTER_LABEL });
    rG.createEl('button', { text: this.ctx.tr.reset, cls: 'finance-reset-btn' })
      .addEventListener('click', () => {
        this.focusedControlIndex = null;
        this.focusedSelection = null;
        this.state.resetFilter();
        this.state.setPage(0);
        this.ctx.saveState();
        this.onApply(true);
      });

    this.renderSortRow(container);

    if (elToFocus) {
      elToFocus.focus();
      const [selStart, selEnd] = selectionToRestore ?? [null, null];
      if (selStart !== null && selEnd !== null) {
        try {
          elToFocus.setSelectionRange(selStart, selEnd);
        } catch {
          // Some input types like date do not support setSelectionRange
        }
      }
    }
  }

  private renderFilterControl(row: HTMLElement, control: FilterControl, index: number): HTMLInputElement | null {
    const apply = (fullRerender = false) => {
      this.state.setPage(0);
      this.ctx.saveState();
      this.onApply(fullRerender);
    };

    switch (control.kind) {
      case 'search': {
        const g = row.createDiv('finance-filter-group finance-filter-search');
        g.createEl('label', { text: control.label, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
        const si = g.createEl('input', { type: 'text', cls: CSS_CLASS.FINANCE_FILTER_INPUT, placeholder: control.placeholder });
        si.value = control.get();
        si.addEventListener('focus', () => {
          this.focusedControlIndex = index;
          this.focusedSelection = [si.selectionStart, si.selectionEnd];
        });
        si.addEventListener('blur', (e) => {
          const target = e.currentTarget as HTMLInputElement | null;
          if (target && !target.isConnected) return;
          if (this.focusedControlIndex === index) {
            this.focusedControlIndex = null;
            this.focusedSelection = null;
          }
          if (this.filterDebounce !== null) {
            window.clearTimeout(this.filterDebounce);
            this.filterDebounce = null;
            control.set(si.value);
            apply(false);
          }
        });
        si.addEventListener('input', () => {
          this.focusedControlIndex = index;
          this.focusedSelection = [si.selectionStart, si.selectionEnd];
          if (this.filterDebounce !== null) window.clearTimeout(this.filterDebounce);
          this.filterDebounce = window.setTimeout(() => {
            this.filterDebounce = null;
            control.set(si.value);
            apply(false);
          }, SEARCH_DEBOUNCE_MS);
        });
        return si;
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
        sel.addEventListener('change', () => { control.set(sel.value); apply(false); });
        return null;
      }
      case 'searchSelect': {
        const g = row.createDiv('finance-filter-group');
        g.createEl('label', { text: control.label, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
        new Combobox(g, {
          options: control.options(),
          value: control.get(),
          onChange: (v) => { control.set(v); apply(false); },
          searchPlaceholder: this.ctx.tr.searchPlaceholder,
          emptyText: this.ctx.tr.noOptions,
        });
        return null;
      }
      case 'date': {
        const g = row.createDiv('finance-filter-group');
        g.createEl('label', { text: control.label, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
        const di = g.createEl('input', { type: 'date', cls: CSS_CLASS.FINANCE_FILTER_INPUT });
        di.value = control.get();
        let dateDebounce: number | null = null;
        const triggerDateChange = () => {
          this.focusedControlIndex = index;
          if (dateDebounce !== null) window.clearTimeout(dateDebounce);
          dateDebounce = window.setTimeout(() => {
            dateDebounce = null;
            control.set(di.value);
            apply(false);
          }, SEARCH_DEBOUNCE_MS);
        };
        di.addEventListener('focus', () => {
          this.focusedControlIndex = index;
        });
        di.addEventListener('blur', (e) => {
          const target = e.currentTarget as HTMLInputElement | null;
          if (target && !target.isConnected) return;
          if (this.focusedControlIndex === index) {
            this.focusedControlIndex = null;
          }
          if (dateDebounce !== null) {
            window.clearTimeout(dateDebounce);
            dateDebounce = null;
            control.set(di.value);
            apply(false);
          }
        });
        di.addEventListener('input', triggerDateChange);
        di.addEventListener('change', triggerDateChange);
        return di;
      }
      case 'custom':
        control.render(row, () => apply(false));
        return null;
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
        this.onApply(true);
      });
    });
  }
}
