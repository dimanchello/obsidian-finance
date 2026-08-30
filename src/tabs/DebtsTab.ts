import { fmtDate } from "../utils";
import { Notice } from 'obsidian';
import { ViewContext } from '../context';
import {
  DebtRecord, DebtMovement,
  DebtSortField, PLURAL_THRESHOLD,
  DEFAULT_DEBT_FILTER,
} from '../types';
import { DebtModal } from '../DebtModal';
import { DebtMovementModal } from '../DebtMovementModal';
import { ConfirmModal } from '../ConfirmModal';
import { sumMoney } from '../domain/money';
import { DataTable, FilterControl } from '../ui/DataTable';
import { renderMobileCard, renderSummaryCard, compareValues, dateRangeControls } from '../ui/tabHelpers';
import { getDebtOriginal, getDebtWithInterest, getDebtRemaining, isDebtPaidOff } from '../domain/debtCalculations';
import { AccountCommands } from '../domain/AccountCommands';

export class DebtsTab {
  private ctx: ViewContext;
  private el: HTMLElement;
  private table: DataTable<DebtRecord>;
  private commands: AccountCommands;
  onUpdate: (() => void) | null = null;

  private get tr() { return this.ctx.tr; }

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;
    this.commands = new AccountCommands(ctx.storage, ctx.accountId);

