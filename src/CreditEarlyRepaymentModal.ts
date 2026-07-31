import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { CreditRecord, CreditPayment } from './types';
import { fmtAmount, parseAmount, getTodayStr, normalizeDateStr } from './utils';
import { createAmountInput } from './ui/AmountInput';
import { round2, sumMoney } from './domain/money';

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

    this.pendingPayments = this.credit.payments.filter(p => p.status === 'pending');
    const paidAmount = this.credit.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const totalToPay = this.credit.monthlyPayment * this.credit.termMonths;
    this.actualRemaining = Math.max(0, totalToPay - paidAmount);
  }

  onOpen(): void {
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
    optRow.style.display = 'flex';
    optRow.style.gap = '8px';
    optRow.style.marginBottom = '16px';

    const baseBtnStyle = (btn: HTMLElement) => {
      btn.style.flex = '1';
      btn.style.padding = '10px 16px';
      btn.style.borderRadius = '8px';
      btn.style.border = '2px solid #e5e7eb';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = '500';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'all 0.2s ease';
      btn.style.background = '#f9fafb';
      btn.style.color = '#374151';
    };

    const activeBtnStyle = (btn: HTMLElement) => {
      btn.style.background = '#7c3aed';
      btn.style.color = '#fff';
      btn.style.borderColor = '#7c3aed';
    };

    const inactiveBtnStyle = (btn: HTMLElement) => {
      btn.style.background = '#f9fafb';
      btn.style.color = '#374151';
      btn.style.borderColor = '#e5e7eb';
    };

    const amountBtn = optRow.createEl('button', { text: this.tr.repayAmountShort });
    baseBtnStyle(amountBtn);
    activeBtnStyle(amountBtn);

    const termBtn = optRow.createEl('button', { text: this.tr.repayTermShort });
    baseBtnStyle(termBtn);
    inactiveBtnStyle(termBtn);

    const amountSection = form.createDiv('finance-early-amount-section');
    amountSection.createEl('label', { text: this.tr.earlyRepaymentAmount, cls: 'finance-field-label' });

    this.amountInput = createAmountInput(amountSection, {
      value: this.actualRemaining,
      onChange: () => {},
    }).input;

    const termSection = form.createDiv('finance-early-term-section');
    termSection.style.display = 'none';
    termSection.createEl('label', { text: this.tr.reduceTermLabel, cls: 'finance-field-label' });
    const termInput = termSection.createEl('input', {
      type: 'number',
      cls: 'finance-input',
    });
    termInput.setAttribute('min', '1');
    termInput.setAttribute('max', String(this.pendingPayments.length));
    termInput.value = '1';

    amountBtn.addEventListener('click', () => {
      this.selectedOption = 'amount';
      activeBtnStyle(amountBtn);
      inactiveBtnStyle(termBtn);
      amountSection.style.display = 'block';
      termSection.style.display = 'none';
    });

    termBtn.addEventListener('click', () => {
      this.selectedOption = 'term';
      activeBtnStyle(termBtn);
      inactiveBtnStyle(amountBtn);
      amountSection.style.display = 'none';
      termSection.style.display = 'block';
    });

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
            const payAmount = Math.min(payment.amount, remainingAmount);
            if (remainingAmount >= payment.amount) {
              payment.status = 'paid';
              payment.paidDate = repaymentDate;
              if (noteIn.value) payment.note = noteIn.value;
            } else {
              payment.amount = round2(payment.amount - remainingAmount);
              if (noteIn.value) {
                payment.note = payment.note ? `${payment.note}; ${noteIn.value}` : noteIn.value;
              }
            }
            remainingAmount -= payAmount;
          }

          const stillPending = this.credit.payments.filter(p => p.status === 'pending');
          this.credit.currentAmount = sumMoney(stillPending.map(p => p.amount));
          if (this.credit.currentAmount <= 0 || stillPending.length === 0) {
            this.credit.status = 'paid';
          }

        } else {
          const monthsToRemove = parseInt(termInput.value) || 1;
          const toRemove = Math.min(monthsToRemove, this.pendingPayments.length);

          for (let i = 0; i < toRemove; i++) {
            this.pendingPayments[i].status = 'paid';
            this.pendingPayments[i].paidDate = repaymentDate;
            if (noteIn.value) this.pendingPayments[i].note = noteIn.value;
          }

          const stillPending = this.credit.payments.filter(p => p.status === 'pending');
          this.credit.currentAmount = stillPending.reduce((s, p) => s + p.amount, 0);
          this.credit.status = stillPending.length === 0 ? 'paid' : 'active';
        }

        this.o.onSave(this.credit);
        this.close();
      });
  }

  onClose(): void { this.contentEl.empty(); }
}
