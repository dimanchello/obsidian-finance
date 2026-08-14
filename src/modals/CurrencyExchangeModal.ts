import { App, Modal, Notice } from 'obsidian';
import { CurrencyExchange, CurrencyOperationType } from '../types';
import { getCurrencyBalance } from '../domain/currencyBalance';
import { CURRENCY_ROUNDING_PRECISION, EXCHANGE_RATE_PRECISION } from '../types';
import { getTodayStr, normalizeTimeStr, normalizeDateStr } from '../utils';
import { Translations } from '../i18n';
import { attachAutocomplete } from '../ui/Combobox';
import { createAmountInput, type AmountInputHandle } from '../ui/AmountInput';
import { toDateTimeLocalStr } from '../domain/dateMath';
import { FieldInfoModal, CURRENCY_FIELDS } from '../FieldInfoModal';

export interface CurrencyExchangeModalOptions {
  initial?: Partial<CurrencyExchange>;
  exchanges: CurrencyExchange[];
  providers: string[];
  categories: string[];
  currencies: string[];
  accountCurrency: string;
  tr: Translations;
  onSave: (exchange: CurrencyExchange) => Promise<void>;
}

export class CurrencyExchangeModal extends Modal {
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
  
  private targetAmountHandle?: AmountInputHandle;
  private accAmountHandle?: AmountInputHandle;
  private rateInput?: HTMLInputElement;
  
