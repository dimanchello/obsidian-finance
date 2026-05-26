import { Notice } from 'obsidian';
import { ViewContext } from '../context';
import {
  DepositRecord, DepositTopUp, DepositWithdrawal, FinanceRecord,
  DepositSortField, PLURAL_THRESHOLD, SEARCH_DEBOUNCE_MS, PAGE_RANGE_THRESHOLD,
  DEFAULT_DEPOSIT_FILTER,
} from '../types';
import { DepositModal } from '../DepositModal';
import { DepositTopUpModal } from '../DepositTopUpModal';
import { DepositWithdrawalModal } from '../DepositWithdrawalModal';
import { ConfirmModal } from '../ConfirmModal';

export class DepositsTab {
  private ctx: ViewContext;
  private el: HTMLElement;
  private depositPaginationEl?: HTMLElement;
  private filterDebounce: ReturnType<typeof setTimeout> | null = null;
  onUpdate: (() => void) | null = null;

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;
  }

  render(): void {
    this.el.empty();
    this.renderDepositsView(this.el);
  }

  update(): void {
    this.render();
  }

  private isDepositClosed(deposit: DepositRecord): boolean {
    return deposit.status === 'closed';
  }

  private getDepositAccrued(deposit: DepositRecord): number {
    return deposit.accruals
      .filter(a => a.status === 'paid')
      .reduce((s, a) => s + a.amount, 0);
  }

  private getDepositTotal(deposit: DepositRecord): number {
    return deposit.amount + this.getDepositAccrued(deposit);
  }

  private getDepositProfit(deposit: DepositRecord): number {
    return deposit.accruals.reduce((s, a) => s + a.amount, 0);
  }

  private calculateDepositEndDate(deposit: DepositRecord): string {
    if (!deposit.startDate) return '';
    const startDate = new Date(deposit.startDate);
    if (isNaN(startDate.getTime())) return '';
    const term = deposit.termMonths || 0;
    startDate.setMonth(startDate.getMonth() + term);
    return startDate.toISOString().split('T')[0];
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

  private resetDepositPage(): void {
    this.ctx.state.depositPage = 0;
    this.ctx.saveState();
    this.render();
  }

  private getFilteredDeposits(): DepositRecord[] {
    if (!this.ctx.data) return [];
    const f = this.ctx.state.depositFilter ?? DEFAULT_DEPOSIT_FILTER;
    const s = this.ctx.state.depositSort ?? { field: 'createdAt' as DepositSortField, dir: 'desc' };
    let result = [...this.ctx.data.deposits];
    if (f.search) {
      const q = f.search.toLowerCase();
      result = result.filter(d => d.name.toLowerCase().includes(q) || d.bankName.toLowerCase().includes(q));
    }
    if (f.status !== 'all') result = result.filter(d => d.status === f.status);
    if (f.bankName) result = result.filter(d => d.bankName === f.bankName);
    if (f.type !== 'all') result = result.filter(d => d.type === f.type);
    if (f.dateFrom) result = result.filter(d => d.startDate >= f.dateFrom);
    if (f.dateTo) result = result.filter(d => d.startDate <= f.dateTo);
    result.sort((a, b) => {
      let cmp = 0;
      if (s.field === 'date') cmp = a.startDate.localeCompare(b.startDate);
      else if (s.field === 'amount') cmp = a.amount - b.amount;
      else if (s.field === 'bankName') cmp = a.bankName.localeCompare(b.bankName);
      else cmp = a.createdAt - b.createdAt;
      return s.dir === 'asc' ? cmp : -cmp;
    });
    return result;
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
        const sq = searchInput.value.toLowerCase();
        filteredOpts = opts.filter(o => o.l.toLowerCase().includes(sq));
        renderOpts();
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

  private renderDepositFilters(body: HTMLElement): void {
    const f = this.ctx.state.depositFilter ?? DEFAULT_DEPOSIT_FILTER;

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
        this.ctx.state.depositFilter!.search = si.value;
        this.resetDepositPage();
      }, SEARCH_DEBOUNCE_MS);
    });

    const statusG = row1.createDiv('finance-filter-group');
    statusG.createEl('label', { text: 'Статус', cls: 'finance-filter-label' });
    const statusSel = statusG.createEl('select', { cls: 'finance-filter-select' });
    [
      { v: 'all', l: 'Все' },
      { v: 'active', l: 'Активные' },
      { v: 'closed', l: 'Закрытые' },
    ].forEach(({ v, l }) => {
      const o = statusSel.createEl('option', { text: l });
      o.value = v;
      o.selected = v === f.status;
    });
    statusSel.addEventListener('change', () => {
      this.ctx.state.depositFilter!.status = statusSel.value as 'all' | 'active' | 'closed';
      this.resetDepositPage();
    });

    const allBanks = this.ctx.data ? [...new Set(this.ctx.data.deposits.map(d => d.bankName).filter(Boolean))] : [];
    const bankOpts = [{ v: '', l: 'Все банки' }, ...allBanks.map(b => ({ v: b, l: b }))];
    this.mkSearchSelect(row1, 'Банк', bankOpts, f.bankName, (v) => {
      this.ctx.state.depositFilter!.bankName = v;
      this.resetDepositPage();
    });

    const row2 = filtersContainer.createDiv('finance-filters-row');

    const dfG = row2.createDiv('finance-filter-group');
    dfG.createEl('label', { text: 'С', cls: 'finance-filter-label' });
    const dfI = dfG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dfI.value = f.dateFrom;
    dfI.addEventListener('change', () => {
      this.ctx.state.depositFilter!.dateFrom = dfI.value;
      this.resetDepositPage();
    });

    const dtG = row2.createDiv('finance-filter-group');
    dtG.createEl('label', { text: 'По', cls: 'finance-filter-label' });
    const dtI = dtG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dtI.value = f.dateTo;
    dtI.addEventListener('change', () => {
      this.ctx.state.depositFilter!.dateTo = dtI.value;
      this.resetDepositPage();
    });

    const typeG = row2.createDiv('finance-filter-group');
    typeG.createEl('label', { text: 'Тип', cls: 'finance-filter-label' });
    const typeSel = typeG.createEl('select', { cls: 'finance-filter-select' });
    [
      { v: 'all', l: 'Все типы' },
      { v: 'term', l: 'Срочный' },
      { v: 'demand', l: 'До требования' },
      { v: 'savings', l: 'Накопительный' },
    ].forEach(({ v, l }) => {
      const o = typeSel.createEl('option', { text: l });
      o.value = v;
      o.selected = v === f.type;
    });
    typeSel.addEventListener('change', () => {
      this.ctx.state.depositFilter!.type = typeSel.value as 'all' | 'term' | 'demand' | 'savings';
      this.resetDepositPage();
    });

    const rG = row2.createDiv('finance-filter-group finance-filter-reset');
    rG.createEl('label', { text: '\u00A0', cls: 'finance-filter-label' });
    rG.createEl('button', { text: '✕ Сбросить', cls: 'finance-reset-btn' })
      .addEventListener('click', () => {
        this.ctx.state.depositFilter = { ...DEFAULT_DEPOSIT_FILTER };
        this.resetDepositPage();
      });

    const sortRow = filtersContainer.createDiv('finance-sort-row');
    sortRow.createEl('span', { text: 'Сортировка:', cls: 'finance-sort-label' });

    const sortFields: { field: DepositSortField; label: string }[] = [
      { field: 'createdAt', label: 'Добавлен' },
      { field: 'date', label: 'Дата открытия' },
      { field: 'amount', label: 'Сумма' },
      { field: 'bankName', label: 'Банк' },
    ];
    const s = this.ctx.state.depositSort ?? { field: 'createdAt' as DepositSortField, dir: 'desc' };
    sortFields.forEach(({ field, label }) => {
      const active = s.field === field;
      const btn = sortRow.createEl('button', {
        cls: `finance-sort-btn${active ? ' active' : ''}`,
        text: label + (active ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''),
      });
      btn.addEventListener('click', () => {
        this.ctx.state.depositSort = s.field === field
          ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
          : { field, dir: 'desc' };
        this.ctx.saveState();
        this.render();
      });
    });
  }

  private renderDepositsView(body: HTMLElement): void {
    const allDeposits = this.ctx.data?.deposits ?? [];

    this.ctx.state.depositFilter ??= { ...DEFAULT_DEPOSIT_FILTER };

    const filteredDeposits = this.getFilteredDeposits();

    const summary = body.createDiv('finance-stats-container');
    summary.style.setProperty('grid-template-columns', 'repeat(2,1fr)', 'important');
    const activeDeposits = allDeposits.filter(d => d.status === 'active');
    const closedDeposits = allDeposits.filter(d => d.status === 'closed');

    const activeAmount = activeDeposits.reduce((s, d) => s + d.amount, 0);
    const activeProfit = activeDeposits.reduce((s, d) => s + this.getDepositProfit(d), 0);
    const closedAmount = closedDeposits.reduce((s, d) => s + d.amount, 0);
    const closedProfit = closedDeposits.reduce((s, d) => s + this.getDepositProfit(d), 0);

    const mkDepositCard = (title: string, icon: string, amount: number, profit: number, count: number, isActive: boolean) => {
      const card = summary.createDiv(`finance-stat-card finance-stat-${isActive ? 'deposit-active' : 'deposit-closed'}`);
      const header = card.createDiv('finance-debt-summary-header');
      header.createEl('span', { text: icon, cls: 'finance-debt-summary-icon' });
      header.createEl('span', { text: title, cls: 'finance-debt-summary-title' });

      const content = card.createDiv('finance-debt-summary-content');
      content.createEl('div', {
        text: amount > 0 ? this.ctx.fmt(amount) : '—',
        cls: 'finance-debt-summary-main',
      });
      const subText = profit > 0
        ? `${count} ${count === 1 ? 'вклад' : count < PLURAL_THRESHOLD ? 'вклада' : 'вкладов'} · Прибыль: ${this.ctx.fmt(profit)}`
        : `${count} ${count === 1 ? 'вклад' : count < PLURAL_THRESHOLD ? 'вклада' : 'вкладов'}`;
      content.createEl('div', {
        text: subText,
        cls: 'finance-debt-summary-sub',
      });
    };

    mkDepositCard('Активные', '💰', activeAmount, activeProfit, activeDeposits.length, true);
    mkDepositCard('Закрытые', '✅', closedAmount, closedProfit, closedDeposits.length, false);

    const toolbar = body.createDiv('finance-debt-toolbar');
    const newDepositBtn = toolbar.createEl('button', { cls: 'finance-add-btn finance-expense-btn' });
    newDepositBtn.innerHTML = '<span class="btn-icon">＋</span><span>Новый вклад</span>';
    newDepositBtn.addEventListener('click', () => this.openNewDepositModal());

    this.renderDepositFilters(body);

    if (!allDeposits.length) {
      const e = body.createDiv('finance-empty-state');
      e.createEl('div', { text: '📈', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Нет вкладов', cls: 'finance-empty-title' });
      e.createEl('p', { text: 'Нажмите «Новый вклад»', cls: 'finance-empty-sub' });
      return;
    }

    if (!filteredDeposits.length) {
      const e = body.createDiv('finance-empty-state');
      e.createEl('div', { text: '🔍', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Вкладов не найдено', cls: 'finance-empty-title' });
      e.createEl('p', { text: 'Попробуйте изменить фильтры', cls: 'finance-empty-sub' });
      return;
    }

    const tw = body.createDiv('finance-table-wrapper');
    this.renderDepositsList(tw, filteredDeposits);
  }

  private renderDepositsList(wrapper: HTMLElement, filteredDeposits: DepositRecord[]): void {
    wrapper.empty();
    this.depositPaginationEl = undefined;

    const container = wrapper.createDiv('finance-table-container');
    this.depositPaginationEl = wrapper.createDiv('finance-pagination');

    const pageSize = this.ctx.state.pageSize || this.ctx.settings.defaultPageSize;
    const totalPages = Math.max(1, Math.ceil(filteredDeposits.length / pageSize));
    const page = Math.max(0, Math.min(this.ctx.state.depositPage ?? 0, totalPages - 1));
    this.ctx.state.depositPage = page;
    const start = page * pageSize;
    const pageDeposits = filteredDeposits.slice(start, start + pageSize);

    if (!pageDeposits.length) {
      const e = container.createDiv('finance-empty-state');
      e.createEl('div', { text: '📊', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Нет записей на этой странице', cls: 'finance-empty-title' });
      return;
    }

    const infoBar = container.createDiv('finance-table-info-bar');
    const metaLeft = infoBar.createDiv('finance-table-meta');
    metaLeft.createEl('span', {
      text: `${start + 1}–${Math.min(start + pageSize, filteredDeposits.length)} из ${filteredDeposits.length}`,
      cls: 'finance-count-text',
    });

    if (this.ctx.isMobile) {
      this.renderDepositsAsBlocks(container, pageDeposits);
    } else {
      this.renderDepositsAsTable(container, pageDeposits);
    }

    if (totalPages > 1) this.renderPaginationDeposits(totalPages, page);
  }

  private renderDepositAccrualsPanel(parent: HTMLElement, deposit: DepositRecord): void {
    const wrapper = parent.createDiv();
    wrapper.style.padding = '12px';
    const today = new Date().toISOString().split('T')[0];

    const startDate = deposit.startDate ? new Date(deposit.startDate) : null;
    const endDate = this.calculateDepositEndDate(deposit);
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

      const startStr = this.ctx.fmtDate(deposit.startDate);
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

    const topUps = deposit.topUps || [];
    if (topUps.length > 0) {
      const topUpsHeader = wrapper.createEl('h4', { text: '💰 Пополнения', cls: 'finance-section-title' });
      topUpsHeader.style.margin = '0 0 8px';
      topUpsHeader.style.fontSize = '13px';
      topUpsHeader.style.color = '#6b7280';

      const topUpsTable = wrapper.createEl('table', { cls: 'finance-mov-table' });
      const topUpsHead = topUpsTable.createEl('thead').createEl('tr');
      ['Дата', 'Сумма', 'Примечание', ''].forEach(l => {
        topUpsHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
      });
      const topUpsBody = topUpsTable.createEl('tbody');

      topUps.slice().reverse().forEach(tu => {
        const tr = topUpsBody.createEl('tr');
        tr.createEl('td', { text: this.ctx.fmtDate(tu.date, tu.time), cls: 'finance-td' });
        tr.createEl('td', { text: '+' + this.ctx.fmt(tu.amount), cls: 'finance-td finance-td-mov-repay' });
        tr.createEl('td', { text: tu.note || '—', cls: 'finance-td' });
        const actTd = tr.createEl('td', { cls: 'finance-td' });
        this.mkActionBtn(actTd, '🗑️', 'Удалить', () => this.confirmDeleteDepositTopUp(deposit, tu), 'finance-delete-btn');
      });

      const totalTopUps = topUps.reduce((s, t) => s + t.amount, 0);
      const topUpsSummary = wrapper.createDiv('finance-deposit-summary');
      topUpsSummary.style.margin = '8px 0 16px';
      topUpsSummary.style.fontSize = '13px';
      topUpsSummary.style.color = '#6b7280';
      topUpsSummary.textContent = `Всего пополнений: ${topUps.length} · ${this.ctx.fmt(totalTopUps)}`;
    }

    const withdrawals = deposit.withdrawals || [];
    if (withdrawals.length > 0) {
      const withdrawalsHeader = wrapper.createEl('h4', { text: '📤 Снятия', cls: 'finance-section-title' });
      withdrawalsHeader.style.margin = '0 0 8px';
      withdrawalsHeader.style.fontSize = '13px';
      withdrawalsHeader.style.color = '#6b7280';

      const withdrawalsTable = wrapper.createEl('table', { cls: 'finance-mov-table' });
      const withdrawalsHead = withdrawalsTable.createEl('thead').createEl('tr');
      ['Дата', 'Сумма', 'Примечание', ''].forEach(l => {
        withdrawalsHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
      });
      const withdrawalsBody = withdrawalsTable.createEl('tbody');

      withdrawals.slice().reverse().forEach(w => {
        const tr = withdrawalsBody.createEl('tr');
        tr.createEl('td', { text: this.ctx.fmtDate(w.date, w.time), cls: 'finance-td' });
        tr.createEl('td', { text: '−' + this.ctx.fmt(w.amount), cls: 'finance-td finance-td-mov-borrow' });
        tr.createEl('td', { text: w.note || '—', cls: 'finance-td' });
        const actTd = tr.createEl('td', { cls: 'finance-td' });
        this.mkActionBtn(actTd, '🗑️', 'Удалить', () => this.confirmDeleteDepositWithdrawal(deposit, w), 'finance-delete-btn');
      });

      const totalWithdrawals = withdrawals.reduce((s, w) => s + w.amount, 0);
      const withdrawalsSummary = wrapper.createDiv('finance-deposit-summary');
      withdrawalsSummary.style.margin = '8px 0 16px';
      withdrawalsSummary.style.fontSize = '13px';
      withdrawalsSummary.style.color = '#6b7280';
      withdrawalsSummary.textContent = `Всего снятий: ${withdrawals.length} · ${this.ctx.fmt(totalWithdrawals)}`;
    }

    const accrualsHeader = wrapper.createEl('h4', { text: '📊 Начисления', cls: 'finance-section-title' });
    accrualsHeader.style.margin = '0 0 8px';
    accrualsHeader.style.fontSize = '13px';
    accrualsHeader.style.color = '#6b7280';

    if (!deposit.accruals.length) {
      wrapper.createEl('p', { text: 'Нет запланированных начислений', cls: 'finance-empty-text' });
      return;
    }

    const ACCRUAL_PAGE_SIZE = 20;
    const totalAccruals = deposit.accruals.length;
    const totalPages = Math.max(1, Math.ceil(totalAccruals / ACCRUAL_PAGE_SIZE));
    const page = 0;
    const start = page * ACCRUAL_PAGE_SIZE;
    const pageAccruals = deposit.accruals.slice(start, start + ACCRUAL_PAGE_SIZE);

    const scrollWrapper = wrapper.createDiv({ cls: 'finance-mov-scroll' });
    const movTable = scrollWrapper.createEl('table', { cls: 'finance-mov-table' });
    const movHead = movTable.createEl('thead').createEl('tr');
    ['#', 'Дата', 'Сумма', 'Статус'].forEach(l => {
      movHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
    });
    const movBody = movTable.createEl('tbody');

    pageAccruals.forEach((a, idx) => {
      const isPaid = a.status === 'paid' || a.dueDate <= today;
      const bgColor = isPaid ? 'rgba(34, 197, 94, 0.08)' : '';
      const textColor = isPaid ? '#16a34a' : '';
      const mr = movBody.createEl('tr');

      const rowNum = start + idx + 1;
      const td1 = mr.createEl('td', { text: String(rowNum), cls: 'finance-td' });
      td1.style.background = bgColor;
      td1.style.color = textColor;

      const td2 = mr.createEl('td', { text: this.ctx.fmtDate(a.dueDate, a.paidDate), cls: 'finance-td' });
      td2.style.background = bgColor;
      td2.style.color = textColor;

      const td3 = mr.createEl('td', {
        text: this.ctx.fmt(a.amount),
        cls: 'finance-td',
      });
      td3.style.background = bgColor;
      td3.style.color = textColor;

      const statusCell = mr.createEl('td', { cls: 'finance-td' });
      statusCell.style.background = bgColor;
      if (isPaid) {
        statusCell.textContent = '✓ Начислено';
        statusCell.style.color = '#16a34a';
      } else {
        statusCell.textContent = '⏳ Ожидает';
        statusCell.style.color = '#6b7280';
      }
    });

    if (totalPages > 1) {
      const pagInfo = wrapper.createDiv('finance-deposit-pag-info');
      pagInfo.style.textAlign = 'center';
      pagInfo.style.marginTop = '8px';
      pagInfo.style.fontSize = '12px';
      pagInfo.style.color = '#6b7280';
      pagInfo.textContent = `${start + 1}–${Math.min(start + ACCRUAL_PAGE_SIZE, totalAccruals)} из ${totalAccruals}`;
    }
  }

  private renderDepositsAsBlocks(container: HTMLElement, pageDeposits: DepositRecord[]): void {
    const list = container.createDiv('finance-records-list');
    const frag = document.createDocumentFragment();

    pageDeposits.forEach(deposit => {
      const block = document.createElement('div');
      block.classList.add('finance-record-block');
      if (deposit.status === 'active') {
        block.classList.add('finance-row-income');
      } else {
        block.classList.add('finance-row-expense');
      }

      const header = block.createDiv('finance-record-header');
      const amountText = '+' + this.ctx.fmt(deposit.amount);
      header.createEl('span', {
        text: amountText,
        cls: 'finance-record-amount finance-amount-income',
      });
      const typeLabel = deposit.type === 'term' ? 'Срочный' : deposit.type === 'demand' ? 'До требования' : 'Накопительный';
      header.createEl('span', { text: `${deposit.bankName} · ${typeLabel}`, cls: 'finance-record-date' });

      const details = block.createDiv('finance-record-details');
      details.createEl('span', { text: `📊 ${deposit.interestRate}% годовых`, cls: 'finance-record-detail' });
      const profit = this.getDepositProfit(deposit);
      if (profit > 0) {
        details.createEl('span', { text: `💰 Начислено: ${this.ctx.fmt(profit)}`, cls: 'finance-record-detail' });
      }
      const endDate = this.calculateDepositEndDate(deposit);
      if (endDate && deposit.status === 'active') {
        details.createEl('span', { text: `📅 до ${this.ctx.fmtDate(endDate)}`, cls: 'finance-record-detail' });
      }

      if (deposit.note) {
        block.createEl('div', { text: deposit.note, cls: 'finance-record-note' });
      }

      const historyToggle = block.createEl('button', {
        cls: 'finance-debt-history-toggle',
        text: `📋 Начисления (${deposit.accruals.length}) ▼`,
      });
      const historyWrap = block.createDiv('finance-debt-history-panel');
      this.renderDepositAccrualsPanel(historyWrap, deposit);

      historyToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !historyWrap.hasClass('finance-debt-history-open');
        historyWrap.toggleClass('finance-debt-history-open', open);
        block.toggleClass('finance-debt-block-expanded', open);
        historyToggle.textContent = open
          ? `📋 Начисления (${deposit.accruals.length}) ▲`
          : `📋 Начисления (${deposit.accruals.length}) ▼`;
      });

      const actions = block.createDiv('finance-record-actions');
      if (deposit.status === 'active') {
        this.mkActionBtn(actions, '💰', 'Пополнить', () => this.openDepositTopUpModal(deposit));
        this.mkActionBtn(actions, '📤', 'Снять', () => this.openDepositWithdrawalModal(deposit));
        this.mkActionBtn(actions, '✅', 'Закрыть вклад', () => this.confirmCloseDeposit(deposit));
      }
      this.mkActionBtn(actions, '✏️', 'Редактировать', () => this.openEditDepositModal(deposit));
      this.mkActionBtn(actions, '🗑️', 'Удалить', () => this.confirmDeleteDeposit(deposit), 'finance-delete-btn');

      frag.appendChild(block);
    });

    list.appendChild(frag);
  }

  private renderDepositsAsTable(container: HTMLElement, pageDeposits: DepositRecord[]): void {
    const scroll = container.createDiv('finance-table-scroll');
    const table = scroll.createEl('table', { cls: 'finance-table' });

    const cols = [
      { key: 'name',      label: 'Название' },
      { key: 'bank',      label: 'Банк' },
      { key: 'type',      label: 'Тип' },
      { key: 'amount',    label: 'Сумма' },
      { key: 'profit',    label: 'Начислено' },
      { key: 'rate',      label: 'Ставка' },
      { key: 'date',      label: 'Открыт' },
      { key: 'endDate',   label: 'Окончание' },
      { key: '_act',      label: '' },
    ];

    const hRow = table.createEl('thead').createEl('tr');
    cols.forEach(c => hRow.createEl('th', { text: c.label, cls: 'finance-th' }));

    const tbody = table.createEl('tbody');
    const frag = document.createDocumentFragment();

    pageDeposits.forEach(deposit => {
      const tr = document.createElement('tr');
      tr.classList.add('finance-tr');
      if (deposit.status === 'active') {
        tr.classList.add('finance-row-income');
      } else {
        tr.classList.add('finance-row-expense');
      }

      const typeLabel = deposit.type === 'term' ? 'Срочный' : deposit.type === 'demand' ? 'До требования' : 'Накопительный';
      const profit = this.getDepositProfit(deposit);
      const endDate = this.calculateDepositEndDate(deposit);
      const endDateText = endDate ? this.ctx.fmtDate(endDate) : '—';

      const cells: { key: string; text: string; cls?: string }[] = [
        { key: 'name', text: deposit.name || '—' },
        { key: 'bank', text: deposit.bankName || '—' },
        { key: 'type', text: typeLabel },
        { key: 'amount', text: this.ctx.fmt(deposit.amount), cls: 'finance-amount-cell' },
        { key: 'profit', text: profit > 0 ? this.ctx.fmt(profit) : '—',
          cls: profit > 0 ? 'finance-amount-cell finance-amount-income' : 'finance-amount-cell' },
        { key: 'rate', text: `${deposit.interestRate}%` },
        { key: 'date', text: this.ctx.fmtDate(deposit.startDate) },
        { key: 'endDate', text: endDateText, cls: endDate ? 'finance-due-date' : '' },
      ];

      cells.forEach(c => {
        const td = document.createElement('td');
        td.classList.add('finance-td');
        if (c.cls) c.cls.split(' ').forEach(cls => td.classList.add(cls));
        td.setAttribute('data-label', cols.find(co => co.key === c.key)?.label ?? '');
        td.textContent = c.text;
        tr.appendChild(td);
      });

      const atd = document.createElement('td');
      atd.classList.add('finance-td', 'finance-actions-td');
      atd.setAttribute('data-label', '');

      const actionsWrap = document.createElement('div');
      actionsWrap.style.display = 'flex';
      actionsWrap.style.gap = '2px';
      actionsWrap.style.justifyContent = 'flex-end';
      actionsWrap.style.alignItems = 'center';

      if (deposit.status === 'active') {
        this.mkActionBtn(actionsWrap, '💰', 'Пополнить', () => this.openDepositTopUpModal(deposit));
        this.mkActionBtn(actionsWrap, '📤', 'Снять', () => this.openDepositWithdrawalModal(deposit));
        this.mkActionBtn(actionsWrap, '✅', 'Закрыть вклад', () => this.confirmCloseDeposit(deposit));
      }
      this.mkActionBtn(actionsWrap, '✏️', 'Редактировать', () => this.openEditDepositModal(deposit));
      this.mkActionBtn(actionsWrap, '🗑️', 'Удалить', () => this.confirmDeleteDeposit(deposit), 'finance-delete-btn');

      atd.appendChild(actionsWrap);
      tr.appendChild(atd);

      const expandRow = document.createElement('tr');
      expandRow.classList.add('finance-debt-expand-row');
      const expandTd = document.createElement('td');
      expandTd.setAttribute('colspan', String(cols.length));
      expandTd.classList.add('finance-debt-expand-td');
      this.renderDepositAccrualsPanel(expandTd, deposit);

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

  private renderPaginationDeposits(totalPages: number, current: number): void {
    if (!this.depositPaginationEl) return;
    const nav = this.depositPaginationEl.createDiv('finance-pagination-nav');

    const go = (page: number) => {
      this.ctx.state.depositPage = page;
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
    const p: number[] = [0];
    if (cur > 2) p.push(-1);
    for (let i = Math.max(1, cur - 1); i <= Math.min(total - 2, cur + 1); i++) p.push(i);
    if (cur < total - 3) p.push(-1);
    p.push(total - 1);
    return p;
  }

  private openNewDepositModal(): void {
    if (!this.ctx.data) { new Notice('⏳ Загрузка…'); return; }
    const allBanks = this.ctx.data.deposits.map(d => d.bankName).filter(Boolean);
    new DepositModal(this.ctx.app, {
      title: '➕ Новый вклад',
      banks: allBanks,
      onSave: async deposit => {
        await this.ctx.storage.addDeposit(this.ctx.notePath, deposit);
        const rec: FinanceRecord = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          date: deposit.startDate,
          time: '',
          type: 'expense',
          amount: deposit.amount,
          category: 'Вклад',
          tag: '',
          payer: deposit.bankName,
          note: `Открытие вклада "${deposit.name}"`,
          attachmentPath: '',
          linkedId: deposit.id,
        };
        await this.ctx.storage.addRecord(this.ctx.notePath, rec);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.onUpdate?.();
        new Notice('✅ Вклад добавлен');
      },
    }).open();
  }

  private openEditDepositModal(deposit: DepositRecord): void {
    if (!this.ctx.data) return;
    const allBanks = this.ctx.data.deposits.map(d => d.bankName).filter(Boolean);
    new DepositModal(this.ctx.app, {
      title: '✏️ Редактировать вклад',
      deposit,
      banks: allBanks,
      onSave: async updated => {
        await this.ctx.storage.updateDeposit(this.ctx.notePath, updated);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.onUpdate?.();
        new Notice('✅ Вклад обновлён');
      },
    }).open();
  }

  private confirmCloseDeposit(deposit: DepositRecord): void {
    const label = `${deposit.name} · ${this.ctx.fmt(deposit.amount)}`;
    const nowTime = new Date().toTimeString().slice(0, 5);
    new ConfirmModal(this.ctx.app, `Закрыть вклад?\n${label}`, async () => {
      deposit.status = 'closed';
      await this.ctx.storage.updateDeposit(this.ctx.notePath, deposit);

      const refundRec: FinanceRecord = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        date: new Date().toISOString().split('T')[0],
        time: nowTime,
        type: 'income',
        amount: deposit.amount,
        category: 'Возврат вклада',
        tag: '',
        payer: deposit.bankName,
        note: `Возврат тела вклада "${deposit.name}"`,
        attachmentPath: '',
        linkedId: deposit.id,
      };
      await this.ctx.storage.addRecord(this.ctx.notePath, refundRec);

      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.onUpdate?.();
      new Notice('✅ Вклад закрыт, средства возвращены');
    }).open();
  }

  private confirmDeleteDeposit(deposit: DepositRecord): void {
    const label = `${deposit.name} · ${this.ctx.fmt(deposit.amount)}`;
    new ConfirmModal(this.ctx.app, `Удалить вклад?\n${label}`, async () => {
      await this.ctx.storage.deleteDeposit(this.ctx.notePath, deposit.id);
      const recs = this.ctx.data!.records.filter(r => !(r.category === 'Вклад' && r.payer === deposit.bankName && r.note.includes(deposit.name)));
      await this.ctx.storage.saveAllRecords(this.ctx.notePath, recs);
      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.onUpdate?.();
      new Notice('🗑️ Вклад удалён');
    }).open();
  }

  private openDepositTopUpModal(deposit: DepositRecord): void {
    new DepositTopUpModal(this.ctx.app, {
      title: `💰 Пополнение — ${deposit.name}`,
      deposit,
      onSave: async topUp => {
        await this.ctx.storage.addDepositTopUp(this.ctx.notePath, deposit.id, topUp);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.onUpdate?.();
        new Notice('✅ Вклад пополнен');
      },
    }).open();
  }

  private confirmDeleteDepositTopUp(deposit: DepositRecord, topUp: DepositTopUp): void {
    const label = `${deposit.name} · ${this.ctx.fmt(topUp.amount)} · ${this.ctx.fmtDate(topUp.date, topUp.time)}`;
    new ConfirmModal(this.ctx.app, `Удалить пополнение?\n${label}`, async () => {
      await this.ctx.storage.deleteDepositTopUp(this.ctx.notePath, deposit.id, topUp.id);
      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.onUpdate?.();
      new Notice('🗑️ Пополнение удалено');
    }).open();
  }

  private openDepositWithdrawalModal(deposit: DepositRecord): void {
    const cur = this.ctx.currency;
    new DepositWithdrawalModal(this.ctx.app, {
      title: `📤 Снятие — ${deposit.name}`,
      deposit,
      maxAmount: deposit.amount,
      currency: cur,
      onSave: async withdrawal => {
        await this.ctx.storage.addDepositWithdrawal(this.ctx.notePath, deposit.id, withdrawal);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.onUpdate?.();
        new Notice('✅ Средства сняты');
      },
    }).open();
  }

  private confirmDeleteDepositWithdrawal(deposit: DepositRecord, withdrawal: DepositWithdrawal): void {
    const label = `${deposit.name} · ${this.ctx.fmt(withdrawal.amount)} · ${this.ctx.fmtDate(withdrawal.date, withdrawal.time)}`;
    new ConfirmModal(this.ctx.app, `Удалить снятие?\n${label}`, async () => {
      await this.ctx.storage.deleteDepositWithdrawal(this.ctx.notePath, deposit.id, withdrawal.id);
      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.onUpdate?.();
      new Notice('🗑️ Снятие удалено');
    }).open();
  }
}
