import { Notice } from 'obsidian';
import { ViewContext } from '../context';
import {
  CreditRecord, FinanceRecord,
  CreditSortField, PLURAL_THRESHOLD, PERCENT_100,
  DEFAULT_CREDIT_FILTER, CREDIT_PAYMENT_PAGE_SIZE, PAGE_RANGE_THRESHOLD,
} from '../types';
import { CreditModal } from '../CreditModal';
import { CreditPaymentModal } from '../CreditPaymentModal';
import { CreditEarlyRepaymentModal } from '../CreditEarlyRepaymentModal';
import { ConfirmModal } from '../ConfirmModal';
import { getTodayStr, getTodayTime } from '../utils';
import { addMonthsClamped, daysBetweenStr } from '../domain/dateMath';
import { round2, sumMoney } from '../domain/money';
import { DataTable, FilterControl } from '../ui/DataTable';
import { CreditsAnalyticsView } from '../CreditsAnalyticsView';

export class CreditsTab {
  private ctx: ViewContext;
  private el: HTMLElement;
  private table: DataTable<CreditRecord>;
  private creditPaymentPages = new Map<string, number>();

  private get tr() { return this.ctx.tr; }

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;

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
        { key: 'date', label: this.tr.opened, cell: c => ({ text: this.ctx.fmtDate(c.startDate) }) },
        {
          key: 'endDate', label: this.tr.endDate,
          cell: c => {
            const endDate = this.calculateCreditEndDate(c);
            return { text: endDate ? this.ctx.fmtDate(endDate) : '—', cls: endDate ? 'finance-due-date' : '' };
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
      },
      renderStats: host => this.renderStats(host),
      toolbarButtons: (toolbar, rerender) => {
        const btn = toolbar.createEl('button', { cls: 'finance-add-btn finance-accent-btn' });
        btn.createEl('span', { text: '＋', cls: 'btn-icon' });
        btn.createEl('span', { text: this.tr.newCredit });
        btn.addEventListener('click', () => this.openNewCreditModal());

        const open = (this.ctx.state.creditActiveTab ?? 'list') === 'analytics';
        const toggleBtn = toolbar.createEl('button', {
          cls: `finance-analytics-toggle-btn${open ? ' active' : ''}`,
          text: `📈 ${this.tr.analytics} ${open ? '▲' : '▼'}`,
        });
        toggleBtn.addEventListener('click', () => {
          this.ctx.state.creditActiveTab = open ? 'list' : 'analytics';
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
        const idSet = new Set(ids);
        const dpRecordIds = new Set(
          (this.ctx.data?.credits ?? [])
            .filter(c => idSet.has(c.id) && c.downPaymentRecordId)
            .map(c => c.downPaymentRecordId!),
        );
        await this.ctx.storage.deleteCreditsBatch(this.ctx.accountId, ids);
        const otherRecords = this.ctx.data!.records.filter(r =>
          (!r.linkedId || !idSet.has(r.linkedId)) && !dpRecordIds.has(r.id));
        await this.ctx.storage.saveAllRecords(this.ctx.accountId, otherRecords);
        await this.reload(this.tr.deleted);
      },
      confirmBulkDeleteText: count => this.tr.confirmDeleteSelectedCredits.replace('{count}', String(count)),
      onFilterChange: () => {},
      rerender: () => this.render(),
    });
  }

