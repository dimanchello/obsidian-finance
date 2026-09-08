import { App } from 'obsidian';
import { CurrencyExchange, CurrencyOperationType } from '../types';
import { getCurrencyBalance } from '../domain/currencyBalance';
import { CURRENCY_ROUNDING_PRECISION, EXCHANGE_RATE_PRECISION } from '../types';
import { getTodayStr, normalizeTimeStr, normalizeDateStr } from '../utils';
import { Translations } from '../i18n';
import { createAmountInput, type AmountInputHandle } from '../ui/AmountInput';
import { CURRENCY_FIELDS, type FieldDef } from '../FieldInfoModal';
import { buildAttachmentField } from '../ui/attachmentField';
import { EntityModal } from '../ui/EntityModal';
import { buildDateTimeField, buildComboboxField, buildNoteField } from '../ui/formHelpers';

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

type CalcField = 'amountInAccountCurrency' | 'targetAmount' | 'exchangeRate';

const CALC_FIELDS: CalcField[] = ['amountInAccountCurrency', 'targetAmount', 'exchangeRate'];

/** Two of the three amount/rate fields determine the third. */
const CALC_FIELDS_TO_SOLVE = 2;

export class CurrencyExchangeModal extends EntityModal<CurrencyExchange> {
  private options: CurrencyExchangeModalOptions;

  private isCalculating = false;
  private lastEditedFields: CalcField[] = [];

  private targetAmountHandle?: AmountInputHandle;
  private accAmountHandle?: AmountInputHandle;
  private rateInput?: HTMLInputElement;

