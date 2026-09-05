import { App, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { DebtRecord } from './types';
import { fmtAmount, getTodayStr, normalizeDateStr, normalizeTimeStr } from './utils';
import { FieldInfoModal, DEBT_FIELDS } from './FieldInfoModal';
import { createAmountInput } from './ui/AmountInput';
import { FinanceBaseModal } from './ui/FinanceBaseModal';
import { buildDateField, buildRateInput, buildNoteField, buildButtonRow, buildComboboxField, validateAmountInput } from './ui/formHelpers';
import { DebtDirection } from './constants';

export interface DebtModalOptions {
  title:   string;
  debt?:   DebtRecord;
  allPersons: string[];
  onSave:  (debt: DebtRecord) => void;
}

export class DebtModal extends FinanceBaseModal {
  protected tr: Translations;
  private o: DebtModalOptions;
  private debt: DebtRecord;
  private amountInput!: HTMLInputElement;
  private totalInput!: HTMLInputElement;

  constructor(app: App, opts: DebtModalOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o = opts;
    const nowStr = getTodayStr();
    this.debt = opts.debt
      ? {
          ...opts.debt,
          direction: (opts.debt.direction || 'borrowed'),
          date: normalizeDateStr(opts.debt.date),
          time: normalizeTimeStr(opts.debt.time || ''),
          dueDate: opts.debt.dueDate ? normalizeDateStr(opts.debt.dueDate) : '',
          movements: opts.debt.movements.map(m => ({
            ...m,
            date: normalizeDateStr(m.date),
            time: normalizeTimeStr(m.time || ''),
          }))
        }
      : {
          id: crypto.randomUUID(),
          person: '',
          amount: 0,
          originalAmount: 0,
          interestRate: 0,
          direction: DebtDirection.BORROWED,
          date: nowStr,
          time: new Date().toTimeString().slice(0, 5),
          dueDate: '',
          createdAt: Date.now(),
          note: '',
          movements: [],
        };
  }

  override onOpen(): void {
    this.openHeader(this.o.title);

    const dirRow = this.contentEl.createDiv('finance-type-row');
    const lentBtn = dirRow.createEl('button', {
      text: this.tr.lent,
      cls: `finance-type-toggle${this.debt.direction === DebtDirection.LENT ? ' active lent' : ''}`,
    });
    const borrowedBtn = dirRow.createEl('button', {
      text: this.tr.borrowed,
      cls: `finance-type-toggle${this.debt.direction === DebtDirection.BORROWED ? ' active borrowed' : ''}`,
    });

    let personLabelText = this.debt.direction === DebtDirection.LENT ? `${this.tr.who} *` : `${this.tr.person} *`;

    const setDirection = (dir: 'lent' | 'borrowed') => {
      this.debt.direction = dir;
      lentBtn.classList.toggle('active', dir === 'lent');
      lentBtn.classList.toggle('lent', dir === 'lent');
      borrowedBtn.classList.toggle('active', dir === 'borrowed');
      borrowedBtn.classList.toggle('borrowed', dir === 'borrowed');
      
      const personLabel = this.contentEl.querySelector('.finance-person-label');
      const totalLabel = this.contentEl.querySelector('.finance-total-label');
      
      if (personLabel) personLabel.textContent = dir === 'lent' ? `${this.tr.who} *` : `${this.tr.person} *`;
      if (totalLabel) totalLabel.textContent = dir === 'lent' ? this.tr.totalReturnLent : this.tr.totalReturnBorrowed;
    };

    lentBtn.addEventListener('click', () => setDirection('lent'));
    borrowedBtn.addEventListener('click', () => setDirection('borrowed'));

    const form = this.contentEl.createDiv('finance-form finance-form-grid finance-form-compact');

    const row1 = form.createDiv('finance-form-row finance-full-width');

    const personInput = buildComboboxField(row1, personLabelText, this.debt.person, () => this.o.allPersons, v => { this.debt.person = v; });
    const personLabelEl = personInput.parentElement?.parentElement?.querySelector('label');
    if (personLabelEl) personLabelEl.addClass('finance-person-label');

    const amtG = row1.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.amountLabel, cls: 'finance-field-label' });
    this.amountInput = createAmountInput(amtG, {
      value: this.debt.amount,
      onChange: v => {
        this.debt.originalAmount = v;
        this.debt.amount = v;
        this.updateTotalReadonly();
      },
    }).input;

    const row2 = form.createDiv('finance-form-row finance-full-width');
    buildDateField(row2, this.tr.dateCreated, this.debt.date, v => { this.debt.date = v; });
    buildDateField(row2, this.tr.dueDate, this.debt.dueDate, v => { this.debt.dueDate = v; });

    const row3 = form.createDiv('finance-form-row finance-full-width');
    buildRateInput(row3, this.tr.interestRateLabel, this.debt.interestRate, {
      onInput: rate => { this.debt.interestRate = rate; this.updateTotalReadonly(); },
      onBlur: rate => { this.debt.interestRate = rate; this.updateTotalReadonly(); },
    });

    const totalG = row3.createDiv('finance-field-group');
    totalG.createEl('label', {
      text: this.debt.direction === DebtDirection.LENT ? this.tr.totalReturnLent : this.tr.totalReturnBorrowed,
      cls: 'finance-field-label finance-total-label',
    });
    this.totalInput = totalG.createEl('input', { type: 'text', cls: 'finance-input' });
    this.totalInput.readOnly = true;
    this.totalInput.value = this.debt.amount > 0 ? fmtAmount(String(this.debt.amount)) : '';

    const row4 = form.createDiv('finance-form-row finance-full-width');
    buildNoteField(row4, {
      label: this.tr.note,
      value: this.debt.note,
      placeholder: this.tr.optional,
      rows: 2,
      onChange: v => { this.debt.note = v; }
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
      infoBtn.addEventListener('click', () => new FieldInfoModal(this.app, DEBT_FIELDS).open());
      btnRow.prepend(infoBtn);
    }
  }

  private handleSave(): void {
    const amount = validateAmountInput(this.amountInput, this.tr);
    if (amount === null) return;
    
    this.debt.originalAmount = amount;
    this.debt.amount = amount;
    
    if (!this.debt.person.trim()) {
      new Notice(this.tr.specifyPerson);
      return;
    }
    this.debt.person = this.debt.person.trim();
    this.o.onSave(this.debt);
    this.close();
  }

  private updateTotalReadonly(): void {
    // using the domain helper conceptually, but here we just need original+interest based on the modal's unconfirmed values
    const original = this.debt.originalAmount;
    const rate = this.debt.interestRate;
    const total = rate > 0 ? original + (original * rate / 100) : original;
    this.totalInput.value = total > 0 ? fmtAmount(String(total)) : '';
  }
}
