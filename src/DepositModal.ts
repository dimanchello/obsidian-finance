import { App } from 'obsidian';
import { DepositRecord, DepositType, DepositAccrualType, DepositStatus } from './types';
import { getTodayStr, normalizeDateStr, normalizeTimeStr, parseAmount, parseDate } from './utils';
import { DEPOSIT_FIELDS, type FieldDef } from './FieldInfoModal';
import { createAmountInput } from './ui/AmountInput';
import { buildAttachmentField } from './ui/attachmentField';
import { EntityModal } from './ui/EntityModal';
import { buildDateField, buildNoteField, buildComboboxField, buildRateInput } from './ui/formHelpers';
import { DEPOSIT_TERM_DEFAULT_MONTHS, DEPOSIT_TERM_MAX_MONTHS } from './types';

export interface DepositModalOptions {
  title:     string;
  deposit?:  DepositRecord;
  banks:     string[];
  pluginId:  string;
  onSave:    (deposit: DepositRecord) => void;
}

export class DepositModal extends EntityModal<DepositRecord> {
  private o: DepositModalOptions;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: DepositModalOptions) {
    const tr = EntityModal.translationsFor(app);
    super(app, {
      entity: opts.deposit
        ? {
            ...opts.deposit,
            startDate: normalizeDateStr(opts.deposit.startDate),
            accruals: opts.deposit.accruals.map(a => ({
              ...a,
              dueDate: normalizeDateStr(a.dueDate),
              paidDate: a.paidDate ? normalizeDateStr(a.paidDate) : undefined,
            })),
            topUps: (opts.deposit.topUps || []).map(t => ({
              ...t,
              date: normalizeDateStr(t.date),
              time: normalizeTimeStr(t.time || ''),
            })),
            withdrawals: (opts.deposit.withdrawals || []).map(w => ({
              ...w,
              date: normalizeDateStr(w.date),
              time: normalizeTimeStr(w.time || ''),
            })),
          }
        : {
            id: crypto.randomUUID(),
            name: tr.depositDefaultCat,
            type: DepositType.TERM,
            bankName: '',
            amount: 0,
            interestRate: 0,
            startDate: getTodayStr(),
            termMonths: DEPOSIT_TERM_DEFAULT_MONTHS,
            accrualType: DepositAccrualType.TO_ACCOUNT,
            createdAt: Date.now(),
            note: '',
            status: DepositStatus.ACTIVE,
            accruals: [],
            topUps: [],
            withdrawals: [],
          },
      isEdit: !!opts.deposit,
      onSave: opts.onSave,
    });
    this.o = opts;
  }

  protected getTitle(): string { return this.o.title; }

  protected override getInfoFields(): FieldDef[] { return DEPOSIT_FIELDS; }

  protected buildForm(form: HTMLElement): void {
    form.addClasses(['finance-form-grid', 'finance-form-compact']);

    const row1 = form.createDiv('finance-form-row finance-full-width');

    const nameG = row1.createDiv('finance-field-group');
    nameG.createEl('label', { text: this.tr.name, cls: 'finance-field-label' });
    const nameIn = nameG.createEl('input', { type: 'text', cls: 'finance-input' });
    nameIn.value = this.entity.name;
    nameIn.addEventListener('input', () => { this.entity.name = nameIn.value; });

    buildComboboxField(row1, this.tr.bankName, this.entity.bankName,
      () => this.o.banks, v => { this.entity.bankName = v; });

    const row2 = form.createDiv('finance-form-row finance-full-width');

    const amtG = row2.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.sum, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, {
      value: this.entity.amount,
      onChange: v => { this.entity.amount = v; },
    }).input;

    buildRateInput(row2, this.tr.interestRate + ' (%)', this.entity.interestRate, {
      onInput: rate => { this.entity.interestRate = rate; },
      onBlur: rate => { this.entity.interestRate = rate; },
    });

    const row3 = form.createDiv('finance-form-row finance-full-width');

    buildDateField(row3, this.tr.startDate, this.entity.startDate, v => { this.entity.startDate = v; });

    const termG = row3.createDiv('finance-field-group');
    termG.createEl('label', { text: this.tr.termLabel, cls: 'finance-field-label' });
    const termIn = termG.createEl('input', { type: 'number', cls: 'finance-input' });
    termIn.value = String(this.entity.termMonths || DEPOSIT_TERM_DEFAULT_MONTHS);
    termIn.setAttribute('min', '1');
    termIn.setAttribute('max', String(DEPOSIT_TERM_MAX_MONTHS));
    termIn.addEventListener('change', () => {
      this.entity.termMonths = parseInt(termIn.value) || DEPOSIT_TERM_DEFAULT_MONTHS;
    });

    const row4 = form.createDiv('finance-form-row finance-full-width');

    const typeG = row4.createDiv('finance-field-group');
    typeG.createEl('label', { text: this.tr.depositType, cls: 'finance-field-label' });
    const typeSel = typeG.createEl('select', { cls: 'finance-input finance-filter-select' });
    const types: { value: DepositType; label: string }[] = [
      { value: DepositType.TERM, label: this.tr.depositTypeTerm },
      { value: DepositType.DEMAND, label: this.tr.depositTypeDemand },
      { value: DepositType.SAVINGS, label: this.tr.depositTypeSavings },
    ];
    types.forEach(t => {
      const opt = typeSel.createEl('option', { value: t.value, text: t.label });
      if (t.value === this.entity.type) opt.selected = true;
    });
    typeSel.addEventListener('change', () => { this.entity.type = typeSel.value as DepositType; });

    const accrualG = row4.createDiv('finance-field-group');
    accrualG.createEl('label', { text: this.tr.accrualType, cls: 'finance-field-label' });
    const accrualSel = accrualG.createEl('select', { cls: 'finance-input finance-filter-select' });
    const accrualTypes: { value: DepositAccrualType; label: string }[] = [
      { value: DepositAccrualType.TO_ACCOUNT, label: this.tr.accrualToAccount },
      { value: DepositAccrualType.CAPITALIZATION, label: this.tr.accrualCapitalization },
    ];
    accrualTypes.forEach(t => {
      const opt = accrualSel.createEl('option', { value: t.value, text: t.label });
      if (t.value === this.entity.accrualType) opt.selected = true;
    });
    accrualSel.addEventListener('change', () => {
      this.entity.accrualType = accrualSel.value as DepositAccrualType;
    });

    const row5 = form.createDiv('finance-form-row finance-full-width');
    buildNoteField(row5, {
      label: this.tr.note,
      value: this.entity.note,
      placeholder: this.tr.optional,
      rows: 2,
      onChange: v => { this.entity.note = v; },
    });

    const rowAttach = form.createDiv('finance-form-row finance-full-width');
    buildAttachmentField(rowAttach, {
      app: this.app,
      pluginId: this.o.pluginId,
      tr: this.tr,
      initialPath: this.entity.attachmentPath ?? '',
      onChange: path => { this.entity.attachmentPath = path; },
    });
  }

  protected validate(): string | null {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) {
      this.amountInput.focus();
      return this.tr.invalidAmount;
    }
    if (!this.entity.bankName.trim()) return this.tr.specifyBank;
    if (!this.entity.startDate || !parseDate(this.entity.startDate)) return this.tr.specifyValidDate;
    return null;
  }

  protected collectData(): DepositRecord {
    return {
      ...this.entity,
      amount: parseAmount(this.amountInput.value),
      bankName: this.entity.bankName.trim(),
      name: this.entity.name.trim() || this.tr.depositDefaultCat,
    };
  }
}
