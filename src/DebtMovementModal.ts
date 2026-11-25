import { App } from 'obsidian';
import { CSS_CLASS, DebtDirection } from './constants';
import { DebtMovement, DebtMovementType } from './types';
import { parseAmount, getTodayStr, getTodayTime, fmt } from './utils';
import { createAmountInput, type AmountInputHandle } from './ui/AmountInput';
import { EntityModal } from './ui/EntityModal';
import { buildDateTimeField } from './ui/formHelpers';
import { validatePositiveAmount } from './domain/validators';
import { calcAutoRepaymentInterest } from './domain/debtCalculations';
import { round2 } from './domain/money';

export interface DebtMovementOptions {
  title:               string;
  type:                DebtMovementType;
  movement?:           DebtMovement;
  remainingAmount?:    number;
  remainingPrincipal?: number;
  direction?:          DebtDirection;
  allowInterestAmount?: boolean;
  currency?:           string;
  onSave:              (m: DebtMovement) => void | Promise<void>;
}

export class DebtMovementModal extends EntityModal<DebtMovement> {
  private o: DebtMovementOptions;
  private amountInput!: HTMLInputElement;
  private amountHandle!: AmountInputHandle;
  private interestAmountInput: HTMLInputElement | undefined;
  private interestHandle: AmountInputHandle | undefined;
  private splitPreviewEl: HTMLElement | undefined;
  private isInterestManual = false;
  private settingAutoInterest = false;

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
    if (opts.movement && opts.type === DebtMovementType.REPAY) {
      const initialAuto = opts.remainingPrincipal !== undefined
        ? calcAutoRepaymentInterest(opts.movement.amount, opts.remainingPrincipal)
        : (opts.movement.interestAmount ?? 0);
      this.isInterestManual = Boolean(opts.movement.manualInterest) ||
        (opts.movement.interestAmount !== undefined && opts.movement.interestAmount !== initialAuto);
    }
  }

  protected getTitle(): string { return this.o.title; }

  protected override getSaveLabel(): string { return this.tr.save; }

  protected buildForm(form: HTMLElement): void {
    // ── Amount ───────────────────────────────────────────────────────────
    const amtG = form.createDiv('finance-field-group finance-amount-group');
    let labelText: string;
    if (this.o.type === DebtMovementType.BORROW) {
      labelText = this.tr.borrowAmountLabel;
    } else if (this.o.type === DebtMovementType.INTEREST) {
      labelText = this.tr.debtInterestAmountLabel;
    } else {
      labelText = this.tr.repayAmountLabel;
    }
    amtG.createEl('label', { text: labelText, cls: CSS_CLASS.FINANCE_FIELD_LABEL });

    this.amountHandle = createAmountInput(amtG, {
      value: this.entity.amount,
      onChange: v => {
        this.entity.amount = v;
        this.syncAutoInterest();
        this.updateSplitPreview();
      },
    });
    this.amountInput = this.amountHandle.input;

    // ── Full repayment link (only for repay type) ────────────────────────
    const remaining = this.o.remainingAmount;
    if (this.o.type === DebtMovementType.REPAY && remaining !== undefined && remaining > 0) {
      const cur = this.o.currency ?? '';
      const formatted = fmt(remaining, cur);
      const link = amtG.createSpan({ cls: 'finance-fill-remaining-link' });
      link.textContent = `→ ${formatted}`;
      link.addEventListener('click', () => {
        this.isInterestManual = false;
        this.amountHandle.set(remaining);
      });
    }

    if (this.o.type === DebtMovementType.REPAY && this.o.allowInterestAmount) {
      const interestGroup = form.createDiv('finance-field-group');
      interestGroup.createEl('label', {
        text: this.tr.repaymentInterestLabel,
        cls: CSS_CLASS.FINANCE_FIELD_LABEL,
      });
      this.interestHandle = createAmountInput(interestGroup, {
        value: this.entity.interestAmount,
        onChange: value => {
          if (this.settingAutoInterest) return;
          this.entity.interestAmount = value;
          this.isInterestManual = value !== this.computeAutoInterest(this.entity.amount);
          this.updateSplitPreview();
        },
      });
      this.interestAmountInput = this.interestHandle.input;
      this.splitPreviewEl = interestGroup.createDiv(`${CSS_CLASS.FINANCE_FIELD_HINT} ${CSS_CLASS.FINANCE_REPAY_SPLIT_PREVIEW}`);
      interestGroup.createEl('p', {
        text: this.tr.repaymentInterestDesc,
        cls: CSS_CLASS.FINANCE_FIELD_HINT,
      });
      this.updateSplitPreview();
    }

    // ── Date+Time ────────────────────────────────────────────────────────
    buildDateTimeField(form, this.tr.dateTime, this.entity.date, this.entity.time, this.tr, (d, t) => {
      this.entity.date = d;
      this.entity.time = t;
    });

    // ── Note — visually distinct ─────────────────────────────────────────
    const noteG = form.createDiv('finance-field-group');
    const noteLabelRow = noteG.createDiv('finance-note-label-row');
    noteLabelRow.createEl('label', { text: this.tr.note, cls: CSS_CLASS.FINANCE_FIELD_LABEL });
    noteLabelRow.createSpan({ text: '📝', cls: 'finance-note-icon' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = this.tr.debtNotePlaceholder;
    noteIn.value = this.entity.note;
    noteIn.rows = 2;
    noteIn.addEventListener('input', () => { this.entity.note = noteIn.value; });
  }

  private computeAutoInterest(amount: number): number {
    if (this.o.remainingPrincipal === undefined) return 0;
    return calcAutoRepaymentInterest(amount, this.o.remainingPrincipal);
  }

  private syncAutoInterest(): void {
    if (!this.interestHandle || this.isInterestManual || this.o.remainingPrincipal === undefined) return;
    const auto = this.computeAutoInterest(this.entity.amount);
    this.entity.interestAmount = auto;
    this.settingAutoInterest = true;
    try {
      this.interestHandle.set(auto);
    } finally {
      this.settingAutoInterest = false;
    }
  }

  private updateSplitPreview(): void {
    if (!this.splitPreviewEl) return;
    const amount = Math.max(0, this.entity.amount);
    if (amount <= 0) {
      this.splitPreviewEl.textContent = '';
      return;
    }
    const interest = Math.max(0, Math.min(amount, this.entity.interestAmount ?? 0));
    const principal = round2(Math.max(0, amount - interest));
    const cur = this.o.currency ?? '';
    const kind = this.o.direction === DebtDirection.LENT
      ? this.tr.repaymentInterestIncomeKind
      : this.tr.repaymentInterestExpenseKind;
    this.splitPreviewEl.textContent = this.tr.repaymentSplitPreview
      .replace('{principal}', fmt(principal, cur))
      .replace('{kind}', kind)
      .replace('{interest}', fmt(interest, cur));
  }

  protected validate(): string | null {
    const result = validatePositiveAmount(this.amountInput.value, this.tr.invalidAmount);
    if ('error' in result) return result.error;
    if (this.interestAmountInput && parseAmount(this.interestAmountInput.value) > parseAmount(this.amountInput.value)) {
      return this.tr.interestExceedsRepayment;
    }
    return null;
  }

  protected collectData(): DebtMovement {
    const amount = parseAmount(this.amountInput.value);
    if (!this.interestAmountInput) {
      return { ...this.entity, amount };
    }
    const next: DebtMovement = {
      ...this.entity,
      amount,
      interestAmount: parseAmount(this.interestAmountInput.value),
    };
    if (this.isInterestManual) {
      next.manualInterest = true;
    } else {
      delete next.manualInterest;
    }
    return next;
  }

  protected override onFormReady(): void { this.amountInput.focus(); }
}
