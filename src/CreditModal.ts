import { App, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { CreditRecord, CreditType, PERCENT_100 } from './types';
import { calculateAnnuityPayment, generateAnnuitySchedule } from './domain/creditCalculations';
import { fmtAmount, parseAmount, getTodayStr, normalizeDateStr } from './utils';
import { parseDateStr } from './domain/dateMath';
import { round2 } from './domain/money';
import { FieldInfoModal, CREDIT_FIELDS } from './FieldInfoModal';
import { createAmountInput, type AmountInputHandle } from './ui/AmountInput';
import { buildAttachmentField } from './ui/attachmentField';
import { FinanceBaseModal } from './ui/FinanceBaseModal';
import { buildDateField, buildNoteField, buildButtonRow, buildComboboxField, validateAmountInput } from './ui/formHelpers';
import { CreditStatus, RecordType } from './constants';

export interface CreditModalOptions {
  title:     string;
  credit?:   CreditRecord;
  banks:     string[];
  pluginId:  string;
  records:   any[]; // FinanceRecord[]
  onSave:    (credit: CreditRecord, updatedRecords: any[]) => void;
}

export class CreditModal extends FinanceBaseModal {
  protected tr: Translations;
  private o: CreditModalOptions;
  private credit: CreditRecord;
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
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o = opts;
    const nowStr = getTodayStr();
    this.credit = opts.credit
      ? {
          ...opts.credit,
          startDate: normalizeDateStr(opts.credit.startDate),
          downPaymentDate: opts.credit.downPaymentDate ? normalizeDateStr(opts.credit.downPaymentDate) : '',
          payments: opts.credit.payments.map(p => ({
            ...p,
            dueDate: normalizeDateStr(p.dueDate),
            paidDate: p.paidDate ? normalizeDateStr(p.paidDate) : undefined,
          }))
        }
      : {
          id: crypto.randomUUID(),
          name: this.tr.creditDefaultCat,
          type: 'consumer',
          bankName: '',
          originalAmount: 0,
          currentAmount: 0,
          interestRate: 0,
          monthlyPayment: 0,
          termMonths: 12,
          startDate: nowStr,
          createdAt: Date.now(),
          note: '',
          status: CreditStatus.ACTIVE,
          earlyRepaymentOption: null,
          payments: [],
          purchasePrice: 0,
          downPayment: 0,
          downPaymentType: 'amount',
          downPaymentValue: 0,
          downPaymentDate: '',
          downPaymentRecordId: undefined,
          isEscrow: false,
        };
  }

  override onOpen(): void {
    this.openHeader(this.o.title);

    const form = this.contentEl.createDiv('finance-form finance-form-grid finance-form-compact');

    const row1 = form.createDiv('finance-form-row finance-full-width');

    const nameG = row1.createDiv('finance-field-group');
    nameG.createEl('label', { text: this.tr.name, cls: 'finance-field-label' });
    const nameIn = nameG.createEl('input', { type: 'text', cls: 'finance-input' });
    nameIn.value = this.credit.name;
    nameIn.addEventListener('input', () => { this.credit.name = nameIn.value; });

    buildComboboxField(row1, this.tr.bankName + ' *', this.credit.bankName, () => this.o.banks, v => { this.credit.bankName = v; });

    const row2 = form.createDiv('finance-form-row finance-full-width');

    const amtG = row2.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.purchasePriceLabel, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, {
      value: this.credit.purchasePrice ?? 0,
      onChange: v => { this.credit.purchasePrice = v; this.scheduleCalc(); },
      onBlur: () => { this.updateCalculatedValues(); this.scheduleCalc(); },
    }).input;

    const rateG = row2.createDiv('finance-field-group');
    rateG.createEl('label', { text: this.tr.interestRate + ' (%)', cls: 'finance-field-label' });
    this.rateInput = rateG.createEl('input', { type: 'text', cls: 'finance-input' });
    this.rateInput.setAttribute('inputmode', 'decimal');
    this.rateInput.setAttribute('placeholder', '0');
    this.rateInput.setAttribute('autocomplete', 'off');

    if (this.credit.interestRate > 0) {
      this.rateInput.value = String(this.credit.interestRate);
    }

    this.rateInput.addEventListener('input', () => {
      const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.credit.interestRate = rate;
      this.scheduleCalc();
    });

    this.rateInput.addEventListener('blur', () => {
      const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.credit.interestRate = rate;
      this.rateInput.value = rate > 0 ? String(rate) : '';
      this.updateCalculatedValues();
      this.scheduleCalc();
    });

    const rowDp = form.createDiv('finance-form-row finance-full-width');

    const dpValG = rowDp.createDiv('finance-field-group');
    dpValG.createEl('label', { text: this.tr.downPaymentLabel, cls: 'finance-field-label' });
    
    const dpInputWrap = dpValG.createDiv('finance-input-with-select');

    this.downPaymentValueInput = dpInputWrap.createEl('input', { type: 'text', cls: 'finance-input finance-input-grow' });
    this.downPaymentValueInput.setAttribute('inputmode', 'decimal');
    this.downPaymentValueInput.setAttribute('placeholder', '0');
    this.downPaymentValueInput.setAttribute('autocomplete', 'off');
    if ((this.credit.downPaymentValue ?? 0) > 0) {
      this.downPaymentValueInput.value = this.credit.downPaymentType === 'amount' 
        ? fmtAmount(String(this.credit.downPaymentValue))
        : String(this.credit.downPaymentValue);
    }

    const btnGroup = dpInputWrap.createDiv('finance-btn-group');

    const amtBtn = btnGroup.createEl('button', {
      text: '💵',
      cls: `finance-type-toggle${this.credit.downPaymentType === 'amount' ? ' active' : ''}`,
    });
    amtBtn.setAttribute('type', 'button');
    amtBtn.addClass('finance-dp-toggle');

    const pctBtn = btnGroup.createEl('button', {
      text: '%',
      cls: `finance-type-toggle${this.credit.downPaymentType === 'percent' ? ' active' : ''}`,
    });
    pctBtn.setAttribute('type', 'button');
    pctBtn.addClass('finance-dp-toggle', 'finance-dp-toggle-pct');

    const dpDateG = rowDp.createDiv('finance-field-group');
    dpDateG.createEl('label', { text: this.tr.downPaymentDateLabel, cls: 'finance-field-label' });
    this.downPaymentDateInput = dpDateG.createEl('input', { type: 'date', cls: 'finance-input' });
    this.downPaymentDateInput.value = this.credit.downPaymentDate ? normalizeDateStr(this.credit.downPaymentDate) : '';

    this.downPaymentValueInput.addEventListener('focus', () => {
      if ((this.credit.downPaymentValue ?? 0) > 0) {
        this.downPaymentValueInput.value = String(this.credit.downPaymentValue).replace('.', ',');
      }
    });

    const onDpBlurOrChange = () => {
      const type = this.credit.downPaymentType;
      let rawVal = parseAmount(this.downPaymentValueInput.value);
      
      if (type === 'percent' && rawVal > PERCENT_100) {
        rawVal = PERCENT_100;
      }
      
      this.credit.downPaymentValue = rawVal;
      
      if (rawVal > 0) {
        this.downPaymentValueInput.value = type === 'amount' ? fmtAmount(String(rawVal)) : String(rawVal);
      } else {
        this.downPaymentValueInput.value = '';
      }
      this.updateCalculatedValues();
      this.scheduleCalc();
    };

    const setDpType = (type: 'amount' | 'percent') => {
      this.credit.downPaymentType = type;
      amtBtn.classList.toggle('active', type === 'amount');
      pctBtn.classList.toggle('active', type === 'percent');
      onDpBlurOrChange();
    };

    amtBtn.addEventListener('click', (e) => { e.preventDefault(); setDpType('amount'); });
    pctBtn.addEventListener('click', (e) => { e.preventDefault(); setDpType('percent'); });

    this.downPaymentValueInput.addEventListener('blur', onDpBlurOrChange);
    this.downPaymentDateInput.addEventListener('change', () => {
      this.credit.downPaymentDate = this.downPaymentDateInput.value ? normalizeDateStr(this.downPaymentDateInput.value) : '';
    });

    const rowInfo = form.createDiv('finance-form-row finance-full-width finance-row-info');
    this.finalAmountDisplay = rowInfo.createDiv('finance-final-amount-info');
    this.updateCalculatedValues();

    const row3 = form.createDiv('finance-form-row finance-full-width');

    const paymentG = row3.createDiv('finance-field-group finance-amount-group');
    paymentG.createEl('label', { text: this.tr.monthlyPayment, cls: 'finance-field-label' });
    this.paymentHandle = createAmountInput(paymentG, {
      value: this.credit.monthlyPayment,
      onChange: v => { this.credit.monthlyPayment = v; },
    });

    const termG = row3.createDiv('finance-field-group');
    termG.createEl('label', { text: this.tr.termLabel, cls: 'finance-field-label' });
    this.termInput = termG.createEl('input', { type: 'number', cls: 'finance-input' });
    this.termInput.value = String(this.credit.termMonths || 12);
    this.termInput.setAttribute('min', '1');
    this.termInput.setAttribute('max', '360');
    this.termInput.addEventListener('change', () => { this.credit.termMonths = parseInt(this.termInput.value) || 12; });
    this.termInput.addEventListener('input', () => this.scheduleCalc());

    const row4 = form.createDiv('finance-form-row finance-full-width');
    buildDateField(row4, this.tr.startDate, this.credit.startDate, v => { this.credit.startDate = v; });

    const typeG = row4.createDiv('finance-field-group');
    typeG.createEl('label', { text: this.tr.creditTypeLabel, cls: 'finance-field-label' });
    const typeSel = typeG.createEl('select', { cls: 'finance-input finance-filter-select' });
    const types: { value: CreditType; label: string }[] = [
      { value: 'consumer', label: this.tr.creditTypeConsumer },
      { value: 'auto', label: this.tr.creditTypeAuto },
      { value: 'mortgage', label: this.tr.creditTypeMortgage },
    ];
    types.forEach(t => {
      const opt = typeSel.createEl('option', { value: t.value, text: t.label });
      if (t.value === this.credit.type) opt.selected = true;
    });

    const row42 = form.createDiv('finance-form-row finance-full-width');
    const pdG = row42.createDiv('finance-field-group');
    pdG.createEl('label', { text: this.tr.paymentDayLabel, cls: 'finance-field-label' });
    this.paymentDayInput = pdG.createEl('input', { type: 'number', cls: 'finance-input' });
    this.paymentDayInput.setAttribute('min', '1');
    this.paymentDayInput.setAttribute('max', '31');
    const defaultDay = this.credit.paymentDay ?? (parseDateStr(this.credit.startDate)?.day ?? 1);
    this.paymentDayInput.value = String(defaultDay);
    this.credit.paymentDay ??= defaultDay;
    this.paymentDayInput.addEventListener('change', () => {
      const v = parseInt(this.paymentDayInput.value);
      this.credit.paymentDay = (v >= 1 && v <= 31) ? v : defaultDay;
    });

    const rowEscrow = form.createDiv('finance-form-row finance-full-width');
    const escrowG = rowEscrow.createDiv('finance-field-group finance-full-width');
    const escrowLabel = escrowG.createEl('label', { cls: 'finance-checkbox-label finance-escrow-label' });
    const escrowCheck = escrowLabel.createEl('input', { type: 'checkbox', cls: 'finance-checkbox' });
    escrowCheck.checked = this.credit.isEscrow ?? false;
    escrowLabel.createSpan({ text: this.tr.isEscrowLabel });
    escrowG.createEl('p', { text: this.tr.isEscrowDesc, cls: 'finance-field-hint' });

    const setEscrowRowVisible = (visible: boolean) => {
      rowEscrow.style.display = visible ? '' : 'none';
    };
    setEscrowRowVisible(this.credit.type === 'mortgage');

    escrowCheck.addEventListener('change', () => { this.credit.isEscrow = escrowCheck.checked; });

    typeSel.addEventListener('change', () => {
      this.credit.type = typeSel.value as CreditType;
      const isMortgage = this.credit.type === 'mortgage';
      setEscrowRowVisible(isMortgage);
      if (!isMortgage) {
        this.credit.isEscrow = false;
        escrowCheck.checked = false;
      }
    });

    const row5 = form.createDiv('finance-form-row finance-full-width');
    buildNoteField(row5, {
      label: this.tr.note,
      value: this.credit.note,
      placeholder: this.tr.optional,
      rows: 2,
      onChange: v => { this.credit.note = v; }
    });

    const rowAttach = form.createDiv('finance-form-row finance-full-width');
    buildAttachmentField(rowAttach, {
      app: this.app,
      pluginId: this.o.pluginId,
      tr: this.tr,
      initialPath: this.credit.attachmentPath ?? '',
      onChange: path => { this.credit.attachmentPath = path; },
    });

    buildButtonRow(this.contentEl, this.tr, {
      onCancel: () => this.close(),
      onSave: () => this.handleSave(),
    });
    
    // Add info button manually to the btn row
    const btnRow = this.contentEl.querySelector('.finance-modal-btns');
    if (btnRow) {
      const infoBtn = document.createElement('button');
      infoBtn.textContent = '❓';
      infoBtn.className = 'finance-btn-cancel finance-info-btn-left';
      infoBtn.addEventListener('click', () => new FieldInfoModal(this.app, CREDIT_FIELDS).open());
      btnRow.prepend(infoBtn);
    }
  }

  private scheduleCalc(): void {
    if (this.calcTimer) clearTimeout(this.calcTimer);
    this.calcTimer = setTimeout(() => this.calcMonthlyPayment(), 500);
  }

  private updateCalculatedValues(): void {
    const purchase = parseAmount(this.amountInput.value);
    this.credit.purchasePrice = purchase;

    const dpVal = this.credit.downPaymentValue ?? 0;
    const dpType = this.credit.downPaymentType ?? 'amount';

    let dpAmount = 0;
    if (dpType === 'percent') {
      dpAmount = round2(purchase * (dpVal / PERCENT_100));
    } else {
      dpAmount = dpVal;
    }

    this.credit.downPayment = dpAmount;
    this.credit.originalAmount = Math.max(0, round2(purchase - dpAmount));

    this.finalAmountDisplay.textContent = `${this.tr.finalAmountLabel}: ${fmtAmount(String(this.credit.originalAmount))}`;
  }

  private calcMonthlyPayment(): void {
    const amount = this.credit.originalAmount;
    const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
    const term = parseInt(this.termInput.value) || 0;
    if (amount <= 0 || term <= 0) return;
    const payment = calculateAnnuityPayment(amount, rate, term);
    this.paymentHandle.set(payment);
  }

  private handleSave(): void {
    const amount = validateAmountInput(this.amountInput, this.tr);
    if (amount === null) return;
    
    this.credit.purchasePrice = amount;

    // Validate Down Payment
    const dpVal = this.credit.downPayment ?? 0;
    const dpDate = this.credit.downPaymentDate;
    if (dpVal <= 0) {
      // Clear amount/value but preserve date if user set one
      this.credit.downPayment = 0;
      this.credit.downPaymentValue = 0;
      // Only clear date if it was never set
      if (!dpDate) {
        this.credit.downPaymentDate = '';
      }
    } else {
      if (!dpDate) {
        new Notice(this.tr.downPaymentDateRequired);
        this.downPaymentDateInput.focus();
        return;
      }
    }

    const loanPrincipal = this.credit.originalAmount;
    if (!loanPrincipal || loanPrincipal <= 0) {
      new Notice(this.tr.invalidAmount);
      this.amountInput.focus();
      return;
    }
    if (!this.credit.bankName.trim()) {
      new Notice(this.tr.specifyBank);
      return;
    }
    this.credit.bankName = this.credit.bankName.trim();
    if (!this.credit.name.trim()) {
      this.credit.name = this.tr.creditDefaultCat;
    }
    this.credit.name = this.credit.name.trim();

    if (this.credit.termMonths > 0 && this.credit.monthlyPayment > 0) {
      const scheduleResult = generateAnnuitySchedule({
        originalAmount: this.credit.originalAmount,
        interestRate: this.credit.interestRate,
        termMonths: this.credit.termMonths,
        monthlyPayment: this.credit.monthlyPayment,
        startDate: this.credit.startDate,
        paymentDay: this.credit.paymentDay,
        existingPayments: this.credit.payments,
      });
      this.credit.payments = scheduleResult.payments;
      this.credit.currentAmount = scheduleResult.currentAmount;
    } else {
      this.credit.currentAmount = this.credit.originalAmount;
    }

    // Manage Down Payment Transaction
    let updatedRecords = [...this.o.records];
    if (dpVal > 0 && dpDate) {
      if (this.credit.downPaymentRecordId) {
        const existingDpRec = updatedRecords.find(r => r.id === this.credit.downPaymentRecordId);
        if (existingDpRec) {
          existingDpRec.date = dpDate;
          existingDpRec.amount = dpVal;
          existingDpRec.payer = this.credit.bankName;
          existingDpRec.note = this.tr.downPaymentNotePrefix + this.credit.name;
        } else {
          updatedRecords.push({
            id: this.credit.downPaymentRecordId,
            createdAt: Date.now(),
            date: dpDate,
            time: '',
            type: RecordType.EXPENSE,
            amount: dpVal,
            category: this.tr.creditDefaultCat,
            tag: '',
            payer: this.credit.bankName,
            note: this.tr.downPaymentNotePrefix + this.credit.name,
            attachmentPath: '',
          });
        }
      } else {
        const newDpId = crypto.randomUUID();
        this.credit.downPaymentRecordId = newDpId;
        updatedRecords.push({
          id: newDpId,
          createdAt: Date.now(),
          date: dpDate,
          time: '',
          type: RecordType.EXPENSE,
          amount: dpVal,
          category: this.tr.creditDefaultCat,
          tag: '',
          payer: this.credit.bankName,
          note: this.tr.downPaymentNotePrefix + this.credit.name,
          attachmentPath: '',
        });
      }
    } else {
      if (this.credit.downPaymentRecordId) {
        updatedRecords = updatedRecords.filter(r => r.id !== this.credit.downPaymentRecordId);
        this.credit.downPaymentRecordId = undefined;
      }
    }

    this.o.onSave(this.credit, updatedRecords);
    this.close();
  }
}
