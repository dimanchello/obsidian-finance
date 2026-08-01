import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { CreditPayment, CreditRecord } from './types';
import { parseAmount, getTodayStr, normalizeDateStr } from './utils';
import { createAmountInput } from './ui/AmountInput';

export interface CreditPaymentOptions {
  title: string;
  credit: CreditRecord;
  onSave: (payment: CreditPayment) => void;
}

export class CreditPaymentModal extends Modal {
  private tr: Translations;
  private o: CreditPaymentOptions;
  private payment: Partial<CreditPayment>;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: CreditPaymentOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o = opts;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h2', { text: this.o.title, cls: 'finance-modal-title' });

    const form = contentEl.createDiv('finance-form');

    const dateG = form.createDiv('finance-field-group');
    dateG.createEl('label', { text: this.tr.paymentDateLabel, cls: 'finance-field-label' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    const today = getTodayStr();
    dateIn.value = today;

    const amtG = form.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.sum, cls: 'finance-field-label' });

    this.amountInput = createAmountInput(amtG, {
      value: this.o.credit.monthlyPayment,
      onChange: () => {},
    }).input;

    const noteG = form.createDiv('finance-field-group');
    noteG.createEl('label', { text: this.tr.note, cls: 'finance-field-label' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = this.tr.optional;
    noteIn.rows = 2;

    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: this.tr.addBtn, cls: 'finance-btn-save' })
      .addEventListener('click', () => {
        const amount = parseAmount(this.amountInput.value);
        if (!amount || amount <= 0) {
          new Notice(this.tr.invalidAmount);
          this.amountInput.focus();
          return;
        }
        const payment: CreditPayment = {
          id: crypto.randomUUID(),
          amount,
          dueDate: normalizeDateStr(dateIn.value),
          status: 'paid',
          paidDate: normalizeDateStr(dateIn.value),
          note: noteIn.value,
        };
        this.o.onSave(payment);
        this.close();
      });
  }

  onClose(): void { this.contentEl.empty(); }
}