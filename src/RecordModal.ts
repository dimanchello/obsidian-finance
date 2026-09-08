import { App } from 'obsidian';
import {
  FinanceRecord, RecordType, PluginSettings,
  AUTOFILL_BADGE_MS, AUTOFILL_DEBOUNCE_MS, MODAL_FOCUS_DELAY_MS,
} from './types';
import { parseAmount, getTodayStr, getTodayTime, normalizeDateStr, normalizeTimeStr } from './utils';
import { createAmountInput, type AmountInputHandle } from './ui/AmountInput';
import { CalculatorModal } from './CalculatorModal';
import { buildCalculatorIcon } from './ui/icons';
import { buildAttachmentField } from './ui/attachmentField';
import { EntityModal } from './ui/EntityModal';
import { buildDateTimeField, buildComboboxField, buildNoteField } from './ui/formHelpers';

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

export class RecordModal extends EntityModal<FinanceRecord> {
  private o:   RecordModalOptions;

  private amountInput!:      HTMLInputElement;
  private amountHandle!:     AmountInputHandle;
  private incomeBtn!:        HTMLButtonElement;
  private expenseBtn!:       HTMLButtonElement;
  private categoryInput!:    HTMLInputElement;
  private tagInput!:         HTMLInputElement;
  private payerInput!:       HTMLInputElement;
  private autofillBadge!:    HTMLElement;
  private autofillTimer:     ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, opts: RecordModalOptions) {
    super(app, {
      entity: {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        date: getTodayStr(),
        time: getTodayTime(),
        type: RecordType.EXPENSE,
        amount: 0,
        category: '', tag: '', payer: '', note: '', attachmentPath: '',
        isInternal: false,
        linkedId: '',
        ...opts.initial,
      },
      isEdit: !!opts.initial.id,
      onSave: opts.onSave,
    });
    this.o = opts;
  }

  protected getTitle(): string {
    return this.isEdit ? '✏️ ' + this.tr.editRecord : '➕ ' + this.tr.newRecord;
  }

  protected buildForm(form: HTMLElement): void {
    this.buildTypeToggle();

    const amtG = form.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', {
      text: this.tr.amountRequired.replace('{currency}', this.o.currency),
      cls: 'finance-field-label',
    });
    const amtRow = amtG.createDiv('finance-amount-row');

    const amountHandle = createAmountInput(amtRow, {
      value: this.entity.amount,
      onChange: v => { this.entity.amount = v; },
      onBlur: () => this.updateAmountColor(),
    });
    this.amountInput = amountHandle.input;
    this.amountHandle = amountHandle;
    this.updateAmountColor();

    const calcIconBtn = amtRow.createEl('button', { cls: 'finance-calc-icon-btn' });
    calcIconBtn.title = this.tr.calculatorTitle;
    buildCalculatorIcon(calcIconBtn);
    calcIconBtn.addEventListener('click', () => {
      const currentValue = this.amountInput.value.replace(/ /g, '').replace(',', '.');
      new CalculatorModal(this.app, result => {
        amountHandle.set(result);
        this.updateAmountColor();
      }, currentValue).open();
    });

    this.autofillBadge = form.createDiv('finance-autofill-badge');
    this.autofillBadge.addClass('is-hidden');

    const grid = form.createDiv('finance-form-grid');

    const normDate = this.entity.date ? normalizeDateStr(this.entity.date) : getTodayStr();
    const normTime = this.entity.time ? normalizeTimeStr(this.entity.time) : '';
    buildDateTimeField(grid, this.tr.dateTime, normDate, normTime, this.tr, (d, t) => {
      this.entity.date = d;
      this.entity.time = t;
    });

    this.payerInput = this.buildAutocomplete(
      grid, this.tr.payer, this.entity.payer, this.o.payers,
      v => { this.entity.payer = v; this.scheduleAutofill('payer', v); },
      {
        withInternalToggle: true,
        isInternal: !!this.entity.isInternal,
        onToggleInternal: v => { this.entity.isInternal = v; },
      },
    );

    this.categoryInput = buildComboboxField(
      grid, this.tr.category, this.entity.category, () => this.o.categories,
      v => { this.entity.category = v; this.scheduleAutofill('category', v); }
    );

    this.tagInput = buildComboboxField(
      grid, this.tr.tag, this.entity.tag, () => this.o.tags,
      v => { this.entity.tag = v; }
    );

    buildNoteField(form, {
      label: this.tr.note,
      icon: '📝',
      value: this.entity.note,
      placeholder: this.tr.notePlaceholder,
      rows: 3,
      onChange: v => { this.entity.note = v; },
    });

    buildAttachmentField(form, {
      app: this.app,
      pluginId: this.o.pluginId,
      tr: this.tr,
      initialPath: this.entity.attachmentPath ?? '',
      onChange: path => { this.entity.attachmentPath = path; },
    });
  }

  protected override onFormReady(): void {
    setTimeout(() => this.amountInput.focus(), MODAL_FOCUS_DELAY_MS);
  }

  protected validate(): string | null {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) {
      this.amountInput.focus();
      return this.tr.invalidAmount;
    }
    return null;
  }

  protected collectData(): FinanceRecord {
    return {
      ...this.entity,
      amount: parseAmount(this.amountInput.value),
      category: this.entity.category.trim(),
      tag: this.entity.tag.trim(),
      payer: this.entity.payer.trim(),
      note: this.entity.note.trim(),
    };
  }

  /** Income/expense switch; sits above the form, like the other entity type toggles. */
  private buildTypeToggle(): void {
    const typeRow = this.contentEl.createDiv('finance-type-row');
    this.incomeBtn = typeRow.createEl('button', { cls: 'finance-type-toggle', text: this.tr.income });
    this.expenseBtn = typeRow.createEl('button', { cls: 'finance-type-toggle', text: this.tr.expense });
    this.applyType(this.entity.type);
    this.incomeBtn.addEventListener('click', () => { this.applyType(RecordType.INCOME); this.updateAmountColor(); });
    this.expenseBtn.addEventListener('click', () => { this.applyType(RecordType.EXPENSE); this.updateAmountColor(); });
    this.contentEl.insertBefore(typeRow, this.formEl);
  }

  private applyType(type: RecordType): void {
    this.entity.type = type;
    this.incomeBtn.classList.toggle('active', type === RecordType.INCOME);
    this.incomeBtn.classList.toggle('income', type === RecordType.INCOME);
    this.expenseBtn.classList.toggle('active', type === RecordType.EXPENSE);
    this.expenseBtn.classList.toggle('expense', type === RecordType.EXPENSE);
  }

  private updateAmountColor(): void {
    if (!this.amountInput) return;
    this.amountInput.classList.toggle('income-color', this.entity.type === RecordType.INCOME);
    this.amountInput.classList.toggle('expense-color', this.entity.type === RecordType.EXPENSE);
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
    this.autofillTimer = setTimeout(() => this.doAutofill(field, value), AUTOFILL_DEBOUNCE_MS);
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
      this.entity.tag = match.tag;
      filled = true;
    }
    if (field === 'category' && !this.payerInput.value && match.payer) {
      this.payerInput.value = match.payer;
      this.entity.payer = match.payer;
      filled = true;
    }
    if (field === 'payer' && !this.categoryInput.value && match.category) {
      this.categoryInput.value = match.category;
      this.entity.category = match.category;
      filled = true;
    }

    if (filled) {
      this.autofillBadge.removeClass('is-hidden');
      const d = match.date.split('-');
      this.autofillBadge.textContent = this.tr.autofillFromDate.replace('{date}', `${d[2]}.${d[1]}.${d[0]}`);
      setTimeout(() => { this.autofillBadge.addClass('is-hidden'); }, AUTOFILL_BADGE_MS);
    }
  }
}