  constructor(app: App, options: CurrencyExchangeModalOptions) {
    super(app);
    this.options = options;
    
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

  override onClose() {
    this.contentEl.empty();
  }

  private render() {
    const { contentEl, options: { tr } } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');
    
    const isEdit = !!this.options.initial?.id;
    contentEl.createEl('h2', {
      text: isEdit ? '✏️ ' + tr.edit : '➕ ' + tr.newCurrencyExchange,
      cls:  'finance-modal-title',
    });

    const form = contentEl.createDiv('finance-form');

    // Show balance if sell or spend
    if (this.type === 'sell' || this.type === 'spend') {
      const balance = getCurrencyBalance(this.options.exchanges, this.targetCurrency);
      const balanceDiv = form.createDiv();
      balanceDiv.style.fontSize = '0.9em';
      balanceDiv.style.color = 'var(--text-muted)';
      balanceDiv.style.marginBottom = '15px';
      balanceDiv.style.textAlign = 'right';
      balanceDiv.setText(tr.availableBalance.replace('{amount}', balance.toFixed(2)).replace('{currency}', this.targetCurrency || '?'));
    }

    // ── Amounts ───────────────────────────────────────────────────────────
    
    // Target Amount (Always present)
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

    // Account Currency Amount
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

    // Date+Time
    const dtG = grid.createDiv('finance-field-group');
    dtG.createEl('label', { text: tr.dateTime, cls: 'finance-field-label' });
    const dtIn = dtG.createEl('input', { type: 'datetime-local', cls: 'finance-input' });
    const nowStr = toDateTimeLocalStr(new Date());
    const normDate = this.date ? normalizeDateStr(this.date) : '';
    const normTime = this.time ? normalizeTimeStr(this.time) : '';
    dtIn.value = normDate ? `${normDate}T${normTime || '00:00'}` : nowStr;
    dtIn.addEventListener('change', () => {
      if (dtIn.value) {
        const [d, t] = dtIn.value.slice(0, 16).split('T');
        this.date = normalizeDateStr(d ?? '');
        this.time = normalizeTimeStr(t ?? '');
      }
    });

    // Target Currency
    const curG = grid.createDiv('finance-field-group');
    curG.createEl('label', { text: tr.currency, cls: 'finance-field-label' });
    const curWrapper = curG.createDiv('finance-combobox');
    const curInput = curWrapper.createEl('input', { type: 'text', cls: 'finance-input finance-combobox-input' });
    curInput.value = this.targetCurrency;
    attachAutocomplete(curInput, {
      options: () => this.options.currencies,
      onPick: v => {
        this.targetCurrency = v;
        this.autofillFromHistoryByCurrency();
        this.render();
      }
    });
    curInput.addEventListener('change', () => {
      this.targetCurrency = curInput.value;
      this.autofillFromHistoryByCurrency();
      this.render();
    });

    // Exchange Rate
    if (this.type === 'buy' || this.type === 'sell') {
      const rateG = grid.createDiv('finance-field-group');
      rateG.createEl('label', { text: tr.rateLabel.replace('{currency}', this.targetCurrency || '?').replace('{accountCurrency}', this.options.accountCurrency), cls: 'finance-field-label' });
      this.rateInput = rateG.createEl('input', { type: 'text', cls: 'finance-input', attr: { inputmode: 'decimal' } });
      this.rateInput.value = this.exchangeRate ? String(this.exchangeRate).replace('.', ',') : '';
      this.rateInput.addEventListener('input', () => {
        const val = parseFloat(this.rateInput!.value.replace(',', '.'));
        this.exchangeRate = isNaN(val) ? 0 : val;
        this.markFieldEdited('exchangeRate');
        this.recalculateFields();
      });
      
      // Fee
      const feeG = grid.createDiv('finance-field-group');
      feeG.createEl('label', { text: tr.feeLabel + ` (${this.options.accountCurrency})`, cls: 'finance-field-label' });
      const feeIn = feeG.createEl('input', { type: 'text', cls: 'finance-input', attr: { inputmode: 'decimal' } });
      feeIn.value = this.fee ? String(this.fee).replace('.', ',') : '';
      feeIn.addEventListener('input', () => {
        const val = parseFloat(feeIn.value.replace(',', '.'));
        this.fee = isNaN(val) ? undefined : val;
      });
    }

    // Provider / Source
    let providerLabel = tr.provider;
    if (this.type === 'add') providerLabel = tr.sourceLabel;
    if (this.type === 'spend') providerLabel = tr.whereSpent;

    const provG = grid.createDiv('finance-field-group');
    provG.createEl('label', { text: providerLabel, cls: 'finance-field-label' });
    const provWrapper = provG.createDiv('finance-combobox');
    const provInput = provWrapper.createEl('input', { type: 'text', cls: 'finance-input finance-combobox-input' });
    provInput.value = this.provider;
    attachAutocomplete(provInput, {
      options: () => this.options.providers,
      onPick: v => {
        this.provider = v;
        this.autofillFromHistoryByProvider();
      }
    });
    provInput.addEventListener('change', () => { this.provider = provInput.value; });

    // Category
    if (this.type === 'add' || this.type === 'spend') {
      const catG = grid.createDiv('finance-field-group');
      catG.createEl('label', { text: tr.category + (this.type === 'spend' ? ' *' : ''), cls: 'finance-field-label' });
      const catWrapper = catG.createDiv('finance-combobox');
      const catInput = catWrapper.createEl('input', { type: 'text', cls: 'finance-input finance-combobox-input' });
      catInput.value = this.category;
      attachAutocomplete(catInput, {
        options: () => this.options.categories,
        onPick: v => { this.category = v; }
      });
      catInput.addEventListener('change', () => { this.category = catInput.value; });
    }

    // Note
    let placeholder = '';
    if (this.type === 'buy') placeholder = tr.placeholderBuy;
    if (this.type === 'sell') placeholder = tr.placeholderSell;
    if (this.type === 'add') placeholder = tr.placeholderAdd;
    if (this.type === 'spend') placeholder = tr.placeholderSpend;

    const noteG = form.createDiv('finance-field-group');
    const noteLabelRow = noteG.createDiv('finance-note-label-row');
    noteLabelRow.createEl('label', { text: tr.note, cls: 'finance-field-label' });
    noteLabelRow.createEl('span', { text: '📝', cls: 'finance-note-icon' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = placeholder;
    noteIn.value = this.note;
    noteIn.rows = 3;
    noteIn.addEventListener('input', () => { this.note = noteIn.value; });

    // Buttons
    const btnRow = contentEl.createDiv('finance-modal-btns');
    
    const infoBtn = btnRow.createEl('button', { text: '❓', cls: 'finance-btn-cancel' });
    infoBtn.addClass('finance-info-btn-left');
    infoBtn.addEventListener('click', () => new FieldInfoModal(this.app, CURRENCY_FIELDS).open());

    btnRow.createEl('button', { text: tr.cancel, cls: 'finance-btn-cancel' })
          .addEventListener('click', () => this.close());
    btnRow.createEl('button', {
      text: isEdit ? tr.save : tr.addBtn,
      cls:  'finance-btn-save',
    }).addEventListener('click', async () => {
      try {
        await this.handleSave();
        this.close();
      } catch (e: any) {
        new Notice(e.message);
      }
    });
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
          this.rateInput.value = String(this.exchangeRate).replace('.', ',');
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
      this.provider ??= lastOp.provider;
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
      this.targetCurrency ??= lastOp.targetCurrency;
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

      // If editing and same currency, add back the old amount before checking (only for operations that decreased balance)
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
      throw new Error(tr.invalidAmount); // reuse existing error for now
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
      exchangeRate: (this.type === 'add' || this.type === 'spend') ? 0 : Math.round(this.exchangeRate * EXCHANGE_RATE_PRECISION) / EXCHANGE_RATE_PRECISION,
      provider: this.provider,
      ...(this.category ? { category: this.category } : {}),
      ...(this.fee ? { fee: Math.round(this.fee * CURRENCY_ROUNDING_PRECISION) / CURRENCY_ROUNDING_PRECISION } : {}),
      note: this.note,
    };
    
    await this.options.onSave(exchange);
  }
}
