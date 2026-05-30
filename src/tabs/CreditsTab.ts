import { Notice } from 'obsidian';
import { ViewContext } from '../context';
import {
  CreditRecord, FinanceRecord,
  CreditSortField, PLURAL_THRESHOLD, SEARCH_DEBOUNCE_MS, PAGE_RANGE_THRESHOLD, FOCUS_DELAY_MS,
  DEFAULT_CREDIT_FILTER,
} from '../types';
import { CreditModal } from '../CreditModal';
import { ColumnVisibilityModal } from '../ColumnVisibilityModal';
import { CreditPaymentModal } from '../CreditPaymentModal';
import { CreditEarlyRepaymentModal } from '../CreditEarlyRepaymentModal';
import { ConfirmModal } from '../ConfirmModal';

export class CreditsTab {
  private ctx: ViewContext;
  private el: HTMLElement;
  private creditPaginationEl?: HTMLElement;
  private filterDebounce: ReturnType<typeof setTimeout> | null = null;
  private expandedCreditId: string | null = null;
  private creditPaymentPages = new Map<string, number>();

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;
  }

  render(): void {
    this.el.empty();
    this.renderCreditsView(this.el);
  }

  update(): void {
    this.render();
  }

  private resetCreditPage(): void {
    this.ctx.state.creditPage = 0;
    this.ctx.saveState();
    this.render();
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

      const list = dropdown.createDiv('finance-custom-select-list');

      const renderList = (q: string) => {
        list.empty();
        const lq = q.toLowerCase();
        const filtered = opts.filter(o => !lq || o.l.toLowerCase().includes(lq) || o.v.toLowerCase().includes(lq));
        if (!filtered.length) {
          list.createDiv({ cls: 'finance-custom-select-empty', text: 'Нет вариантов' });
          return;
        }
        filtered.forEach(({ v, l }) => {
          const item = list.createDiv({ cls: `finance-custom-select-item${v === selectedValue ? ' is-active' : ''}` });
          item.textContent = l;
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectedValue = v;
            triggerText.textContent = l;
            onChange(v);
            closeDropdown();
          });
        });
      };

      renderList('');
      searchInput.addEventListener('input', () => {
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => renderList(searchInput.value), SEARCH_DEBOUNCE_MS);
      });
      searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = list.querySelector<HTMLElement>('.finance-custom-select-item');
          if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
        if (e.key === 'ArrowDown') {
          const first = list.querySelector<HTMLElement>('.finance-custom-select-item');
          first?.focus();
        }
        if (e.key === 'Escape') { resetSelection(); }
      });
      setTimeout(() => searchInput.focus(), FOCUS_DELAY_MS);

      outsideHandler = (e: MouseEvent) => {
        if (!wrapper.contains(e.target as Node)) closeDropdown();
      };
      setTimeout(() => document.addEventListener('mousedown', outsideHandler!), 0);
    };

    trigger.addEventListener('click', openDropdown);
    trigger.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown(); }
      if (e.key === 'Escape') { e.preventDefault(); resetSelection(); }
    });
  }

  private renderCreditFilters(body: HTMLElement): void {
    const f = this.ctx.state.creditFilter ?? DEFAULT_CREDIT_FILTER;

    const filtersContainer = body.createDiv('finance-filters-container');

    const row1 = filtersContainer.createDiv('finance-filters-row');

    const sg = row1.createDiv('finance-filter-group finance-filter-search');
    sg.createEl('label', { text: 'Поиск', cls: 'finance-filter-label' });
    const si = sg.createEl('input', {
      type: 'text', cls: 'finance-filter-input', placeholder: 'Поиск по названию или банку…',
    });
    si.value = f.search;
    si.addEventListener('input', () => {
      if (this.filterDebounce) clearTimeout(this.filterDebounce);
      this.filterDebounce = setTimeout(() => {
        this.ctx.state.creditFilter!.search = si.value;
        this.resetCreditPage();
      }, SEARCH_DEBOUNCE_MS);
    });

    const statusG = row1.createDiv('finance-filter-group');
    statusG.createEl('label', { text: 'Статус', cls: 'finance-filter-label' });
    const statusSel = statusG.createEl('select', { cls: 'finance-filter-select' });
    [
      { v: 'all', l: 'Все' },
      { v: 'active', l: 'Активные' },
      { v: 'paid', l: 'Погашенные' },
    ].forEach(({ v, l }) => {
      const o = statusSel.createEl('option', { text: l });
      o.value = v;
      o.selected = v === f.status;
    });
    statusSel.addEventListener('change', () => {
      this.ctx.state.creditFilter!.status = statusSel.value as 'all' | 'active' | 'paid';
      this.resetCreditPage();
    });

    const allBanks = this.ctx.data ? [...new Set(this.ctx.data.credits.map(c => c.bankName).filter(Boolean))] : [];
    const bankOpts = [{ v: '', l: 'Все банки' }, ...allBanks.map(b => ({ v: b, l: b }))];
    this.mkSearchSelect(row1, 'Банк', bankOpts, f.bankName, (v) => {
      this.ctx.state.creditFilter!.bankName = v;
      this.resetCreditPage();
    });

    const row2 = filtersContainer.createDiv('finance-filters-row');

    const dfG = row2.createDiv('finance-filter-group');
    dfG.createEl('label', { text: 'С', cls: 'finance-filter-label' });
    const dfI = dfG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dfI.value = f.dateFrom;
    dfI.addEventListener('change', () => {
      this.ctx.state.creditFilter!.dateFrom = dfI.value;
      this.resetCreditPage();
    });

    const dtG = row2.createDiv('finance-filter-group');
    dtG.createEl('label', { text: 'По', cls: 'finance-filter-label' });
    const dtI = dtG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dtI.value = f.dateTo;
    dtI.addEventListener('change', () => {
      this.ctx.state.creditFilter!.dateTo = dtI.value;
      this.resetCreditPage();
    });

    const typeG = row2.createDiv('finance-filter-group');
    typeG.createEl('label', { text: 'Тип', cls: 'finance-filter-label' });
    const typeSel = typeG.createEl('select', { cls: 'finance-filter-select' });
    [
      { v: 'all', l: 'Все типы' },
      { v: 'consumer', l: 'Потребительский' },
      { v: 'auto', l: 'Автокредит' },
      { v: 'mortgage', l: 'Ипотека' },
    ].forEach(({ v, l }) => {
      const o = typeSel.createEl('option', { text: l });
      o.value = v;
      o.selected = v === f.type;
    });
    typeSel.addEventListener('change', () => {
      this.ctx.state.creditFilter!.type = typeSel.value as 'all' | 'consumer' | 'auto' | 'mortgage';
      this.resetCreditPage();
    });

    const rG = row2.createDiv('finance-filter-group finance-filter-reset');
    rG.createEl('label', { text: '\u00A0', cls: 'finance-filter-label' });
    rG.createEl('button', { text: '✕ Сбросить', cls: 'finance-reset-btn' })
      .addEventListener('click', () => {
        this.ctx.state.creditFilter = { ...DEFAULT_CREDIT_FILTER };
        this.resetCreditPage();
      });

    const sortRow = filtersContainer.createDiv('finance-sort-row');
    sortRow.createEl('span', { text: 'Сортировка:', cls: 'finance-sort-label' });

    const sortFields: { field: CreditSortField; label: string }[] = [
      { field: 'createdAt', label: 'Добавлен' },
      { field: 'date', label: 'Дата открытия' },
      { field: 'amount', label: 'Сумма' },
      { field: 'bankName', label: 'Банк' },
    ];
    const s = this.ctx.state.creditSort ?? { field: 'createdAt' as CreditSortField, dir: 'desc' };
    sortFields.forEach(({ field, label }) => {
      const active = s.field === field;
      const btn = sortRow.createEl('button', {
        cls: `finance-sort-btn${active ? ' active' : ''}`,
        text: label + (active ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''),
      });
      btn.addEventListener('click', () => {
        this.ctx.state.creditSort = s.field === field
          ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
          : { field, dir: 'desc' };
        this.ctx.saveState();
        this.render();
      });
    });
  }

  private renderCreditsView(body: HTMLElement): void {
    if (!this.ctx.data) return;
    const allCredits = this.ctx.data.credits || [];

    this.ctx.state.creditFilter ??= { ...DEFAULT_CREDIT_FILTER };

    const filteredCredits = this.getFilteredCredits();

    this.ctx.renderRecordsStats(body);

    const summary = body.createDiv('finance-stats-container');
    summary.style.setProperty('grid-template-columns', 'repeat(2,1fr)', 'important');
    const activeCredits = allCredits.filter(c => c.status === 'active');
    const paidCredits = allCredits.filter(c => c.status === 'paid');
    const totalAmount = activeCredits.reduce((s, c) => s + c.currentAmount, 0);
    const paidAmount = paidCredits.reduce((s, c) => s + c.originalAmount, 0);

    const mkCreditCard = (title: string, icon: string, amount: number, count: number, isActive: boolean) => {
      const card = summary.createDiv(`finance-stat-card finance-stat-${isActive ? 'credit-active' : 'credit-paid'}`);
      const header = card.createDiv('finance-debt-summary-header');
      header.createEl('span', { text: icon, cls: 'finance-debt-summary-icon' });
      header.createEl('span', { text: title, cls: 'finance-debt-summary-title' });

      const content = card.createDiv('finance-debt-summary-content');
      content.createEl('div', {
        text: amount > 0 ? this.ctx.fmt(amount) : '—',
        cls: 'finance-debt-summary-main',
      });
      content.createEl('div', {
        text: `${count} ${count === 1 ? 'кредит' : count < PLURAL_THRESHOLD ? 'кредита' : 'кредитов'}`,
        cls: 'finance-debt-summary-sub',
      });
    };

    mkCreditCard('Активные', '💳', totalAmount, activeCredits.length, true);
    mkCreditCard('Погашенные', '✅', paidAmount, paidCredits.length, false);

    const toolbar = body.createDiv('finance-debt-toolbar');
    const newCreditBtn = toolbar.createEl('button', { cls: 'finance-add-btn finance-accent-btn' });
    newCreditBtn.innerHTML = '<span class="btn-icon">＋</span><span>Новый кредит</span>';
    newCreditBtn.addEventListener('click', () => this.openNewCreditModal());

    this.renderCreditFilters(body);

    if (!allCredits.length) {
      const e = body.createDiv('finance-empty-state');
      e.createEl('div', { text: '🏦', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Нет кредитов', cls: 'finance-empty-title' });
      e.createEl('p', { text: 'Нажмите «Новый кредит»', cls: 'finance-empty-sub' });
      return;
    }

    if (!filteredCredits.length) {
      const e = body.createDiv('finance-empty-state');
      e.createEl('div', { text: '🔍', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Кредитов не найдено', cls: 'finance-empty-title' });
      e.createEl('p', { text: 'Попробуйте изменить фильтры', cls: 'finance-empty-sub' });
      return;
    }

    const tw = body.createDiv('finance-table-wrapper');
    this.renderCreditsList(tw, filteredCredits);
  }

  private getFilteredCredits(): CreditRecord[] {
    if (!this.ctx.data) return [];
    const f = this.ctx.state.creditFilter!;
    let result = [...this.ctx.data.credits];
    if (f.search) {
      const q = f.search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.bankName.toLowerCase().includes(q));
    }
    if (f.status !== 'all') result = result.filter(c => c.status === f.status);
    if (f.bankName) result = result.filter(c => c.bankName === f.bankName);
    if (f.type !== 'all') result = result.filter(c => c.type === f.type);
    if (f.dateFrom) result = result.filter(c => c.startDate >= f.dateFrom);
    if (f.dateTo) result = result.filter(c => c.startDate <= f.dateTo);
    const sf = this.ctx.state.creditSort!.field;
    const sd = this.ctx.state.creditSort!.dir;
    result.sort((a, b) => {
      let cmp = 0;
      if (sf === 'date') cmp = a.startDate.localeCompare(b.startDate);
      else if (sf === 'amount') cmp = a.currentAmount - b.currentAmount;
      else if (sf === 'bankName') cmp = a.bankName.localeCompare(b.bankName);
      else cmp = a.createdAt - b.createdAt;
      return sd === 'asc' ? cmp : -cmp;
    });
    return result;
  }

  private renderCreditsList(wrapper: HTMLElement, filteredCredits: CreditRecord[]): void {
    wrapper.empty();
    this.creditPaginationEl = undefined;

    const container = wrapper.createDiv('finance-table-container');
    this.creditPaginationEl = wrapper.createDiv('finance-pagination');

    const { pageSize } = this.ctx.state;
    const totalPages = Math.max(1, Math.ceil(filteredCredits.length / pageSize));
    const page = Math.max(0, Math.min(this.ctx.state.creditPage ?? 0, totalPages - 1));
    this.ctx.state.creditPage = page;
    const start = page * pageSize;
    const pageCredits = filteredCredits.slice(start, start + pageSize);

    if (!pageCredits.length) {
      const e = container.createDiv('finance-empty-state');
      e.createEl('div', { text: '📊', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Нет записей на этой странице', cls: 'finance-empty-title' });
      return;
    }

    const infoBar = container.createDiv('finance-table-info-bar');
    const metaLeft = infoBar.createDiv('finance-table-meta');
    metaLeft.createEl('span', {
      text: `${start + 1}–${Math.min(start + pageSize, filteredCredits.length)} из ${filteredCredits.length}`,
      cls: 'finance-count-text',
    });

    const allCreditCols: { key: string; label: string }[] = [
      { key: 'name',      label: 'Название' },
      { key: 'bank',      label: 'Банк' },
      { key: 'type',      label: 'Тип' },
      { key: 'amount',    label: 'Остаток' },
      { key: 'payment',   label: 'Платёж' },
      { key: 'rate',      label: 'Ставка' },
      { key: 'date',      label: 'Открыт' },
      { key: 'endDate',   label: 'Окончание' },
      { key: '_act',      label: '' },
    ];

    this.ctx.state.creditsColumns ??= {};

    const visCreditCols = allCreditCols.filter(c => c.key === '_act' || this.ctx.state.creditsColumns![c.key] !== false);

    if (!this.ctx.isMobile) {
      const creditColVisCols = allCreditCols.filter(c => c.key !== '_act');
      const gearBtn = infoBar.createEl('button', { cls: 'finance-colvis-btn', text: '⚙️' });
      gearBtn.title = 'Настройка колонок';
      gearBtn.addEventListener('click', () => {
        new ColumnVisibilityModal(this.ctx.app, {
          columns: creditColVisCols,
          visibility: { ...this.ctx.state.creditsColumns! },
          onSave: (updated) => {
            this.ctx.state.creditsColumns = updated;
            this.ctx.saveState();
            this.render();
          },
        }).open();
      });
    }

    if (this.ctx.isMobile) {
      this.renderCreditsAsBlocks(container, pageCredits);
    } else {
      this.renderCreditsAsTable(container, pageCredits, visCreditCols);
    }

    if (totalPages > 1) this.renderPaginationCredits(totalPages, page);
  }

  private renderCreditsAsBlocks(container: HTMLElement, pageCredits: CreditRecord[]): void {
    const list = container.createDiv('finance-records-list');
    const frag = document.createDocumentFragment();

    pageCredits.forEach(credit => {
      const block = document.createElement('div');
      block.classList.add('finance-record-block');
      if (credit.status === 'active') {
        block.classList.add('finance-row-income');
      } else {
        block.classList.add('finance-row-expense');
      }

      const header = block.createDiv('finance-record-header');
      const amount = '−' + this.ctx.fmt(credit.currentAmount);
      header.createEl('span', {
        text: amount,
        cls: 'finance-record-amount finance-amount-expense',
      });
      const typeLabel = credit.type === 'consumer' ? 'Потребительский'
        : credit.type === 'auto' ? 'Автокредит'
        : credit.type === 'mortgage' ? 'Ипотека' : 'Кредит';
      header.createEl('span', { text: `${credit.bankName} · ${typeLabel}`, cls: 'finance-record-date' });

      const details = block.createDiv('finance-record-details');
      details.createEl('span', { text: `📊 ${credit.interestRate}% годовых`, cls: 'finance-record-detail' });
      details.createEl('span', { text: `💰 Платёж: ${this.ctx.fmt(credit.monthlyPayment)}`, cls: 'finance-record-detail' });

      const paidCount = credit.payments.filter(p => p.status === 'paid').length;
      const totalCount = credit.payments.length;
      if (totalCount > 0) {
        details.createEl('span', { text: `✅ ${paidCount}/${totalCount} платежей`, cls: 'finance-record-detail' });
      }

      const endDate = this.calculateCreditEndDate(credit);
      if (endDate && credit.status === 'active') {
        details.createEl('span', { text: `📅 до ${this.ctx.fmtDate(endDate)}`, cls: 'finance-record-detail' });
      }

      if (credit.note) {
        block.createEl('div', { text: credit.note, cls: 'finance-record-note' });
      }

      const historyToggle = block.createEl('button', {
        cls: 'finance-debt-history-toggle',
        text: `📋 Платежи (${credit.payments.length}) ▼`,
      });
      const historyWrap = block.createDiv('finance-debt-history-panel');
      historyWrap.setAttribute('data-credit-id', credit.id);
      this.renderCreditPaymentsPanel(historyWrap, credit);

      const isExpanded = this.expandedCreditId === credit.id;
      if (isExpanded) {
        historyWrap.addClass('finance-debt-history-open');
        block.addClass('finance-debt-block-expanded');
        historyToggle.textContent = `📋 Платежи (${credit.payments.length}) ▲`;
      }

      historyToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !historyWrap.hasClass('finance-debt-history-open');
        this.expandedCreditId = open ? credit.id : null;
        historyWrap.toggleClass('finance-debt-history-open', open);
        block.toggleClass('finance-debt-block-expanded', open);
        historyToggle.textContent = open
          ? `📋 Платежи (${credit.payments.length}) ▲`
          : `📋 Платежи (${credit.payments.length}) ▼`;
      });

      const actions = block.createDiv('finance-record-actions');
      if (credit.status === 'active') {
        this.mkActionBtn(actions, '💰', 'Добавить платёж', () => this.openAddCreditPaymentModal(credit));
        this.mkActionBtn(actions, '⚡', 'Досрочное погашение', () => this.openEarlyRepaymentModal(credit));
      }
      this.mkActionBtn(actions, '✏️', 'Редактировать', () => this.openEditCreditModal(credit));
      this.mkActionBtn(actions, '🗑️', 'Удалить', () => this.confirmDeleteCredit(credit), 'finance-delete-btn');

      frag.appendChild(block);
    });

    list.appendChild(frag);
  }

  private calculateCreditEndDate(credit: CreditRecord): string {
    if (!credit.startDate) return '';
    const startDate = new Date(credit.startDate);
    if (isNaN(startDate.getTime())) return '';
    const term = credit.termMonths || 0;
    startDate.setMonth(startDate.getMonth() + term);
    return startDate.toISOString().split('T')[0];
  }

  private renderCreditsAsTable(container: HTMLElement, pageCredits: CreditRecord[], cols: { key: string; label: string }[]): void {
    const scroll = container.createDiv('finance-table-scroll');
    const table = scroll.createEl('table', { cls: 'finance-table' });

    const hRow = table.createEl('thead').createEl('tr');
    cols.forEach(c => hRow.createEl('th', { text: c.label, cls: 'finance-th' }));

    const tbody = table.createEl('tbody');
    const frag = document.createDocumentFragment();

    const dataCols = cols.filter(c => c.key !== '_act');

    pageCredits.forEach(credit => {
      const tr = document.createElement('tr');
      tr.classList.add('finance-tr');
      if (credit.status === 'active') {
        tr.classList.add('finance-row-income');
      } else {
        tr.classList.add('finance-row-expense');
      }

      const typeLabel = credit.type === 'consumer' ? 'Потребительский'
        : credit.type === 'auto' ? 'Автокредит'
        : credit.type === 'mortgage' ? 'Ипотека' : 'Кредит';
      const endDate = this.calculateCreditEndDate(credit);
      const endDateText = endDate ? this.ctx.fmtDate(endDate) : '—';

      dataCols.forEach(c => {
        let text = '';
        let cls = '';
        switch (c.key) {
          case 'name':
            text = credit.name || '—';
            break;
          case 'bank':
            text = credit.bankName || '—';
            break;
          case 'type':
            text = typeLabel;
            break;
          case 'amount':
            text = this.ctx.fmt(credit.currentAmount);
            cls = 'finance-amount-cell';
            break;
          case 'payment':
            text = this.ctx.fmt(credit.monthlyPayment);
            cls = 'finance-amount-cell';
            break;
          case 'rate':
            text = `${credit.interestRate}%`;
            break;
          case 'date':
            text = this.ctx.fmtDate(credit.startDate);
            break;
          case 'endDate':
            text = endDateText;
            cls = endDate ? 'finance-due-date' : '';
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

        const actionsWrap = document.createElement('div');
        actionsWrap.style.display = 'flex';
        actionsWrap.style.gap = '2px';
        actionsWrap.style.justifyContent = 'flex-end';
        actionsWrap.style.alignItems = 'center';

        if (credit.status === 'active') {
          this.mkActionBtn(actionsWrap, '💰', 'Добавить платёж', () => this.openAddCreditPaymentModal(credit));
          this.mkActionBtn(actionsWrap, '⚡', 'Досрочное погашение', () => this.openEarlyRepaymentModal(credit));
        }
        this.mkActionBtn(actionsWrap, '✏️', 'Редактировать', () => this.openEditCreditModal(credit));
        this.mkActionBtn(actionsWrap, '🗑️', 'Удалить', () => this.confirmDeleteCredit(credit), 'finance-delete-btn');

        atd.appendChild(actionsWrap);
        tr.appendChild(atd);
      }

      const expandRow = document.createElement('tr');
      expandRow.classList.add('finance-debt-expand-row');
      const expandTd = document.createElement('td');
      expandTd.setAttribute('colspan', String(cols.length));
      expandTd.classList.add('finance-debt-expand-td');
      expandTd.setAttribute('data-credit-id', credit.id);
      this.renderCreditPaymentsPanel(expandTd, credit);

      expandRow.appendChild(expandTd);

      const isExpanded = this.expandedCreditId === credit.id;
      expandRow.style.display = isExpanded ? 'table-row' : 'none';

      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.finance-action-btn')) return;
        const open = expandRow.style.display === 'none';
        this.expandedCreditId = open ? credit.id : null;
        expandRow.style.display = open ? 'table-row' : 'none';
        tr.classList.toggle('finance-debt-row-expanded', open);
        expandRow.classList.toggle('finance-debt-expand-open', open);
      });

      frag.appendChild(tr);
      frag.appendChild(expandRow);
    });

    tbody.appendChild(frag);
  }

  private renderPaginationCredits(totalPages: number, current: number): void {
    if (!this.creditPaginationEl) return;
    const nav = this.creditPaginationEl.createDiv('finance-pagination-nav');

    const go = (page: number) => {
      this.ctx.state.creditPage = page;
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

  private renderCreditPaymentsPanel(parent: HTMLElement, credit: CreditRecord): void {
    const wrapper = parent.createDiv();
    wrapper.style.padding = '12px';
    const today = new Date().toISOString().split('T')[0];

    const startDate = credit.startDate ? new Date(credit.startDate) : null;
    const endDate = this.calculateCreditEndDate(credit);
    const endDateObj = endDate ? new Date(endDate) : null;

    if (startDate && endDateObj && startDate.getTime() < endDateObj.getTime()) {
      const totalDuration = endDateObj.getTime() - startDate.getTime();
      const elapsed = Date.now() - startDate.getTime();
      const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

      const progressWrap = wrapper.createDiv('finance-deposit-progress');
      progressWrap.style.maxWidth = '400px';
      progressWrap.style.margin = '0 auto 16px';

      const progressLabel = progressWrap.createDiv('finance-deposit-progress-label');
      progressLabel.style.textAlign = 'center';
      progressLabel.style.fontSize = '12px';
      progressLabel.style.color = '#6b7280';
      progressLabel.style.marginBottom = '6px';

      const startStr = this.ctx.fmtDate(credit.startDate);
      const endStr = this.ctx.fmtDate(endDate);
      progressLabel.textContent = `${startStr} → ${endStr} (${Math.round(progress)}%)`;

      const progressBar = progressWrap.createDiv('finance-deposit-progress-bar');
      progressBar.style.height = '8px';
      progressBar.style.borderRadius = '4px';
      progressBar.style.background = '#e5e7eb';
      progressBar.style.overflow = 'hidden';

      const progressFill = progressBar.createDiv('finance-deposit-progress-fill');
      progressFill.style.height = '100%';
      progressFill.style.width = `${progress}%`;
      progressFill.style.borderRadius = '4px';
      progressFill.style.background = progress >= 100 ? '#22c55e' : '#7c3aed';
      progressFill.style.transition = 'width 0.3s ease';
    }

    const paymentsHeader = wrapper.createEl('h4', { text: '📋 Платежи', cls: 'finance-section-title' });
    paymentsHeader.style.margin = '0 0 8px';
    paymentsHeader.style.fontSize = '13px';
    paymentsHeader.style.color = '#6b7280';

    if (!credit.payments.length) {
      wrapper.createEl('p', { text: 'Нет запланированных платежей', cls: 'finance-empty-text' });
      return;
    }

    const PAYMENT_PAGE_SIZE = 15;
    const totalPayments = credit.payments.length;
    const totalPages = Math.max(1, Math.ceil(totalPayments / PAYMENT_PAGE_SIZE));
    let page = this.creditPaymentPages.get(credit.id);
    if (page === undefined) {
      const lastPaidIdx = credit.payments.findLastIndex(p => p.status === 'paid');
      page = lastPaidIdx >= 0 ? Math.floor(lastPaidIdx / PAYMENT_PAGE_SIZE) : 0;
      this.creditPaymentPages.set(credit.id, page);
    }
    page = Math.max(0, Math.min(page, totalPages - 1));
    this.creditPaymentPages.set(credit.id, page);
    const start = page * PAYMENT_PAGE_SIZE;
    const pagePayments = credit.payments.slice(start, start + PAYMENT_PAGE_SIZE);

    const scrollWrapper = wrapper.createDiv({ cls: 'finance-mov-scroll' });
    const movTable = scrollWrapper.createEl('table', { cls: 'finance-mov-table' });
    const movHead = movTable.createEl('thead').createEl('tr');
    ['#', 'Дата', 'Сумма', 'Статус'].forEach(l => {
      movHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
    });
    const movBody = movTable.createEl('tbody');

    pagePayments.forEach((p, idx) => {
      const isPaid = p.status === 'paid' || p.dueDate <= today;
      const bgColor = isPaid ? 'rgba(34, 197, 94, 0.08)' : '';
      const textColor = isPaid ? '#16a34a' : '';
      const mr = movBody.createEl('tr');

      const rowNum = start + idx + 1;
      const td1 = mr.createEl('td', { text: String(rowNum), cls: 'finance-td' });
      td1.style.background = bgColor;
      td1.style.color = textColor;

      const td2 = mr.createEl('td', { text: this.ctx.fmtDate(p.dueDate), cls: 'finance-td' });
      td2.style.background = bgColor;
      td2.style.color = textColor;

      const td3 = mr.createEl('td', {
        text: this.ctx.fmt(p.amount),
        cls: 'finance-td',
      });
      td3.style.background = bgColor;
      td3.style.color = textColor;

      const statusCell = mr.createEl('td', { cls: 'finance-td' });
      statusCell.style.background = bgColor;
      if (isPaid) {
        statusCell.textContent = '✓ Оплачено';
        statusCell.style.color = '#16a34a';
      } else {
        statusCell.textContent = '⏳ Ожидает';
        statusCell.style.color = '#6b7280';
      }
    });

    if (totalPages > 1) {
      const pagNav = wrapper.createDiv('finance-pagination-nav');
      pagNav.style.display = 'flex';
      pagNav.style.justifyContent = 'center';
      pagNav.style.alignItems = 'center';
      pagNav.style.gap = '4px';
      pagNav.style.marginTop = '12px';

      const go = (newPage: number) => {
        this.creditPaymentPages.set(credit.id, newPage);
        this.rerenderCreditPaymentPanel(credit.id);
      };

      const prev = pagNav.createEl('button', { cls: 'finance-page-btn', text: '←' });
      prev.disabled = page === 0;
      prev.addEventListener('click', () => go(page - 1));

      this.pageRange(page, totalPages).forEach(p => {
        if (p === -1) { pagNav.createEl('span', { text: '…', cls: 'finance-page-ellipsis' }); return; }
        const btn = pagNav.createEl('button', {
          text: String(p + 1),
          cls: `finance-page-btn${p === page ? ' active' : ''}`,
        });
        btn.addEventListener('click', () => go(p));
      });

      const next = pagNav.createEl('button', { cls: 'finance-page-btn', text: '→' });
      next.disabled = page >= totalPages - 1;
      next.addEventListener('click', () => go(page + 1));
    }
  }

  private rerenderCreditPaymentPanel(creditId: string): void {
    if (!this.ctx.data) return;
    const credit = this.ctx.data.credits.find(c => c.id === creditId);
    if (!credit) return;

    const expandTd = this.el.querySelector<HTMLElement>(`[data-credit-id="${creditId}"]`);
    if (!expandTd) return;

    expandTd.empty();
    this.renderCreditPaymentsPanel(expandTd, credit);
  }

  private openNewCreditModal(): void {
    if (!this.ctx.data) { new Notice('⏳ Загрузка…'); return; }
    const allBanks = this.ctx.data.credits.map(c => c.bankName).filter(Boolean);
    new CreditModal(this.ctx.app, {
      title: '➕ Новый кредит',
      banks: allBanks,
      onSave: async credit => {
        await this.ctx.storage.addCredit(this.ctx.notePath, credit);
        const rec: FinanceRecord = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          date: credit.startDate,
          time: '',
          type: 'income',
          amount: credit.originalAmount,
          category: 'Кредит',
          tag: '',
          payer: credit.bankName,
          note: `Получение кредита "${credit.name}"`,
          attachmentPath: '',
          linkedId: credit.id,
        };
        await this.ctx.storage.addRecord(this.ctx.notePath, rec);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.render();
        new Notice('✅ Кредит добавлен');
      },
    }).open();
  }

  private openEditCreditModal(credit: CreditRecord): void {
    if (!this.ctx.data) return;
    const allBanks = this.ctx.data.credits.map(c => c.bankName).filter(Boolean);
    new CreditModal(this.ctx.app, {
      title: '✏️ Редактировать кредит',
      credit,
      banks: allBanks,
      onSave: async updated => {
        await this.ctx.storage.updateCredit(this.ctx.notePath, updated);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.render();
        new Notice('✅ Кредит обновлён');
      },
    }).open();
  }

  private openAddCreditPaymentModal(credit: CreditRecord): void {
    new CreditPaymentModal(this.ctx.app, {
      title: `💰 Платёж по кредиту — ${credit.name}`,
      credit,
      onSave: async payment => {
        credit.payments.push(payment);
        const paidAmount = credit.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
        credit.currentAmount = Math.max(0, credit.originalAmount - paidAmount);
        if (credit.currentAmount <= 0) {
          credit.status = 'paid';
        }
        await this.ctx.storage.updateCredit(this.ctx.notePath, credit);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.render();
        new Notice('✅ Платёж записан');
      },
    }).open();
  }

  private openEarlyRepaymentModal(credit: CreditRecord): void {
    new CreditEarlyRepaymentModal(this.ctx.app, {
      title: `⚡ Досрочное погашение — ${credit.name}`,
      credit,
      currency: this.ctx.currency,
      onSave: async updated => {
        await this.ctx.storage.updateCredit(this.ctx.notePath, updated);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.render();
        new Notice('✅ Досрочное погашение выполнено');
      },
    }).open();
  }

  private confirmDeleteCredit(credit: CreditRecord): void {
    const label = `${credit.name} · ${this.ctx.fmt(credit.currentAmount)}`;
    new ConfirmModal(this.ctx.app, `Удалить кредит?\n${label}`, async () => {
      await this.ctx.storage.deleteCredit(this.ctx.notePath, credit.id);
      const recs = this.ctx.data!.records.filter(r => !(r.category === 'Кредит' && r.payer === credit.bankName && r.note.includes(credit.name)));
      await this.ctx.storage.saveAllRecords(this.ctx.notePath, recs);
      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.render();
      new Notice('🗑️ Кредит удалён');
    }).open();
  }
}
