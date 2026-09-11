import { App, Notice } from 'obsidian';
import { FinanceBaseModal } from '../ui/FinanceBaseModal';
import { ViewContext } from '../context';
import { CreditRecord, CREDIT_PAYMENT_PAGE_SIZE } from '../types';
import { CreditStatus, PaymentStatus } from '../constants';
import {
  calculateRemainingPrincipal,
  calculateTotalInterestPaid,
  calculateCreditEndDate,
  getCreditTypeLabel,
  calculatePaymentBreakdown,
} from '../domain/creditCalculations';
import { fmtDate } from '../utils';
import { renderProgressBar, renderPaginatedSchedule, renderPagination } from '../ui/tabHelpers';
import { AccountCommands, type CreditNoteTranslations } from '../domain/AccountCommands';
import { CreditPaymentModal } from '../CreditPaymentModal';
import { CreditEarlyRepaymentModal } from '../CreditEarlyRepaymentModal';
import type { Translations } from '../i18n';

export interface CreditDetailModalOptions {
  ctx: ViewContext;
  credit: CreditRecord;
  onNavigateToCredits?: (() => void) | undefined;
  onCreditUpdated?: (() => void) | undefined;
}

export class CreditDetailModal extends FinanceBaseModal {
  protected tr: Translations;
  private ctx: ViewContext;
  private opts: CreditDetailModalOptions;
  private credit: CreditRecord;
  private commands: AccountCommands;
  private paymentPage = 0;
  private bodyContainer!: HTMLElement;

  constructor(app: App, opts: CreditDetailModalOptions) {
    super(app);
    this.opts = opts;
    this.ctx = opts.ctx;
    this.tr = opts.ctx.tr;
    this.credit = opts.credit;
    this.commands = new AccountCommands(opts.ctx.storage, opts.ctx.accountId);

    if (this.credit.payments.length > 0) {
      const lastPaidIdx = this.credit.payments.findLastIndex(p => p.status === PaymentStatus.PAID);
      this.paymentPage = lastPaidIdx >= 0 ? Math.floor(lastPaidIdx / CREDIT_PAYMENT_PAGE_SIZE) : 0;
    }
  }

  override onOpen(): void {
    this.modalEl.addClass('finance-credit-detail-modal');
    this.openHeader(this.credit.name || this.credit.bankName || this.tr.credits);

    this.bodyContainer = this.contentEl.createDiv('finance-credit-detail-body');
    this.renderContent();

    this.renderFooterButtons();
  }

