import { App, Modal } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';

export interface FieldDef {
  labelKey: keyof Translations;
  descKey: keyof Translations;
}

export const DEPOSIT_FIELDS: FieldDef[] = [
  { labelKey: 'sum', descKey: 'fieldDescSum' },
  { labelKey: 'rate', descKey: 'fieldDescRate' },
  { labelKey: 'startDate', descKey: 'fieldDescStartDate' },
  { labelKey: 'termLabel', descKey: 'fieldDescTerm' },
  { labelKey: 'depositType', descKey: 'fieldDescType' },
  { labelKey: 'accrualType', descKey: 'fieldDescAccrual' },
  { labelKey: 'frequency', descKey: 'fieldDescFrequency' },
  { labelKey: 'note', descKey: 'fieldDescNote' },
];

export const DEBT_FIELDS: FieldDef[] = [
  { labelKey: 'amountLabel', descKey: 'fieldDescDebtAmount' },
  { labelKey: 'interestRateLabel', descKey: 'fieldDescDebtRate' },
  { labelKey: 'dateCreated', descKey: 'fieldDescDebtDateCreated' },
  { labelKey: 'dueDate', descKey: 'fieldDescDebtDueDate' },
  { labelKey: 'person', descKey: 'fieldDescDebtPerson' },
  { labelKey: 'direction', descKey: 'fieldDescDebtDirection' },
  { labelKey: 'note', descKey: 'fieldDescNote' },
];

export const CREDIT_FIELDS: FieldDef[] = [
  { labelKey: 'amountLabel', descKey: 'fieldDescCreditAmount' },
  { labelKey: 'interestRate', descKey: 'fieldDescCreditRate' },
  { labelKey: 'startDate', descKey: 'fieldDescCreditStartDate' },
  { labelKey: 'paymentDayLabel', descKey: 'fieldDescCreditPaymentDay' },
  { labelKey: 'termLabel', descKey: 'fieldDescCreditTerm' },
  { labelKey: 'creditTypeLabel', descKey: 'fieldDescCreditType' },
  { labelKey: 'monthlyPayment', descKey: 'fieldDescCreditMonthlyPayment' },
  { labelKey: 'bankName', descKey: 'fieldDescCreditBank' },
  { labelKey: 'note', descKey: 'fieldDescNote' },
];

export const CURRENCY_FIELDS: FieldDef[] = [
  { labelKey: 'type', descKey: 'fieldDescCurrencyType' },
  { labelKey: 'dateTime', descKey: 'fieldDescCurrencyDateTime' },
  { labelKey: 'currency', descKey: 'fieldDescCurrencyTarget' },
  { labelKey: 'targetAmount', descKey: 'fieldDescCurrencyTargetAmount' },
  { labelKey: 'inAccountCurrency', descKey: 'fieldDescCurrencyAccountAmount' },
  { labelKey: 'rateLabel', descKey: 'fieldDescCurrencyRate' },
  { labelKey: 'feeLabel', descKey: 'fieldDescCurrencyFee' },
  { labelKey: 'provider', descKey: 'fieldDescCurrencyProvider' },
  { labelKey: 'category', descKey: 'fieldDescCurrencyCategory' },
  { labelKey: 'note', descKey: 'fieldDescNote' },
];

/** Field reference sheet — one modal for deposits, debts and credits. */
export class FieldInfoModal extends Modal {
  private tr: Translations;
  private fields: FieldDef[];

  constructor(app: App, fields: FieldDef[]) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.fields = fields;
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    const container = contentEl.createDiv('finance-form finance-info-container');
    container.createEl('h3', { text: this.tr.fieldDescriptions, cls: 'finance-modal-title' });
    container.createEl('p', { text: this.tr.fieldDescriptionsSub, cls: 'finance-info-subtitle' });

    this.fields.forEach(({ labelKey, descKey }) => {
      const card = container.createDiv('finance-info-card');
      card.createEl('div', { text: this.tr[labelKey], cls: 'finance-info-card-label' });
      card.createEl('div', { text: this.tr[descKey], cls: 'finance-info-card-desc' });
    });

    const btnRow = contentEl.createDiv('finance-modal-btns finance-info-btns');
    btnRow.createEl('button', { text: this.tr.close, cls: 'finance-btn-save' })
      .addEventListener('click', () => this.close());
  }

  override onClose(): void { this.contentEl.empty(); }
}
