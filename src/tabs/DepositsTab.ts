import { fmtDate } from "../utils";
import { Notice } from 'obsidian';
import { ViewContext } from '../context';
import {
  DepositRecord, DepositTopUp, DepositWithdrawal, FinanceRecord,
  DepositSortField, PLURAL_THRESHOLD,
  DEFAULT_DEPOSIT_FILTER, DEPOSIT_ACCRUAL_PAGE_SIZE,
} from '../types';
import { DepositModal } from '../DepositModal';
import { DepositTopUpModal } from '../DepositTopUpModal';
import { DepositWithdrawalModal } from '../DepositWithdrawalModal';
import { ConfirmModal } from '../ConfirmModal';
import { getTodayStr, getTodayTime } from '../utils';
import { addMonthsClamped } from '../domain/dateMath';
import { sumMoney } from '../domain/money';
import { DataTable, FilterControl } from '../ui/DataTable';
import { DepositsAnalyticsView } from '../DepositsAnalyticsView';
import { renderMobileCard, renderSummaryCard, renderProgressBar, renderPaginatedSchedule, pageRange, dateRangeControls, compareValues } from '../ui/tabHelpers';

export class DepositsTab {
  private ctx: ViewContext;
  private el: HTMLElement;
  private table: DataTable<DepositRecord>;
  private depositAccrualPages = new Map<string, number>();
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
        { key: 'rate', label: this.tr.percent, cell: d => ({ text: `${d.interestRate}%` }) },
        { key: 'date', label: this.tr.opened, cell: d => ({ text: fmtDate(d.startDate) }) },
        {
          key: 'endDate', label: this.tr.endDate,
          cell: d => {
            const endDate = this.calculateDepositEndDate(d);
            return { text: endDate ? fmtDate(endDate) : '—', cls: endDate ? 'finance-due-date' : '' };
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
      actionsPosition: 'above',
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
        getColumns: () => this.ctx.state.depositsColumns ?? {},
        setColumns: c => { this.ctx.state.depositsColumns = c; },
        getExpandedId: () => this.ctx.state.depositExpandedId ?? null,
        setExpandedId: id => { if (id === null) delete this.ctx.state.depositExpandedId; else this.ctx.state.depositExpandedId = id; }
      },
      renderStats: host => this.renderStats(host),
      toolbarButtons: (toolbar, rerender, api) => {
        const open = (this.ctx.state.depositActiveTab ?? 'list') === 'analytics';
        const toggleBtn = toolbar.createEl('button', {
          cls: `finance-analytics-toggle-btn${open ? ' active' : ''}`,
          text: `📈 ${this.tr.analytics} ${open ? '▲' : '▼'}`,
        });
        toggleBtn.addEventListener('click', () => {
          this.ctx.state.depositActiveTab = open ? 'list' : 'analytics';
          if (!open) api.closeFilters();
          this.ctx.saveState();
          rerender();
        });
      },
      renderPanels: host => {
        if ((this.ctx.state.depositActiveTab ?? 'list') === 'analytics') {
          const panel = host.createDiv('finance-analytics-panel');
          const deposits = this.ctx.data?.deposits ?? [];
          new DepositsAnalyticsView(panel, deposits, this.ctx).render();
        }
      },
      emptyState: { icon: '📈', title: this.tr.noDeposits, subtitle: this.tr.addNewDebt },
      emptyFiltered: { icon: '🔍', title: this.tr.noDepositsFiltered, subtitle: this.tr.tryChangeFilters },
      onBulkDelete: async ids => {
        const idSet = new Set(ids);
        const depositsToDelete = (this.ctx.data?.deposits ?? []).filter(d => idSet.has(d.id));
        await this.ctx.storage.deleteDepositsBatch(this.ctx.accountId, ids);

        const otherRecords = this.ctx.data!.records.filter(r => !r.linkedId || !idSet.has(r.linkedId));
        for (const deposit of depositsToDelete) {
          if (deposit.status === 'active') {
            const refund = this.refundRecord(deposit);
            delete refund.linkedId;
            otherRecords.push(refund);
          }
        }
        await this.ctx.storage.saveAllRecords(this.ctx.accountId, otherRecords);
        await this.reload(this.tr.deleted);
      },
      confirmBulkDeleteText: count => this.tr.confirmDeleteSelectedDeposits.replace('{count}', String(count)),
      onFilterChange: () => {},
      onFiltersToggle: () => {
        if (this.ctx.state.depositActiveTab === 'analytics') {
          this.ctx.state.depositActiveTab = 'list';
          this.ctx.saveState();
        }
      },
      rerender: () => this.render(),
    });
  }

  public renderHeaderActions(container: HTMLElement): void {
    const btn = container.createEl('button', { cls: 'finance-add-btn finance-accent-btn' });
    btn.createEl('span', { text: '＋', cls: 'btn-icon' });
    btn.createEl('span', { text: this.tr.newDeposit });
    btn.addEventListener('click', () => this.openNewDepositModal());
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
      time: getTodayTime(),
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

    const countSub = (count: number, profit: number) => {
      const countLabel = count === 1 ? this.tr.depositCount_one : count < PLURAL_THRESHOLD ? this.tr.depositCount_few : this.tr.depositCount_many;
      return profit > 0 ? `${count} ${countLabel} · ${this.tr.profitLabel}: ${this.ctx.fmt(profit)}` : `${count} ${countLabel}`;
    };

    renderSummaryCard(summary, {
      icon: '💰', title: this.tr.activeCards,
      main: sumMoney(activeDeposits.map(d => d.amount)) > 0 ? this.ctx.fmt(sumMoney(activeDeposits.map(d => d.amount))) : '—',
      sub: countSub(activeDeposits.length, sumMoney(activeDeposits.map(d => this.getDepositProfit(d)))),
      mod: 'finance-stat-deposit-active'
    });

    renderSummaryCard(summary, {
      icon: '✅', title: this.tr.closedCards,
      main: sumMoney(closedDeposits.map(d => d.amount)) > 0 ? this.ctx.fmt(sumMoney(closedDeposits.map(d => d.amount))) : '—',
      sub: countSub(closedDeposits.length, sumMoney(closedDeposits.map(d => this.getDepositProfit(d)))),
      mod: 'finance-stat-deposit-closed'
    });
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
      ...dateRangeControls(f, this.tr),
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
      let av: string | number, bv: string | number;
      if (s.field === 'amount') { av = a.amount; bv = b.amount; }
      else if (s.field === 'bankName') { av = a.bankName; bv = b.bankName; }
      else { av = a.startDate; bv = b.startDate; }
      return compareValues(av, bv, s.dir);
    });
    return result;
  }

  // ── Mobile card ──────────────────────────────────────────────────────────

  private renderCard(block: HTMLElement, deposit: DepositRecord): void {
    block.addClass(deposit.status === 'active' ? 'finance-row-income' : 'finance-row-expense');

    const details = [];
    details.push({ label: `📊`, value: `${deposit.interestRate}${this.tr.percentPerAnnum}` });
    const profit = this.getDepositProfit(deposit);
    if (profit > 0) {
      details.push({ label: `💰 ${this.tr.depositAccruals}:`, value: this.ctx.fmt(profit) });
    }
    const endDate = this.calculateDepositEndDate(deposit);
    if (endDate && deposit.status === 'active') {
      details.push({ label: this.tr.dueBy, value: fmtDate(endDate) });
    }

    renderMobileCard(block, {
      amountText: '+' + this.ctx.fmt(deposit.amount),
      amountCls: 'finance-amount-income',
      subtitle: `${deposit.bankName} · ${this.typeLabel(deposit)}`,
      details,
      note: deposit.note,
    });
  }

  // ── Accruals panel (expandable) ──────────────────────────────────────────

  private renderDepositAccrualsPanel(parent: HTMLElement, deposit: DepositRecord): void {
    const wrapper = parent.createDiv('finance-payments-panel');

    const endDate = this.calculateDepositEndDate(deposit);
    renderProgressBar(wrapper, deposit.startDate, endDate, this.tr, fmtDate.bind(this.ctx));

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
        tr.createEl('td', { text: fmtDate(item.date, item.time), cls: 'finance-td' });
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

    const totalPages = Math.max(1, Math.ceil(deposit.accruals.length / DEPOSIT_ACCRUAL_PAGE_SIZE));
    let page = this.depositAccrualPages.get(deposit.id);
    if (page === undefined) {
      const lastPaidIdx = deposit.accruals.findLastIndex(a => a.status === 'paid');
      page = lastPaidIdx >= 0 ? Math.floor(lastPaidIdx / DEPOSIT_ACCRUAL_PAGE_SIZE) : 0;
    }
    page = Math.max(0, Math.min(page, totalPages - 1));
    this.depositAccrualPages.set(deposit.id, page);
    renderPaginatedSchedule(
      wrapper,
      deposit.accruals,
      page,
      DEPOSIT_ACCRUAL_PAGE_SIZE,
      ['#', this.tr.date, this.tr.sum, this.tr.status],
      this.ctx,
      {
        formatDate: a => fmtDate(a.dueDate, a.paidDate),
        formatStatus: (_a, isPaid) => isPaid
          ? (deposit.accrualType === 'capitalization' ? this.tr.accrualIncluded : this.tr.accrualPaidToAccount)
          : this.tr.pendingStatus,
      }
    );

    if (totalPages > 1) {
      const pagNav = wrapper.createDiv('finance-pagination-nav finance-panel-pagination');
      const go = (newPage: number) => {
        this.depositAccrualPages.set(deposit.id, newPage);
        parent.empty();
        this.renderDepositAccrualsPanel(parent, deposit);
      };

      const prev = pagNav.createEl('button', { cls: 'finance-page-btn', text: '←' });
      prev.disabled = page === 0;
      prev.addEventListener('click', () => go(page - 1));

      pageRange(page, totalPages, this.ctx.isMobile).forEach(p => {
        if (p === '…') { pagNav.createEl('span', { text: '…', cls: 'finance-page-ellipsis' }); return; }
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

  // ── Modals ──────────────────────────────────────────────────────────────

  private openNewDepositModal(): void {
    if (!this.ctx.data) { new Notice(this.tr.loading); return; }
    const allBanks = this.ctx.data.deposits.map(d => d.bankName).filter(Boolean);
    new DepositModal(this.ctx.app, {
      title: this.tr.newDeposit,
      banks: allBanks,
      pluginId: this.ctx.pluginId,
      onSave: async (deposit, interestRecords) => {
        await this.ctx.storage.addDeposit(this.ctx.accountId, deposit);
        for (const r of interestRecords) {
          await this.ctx.storage.addRecord(this.ctx.accountId, r);
        }
        // Opening expense is now created automatically by autoTransactions.ts
        // to avoid duplication
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
      pluginId: this.ctx.pluginId,
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
          // Opening expense is now created automatically by autoTransactions.ts
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

      // Create refund record when manually closing deposit
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
    const label = `${deposit.name} · ${this.ctx.fmt(topUp.amount)} · ${fmtDate(topUp.date, topUp.time)}`;
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
    const alreadyWithdrawn = sumMoney(deposit.withdrawals.map(w => w.amount));
    new DepositWithdrawalModal(this.ctx.app, {
      title: `${this.tr.withdraw} — ${deposit.name}`,
      deposit,
      maxAmount: Math.max(0, deposit.amount - alreadyWithdrawn),
      currency: this.ctx.currency,
      onSave: async withdrawal => {
        await this.ctx.storage.addDepositWithdrawal(this.ctx.accountId, deposit.id, withdrawal);
        await this.reload(this.tr.depositUpdated);
      },
    }).open();
  }

  private confirmDeleteDepositWithdrawal(deposit: DepositRecord, withdrawal: DepositWithdrawal): void {
    const label = `${deposit.name} · ${this.ctx.fmt(withdrawal.amount)} · ${fmtDate(withdrawal.date, withdrawal.time)}`;
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
