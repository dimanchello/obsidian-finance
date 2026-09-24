import { CSS_CLASS } from '../../constants';
import type { TableSpec, ColumnSpec, ActionSpec } from './types';

export class TableRenderer<T> {
  constructor(
    private spec: TableSpec<T>,
    private bulkMode: boolean,
    private selectedIds: Set<string>,
    private expandedId: string | null,
    private onToggleSelected: (id: string) => void,
    private onToggleExpanded: (id: string) => void,
    private onRerender: () => void
  ) {}

  render(container: HTMLElement, pageItems: T[]): void {
    const scroll = container.createDiv('finance-table-scroll');
    const table = scroll.createEl('table', { cls: 'finance-table' });
    const cols = this.visibleColumns();
    const colSpan = cols.length + (this.bulkMode ? 1 : 0) + (this.spec.actionsPosition !== 'above' ? 1 : 0);

    this.renderHeader(table, cols, pageItems);
    this.renderBody(table, cols, colSpan, pageItems);
  }

  private visibleColumns(): ColumnSpec<T>[] {
    const vis = this.spec.state.getColumns();
    return this.spec.columns.filter(c => vis[c.key] !== false);
  }

  private renderHeader(table: HTMLTableElement, cols: ColumnSpec<T>[], pageItems: T[]): void {
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
        this.onRerender();
      });
    }
    cols.forEach(c => hRow.createEl('th', { cls: CSS_CLASS.FINANCE_TH, text: c.label }));
    if (this.spec.actionsPosition !== 'above') {
      hRow.createEl('th', { cls: CSS_CLASS.FINANCE_TH });
    }
  }

  private renderBody(table: HTMLTableElement, cols: ColumnSpec<T>[], colSpan: number, pageItems: T[]): void {
    const frag = createFragment();

    pageItems.forEach(item => {
      const id = this.spec.itemId(item);
      const itemTbody = createEl('tbody');
      itemTbody.classList.add('finance-item-tbody');

      const tr = createEl('tr');
      tr.classList.add('finance-tr', 'finance-data-tr');
      this.spec.rowCls?.(item).forEach(c => {
        tr.classList.add(c);
        itemTbody.classList.add(c);
      });

      // Actions above
      if (this.spec.actionsPosition === 'above') {
        const actionTr = this.renderActionsAbove(item, colSpan);
        itemTbody.appendChild(actionTr);
      }

      // Bulk select checkbox
      if (this.bulkMode) {
        const std = createEl('td');
        std.classList.add('finance-td', 'finance-select-td');
        const cb = std.createEl('input', { type: 'checkbox' });
        cb.checked = this.selectedIds.has(id);
        cb.addEventListener('change', (e) => { e.stopPropagation(); this.onToggleSelected(id); });
        tr.appendChild(std);
      }

      // Data columns
      cols.forEach(c => {
        const { text, cls } = c.cell(item);
        const td = createEl('td');
        td.classList.add('finance-td');
        if (cls) cls.split(' ').filter(Boolean).forEach(x => td.classList.add(x));
        td.setAttribute('data-label', c.label);
        td.textContent = text;
        tr.appendChild(td);
      });

      // Actions inline
      if (this.spec.actionsPosition !== 'above') {
        const atd = createEl('td');
        atd.classList.add('finance-td', 'finance-actions-td');
        atd.setAttribute('data-label', '');
        this.spec.rowActions(item).forEach(a => this.mkActionBtn(atd, a));
        tr.appendChild(atd);
      }

      itemTbody.appendChild(tr);

      // Interactivity
      this.attachRowInteractivity(itemTbody, tr, item, id);

      // Expanded content
      if (this.spec.expandable && this.expandedId === id && this.spec.expandable.hasContent(item)) {
        this.renderExpandedRow(itemTbody, tr, item, colSpan);
      }

      frag.appendChild(itemTbody);
    });

    table.appendChild(frag);
  }

  private renderActionsAbove(item: T, colSpan: number): HTMLTableRowElement {
    const actionTr = createEl('tr');
    actionTr.classList.add('finance-tr', 'finance-actions-tr');
    this.spec.rowCls?.(item).forEach(c => actionTr.classList.add(c));

    const actionTd = createEl('td');
    actionTd.colSpan = colSpan;
    actionTd.classList.add('finance-td', 'finance-actions-td-above');

    const actionsContainer = createDiv();
    actionsContainer.classList.add('finance-actions-container-above');
    this.spec.rowActions(item).forEach(a => this.mkActionBtn(actionsContainer, a));
    actionTd.appendChild(actionsContainer);
    actionTr.appendChild(actionTd);

    return actionTr;
  }

  private attachRowInteractivity(itemTbody: HTMLElement, tr: HTMLTableRowElement, item: T, id: string): void {
    const interactiveElements = [tr];
    if (this.spec.actionsPosition === 'above') {
      interactiveElements.push(itemTbody.firstChild as HTMLTableRowElement);
    }

    if (this.bulkMode) {
      interactiveElements.forEach(el => el.classList.add('finance-tr-selectable'));
      interactiveElements.forEach(el => el.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.closest('.finance-action-btn')) return;
        this.onToggleSelected(id);
      }));
    } else if (this.spec.expandable?.hasContent(item)) {
      interactiveElements.forEach(el => el.classList.add('finance-tr-expandable'));
      interactiveElements.forEach(el => el.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('.finance-action-btn')) return;
        this.onToggleExpanded(id);
      }));
    }
  }

  private renderExpandedRow(itemTbody: HTMLElement, tr: HTMLTableRowElement, item: T, colSpan: number): void {
    tr.classList.add('finance-row-expanded');
    itemTbody.classList.add('finance-tbody-expanded');
    const exTr = createEl('tr');
    exTr.classList.add('finance-expand-row');
    const exTd = createEl('td');
    exTd.classList.add('finance-td', 'finance-expand-td');
    exTd.colSpan = colSpan;
    exTd.addEventListener('click', (e) => e.stopPropagation());
    this.spec.expandable!.render(exTd, item);
    exTr.appendChild(exTd);
    itemTbody.appendChild(exTr);
  }

  private mkActionBtn(parent: HTMLElement, a: ActionSpec): void {
    const btn = parent.createEl('button', { cls: CSS_CLASS.FINANCE_ACTION_BTN, text: a.icon });
    if (a.cls) btn.addClass(a.cls);
    btn.title = a.title;
    btn.addEventListener('click', a.onClick);
  }
}
