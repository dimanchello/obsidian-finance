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
  onSave: (w: DepositWithdrawal) => void;
}

/**
 * Example migration to EntityModal pattern.
 * This modal is now ~40% shorter and follows the unified pattern.
 */
export class DepositWithdrawalModalV2 extends EntityModal<DepositWithdrawal> {
  private options: DepositWithdrawalOptions;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: DepositWithdrawalOptions) {
    const withdrawal: DepositWithdrawal = {
      id: crypto.randomUUID(),
      amount: 0,
      date: getTodayStr(),
      time: new Date().toTimeString().slice(0, 5),
      createdAt: Date.now(),
      note: '',
    };

    super(app, {
      entity: withdrawal,
      isEdit: false,
      onSave: opts.onSave,
    });

    this.options = opts;
  }

  protected getTitle(): string {
    return this.options.title;
  }

  protected buildForm(form: HTMLElement): void {
    // Hint about available balance
    form.createEl('p', {
      text: `${this.tr.available}: ${fmtAmount(String(this.options.maxAmount))} ${this.options.currency}`,
      cls: 'finance-modal-hint',
    });

    const grid = form.createDiv('finance-form-grid finance-form-compact');

    // Amount
    const row1 = grid.createDiv('finance-form-row finance-full-width');
    const amtG = row1.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.withdrawalAmountLabel, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, { onChange: () => {} }).input;

    // Date & Time
    const row2 = grid.createDiv('finance-form-row finance-full-width');
    buildDateTimeField(row2, this.tr.dateTime, this.entity.date, this.entity.time, this.tr, (d: string, t: string) => {
      this.entity.date = d;
      this.entity.time = t;
    });

    // Note
    const row3 = grid.createDiv('finance-form-row finance-full-width');
    buildNoteField(row3, {
      label: this.tr.note,
      value: this.entity.note,
      placeholder: this.tr.optional,
      rows: 2,
      onChange: (v: string) => {
        this.entity.note = v;
      },
    });
  }

  protected validate(): string | null {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) {
      return this.tr.invalidAmount;
    }
    if (amount > this.options.maxAmount) {
      return this.tr.exceedsBalance
        .replace('{max}', fmtAmount(String(this.options.maxAmount)))
        .replace('{currency}', this.options.currency);
    }
    return null;
  }

  protected collectData(): DepositWithdrawal {
    return {
      ...this.entity,
      amount: parseAmount(this.amountInput.value) ?? 0,
      date: normalizeDateStr(this.entity.date),
      time: normalizeTimeStr(this.entity.time),
    };
  }

  protected override onFormReady(): void {
    this.amountInput.focus();
  }
}
