import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { DebtMovement, DebtMovementType } from './types';
import { parseAmount, getTodayStr } from './utils';
import { createAmountInput } from './ui/AmountInput';
import { createDateTimeField } from './ui/DateField';

export interface DebtMovementOptions {
  title:           string;
  type:            DebtMovementType;
  movement?:       DebtMovement;
  remainingAmount?: number;
  currency?:       string;
  onSave:          (m: DebtMovement) => void;
}

export class DebtMovementModal extends Modal {
  private tr: Translations;
  private o: DebtMovementOptions;
  private mov: DebtMovement;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: DebtMovementOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o = opts;
    if (opts.movement) {
      this.mov = { ...opts.movement };
    } else {
      const nowStr = getTodayStr();
      const timeStr = new Date().toTimeString().slice(0, 5);
      this.mov = {
        id: crypto.randomUUID(),
        type: opts.type,
        amount: 0,
        date: nowStr,
        time: timeStr,
        createdAt: Date.now(),
        note: '',
      };
    }
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h2', {
      text: this.o.title,
      cls: 'finance-modal-title',
    });

    const form = contentEl.createDiv('finance-form');

    // ── Amount ───────────────────────────────────────────────────────────
    const amtG = form.createDiv('finance-field-group finance-amount-group');
    const labelText = this.o.type === 'borrow'
      ? this.tr.borrowAmountLabel
      : this.tr.repayAmountLabel;
    amtG.createEl('label', { text: labelText, cls: 'finance-field-label' });

    const amountHandle = createAmountInput(amtG, {
      value: this.mov.amount,
      onChange: v => { this.mov.amount = v; },
    });
    this.amountInput = amountHandle.input;

    // ── Full repayment link (only for repay type) ────────────────────────
    if (this.o.type === 'repay' && this.o.remainingAmount && this.o.remainingAmount > 0) {
      const cur = this.o.currency ?? '';
      const formatted = this.o.remainingAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const link = amtG.createEl('span', { cls: 'finance-fill-remaining-link' });
      link.textContent = `→ ${formatted} ${cur}`;
      link.addEventListener('click', () => {
        amountHandle.set(this.o.remainingAmount!);
      });
    }

    // ── Date+Time ────────────────────────────────────────────────────────
    createDateTimeField(form, {
      label: this.tr.dateTime,
      date: this.mov.date,
      time: this.mov.time,
      onChange: (d, t) => { this.mov.date = d; this.mov.time = t; },
    });

    // ── Note — visually distinct ─────────────────────────────────────────
    const noteG = form.createDiv('finance-field-group');
    const noteLabelRow = noteG.createDiv('finance-note-label-row');
    noteLabelRow.createEl('label', { text: this.tr.note, cls: 'finance-field-label' });
    noteLabelRow.createEl('span', { text: '📝', cls: 'finance-note-icon' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = this.tr.debtNotePlaceholder;
    noteIn.value = this.mov.note;
    noteIn.rows = 2;
    noteIn.addEventListener('input', () => { this.mov.note = noteIn.value; });

    // ── Buttons ──────────────────────────────────────────────────────────
    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: this.tr.save, cls: 'finance-btn-save' })
      .addEventListener('click', () => this.handleSave());

    setTimeout(() => this.amountInput.focus(), 50);
  }

  private handleSave(): void {
    const amount = parseAmount(this.amountInput.value);
    this.mov.amount = amount;
    if (!amount || amount <= 0) {
      new Notice(this.tr.invalidAmount);
      this.amountInput.focus();
      return;
    }
    this.o.onSave(this.mov);
    this.close();
  }

  override onClose(): void { this.contentEl.empty(); }
}
