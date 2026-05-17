import { App, Modal, Notice } from 'obsidian';
import { CreditPayment, CreditRecord } from './types';

export interface CreditPaymentModalOptions {
  title: string;
  credit: CreditRecord;
  onSave: (payment: CreditPayment) => void;
}

function fmtAmount(raw: string): string {
  const clean = raw.replace(/[^\d.,]/g, '');
  const dotPos = clean.search(/[.,]/);
  let intPart = dotPos >= 0 ? clean.slice(0, dotPos) : clean;
  let decPart = dotPos >= 0 ? clean.slice(dotPos + 1) : '';
  decPart = decPart.slice(0, 2).replace(/[.,]/g, '');
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return decPart.length > 0 ? `${intPart},${decPart}` : intPart;
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(/\u00a0|\s/g, '').replace(',', '.')) || 0;
}

export class CreditPaymentModal extends Modal {
  private o: CreditPaymentModalOptions;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: CreditPaymentModalOptions) {
    super(app);
    this.o = opts;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h2', { text: this.o.title, cls: 'finance-modal-title' });

    const form = contentEl.createDiv('finance-form');

    const dateG = form.createDiv('finance-field-group');
    dateG.createEl('label', { text: 'Дата платежа', cls: 'finance-field-label' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    const today = new Date().toISOString().split('T')[0];
    dateIn.value = today;

    const amtG = form.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: 'Сумма', cls: 'finance-field-label' });

    this.amountInput = amtG.createEl('input', { type: 'text', cls: 'finance-input finance-amount-input' });
    this.amountInput.setAttribute('inputmode', 'decimal');
    this.amountInput.setAttribute('placeholder', '0');
    this.amountInput.setAttribute('autocomplete', 'off');
    this.amountInput.value = fmtAmount(String(this.o.credit.monthlyPayment));

    this.amountInput.addEventListener('focus', () => {
      if (this.o.credit.monthlyPayment > 0) {
        this.amountInput.value = String(this.o.credit.monthlyPayment).replace('.', ',');
      }
    });

    this.amountInput.addEventListener('input', () => {
      const raw = this.amountInput.value;
      const sel = this.amountInput.selectionStart ?? raw.length;
      const rawBefore = raw.slice(0, sel).replace(/[^\d.,]/g, '').length;
      const formatted = fmtAmount(raw);
      if (formatted !== raw) {
        this.amountInput.value = formatted;
        let newPos = 0, rawCount = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/[\d.,]/.test(formatted[i])) rawCount++;
          if (rawCount >= rawBefore) { newPos = i + 1; break; }
        }
        this.amountInput.setSelectionRange(newPos, newPos);
      }
    });

    const noteG = form.createDiv('finance-field-group');
    noteG.createEl('label', { text: 'Примечание', cls: 'finance-field-label' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = 'Необязательно';
    noteIn.rows = 2;

    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: 'Отмена', cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: 'Добавить', cls: 'finance-btn-save' })
      .addEventListener('click', () => {
        const amount = parseAmount(this.amountInput.value);
        if (!amount || amount <= 0) {
          new Notice('⚠️ Укажите сумму больше нуля');
          this.amountInput.focus();
          return;
        }
        const payment: CreditPayment = {
          id: crypto.randomUUID(),
          amount,
          dueDate: dateIn.value,
          status: 'paid',
          paidDate: dateIn.value,
          note: noteIn.value,
        };
        this.o.onSave(payment);
        this.close();
      });
  }

  onClose(): void { this.contentEl.empty(); }
}