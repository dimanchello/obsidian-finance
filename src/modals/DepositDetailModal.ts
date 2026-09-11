import { App, Notice } from 'obsidian';
import { FinanceBaseModal } from '../ui/FinanceBaseModal';
import { ViewContext } from '../context';
import { DepositRecord, DepositTopUp, DepositWithdrawal, DEPOSIT_ACCRUAL_PAGE_SIZE } from '../types';
import { DepositAccrualType, DepositStatus, PaymentStatus } from '../constants';
import {
  getDepositEndDate,
  getDepositAccrued,
  getDepositProfit,
  getDepositInitialAmount,
  getDepositCurrentAmount,
  getDepositTypeLabel,
} from '../domain/depositCalculations';
import { sumMoney } from '../domain/money';
import { fmtDate } from '../utils';
import { renderProgressBar, renderPaginatedSchedule, renderPagination } from '../ui/tabHelpers';
import { AccountCommands } from '../domain/AccountCommands';
import { DepositTopUpModal } from '../DepositTopUpModal';
import { DepositWithdrawalModal } from '../DepositWithdrawalModal';
import { ConfirmModal } from '../ConfirmModal';
import type { Translations } from '../i18n';

export interface DepositDetailModalOptions {
  ctx: ViewContext;
  deposit: DepositRecord;
  onNavigateToDeposits?: (() => void) | undefined;
  onDepositUpdated?: (() => void) | undefined;
}

export class DepositDetailModal extends FinanceBaseModal {
  protected tr: Translations;
  private ctx: ViewContext;
  private opts: DepositDetailModalOptions;
  private deposit: DepositRecord;
  private commands: AccountCommands;
  private accrualPage = 0;
  private bodyContainer!: HTMLElement;

  constructor(app: App, opts: DepositDetailModalOptions) {
    super(app);
    this.opts = opts;
    this.ctx = opts.ctx;
    this.tr = opts.ctx.tr;
    this.deposit = opts.deposit;
    this.commands = new AccountCommands(opts.ctx.storage, opts.ctx.accountId);

    if (this.deposit.accruals.length > 0) {
      const lastPaidIdx = this.deposit.accruals.findLastIndex(a => a.status === PaymentStatus.PAID);
      this.accrualPage = lastPaidIdx >= 0 ? Math.floor(lastPaidIdx / DEPOSIT_ACCRUAL_PAGE_SIZE) : 0;
    }
  }

  override onOpen(): void {
    this.modalEl.addClass('finance-deposit-detail-modal');
    this.openHeader(this.deposit.name || this.deposit.bankName || this.tr.deposits);

    this.bodyContainer = this.contentEl.createDiv('finance-deposit-detail-body');
    this.renderContent();

    this.renderFooterButtons();
  }

