import { App } from 'obsidian';
import { DebtMovement, DebtMovementType } from './types';
import { parseAmount, getTodayStr, getTodayTime } from './utils';
import { createAmountInput } from './ui/AmountInput';
import { EntityModal } from './ui/EntityModal';
import { buildDateTimeField } from './ui/formHelpers';

export interface DebtMovementOptions {
  title:           string;
  type:            DebtMovementType;
  movement?:       DebtMovement;
  remainingAmount?: number;
  currency?:       string;
  onSave:          (m: DebtMovement) => void;
}

export class DebtMovementModal extends EntityModal<DebtMovement> {
  private o: DebtMovementOptions;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: DebtMovementOptions) {
    super(app, {
      entity: opts.movement
        ? { ...opts.movement }
        : {
            id: crypto.randomUUID(),
            type: opts.type,
            amount: 0,
            date: getTodayStr(),
            time: getTodayTime(),
            createdAt: Date.now(),
            note: '',
          },
      isEdit: !!opts.movement,
      onSave: opts.onSave,
    });
    this.o = opts;
  }

  protected getTitle(): string { return this.o.title; }

  protected override getSaveLabel(): string { return this.tr.save; }

  protected buildForm(form: HTMLElement): void {
    // ── Amount ───────────────────────────────────────────────────────────
    const amtG = form.createDiv('finance-field-group finance-amount-group');
    const labelText = this.o.type === DebtMovementType.BORROW
      ? this.tr.borrowAmountLabel
      : this.tr.repayAmountLabel;
    amtG.createEl('label', { text: labelText, cls: 'finance-field-label' });

    const amountHandle = createAmountInput(amtG, {
      value: this.entity.amount,
      onChange: v => { this.entity.amount = v; },
    });
    this.amountInput = amountHandle.input;

    // ── Full repayment link (only for repay type) ────────────────────────
    const remaining = this.o.remainingAmount;
    if (this.o.type === DebtMovementType.REPAY && remaining !== undefined && remaining > 0) {
      const cur = this.o.currency ?? '';
      const formatted = remaining.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const link = amtG.createEl('span', { cls: 'finance-fill-remaining-link' });
      link.textContent = `→ ${formatted} ${cur}`;
      link.addEventListener('click', () => { amountHandle.set(remaining); });
    }

    // ── Date+Time ────────────────────────────────────────────────────────
    buildDateTimeField(form, this.tr.dateTime, this.entity.date, this.entity.time, this.tr, (d, t) => {
      this.entity.date = d;
      this.entity.time = t;
    });

    // ── Note — visually distinct ─────────────────────────────────────────
    const noteG = form.createDiv('finance-field-group');
    const noteLabelRow = noteG.createDiv('finance-note-label-row');
    noteLabelRow.createEl('label', { text: this.tr.note, cls: 'finance-field-label' });
    noteLabelRow.createEl('span', { text: '📝', cls: 'finance-note-icon' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = this.tr.debtNotePlaceholder;
    noteIn.value = this.entity.note;
    noteIn.rows = 2;
    noteIn.addEventListener('input', () => { this.entity.note = noteIn.value; });
  }

  protected validate(): string | null {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) return this.tr.invalidAmount;
    return null;
  }

  protected collectData(): DebtMovement {
    return { ...this.entity, amount: parseAmount(this.amountInput.value) };
  }

  protected override onFormReady(): void { this.amountInput.focus(); }
}
