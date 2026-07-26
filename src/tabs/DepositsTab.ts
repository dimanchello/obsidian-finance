import { Notice } from 'obsidian';
import { ViewContext } from '../context';
import {
  DepositRecord, DepositTopUp, DepositWithdrawal, FinanceRecord,
  DepositSortField, PLURAL_THRESHOLD, PERCENT_100,
  DEFAULT_DEPOSIT_FILTER, DEPOSIT_ACCRUAL_PAGE_SIZE,
} from '../types';
import { DepositModal } from '../DepositModal';
import { DepositTopUpModal } from '../DepositTopUpModal';
import { DepositWithdrawalModal } from '../DepositWithdrawalModal';
import { ConfirmModal } from '../ConfirmModal';
import { getTodayStr } from '../utils';
import { addMonthsClamped, daysBetweenStr } from '../domain/dateMath';
import { sumMoney } from '../domain/money';
import { DataTable, FilterControl } from '../ui/DataTable';

export class DepositsTab {
  private ctx: ViewContext;
  private el: HTMLElement;
  private table: DataTable<DepositRecord>;
  onUpdate: (() => void) | null = null;

  private get tr() { return this.ctx.tr; }

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;

    this.table = new DataTable<DepositRecord>({
      ctx,
      items: () => this.getFilteredDeposits(),
      itemId: d => d.id,
      hasAnyItems: () => (this.ctx.data?.deposits.length ?? 0) > 0,
      columns: [
        { key: 'name', label: this.tr.name, cell: d => ({ text: d.name || '—' }) },
        { key: 'bank', label: this.tr.bankName, cell: d => ({ text: d.bankName || '—' }) },
        { key: 'type', label: this.tr.type, cell: d => ({ text: this.typeLabel(d) }) },
        { key: 'amount', label: this.tr.sum, cell: d => ({ text: this.ctx.fmt(d.amount), cls: 'finance-amount-cell' }) },
        {
          key: 'profit', label: this.tr.profitLabel,
          cell: d => {
            const profit = this.getDepositProfit(d);
            return {
              text: profit > 0 ? this.ctx.fmt(profit) : '—',
              cls: profit > 0 ? 'finance-amount-cell finance-amount-income' : 'finance-amount-cell',
            };
          },
        },
        { key: 'rate', label: this.tr.rate, cell: d => ({ text: `${d.interestRate}%` }) },
        { key: 'date', label: this.tr.opened, cell: d => ({ text: this.ctx.fmtDate(d.startDate) }) },
        {
          key: 'endDate', label: this.tr.endDate,
          cell: d => {
            const endDate = this.calculateDepositEndDate(d);
            return { text: endDate ? this.ctx.fmtDate(endDate) : '—', cls: endDate ? 'finance-due-date' : '' };
          },
        },
      ],
      rowCls: d => [d.status === 'active' ? 'finance-row-income' : 'finance-row-expense'],
      rowActions: d => [
        ...(d.status === 'active' ? [
          { icon: '💰', title: this.tr.topUp, onClick: () => this.openDepositTopUpModal(d) },
          { icon: '📤', title: this.tr.withdraw, onClick: () => this.openDepositWithdrawalModal(d) },
          { icon: '✅', title: this.tr.closeAccount, onClick: () => this.confirmCloseDeposit(d) },
        ] : []),
        { icon: '✏️', title: this.tr.edit, onClick: () => this.openEditDepositModal(d) },
        { icon: '🗑️', title: this.tr.delete, onClick: () => this.confirmDeleteDeposit(d), cls: 'finance-delete-btn' },
      ],
      expandable: {
        hasContent: () => true,
        toggleLabel: d => `📋 ${this.tr.depositAccruals} (${d.accruals.length})`,
        render: (host, d) => this.renderDepositAccrualsPanel(host, d),
      },
      renderCard: (block, d) => this.renderCard(block, d),
      filterControls: () => this.filterControls(),
      sortFields: [
        { field: 'date', label: this.tr.startDate },
        { field: 'amount', label: this.tr.sum },
        { field: 'bankName', label: this.tr.bankName },
      ],
      state: {
        getPage: () => this.ctx.state.depositPage ?? 0,
        setPage: p => { this.ctx.state.depositPage = p; },
        getSort: () => this.ctx.state.depositSort ?? { field: 'date', dir: 'desc' },
        setSort: s => { this.ctx.state.depositSort = s as { field: DepositSortField; dir: 'asc' | 'desc' }; },
        resetFilter: () => { this.ctx.state.depositFilter = { ...DEFAULT_DEPOSIT_FILTER }; },
        getColumns: () => (this.ctx.state.depositsColumns ??= {}),
        setColumns: c => { this.ctx.state.depositsColumns = c; },
      },
      renderStats: host => this.renderStats(host),
      toolbarButtons: toolbar => {
        const btn = toolbar.createEl('button', { cls: 'finance-add-btn finance-accent-btn' });
        btn.createEl('span', { text: '＋', cls: 'btn-icon' });
        btn.createEl('span', { text: this.tr.newDeposit });
        btn.addEventListener('click', () => this.openNewDepositModal());
      },
      emptyState: { icon: '📈', title: this.tr.noDeposits, subtitle: this.tr.addNewDebt },
      emptyFiltered: { icon: '🔍', title: this.tr.noDepositsFiltered, subtitle: this.tr.tryChangeFilters },
      onBulkDelete: async ids => {
        const idSet = new Set(ids);
        const depositsToDelete = (this.ctx.data?.deposits ?? []).filter(d => idSet.has(d.id));
        await this.ctx.storage.deleteDepositsBatch(this.ctx.accountId, ids);

        const otherRecords = this.ctx.data!.records.filter(r => !r.linkedId || !idSet.has(r.linkedId));
        for (const deposit of depositsToDelete) {
          if (deposit.status === 'active') otherRecords.push(this.refundRecord(deposit));
        }
        await this.ctx.storage.saveAllRecords(this.ctx.accountId, otherRecords);
        await this.reload(this.tr.deleted);
      },
      confirmBulkDeleteText: count => this.tr.confirmDeleteSelectedDeposits.replace('{count}', String(count)),
      onFilterChange: () => {},
      rerender: () => this.render(),
    });
  }

  render(): void {
    if (this.ctx.state.depositSort?.field === 'createdAt' as DepositSortField) {
      this.ctx.state.depositSort = { field: 'date', dir: 'desc' };
      this.ctx.saveState();
    }
    this.ctx.state.depositFilter ??= { ...DEFAULT_DEPOSIT_FILTER };
    this.el.empty();
    this.table.render(this.el);
  }

  update(): void {
    this.render();
  }

  private async reload(notice?: string): Promise<void> {
    this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
    this.onUpdate?.();
    if (notice) new Notice(notice);
  }

  // ── Derived helpers ──────────────────────────────────────────────────────

  private typeLabel(deposit: DepositRecord): string {
    switch (deposit.type) {
      case 'demand': return this.tr.depositTypeDemand;
      case 'savings': return this.tr.depositTypeSavings;
      default: return this.tr.depositTypeTerm;
    }
  }

  private getDepositAccrued(deposit: DepositRecord): number {
    return sumMoney(deposit.accruals.filter(a => a.status === 'paid').map(a => a.amount));
  }

  private getDepositProfit(deposit: DepositRecord): number {
    return sumMoney(deposit.accruals.map(a => a.amount));
  }

  private calculateDepositEndDate(deposit: DepositRecord): string {
    if (!deposit.startDate) return '';
    try {
      return addMonthsClamped(deposit.startDate, deposit.termMonths || 0);
    } catch {
      return '';
    }
  }

  private refundRecord(deposit: DepositRecord): FinanceRecord {
    return {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      date: getTodayStr(),
      time: new Date().toTimeString().slice(0, 5),
      type: 'income',
      amount: deposit.amount,
      category: this.tr.depositRefundCat,
      tag: '',
      payer: deposit.bankName,
      note: `${this.tr.depositRefundNote} "${deposit.name}"`,
      attachmentPath: '',
      linkedId: deposit.id,
    };
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  private renderStats(host: HTMLElement): void {
    this.ctx.renderRecordsStats(host);

    const allDeposits = this.ctx.data?.deposits ?? [];
    const summary = host.createDiv('finance-stats-container finance-stats-two-cols');
    const activeDeposits = allDeposits.filter(d => d.status === 'active');
    const closedDeposits = allDeposits.filter(d => d.status === 'closed');

    const mkCard = (title: string, icon: string, amount: number, profit: number, count: number, isActive: boolean) => {
      const card = summary.createDiv(`finance-stat-card finance-stat-${isActive ? 'deposit-active' : 'deposit-closed'}`);
      const header = card.createDiv('finance-debt-summary-header');
      header.createEl('span', { text: icon, cls: 'finance-debt-summary-icon' });
      header.createEl('span', { text: title, cls: 'finance-debt-summary-title' });
      const content = card.createDiv('finance-debt-summary-content');
      content.createEl('div', { text: amount > 0 ? this.ctx.fmt(amount) : '—', cls: 'finance-debt-summary-main' });
      const countLabel = count === 1 ? this.tr.depositCount_one : count < PLURAL_THRESHOLD ? this.tr.depositCount_few : this.tr.depositCount_many;
      content.createEl('div', {
        text: profit > 0
          ? `${count} ${countLabel} · ${this.tr.profitLabel}: ${this.ctx.fmt(profit)}`
          : `${count} ${countLabel}`,
        cls: 'finance-debt-summary-sub',
      });
    };

    mkCard(this.tr.activeCards, '💰',
      sumMoney(activeDeposits.map(d => d.amount)),
      sumMoney(activeDeposits.map(d => this.getDepositProfit(d))),
      activeDeposits.length, true);
    mkCard(this.tr.closedCards, '✅',
      sumMoney(closedDeposits.map(d => d.amount)),
      sumMoney(closedDeposits.map(d => this.getDepositProfit(d))),
      closedDeposits.length, false);
  }

  // ── Filters ──────────────────────────────────────────────────────────────

  private filterControls(): FilterControl[] {
    const f = this.ctx.state.depositFilter ?? (this.ctx.state.depositFilter = { ...DEFAULT_DEPOSIT_FILTER });
    return [
      {
        kind: 'search', label: this.tr.search, placeholder: this.tr.searchByName,
        get: () => f.search, set: v => { f.search = v; },
      },
      {
        kind: 'select', label: this.tr.status,
        options: [
          { value: 'all', label: this.tr.all },
          { value: 'active', label: this.tr.depositActive },
          { value: 'closed', label: this.tr.depositClosed },
        ],
        get: () => f.status, set: v => { f.status = v as typeof f.status; },
      },
      {
        kind: 'searchSelect', label: this.tr.bankName,
        options: () => [
          { value: '', label: this.tr.allBanks },
          ...[...new Set((this.ctx.data?.deposits ?? []).map(d => d.bankName).filter(Boolean))].map(b => ({ value: b, label: b })),
        ],
        get: () => f.bankName, set: v => { f.bankName = v; },
      },
      { kind: 'date', label: this.tr.from, get: () => f.dateFrom, set: v => { f.dateFrom = v; } },
      { kind: 'date', label: this.tr.to, get: () => f.dateTo, set: v => { f.dateTo = v; } },
      {
        kind: 'select', label: this.tr.type,
        options: [
          { value: 'all', label: this.tr.allDepositTypes },
          { value: 'term', label: this.tr.depositTypeTerm },
          { value: 'demand', label: this.tr.depositTypeDemand },
          { value: 'savings', label: this.tr.depositTypeSavings },
        ],
        get: () => f.type, set: v => { f.type = v as typeof f.type; },
      },
    ];
  }

  private getFilteredDeposits(): DepositRecord[] {
    if (!this.ctx.data) return [];
    const f = this.ctx.state.depositFilter ?? DEFAULT_DEPOSIT_FILTER;
    const s = this.ctx.state.depositSort ?? { field: 'date' as DepositSortField, dir: 'desc' as const };

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
      if (s.field === 'amount') cmp = a.amount - b.amount;
      else if (s.field === 'bankName') cmp = a.bankName.localeCompare(b.bankName);
      else cmp = a.startDate.localeCompare(b.startDate);
      return s.dir === 'asc' ? cmp : -cmp;
    });
    return result;
  }

  // ── Mobile card ──────────────────────────────────────────────────────────

  private renderCard(block: HTMLElement, deposit: DepositRecord): void {
    block.addClass(deposit.status === 'active' ? 'finance-row-income' : 'finance-row-expense');

    const header = block.createDiv('finance-record-header');
    header.createEl('span', {
      text: '+' + this.ctx.fmt(deposit.amount),
      cls: 'finance-record-amount finance-amount-income',
    });
    header.createEl('span', { text: `${deposit.bankName} · ${this.typeLabel(deposit)}`, cls: 'finance-record-date' });

    const details = block.createDiv('finance-record-details');
    details.createEl('span', { text: `📊 ${deposit.interestRate}${this.tr.percentPerAnnum}`, cls: 'finance-record-detail' });
    const profit = this.getDepositProfit(deposit);
    if (profit > 0) {
      details.createEl('span', { text: `💰 ${this.tr.depositAccruals}: ${this.ctx.fmt(profit)}`, cls: 'finance-record-detail' });
    }
    const endDate = this.calculateDepositEndDate(deposit);
    if (endDate && deposit.status === 'active') {
      details.createEl('span', { text: `${this.tr.dueBy} ${this.ctx.fmtDate(endDate)}`, cls: 'finance-record-detail' });
    }

    if (deposit.note) {
      block.createEl('div', { text: deposit.note, cls: 'finance-record-note' });
    }
  }

  // ── Accruals panel (expandable) ──────────────────────────────────────────

  private renderDepositAccrualsPanel(parent: HTMLElement, deposit: DepositRecord): void {
    const wrapper = parent.createDiv('finance-payments-panel');
    const today = getTodayStr();

    const endDate = this.calculateDepositEndDate(deposit);
    if (deposit.startDate && endDate && deposit.startDate < endDate) {
      const totalDays = daysBetweenStr(deposit.startDate, endDate);
      const elapsedDays = daysBetweenStr(deposit.startDate, today);
      const progress = Math.min(PERCENT_100, Math.max(0, (elapsedDays / totalDays) * PERCENT_100));

      const progressWrap = wrapper.createDiv('finance-deposit-progress');
      const progressLabel = progressWrap.createDiv('finance-deposit-progress-label');
      progressLabel.textContent = `${this.ctx.fmtDate(deposit.startDate)} → ${this.ctx.fmtDate(endDate)} (${Math.round(progress)}%)`;

      const progressBar = progressWrap.createDiv('finance-deposit-progress-bar');
      const progressFill = progressBar.createDiv('finance-deposit-progress-fill');
      progressFill.style.setProperty('--ft-progress', `${progress}%`);
      if (progress >= PERCENT_100) progressFill.addClass('is-complete');
    }

    const renderMovementList = <M extends { date: string; time: string; amount: number; note: string; id: string }>(
      title: string, items: M[], sign: '+' | '−', movCls: string, totalLabel: string,
      onDelete: (item: M) => void,
    ) => {
      if (!items.length) return;
      wrapper.createEl('h4', { text: title, cls: 'finance-section-title' });
      const table = wrapper.createEl('table', { cls: 'finance-mov-table' });
      const head = table.createEl('thead').createEl('tr');
      [this.tr.date, this.tr.sum, this.tr.note, ''].forEach(l => {
        head.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
      });
      const body = table.createEl('tbody');
      items.slice().reverse().forEach(item => {
        const tr = body.createEl('tr');
        tr.createEl('td', { text: this.ctx.fmtDate(item.date, item.time), cls: 'finance-td' });
        tr.createEl('td', { text: sign + this.ctx.fmt(item.amount), cls: `finance-td ${movCls}` });
        tr.createEl('td', { text: item.note || '—', cls: 'finance-td' });
        const actTd = tr.createEl('td', { cls: 'finance-td' });
        const btn = actTd.createEl('button', { cls: 'finance-action-btn finance-delete-btn', text: '🗑️' });
        btn.title = this.tr.delete;
        btn.addEventListener('click', () => onDelete(item));
      });
      wrapper.createDiv({
        cls: 'finance-deposit-summary',
        text: `${totalLabel}: ${items.length} · ${this.ctx.fmt(sumMoney(items.map(i => i.amount)))}`,
      });
    };

    renderMovementList(this.tr.topUpsHeader, deposit.topUps, '+', 'finance-td-mov-repay',
      this.tr.totalTopUps, tu => this.confirmDeleteDepositTopUp(deposit, tu));
    renderMovementList(this.tr.withdrawalsHeader, deposit.withdrawals, '−', 'finance-td-mov-borrow',
      this.tr.totalWithdrawals, w => this.confirmDeleteDepositWithdrawal(deposit, w));

    const accrued = this.getDepositAccrued(deposit);
    if (accrued > 0) {
      wrapper.createDiv({
        cls: 'finance-deposit-summary finance-deposit-accrued',
        text: `${this.tr.accruedIncome}: ${this.ctx.fmt(accrued)}`,
      });
    }

    wrapper.createEl('h4', { text: this.tr.accrualsHeader, cls: 'finance-section-title' });

    if (!deposit.accruals.length) {
      wrapper.createEl('p', { text: this.tr.noScheduledAccruals, cls: 'finance-empty-text' });
      return;
    }

    const pageAccruals = deposit.accruals.slice(0, DEPOSIT_ACCRUAL_PAGE_SIZE);
    const scrollWrapper = wrapper.createDiv('finance-mov-scroll');
    const movTable = scrollWrapper.createEl('table', { cls: 'finance-mov-table' });
    const movHead = movTable.createEl('thead').createEl('tr');
    ['#', this.tr.date, this.tr.sum, this.tr.status].forEach(l => {
      movHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
    });
    const movBody = movTable.createEl('tbody');

    pageAccruals.forEach((a, idx) => {
      const isPaid = a.status === 'paid' || a.dueDate <= today;
      const mr = movBody.createEl('tr', { cls: isPaid ? 'finance-payment-paid' : 'finance-payment-pending' });
      mr.createEl('td', { text: String(idx + 1), cls: 'finance-td' });
      mr.createEl('td', { text: this.ctx.fmtDate(a.dueDate, a.paidDate), cls: 'finance-td' });
      mr.createEl('td', { text: this.ctx.fmt(a.amount), cls: 'finance-td' });
      const statusText = isPaid
        ? (deposit.accrualType === 'capitalization' ? this.tr.accrualIncluded : this.tr.accrualPaidToAccount)
        : this.tr.pendingStatus;
      mr.createEl('td', { text: statusText, cls: 'finance-td finance-payment-status' });
    });

    if (deposit.accruals.length > DEPOSIT_ACCRUAL_PAGE_SIZE) {
      wrapper.createDiv({
        cls: 'finance-deposit-pag-info',
        text: `1–${DEPOSIT_ACCRUAL_PAGE_SIZE} ${this.tr.fromLower} ${deposit.accruals.length}`,
      });
    }
  }

  // ── Modals ──────────────────────────────────────────────────────────────

  private openNewDepositModal(): void {
    if (!this.ctx.data) { new Notice(this.tr.loading); return; }
    const allBanks = this.ctx.data.deposits.map(d => d.bankName).filter(Boolean);
    new DepositModal(this.ctx.app, {
      title: this.tr.newDeposit,
      banks: allBanks,
      onSave: async (deposit, interestRecords) => {
        await this.ctx.storage.addDeposit(this.ctx.accountId, deposit);
        for (const r of interestRecords) {
          await this.ctx.storage.addRecord(this.ctx.accountId, r);
        }
        const rec: FinanceRecord = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          date: deposit.startDate,
          time: new Date().toTimeString().slice(0, 5),
          type: 'expense',
          amount: deposit.amount,
          category: this.tr.depositDefaultCat,
          tag: '',
          payer: deposit.bankName,
          note: `${this.tr.depositOpenNote} "${deposit.name}"`,
          attachmentPath: '',
          linkedId: deposit.id,
        };
        await this.ctx.storage.addRecord(this.ctx.accountId, rec);
        await this.reload(this.tr.depositAdded);
      },
    }).open();
  }

  private openEditDepositModal(deposit: DepositRecord): void {
    if (!this.ctx.data) return;
    const allBanks = this.ctx.data.deposits.map(d => d.bankName).filter(Boolean);
    new DepositModal(this.ctx.app, {
      title: this.tr.editRecord,
      deposit,
      banks: allBanks,
      onSave: async (updated) => {
        const accrualFieldsChanged =
          deposit.amount !== updated.amount ||
          deposit.startDate !== updated.startDate ||
          deposit.termMonths !== updated.termMonths ||
          deposit.interestRate !== updated.interestRate ||
          deposit.accrualType !== updated.accrualType;

        if (accrualFieldsChanged && updated.status === 'active') {
          // Terms changed: drop mirrored records and the schedule; auto-transactions rebuild both
          const otherRecords = this.ctx.data!.records.filter(r => r.linkedId !== updated.id);
          otherRecords.push({
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            date: updated.startDate,
            time: new Date().toTimeString().slice(0, 5),
            type: 'expense',
            amount: updated.amount,
            category: this.tr.depositDefaultCat,
            tag: '',
            payer: updated.bankName,
            note: `${this.tr.depositOpenNote} "${updated.name}"`,
            attachmentPath: '',
            linkedId: updated.id,
          });
          updated.accruals = [];
          await this.ctx.storage.saveAllRecords(this.ctx.accountId, otherRecords);
        }
        await this.ctx.storage.updateDeposit(this.ctx.accountId, updated);
        await this.reload(this.tr.depositUpdated);
      },
    }).open();
  }

  private confirmCloseDeposit(deposit: DepositRecord): void {
    const label = `${deposit.name} · ${this.ctx.fmt(deposit.amount)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmCloseDeposit}\n${label}`, async () => {
      deposit.status = 'closed';
      await this.ctx.storage.updateDeposit(this.ctx.accountId, deposit);
      await this.ctx.storage.addRecord(this.ctx.accountId, this.refundRecord(deposit));
      await this.reload(this.tr.depositClosed);
    }).open();
  }

  private confirmDeleteDeposit(deposit: DepositRecord): void {
    const label = `${deposit.name} · ${this.ctx.fmt(deposit.amount)}`;
    const refundNote = deposit.status === 'active'
      ? `\n\n${this.tr.closeDepositRefund.replace('{amount}', this.ctx.fmt(deposit.amount))}`
      : '';
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteDeposit}${refundNote}\n\n${label}`, async () => {
      await this.ctx.storage.deleteDeposit(this.ctx.accountId, deposit.id);
      const otherRecords = this.ctx.data!.records.filter(r => r.linkedId !== deposit.id);
      if (deposit.status === 'active') {
        const refund = this.refundRecord(deposit);
        delete refund.linkedId;
        otherRecords.push(refund);
      }
      await this.ctx.storage.saveAllRecords(this.ctx.accountId, otherRecords);
      await this.reload(this.tr.depositDeleted);
    }).open();
  }

  private openDepositTopUpModal(deposit: DepositRecord): void {
    new DepositTopUpModal(this.ctx.app, {
      title: `💰 ${this.tr.topUp} — ${deposit.name}`,
      deposit,
      onSave: async topUp => {
        await this.ctx.storage.addDepositTopUp(this.ctx.accountId, deposit.id, topUp);
        await this.reload(this.tr.depositUpdated);
      },
    }).open();
  }

  private confirmDeleteDepositTopUp(deposit: DepositRecord, topUp: DepositTopUp): void {
    const label = `${deposit.name} · ${this.ctx.fmt(topUp.amount)} · ${this.ctx.fmtDate(topUp.date, topUp.time)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteTopUp}\n${label}`, async () => {
      await this.ctx.storage.deleteDepositTopUp(this.ctx.accountId, deposit.id, topUp.id);
      const linkedRec = this.ctx.data?.records.find(r =>
        r.linkedId === deposit.id && r.date === topUp.date && r.amount === topUp.amount && r.type === 'expense');
      if (linkedRec) {
        await this.ctx.storage.deleteRecord(this.ctx.accountId, linkedRec.id);
      }
      await this.reload(this.tr.deleted);
    }).open();
  }

  private openDepositWithdrawalModal(deposit: DepositRecord): void {
    new DepositWithdrawalModal(this.ctx.app, {
      title: `${this.tr.withdraw} — ${deposit.name}`,
      deposit,
      maxAmount: deposit.amount,
      currency: this.ctx.currency,
      onSave: async withdrawal => {
        await this.ctx.storage.addDepositWithdrawal(this.ctx.accountId, deposit.id, withdrawal);
        await this.reload(this.tr.depositUpdated);
      },
    }).open();
  }

  private confirmDeleteDepositWithdrawal(deposit: DepositRecord, withdrawal: DepositWithdrawal): void {
    const label = `${deposit.name} · ${this.ctx.fmt(withdrawal.amount)} · ${this.ctx.fmtDate(withdrawal.date, withdrawal.time)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteWithdrawal}\n${label}`, async () => {
      await this.ctx.storage.deleteDepositWithdrawal(this.ctx.accountId, deposit.id, withdrawal.id);
      const linkedRec = this.ctx.data?.records.find(r =>
        r.linkedId === deposit.id && r.date === withdrawal.date && r.amount === withdrawal.amount && r.type === 'income');
      if (linkedRec) {
        await this.ctx.storage.deleteRecord(this.ctx.accountId, linkedRec.id);
      }
      await this.reload(this.tr.deleted);
    }).open();
  }
}