  private renderContent(): void {
    this.bodyContainer.empty();

    const endDate = calculateCreditEndDate(this.credit);
    const remaining = calculateRemainingPrincipal(this.credit);
    const interestPaid = calculateTotalInterestPaid(this.credit);
    const typeLabel = getCreditTypeLabel(this.credit.type, this.tr);

    // Subtitle
    this.bodyContainer.createEl('div', {
      text: `${this.credit.bankName || '—'} · ${typeLabel} · ${this.credit.interestRate}%`,
      cls: 'finance-modal-subtitle',
    });

    // Stat cards
    const statBar = this.bodyContainer.createDiv('finance-modal-stat-bar');

    const addStatPill = (label: string, valStr: string, modCls: string) => {
      const pill = statBar.createDiv(`finance-modal-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-modal-stat-label' });
      pill.createDiv({ text: valStr, cls: 'finance-modal-stat-val' });
    };

    addStatPill(this.tr.overviewInitialAmount, this.ctx.fmt(this.credit.originalAmount), 'finance-stat-neutral');
    addStatPill(
      this.tr.overviewCreditRemaining,
      this.ctx.fmt(remaining),
      remaining > 0 ? 'finance-stat-expense' : 'finance-stat-positive'
    );
    addStatPill(this.tr.monthlyPayment, this.ctx.fmt(this.credit.monthlyPayment), 'finance-stat-neutral');
    addStatPill(this.tr.creditInterestPaid, this.ctx.fmt(interestPaid), 'finance-stat-neutral');

    // Progress bar
    const progressWrapper = this.bodyContainer.createDiv('finance-payments-panel');
    renderProgressBar(progressWrapper, this.credit.startDate, endDate, this.tr, fmtDate.bind(this.ctx));

    // Payments schedule section
    this.renderPayments(progressWrapper);
  }

  private renderPayments(wrapper: HTMLElement): void {
    wrapper.createEl('h4', { text: this.tr.creditPayments, cls: 'finance-section-title' });

    if (!this.credit.payments.length) {
      wrapper.createEl('p', { text: this.tr.noScheduledPayments, cls: 'finance-empty-text' });
      return;
    }

    const totalPages = Math.max(1, Math.ceil(this.credit.payments.length / CREDIT_PAYMENT_PAGE_SIZE));
    this.paymentPage = Math.max(0, Math.min(this.paymentPage, totalPages - 1));

    renderPaginatedSchedule(
      wrapper,
      this.credit.payments,
      this.paymentPage,
      CREDIT_PAYMENT_PAGE_SIZE,
      ['#', this.tr.date, this.tr.sum, this.tr.status],
      this.ctx
    );

    renderPagination({
      container: wrapper,
      currentPage: this.paymentPage,
      totalPages,
      isMobile: this.ctx.isMobile,
      cls: 'finance-panel-pagination',
      onPageChange: newPage => {
        this.paymentPage = newPage;
        this.renderContent();
      },
    });
  }

  private renderFooterButtons(): void {
    const btnsWrap = this.contentEl.createDiv('finance-modal-btns finance-overview-modal-btns');

    const leftGroup = btnsWrap.createDiv('finance-modal-actions-left');

    if (this.credit.status === CreditStatus.ACTIVE) {
      const payBtn = leftGroup.createEl('button', {
        text: `💰 ${this.tr.addMovement}`,
        cls: 'finance-btn-secondary',
      });
      payBtn.addEventListener('click', () => this.openAddPaymentModal());

      const earlyBtn = leftGroup.createEl('button', {
        text: `⚡ ${this.tr.earlyRepayment}`,
        cls: 'finance-btn-secondary',
      });
      earlyBtn.addEventListener('click', () => this.openEarlyRepaymentModal());
    }

    if (this.opts.onNavigateToCredits) {
      const navBtn = leftGroup.createEl('button', {
        text: `↗️ ${this.tr.overviewOpenInCreditsTab}`,
        cls: 'finance-btn-secondary',
      });
      navBtn.addEventListener('click', () => {
        this.close();
        this.opts.onNavigateToCredits?.();
      });
    }

    const closeBtn = btnsWrap.createEl('button', {
      text: this.tr.close,
      cls: 'finance-btn-cancel',
    });
    closeBtn.addEventListener('click', () => this.close());
  }

  private creditNotes(): CreditNoteTranslations {
    return {
      receiptNote: this.tr.creditReceiptNote,
      paymentNote: this.tr.creditPaymentNote,
      downPaymentNote: this.tr.downPaymentNotePrefix,
    };
  }

  private openAddPaymentModal(): void {
    new CreditPaymentModal(this.ctx.app, {
      title: `💰 ${this.tr.paymentLabel} — ${this.credit.name}`,
      credit: this.credit,
      onSave: async payment => {
        const breakdown = calculatePaymentBreakdown(this.credit.currentAmount, payment.amount, this.credit.interestRate);
        payment.principalPart = breakdown.principalPart;
        payment.interestPart = breakdown.interestPart;
        payment.remainingDebt = breakdown.remainingDebt;

        const updatedCredit = { ...this.credit, payments: [...this.credit.payments, payment] };
        updatedCredit.currentAmount = calculateRemainingPrincipal(updatedCredit);
        if (updatedCredit.currentAmount <= 0) updatedCredit.status = CreditStatus.PAID;

        await this.commands.updateCredit(
          updatedCredit,
          this.tr.creditDefaultCat,
          this.creditNotes()
        );
        await this.reload();
      },
    }).open();
  }

  private openEarlyRepaymentModal(): void {
    new CreditEarlyRepaymentModal(this.ctx.app, {
      title: `${this.tr.earlyRepayment} — ${this.credit.name}`,
      credit: this.credit,
      currency: this.ctx.currency,
      onSave: async updated => {
        await this.commands.updateCredit(
          updated,
          this.tr.creditDefaultCat,
          this.creditNotes()
        );
        await this.reload();
      },
    }).open();
  }

  private async reload(): Promise<void> {
    this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
    const updated = this.ctx.data?.credits.find(c => c.id === this.credit.id);
    if (updated) {
      this.credit = updated;
    }
    this.renderContent();
    this.opts.onCreditUpdated?.();
    new Notice(this.tr.creditPaymentRecorded);
  }
}
