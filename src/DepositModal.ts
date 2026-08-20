import { App, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { DepositRecord, DepositType, DepositAccrualType, FinanceRecord } from './types';
import { getTodayStr, normalizeDateStr, normalizeTimeStr, parseDate } from './utils';
import { FieldInfoModal, DEPOSIT_FIELDS } from './FieldInfoModal';
import { createAmountInput } from './ui/AmountInput';
import { buildAttachmentField } from './ui/attachmentField';
import { FinanceBaseModal } from './ui/FinanceBaseModal';
import { buildDateField, buildNoteField, buildButtonRow, buildComboboxField, buildRateInput, validateAmountInput } from './ui/formHelpers';

export interface DepositModalOptions {
  title:     string;
  deposit?:  DepositRecord;
  banks:     string[];
  pluginId:  string;
  onSave:    (deposit: DepositRecord, interestRecords: FinanceRecord[]) => void;
}

export class DepositModal extends FinanceBaseModal {
  protected tr: Translations;
  private o: DepositModalOptions;
  private deposit: DepositRecord;
  private amountInput!: HTMLInputElement;

  constructor(app: App, opts: DepositModalOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o = opts;
    const nowStr = getTodayStr();
    this.deposit = opts.deposit
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
          name: this.tr.depositDefaultCat,
          type: 'term',
          bankName: '',
          amount: 0,
          interestRate: 0,
          startDate: nowStr,
          termMonths: 12,
          accrualType: 'to_account',
          createdAt: Date.now(),
          note: '',
          status: 'active',
          accruals: [],
          topUps: [],
          withdrawals: [],
        };
  }

  override onOpen(): void {
    this.openHeader(this.o.title);

    const form = this.contentEl.createDiv('finance-form finance-form-grid finance-form-compact');

    const row1 = form.createDiv('finance-form-row finance-full-width');

    const nameG = row1.createDiv('finance-field-group');
    nameG.createEl('label', { text: this.tr.name, cls: 'finance-field-label' });
    const nameIn = nameG.createEl('input', { type: 'text', cls: 'finance-input' });
    nameIn.value = this.deposit.name;
    nameIn.addEventListener('input', () => { this.deposit.name = nameIn.value; });

    buildComboboxField(row1, this.tr.bankName, this.deposit.bankName, () => this.o.banks, v => { this.deposit.bankName = v; });

    const row2 = form.createDiv('finance-form-row finance-full-width');

    const amtG = row2.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.sum, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, {
      value: this.deposit.amount,
      onChange: v => { this.deposit.amount = v; },
    }).input;

    buildRateInput(row2, this.tr.interestRate + ' (%)', this.deposit.interestRate, {
      onInput: rate => { this.deposit.interestRate = rate; },
      onBlur: rate => { this.deposit.interestRate = rate; },
    });

    const row3 = form.createDiv('finance-form-row finance-full-width');

    buildDateField(row3, this.tr.startDate, this.deposit.startDate, v => { this.deposit.startDate = v; });

    const termG = row3.createDiv('finance-field-group');
    termG.createEl('label', { text: this.tr.termLabel, cls: 'finance-field-label' });
    const termIn = termG.createEl('input', { type: 'number', cls: 'finance-input' });
    termIn.value = String(this.deposit.termMonths || 12);
    termIn.setAttribute('min', '1');
    termIn.setAttribute('max', '360');
    termIn.addEventListener('change', () => { this.deposit.termMonths = parseInt(termIn.value) || 12; });

    const row4 = form.createDiv('finance-form-row finance-full-width');

    const typeG = row4.createDiv('finance-field-group');
    typeG.createEl('label', { text: this.tr.depositType, cls: 'finance-field-label' });
    const typeSel = typeG.createEl('select', { cls: 'finance-input finance-filter-select' });
    const types: { value: DepositType; label: string }[] = [
      { value: 'term', label: this.tr.depositTypeTerm },
      { value: 'demand', label: this.tr.depositTypeDemand },
      { value: 'savings', label: this.tr.depositTypeSavings },
    ];
    types.forEach(t => {
      const opt = typeSel.createEl('option', { value: t.value, text: t.label });
      if (t.value === this.deposit.type) opt.selected = true;
    });
    typeSel.addEventListener('change', () => { this.deposit.type = typeSel.value as DepositType; });

    const accrualG = row4.createDiv('finance-field-group');
    accrualG.createEl('label', { text: this.tr.accrualType, cls: 'finance-field-label' });
    const accrualSel = accrualG.createEl('select', { cls: 'finance-input finance-filter-select' });
    const accrualTypes: { value: DepositAccrualType; label: string }[] = [
      { value: 'to_account', label: this.tr.accrualToAccount },
      { value: 'capitalization', label: this.tr.accrualCapitalization },
    ];
    accrualTypes.forEach(t => {
      const opt = accrualSel.createEl('option', { value: t.value, text: t.label });
      if (t.value === this.deposit.accrualType) opt.selected = true;
    });

    accrualSel.addEventListener('change', () => {
      this.deposit.accrualType = accrualSel.value as DepositAccrualType;
    });

    const row5 = form.createDiv('finance-form-row finance-full-width');
    buildNoteField(row5, {
      label: this.tr.note,
      value: this.deposit.note,
      placeholder: this.tr.optional,
      rows: 2,
      onChange: v => { this.deposit.note = v; }
    });

    const rowAttach = form.createDiv('finance-form-row finance-full-width');
    buildAttachmentField(rowAttach, {
      app: this.app,
      pluginId: this.o.pluginId,
      tr: this.tr,
      initialPath: this.deposit.attachmentPath ?? '',
      onChange: path => { this.deposit.attachmentPath = path; },
    });

    buildButtonRow(this.contentEl, this.tr, {
      onCancel: () => this.close(),
      onSave: () => this.handleSave(),
    });
    
    const btnRow = this.contentEl.querySelector('.finance-modal-btns');
    if (btnRow) {
      const infoBtn = document.createElement('button');
      infoBtn.textContent = '❓';
      infoBtn.className = 'finance-btn-cancel finance-info-btn-left';
      infoBtn.addEventListener('click', () => new FieldInfoModal(this.app, DEPOSIT_FIELDS).open());
      btnRow.prepend(infoBtn);
    }
  }

  private handleSave(): void {
    const amount = validateAmountInput(this.amountInput, this.tr);
    if (amount === null) return;
    
    if (!this.deposit.bankName.trim()) {
      new Notice(this.tr.specifyBank);
      return;
    }
    this.deposit.bankName = this.deposit.bankName.trim();
    
    if (!this.deposit.name.trim()) {
      this.deposit.name = this.tr.depositDefaultCat;
    }
    this.deposit.name = this.deposit.name.trim();

    if (!this.deposit.startDate || !parseDate(this.deposit.startDate)) {
      new Notice(this.tr.specifyValidDate);
      return;
    }

    this.o.onSave(this.deposit, []);
    this.close();
  }
}
