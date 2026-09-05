import { App } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { FinanceRecord, RecordType, PluginSettings, AUTOFILL_BADGE_MS } from './types';
import { parseAmount, getTodayStr, normalizeDateStr, normalizeTimeStr } from './utils';
import { createAmountInput, type AmountInputHandle } from './ui/AmountInput';
import { CalculatorModal } from './CalculatorModal';
import { buildCalculatorIcon } from './ui/icons';
import { buildAttachmentField } from './ui/attachmentField';
import { FinanceBaseModal } from './ui/FinanceBaseModal';
import { buildDateTimeField, buildComboboxField, buildNoteField, buildButtonRow, validateAmountInput } from './ui/formHelpers';
import { RecordType as RecordTypeValue } from './constants';

export interface RecordModalOptions {
  initial:    Partial<FinanceRecord>;
  records:    FinanceRecord[];
  categories: string[];
  tags:       string[];
  payers:     string[];
  currency:   string;
  settings:   PluginSettings;
  pluginId:   string;
  onSave:     (r: FinanceRecord) => void;
}

export class RecordModal extends FinanceBaseModal {
  protected tr: Translations;
  private o:   RecordModalOptions;
  private rec: Partial<FinanceRecord>;

  private amountInput!:      HTMLInputElement;
  private amountHandle!:     AmountInputHandle;
  private incomeBtn!:         HTMLButtonElement;
  private expenseBtn!:        HTMLButtonElement;
  private categoryInput!:     HTMLInputElement;
  private tagInput!:          HTMLInputElement;
  private payerInput!:        HTMLInputElement;
  private autofillBadge!:     HTMLElement;
  private autofillTimer:      ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, opts: RecordModalOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o   = opts;
    this.rec = {
      date: getTodayStr(),
      time: new Date().toTimeString().slice(0, 5),
      type: RecordTypeValue.EXPENSE, amount: 0,
      category: '', tag: '', payer: '', note: '', attachmentPath: '',
      ...opts.initial,
    };
  }

  override onOpen(): void {
    const isEdit = !!this.o.initial.id;
    this.openHeader(isEdit ? '✏️ ' + this.tr.editRecord : '➕ ' + this.tr.newRecord);

    const typeRow    = this.contentEl.createDiv('finance-type-row');
    this.incomeBtn   = typeRow.createEl('button', { cls: 'finance-type-toggle', text: this.tr.income });
    this.expenseBtn  = typeRow.createEl('button', { cls: 'finance-type-toggle', text: this.tr.expense });
    this.applyType(this.rec.type ?? 'expense');
    this.incomeBtn .addEventListener('click', () => { this.applyType('income');  this.updateAmountColor(); });
    this.expenseBtn.addEventListener('click', () => { this.applyType('expense'); this.updateAmountColor(); });

    const form = this.contentEl.createDiv('finance-form');

    const amtG = form.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.amountRequired.replace('{currency}', this.o.currency), cls: 'finance-field-label' });
    const amtRow = amtG.createDiv('finance-amount-row');

    const amountHandle = createAmountInput(amtRow, {
      value: this.rec.amount,
      onChange: v => { this.rec.amount = v; },
      onBlur: () => this.updateAmountColor(),
    });
    this.amountInput = amountHandle.input;
    this.amountHandle = amountHandle;
    this.updateAmountColor();

    const calcIconBtn = amtRow.createEl('button', { cls: 'finance-calc-icon-btn' });
    calcIconBtn.title = this.tr.calculatorTitle;
    buildCalculatorIcon(calcIconBtn);
    calcIconBtn.addEventListener('click', () => {
      const currentValue = this.amountInput.value.replace(/\u00a0/g, '').replace(',', '.');
      new CalculatorModal(this.app, (result) => {
        amountHandle.set(result);
        this.updateAmountColor();
      }, currentValue).open();
    });

    this.autofillBadge = form.createDiv('finance-autofill-badge');
    this.autofillBadge.addClass('is-hidden');

    const grid = form.createDiv('finance-form-grid');

    const normDate = this.rec.date ? normalizeDateStr(this.rec.date) : getTodayStr();
    const normTime = this.rec.time ? normalizeTimeStr(this.rec.time) : '';
    buildDateTimeField(grid, this.tr.dateTime, normDate, normTime, this.tr, (d, t) => {
      this.rec.date = d;
      this.rec.time = t;
    });

    this.payerInput = this.buildAutocomplete(
      grid, this.tr.payer, this.rec.payer ?? '', this.o.payers,
      v => { this.rec.payer = v; this.scheduleAutofill('payer', v); },
      {
        withInternalToggle: true,
        isInternal: !!this.rec.isInternal,
        onToggleInternal: (v) => { this.rec.isInternal = v; },
      },
    );

    this.categoryInput = buildComboboxField(
      grid, this.tr.category, this.rec.category ?? '', () => this.o.categories,
      v => { this.rec.category = v; this.scheduleAutofill('category', v); }
    );

    this.tagInput = buildComboboxField(
      grid, this.tr.tag, this.rec.tag ?? '', () => this.o.tags,
      v => { this.rec.tag = v; }
    );

    buildNoteField(form, {
      label: this.tr.note,
      icon: '📝',
      value: this.rec.note ?? '',
      placeholder: this.tr.notePlaceholder,
      rows: 3,
      onChange: v => { this.rec.note = v; }
    });

    buildAttachmentField(form, {
      app: this.app,
      pluginId: this.o.pluginId,
      tr: this.tr,
      initialPath: this.rec.attachmentPath ?? '',
      onChange: path => { this.rec.attachmentPath = path; },
    });

    buildButtonRow(this.contentEl, this.tr, {
      isEdit,
      onSave: () => this.handleSave(),
      onCancel: () => this.close(),
    });

    setTimeout(() => this.amountInput.focus(), 50);
  }

  private applyType(type: RecordType): void {
    this.rec.type = type;
    this.incomeBtn .classList.toggle('active',  type === RecordTypeValue.INCOME);
    this.incomeBtn .classList.toggle('income',  type === RecordTypeValue.INCOME);
    this.expenseBtn.classList.toggle('active',  type === 'expense');
    this.expenseBtn.classList.toggle('expense', type === 'expense');
  }

  private updateAmountColor(): void {
    if (!this.amountInput) return;
    this.amountInput.classList.toggle('income-color',  this.rec.type === RecordTypeValue.INCOME);
    this.amountInput.classList.toggle('expense-color', this.rec.type === 'expense');
  }

  private buildAutocomplete(
    parent:   HTMLElement,
    label:    string,
    value:    string,
    options:  string[],
    onChange: (v: string) => void,
    opts?: { withInternalToggle?: boolean; isInternal?: boolean; onToggleInternal?: (v: boolean) => void },
  ): HTMLInputElement {
    const input = buildComboboxField(parent, label, value, () => options, onChange);
    if (opts?.withInternalToggle) {
      const wrapper = input.parentElement!;
      let internalState = opts.isInternal ?? false;
      const intBtn = wrapper.createEl('button', {
        type: 'button',
        text: '🔄',
        cls: `finance-internal-btn${internalState ? ' is-active' : ''}`,
        attr: { title: this.tr.internalOpDesc },
      });
      intBtn.addEventListener('click', () => {
        internalState = !internalState;
        opts.onToggleInternal?.(internalState);
        intBtn.classList.toggle('is-active', internalState);
      });
    }
    return input;
  }

  private scheduleAutofill(field: 'category' | 'payer', value: string): void {
    if (this.autofillTimer) clearTimeout(this.autofillTimer);
    this.autofillTimer = setTimeout(() => this.doAutofill(field, value), 350);
  }

  private doAutofill(field: 'category' | 'payer', value: string): void {
    const v = value.trim().toLowerCase();
    if (!v) return;

    const match = [...this.o.records]
      .sort((a, b) => b.createdAt - a.createdAt)
      .find(r => r[field].toLowerCase() === v);
    if (!match) return;

    let filled = false;

    if ((!this.amountInput.value || parseAmount(this.amountInput.value) === 0) && match.amount > 0) {
      this.amountHandle.set(match.amount);
      this.updateAmountColor();
      filled = true;
    }
    if (!this.tagInput.value && match.tag) {
      this.tagInput.value = match.tag;
      this.rec.tag = match.tag;
      filled = true;
    }
    if (field === 'category' && !this.payerInput.value && match.payer) {
      this.payerInput.value = match.payer;
      this.rec.payer = match.payer;
      filled = true;
    }
    if (field === 'payer' && !this.categoryInput.value && match.category) {
      this.categoryInput.value = match.category;
      this.rec.category = match.category;
      filled = true;
    }

    if (filled) {
      this.autofillBadge.removeClass('is-hidden');
      const d = match.date.split('-');
      this.autofillBadge.textContent = this.tr.autofillFromDate.replace('{date}', `${d[2]}.${d[1]}.${d[0]}`);
      setTimeout(() => { this.autofillBadge.addClass('is-hidden'); }, AUTOFILL_BADGE_MS);
    }
  }

  private handleSave(): void {
    const amount = validateAmountInput(this.amountInput, this.tr);
    if (amount === null) return;
    
    const record: FinanceRecord = {
      id:             this.rec.id             ?? crypto.randomUUID(),
      createdAt:      this.rec.createdAt      ?? Date.now(),
      date:           this.rec.date           ?? getTodayStr(),
      time:           this.rec.time           ?? '',
      type:           this.rec.type           ?? 'expense',
      amount,
      category:       this.rec.category?.trim()       ?? '',
      tag:            this.rec.tag?.trim()            ?? '',
      payer:          this.rec.payer?.trim()          ?? '',
      note:           this.rec.note?.trim()           ?? '',
      attachmentPath: this.rec.attachmentPath         ?? '',
      isInternal:     this.rec.isInternal             ?? false,
      linkedId:       this.rec.linkedId             ?? '',
    };
    this.o.onSave(record);
    this.close();
  }
}
