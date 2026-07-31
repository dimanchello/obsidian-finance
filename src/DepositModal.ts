import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { DepositRecord, DepositType, DepositAccrualType, FinanceRecord } from './types';
import { parseAmount, getTodayStr, normalizeDateStr, normalizeTimeStr, parseDate } from './utils';
import { FieldInfoModal, DEPOSIT_FIELDS } from './FieldInfoModal';
import { attachAutocomplete } from './ui/Combobox';
import { createAmountInput } from './ui/AmountInput';

export interface DepositModalOptions {
  title:     string;
  deposit?:  DepositRecord;
  banks:     string[];
  onSave:    (deposit: DepositRecord, interestRecords: FinanceRecord[]) => void;
}

export class DepositModal extends Modal {
  private tr: Translations;
  private o: DepositModalOptions;
  private deposit: DepositRecord;
  private amountInput!: HTMLInputElement;
  private rateInput!: HTMLInputElement;

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
          name: 'Вклад',
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

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h2', { text: this.o.title, cls: 'finance-modal-title' });

    const form = contentEl.createDiv('finance-form finance-form-grid finance-form-compact');

    const row1 = form.createDiv('finance-form-row finance-full-width');

    const nameG = row1.createDiv('finance-field-group');
    nameG.createEl('label', { text: this.tr.name, cls: 'finance-field-label' });
    const nameIn = nameG.createEl('input', { type: 'text', cls: 'finance-input' });
    nameIn.value = this.deposit.name;
    nameIn.addEventListener('input', () => { this.deposit.name = nameIn.value; });

    const bankG = row1.createDiv('finance-field-group');
    bankG.createEl('label', { text: this.tr.bankName, cls: 'finance-field-label' });
    const bankWrap = bankG.createDiv('finance-combobox');
    const bankIn = bankWrap.createEl('input', { type: 'text', cls: 'finance-input finance-combobox-input' });
    bankIn.value = this.deposit.bankName;
    bankIn.setAttribute('autocomplete', 'off');

    attachAutocomplete(bankIn, {
      options: () => this.o.banks,
      onPick: v => { this.deposit.bankName = v; },
      createLabel: q => `➕ "${q}"`,
    });

    const row2 = form.createDiv('finance-form-row finance-full-width');

    const amtG = row2.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.sum, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, {
      value: this.deposit.amount,
      onChange: v => { this.deposit.amount = v; },
    }).input;

    const rateG = row2.createDiv('finance-field-group');
    rateG.createEl('label', { text: this.tr.interestRate + ' (%)', cls: 'finance-field-label' });
    this.rateInput = rateG.createEl('input', { type: 'text', cls: 'finance-input' });
    this.rateInput.setAttribute('inputmode', 'decimal');
    this.rateInput.setAttribute('placeholder', '0');
    this.rateInput.setAttribute('autocomplete', 'off');
    if (this.deposit.interestRate > 0) {
      this.rateInput.value = String(this.deposit.interestRate);
    }
    this.rateInput.addEventListener('input', () => {
      const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.deposit.interestRate = rate;
    });
    this.rateInput.addEventListener('blur', () => {
      const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.deposit.interestRate = rate;
      this.rateInput.value = rate > 0 ? String(rate) : '';
    });

    const row3 = form.createDiv('finance-form-row finance-full-width');

    const dateG = row3.createDiv('finance-field-group');
    dateG.createEl('label', { text: this.tr.startDate, cls: 'finance-field-label' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    dateIn.value = normalizeDateStr(this.deposit.startDate);
    dateIn.addEventListener('change', () => { this.deposit.startDate = normalizeDateStr(dateIn.value); });

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
    const noteG = row5.createDiv('finance-field-group');
    noteG.createEl('label', { text: this.tr.note, cls: 'finance-field-label' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = this.tr.optional;
    noteIn.value = this.deposit.note;
    noteIn.rows = 2;
    noteIn.addEventListener('input', () => { this.deposit.note = noteIn.value; });

    const btnRow = contentEl.createDiv('finance-modal-btns');
    const infoBtn = btnRow.createEl('button', { text: '❓', cls: 'finance-btn-cancel' });
    infoBtn.style.marginRight = 'auto';
    infoBtn.addEventListener('click', () => new FieldInfoModal(this.app, DEPOSIT_FIELDS).open());
    btnRow.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
        .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: this.tr.save, cls: 'finance-btn-save' })
        .addEventListener('click', () => this.handleSave());
  }

  private handleSave(): void {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) {
      new Notice(this.tr.invalidAmount);
      this.amountInput.focus();
      return;
    }
    if (!this.deposit.bankName.trim()) {
      new Notice(this.tr.specifyBank);
      return;
    }
    this.deposit.bankName = this.deposit.bankName.trim();
    if (!this.deposit.name.trim()) {
      this.deposit.name = 'Вклад';
    }
    this.deposit.name = this.deposit.name.trim();

    if (!this.deposit.startDate || !parseDate(this.deposit.startDate)) {
      new Notice(this.tr.specifyValidDate);
      return;
    }

    this.o.onSave(this.deposit, []);
    this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}