  private renderContent(): void {
    this.bodyContainer.empty();

    const endDate = getDepositEndDate(this.deposit);
    const accrued = getDepositAccrued(this.deposit);
    const totalProfit = getDepositProfit(this.deposit);
    const initialAmount = getDepositInitialAmount(this.deposit);
    const currentAmount = getDepositCurrentAmount(this.deposit);
    const typeLabel = getDepositTypeLabel(this.deposit.type, this.tr);

    // Subtitle
    this.bodyContainer.createEl('div', {
      text: `${this.deposit.bankName || '—'} · ${typeLabel} · ${this.deposit.interestRate}%`,
      cls: 'finance-modal-subtitle',
    });

    // Stat cards
    const statBar = this.bodyContainer.createDiv('finance-modal-stat-bar');

    const addStatPill = (label: string, valStr: string, modCls: string) => {
      const pill = statBar.createDiv(`finance-modal-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-modal-stat-label' });
      pill.createDiv({ text: valStr, cls: 'finance-modal-stat-val' });
    };

    addStatPill(this.tr.overviewInitialAmount, this.ctx.fmt(initialAmount), 'finance-stat-neutral');
    addStatPill(this.tr.overviewCurrentBalance, this.ctx.fmt(currentAmount), 'finance-stat-positive');
    addStatPill(this.tr.overviewExpectedProfit, `+${this.ctx.fmt(totalProfit)}`, 'finance-stat-income');
    addStatPill(this.tr.accruedIncome, `+${this.ctx.fmt(accrued)}`, 'finance-stat-income');

    // Progress bar
    const progressWrapper = this.bodyContainer.createDiv('finance-payments-panel');
    renderProgressBar(progressWrapper, this.deposit.startDate, endDate, this.tr, fmtDate.bind(this.ctx));

    // Top-ups & Withdrawals lists
    this.renderMovements(progressWrapper);

    // Accruals section
    this.renderAccruals(progressWrapper);
  }

  private renderMovements(wrapper: HTMLElement): void {
    const renderList = <M extends { date: string; time: string; amount: number; note: string; id: string }>(
      title: string,
      items: M[],
      sign: '+' | '−',
      movCls: string,
      totalLabel: string,
      onDelete: (item: M) => void
    ) => {
      if (!items.length) return;
      wrapper.createEl('h4', { text: title, cls: 'finance-section-title' });
      const scrollWrapper = wrapper.createDiv('finance-mov-scroll');
      const table = scrollWrapper.createEl('table', { cls: 'finance-mov-table' });
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
        const actTd = tr.createEl('td', { cls: 'finance-td finance-actions-td' });
        if (this.deposit.status === DepositStatus.ACTIVE) {
          const btn = actTd.createEl('button', { cls: 'finance-action-btn finance-delete-btn', text: '🗑️' });
          btn.title = this.tr.delete;
          btn.addEventListener('click', () => onDelete(item));
        }
      });
      wrapper.createDiv({
        cls: 'finance-deposit-summary',
        text: `${totalLabel}: ${items.length} · ${this.ctx.fmt(sumMoney(items.map(i => i.amount)))}`,
      });
    };

    renderList(
      this.tr.topUpsHeader,
      this.deposit.topUps,
      '+',
      'finance-td-mov-repay',
      this.tr.totalTopUps,
      tu => this.confirmDeleteTopUp(tu)
    );

    renderList(
      this.tr.withdrawalsHeader,
      this.deposit.withdrawals,
      '−',
      'finance-td-mov-borrow',
      this.tr.totalWithdrawals,
      w => this.confirmDeleteWithdrawal(w)
    );
  }

  private renderAccruals(wrapper: HTMLElement): void {
    wrapper.createEl('h4', { text: this.tr.accrualsHeader, cls: 'finance-section-title' });

    if (!this.deposit.accruals.length) {
      wrapper.createEl('p', { text: this.tr.noScheduledAccruals, cls: 'finance-empty-text' });
      return;
    }

    const totalPages = Math.max(1, Math.ceil(this.deposit.accruals.length / DEPOSIT_ACCRUAL_PAGE_SIZE));
    this.accrualPage = Math.max(0, Math.min(this.accrualPage, totalPages - 1));

    renderPaginatedSchedule(
      wrapper,
      this.deposit.accruals,
      this.accrualPage,
      DEPOSIT_ACCRUAL_PAGE_SIZE,
      ['#', this.tr.date, this.tr.sum, this.tr.status],
      this.ctx,
      {
        formatDate: a => fmtDate(a.dueDate, a.paidDate),
        formatStatus: (_a, isPaid) =>
          isPaid
            ? (this.deposit.accrualType === DepositAccrualType.CAPITALIZATION
                ? this.tr.accrualIncluded
                : this.tr.accrualPaidToAccount)
            : this.tr.pendingStatus,
      }
    );

    renderPagination({
      container: wrapper,
      currentPage: this.accrualPage,
      totalPages,
      isMobile: this.ctx.isMobile,
      cls: 'finance-panel-pagination',
      onPageChange: newPage => {
        this.accrualPage = newPage;
        this.renderContent();
      },
    });
  }

  private renderFooterButtons(): void {
    const btnsWrap = this.contentEl.createDiv('finance-modal-btns finance-overview-modal-btns');

    const leftGroup = btnsWrap.createDiv('finance-modal-actions-left');

    if (this.deposit.status === DepositStatus.ACTIVE) {
      const actionsRow = leftGroup.createDiv('finance-modal-actions-row');
      const topUpBtn = actionsRow.createEl('button', {
        text: `💰 ${this.tr.topUp}`,
        cls: 'finance-btn-secondary',
      });
      topUpBtn.addEventListener('click', () => this.openTopUpModal());

      const withdrawBtn = actionsRow.createEl('button', {
        text: `📤 ${this.tr.withdraw}`,
        cls: 'finance-btn-secondary',
      });
      withdrawBtn.addEventListener('click', () => this.openWithdrawalModal());
    }

    if (this.opts.onNavigateToDeposits) {
      const navBtn = leftGroup.createEl('button', {
        text: `↗️ ${this.tr.overviewOpenInDepositsTab}`,
        cls: 'finance-btn-secondary',
      });
      navBtn.addEventListener('click', () => {
        this.close();
        this.opts.onNavigateToDeposits?.();
      });
    }

    const closeBtn = btnsWrap.createEl('button', {
      text: this.tr.close,
      cls: 'finance-btn-cancel',
    });
    closeBtn.addEventListener('click', () => this.close());
  }

  private openTopUpModal(): void {
    new DepositTopUpModal(this.ctx.app, {
      title: `💰 ${this.tr.topUp} — ${this.deposit.name}`,
      deposit: this.deposit,
      onSave: async topUp => {
        await this.commands.addDepositTopUp(
          this.deposit.id,
          topUp,
          this.tr.depositDefaultCat,
          this.tr.depositTopUpNote
        );
        await this.reload();
      },
    }).open();
  }

  private openWithdrawalModal(): void {
    const alreadyWithdrawn = sumMoney(this.deposit.withdrawals.map(w => w.amount));
    new DepositWithdrawalModal(this.ctx.app, {
      title: `${this.tr.withdraw} — ${this.deposit.name}`,
      deposit: this.deposit,
      maxAmount: Math.max(0, this.deposit.amount - alreadyWithdrawn),
      currency: this.ctx.currency,
      onSave: async withdrawal => {
        await this.commands.addDepositWithdrawal(
          this.deposit.id,
          withdrawal,
          this.tr.depositDefaultCat,
          this.tr.depositWithdrawNote
        );
        await this.reload();
      },
    }).open();
  }

  private confirmDeleteTopUp(topUp: DepositTopUp): void {
    const label = `${this.deposit.name} · ${this.ctx.fmt(topUp.amount)} · ${fmtDate(topUp.date, topUp.time)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteTopUp}\n${label}`, async () => {
      await this.commands.deleteDepositTopUp(this.deposit.id, topUp.id, topUp.date, topUp.amount);
      await this.reload();
    }).open();
  }

  private confirmDeleteWithdrawal(withdrawal: DepositWithdrawal): void {
    const label = `${this.deposit.name} · ${this.ctx.fmt(withdrawal.amount)} · ${fmtDate(withdrawal.date, withdrawal.time)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteWithdrawal}\n${label}`, async () => {
      await this.commands.deleteDepositWithdrawal(this.deposit.id, withdrawal.id, withdrawal.date, withdrawal.amount);
      await this.reload();
    }).open();
  }

  private async reload(): Promise<void> {
    this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
    const updated = this.ctx.data?.deposits.find(d => d.id === this.deposit.id);
    if (updated) {
      this.deposit = updated;
    }
    this.renderContent();
    this.opts.onDepositUpdated?.();
    new Notice(this.tr.depositUpdated);
  }
}
