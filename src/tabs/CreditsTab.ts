import { fmtDate } from "../utils";
import { Notice } from 'obsidian';
import { ViewContext } from '../context';
import {
  CreditRecord,
  CreditSortField, PLURAL_THRESHOLD,
  DEFAULT_CREDIT_FILTER, CREDIT_PAYMENT_PAGE_SIZE,
} from '../types';
import { CreditModal } from '../CreditModal';
import { CreditPaymentModal } from '../CreditPaymentModal';
import { CreditEarlyRepaymentModal } from '../CreditEarlyRepaymentModal';
import { ConfirmModal } from '../ConfirmModal';
import { addMonthsClamped } from '../domain/dateMath';
import { sumMoney } from '../domain/money';
import { calculatePaymentBreakdown, calculateRemainingPrincipal } from '../domain/creditCalculations';
import { DataTable, FilterControl } from '../ui/DataTable';
import { CreditsAnalyticsView } from '../CreditsAnalyticsView';
import { renderMobileCard, renderSummaryCard, renderProgressBar, renderPaginatedSchedule, pageRange, dateRangeControls, compareValues } from '../ui/tabHelpers';
import { AccountCommands } from '../domain/AccountCommands';

export class CreditsTab {
  private ctx: ViewContext;
  private el: HTMLElement;
  private table: DataTable<CreditRecord>;
  private commands: AccountCommands;
  private creditPaymentPages = new Map<string, number>();

  private get tr() { return this.ctx.tr; }

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;
    this.commands = new AccountCommands(ctx.storage, ctx.accountId);