  render(): void {
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

    const mkCard = (title: string, icon: string, amount: number, count: number, isActive: boolean) => {
      const card = summary.createDiv(`finance-stat-card finance-stat-${isActive ? 'credit-active' : 'credit-paid'}`);
      const header = card.createDiv('finance-debt-summary-header');
      header.createEl('span', { text: icon, cls: 'finance-debt-summary-icon' });
      header.createEl('span', { text: title, cls: 'finance-debt-summary-title' });
      const content = card.createDiv('finance-debt-summary-content');
      content.createEl('div', { text: amount > 0 ? this.ctx.fmt(amount) : '—', cls: 'finance-debt-summary-main' });
      content.createEl('div', {
        text: `${count} ${count === 1 ? this.tr.creditCount_one : count < PLURAL_THRESHOLD ? this.tr.creditCount_few : this.tr.creditCount_many}`,
        cls: 'finance-debt-summary-sub',
      });
    };

    mkCard(this.tr.activeCards, '💳', sumMoney(activeCredits.map(c => c.currentAmount)), activeCredits.length, true);
    mkCard(this.tr.paidCards, '✅', sumMoney(paidCredits.map(c => c.originalAmount)), paidCredits.length, false);
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
      { kind: 'date', label: this.tr.from, get: () => f.dateFrom, set: v => { f.dateFrom = v; } },
      { kind: 'date', label: this.tr.to, get: () => f.dateTo, set: v => { f.dateTo = v; } },
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
      let cmp = 0;
      if (s.field === 'amount') cmp = a.currentAmount - b.currentAmount;
      else if (s.field === 'bankName') cmp = a.bankName.localeCompare(b.bankName);
      else cmp = a.startDate.localeCompare(b.startDate);
      return s.dir === 'asc' ? cmp : -cmp;
    });
    return result;
  }

  // ── Mobile card ──────────────────────────────────────────────────────────

  private renderCard(block: HTMLElement, credit: CreditRecord): void {
    block.addClass(credit.status === 'active' ? 'finance-row-income' : 'finance-row-expense');

    const header = block.createDiv('finance-record-header');
    header.createEl('span', {
      text: '−' + this.ctx.fmt(credit.currentAmount),
      cls: 'finance-record-amount finance-amount-expense',
    });
    header.createEl('span', { text: `${credit.bankName} · ${this.typeLabel(credit)}`, cls: 'finance-record-date' });

    const details = block.createDiv('finance-record-details');
    details.createEl('span', { text: `📊 ${credit.interestRate}${this.tr.percentPerAnnum}`, cls: 'finance-record-detail' });
    details.createEl('span', { text: `💰 ${this.tr.paymentLabel}: ${this.ctx.fmt(credit.monthlyPayment)}`, cls: 'finance-record-detail' });

    const paidCount = credit.payments.filter(p => p.status === 'paid').length;
    if (credit.payments.length > 0) {
      details.createEl('span', { text: `✅ ${paidCount}/${credit.payments.length} ${this.tr.paymentsCount}`, cls: 'finance-record-detail' });
    }

    const endDate = this.calculateCreditEndDate(credit);
    if (endDate && credit.status === 'active') {
      details.createEl('span', { text: `${this.tr.dueBy} ${this.ctx.fmtDate(endDate)}`, cls: 'finance-record-detail' });
    }

    if (credit.note) {
      block.createEl('div', { text: credit.note, cls: 'finance-record-note' });
    }
  }

  // ── Payments panel (expandable) ──────────────────────────────────────────

  private renderCreditPaymentsPanel(parent: HTMLElement, credit: CreditRecord): void {
    const wrapper = parent.createDiv('finance-payments-panel');
    const today = getTodayStr();

    const endDate = this.calculateCreditEndDate(credit);
    if (credit.startDate && endDate && credit.startDate < endDate) {
      const totalDays = daysBetweenStr(credit.startDate, endDate);
      const elapsedDays = daysBetweenStr(credit.startDate, today);
      const progress = Math.min(PERCENT_100, Math.max(0, (elapsedDays / totalDays) * PERCENT_100));

      const progressWrap = wrapper.createDiv('finance-deposit-progress');
      const progressLabel = progressWrap.createDiv('finance-deposit-progress-label');
      progressLabel.textContent = `${this.ctx.fmtDate(credit.startDate)} → ${this.ctx.fmtDate(endDate)} (${Math.round(progress)}%)`;

      const progressBar = progressWrap.createDiv('finance-deposit-progress-bar');
      const progressFill = progressBar.createDiv('finance-deposit-progress-fill');
      progressFill.style.setProperty('--ft-progress', `${progress}%`);
      if (progress >= PERCENT_100) progressFill.addClass('is-complete');
    }

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
    const start = page * CREDIT_PAYMENT_PAGE_SIZE;
    const pagePayments = credit.payments.slice(start, start + CREDIT_PAYMENT_PAGE_SIZE);

    const scrollWrapper = wrapper.createDiv('finance-mov-scroll');
    const movTable = scrollWrapper.createEl('table', { cls: 'finance-mov-table' });
    const movHead = movTable.createEl('thead').createEl('tr');
    ['#', this.tr.date, this.tr.sum, this.tr.status].forEach(l => {
      movHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
    });
    const movBody = movTable.createEl('tbody');

    pagePayments.forEach((p, idx) => {
      const isPaid = p.status === 'paid' || p.dueDate <= today;
      const mr = movBody.createEl('tr', { cls: isPaid ? 'finance-payment-paid' : 'finance-payment-pending' });
      mr.createEl('td', { text: String(start + idx + 1), cls: 'finance-td' });
      mr.createEl('td', { text: this.ctx.fmtDate(p.dueDate), cls: 'finance-td' });
      mr.createEl('td', { text: this.ctx.fmt(p.amount), cls: 'finance-td' });
      mr.createEl('td', { text: isPaid ? this.tr.paidStatus : this.tr.pendingStatus, cls: 'finance-td finance-payment-status' });
    });

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

  // ── Modals ──────────────────────────────────────────────────────────────

  private nowTime(): string {
    return getTodayTime();
  }

  private openNewCreditModal(): void {
    if (!this.ctx.data) { new Notice(this.tr.loading); return; }
    const allBanks = this.ctx.data.credits.map(c => c.bankName).filter(Boolean);
    new CreditModal(this.ctx.app, {
      title: this.tr.newCredit,
      banks: allBanks,
      records: [...this.ctx.data.records],
      onSave: async (credit, updatedRecords) => {
        await this.ctx.storage.addCredit(this.ctx.accountId, credit);
        const nowTime = this.nowTime();
        if (!credit.isEscrow) {
          updatedRecords.push({
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            date: credit.startDate,
            time: nowTime,
            type: 'income',
            amount: credit.originalAmount,
            category: this.tr.creditDefaultCat,
            tag: '',
            payer: credit.bankName,
            note: `${this.tr.creditReceiptNote} "${credit.name}"`,
            attachmentPath: '',
            linkedId: credit.id,
          });
        }
        for (const payment of credit.payments) {
          if (payment.status === 'paid') {
            updatedRecords.push({
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              date: payment.dueDate,
              time: nowTime,
              type: 'expense',
              amount: payment.amount,
              category: this.tr.creditDefaultCat,
              tag: '',
              payer: credit.bankName,
              note: `${this.tr.creditPaymentNote} "${credit.name}"`,
              attachmentPath: '',
              linkedId: credit.id,
            });
          }
        }
        await this.ctx.storage.saveAllRecords(this.ctx.accountId, updatedRecords);
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
      records: [...this.ctx.data.records],
      onSave: async (updated, updatedRecords) => {
        await this.ctx.storage.updateCredit(this.ctx.accountId, updated);
        const nowTime = this.nowTime();

        const receiptRec = updatedRecords.find(r => r.linkedId === updated.id && r.type === 'income');
        if (updated.isEscrow) {
          if (receiptRec) {
            updatedRecords.splice(updatedRecords.indexOf(receiptRec), 1);
          }
        } else if (receiptRec) {
          receiptRec.amount = updated.originalAmount;
          receiptRec.date = updated.startDate;
          receiptRec.payer = updated.bankName;
          receiptRec.note = `${this.tr.creditReceiptNote} "${updated.name}"`;
        } else {
          updatedRecords.push({
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            date: updated.startDate,
            time: nowTime,
            type: 'income',
            amount: updated.originalAmount,
            category: this.tr.creditDefaultCat,
            tag: '',
            payer: updated.bankName,
            note: `${this.tr.creditReceiptNote} "${updated.name}"`,
            attachmentPath: '',
            linkedId: updated.id,
          });
        }

        for (const payment of updated.payments) {
          if (payment.status !== 'paid') continue;
          const existingRec = updatedRecords.find(r =>
            r.linkedId === updated.id && r.date === payment.dueDate && r.type === 'expense');
          if (existingRec) {
            if (existingRec.amount !== payment.amount) existingRec.amount = payment.amount;
          } else {
            updatedRecords.push({
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              date: payment.dueDate,
              time: nowTime,
              type: 'expense',
              amount: payment.amount,
              category: this.tr.creditDefaultCat,
              tag: '',
              payer: updated.bankName,
              note: `${this.tr.creditPaymentNote} "${updated.name}"`,
              attachmentPath: '',
              linkedId: updated.id,
            });
          }
        }
        await this.ctx.storage.saveAllRecords(this.ctx.accountId, updatedRecords);
        await this.reload(this.tr.creditUpdated);
      },
    }).open();
  }

  private openAddCreditPaymentModal(credit: CreditRecord): void {
    new CreditPaymentModal(this.ctx.app, {
      title: `💰 ${this.tr.paymentLabel} — ${credit.name}`,
      credit,
      onSave: async payment => {
        const updatedCredit = { ...credit, payments: [...credit.payments, payment] };
        const paidAmount = sumMoney(updatedCredit.payments.filter(p => p.status === 'paid').map(p => p.amount));
        const totalToPay = round2(updatedCredit.monthlyPayment * updatedCredit.termMonths);
        updatedCredit.currentAmount = Math.max(0, round2(totalToPay - paidAmount));
        if (paidAmount >= totalToPay) updatedCredit.status = 'paid';
        await this.ctx.storage.updateCredit(this.ctx.accountId, updatedCredit);

        const rec: FinanceRecord = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          date: payment.dueDate,
          time: '',
          type: 'expense',
          amount: payment.amount,
          category: this.tr.creditDefaultCat,
          tag: '',
          payer: updatedCredit.bankName,
          note: `${this.tr.creditPaymentNote} "${updatedCredit.name}"`,
          attachmentPath: '',
          isInternal: false,
          linkedId: updatedCredit.id,
        };
        await this.ctx.storage.addRecord(this.ctx.accountId, rec);
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
        await this.ctx.storage.updateCredit(this.ctx.accountId, updated);
        await this.reload(this.tr.creditPaymentRecorded);
      },
    }).open();
  }

  private confirmDeleteCredit(credit: CreditRecord): void {
    const label = `${credit.name} · ${this.ctx.fmt(credit.currentAmount)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteCredit}\n${label}`, async () => {
      await this.ctx.storage.deleteCredit(this.ctx.accountId, credit.id);
      let recs = this.ctx.data!.records.filter(r => r.linkedId !== credit.id);
      if (credit.downPaymentRecordId) {
        recs = recs.filter(r => r.id !== credit.downPaymentRecordId);
      }
      await this.ctx.storage.saveAllRecords(this.ctx.accountId, recs);
      await this.reload(this.tr.creditDeleted);
    }).open();
  }
}
