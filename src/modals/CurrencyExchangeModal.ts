import { App, Notice } from 'obsidian';
import { CurrencyExchange, CurrencyOperationType } from '../types';
import { getCurrencyBalance } from '../domain/currencyBalance';
import { CURRENCY_ROUNDING_PRECISION, EXCHANGE_RATE_PRECISION } from '../types';
import { getTodayStr, normalizeTimeStr, normalizeDateStr } from '../utils';
import { Translations } from '../i18n';
import { createAmountInput, type AmountInputHandle } from '../ui/AmountInput';
import { FieldInfoModal, CURRENCY_FIELDS } from '../FieldInfoModal';
import { buildAttachmentField } from '../ui/attachmentField';
import { FinanceBaseModal } from '../ui/FinanceBaseModal';
import { buildDateTimeField, buildComboboxField, buildNoteField, buildButtonRow } from '../ui/formHelpers';

export interface CurrencyExchangeModalOptions {
  initial?: Partial<CurrencyExchange>;
  exchanges: CurrencyExchange[];
  providers: string[];
  categories: string[];
  currencies: string[];
  accountCurrency: string;
  tr: Translations;
  pluginId: string;
  onSave: (exchange: CurrencyExchange) => Promise<void>;
}

export class CurrencyExchangeModal extends FinanceBaseModal {
  protected tr: Translations;
  private options: CurrencyExchangeModalOptions;
  
  private type: CurrencyOperationType = 'buy';
  private date: string = getTodayStr();
  private time = '';
  private targetCurrency = '';
  private amountInAccountCurrency = 0;
  private targetAmount = 0;
  private exchangeRate = 0;
  private provider = '';
  private category = '';
  private fee: number | undefined = undefined;
  private note = '';
  private isCalculating = false;
  
  private lastEditedFields: ('amountInAccountCurrency' | 'targetAmount' | 'exchangeRate')[] = [];

  private attachmentPath = '';

  private targetAmountHandle?: AmountInputHandle;
  private accAmountHandle?: AmountInputHandle;
  private rateInput?: HTMLInputElement;
  
  constructor(app: App, options: CurrencyExchangeModalOptions) {
    super(app);
    this.options = options;
    this.tr = options.tr;
    
    if (options.initial) {
      if (options.initial.type) this.type = options.initial.type;
      if (options.initial.date) this.date = options.initial.date;
      if (options.initial.time) this.time = options.initial.time;
      if (options.initial.targetCurrency) this.targetCurrency = options.initial.targetCurrency;
      if (options.initial.amountInAccountCurrency !== undefined) this.amountInAccountCurrency = options.initial.amountInAccountCurrency;
      if (options.initial.targetAmount !== undefined) this.targetAmount = options.initial.targetAmount;
      if (options.initial.exchangeRate !== undefined) this.exchangeRate = options.initial.exchangeRate;
      if (options.initial.provider) this.provider = options.initial.provider;
      if (options.initial.category) this.category = options.initial.category;
      if (options.initial.fee !== undefined) this.fee = options.initial.fee;
      if (options.initial.note) this.note = options.initial.note;
      if (options.initial.attachmentPath) this.attachmentPath = options.initial.attachmentPath;
    } else {
      const now = new Date();
      this.time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (options.currencies.length > 0) {
        this.targetCurrency = options.currencies[0] ?? '';
      }
    }
  }

  override onOpen() {
    this.render();
  }

