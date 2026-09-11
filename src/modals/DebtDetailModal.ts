import { App, Notice } from 'obsidian';
import { FinanceBaseModal } from '../ui/FinanceBaseModal';
import { ViewContext } from '../context';
import { DebtRecord, DebtMovement } from '../types';
import { DebtDirection, DebtMovementType } from '../constants';
import {
  getDebtOriginal,
  getDebtWithInterest,
  getDebtRemaining,
  isDebtPaidOff,
} from '../domain/debtCalculations';
import { fmtDate } from '../utils';
import { AccountCommands } from '../domain/AccountCommands';
import { DebtMovementModal } from '../DebtMovementModal';
import { ConfirmModal } from '../ConfirmModal';
import type { Translations } from '../i18n';

export interface DebtDetailModalOptions {
  ctx: ViewContext;
  debt: DebtRecord;
  person: string;
  onNavigateToDebts?: (() => void) | undefined;
  onDebtUpdated?: (() => void) | undefined;
}

export class DebtDetailModal extends FinanceBaseModal {
  protected tr: Translations;
  private ctx: ViewContext;
  private opts: DebtDetailModalOptions;
  private debt: DebtRecord;
  private commands: AccountCommands;
  private bodyContainer!: HTMLElement;

  constructor(app: App, opts: DebtDetailModalOptions) {
    super(app);
    this.opts = opts;
    this.ctx = opts.ctx;
    this.tr = opts.ctx.tr;
    this.debt = opts.debt;
    this.commands = new AccountCommands(opts.ctx.storage, opts.ctx.accountId);
  }

  override onOpen(): void {
    this.modalEl.addClass('finance-debt-detail-modal');
    this.openHeader(this.opts.person || this.debt.person || this.tr.debts);

    this.bodyContainer = this.contentEl.createDiv('finance-debt-detail-body');
    this.renderContent();

    this.renderFooterButtons();
  }

