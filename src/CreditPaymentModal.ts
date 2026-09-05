import { App } from 'obsidian';
import { CreditPayment, CreditRecord } from './types';
import { parseAmount, getTodayStr, normalizeDateStr } from './utils';
import { createAmountInput } from './ui/AmountInput';
import { EntityModal } from './ui/EntityModal';
import { buildDateField, buildNoteField } from './ui/formHelpers';
import { PaymentStatus } from './constants';

export interface CreditPaymentOptions {
  title: string;
  credit: CreditRecord;
  onSave: (payment: CreditPayment) => void;
}

export class CreditPaymentModal extends EntityModal<CreditPayment> {
  private o: CreditPaymentOptions;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: CreditPaymentOptions) {
    super(app, {
      entity: {
        id: crypto.randomUUID(),
        amount: opts.credit.monthlyPayment,
        dueDate: getTodayStr(),
        status: PaymentStatus.PAID,
        paidDate: getTodayStr(),
        note: '',
      },
      isEdit: false,
      onSave: opts.onSave,
    });
    this.o = opts;
  }

  protected getTitle(): string { return this.o.title; }

  protected buildForm(form: HTMLElement): void {
    buildDateField(form, this.tr.paymentDateLabel, this.entity.dueDate, v => {
      this.entity.dueDate = v;
    });

    const amtG = form.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.sum, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, {
      value: this.o.credit.monthlyPayment,
      onChange: () => { /* read on save */ },
    }).input;

    buildNoteField(form, {
      label: this.tr.note,
      value: this.entity.note ?? '',
      placeholder: this.tr.optional,
      rows: 2,
      onChange: v => { this.entity.note = v; },
    });
  }

  protected validate(): string | null {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) return this.tr.invalidAmount;
    return null;
  }

  protected collectData(): CreditPayment {
    const date = normalizeDateStr(this.entity.dueDate);
    return {
      ...this.entity,
      amount: parseAmount(this.amountInput.value),
      dueDate: date,
      paidDate: date,
    };
  }

  protected override onFormReady(): void { this.amountInput.focus(); }
}
