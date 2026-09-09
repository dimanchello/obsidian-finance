import { App } from 'obsidian';
import {
  CreditRecord, CreditType, DownPaymentType, PERCENT_100,
  DEPOSIT_TERM_DEFAULT_MONTHS, DEPOSIT_TERM_MAX_MONTHS,
  CREDIT_CALC_DEBOUNCE_MS, DAY_OF_MONTH_MAX,
} from './types';
import { calculateAnnuityPayment, generateAnnuitySchedule } from './domain/creditCalculations';
import { fmtAmount, parseAmount, getTodayStr, normalizeDateStr } from './utils';
import { parseDateStr } from './domain/dateMath';
import { round2 } from './domain/money';
import { CREDIT_FIELDS, type FieldDef } from './FieldInfoModal';
import { createAmountInput, type AmountInputHandle } from './ui/AmountInput';
import { buildAttachmentField } from './ui/attachmentField';
import { EntityModal } from './ui/EntityModal';
import { buildDateField, buildNoteField, buildComboboxField } from './ui/formHelpers';
import { CreditStatus } from './constants';

export interface CreditModalOptions {
  title:     string;
  credit?:   CreditRecord;
  banks:     string[];
  pluginId:  string;
  onSave:    (credit: CreditRecord) => void;
}

export class CreditModal extends EntityModal<CreditRecord> {
  private o: CreditModalOptions;
  private amountInput!: HTMLInputElement;
  private paymentHandle!: AmountInputHandle;
  private rateInput!: HTMLInputElement;
  private termInput!: HTMLInputElement;
  private downPaymentValueInput!: HTMLInputElement;
  private downPaymentDateInput!: HTMLInputElement;
  private paymentDayInput!: HTMLInputElement;
  private finalAmountDisplay!: HTMLElement;
  private calcTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, opts: CreditModalOptions) {
    const tr = EntityModal.translationsFor(app);
    super(app, {
      entity: opts.credit
        ? {
            ...opts.credit,
            startDate: normalizeDateStr(opts.credit.startDate),
            downPaymentDate: opts.credit.downPaymentDate
              ? normalizeDateStr(opts.credit.downPaymentDate)
              : '',
            payments: opts.credit.payments.map(p => ({
              ...p,
              dueDate: normalizeDateStr(p.dueDate),
              paidDate: p.paidDate ? normalizeDateStr(p.paidDate) : undefined,
            })),
          }
        : {
            id: crypto.randomUUID(),
            name: tr.creditDefaultCat,
            type: CreditType.CONSUMER,
            bankName: '',
            originalAmount: 0,
            currentAmount: 0,
            interestRate: 0,
            monthlyPayment: 0,
            termMonths: DEPOSIT_TERM_DEFAULT_MONTHS,
            startDate: getTodayStr(),
            createdAt: Date.now(),
            note: '',
            status: CreditStatus.ACTIVE,
            earlyRepaymentOption: null,
            payments: [],
            purchasePrice: 0,
            downPayment: 0,
            downPaymentType: DownPaymentType.AMOUNT,
            downPaymentValue: 0,
            downPaymentDate: '',
            isEscrow: false,
          },
      isEdit: !!opts.credit,
      onSave: opts.onSave,
    });
    this.o = opts;
  }

  protected getTitle(): string { return this.o.title; }

  protected override getInfoFields(): FieldDef[] { return CREDIT_FIELDS; }

  protected buildForm(form: HTMLElement): void {
    form.addClasses(['finance-form-grid', 'finance-form-compact']);

    const row1 = form.createDiv('finance-form-row finance-full-width');

    const nameG = row1.createDiv('finance-field-group');
    nameG.createEl('label', { text: this.tr.name, cls: 'finance-field-label' });
    const nameIn = nameG.createEl('input', { type: 'text', cls: 'finance-input' });
    nameIn.value = this.entity.name;
    nameIn.addEventListener('input', () => { this.entity.name = nameIn.value; });

    buildComboboxField(row1, this.tr.bankName + ' *', this.entity.bankName,
      () => this.o.banks, v => { this.entity.bankName = v; });

    const row2 = form.createDiv('finance-form-row finance-full-width');

    const amtG = row2.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.purchasePriceLabel, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, {
      value: this.entity.purchasePrice ?? 0,
      onChange: v => { this.entity.purchasePrice = v; this.scheduleCalc(); },
      onBlur: () => { this.updateCalculatedValues(); this.scheduleCalc(); },
    }).input;

    this.buildRateField(row2);
    this.buildDownPaymentRow(form);

    const rowInfo = form.createDiv('finance-form-row finance-full-width finance-row-info');
    this.finalAmountDisplay = rowInfo.createDiv('finance-final-amount-info');
    this.updateCalculatedValues();

    const row3 = form.createDiv('finance-form-row finance-full-width');

    const paymentG = row3.createDiv('finance-field-group finance-amount-group');
    paymentG.createEl('label', { text: this.tr.monthlyPayment, cls: 'finance-field-label' });
    this.paymentHandle = createAmountInput(paymentG, {
      value: this.entity.monthlyPayment,
      onChange: v => { this.entity.monthlyPayment = v; },
    });

    const termG = row3.createDiv('finance-field-group');
    termG.createEl('label', { text: this.tr.termLabel, cls: 'finance-field-label' });
    this.termInput = termG.createEl('input', { type: 'number', cls: 'finance-input' });
    this.termInput.value = String(this.entity.termMonths || DEPOSIT_TERM_DEFAULT_MONTHS);
    this.termInput.setAttribute('min', '1');
    this.termInput.setAttribute('max', String(DEPOSIT_TERM_MAX_MONTHS));
    this.termInput.addEventListener('change', () => {
      this.entity.termMonths = parseInt(this.termInput.value) || DEPOSIT_TERM_DEFAULT_MONTHS;
    });
    this.termInput.addEventListener('input', () => this.scheduleCalc());

    const row4 = form.createDiv('finance-form-row finance-full-width');
    buildDateField(row4, this.tr.startDate, this.entity.startDate, v => { this.entity.startDate = v; });

    const typeSel = this.buildTypeSelect(row4);

    this.buildPaymentDayField(form);
    this.buildEscrowRow(form, typeSel);

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

  private buildRateField(parent: HTMLElement): void {
    const rateG = parent.createDiv('finance-field-group');
    rateG.createEl('label', { text: this.tr.interestRate + ' (%)', cls: 'finance-field-label' });
    this.rateInput = rateG.createEl('input', { type: 'text', cls: 'finance-input' });
    this.rateInput.setAttribute('inputmode', 'decimal');
    this.rateInput.setAttribute('placeholder', '0');
    this.rateInput.setAttribute('autocomplete', 'off');

    if (this.entity.interestRate > 0) {
      this.rateInput.value = String(this.entity.interestRate);
    }

    this.rateInput.addEventListener('input', () => {
      this.entity.interestRate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.scheduleCalc();
    });

    this.rateInput.addEventListener('blur', () => {
      const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.entity.interestRate = rate;
      this.rateInput.value = rate > 0 ? String(rate) : '';
      this.updateCalculatedValues();
      this.scheduleCalc();
    });
  }

  private buildTypeSelect(parent: HTMLElement): HTMLSelectElement {
    const typeG = parent.createDiv('finance-field-group');
    typeG.createEl('label', { text: this.tr.creditTypeLabel, cls: 'finance-field-label' });
    const typeSel = typeG.createEl('select', { cls: 'finance-input finance-filter-select' });
    const types: { value: CreditType; label: string }[] = [
      { value: CreditType.CONSUMER, label: this.tr.creditTypeConsumer },
      { value: CreditType.AUTO, label: this.tr.creditTypeAuto },
      { value: CreditType.MORTGAGE, label: this.tr.creditTypeMortgage },
    ];
    types.forEach(t => {
      const opt = typeSel.createEl('option', { value: t.value, text: t.label });
      if (t.value === this.entity.type) opt.selected = true;
    });
    return typeSel;
  }

  private buildPaymentDayField(form: HTMLElement): void {
    const row = form.createDiv('finance-form-row finance-full-width');
    const pdG = row.createDiv('finance-field-group');
    pdG.createEl('label', { text: this.tr.paymentDayLabel, cls: 'finance-field-label' });
    this.paymentDayInput = pdG.createEl('input', { type: 'number', cls: 'finance-input' });
    this.paymentDayInput.setAttribute('min', '1');
    this.paymentDayInput.setAttribute('max', String(DAY_OF_MONTH_MAX));

    const defaultDay = this.entity.paymentDay ?? (parseDateStr(this.entity.startDate)?.day ?? 1);
    this.paymentDayInput.value = String(defaultDay);
    this.entity.paymentDay ??= defaultDay;

    this.paymentDayInput.addEventListener('change', () => {
      const v = parseInt(this.paymentDayInput.value);
      this.entity.paymentDay = (v >= 1 && v <= DAY_OF_MONTH_MAX) ? v : defaultDay;
    });
  }

  /** Escrow only applies to mortgages, so the row is hidden for other credit types. */
  private buildEscrowRow(form: HTMLElement, typeSel: HTMLSelectElement): void {
    const rowEscrow = form.createDiv('finance-form-row finance-full-width');
    const escrowG = rowEscrow.createDiv('finance-field-group finance-full-width');
    const escrowLabel = escrowG.createEl('label', { cls: 'finance-checkbox-label finance-escrow-label' });
    const escrowCheck = escrowLabel.createEl('input', { type: 'checkbox', cls: 'finance-checkbox' });
    escrowCheck.checked = this.entity.isEscrow ?? false;
    escrowLabel.createSpan({ text: this.tr.isEscrowLabel });
    escrowG.createEl('p', { text: this.tr.isEscrowDesc, cls: 'finance-field-hint' });

    const setVisible = (visible: boolean) => {
      rowEscrow.toggleClass('is-hidden', !visible);
    };
    setVisible(this.entity.type === CreditType.MORTGAGE);

    escrowCheck.addEventListener('change', () => { this.entity.isEscrow = escrowCheck.checked; });

    typeSel.addEventListener('change', () => {
      this.entity.type = typeSel.value as CreditType;
      const isMortgage = this.entity.type === CreditType.MORTGAGE;
      setVisible(isMortgage);
      if (!isMortgage) {
        this.entity.isEscrow = false;
        escrowCheck.checked = false;
      }
    });
  }

  /** Down payment: an amount or a percent of the purchase price, plus the date it was paid. */
  private buildDownPaymentRow(form: HTMLElement): void {
    const rowDp = form.createDiv('finance-form-row finance-full-width');

    const dpValG = rowDp.createDiv('finance-field-group');
    dpValG.createEl('label', { text: this.tr.downPaymentLabel, cls: 'finance-field-label' });

    const dpInputWrap = dpValG.createDiv('finance-input-with-select');

    this.downPaymentValueInput = dpInputWrap.createEl('input', {
      type: 'text', cls: 'finance-input finance-input-grow',
    });
    this.downPaymentValueInput.setAttribute('inputmode', 'decimal');
    this.downPaymentValueInput.setAttribute('placeholder', '0');
    this.downPaymentValueInput.setAttribute('autocomplete', 'off');
    if ((this.entity.downPaymentValue ?? 0) > 0) {
      this.downPaymentValueInput.value = this.entity.downPaymentType === DownPaymentType.AMOUNT
        ? fmtAmount(String(this.entity.downPaymentValue))
        : String(this.entity.downPaymentValue);
    }

    const btnGroup = dpInputWrap.createDiv('finance-btn-group');

    const amtBtn = btnGroup.createEl('button', {
      text: '💵',
      cls: `finance-type-toggle${this.entity.downPaymentType === DownPaymentType.AMOUNT ? ' active' : ''}`,
    });
    amtBtn.setAttribute('type', 'button');
    amtBtn.addClass('finance-dp-toggle');

    const pctBtn = btnGroup.createEl('button', {
      text: '%',
      cls: `finance-type-toggle${this.entity.downPaymentType === DownPaymentType.PERCENT ? ' active' : ''}`,
    });
    pctBtn.setAttribute('type', 'button');
    pctBtn.addClass('finance-dp-toggle', 'finance-dp-toggle-pct');

    const dpDateG = rowDp.createDiv('finance-field-group');
    dpDateG.createEl('label', { text: this.tr.downPaymentDateLabel, cls: 'finance-field-label' });
    this.downPaymentDateInput = dpDateG.createEl('input', { type: 'date', cls: 'finance-input' });
    this.downPaymentDateInput.value = this.entity.downPaymentDate
      ? normalizeDateStr(this.entity.downPaymentDate)
      : '';

    // Editing shows the raw number; blur re-applies thousands grouping.
    this.downPaymentValueInput.addEventListener('focus', () => {
      if ((this.entity.downPaymentValue ?? 0) > 0) {
        this.downPaymentValueInput.value = String(this.entity.downPaymentValue).replace('.', ',');
      }
    });

    const onDpBlurOrChange = () => {
      const type = this.entity.downPaymentType;
      let rawVal = parseAmount(this.downPaymentValueInput.value);
      if (type === DownPaymentType.PERCENT && rawVal > PERCENT_100) rawVal = PERCENT_100;

      this.entity.downPaymentValue = rawVal;
      this.downPaymentValueInput.value = rawVal > 0
        ? (type === DownPaymentType.AMOUNT ? fmtAmount(String(rawVal)) : String(rawVal))
        : '';

      this.updateCalculatedValues();
      this.scheduleCalc();
    };

    const setDpType = (type: DownPaymentType) => {
      this.entity.downPaymentType = type;
      amtBtn.classList.toggle('active', type === DownPaymentType.AMOUNT);
      pctBtn.classList.toggle('active', type === DownPaymentType.PERCENT);
      onDpBlurOrChange();
    };

    amtBtn.addEventListener('click', e => { e.preventDefault(); setDpType(DownPaymentType.AMOUNT); });
    pctBtn.addEventListener('click', e => { e.preventDefault(); setDpType(DownPaymentType.PERCENT); });

    this.downPaymentValueInput.addEventListener('blur', onDpBlurOrChange);
    this.downPaymentDateInput.addEventListener('change', () => {
      this.entity.downPaymentDate = this.downPaymentDateInput.value
        ? normalizeDateStr(this.downPaymentDateInput.value)
        : '';
    });
  }

  private scheduleCalc(): void {
    if (this.calcTimer) clearTimeout(this.calcTimer);
    this.calcTimer = setTimeout(() => this.calcMonthlyPayment(), CREDIT_CALC_DEBOUNCE_MS);
  }

  /** Purchase price − down payment = loan principal, shown live under the amount fields. */
  private updateCalculatedValues(): void {
    const purchase = parseAmount(this.amountInput.value);
    this.entity.purchasePrice = purchase;

    const dpVal = this.entity.downPaymentValue ?? 0;
    const dpType = this.entity.downPaymentType ?? DownPaymentType.AMOUNT;
    const dpAmount = dpType === DownPaymentType.PERCENT ? round2(purchase * (dpVal / PERCENT_100)) : dpVal;

    this.entity.downPayment = dpAmount;
    this.entity.originalAmount = Math.max(0, round2(purchase - dpAmount));

    this.finalAmountDisplay.textContent =
      `${this.tr.finalAmountLabel}: ${fmtAmount(String(this.entity.originalAmount))}`;
  }

  private calcMonthlyPayment(): void {
    const amount = this.entity.originalAmount;
    const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
    const term = parseInt(this.termInput.value) || 0;
    if (amount <= 0 || term <= 0) return;
    this.paymentHandle.set(calculateAnnuityPayment(amount, rate, term));
  }

  protected validate(): string | null {
    const purchase = parseAmount(this.amountInput.value);
    if (!purchase || purchase <= 0) {
      this.amountInput.focus();
      return this.tr.invalidAmount;
    }

    // A down payment without a date cannot be mirrored into a record.
    if ((this.entity.downPayment ?? 0) > 0 && !this.entity.downPaymentDate) {
      this.downPaymentDateInput.focus();
      return this.tr.downPaymentDateRequired;
    }

    if (this.entity.originalAmount <= 0) {
      this.amountInput.focus();
      return this.tr.invalidAmount;
    }

    if (!this.entity.bankName.trim()) return this.tr.specifyBank;

    return null;
  }

  protected collectData(): CreditRecord {
    const credit: CreditRecord = {
      ...this.entity,
      purchasePrice: parseAmount(this.amountInput.value),
      bankName: this.entity.bankName.trim(),
      name: this.entity.name.trim() || this.tr.creditDefaultCat,
    };

    // No down payment: zero out the value but keep a date the user deliberately entered.
    if ((credit.downPayment ?? 0) <= 0) {
      credit.downPayment = 0;
      credit.downPaymentValue = 0;
    }

    if (credit.termMonths > 0 && credit.monthlyPayment > 0) {
      const schedule = generateAnnuitySchedule({
        originalAmount: credit.originalAmount,
        interestRate: credit.interestRate,
        termMonths: credit.termMonths,
        monthlyPayment: credit.monthlyPayment,
        startDate: credit.startDate,
        paymentDay: credit.paymentDay,
        existingPayments: credit.payments,
      });
      credit.payments = schedule.payments;
      credit.currentAmount = schedule.currentAmount;
    } else {
      credit.currentAmount = credit.originalAmount;
    }

    return credit;
  }
}