  private renderContent(): void {
    this.bodyContainer.empty();

    const isLent = this.debt.direction === DebtDirection.LENT;
    const remaining = getDebtRemaining(this.debt);
    const original = getDebtOriginal(this.debt);
    const withInterest = getDebtWithInterest(this.debt);
    const hasInterest = this.debt.interestRate > 0;
    const isPaid = isDebtPaidOff(this.debt);

    // Subtitle
    this.bodyContainer.createEl('div', {
      text: `${isLent ? this.tr.lent : this.tr.borrowed} · ${isPaid ? this.tr.overviewDebtsPaid : this.tr.unpaid}${hasInterest ? ` · ${this.debt.interestRate}%` : ''}`,
      cls: 'finance-modal-subtitle',
    });

    // Stat cards
    const statBar = this.bodyContainer.createDiv('finance-modal-stat-bar');

    const addStatPill = (label: string, valStr: string, modCls: string) => {
      const pill = statBar.createDiv(`finance-modal-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-modal-stat-label' });
      pill.createDiv({ text: valStr, cls: 'finance-modal-stat-val' });
    };

    addStatPill(this.tr.overviewInitialAmount, this.ctx.fmt(original), 'finance-stat-neutral');
    if (hasInterest) {
      addStatPill(this.tr.withInterest, this.ctx.fmt(withInterest), 'finance-stat-neutral');
    }
    addStatPill(
      this.tr.remaining,
      this.ctx.fmt(remaining),
      remaining > 0 ? (isLent ? 'finance-stat-income' : 'finance-stat-expense') : 'finance-stat-positive'
    );
    if (this.debt.dueDate) {
      addStatPill(this.tr.dueDate, fmtDate(this.debt.dueDate), 'finance-stat-neutral');
    }

    // Movements panel
    const movementsWrapper = this.bodyContainer.createDiv('finance-payments-panel');
    movementsWrapper.createEl('h4', { text: this.tr.movementHistory, cls: 'finance-section-title' });

    if (this.debt.movements.length === 0) {
      movementsWrapper.createEl('p', { text: this.tr.noRecords, cls: 'finance-empty-text' });
      return;
    }

    const scrollWrapper = movementsWrapper.createDiv('finance-mov-scroll');
    const movTable = scrollWrapper.createEl('table', { cls: 'finance-mov-table' });
    const movHead = movTable.createEl('thead').createEl('tr');
    [this.tr.type, this.tr.sum, this.tr.date, this.tr.note, ''].forEach(l => {
      movHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
    });

    const movBody = movTable.createEl('tbody');
    this.debt.movements.slice().reverse().forEach(m => {
      const mr = movBody.createEl('tr', { cls: `finance-mov-${m.type}` });
      const typeLabel = m.type === DebtMovementType.BORROW
        ? (isLent ? this.tr.gaveMore : this.tr.tookMore)
        : (isLent ? this.tr.returned : this.tr.repaymentAct);
      mr.createEl('td', { text: typeLabel, cls: 'finance-td' });
      mr.createEl('td', {
        text: (m.type === DebtMovementType.BORROW ? '−' : '+') + this.ctx.fmt(m.amount),
        cls: `finance-td finance-td-mov-${m.type}`,
      });
      mr.createEl('td', { text: fmtDate(m.date, m.time), cls: 'finance-td' });
      mr.createEl('td', { text: m.note || '—', cls: 'finance-td' });

      const actTd = mr.createEl('td', { cls: 'finance-td finance-actions-td' });
      const delBtn = actTd.createEl('button', { cls: 'finance-action-btn finance-delete-btn', text: '🗑️' });
      delBtn.title = this.tr.delete;
      delBtn.addEventListener('click', () => this.confirmDeleteMovement(m));
    });
  }

  private renderFooterButtons(): void {
    const btnsWrap = this.contentEl.createDiv('finance-modal-btns finance-overview-modal-btns');

    const leftGroup = btnsWrap.createDiv('finance-modal-actions-left');
    const isLent = this.debt.direction === DebtDirection.LENT;
    const isPaid = isDebtPaidOff(this.debt);

    if (!isPaid) {
      const repayBtn = leftGroup.createEl('button', {
        text: isLent ? this.tr.returned : this.tr.repaymentAct,
        cls: 'finance-btn-secondary',
      });
      repayBtn.addEventListener('click', () => this.openRepayModal());

      const borrowBtn = leftGroup.createEl('button', {
        text: isLent ? this.tr.gaveMore : this.tr.borrowMore,
        cls: 'finance-btn-secondary',
      });
      borrowBtn.addEventListener('click', () => this.openBorrowMoreModal());
    }

    if (this.opts.onNavigateToDebts) {
      const navBtn = leftGroup.createEl('button', {
        text: `↗️ ${this.tr.overviewOpenInDebtsTab}`,
        cls: 'finance-btn-secondary',
      });
      navBtn.addEventListener('click', () => {
        this.close();
        this.opts.onNavigateToDebts?.();
      });
    }

    const closeBtn = btnsWrap.createEl('button', {
      text: this.tr.close,
      cls: 'finance-btn-cancel',
    });
    closeBtn.addEventListener('click', () => this.close());
  }

  private openRepayModal(): void {
    new DebtMovementModal(this.ctx.app, {
      title: `${this.tr.repaymentAct} — ${this.debt.person}`,
      type: DebtMovementType.REPAY,
      remainingAmount: getDebtRemaining(this.debt),
      currency: this.ctx.currency,
      onSave: async mov => {
        await this.commands.addDebtMovement(
          this.debt.id,
          mov,
          this.tr.debtDefaultCat,
          `${this.tr.debtRepayNote}: ${this.debt.person}`
        );
        await this.reload();
      },
    }).open();
  }

  private openBorrowMoreModal(): void {
    new DebtMovementModal(this.ctx.app, {
      title: `${this.tr.borrowMore} — ${this.debt.person}`,
      type: DebtMovementType.BORROW,
      onSave: async mov => {
        await this.commands.addDebtMovement(
          this.debt.id,
          mov,
          this.tr.debtDefaultCat,
          `${this.tr.debtBorrowMoreNote}: ${this.debt.person}`
        );
        await this.reload();
      },
    }).open();
  }

  private confirmDeleteMovement(mov: DebtMovement): void {
    const label = `${this.debt.person} · ${this.ctx.fmt(mov.amount)} · ${fmtDate(mov.date, mov.time)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteMovement}\n${label}`, async () => {
      await this.commands.deleteDebtMovement(this.debt.id, mov.id, mov.date, mov.amount);
      await this.reload();
    }).open();
  }

  private async reload(): Promise<void> {
    this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
    const updated = this.ctx.data?.debts.find(d => d.id === this.debt.id);
    if (updated) {
      this.debt = updated;
    }
    this.renderContent();
    this.opts.onDebtUpdated?.();
    new Notice(this.tr.repaymentRecorded);
  }
}