    this.table = new DataTable<CreditRecord>({
      ctx,
      items: () => this.getFilteredCredits(),
      itemId: c => c.id,
      hasAnyItems: () => (this.ctx.data?.credits.length ?? 0) > 0,
      columns: [
        { key: 'name', label: this.tr.name, cell: c => ({ text: c.name || '—' }) },
        { key: 'bank', label: this.tr.bankName, cell: c => ({ text: c.bankName || '—' }) },
        { key: 'type', label: this.tr.type, cell: c => ({ text: this.typeLabel(c) }) },
        { key: 'amount', label: this.tr.remaining, cell: c => ({ text: this.ctx.fmt(c.currentAmount), cls: 'finance-amount-cell' }) },
        { key: 'payment', label: this.tr.monthlyPayment, cell: c => ({ text: this.ctx.fmt(c.monthlyPayment), cls: 'finance-amount-cell' }) },
        { key: 'rate', label: this.tr.rate, cell: c => ({ text: `${c.interestRate}%` }) },
        { key: 'date', label: this.tr.opened, cell: c => ({ text: fmtDate(c.startDate) }) },
        {
          key: 'endDate', label: this.tr.endDate,
          cell: c => {
            const endDate = this.calculateCreditEndDate(c);
            return { text: endDate ? fmtDate(endDate) : '—', cls: endDate ? 'finance-due-date' : '' };
          },
        },
      ],
      rowCls: c => [c.status === 'active' ? 'finance-row-income' : 'finance-row-expense'],
      rowActions: c => [
        ...(c.status === 'active' ? [
          { icon: '💰', title: this.tr.addMovement, onClick: () => this.openAddCreditPaymentModal(c) },
          { icon: '⚡', title: this.tr.earlyRepayment, onClick: () => this.openEarlyRepaymentModal(c) },
        ] : []),
        { icon: '✏️', title: this.tr.edit, onClick: () => this.openEditCreditModal(c) },
        { icon: '🗑️', title: this.tr.delete, onClick: () => this.confirmDeleteCredit(c), cls: 'finance-delete-btn' },
      ],
      expandable: {
        hasContent: () => true,
        toggleLabel: c => `📋 ${this.tr.creditPayments} (${c.payments.length})`,
        render: (host, c) => this.renderCreditPaymentsPanel(host, c),
      },
      actionsPosition: 'above',
      renderCard: (block, c) => this.renderCard(block, c),
      filterControls: () => this.filterControls(),
      sortFields: [
        { field: 'date', label: this.tr.startDate },
        { field: 'amount', label: this.tr.sum },
        { field: 'bankName', label: this.tr.bankName },
      ],
      state: {
        getPage: () => this.ctx.state.creditPage ?? 0,
        setPage: p => { this.ctx.state.creditPage = p; },
        getSort: () => this.ctx.state.creditSort ?? { field: 'date', dir: 'desc' },
        setSort: s => { this.ctx.state.creditSort = s as { field: CreditSortField; dir: 'asc' | 'desc' }; },
        resetFilter: () => { this.ctx.state.creditFilter = { ...DEFAULT_CREDIT_FILTER }; },
        getColumns: () => (this.ctx.state.creditsColumns ??= {}),
        setColumns: c => { this.ctx.state.creditsColumns = c; },
        getExpandedId: () => this.ctx.state.creditExpandedId ?? null,
        setExpandedId: id => { if (id === null) delete this.ctx.state.creditExpandedId; else this.ctx.state.creditExpandedId = id; }
      },
      renderStats: host => this.renderStats(host),
      toolbarButtons: (toolbar, rerender, api) => {
        const open = (this.ctx.state.creditActiveTab ?? 'list') === 'analytics';
        const toggleBtn = toolbar.createEl('button', {
          cls: `finance-analytics-toggle-btn${open ? ' active' : ''}`,
          text: `📈 ${this.tr.analytics} ${open ? '▲' : '▼'}`,
        });
        toggleBtn.addEventListener('click', () => {
          this.ctx.state.creditActiveTab = open ? 'list' : 'analytics';
          if (!open) api.closeFilters();
          this.ctx.saveState();
          rerender();
        });
      },
      renderPanels: host => {
        if ((this.ctx.state.creditActiveTab ?? 'list') === 'analytics') {
          const panel = host.createDiv('finance-analytics-panel');
          const credits = this.ctx.data?.credits ?? [];
          const records = this.ctx.data?.records ?? [];
          new CreditsAnalyticsView(panel, credits, records, this.ctx).render();
        }
      },
      emptyState: { icon: '🏦', title: this.tr.noCredits, subtitle: this.tr.addNewDebt },
      emptyFiltered: { icon: '🔍', title: this.tr.noCreditsFiltered, subtitle: this.tr.tryChangeFilters },
      onBulkDelete: async ids => {
        await this.commands.deleteCredits(ids);
        await this.reload(this.tr.deleted);
      },
      confirmBulkDeleteText: count => this.tr.confirmDeleteSelectedCredits.replace('{count}', String(count)),
      onFilterChange: () => {},
      onFiltersToggle: () => {
        if (this.ctx.state.creditActiveTab === 'analytics') {
          this.ctx.state.creditActiveTab = 'list';
          this.ctx.saveState();
        }
      },
      rerender: () => this.render(),
    });
  }

  public renderHeaderActions(container: HTMLElement): void {
    const btn = container.createEl('button', { cls: 'finance-add-btn finance-accent-btn' });
    btn.createEl('span', { text: '＋', cls: 'btn-icon' });
    btn.createEl('span', { text: this.tr.newCredit });
    btn.addEventListener('click', () => this.openNewCreditModal());
  }

  public render(): void {
    if (this.ctx.state.creditSort?.field === 'createdAt' as CreditSortField) {
      this.ctx.state.creditSort = { field: 'date', dir: 'desc' };
      this.ctx.saveState();
    }
    this.ctx.state.creditFilter ??= { ...DEFAULT_CREDIT_FILTER };
    this.el.empty();

    this.table.render(this.el);
  }

  update(): void {
    this.render();
  }

  private async reload(notice?: string): Promise<void> {
    this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
    this.render();
    if (notice) new Notice(notice);
  }

  private typeLabel(credit: CreditRecord): string {
    switch (credit.type) {
      case 'consumer': return this.tr.creditTypeConsumer;
      case 'auto': return this.tr.creditTypeAuto;
      case 'mortgage': return this.tr.creditTypeMortgage;
      default: return this.tr.creditTypeCredit;
    }
  }

  private calculateCreditEndDate(credit: CreditRecord): string {
    if (!credit.startDate) return '';
    try {
      return addMonthsClamped(credit.startDate, credit.termMonths || 0);
    } catch {
      return '';
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  private renderStats(host: HTMLElement): void {
    this.ctx.renderRecordsStats(host);

    const allCredits = this.ctx.data?.credits ?? [];
    const summary = host.createDiv('finance-stats-container finance-stats-two-cols');
    const activeCredits = allCredits.filter(c => c.status === 'active');
    const paidCredits = allCredits.filter(c => c.status === 'paid');

    const countSub = (count: number) => `${count} ${count === 1 ? this.tr.creditCount_one : count < PLURAL_THRESHOLD ? this.tr.creditCount_few : this.tr.creditCount_many}`;

    renderSummaryCard(summary, {
      icon: '💳', title: this.tr.activeCards,
      main: sumMoney(activeCredits.map(c => c.currentAmount)) > 0 ? this.ctx.fmt(sumMoney(activeCredits.map(c => c.currentAmount))) : '—',
      sub: countSub(activeCredits.length),
      mod: 'finance-stat-credit-active'
    });

    renderSummaryCard(summary, {
      icon: '✅', title: this.tr.paidCards,
      main: sumMoney(paidCredits.map(c => c.originalAmount)) > 0 ? this.ctx.fmt(sumMoney(paidCredits.map(c => c.originalAmount))) : '—',
      sub: countSub(paidCredits.length),
      mod: 'finance-stat-credit-paid'
    });
  }

  // ── Filters ──────────────────────────────────────────────────────────────

  private filterControls(): FilterControl[] {
    const f = this.ctx.state.creditFilter ?? (this.ctx.state.creditFilter = { ...DEFAULT_CREDIT_FILTER });
    return [
      {
        kind: 'search', label: this.tr.search, placeholder: this.tr.searchByName,
        get: () => f.search, set: v => { f.search = v; },
      },
      {
        kind: 'select', label: this.tr.status,
        options: [
          { value: 'all', label: this.tr.all },
          { value: 'active', label: this.tr.creditActive },
          { value: 'paid', label: this.tr.creditPaid },
        ],
        get: () => f.status, set: v => { f.status = v as typeof f.status; },
      },
      {
        kind: 'searchSelect', label: this.tr.bankName,
        options: () => [
          { value: '', label: this.tr.all },
          ...[...new Set((this.ctx.data?.credits ?? []).map(c => c.bankName).filter(Boolean))].map(b => ({ value: b, label: b })),
        ],
        get: () => f.bankName, set: v => { f.bankName = v; },
      },
      ...dateRangeControls(f, this.tr),
      {
        kind: 'select', label: this.tr.type,
        options: [
          { value: 'all', label: this.tr.allCreditTypes },
          { value: 'consumer', label: this.tr.creditTypeConsumer },
          { value: 'auto', label: this.tr.creditTypeAuto },
          { value: 'mortgage', label: this.tr.creditTypeMortgage },
        ],
        get: () => f.type, set: v => { f.type = v as typeof f.type; },
      },
    ];
  }

  private getFilteredCredits(): CreditRecord[] {
    if (!this.ctx.data) return [];
    const f = this.ctx.state.creditFilter ?? DEFAULT_CREDIT_FILTER;
    const s = this.ctx.state.creditSort ?? { field: 'date' as CreditSortField, dir: 'desc' as const };

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

    result.sort((a, b) => {
      let av: string | number, bv: string | number;
      if (s.field === 'amount') { av = a.currentAmount; bv = b.currentAmount; }
      else if (s.field === 'bankName') { av = a.bankName; bv = b.bankName; }
      else { av = a.startDate; bv = b.startDate; }
      return compareValues(av, bv, s.dir);
    });
    return result;
  }

  // ── Mobile card ──────────────────────────────────────────────────────────

  private renderCard(block: HTMLElement, credit: CreditRecord): void {
    block.addClass(credit.status === 'active' ? 'finance-row-income' : 'finance-row-expense');

    const details = [];
    details.push({ label: `📊`, value: `${credit.interestRate}${this.tr.percentPerAnnum}` });
    details.push({ label: `💰 ${this.tr.paymentLabel}:`, value: this.ctx.fmt(credit.monthlyPayment) });

    const paidCount = credit.payments.filter(p => p.status === 'paid').length;
    if (credit.payments.length > 0) {
      details.push({ label: `✅`, value: `${paidCount}/${credit.payments.length} ${this.tr.paymentsCount}` });
    }

    const endDate = this.calculateCreditEndDate(credit);
    if (endDate && credit.status === 'active') {
      details.push({ label: this.tr.dueBy, value: fmtDate(endDate) });
    }

    renderMobileCard(block, {
      amountText: '−' + this.ctx.fmt(credit.currentAmount),
      amountCls: 'finance-amount-expense',
      subtitle: `${credit.bankName} · ${this.typeLabel(credit)}`,
      details,
      note: credit.note,
    });
  }

  // ── Payments panel (expandable) ──────────────────────────────────────────

  private renderCreditPaymentsPanel(parent: HTMLElement, credit: CreditRecord): void {
    const wrapper = parent.createDiv('finance-payments-panel');
    const endDate = this.calculateCreditEndDate(credit);
    
    renderProgressBar(wrapper, credit.startDate, endDate, this.tr, fmtDate.bind(this.ctx));

    wrapper.createEl('h4', { text: this.tr.creditPayments, cls: 'finance-section-title' });

    if (!credit.payments.length) {
      wrapper.createEl('p', { text: this.tr.noScheduledPayments, cls: 'finance-empty-text' });
      return;
    }

    const totalPages = Math.max(1, Math.ceil(credit.payments.length / CREDIT_PAYMENT_PAGE_SIZE));
    let page = this.creditPaymentPages.get(credit.id);
    if (page === undefined) {
      const lastPaidIdx = credit.payments.findLastIndex(p => p.status === 'paid');
      page = lastPaidIdx >= 0 ? Math.floor(lastPaidIdx / CREDIT_PAYMENT_PAGE_SIZE) : 0;
    }
    page = Math.max(0, Math.min(page, totalPages - 1));
    this.creditPaymentPages.set(credit.id, page);

    renderPaginatedSchedule(
      wrapper,
      credit.payments,
      page,
      CREDIT_PAYMENT_PAGE_SIZE,
      ['#', this.tr.date, this.tr.sum, this.tr.status],
      this.ctx
    );

    if (totalPages > 1) {
      const pagNav = wrapper.createDiv('finance-pagination-nav finance-panel-pagination');
      const go = (newPage: number) => {
        this.creditPaymentPages.set(credit.id, newPage);
        parent.empty();
        this.renderCreditPaymentsPanel(parent, credit);
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



  private openNewCreditModal(): void {
    if (!this.ctx.data) { new Notice(this.tr.loading); return; }
    const allBanks = this.ctx.data.credits.map(c => c.bankName).filter(Boolean);
    new CreditModal(this.ctx.app, {
      title: this.tr.newCredit,
      banks: allBanks,
      pluginId: this.ctx.pluginId,
      records: [...this.ctx.data.records],
      onSave: async (credit) => {
        await this.commands.addCredit(
          credit,
          this.tr.creditDefaultCat,
          { receiptNote: this.tr.creditReceiptNote, paymentNote: this.tr.creditPaymentNote }
        );
        await this.reload(this.tr.creditAdded);
      },
    }).open();
  }

  private openEditCreditModal(credit: CreditRecord): void {
    if (!this.ctx.data) return;
    const allBanks = this.ctx.data.credits.map(c => c.bankName).filter(Boolean);
    new CreditModal(this.ctx.app, {
      title: this.tr.editRecord,
      credit,
      banks: allBanks,
      pluginId: this.ctx.pluginId,
      records: [...this.ctx.data.records],
      onSave: async (updated) => {
        await this.commands.updateCredit(
          updated,
          this.tr.creditDefaultCat,
          { receiptNote: this.tr.creditReceiptNote, paymentNote: this.tr.creditPaymentNote }
        );
        await this.reload(this.tr.creditUpdated);
      },
    }).open();
  }

  private openAddCreditPaymentModal(credit: CreditRecord): void {
    new CreditPaymentModal(this.ctx.app, {
      title: `💰 ${this.tr.paymentLabel} — ${credit.name}`,
      credit,
      onSave: async payment => {
        const breakdown = calculatePaymentBreakdown(credit.currentAmount, payment.amount, credit.interestRate);
        payment.principalPart = breakdown.principalPart;
        payment.interestPart = breakdown.interestPart;
        payment.remainingDebt = breakdown.remainingDebt;

        const updatedCredit = { ...credit, payments: [...credit.payments, payment] };
        updatedCredit.currentAmount = calculateRemainingPrincipal(updatedCredit);
        if (updatedCredit.currentAmount <= 0) updatedCredit.status = 'paid';

        await this.commands.updateCredit(
          updatedCredit,
          this.tr.creditDefaultCat,
          { receiptNote: this.tr.creditReceiptNote, paymentNote: this.tr.creditPaymentNote }
        );
        await this.reload(this.tr.creditPaymentRecorded);
      },
    }).open();
  }

  private openEarlyRepaymentModal(credit: CreditRecord): void {
    new CreditEarlyRepaymentModal(this.ctx.app, {
      title: `${this.tr.earlyRepayment} — ${credit.name}`,
      credit,
      currency: this.ctx.currency,
      onSave: async updated => {
        await this.commands.updateCredit(
          updated,
          this.tr.creditDefaultCat,
          { receiptNote: this.tr.creditReceiptNote, paymentNote: this.tr.creditPaymentNote }
        );
        await this.reload(this.tr.creditPaymentRecorded);
      },
    }).open();
  }

  private confirmDeleteCredit(credit: CreditRecord): void {
    const label = `${credit.name} · ${this.ctx.fmt(credit.currentAmount)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteCredit}\n${label}`, async () => {
      await this.commands.deleteCredit(credit.id);
      await this.reload(this.tr.creditDeleted);
    }).open();
  }
}
