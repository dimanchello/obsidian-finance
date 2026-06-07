import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { DepositWithdrawal, DepositRecord } from './types';
import { fmtAmount, parseAmount } from './utils';

export interface DepositWithdrawalOptions {
  title: string;
  deposit: DepositRecord;
  maxAmount: number;
  currency: string;
  onSave:   (w: DepositWithdrawal) => void;
}

export class DepositWithdrawalModal extends Modal {
  private tr: Translations;
  private o: DepositWithdrawalOptions;
  private deposit: DepositRecord;
  private maxAmount: number;
  private currency: string;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: DepositWithdrawalOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o = opts;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h2', { text: this.o.title, cls: 'finance-modal-title' });

    const hint = contentEl.createEl('p', { text: `${this.tr.available}: ${fmtAmount(String(this.o.maxAmount))} ${this.o.currency}`, cls: 'finance-modal-hint' });
    hint.style.fontSize = '13px';
    hint.style.color = '#6b7280';
    hint.style.margin = '0 0 12px';

    const form = contentEl.createDiv('finance-form finance-form-grid finance-form-compact');

    const row1 = form.createDiv('finance-form-row finance-full-width');

    const amtG = row1.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.withdrawalAmountLabel, cls: 'finance-field-label' });
    this.amountInput = amtG.createEl('input', { type: 'text', cls: 'finance-input finance-amount-input' });
    this.amountInput.setAttribute('inputmode', 'decimal');
    this.amountInput.setAttribute('placeholder', '0');
    this.amountInput.setAttribute('autocomplete', 'off');
    this.amountInput.focus();

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
    this.amountInput.addEventListener('blur', () => {
      const n = parseAmount(this.amountInput.value);
      this.amountInput.value = n > 0 ? fmtAmount(String(n)) : '';
    });

    const row2 = form.createDiv('finance-form-row finance-full-width');

    const dateG = row2.createDiv('finance-field-group');
    dateG.createEl('label', { text: this.tr.date, cls: 'finance-field-label' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    dateIn.value = new Date().toISOString().split('T')[0];

    const timeG = row2.createDiv('finance-field-group');
    timeG.createEl('label', { text: this.tr.time, cls: 'finance-field-label' });
    const timeIn = timeG.createEl('input', { type: 'time', cls: 'finance-input' });
    timeIn.value = new Date().toTimeString().slice(0, 5);

    const row3 = form.createDiv('finance-form-row finance-full-width');
    const noteG = row3.createDiv('finance-field-group');
    noteG.createEl('label', { text: this.tr.note, cls: 'finance-field-label' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = this.tr.optional;
    noteIn.rows = 2;

    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: this.tr.withdraw, cls: 'finance-btn-save' })
      .addEventListener('click', () => {
        const amount = parseAmount(this.amountInput.value);
        if (!amount || amount <= 0) {
          new Notice(this.tr.invalidAmount);
          this.amountInput.focus();
          return;
        }
        if (amount > this.o.maxAmount) {
          new Notice(this.tr.exceedsBalance.replace('{max}', fmtAmount(String(this.o.maxAmount))).replace('{currency}', this.o.currency));
          this.amountInput.focus();
          return;
        }
        const withdrawal: DepositWithdrawal = {
          id: crypto.randomUUID(),
          amount,
          date: dateIn.value,
          time: timeIn.value,
          createdAt: Date.now(),
          note: noteIn.value.trim(),
        };
        this.o.onSave(withdrawal);
        this.close();
      });
  }

  onClose(): void { this.contentEl.empty(); }
}