  constructor(app: App, options: CurrencyExchangeModalOptions) {
    const initial = options.initial;
    const now = new Date();
    super(app, {
      entity: {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        date: getTodayStr(),
        time: initial
          ? ''
          : `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
        type: CurrencyOperationType.BUY,
        amountInAccountCurrency: 0,
        targetCurrency: initial ? '' : (options.currencies[0] ?? ''),
        targetAmount: 0,
        exchangeRate: 0,
        provider: '',
        note: '',
        attachmentPath: '',
        ...initial,
      },
      isEdit: !!initial?.id,
      onSave: entity => { void options.onSave(entity); },
    });
    this.options = options;
    this.tr = options.tr;
  }

  protected getTitle(): string {
    return this.isEdit ? '✏️ ' + this.tr.edit : '➕ ' + this.tr.newCurrencyExchange;
  }

  protected override getInfoFields(): FieldDef[] { return CURRENCY_FIELDS; }

  private get type(): CurrencyOperationType { return this.entity.type; }

  protected buildForm(form: HTMLElement): void {
    const tr = this.tr;

    if (this.type === CurrencyOperationType.SELL || this.type === CurrencyOperationType.SPEND) {
      const balance = getCurrencyBalance(this.options.exchanges, this.entity.targetCurrency);
      const balanceDiv = form.createDiv('finance-currency-balance-hint');
      balanceDiv.setText(tr.availableBalance
        .replace('{amount}', balance.toFixed(2))
        .replace('{currency}', this.entity.targetCurrency || '?'));
    }

    const amountsContainer = form.createDiv(
      this.type === CurrencyOperationType.BUY || this.type === CurrencyOperationType.SELL ? 'finance-form-grid' : '');

    const tgtAmtG = amountsContainer.createDiv('finance-field-group finance-amount-group');
    tgtAmtG.createEl('label', { text: this.targetAmountLabel(), cls: 'finance-field-label' });
    const tgtAmtRow = tgtAmtG.createDiv('finance-amount-row');
    this.targetAmountHandle = createAmountInput(tgtAmtRow, {
      value: this.entity.targetAmount,
      onChange: v => {
        this.entity.targetAmount = v;
        this.markFieldEdited('targetAmount');
        this.recalculateFields();
      },
    });
    this.targetAmountHandle.input.classList.add(
      this.type === CurrencyOperationType.BUY || this.type === CurrencyOperationType.ADD ? 'income-color' : 'expense-color');

    if (this.type === CurrencyOperationType.BUY || this.type === CurrencyOperationType.SELL) {
      const amountAccLabel = this.type === CurrencyOperationType.BUY
        ? `${tr.amountSpent} (${this.options.accountCurrency})`
        : `${tr.amountReceived} (${this.options.accountCurrency})`;

      const accAmtG = amountsContainer.createDiv('finance-field-group finance-amount-group');
      accAmtG.createEl('label', { text: amountAccLabel, cls: 'finance-field-label' });
      const accAmtRow = accAmtG.createDiv('finance-amount-row');
      this.accAmountHandle = createAmountInput(accAmtRow, {
        value: this.entity.amountInAccountCurrency,
        onChange: v => {
          this.entity.amountInAccountCurrency = v;
          this.markFieldEdited('amountInAccountCurrency');
          this.recalculateFields();
        },
      });
      this.accAmountHandle.input.classList.add(this.type === CurrencyOperationType.BUY ? 'expense-color' : 'income-color');
    }

    const grid = form.createDiv('finance-form-grid');

    const normDate = this.entity.date ? normalizeDateStr(this.entity.date) : getTodayStr();
    const normTime = this.entity.time ? normalizeTimeStr(this.entity.time) : '';
    buildDateTimeField(grid, tr.dateTime, normDate, normTime, tr, (d, t) => {
      this.entity.date = d;
      this.entity.time = t;
    });

    buildComboboxField(grid, tr.currency, this.entity.targetCurrency,
      () => this.options.currencies, v => {
        this.entity.targetCurrency = v;
        this.autofillFromHistoryByCurrency();
        this.rebuildForm();
      });

    if (this.type === CurrencyOperationType.BUY || this.type === CurrencyOperationType.SELL) {
      this.buildRateField(grid);
      this.buildFeeField(grid);
    }

    let providerLabel = tr.provider;
    if (this.type === CurrencyOperationType.ADD) providerLabel = tr.sourceLabel;
    if (this.type === CurrencyOperationType.SPEND) providerLabel = tr.whereSpent;

    buildComboboxField(grid, providerLabel, this.entity.provider,
      () => this.options.providers, v => {
        this.entity.provider = v;
        this.autofillFromHistoryByProvider();
      });

    if (this.type === CurrencyOperationType.ADD || this.type === CurrencyOperationType.SPEND) {
      buildComboboxField(grid, tr.category + (this.type === CurrencyOperationType.SPEND ? ' *' : ''),
        this.entity.category ?? '', () => this.options.categories, v => {
          this.entity.category = v;
        });
    }

    buildNoteField(form, {
      label: tr.note,
      icon: '📝',
      value: this.entity.note,
      placeholder: this.notePlaceholder(),
      rows: 3,
      onChange: v => { this.entity.note = v; },
    });

    buildAttachmentField(form, {
      app: this.app,
      pluginId: this.options.pluginId,
      tr: this.tr,
      initialPath: this.entity.attachmentPath ?? '',
      onChange: path => { this.entity.attachmentPath = path; },
    });
  }

  private targetAmountLabel(): string {
    const cur = this.entity.targetCurrency || '?';
    const tr = this.tr;
    if (this.type === CurrencyOperationType.BUY) return tr.targetAmountBuy.replace('{currency}', cur);
    if (this.type === CurrencyOperationType.SELL) return tr.targetAmountSell.replace('{currency}', cur);
    if (this.type === CurrencyOperationType.SPEND) return tr.targetAmountSpend.replace('{currency}', cur);
    return tr.targetAmountAdd.replace('{currency}', cur);
  }

  private notePlaceholder(): string {
    const tr = this.tr;
    if (this.type === CurrencyOperationType.BUY) return tr.placeholderBuy;
    if (this.type === CurrencyOperationType.SELL) return tr.placeholderSell;
    if (this.type === CurrencyOperationType.ADD) return tr.placeholderAdd;
    return tr.placeholderSpend;
  }

  /** Changing the currency changes which fields apply, so the whole form is rebuilt. */
  private rebuildForm(): void {
    this.formEl.empty();
    this.buildForm(this.formEl);
  }

  private buildRateField(grid: HTMLElement): void {
    const rateG = grid.createDiv('finance-field-group');
    rateG.createEl('label', {
      text: this.tr.rateLabel
        .replace('{currency}', this.entity.targetCurrency || '?')
        .replace('{accountCurrency}', this.options.accountCurrency),
      cls: 'finance-field-label',
    });
    const rateInput = rateG.createEl('input', {
      type: 'text', cls: 'finance-input', attr: { inputmode: 'decimal' },
    });
    this.rateInput = rateInput;
    rateInput.value = this.entity.exchangeRate ? String(this.entity.exchangeRate) : '';
    rateInput.addEventListener('input', () => {
      rateInput.classList.toggle('finance-input-error', rateInput.value.includes(','));
      const val = parseFloat(rateInput.value);
      this.entity.exchangeRate = isNaN(val) ? 0 : val;
      this.markFieldEdited('exchangeRate');
      this.recalculateFields();
    });
  }

  private buildFeeField(grid: HTMLElement): void {
    const feeG = grid.createDiv('finance-field-group');
    feeG.createEl('label', {
      text: `${this.tr.feeLabel} (${this.options.accountCurrency})`,
      cls: 'finance-field-label',
    });
    const feeIn = feeG.createEl('input', {
      type: 'text', cls: 'finance-input', attr: { inputmode: 'decimal' },
    });
    feeIn.value = this.entity.fee ? String(this.entity.fee) : '';
    feeIn.addEventListener('input', () => {
      feeIn.classList.toggle('finance-input-error', feeIn.value.includes(','));
      const val = parseFloat(feeIn.value);
      if (isNaN(val)) {
        delete this.entity.fee;
      } else {
        this.entity.fee = val;
      }
    });
  }

  private markFieldEdited(field: CalcField): void {
    if (this.isCalculating) return;
    this.lastEditedFields = this.lastEditedFields.filter(f => f !== field);
    this.lastEditedFields.unshift(field);
    if (this.lastEditedFields.length > CALC_FIELDS_TO_SOLVE) {
      this.lastEditedFields.pop();
    }
  }

  /**
   * Bidirectional recalculation: once two of (account amount, target amount, rate) have
   * been touched, the third is derived from them and written back into its input.
   */
  private recalculateFields(): void {
    if (this.isCalculating) return;
    if (this.lastEditedFields.length < CALC_FIELDS_TO_SOLVE) return;

    this.isCalculating = true;
    try {
      const [last, prev] = this.lastEditedFields;
      const toCalculate = CALC_FIELDS.find(f => f !== last && f !== prev);
      if (toCalculate) this.calculateField(toCalculate);
    } finally {
      this.isCalculating = false;
    }
  }

  private calculateField(field: CalcField): void {
    const e = this.entity;

    if (field === 'amountInAccountCurrency') {
      if (e.targetAmount > 0 && e.exchangeRate > 0) {
        e.amountInAccountCurrency = roundTo(e.targetAmount * e.exchangeRate, CURRENCY_ROUNDING_PRECISION);
      }
      this.accAmountHandle?.set(e.amountInAccountCurrency);
      return;
    }

    if (field === 'targetAmount') {
      if (e.amountInAccountCurrency > 0 && e.exchangeRate > 0) {
        e.targetAmount = roundTo(e.amountInAccountCurrency / e.exchangeRate, CURRENCY_ROUNDING_PRECISION);
      }
      this.targetAmountHandle?.set(e.targetAmount);
      return;
    }

    if (e.amountInAccountCurrency > 0 && e.targetAmount > 0) {
      e.exchangeRate = roundTo(e.amountInAccountCurrency / e.targetAmount, EXCHANGE_RATE_PRECISION);
    }
    if (this.rateInput) this.rateInput.value = String(e.exchangeRate);
  }

  private autofillFromHistoryByCurrency(): void {
    if (this.isEdit) return; // Don't autofill when editing

    const lastOp = this.options.exchanges
      .filter(e => e.targetCurrency === this.entity.targetCurrency && e.type === this.type)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!lastOp) return;

    if (!this.entity.provider) this.entity.provider = lastOp.provider;
    if (!this.entity.exchangeRate) {
      this.entity.exchangeRate = lastOp.exchangeRate;
      this.markFieldEdited('exchangeRate');
    }
  }

  private autofillFromHistoryByProvider(): void {
    if (this.isEdit) return;

    const lastOp = this.options.exchanges
      .filter(e => e.provider === this.entity.provider && e.type === this.type)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!lastOp) return;

    if (!this.entity.targetCurrency) this.entity.targetCurrency = lastOp.targetCurrency;
    if (!this.entity.exchangeRate) {
      this.entity.exchangeRate = lastOp.exchangeRate;
      this.markFieldEdited('exchangeRate');
    }
  }

  protected validate(): string | null {
    const tr = this.tr;
    const e = this.entity;

    if (e.targetAmount <= 0 || isNaN(e.targetAmount)) return tr.invalidAmount;

    if (this.type === CurrencyOperationType.BUY || this.type === CurrencyOperationType.SELL) {
      if (e.amountInAccountCurrency <= 0 || isNaN(e.amountInAccountCurrency)) return tr.invalidAmount;
      if (e.exchangeRate <= 0 || isNaN(e.exchangeRate)) return tr.invalidAmount;
    }

    if (this.type === CurrencyOperationType.SELL || this.type === CurrencyOperationType.SPEND) {
      let effectiveBalance = getCurrencyBalance(this.options.exchanges, e.targetCurrency);
      // When editing an outgoing operation, its own amount is already deducted from the
      // stored balance, so add it back before checking whether the new amount fits.
      const initial = this.options.initial;
      if (initial?.targetCurrency === e.targetCurrency &&
          (initial.type === CurrencyOperationType.SELL || initial.type === CurrencyOperationType.SPEND)) {
        effectiveBalance += initial.targetAmount ?? 0;
      }

      if (effectiveBalance < e.targetAmount) {
        return `${tr.insufficientBalance}. ${tr.availableBalance
          .replace('{amount}', effectiveBalance.toFixed(2))
          .replace('{currency}', e.targetCurrency)}`;
      }
    }

    if (this.type === CurrencyOperationType.SPEND && !e.category) return tr.categoryRequired;
    if (!e.targetCurrency.trim()) return tr.invalidAmount;

    return null;
  }

  protected collectData(): CurrencyExchange {
    const e = this.entity;
    const isAccountNeutral = this.type === CurrencyOperationType.ADD || this.type === CurrencyOperationType.SPEND;

    return {
      id: e.id,
      createdAt: e.createdAt,
      date: e.date,
      time: normalizeTimeStr(e.time),
      type: e.type,
      amountInAccountCurrency: isAccountNeutral
        ? 0
        : roundTo(e.amountInAccountCurrency, CURRENCY_ROUNDING_PRECISION),
      targetCurrency: e.targetCurrency,
      targetAmount: roundTo(e.targetAmount, CURRENCY_ROUNDING_PRECISION),
      exchangeRate: roundTo(e.exchangeRate, EXCHANGE_RATE_PRECISION),
      provider: e.provider,
      ...(e.category ? { category: e.category } : {}),
      ...(e.fee ? { fee: roundTo(e.fee, CURRENCY_ROUNDING_PRECISION) } : {}),
      note: e.note,
      ...(e.attachmentPath ? { attachmentPath: e.attachmentPath } : {}),
    };
  }
}

function roundTo(value: number, precision: number): number {
  return Math.round(value * precision) / precision;
}
