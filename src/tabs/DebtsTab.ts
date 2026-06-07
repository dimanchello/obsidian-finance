import { Notice } from 'obsidian';
import { ViewContext } from '../context';
import {
  DebtRecord, DebtMovement, FinanceRecord, RecordType,
  DebtSortField, PLURAL_THRESHOLD, SEARCH_DEBOUNCE_MS, PAGE_RANGE_THRESHOLD,
  DEFAULT_DEBT_FILTER,
} from '../types';
import { DebtModal } from '../DebtModal';
import { ColumnVisibilityModal } from '../ColumnVisibilityModal';
import { DebtMovementModal } from '../DebtMovementModal';
import { ConfirmModal } from '../ConfirmModal';

export class DebtsTab {
  private ctx: ViewContext;
  private el: HTMLElement;
  private debtPaginationEl?: HTMLElement;
  private filterDebounce: ReturnType<typeof setTimeout> | null = null;
  private filtersOpen = false;
  onUpdate: (() => void) | null = null;

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;
  }

  render(): void {
    this.el.empty();
    this.renderDebtsView(this.el);
  }

  update(): void {
    this.render();
  }

  private getFilteredDebts(): DebtRecord[] {
    if (!this.ctx.data) return [];
    const f = this.ctx.state.debtFilter ?? DEFAULT_DEBT_FILTER;
    const s = this.ctx.state.debtSort ?? { field: 'createdAt' as DebtSortField, dir: 'desc' };
    const q = f.search.toLowerCase();

    const repaid = (d: DebtRecord) =>
      d.movements.filter(m => m.type === 'repay').reduce((ss, m) => ss + m.amount, 0);
    const isPaidOff = (d: DebtRecord) => repaid(d) >= d.amount;

    let rows = this.ctx.data.debts.filter(d => {
      const dir = (d.direction as string) || 'borrowed';
      if (f.status === 'paid' && !isPaidOff(d)) return false;
      if (f.status === 'unpaid' && isPaidOff(d)) return false;
      if (f.direction !== 'all' && dir !== f.direction) return false;
      if (f.dateFrom && d.date < f.dateFrom) return false;
      if (f.dateTo && d.date > f.dateTo) return false;
      if (f.person && !d.person.toLowerCase().includes(f.person.toLowerCase())) return false;
      if (q) {
        const hay = [d.person, d.note, String(d.amount)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    rows = rows.slice().sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (s.field) {
        case 'date': av = a.date; bv = b.date; break;
        case 'amount': av = a.amount; bv = b.amount; break;
        case 'person': av = a.person; bv = b.person; break;
        default: av = a.createdAt; bv = b.createdAt;
      }
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'ru');
      return s.dir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }

  private getDebtRepaid(debt: DebtRecord): number {
    return debt.movements
      .filter(m => m.type === 'repay')
      .reduce((s, m) => s + m.amount, 0);
  }

  private isDebtPaidOff(debt: DebtRecord): boolean {
    return this.getDebtRepaid(debt) >= debt.amount;
  }

  private getDebtOriginal(debt: DebtRecord): number {
    if (debt.originalAmount > 0) return debt.originalAmount;
    return debt.movements
      .filter(m => m.type === 'borrow')
      .reduce((s, m) => s + m.amount, 0);
  }

  private getDebtWithInterest(debt: DebtRecord): number {
    const original = this.getDebtOriginal(debt);
    const rate = debt.interestRate || 0;
    if (rate <= 0) return original;
    return original + (original * rate / 100);
  }

  private getDebtRemaining(debt: DebtRecord): number {
    const total = this.getDebtWithInterest(debt);
    const repaid = this.getDebtRepaid(debt);
    return Math.max(0, total - repaid);
  }

  private mkActionBtn(parent: HTMLElement, icon: string, title: string, onClick: () => void, extraCls = ''): void {
    const btn = document.createElement('button');
    btn.classList.add('finance-action-btn');
    if (extraCls) btn.classList.add(extraCls);
    btn.title = title;
    btn.textContent = icon;
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
  }

  private renderDebtFilters(container: HTMLElement): void {
    const f = this.ctx.state.debtFilter ?? DEFAULT_DEBT_FILTER;



    const row1 = container.createDiv('finance-filters-row');

    const sg = row1.createDiv('finance-filter-group finance-filter-search');
    sg.createEl('label', { text: 'Поиск', cls: 'finance-filter-label' });
    const si = sg.createEl('input', {
      type: 'text', cls: 'finance-filter-input', placeholder: 'Поиск по всем полям…',
    });
    si.value = f.search;
    si.addEventListener('input', () => {
      if (this.filterDebounce) clearTimeout(this.filterDebounce);
      this.filterDebounce = setTimeout(() => {
        this.ctx.state.debtFilter!.search = si.value;
        this.resetDebtPage();
      }, SEARCH_DEBOUNCE_MS);
    });

    const statusG = row1.createDiv('finance-filter-group');
    statusG.createEl('label', { text: 'Статус', cls: 'finance-filter-label' });
    const statusSel = statusG.createEl('select', { cls: 'finance-filter-select' });
    [
      { v: 'all', l: 'Все' },
      { v: 'unpaid', l: 'Не погашены' },
      { v: 'paid', l: 'Погашены' },
    ].forEach(({ v, l }) => {
      const o = statusSel.createEl('option', { text: l });
      o.value = v;
      o.selected = v === f.status;
    });
    statusSel.addEventListener('change', () => {
      this.ctx.state.debtFilter!.status = statusSel.value as 'all' | 'paid' | 'unpaid';
      this.resetDebtPage();
    });

    const dirG = row1.createDiv('finance-filter-group');
    dirG.createEl('label', { text: 'Направление', cls: 'finance-filter-label' });
    const dirSel = dirG.createEl('select', { cls: 'finance-filter-select' });
    [
      { v: 'all', l: 'Все' },
      { v: 'lent', l: '💸 Мне должны' },
      { v: 'borrowed', l: '💳 Я должен' },
    ].forEach(({ v, l }) => {
      const o = dirSel.createEl('option', { text: l });
      o.value = v;
      o.selected = v === f.direction;
    });
    dirSel.addEventListener('change', () => {
      this.ctx.state.debtFilter!.direction = dirSel.value as 'all' | 'lent' | 'borrowed';
      this.resetDebtPage();
    });

    const row2 = container.createDiv('finance-filters-row');

    const dfG = row2.createDiv('finance-filter-group');
    dfG.createEl('label', { text: 'С', cls: 'finance-filter-label' });
    const dfI = dfG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dfI.value = f.dateFrom;
    dfI.addEventListener('change', () => {
      this.ctx.state.debtFilter!.dateFrom = dfI.value;
      this.resetDebtPage();
    });

    const dtG = row2.createDiv('finance-filter-group');
    dtG.createEl('label', { text: 'По', cls: 'finance-filter-label' });
    const dtI = dtG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dtI.value = f.dateTo;
    dtI.addEventListener('change', () => {
      this.ctx.state.debtFilter!.dateTo = dtI.value;
      this.resetDebtPage();
    });

    const allPersons = this.ctx.data ? [...new Set(this.ctx.data.debts.map(d => d.person).filter(Boolean))] : [];
    const personOpts = [{ v: '', l: 'Все' }, ...allPersons.map(p => ({ v: p, l: p }))];
    this.mkSearchSelect(row2, 'Кому', personOpts, f.person, (v) => {
      this.ctx.state.debtFilter!.person = v;
      this.resetDebtPage();
    });

    const rG = row2.createDiv('finance-filter-group finance-filter-reset');
    rG.createEl('label', { text: '\u00A0', cls: 'finance-filter-label' });
    rG.createEl('button', { text: '✕ Сбросить', cls: 'finance-reset-btn' })
      .addEventListener('click', () => {
        this.ctx.state.debtFilter = { ...DEFAULT_DEBT_FILTER };
        this.resetDebtPage();
      });

    const sortRow = container.createDiv('finance-sort-row');
    sortRow.createEl('span', { text: 'Сортировка:', cls: 'finance-sort-label' });

    const sortFields: { field: DebtSortField; label: string }[] = [
      { field: 'createdAt', label: 'Добавлена' },
      { field: 'date', label: 'Дата' },
      { field: 'amount', label: 'Сумма' },
      { field: 'person', label: 'Кому' },
    ];
    const s = this.ctx.state.debtSort ?? { field: 'createdAt' as DebtSortField, dir: 'desc' };
    sortFields.forEach(({ field, label }) => {
      const active = s.field === field;
      const btn = sortRow.createEl('button', {
        cls: `finance-sort-btn${active ? ' active' : ''}`,
        text: label + (active ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''),
      });
      btn.addEventListener('click', () => {
        this.ctx.state.debtSort = s.field === field
          ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
          : { field, dir: 'desc' };
        this.ctx.saveState();
        this.render();
      });
    });
  }

  private mkSearchSelect(
    row: HTMLElement, label: string,
    opts: { v: string; l: string }[],
    cur: string, onChange: (v: string) => void,
  ): void {
    const g = row.createDiv('finance-filter-group');
    g.createEl('label', { text: label, cls: 'finance-filter-label' });

    const wrapper = g.createDiv('finance-custom-select');
    let selectedValue = cur;

    const trigger = wrapper.createDiv('finance-custom-select-trigger');
    trigger.setAttribute('tabindex', '0');
    const triggerText = trigger.createEl('span', { cls: 'finance-custom-select-text' });
    triggerText.textContent = opts.find(o => o.v === cur)?.l ?? cur ?? opts[0]?.l ?? '—';

    let dropdown: HTMLElement | null = null;
    let isOpen = false;
    let outsideHandler: ((e: MouseEvent) => void) | null = null;
    let searchDebounce: ReturnType<typeof setTimeout> | null = null;

    const closeDropdown = () => {
      if (!isOpen) return;
      isOpen = false;
      dropdown?.remove();
      dropdown = null;
      if (outsideHandler) { document.removeEventListener('mousedown', outsideHandler); outsideHandler = null; }
    };

    const resetSelection = () => {
      selectedValue = opts[0]?.v ?? '';
      triggerText.textContent = opts[0]?.l ?? '—';
      onChange(selectedValue);
      closeDropdown();
    };

    const openDropdown = () => {
      if (isOpen) { closeDropdown(); return; }
      isOpen = true;

      dropdown = wrapper.createDiv('finance-custom-select-dropdown');

      const searchInput = dropdown.createEl('input', {
        type: 'text',
        cls: 'finance-custom-select-search',
        placeholder: 'Поиск…',
      });

      const list = dropdown.createDiv('finance-custom-select-options');

      let filteredOpts = opts;

      const renderOpts = () => {
        list.empty();
        filteredOpts.forEach(o => {
          const item = list.createDiv({ cls: `finance-custom-select-item${o.v === selectedValue ? ' selected' : ''}` });
          item.textContent = o.l;
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectedValue = o.v;
            triggerText.textContent = o.l;
            onChange(o.v);
            closeDropdown();
          });
        });
      };

      searchInput.addEventListener('input', () => {
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          const sq = searchInput.value.toLowerCase();
          filteredOpts = opts.filter(o => o.l.toLowerCase().includes(sq));
          renderOpts();
        }, SEARCH_DEBOUNCE_MS);
      });
      searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') { resetSelection(); }
      });

      renderOpts();

      outsideHandler = (e: MouseEvent) => {
        if (!wrapper.contains(e.target as Node)) closeDropdown();
      };
      document.addEventListener('mousedown', outsideHandler);
    };

    trigger.addEventListener('click', (e) => { e.stopPropagation(); openDropdown(); });
    trigger.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });
  }

  private resetDebtPage(): void {
    this.ctx.state.debtPage = 0;
    this.ctx.saveState();
    this.render();
  }

  private renderDebtsView(body: HTMLElement): void {
    const allDebts = this.ctx.data?.debts ?? [];

    this.ctx.state.debtFilter ??= { ...DEFAULT_DEBT_FILTER };

    const filteredDebts = this.getFilteredDebts();

    this.ctx.renderRecordsStats(body);

    const summary = body.createDiv('finance-stats-container');
    summary.style.setProperty('grid-template-columns', 'repeat(2,1fr)', 'important');

    const lentDebts = allDebts.filter(d => d.direction === 'lent');
    const borrowedDebts = allDebts.filter(d => d.direction !== 'lent');

    const lentTotal = lentDebts.reduce((s, d) => s + this.getDebtOriginal(d), 0);
    const lentRepaid = lentDebts.reduce((s, d) => s + this.getDebtRepaid(d), 0);
    const lentRemaining = lentTotal - lentRepaid;

    const borrowedTotal = borrowedDebts.reduce((s, d) => s + this.getDebtOriginal(d), 0);
    const borrowedRepaid = borrowedDebts.reduce((s, d) => s + this.getDebtRepaid(d), 0);
    const borrowedRemaining = borrowedTotal - borrowedRepaid;

    const mkDebtCard = (title: string, icon: string, total: number, remaining: number, count: number, isLent: boolean) => {
      const card = summary.createDiv(`finance-stat-card finance-stat-${isLent ? 'lent-summary' : 'borrowed-summary'}`);
      const header = card.createDiv('finance-debt-summary-header');
      header.createEl('span', { text: icon, cls: 'finance-debt-summary-icon' });
      header.createEl('span', { text: title, cls: 'finance-debt-summary-title' });

      const content = card.createDiv('finance-debt-summary-content');
      content.createEl('div', {
        text: remaining > 0 ? this.ctx.fmt(remaining) : '—',
        cls: 'finance-debt-summary-main',
      });
      content.createEl('div', {
        text: `${count} ${count === 1 ? 'долг' : count < PLURAL_THRESHOLD ? 'долга' : 'долгов'}`,
        cls: 'finance-debt-summary-sub',
      });
    };

    mkDebtCard('Мне должны', '💸', lentTotal, lentRemaining, lentDebts.length, true);
    mkDebtCard('Я должен', '💳', borrowedTotal, borrowedRemaining, borrowedDebts.length, false);

    const toolbar = body.createDiv('finance-debt-toolbar');
    const newDebtBtn = toolbar.createEl('button', { cls: 'finance-add-btn finance-accent-btn' });
    newDebtBtn.innerHTML = '<span class="btn-icon">＋</span><span>Новый долг</span>';
    newDebtBtn.addEventListener('click', () => this.openNewDebtModal());

    const filtBtn = toolbar.createEl('button', { cls: 'finance-analytics-toggle-btn' });
    const updateFiltBtn = () => {
      filtBtn.textContent = `🔍 Фильтры ${this.filtersOpen ? '▲' : '▼'}`;
      filtBtn.classList.toggle('active', this.filtersOpen);
    };
    updateFiltBtn();
    filtBtn.addEventListener('click', () => {
      this.filtersOpen = !this.filtersOpen;
      this.render();
    });

    const container = body.createDiv('finance-filters-container');
    container.style.display = this.filtersOpen ? 'block' : 'none';
    if (this.filtersOpen) {
      this.renderDebtFilters(container);
    }

    if (!allDebts.length) {
      const e = body.createDiv('finance-empty-state');
      e.createEl('div', { text: '💳', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Нет долгов', cls: 'finance-empty-title' });
      e.createEl('p', { text: 'Нажмите «Новый долг»', cls: 'finance-empty-sub' });
      return;
    }

    if (!filteredDebts.length) {
      const e = body.createDiv('finance-empty-state');
      e.createEl('div', { text: '🔍', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Долгов не найдено', cls: 'finance-empty-title' });
      e.createEl('p', { text: 'Попробуйте изменить фильтры', cls: 'finance-empty-sub' });
      return;
    }

    const tw = body.createDiv('finance-table-wrapper');
    this.renderDebtsList(tw, filteredDebts);
  }

  private renderDebtsList(wrapper: HTMLElement, filteredDebts: DebtRecord[]): void {
    wrapper.empty();
    this.debtPaginationEl = undefined;

    const container = wrapper.createDiv('finance-table-container');
    this.debtPaginationEl = wrapper.createDiv('finance-pagination');

    const { pageSize } = this.ctx.state;
    const totalPages = Math.max(1, Math.ceil(filteredDebts.length / pageSize));
    const page = Math.max(0, Math.min(this.ctx.state.debtPage ?? 0, totalPages - 1));
    this.ctx.state.debtPage = page;
    const start = page * pageSize;
    const pageDebts = filteredDebts.slice(start, start + pageSize);

    const infoBar = container.createDiv('finance-table-info-bar');
    const metaLeft = infoBar.createDiv('finance-table-meta');
    metaLeft.createEl('span', {
      text: `${start + 1}–${Math.min(start + pageSize, filteredDebts.length)} из ${filteredDebts.length}`,
      cls: 'finance-count-text',
    });

    const allDebtCols: { key: string; label: string }[] = [
      { key: 'direction', label: 'Тип' },
      { key: 'person',    label: 'Кому' },
      { key: 'original',  label: 'Сумма' },
      { key: 'remaining', label: 'Остаток' },
      { key: 'date',      label: 'Создан' },
      { key: 'dueDate',   label: 'Вернуть до' },
      { key: '_act',      label: '' },
    ];

    this.ctx.state.debtsColumns ??= {};

    const visDebtCols = allDebtCols.filter(c => c.key === '_act' || this.ctx.state.debtsColumns![c.key] !== false);

    if (!this.ctx.isMobile) {
      const debtColVisCols = allDebtCols.filter(c => c.key !== '_act');
      const gearBtn = infoBar.createEl('button', { cls: 'finance-colvis-btn', text: '⚙️' });
      gearBtn.title = 'Настройка колонок';
      gearBtn.addEventListener('click', () => {
        new ColumnVisibilityModal(this.ctx.app, {
          columns: debtColVisCols,
          visibility: { ...this.ctx.state.debtsColumns! },
          onSave: (updated) => {
            this.ctx.state.debtsColumns = updated;
            this.ctx.saveState();
            this.render();
          },
        }).open();
      });
    }

    if (this.ctx.isMobile) {
      this.renderDebtsAsBlocks(container, pageDebts);
    } else {
      this.renderDebtsAsTable(container, pageDebts, visDebtCols);
    }

    if (totalPages > 1) this.renderDebtPagination(totalPages, page);
  }

  private renderDebtMovementsPanel(parent: HTMLElement, debt: DebtRecord): void {
    if (!debt.movements.length) {
      return;
    }

    const wrapper = parent.createDiv();
    wrapper.style.padding = '10px 12px 12px';
    const scrollWrapper = wrapper.createDiv({ cls: 'finance-mov-scroll' });
    const movTable = scrollWrapper.createEl('table', { cls: 'finance-mov-table' });
    const movHead = movTable.createEl('thead').createEl('tr');
    ['Тип', 'Сумма', 'Дата', 'Примечание', ''].forEach(l => {
      movHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
    });
    const movBody = movTable.createEl('tbody');
    const isLent = debt.direction === 'lent';
    debt.movements.forEach(m => {
      const mr = movBody.createEl('tr', { cls: `finance-mov-${m.type}` });
      const typeLabel = m.type === 'borrow'
        ? (isLent ? '➕ Дал ещё' : '➕ Взял ещё')
        : (isLent ? '💰 Вернули' : '💰 Погашение');
      mr.createEl('td', { text: typeLabel, cls: 'finance-td' });
      mr.createEl('td', {
        text: (m.type === 'borrow' ? '−' : '+') + this.ctx.fmt(m.amount),
        cls: `finance-td finance-td-mov-${m.type}`,
      });
      mr.createEl('td', { text: this.ctx.fmtDate(m.date, m.time), cls: 'finance-td' });
      mr.createEl('td', { text: m.note || '—', cls: 'finance-td' });
      const atd = mr.createEl('td', { cls: 'finance-td finance-actions-td' });
      this.mkActionBtn(atd, '✏️', 'Редактировать', () => this.openEditMovementModal(debt, m));
      this.mkActionBtn(atd, '🗑️', 'Удалить', () => this.confirmDeleteMovement(debt, m), 'finance-delete-btn');
    });
  }

  private renderDebtsAsBlocks(container: HTMLElement, pageDebts: DebtRecord[]): void {
    const list = container.createDiv('finance-debts-list');
    const frag = document.createDocumentFragment();

    pageDebts.forEach(debt => {
      const dir = (debt.direction as string) || 'borrowed';
      const block = document.createElement('div');
      block.classList.add('finance-debt-block');
      block.classList.add(dir === 'lent' ? 'finance-debt-lent' : 'finance-debt-borrowed');
      if (this.isDebtPaidOff(debt)) {
        block.classList.add('finance-debt-paid');
      } else {
        block.classList.add('finance-debt-unpaid');
      }

      const header = block.createDiv('finance-debt-header');
      header.createEl('span', { text: debt.person || '—', cls: 'finance-debt-person' });
      header.createEl('span', {
        text: dir === 'lent' ? '💸 Мне должны' : '💳 Я должен',
        cls: 'finance-debt-direction ' + (dir === 'lent' ? 'finance-dir-lent' : 'finance-dir-borrowed'),
      });

      const amounts = block.createDiv('finance-debt-amounts');
      const original = this.getDebtOriginal(debt);
      const withInterest = this.getDebtWithInterest(debt);
      const remaining = this.getDebtRemaining(debt);

      const hasInterest = typeof debt.interestRate === 'number' && debt.interestRate > 0;
      const amtOrig = amounts.createDiv('finance-debt-amount');
      amtOrig.createEl('span', { text: hasInterest ? 'Сумма + %' : 'Сумма', cls: 'finance-debt-amount-label' });
      if (hasInterest) {
        amtOrig.createEl('span', {
          text: this.ctx.fmt(original) + ' → ' + this.ctx.fmt(withInterest),
          cls: 'finance-debt-amount-value',
        });
      } else {
        amtOrig.createEl('span', { text: this.ctx.fmt(original), cls: 'finance-debt-amount-value' });
      }

      if (remaining > 0) {
        const amtRem = amounts.createDiv('finance-debt-amount');
        amtRem.createEl('span', { text: 'Остаток', cls: 'finance-debt-amount-label' });
        amtRem.createEl('span', { text: this.ctx.fmt(remaining), cls: 'finance-debt-amount-value finance-debt-remaining' });
      }

      if (debt.dueDate) {
        block.createEl('div', { text: `📅 до ${this.ctx.fmtDate(debt.dueDate)}`, cls: 'finance-debt-due-date' });
      }
      if (hasInterest) {
        block.createEl('div', { text: `📊 ${debt.interestRate}%`, cls: 'finance-debt-due-date' });
      }

      if (debt.note) {
        block.createEl('div', { text: debt.note, cls: 'finance-debt-note' });
      }

      const historyToggle = block.createEl('button', {
        cls: 'finance-debt-history-toggle',
        text: `📋 История операций (${debt.movements.length}) ▼`,
      });
      const historyWrap = block.createDiv('finance-debt-history-panel');
      this.renderDebtMovementsPanel(historyWrap, debt);

      historyToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !historyWrap.hasClass('finance-debt-history-open');
        historyWrap.toggleClass('finance-debt-history-open', open);
        block.toggleClass('finance-debt-block-expanded', open);
        historyToggle.textContent = open
          ? `📋 История операций (${debt.movements.length}) ▲`
          : `📋 История операций (${debt.movements.length}) ▼`;
      });

      const actions = block.createDiv('finance-debt-block-actions');
      this.mkActionBtn(actions, '💰', 'Погасить', () => this.openRepayModal(debt));
      this.mkActionBtn(actions, '➕', 'Взять ещё', () => this.openBorrowMoreModal(debt));
      this.mkActionBtn(actions, '✏️', 'Редактировать', () => this.openEditDebtModal(debt));
      this.mkActionBtn(actions, '🗑️', 'Удалить', () => this.confirmDeleteDebt(debt), 'finance-delete-btn');

      frag.appendChild(block);
    });

    list.appendChild(frag);
  }

  private renderDebtsAsTable(container: HTMLElement, pageDebts: DebtRecord[], cols: { key: string; label: string }[]): void {
    const scroll = container.createDiv('finance-debt-table-scroll');
    const table = scroll.createEl('table', { cls: 'finance-debt-table' });

    const hRow = table.createEl('thead').createEl('tr');
    cols.forEach(c => hRow.createEl('th', { text: c.label, cls: 'finance-th' }));

    const tbody = table.createEl('tbody');
    const frag = document.createDocumentFragment();

    const dataCols = cols.filter(c => c.key !== '_act');

    pageDebts.forEach(debt => {
      const tr = document.createElement('tr');
      tr.classList.add('finance-tr', 'finance-debt-row');
      const dir = (debt.direction as string) || 'borrowed';
      if (dir === 'lent') {
        tr.classList.add('finance-debt-lent');
      } else {
        tr.classList.add('finance-debt-borrowed');
      }
      if (this.isDebtPaidOff(debt)) {
        tr.classList.add('finance-debt-paid');
      } else {
        tr.classList.add('finance-debt-unpaid');
      }

      const dirText = dir === 'lent' ? '💸 Мне должны' : '💳 Я должен';
      const dirCls = dir === 'lent' ? 'finance-dir-lent' : 'finance-dir-borrowed';
      const original = this.getDebtOriginal(debt);
      const withInterest = this.getDebtWithInterest(debt);
      const remaining = this.getDebtRemaining(debt);
      const dueDateText = debt.dueDate ? this.ctx.fmtDate(debt.dueDate) : '—';
      const dueDateCls = debt.dueDate ? 'finance-due-date' : '';

      const hasInterest = typeof debt.interestRate === 'number' && debt.interestRate > 0;
      const originalText = hasInterest
        ? `${this.ctx.fmt(original)} → ${this.ctx.fmt(withInterest)} (${debt.interestRate}%)`
        : this.ctx.fmt(original);

      dataCols.forEach(c => {
        let text = '';
        let cls = '';
        switch (c.key) {
          case 'direction':
            text = dirText;
            cls = dirCls;
            break;
          case 'person':
            text = debt.person || '—';
            break;
          case 'original':
            text = originalText;
            cls = 'finance-amount-cell';
            break;
          case 'remaining':
            text = remaining > 0 ? this.ctx.fmt(remaining) : '—';
            cls = remaining > 0 ? 'finance-amount-cell finance-amount-remaining' : 'finance-amount-cell';
            break;
          case 'date':
            text = this.ctx.fmtDate(debt.date);
            break;
          case 'dueDate':
            text = dueDateText;
            cls = dueDateCls;
            break;
        }
        const td = document.createElement('td');
        td.classList.add('finance-td');
        if (cls) cls.split(' ').forEach(x => td.classList.add(x));
        td.setAttribute('data-label', c.label);
        td.textContent = text;
        tr.appendChild(td);
      });

      if (cols.find(c => c.key === '_act')) {
        const atd = document.createElement('td');
        atd.classList.add('finance-td', 'finance-actions-td');
        atd.setAttribute('data-label', '');

        this.mkActionBtn(atd, '💰', 'Погасить', () => this.openRepayModal(debt));
        this.mkActionBtn(atd, '➕', 'Взять ещё', () => this.openBorrowMoreModal(debt));
        this.mkActionBtn(atd, '✏️', 'Редактировать', () => this.openEditDebtModal(debt));
        this.mkActionBtn(atd, '🗑️', 'Удалить', () => this.confirmDeleteDebt(debt), 'finance-delete-btn');

        tr.appendChild(atd);
      }

      const expandRow = document.createElement('tr');
      expandRow.classList.add('finance-debt-expand-row');
      const expandTd = document.createElement('td');
      expandTd.setAttribute('colspan', String(cols.length));
      expandTd.classList.add('finance-debt-expand-td');
      this.renderDebtMovementsPanel(expandTd, debt);

      expandRow.appendChild(expandTd);
      expandRow.style.display = 'none';

      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.finance-action-btn')) return;
        const open = expandRow.style.display === 'none';
        expandRow.style.display = open ? 'table-row' : 'none';
        tr.classList.toggle('finance-debt-row-expanded', open);
        expandRow.classList.toggle('finance-debt-expand-open', open);
      });

      frag.appendChild(tr);
      frag.appendChild(expandRow);
    });

    tbody.appendChild(frag);
  }

  private renderDebtPagination(totalPages: number, current: number): void {
    const host = this.debtPaginationEl;
    if (!host) return;
    const nav = host.createDiv('finance-pagination-nav');

    const go = (page: number) => {
      this.ctx.state.debtPage = page;
      this.ctx.saveState();
      this.render();
    };

    const prev = nav.createEl('button', { cls: 'finance-page-btn', text: '←' });
    prev.disabled = current === 0;
    prev.addEventListener('click', () => go(current - 1));

    this.pageRange(current, totalPages).forEach(p => {
      if (p === -1) { nav.createEl('span', { text: '…', cls: 'finance-page-ellipsis' }); return; }
      const btn = nav.createEl('button', {
        text: String(p + 1),
        cls:  `finance-page-btn${p === current ? ' active' : ''}`,
      });
      btn.addEventListener('click', () => go(p));
    });

    const next = nav.createEl('button', { cls: 'finance-page-btn', text: '→' });
    next.disabled = current >= totalPages - 1;
    next.addEventListener('click', () => go(current + 1));
  }

  private pageRange(cur: number, total: number): number[] {
    if (total <= PAGE_RANGE_THRESHOLD) return Array.from({ length: total }, (_, i) => i);
    const radius = this.ctx.isMobile ? 1 : 3;
    const p: number[] = [0];
    if (cur > radius + 1) p.push(-1);
    for (let i = Math.max(1, cur - radius); i <= Math.min(total - 2, cur + radius); i++) p.push(i);
    if (cur < total - (radius + 2)) p.push(-1);
    p.push(total - 1);
    return p;
  }

  private openNewDebtModal(): void {
    if (!this.ctx.data) { new Notice('⏳ Загрузка…'); return; }
    const allPersons = this.ctx.data.payers;
    const nowTime = new Date().toTimeString().slice(0, 5);
    new DebtModal(this.ctx.app, {
      title: '➕ Новый долг',
      allPersons,
      onSave: async debt => {
        const note = debt.direction === 'lent' ? 'Дано в долг' : 'Взято в долг';
        const mov: DebtMovement = {
          id: crypto.randomUUID(),
          type: 'borrow',
          amount: debt.amount,
          date: debt.date,
          time: debt.time,
          createdAt: debt.createdAt,
          note,
        };
        debt.movements = [mov];
        await this.ctx.storage.addDebt(this.ctx.notePath, debt);

        const recType: RecordType = debt.direction === 'lent' ? 'expense' : 'income';
        const recNote = debt.direction === 'lent'
          ? `Дано в долг: ${debt.person}`
          : `Взято в долг: ${debt.person}`;
        const rec: FinanceRecord = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          date: debt.date,
          time: debt.time || nowTime,
          type: recType,
          amount: debt.amount,
          category: 'Долг',
          tag: '',
          payer: debt.person,
          note: recNote,
          attachmentPath: '',
          linkedId: debt.id,
        };
        await this.ctx.storage.addRecord(this.ctx.notePath, rec);

        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.onUpdate?.();
        new Notice('✅ Долг добавлен');
      },
    }).open();
  }

  private openEditDebtModal(debt: DebtRecord): void {
    if (!this.ctx.data) return;
    const allPersons = this.ctx.data.payers.concat(this.ctx.data.debts.map(d => d.person));
    const unique = [...new Set(allPersons)];
    new DebtModal(this.ctx.app, {
      title: '✏️ Редактировать долг',
      debt,
      allPersons: unique,
      onSave: async updated => {
        await this.ctx.storage.updateDebt(this.ctx.notePath, updated);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.onUpdate?.();
        new Notice('✅ Долг обновлён');
      },
    }).open();
  }

  private openRepayModal(debt: DebtRecord): void {
    const nowTime = new Date().toTimeString().slice(0, 5);
    const cur = this.ctx.currency;
    new DebtMovementModal(this.ctx.app, {
      title: `💰 Погашение долга — ${debt.person}`,
      type: 'repay',
      remainingAmount: this.getDebtRemaining(debt),
      currency: cur,
      onSave: async mov => {
        await this.ctx.storage.addDebtMovement(this.ctx.notePath, debt.id, mov);

        const recType: RecordType = debt.direction === 'lent' ? 'income' : 'expense';
        const recNote = debt.direction === 'lent'
          ? `Возврат долга: ${debt.person}`
          : `Погашение долга: ${debt.person}`;
        const rec: FinanceRecord = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          date: mov.date,
          time: mov.time || nowTime,
          type: recType,
          amount: mov.amount,
          category: 'Долг',
          tag: '',
          payer: debt.person,
          note: recNote,
          attachmentPath: '',
          linkedId: debt.id,
        };
        await this.ctx.storage.addRecord(this.ctx.notePath, rec);

        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.onUpdate?.();
        new Notice('✅ Погашение записано');
      },
    }).open();
  }

  private openBorrowMoreModal(debt: DebtRecord): void {
    const nowTime = new Date().toTimeString().slice(0, 5);
    new DebtMovementModal(this.ctx.app, {
      title: `➕ Увеличить долг — ${debt.person}`,
      type: 'borrow',
      onSave: async mov => {
        await this.ctx.storage.addDebtMovement(this.ctx.notePath, debt.id, mov);

        const recType: RecordType = debt.direction === 'lent' ? 'expense' : 'income';
        const recNote = debt.direction === 'lent'
          ? `Дополнительно дано в долг: ${debt.person}`
          : `Дополнительно взято в долг: ${debt.person}`;
        const rec: FinanceRecord = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          date: mov.date,
          time: mov.time || nowTime,
          type: recType,
          amount: mov.amount,
          category: 'Долг',
          tag: '',
          payer: debt.person,
          note: recNote,
          attachmentPath: '',
          linkedId: debt.id,
        };
        await this.ctx.storage.addRecord(this.ctx.notePath, rec);

        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.onUpdate?.();
        new Notice('✅ Сумма долга увеличена');
      },
    }).open();
  }

  private openEditMovementModal(debt: DebtRecord, mov: DebtMovement): void {
    const cur = this.ctx.currency;
    new DebtMovementModal(this.ctx.app, {
      title: `✏️ Редактировать движение — ${debt.person}`,
      type: mov.type,
      movement: mov,
      currency: cur,
      onSave: async updated => {
        await this.ctx.storage.updateDebtMovement(this.ctx.notePath, debt.id, updated);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.onUpdate?.();
        new Notice('✅ Движение обновлено');
      },
    }).open();
  }

  private confirmDeleteMovement(debt: DebtRecord, mov: DebtMovement): void {
    const label = `${mov.type === 'borrow' ? '−' : '+'}${this.ctx.fmt(mov.amount)}  ·  ${this.ctx.fmtDate(mov.date, mov.time)}`;
    new ConfirmModal(this.ctx.app, `Удалить движение?\n${label}`, async () => {
      await this.ctx.storage.deleteDebtMovement(this.ctx.notePath, debt.id, mov.id);
      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.onUpdate?.();
      new Notice('🗑️ Движение удалено');
    }).open();
  }

  private confirmDeleteDebt(debt: DebtRecord): void {
    const label = `${debt.person} · ${this.ctx.fmt(debt.amount)} · ${this.ctx.fmtDate(debt.date, debt.time)}`;
    new ConfirmModal(this.ctx.app, `Удалить долг?\n${label}`, async () => {
      await this.ctx.storage.deleteDebt(this.ctx.notePath, debt.id);
      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.onUpdate?.();
      new Notice('🗑️ Долг удалён');
    }).open();
  }
}
