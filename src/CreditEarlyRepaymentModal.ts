import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { CreditRecord, CreditPayment } from './types';
import { calculateRemainingPrincipal } from './domain/creditCalculations';
import { fmtAmount, parseAmount, getTodayStr, normalizeDateStr } from './utils';
import { createAmountInput } from './ui/AmountInput';
import { round2 } from './domain/money';
import { PaymentStatus } from './constants';

export interface EarlyRepaymentOptions {
  title: string;
  credit: CreditRecord;
  currency: string;
  onSave: (credit: CreditRecord) => void;
}

export class CreditEarlyRepaymentModal extends Modal {
  private tr: Translations;
  private o: EarlyRepaymentOptions;
  private credit: CreditRecord;
  private actualRemaining: number;
  private amountInput!: HTMLInputElement;
  private pendingPayments: CreditPayment[];
  private selectedOption: 'amount' | 'term' = 'amount';

  constructor(app: App, opts: EarlyRepaymentOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o = opts;
    this.credit = { ...opts.credit, payments: [...opts.credit.payments] };

    this.pendingPayments = this.credit.payments.filter(p => p.status === PaymentStatus.PENDING);
    this.actualRemaining = this.credit.currentAmount > 0
      ? this.credit.currentAmount
      : calculateRemainingPrincipal(this.credit);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h2', { text: this.o.title, cls: 'finance-modal-title' });

    const cur = this.o.currency;

    const info = contentEl.createDiv('finance-early-info');
    info.createEl('p', { text: `${this.tr.remainingCreditLabel}: ${fmtAmount(String(this.actualRemaining))} ${cur}` });
    info.createEl('p', { text: `${this.tr.monthlyPaymentLabel}: ${fmtAmount(String(this.credit.monthlyPayment))} ${cur}` });
    info.createEl('p', { text: `${this.tr.remainingPaymentsLabel}: ${this.pendingPayments.length}` });

    const form = contentEl.createDiv('finance-form');

    const dateG = form.createDiv('finance-field-group');
    dateG.createEl('label', { text: this.tr.repaymentDate, cls: 'finance-field-label' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    const today = getTodayStr();
    dateIn.value = today;

    const optRow = form.createDiv('finance-early-options');

    const amountBtn = optRow.createEl('button', {
      text: this.tr.repayAmountShort,
      cls: 'finance-early-opt-btn is-active',
    });
    const termBtn = optRow.createEl('button', {
      text: this.tr.repayTermShort,
      cls: 'finance-early-opt-btn',
    });

    const amountSection = form.createDiv('finance-early-amount-section');
    amountSection.createEl('label', { text: this.tr.earlyRepaymentAmount, cls: 'finance-field-label' });

    this.amountInput = createAmountInput(amountSection, {
      value: this.actualRemaining,
      onChange: () => {},
    }).input;

    const termSection = form.createDiv('finance-early-term-section is-hidden');
    termSection.createEl('label', { text: this.tr.reduceTermLabel, cls: 'finance-field-label' });
    const termInput = termSection.createEl('input', {
      type: 'number',
      cls: 'finance-input',
    });
    termInput.setAttribute('min', '1');
    termInput.setAttribute('max', String(this.pendingPayments.length));
    termInput.value = '1';

    const selectOption = (option: 'amount' | 'term') => {
      this.selectedOption = option;
      const byAmount = option === 'amount';
      amountBtn.classList.toggle('is-active', byAmount);
      termBtn.classList.toggle('is-active', !byAmount);
      amountSection.classList.toggle('is-hidden', !byAmount);
      termSection.classList.toggle('is-hidden', byAmount);
    };

    amountBtn.addEventListener('click', () => selectOption('amount'));
    termBtn.addEventListener('click', () => selectOption('term'));

    const noteG = form.createDiv('finance-field-group');
    noteG.createEl('label', { text: this.tr.note, cls: 'finance-field-label' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = this.tr.optional;
    noteIn.rows = 2;

    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: this.tr.repay, cls: 'finance-btn-save' })
      .addEventListener('click', () => {
        const todayStr = getTodayStr();
        const repaymentDate = normalizeDateStr(dateIn.value || todayStr);

        if (this.selectedOption === 'amount') {
          const amount = parseAmount(this.amountInput.value);
          if (!amount || amount <= 0) {
            new Notice(this.tr.invalidAmount);
            this.amountInput.focus();
            return;
          }

          let remainingAmount = amount;

          for (const payment of this.pendingPayments) {
            if (remainingAmount <= 0) break;

            if (remainingAmount >= payment.amount) {
              // Full payment: mark as paid
              payment.status = 'paid';
              payment.paidDate = repaymentDate;
              if (noteIn.value) {
                payment.note = payment.note
                  ? `${payment.note}; ${noteIn.value}`
                  : noteIn.value;
              }
              remainingAmount -= payment.amount;
            } else {
              // Partial payment: reduce the amount but keep payment pending
              // The reduced payment will still be due on its original due date
              payment.amount = round2(payment.amount - remainingAmount);
              const partialNote = `${this.tr.partialPaymentNote} ${repaymentDate}: ${this.o.currency} ${remainingAmount.toFixed(2)}`;
              if (noteIn.value) {
                payment.note = payment.note
                  ? `${payment.note}; ${partialNote}; ${noteIn.value}`
                  : `${partialNote}; ${noteIn.value}`;
              } else {
                payment.note = payment.note
                  ? `${payment.note}; ${partialNote}`
                  : partialNote;
              }
              remainingAmount = 0;
            }
          }

          const stillPending = this.credit.payments.filter(p => p.status === PaymentStatus.PENDING);
          this.credit.currentAmount = calculateRemainingPrincipal(this.credit);
          if (this.credit.currentAmount <= 0 || stillPending.length === 0) {
            this.credit.status = 'paid';
          }

        } else {
          const monthsToRemove = parseInt(termInput.value) || 1;
          const toRemove = Math.min(monthsToRemove, this.pendingPayments.length);

          for (const p of this.pendingPayments.slice(0, toRemove)) {
            p.status = 'paid';
            p.paidDate = repaymentDate;
            if (noteIn.value) p.note = noteIn.value;
          }

          const stillPending = this.credit.payments.filter(p => p.status === PaymentStatus.PENDING);
          this.credit.currentAmount = calculateRemainingPrincipal(this.credit);
          this.credit.status = (this.credit.currentAmount <= 0 || stillPending.length === 0) ? 'paid' : 'active';
        }

        this.o.onSave(this.credit);
        this.close();
      });
  }

  override onClose(): void { this.contentEl.empty(); }
}