    this.table = new DataTable<DebtRecord>({
      ctx,
      items: () => this.getFilteredDebts(),
      itemId: d => d.id,
      hasAnyItems: () => (this.ctx.data?.debts.length ?? 0) > 0,
      columns: [
        {
          key: 'direction', label: this.tr.type,
          cell: d => ({
            text: d.direction === 'lent' ? this.tr.lent : this.tr.borrowed,
            cls: d.direction === 'lent' ? 'finance-dir-lent' : 'finance-dir-borrowed',
          }),
        },
        { key: 'person', label: this.tr.sortPerson, cell: d => ({ text: d.person || '—' }) },
        {
          key: 'original', label: this.tr.sum,
          cell: d => {
            const original = getDebtOriginal(d);
            const hasInterest = d.interestRate > 0;
            return {
              text: hasInterest
                ? `${this.ctx.fmt(original)} → ${this.ctx.fmt(getDebtWithInterest(d))} (${d.interestRate}%)`
                : this.ctx.fmt(original),
              cls: 'finance-amount-cell',
            };
          },
        },
        {
          key: 'remaining', label: this.tr.remaining,
          cell: d => {
            const remaining = getDebtRemaining(d);
            return {
              text: remaining > 0 ? this.ctx.fmt(remaining) : '—',
              cls: remaining > 0 ? 'finance-amount-cell finance-amount-remaining' : 'finance-amount-cell',
            };
          },
        },
        { key: 'date', label: this.tr.dateCreated, cell: d => ({ text: fmtDate(d.date) }) },
        {
          key: 'dueDate', label: this.tr.dueDate,
          cell: d => ({ text: d.dueDate ? fmtDate(d.dueDate) : '—', cls: d.dueDate ? 'finance-due-date' : '' }),
        },
      ],
      rowCls: d => [
        'finance-debt-row',
        d.direction === 'lent' ? 'finance-debt-lent' : 'finance-debt-borrowed',
        isDebtPaidOff(d) ? 'finance-debt-paid' : 'finance-debt-unpaid',
      ],
      rowActions: d => [
        { icon: '💰', title: this.tr.repay, onClick: () => this.openRepayModal(d) },
        { icon: '➕', title: this.tr.borrowMore, onClick: () => this.openBorrowMoreModal(d) },
        { icon: '✏️', title: this.tr.edit, onClick: () => this.openEditDebtModal(d) },
        { icon: '🗑️', title: this.tr.delete, onClick: () => this.confirmDeleteDebt(d), cls: 'finance-delete-btn' },
      ],
      expandable: {
        hasContent: d => d.movements.length > 0,
        toggleLabel: d => `📋 ${this.tr.movementHistory} (${d.movements.length})`,
        render: (host, d) => this.renderDebtMovementsPanel(host, d),
      },
      actionsPosition: 'above',
      renderCard: (block, d) => this.renderCard(block, d),
      filterControls: () => this.filterControls(),
      sortFields: [
        { field: 'date', label: this.tr.sortDate },
        { field: 'amount', label: this.tr.sum },
        { field: 'person', label: this.tr.sortPerson },
      ],
      state: {
        getPage: () => this.ctx.state.debtPage ?? 0,
        setPage: p => { this.ctx.state.debtPage = p; },
        getSort: () => this.ctx.state.debtSort ?? { field: 'date', dir: 'desc' },
        setSort: s => { this.ctx.state.debtSort = s as { field: DebtSortField; dir: 'asc' | 'desc' }; },
        resetFilter: () => { this.ctx.state.debtFilter = { ...DEFAULT_DEBT_FILTER }; },
        getColumns: () => this.ctx.state.debtsColumns ?? {},
        setColumns: cols => { this.ctx.state.debtsColumns = cols; },
        getExpandedId: () => this.ctx.state.debtExpandedId ?? null,
        setExpandedId: id => { if (id === null) delete this.ctx.state.debtExpandedId; else this.ctx.state.debtExpandedId = id; }
      },
      renderStats: host => this.renderStats(host),
      emptyState: { icon: '💳', title: this.tr.noDebts, subtitle: this.tr.addNewDebt },
      emptyFiltered: { icon: '🔍', title: this.tr.noDebtsFiltered, subtitle: this.tr.tryChangeFilters },
      onBulkDelete: async ids => {
        await this.commands.deleteDebts(ids);
        await this.reload(this.tr.deleted);
      },
      confirmBulkDeleteText: count => this.tr.confirmDeleteSelectedDebts.replace('{count}', String(count)),
      onFilterChange: () => {},
      rerender: () => this.render(),
    });
  }

  public renderHeaderActions(container: HTMLElement): void {
    const newDebtBtn = container.createEl('button', { cls: 'finance-add-btn finance-accent-btn' });
    newDebtBtn.createEl('span', { text: '＋', cls: 'btn-icon' });
    newDebtBtn.createEl('span', { text: this.tr.newDebt });
    newDebtBtn.addEventListener('click', () => this.openNewDebtModal());
  }

  render(): void {
    if (this.ctx.state.debtSort?.field === 'createdAt' as DebtSortField) {
      this.ctx.state.debtSort = { field: 'date', dir: 'desc' };
      this.ctx.saveState();
    }
    this.ctx.state.debtFilter ??= { ...DEFAULT_DEBT_FILTER };
    this.el.empty();
    this.table.render(this.el);
  }

  update(): void {
    this.render();
  }

  // Helpers removed, using src/domain/debtCalculations.ts instead

  // ── Stats: records stats + lent/borrowed summary ────────────────────────

  private renderStats(host: HTMLElement): void {
    this.ctx.renderRecordsStats(host);

    const allDebts = this.ctx.data?.debts ?? [];
    const summary = host.createDiv('finance-stats-container finance-stats-two-cols');

    const lentDebts = allDebts.filter(d => d.direction === 'lent');
    const borrowedDebts = allDebts.filter(d => d.direction !== 'lent');
    const remainingOf = (debts: DebtRecord[]) =>
      sumMoney(debts.map(d => getDebtRemaining(d)));

    const countSub = (count: number) => `${count} ${count === 1 ? this.tr.debtCount_one : count < PLURAL_THRESHOLD ? this.tr.debtCount_few : this.tr.debtCount_many}`;

    renderSummaryCard(summary, {
      icon: '💸', title: this.tr.lent,
      main: remainingOf(lentDebts) > 0 ? this.ctx.fmt(remainingOf(lentDebts)) : '—',
      sub: countSub(lentDebts.length),
      mod: 'finance-stat-lent-summary'
    });

    renderSummaryCard(summary, {
      icon: '💳', title: this.tr.borrowed,
      main: remainingOf(borrowedDebts) > 0 ? this.ctx.fmt(remainingOf(borrowedDebts)) : '—',
      sub: countSub(borrowedDebts.length),
      mod: 'finance-stat-borrowed-summary'
    });
  }

  // ── Filters ──────────────────────────────────────────────────────────────

  private filterControls(): FilterControl[] {
    const f = this.ctx.state.debtFilter ?? (this.ctx.state.debtFilter = { ...DEFAULT_DEBT_FILTER });
    return [
      {
        kind: 'search', label: this.tr.search, placeholder: this.tr.searchAllFields,
        get: () => f.search, set: v => { f.search = v; },
      },
      {
        kind: 'select', label: this.tr.status,
        options: [
          { value: 'all', label: this.tr.all },
          { value: 'unpaid', label: this.tr.unpaid },
          { value: 'paid', label: this.tr.paid },
        ],
        get: () => f.status, set: v => { f.status = v as typeof f.status; },
      },
      {
        kind: 'select', label: this.tr.direction,
        options: [
          { value: 'all', label: this.tr.all },
          { value: 'lent', label: this.tr.lent },
          { value: 'borrowed', label: this.tr.borrowed },
        ],
        get: () => f.direction, set: v => { f.direction = v as typeof f.direction; },
      },
      ...dateRangeControls(f, this.tr),
      {
        kind: 'searchSelect', label: this.tr.person,
        options: () => [
          { value: '', label: this.tr.all },
          ...[...new Set((this.ctx.data?.debts ?? []).map(d => d.person).filter(Boolean))].map(p => ({ value: p, label: p })),
        ],
        get: () => f.person, set: v => { f.person = v; },
      },
    ];
  }

  private getFilteredDebts(): DebtRecord[] {
    if (!this.ctx.data) return [];
    const f = this.ctx.state.debtFilter ?? DEFAULT_DEBT_FILTER;
    const s = this.ctx.state.debtSort ?? { field: 'date' as DebtSortField, dir: 'desc' as const };
    const q = f.search.toLowerCase();

    const rows = this.ctx.data.debts.filter(d => {
      if (f.status === 'paid' && !isDebtPaidOff(d)) return false;
      if (f.status === 'unpaid' && isDebtPaidOff(d)) return false;
      if (f.direction !== 'all' && d.direction !== f.direction) return false;
      if (f.dateFrom && d.date < f.dateFrom) return false;
      if (f.dateTo && d.date > f.dateTo) return false;
      if (f.person && !d.person.toLowerCase().includes(f.person.toLowerCase())) return false;
      if (q) {
        const hay = [d.person, d.note, String(d.amount)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return rows.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (s.field) {
        case 'amount': av = getDebtRemaining(a); bv = getDebtRemaining(b); break;
        case 'person': av = a.person; bv = b.person; break;
        default: av = a.date; bv = b.date;
      }
      return compareValues(av, bv, s.dir);
    });
  }

  // ── Movements panel (expandable) ─────────────────────────────────────────

  private renderDebtMovementsPanel(parent: HTMLElement, debt: DebtRecord): void {
    const scrollWrapper = parent.createDiv('finance-mov-scroll finance-mov-panel');
    const movTable = scrollWrapper.createEl('table', { cls: 'finance-mov-table' });
    const movHead = movTable.createEl('thead').createEl('tr');
    [this.tr.type, this.tr.sum, this.tr.date, this.tr.note, ''].forEach(l => {
      movHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
    });
    const movBody = movTable.createEl('tbody');
    const isLent = debt.direction === 'lent';
    debt.movements.forEach(m => {
      const mr = movBody.createEl('tr', { cls: `finance-mov-${m.type}` });
      const typeLabel = m.type === 'borrow'
        ? (isLent ? this.tr.gaveMore : this.tr.tookMore)
        : (isLent ? this.tr.returned : this.tr.repaymentAct);
      mr.createEl('td', { text: typeLabel, cls: 'finance-td' });
      mr.createEl('td', {
        text: (m.type === 'borrow' ? '−' : '+') + this.ctx.fmt(m.amount),
        cls: `finance-td finance-td-mov-${m.type}`,
      });
      mr.createEl('td', { text: fmtDate(m.date, m.time), cls: 'finance-td' });
      mr.createEl('td', { text: m.note || '—', cls: 'finance-td' });
      const atd = mr.createEl('td', { cls: 'finance-td finance-actions-td' });
      const mkBtn = (icon: string, title: string, onClick: () => void, extra = '') => {
        const btn = atd.createEl('button', { cls: 'finance-action-btn', text: icon });
        if (extra) btn.addClass(extra);
        btn.title = title;
        btn.addEventListener('click', onClick);
      };
      mkBtn('✏️', this.tr.edit, () => this.openEditMovementModal(debt, m));
      mkBtn('🗑️', this.tr.delete, () => this.confirmDeleteMovement(debt, m), 'finance-delete-btn');
    });
  }

  // ── Mobile card ──────────────────────────────────────────────────────────

  private renderCard(block: HTMLElement, debt: DebtRecord): void {
    block.addClass(debt.direction === 'lent' ? 'finance-row-income' : 'finance-row-expense');
    
    const remaining = getDebtRemaining(debt);
    const original = getDebtOriginal(debt);
    const withInterest = getDebtWithInterest(debt);
    const hasInterest = debt.interestRate > 0;

    const details = [];
    details.push({
      label: `💰 ${hasInterest ? this.tr.withInterest : this.tr.sum}:`,
      value: hasInterest ? `${this.ctx.fmt(original)} → ${this.ctx.fmt(withInterest)}` : this.ctx.fmt(original),
    });
    if (remaining > 0) details.push({ label: `📉 ${this.tr.remaining}:`, value: this.ctx.fmt(remaining) });
    if (debt.dueDate) details.push({ label: `📅 ${this.tr.dueBy}`, value: fmtDate(debt.dueDate) });
    if (hasInterest) details.push({ label: `📊`, value: `${debt.interestRate}%` });

    renderMobileCard(block, {
      amountText: this.ctx.fmt(remaining),
      amountCls: debt.direction === 'lent' ? 'finance-amount-income' : 'finance-amount-expense',
      subtitle: `${debt.person || '—'} · ${debt.direction === 'lent' ? this.tr.lent : this.tr.borrowed}`,
      details,
      note: debt.note,
    });
  }

  // ── Reload helper ────────────────────────────────────────────────────────

  private async reload(notice: string): Promise<void> {
    this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
    this.onUpdate?.();
    new Notice(notice);
  }

  // ── Modals ──────────────────────────────────────────────────────────────

  private openNewDebtModal(): void {
    if (!this.ctx.data) { new Notice(this.tr.loading); return; }
    new DebtModal(this.ctx.app, {
      title: this.tr.addNewDebt,
      allPersons: this.ctx.data.payers,
      onSave: async debt => {
        const initialMovement: DebtMovement = {
          id: crypto.randomUUID(),
          type: 'borrow',
          amount: debt.amount,
          date: debt.date,
          time: debt.time,
          createdAt: debt.createdAt,
          note: debt.direction === 'lent' ? this.tr.lentGiven : this.tr.borrowedTaken,
        };
        await this.commands.addDebt(
          debt,
          initialMovement,
          this.tr.debtDefaultCat,
          { lentNote: this.tr.debtLentNote, borrowedNote: this.tr.debtBorrowedNote }
        );
        await this.reload(this.tr.debtAdded);
      },
    }).open();
  }

  private openEditDebtModal(debt: DebtRecord): void {
    if (!this.ctx.data) return;
    const unique = [...new Set(this.ctx.data.payers.concat(this.ctx.data.debts.map(d => d.person)))];
    new DebtModal(this.ctx.app, {
      title: this.tr.editRecord,
      debt,
      allPersons: unique,
      onSave: async updated => {
        await this.ctx.storage.updateDebt(this.ctx.accountId, updated);
        await this.reload(this.tr.debtUpdated);
      },
    }).open();
  }

  private openRepayModal(debt: DebtRecord): void {
    new DebtMovementModal(this.ctx.app, {
      title: `${this.tr.repaymentAct} — ${debt.person}`,
      type: 'repay',
      remainingAmount: getDebtRemaining(debt),
      currency: this.ctx.currency,
      onSave: async mov => {
        await this.commands.addDebtMovement(
          debt.id,
          mov,
          this.tr.debtDefaultCat,
          `${this.tr.debtRepayNote}: ${debt.person}`
        );
        await this.reload(this.tr.repaymentRecorded);
      },
    }).open();
  }

  private openBorrowMoreModal(debt: DebtRecord): void {
    new DebtMovementModal(this.ctx.app, {
      title: `${this.tr.borrowMore} — ${debt.person}`,
      type: 'borrow',
      onSave: async mov => {
        await this.commands.addDebtMovement(
          debt.id,
          mov,
          this.tr.debtDefaultCat,
          `${this.tr.debtBorrowMoreNote}: ${debt.person}`
        );
        await this.reload(this.tr.debtAmountIncreased);
      },
    }).open();
  }

  private openEditMovementModal(debt: DebtRecord, mov: DebtMovement): void {
    new DebtMovementModal(this.ctx.app, {
      title: `${this.tr.editMovement} — ${debt.person}`,
      type: mov.type,
      movement: mov,
      currency: this.ctx.currency,
      onSave: async updated => {
        await this.commands.updateDebtMovement(debt.id, mov, updated);
        await this.reload(this.tr.debtUpdated);
      },
    }).open();
  }

  private confirmDeleteMovement(debt: DebtRecord, mov: DebtMovement): void {
    const label = `${mov.type === 'borrow' ? '−' : '+'}${this.ctx.fmt(mov.amount)}  ·  ${fmtDate(mov.date, mov.time)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteMovement}\n${label}`, async () => {
      await this.commands.deleteDebtMovement(debt.id, mov.id, mov.date, mov.amount);
      await this.reload(this.tr.debtDeleted);
    }).open();
  }

  private confirmDeleteDebt(debt: DebtRecord): void {
    const label = `${debt.person} · ${this.ctx.fmt(debt.amount)} · ${fmtDate(debt.date, debt.time)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteDebt}\n${label}`, async () => {
      await this.commands.deleteDebt(debt.id);
      await this.reload(this.tr.debtDeleted);
    }).open();
  }
}
