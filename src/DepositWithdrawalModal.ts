import { App } from 'obsidian';
import { DepositWithdrawal, DepositRecord } from './types';
import { fmtAmount, parseAmount, getTodayStr, normalizeDateStr, normalizeTimeStr } from './utils';
import { createAmountInput } from './ui/AmountInput';
import { EntityModal } from './ui/EntityModal';
import { buildDateTimeField, buildNoteField } from './ui/formHelpers';

export interface DepositWithdrawalOptions {
  title: string;
  deposit: DepositRecord;
  maxAmount: number;
  currency: string;
  onSave:   (w: DepositWithdrawal) => void;
}

export class DepositWithdrawalModal extends EntityModal<DepositWithdrawal> {
  private o: DepositWithdrawalOptions;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: DepositWithdrawalOptions) {
    super(app, {
      entity: {
        id: crypto.randomUUID(),
        amount: 0,
        date: getTodayStr(),
        time: new Date().toTimeString().slice(0, 5),
        createdAt: Date.now(),
        note: '',
      },
      isEdit: false,
      onSave: opts.onSave,
    });
    this.o = opts;
  }

  protected getTitle(): string { return this.o.title; }

  protected override getSaveLabel(): string { return this.tr.withdraw; }

  protected buildForm(form: HTMLElement): void {
    form.createEl('p', {
      text: `${this.tr.available}: ${fmtAmount(String(this.o.maxAmount))} ${this.o.currency}`,
      cls: 'finance-modal-hint',
    });

    const grid = form.createDiv('finance-form-grid finance-form-compact');

    const row1 = grid.createDiv('finance-form-row finance-full-width');
    const amtG = row1.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.withdrawalAmountLabel, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, { onChange: () => { /* read on save */ } }).input;

    const row2 = grid.createDiv('finance-form-row finance-full-width');
    buildDateTimeField(row2, this.tr.dateTime, this.entity.date, this.entity.time, this.tr, (d, t) => {
      this.entity.date = d;
      this.entity.time = t;
    });

    const row3 = grid.createDiv('finance-form-row finance-full-width');
    buildNoteField(row3, {
      label: this.tr.note,
      value: this.entity.note,
      placeholder: this.tr.optional,
      rows: 2,
      onChange: v => { this.entity.note = v; },
    });
  }

  protected validate(): string | null {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) return this.tr.invalidAmount;
    if (amount > this.o.maxAmount) {
      return this.tr.exceedsBalance
        .replace('{max}', fmtAmount(String(this.o.maxAmount)))
        .replace('{currency}', this.o.currency);
    }
    return null;
  }

  protected collectData(): DepositWithdrawal {
    return {
      ...this.entity,
      amount: parseAmount(this.amountInput.value),
      date: normalizeDateStr(this.entity.date),
      time: normalizeTimeStr(this.entity.time),
      note: this.entity.note.trim(),
    };
  }

  protected override onFormReady(): void { this.amountInput.focus(); }
}
