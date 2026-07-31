import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { DepositTopUp, DepositRecord } from './types';
import { parseAmount, getTodayStr, normalizeDateStr, normalizeTimeStr } from './utils';
import { createAmountInput } from './ui/AmountInput';

export interface DepositTopUpOptions {
  title: string;
  deposit: DepositRecord;
  onSave:  (topUp: DepositTopUp) => void;
}

export class DepositTopUpModal extends Modal {
  private tr: Translations;
  private o: DepositTopUpOptions;
  private deposit: DepositRecord;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: DepositTopUpOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o = opts;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h2', { text: this.o.title, cls: 'finance-modal-title' });

    const form = contentEl.createDiv('finance-form finance-form-grid finance-form-compact');

    const row1 = form.createDiv('finance-form-row finance-full-width');

    const amtG = row1.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.topUpAmountLabel, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, { onChange: () => {} }).input;
    this.amountInput.focus();

    const row2 = form.createDiv('finance-form-row finance-full-width');

    const dateG = row2.createDiv('finance-field-group');
    dateG.createEl('label', { text: this.tr.date, cls: 'finance-field-label' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    dateIn.value = getTodayStr();

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
    btnRow.createEl('button', { text: this.tr.topUp, cls: 'finance-btn-save' })
      .addEventListener('click', () => {
        const amount = parseAmount(this.amountInput.value);
        if (!amount || amount <= 0) {
          new Notice(this.tr.invalidAmount);
          this.amountInput.focus();
          return;
        }
        const topUp: DepositTopUp = {
          id: crypto.randomUUID(),
          amount,
          date: normalizeDateStr(dateIn.value),
          time: normalizeTimeStr(timeIn.value),
          createdAt: Date.now(),
          note: noteIn.value.trim(),
        };
        this.o.onSave(topUp);
        this.close();
      });
  }

  onClose(): void { this.contentEl.empty(); }
}
