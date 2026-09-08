import { App } from 'obsidian';
import { DebtRecord, PERCENT_100 } from './types';
import { fmtAmount, getTodayStr, getTodayTime, normalizeDateStr, normalizeTimeStr, parseAmount } from './utils';
import { DEBT_FIELDS, type FieldDef } from './FieldInfoModal';
import { createAmountInput } from './ui/AmountInput';
import { EntityModal } from './ui/EntityModal';
import { buildDateField, buildRateInput, buildNoteField, buildComboboxField } from './ui/formHelpers';
import { DebtDirection } from './constants';

export interface DebtModalOptions {
  title:   string;
  debt?:   DebtRecord;
  allPersons: string[];
  onSave:  (debt: DebtRecord) => void;
}

export class DebtModal extends EntityModal<DebtRecord> {
  private o: DebtModalOptions;
  private amountInput!: HTMLInputElement;
  private totalInput!: HTMLInputElement;

  constructor(app: App, opts: DebtModalOptions) {
    super(app, {
      entity: opts.debt
        ? {
            ...opts.debt,
            direction: opts.debt.direction || DebtDirection.BORROWED,
            date: normalizeDateStr(opts.debt.date),
            time: normalizeTimeStr(opts.debt.time || ''),
            dueDate: opts.debt.dueDate ? normalizeDateStr(opts.debt.dueDate) : '',
            movements: opts.debt.movements.map(m => ({
              ...m,
              date: normalizeDateStr(m.date),
              time: normalizeTimeStr(m.time || ''),
            })),
          }
        : {
            id: crypto.randomUUID(),
            person: '',
            amount: 0,
            originalAmount: 0,
            interestRate: 0,
            direction: DebtDirection.BORROWED,
            date: getTodayStr(),
            time: getTodayTime(),
            dueDate: '',
            createdAt: Date.now(),
            note: '',
            movements: [],
          },
      isEdit: !!opts.debt,
      onSave: opts.onSave,
    });
    this.o = opts;
  }

  protected getTitle(): string { return this.o.title; }

  protected override getInfoFields(): FieldDef[] { return DEBT_FIELDS; }

  protected buildForm(form: HTMLElement): void {
    form.addClasses(['finance-form-grid', 'finance-form-compact']);

    this.buildDirectionToggle();

    const row1 = form.createDiv('finance-form-row finance-full-width');

    const personLabelText = this.personLabel();
    const personInput = buildComboboxField(
      row1, personLabelText, this.entity.person,
      () => this.o.allPersons,
      v => { this.entity.person = v; },
    );
    personInput.parentElement?.parentElement?.querySelector('label')?.addClass('finance-person-label');

    const amtG = row1.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.amountLabel, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, {
      value: this.entity.amount,
      onChange: v => {
        this.entity.originalAmount = v;
        this.entity.amount = v;
        this.updateTotalReadonly();
      },
    }).input;

    const row2 = form.createDiv('finance-form-row finance-full-width');
    buildDateField(row2, this.tr.dateCreated, this.entity.date, v => { this.entity.date = v; });
    buildDateField(row2, this.tr.dueDate, this.entity.dueDate, v => { this.entity.dueDate = v; });

    const row3 = form.createDiv('finance-form-row finance-full-width');
    buildRateInput(row3, this.tr.interestRateLabel, this.entity.interestRate, {
      onInput: rate => { this.entity.interestRate = rate; this.updateTotalReadonly(); },
      onBlur: rate => { this.entity.interestRate = rate; this.updateTotalReadonly(); },
    });

    const totalG = row3.createDiv('finance-field-group');
    totalG.createEl('label', {
      text: this.totalLabel(),
      cls: 'finance-field-label finance-total-label',
    });
    this.totalInput = totalG.createEl('input', { type: 'text', cls: 'finance-input' });
    this.totalInput.readOnly = true;
    this.totalInput.value = this.entity.amount > 0 ? fmtAmount(String(this.entity.amount)) : '';

    const row4 = form.createDiv('finance-form-row finance-full-width');
    buildNoteField(row4, {
      label: this.tr.note,
      value: this.entity.note,
      placeholder: this.tr.optional,
      rows: 2,
      onChange: v => { this.entity.note = v; },
    });
  }

  protected validate(): string | null {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) {
      this.amountInput.focus();
      return this.tr.invalidAmount;
    }
    if (!this.entity.person.trim()) return this.tr.specifyPerson;
    return null;
  }

  protected collectData(): DebtRecord {
    const amount = parseAmount(this.amountInput.value);
    return {
      ...this.entity,
      originalAmount: amount,
      amount,
      person: this.entity.person.trim(),
    };
  }

  private personLabel(): string {
    return this.entity.direction === DebtDirection.LENT ? `${this.tr.who} *` : `${this.tr.person} *`;
  }

  private totalLabel(): string {
    return this.entity.direction === DebtDirection.LENT ? this.tr.totalReturnLent : this.tr.totalReturnBorrowed;
  }

  /**
   * Lent/borrowed switch. Lives above the form (like the old layout) and relabels the
   * person and total fields in place, since their wording depends on the direction.
   */
  private buildDirectionToggle(): void {
    const dirRow = this.contentEl.createDiv('finance-type-row');
    const isLent = this.entity.direction === DebtDirection.LENT;

    const lentBtn = dirRow.createEl('button', {
      text: this.tr.lent,
      cls: `finance-type-toggle${isLent ? ' active lent' : ''}`,
    });
    const borrowedBtn = dirRow.createEl('button', {
      text: this.tr.borrowed,
      cls: `finance-type-toggle${isLent ? '' : ' active borrowed'}`,
    });

    const setDirection = (dir: DebtDirection) => {
      this.entity.direction = dir;
      const isLentDir = dir === DebtDirection.LENT;
      lentBtn.classList.toggle('active', isLentDir);
      lentBtn.classList.toggle('lent', isLentDir);
      borrowedBtn.classList.toggle('active', !isLentDir);
      borrowedBtn.classList.toggle('borrowed', !isLentDir);

      const personLabel = this.contentEl.querySelector('.finance-person-label');
      const totalLabel = this.contentEl.querySelector('.finance-total-label');
      if (personLabel) personLabel.textContent = this.personLabel();
      if (totalLabel) totalLabel.textContent = this.totalLabel();
    };

    lentBtn.addEventListener('click', () => setDirection(DebtDirection.LENT));
    borrowedBtn.addEventListener('click', () => setDirection(DebtDirection.BORROWED));

    // The toggle is created before the form div, so move it to the top of the modal body.
    this.contentEl.insertBefore(dirRow, this.formEl);
  }

  private updateTotalReadonly(): void {
    const original = this.entity.originalAmount;
    const rate = this.entity.interestRate;
    const total = rate > 0 ? original + (original * rate / PERCENT_100) : original;
    this.totalInput.value = total > 0 ? fmtAmount(String(total)) : '';
  }
}