  private render() {
    const { contentEl, tr } = this;
    contentEl.empty();
    
    const isEdit = !!this.options.initial?.id;
    this.openHeader(isEdit ? '✏️ ' + tr.edit : '➕ ' + tr.newCurrencyExchange);

    const form = contentEl.createDiv('finance-form');

    if (this.type === 'sell' || this.type === 'spend') {
      const balance = getCurrencyBalance(this.options.exchanges, this.targetCurrency);
      const balanceDiv = form.createDiv();
      balanceDiv.style.fontSize = '0.9em';
      balanceDiv.style.color = 'var(--text-muted)';
      balanceDiv.style.marginBottom = '15px';
      balanceDiv.style.textAlign = 'right';
      balanceDiv.setText(tr.availableBalance.replace('{amount}', balance.toFixed(2)).replace('{currency}', this.targetCurrency || '?'));
    }

    let amountTgtLabel = '';
    if (this.type === 'buy') amountTgtLabel = tr.targetAmountBuy.replace('{currency}', this.targetCurrency || '?');
    else if (this.type === 'sell') amountTgtLabel = tr.targetAmountSell.replace('{currency}', this.targetCurrency || '?');
    else if (this.type === 'spend') amountTgtLabel = tr.targetAmountSpend.replace('{currency}', this.targetCurrency || '?');
    else if (this.type === 'add') amountTgtLabel = tr.targetAmountAdd.replace('{currency}', this.targetCurrency || '?');
    
    const amountsContainer = form.createDiv(this.type === 'buy' || this.type === 'sell' ? 'finance-form-grid' : '');
    
    const tgtAmtG = amountsContainer.createDiv('finance-field-group finance-amount-group');
    tgtAmtG.createEl('label', { text: amountTgtLabel, cls: 'finance-field-label' });
    const tgtAmtRow = tgtAmtG.createDiv('finance-amount-row');
    this.targetAmountHandle = createAmountInput(tgtAmtRow, {
      value: this.targetAmount,
      onChange: v => {
        this.targetAmount = v;
        this.markFieldEdited('targetAmount');
        this.recalculateFields();
      },
    });
    this.targetAmountHandle.input.classList.add(this.type === 'buy' || this.type === 'add' ? 'income-color' : 'expense-color');

    if (this.type === 'buy' || this.type === 'sell') {
      let amountAccLabel = '';
      if (this.type === 'buy') amountAccLabel = tr.amountSpent + ` (${this.options.accountCurrency})`;
      else if (this.type === 'sell') amountAccLabel = tr.amountReceived + ` (${this.options.accountCurrency})`;

      const accAmtG = amountsContainer.createDiv('finance-field-group finance-amount-group');
      accAmtG.createEl('label', { text: amountAccLabel, cls: 'finance-field-label' });
      const accAmtRow = accAmtG.createDiv('finance-amount-row');
      this.accAmountHandle = createAmountInput(accAmtRow, {
        value: this.amountInAccountCurrency,
        onChange: v => {
          this.amountInAccountCurrency = v;
          this.markFieldEdited('amountInAccountCurrency');
          this.recalculateFields();
        },
      });
      this.accAmountHandle.input.classList.add(this.type === 'buy' ? 'expense-color' : 'income-color');
    }

    const grid = form.createDiv('finance-form-grid');

    const normDate = this.date ? normalizeDateStr(this.date) : getTodayStr();
    const normTime = this.time ? normalizeTimeStr(this.time) : '';
    buildDateTimeField(grid, tr.dateTime, normDate, normTime, tr, (d, t) => {
      this.date = d;
      this.time = t;
    });

    buildComboboxField(grid, tr.currency, this.targetCurrency, () => this.options.currencies, v => {
      this.targetCurrency = v;
      this.autofillFromHistoryByCurrency();
      this.render();
    });

    if (this.type === 'buy' || this.type === 'sell') {
      const rateG = grid.createDiv('finance-field-group');
      rateG.createEl('label', { text: tr.rateLabel.replace('{currency}', this.targetCurrency || '?').replace('{accountCurrency}', this.options.accountCurrency), cls: 'finance-field-label' });
      this.rateInput = rateG.createEl('input', { type: 'text', cls: 'finance-input', attr: { inputmode: 'decimal' } });
      this.rateInput.value = this.exchangeRate ? String(this.exchangeRate) : '';
      this.rateInput.addEventListener('input', () => {
        const raw = this.rateInput!.value;
        if (raw.includes(',')) {
          this.rateInput!.classList.add('finance-input-error');
        } else {
          this.rateInput!.classList.remove('finance-input-error');
        }
        const val = parseFloat(raw);
        this.exchangeRate = isNaN(val) ? 0 : val;
        this.markFieldEdited('exchangeRate');
        this.recalculateFields();
      });

      const feeG = grid.createDiv('finance-field-group');
      feeG.createEl('label', { text: tr.feeLabel + ` (${this.options.accountCurrency})`, cls: 'finance-field-label' });
      const feeIn = feeG.createEl('input', { type: 'text', cls: 'finance-input', attr: { inputmode: 'decimal' } });
      feeIn.value = this.fee ? String(this.fee) : '';
      feeIn.addEventListener('input', () => {
        const raw = feeIn.value;
        if (raw.includes(',')) {
          feeIn.classList.add('finance-input-error');
        } else {
          feeIn.classList.remove('finance-input-error');
        }
        const val = parseFloat(raw);
        this.fee = isNaN(val) ? undefined : val;
      });
    }

    let providerLabel = tr.provider;
    if (this.type === 'add') providerLabel = tr.sourceLabel;
    if (this.type === 'spend') providerLabel = tr.whereSpent;

    buildComboboxField(grid, providerLabel, this.provider, () => this.options.providers, v => {
      this.provider = v;
      this.autofillFromHistoryByProvider();
    });

    if (this.type === 'add' || this.type === 'spend') {
      buildComboboxField(grid, tr.category + (this.type === 'spend' ? ' *' : ''), this.category, () => this.options.categories, v => {
        this.category = v;
      });
    }

    let placeholder = '';
    if (this.type === 'buy') placeholder = tr.placeholderBuy;
    if (this.type === 'sell') placeholder = tr.placeholderSell;
    if (this.type === 'add') placeholder = tr.placeholderAdd;
    if (this.type === 'spend') placeholder = tr.placeholderSpend;

    buildNoteField(form, {
      label: tr.note,
      icon: '📝',
      value: this.note,
      placeholder: placeholder,
      rows: 3,
      onChange: v => { this.note = v; }
    });

    buildAttachmentField(form, {
      app: this.app,
      pluginId: this.options.pluginId,
      tr: this.options.tr,
      initialPath: this.attachmentPath,
      onChange: path => { this.attachmentPath = path; },
    });

    buildButtonRow(contentEl, tr, {
      isEdit,
      onSave: async () => {
        try {
          await this.handleSave();
          this.close();
        } catch (e: any) {
          new Notice(e.message);
        }
      },
      onCancel: () => this.close(),
    });
    
    // Add info button manually to the btn row
    const btnRow = contentEl.querySelector('.finance-modal-btns');
    if (btnRow) {
      const infoBtn = document.createElement('button');
      infoBtn.textContent = '❓';
      infoBtn.className = 'finance-btn-cancel finance-info-btn-left';
      infoBtn.addEventListener('click', () => new FieldInfoModal(this.app, CURRENCY_FIELDS).open());
      btnRow.prepend(infoBtn);
    }
  }

