import { CSS_CLASS } from '../../constants';
import type { TableSpec, ActionSpec } from './types';

export class CardRenderer<T> {
  constructor(
    private spec: TableSpec<T>,
    private bulkMode: boolean,
    private selectedIds: Set<string>,
    private expandedId: string | null,
    private onToggleSelected: (id: string) => void,
    private onToggleExpanded: (id: string) => void
  ) {}

  render(container: HTMLElement, pageItems: T[]): void {
    const isCompact = this.spec.cardCls === 'finance-compact-card';
    const list = container.createDiv(isCompact ? 'finance-records-list finance-compact-list' : 'finance-records-list');
    const frag = createFragment();

    pageItems.forEach(item => {
      const id = this.spec.itemId(item);
      const block = this.createCardBlock(item, id);
      frag.appendChild(block);
    });

    list.appendChild(frag);
  }

  private createCardBlock(item: T, id: string): HTMLElement {
    const block = createDiv();
    block.classList.add('finance-record-block');

    if (this.spec.cardCls) {
      const extraCls = typeof this.spec.cardCls === 'function' ? this.spec.cardCls(item) : [this.spec.cardCls];
      extraCls.forEach(c => block.classList.add(c));
    }
    this.spec.rowCls?.(item).forEach(c => block.classList.add(c));

    // Bulk select checkbox
    if (this.bulkMode) {
      const cb = block.createEl('input', { type: 'checkbox', cls: 'finance-block-checkbox' });
      cb.checked = this.selectedIds.has(id);
      cb.addEventListener('change', (e) => { e.stopPropagation(); this.onToggleSelected(id); });
    }

    // Actions above
    if (this.spec.actionsPosition === 'above') {
      const actionsTop = createDiv();
      actionsTop.classList.add('finance-record-actions', 'finance-actions-above-card');
      this.spec.rowActions(item).forEach(a => this.mkActionBtn(actionsTop, a));
      block.appendChild(actionsTop);
    }

    // Card content
    this.spec.renderCard(block, item);

    // Expandable content
    if (this.spec.expandable?.hasContent(item)) {
      const open = this.expandedId === id;
      if (open) {
        const panel = block.createDiv('finance-debt-history-panel finance-debt-history-open');
        panel.addEventListener('click', (e) => e.stopPropagation());
        this.spec.expandable.render(panel, item);
      }
    }

    // Actions inline
    if (this.spec.actionsPosition !== 'above' && this.spec.actionsPosition !== 'custom') {
      const actions = block.createDiv('finance-record-actions');
      this.spec.rowActions(item).forEach(a => this.mkActionBtn(actions, a));
    }

    // Interactivity
    this.attachCardInteractivity(block, item, id);

    return block;
  }

  private attachCardInteractivity(block: HTMLElement, item: T, id: string): void {
    if (this.bulkMode) {
      block.classList.add('finance-tr-selectable');
      block.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.closest('.finance-action-btn') || t.closest('.finance-compact-del-btn')) return;
        this.onToggleSelected(id);
      });
    } else if (this.spec.expandable?.hasContent(item)) {
      block.classList.add('finance-tr-expandable');
      block.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (
          t.closest('.finance-action-btn') ||
          t.closest('.finance-compact-del-btn') ||
          t.closest('.finance-debt-history-panel') ||
          t.closest('.finance-pagination-nav')
        ) return;
        this.onToggleExpanded(id);
      });
    } else if (this.spec.onCardClick) {
      block.classList.add('finance-card-clickable');
      block.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('.finance-action-btn') || t.closest('.finance-compact-del-btn') || t.tagName === 'INPUT') return;
        this.spec.onCardClick?.(item);
      });
    }
  }

  private mkActionBtn(parent: HTMLElement, a: ActionSpec): void {
    const btn = parent.createEl('button', { cls: CSS_CLASS.FINANCE_ACTION_BTN, text: a.icon });
    if (a.cls) btn.addClass(a.cls);
    btn.title = a.title;
    btn.addEventListener('click', a.onClick);
  }
}