  private markFieldEdited(field: 'amountInAccountCurrency' | 'targetAmount' | 'exchangeRate') {
    if (this.isCalculating) return;
    this.lastEditedFields = this.lastEditedFields.filter(f => f !== field);
    this.lastEditedFields.unshift(field);
    if (this.lastEditedFields.length > 2) {
      this.lastEditedFields.pop();
    }
  }
  
  private recalculateFields() {
    if (this.isCalculating) return;
    if (this.lastEditedFields.length < 2) return;
    
    this.isCalculating = true;
    try {
      const [last, prev] = this.lastEditedFields;
      
      const calculateField = (field: 'amountInAccountCurrency' | 'targetAmount' | 'exchangeRate') => {
        if (field === 'amountInAccountCurrency') {
          if (this.targetAmount > 0 && this.exchangeRate > 0) {
            this.amountInAccountCurrency = Math.round((this.targetAmount * this.exchangeRate) * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION;
          }
        } else if (field === 'targetAmount') {
          if (this.amountInAccountCurrency > 0 && this.exchangeRate > 0) {
            this.targetAmount = Math.round((this.amountInAccountCurrency / this.exchangeRate) * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION;
          }
        } else if (field === 'exchangeRate') {
          if (this.amountInAccountCurrency > 0 && this.targetAmount > 0) {
            this.exchangeRate = Math.round((this.amountInAccountCurrency / this.targetAmount) * EXCHANGE_RATE_PRECISION) / EXCHANGE_RATE_PRECISION;
          }
        }
        
        if (field === 'amountInAccountCurrency' && this.accAmountHandle) {
          this.accAmountHandle.set(this.amountInAccountCurrency);
        } else if (field === 'targetAmount' && this.targetAmountHandle) {
          this.targetAmountHandle.set(this.targetAmount);
        } else if (field === 'exchangeRate' && this.rateInput) {
          this.rateInput.value = String(this.exchangeRate);
        }
      };
      
      const fields: ('amountInAccountCurrency' | 'targetAmount' | 'exchangeRate')[] = ['amountInAccountCurrency', 'targetAmount', 'exchangeRate'];
      const toCalculate = fields.find(f => f !== last && f !== prev);
      
      if (toCalculate) {
        calculateField(toCalculate);
      }
    } finally {
      this.isCalculating = false;
    }
  }

  private autofillFromHistoryByCurrency() {
    if (this.options.initial?.id) return; // Don't autofill when editing
    
    const lastOp = this.options.exchanges
      .filter(e => e.targetCurrency === this.targetCurrency && e.type === this.type)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
      
    if (lastOp) {
      if (!this.provider) this.provider = lastOp.provider;
      if (!this.exchangeRate) {
        this.exchangeRate = lastOp.exchangeRate;
        this.markFieldEdited('exchangeRate');
      }
    }
  }

  private autofillFromHistoryByProvider() {
    if (this.options.initial?.id) return;

    const lastOp = this.options.exchanges
      .filter(e => e.provider === this.provider && e.type === this.type)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (lastOp) {
      if (!this.targetCurrency) this.targetCurrency = lastOp.targetCurrency;
      if (!this.exchangeRate) {
        this.exchangeRate = lastOp.exchangeRate;
        this.markFieldEdited('exchangeRate');
      }
    }
  }

  private async handleSave() {
    const { tr } = this.options;
    
    if (this.targetAmount <= 0 || isNaN(this.targetAmount)) {
      throw new Error(tr.invalidAmount);
    }
    
    if (this.type === 'buy' || this.type === 'sell') {
      if (this.amountInAccountCurrency <= 0 || isNaN(this.amountInAccountCurrency)) {
        throw new Error(tr.invalidAmount);
      }
      if (this.exchangeRate <= 0 || isNaN(this.exchangeRate)) {
        throw new Error(tr.invalidAmount);
      }
    }
    
    if (this.type === 'sell' || this.type === 'spend') {
      const currentBalance = getCurrencyBalance(this.options.exchanges, this.targetCurrency);

      let effectiveBalance = currentBalance;
      if (this.options.initial?.targetCurrency === this.targetCurrency &&
          (this.options.initial.type === 'sell' || this.options.initial.type === 'spend')) {
        effectiveBalance += this.options.initial.targetAmount ?? 0;
      }

      if (effectiveBalance < this.targetAmount) {
        throw new Error(`${tr.insufficientBalance}. ${tr.availableBalance.replace('{amount}', effectiveBalance.toFixed(2)).replace('{currency}', this.targetCurrency)}`);
      }
    }
    
    if (this.type === 'spend' && !this.category) {
      throw new Error(tr.categoryRequired);
    }

    if (!this.targetCurrency.trim()) {
      throw new Error(tr.invalidAmount);
    }

    const exchange: CurrencyExchange = {
      id: this.options.initial?.id ?? crypto.randomUUID(),
      createdAt: this.options.initial?.createdAt ?? Date.now(),
      date: this.date,
      time: normalizeTimeStr(this.time),
      type: this.type,
      amountInAccountCurrency: (this.type === 'add' || this.type === 'spend') ? 0 : Math.round(this.amountInAccountCurrency * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION,
      targetCurrency: this.targetCurrency || '',
      targetAmount: Math.round(this.targetAmount * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION,
      exchangeRate: Math.round(this.exchangeRate * EXCHANGE_RATE_PRECISION) / EXCHANGE_RATE_PRECISION,
      provider: this.provider,
      ...(this.category ? { category: this.category } : {}),
      ...(this.fee ? { fee: Math.round(this.fee * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION } : {}),
      note: this.note,
      ...(this.attachmentPath ? { attachmentPath: this.attachmentPath } : {}),
    };
    
    await this.options.onSave(exchange);
  }
}
