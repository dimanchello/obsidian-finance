import { App, Modal, Notice } from 'obsidian';
import { CreditPayment, CreditRecord } from './types';

export interface CreditEarlyRepaymentModalOptions {
  title: string;
  credit: CreditRecord;
  currency: string;
  onSave: (updatedCredit: CreditRecord) => void;
}

function fmtAmount(raw: string): string {
  const clean = raw.replace(/[^\d.,]/g, '');
  const dotPos = clean.search(/[.,]/);
  let intPart = dotPos >= 0 ? clean.slice(0, dotPos) : clean;
  let decPart = dotPos >= 0 ? clean.slice(dotPos + 1) : '';
  decPart = decPart.slice(0, 2).replace(/[.,]/g, '');
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return decPart.length > 0 ? `${intPart},${decPart}` : intPart;
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(/\u00a0|\s/g, '').replace(',', '.')) || 0;
}

export class CreditEarlyRepaymentModal extends Modal {
  private o: CreditEarlyRepaymentModalOptions;
  private credit: CreditRecord;
  private amountInput!: HTMLInputElement;
  private selectedOption: 'amount' | 'term' = 'amount';
  private actualRemaining: number;
  private pendingPayments: CreditPayment[];

  constructor(app: App, opts: CreditEarlyRepaymentModalOptions) {
    super(app);
    this.o = opts;
    this.credit = { ...opts.credit, payments: [...opts.credit.payments] };

    this.pendingPayments = this.credit.payments.filter(p => p.status === 'pending');
    const paidAmount = this.credit.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    this.actualRemaining = Math.max(0, this.credit.originalAmount - paidAmount);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h2', { text: this.o.title, cls: 'finance-modal-title' });

    const cur = this.o.currency;

    const info = contentEl.createDiv('finance-early-info');
    info.createEl('p', { text: `Остаток кредита: ${fmtAmount(String(this.actualRemaining))} ${cur}` });
    info.createEl('p', { text: `Ежемесячный платёж: ${fmtAmount(String(this.credit.monthlyPayment))} ${cur}` });
    info.createEl('p', { text: `Осталось платежей: ${this.pendingPayments.length}` });

    const form = contentEl.createDiv('finance-form');

    const dateG = form.createDiv('finance-field-group');
    dateG.createEl('label', { text: 'Дата погашения', cls: 'finance-field-label' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    const today = new Date().toISOString().split('T')[0];
    dateIn.value = today;

    const optRow = form.createDiv('finance-early-options');
    optRow.style.display = 'flex';
    optRow.style.gap = '8px';
    optRow.style.marginBottom = '16px';

    const baseBtnStyle = (btn: HTMLElement) => {
      btn.style.flex = '1';
      btn.style.padding = '10px 16px';
      btn.style.borderRadius = '8px';
      btn.style.border = '2px solid #e5e7eb';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = '500';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'all 0.2s ease';
      btn.style.background = '#f9fafb';
      btn.style.color = '#374151';
    };

    const activeBtnStyle = (btn: HTMLElement) => {
      btn.style.background = '#7c3aed';
      btn.style.color = '#fff';
      btn.style.borderColor = '#7c3aed';
    };

    const inactiveBtnStyle = (btn: HTMLElement) => {
      btn.style.background = '#f9fafb';
      btn.style.color = '#374151';
      btn.style.borderColor = '#e5e7eb';
    };

    const amountBtn = optRow.createEl('button', { text: 'Гасить сумму' });
    baseBtnStyle(amountBtn);
    activeBtnStyle(amountBtn);

    const termBtn = optRow.createEl('button', { text: 'Гасить срок' });
    baseBtnStyle(termBtn);
    inactiveBtnStyle(termBtn);

    const amountSection = form.createDiv('finance-early-amount-section');
    amountSection.createEl('label', { text: 'Сумма досрочного погашения', cls: 'finance-field-label' });

    this.amountInput = amountSection.createEl('input', {
      type: 'text',
      cls: 'finance-input finance-amount-input',
    });
    this.amountInput.setAttribute('inputmode', 'decimal');
    this.amountInput.setAttribute('placeholder', '0');
    this.amountInput.setAttribute('autocomplete', 'off');
    this.amountInput.value = fmtAmount(String(this.actualRemaining));

    this.amountInput.addEventListener('focus', () => {
      if (this.actualRemaining > 0) {
        this.amountInput.value = String(this.actualRemaining).replace('.', ',');
      }
    });

    this.amountInput.addEventListener('input', () => {
      const raw = this.amountInput.value;
      const sel = this.amountInput.selectionStart ?? raw.length;
      const rawBefore = raw.slice(0, sel).replace(/[^\d.,]/g, '').length;
      const formatted = fmtAmount(raw);
      if (formatted !== raw) {
        this.amountInput.value = formatted;
        let newPos = 0, rawCount = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/[\d.,]/.test(formatted[i])) rawCount++;
          if (rawCount >= rawBefore) { newPos = i + 1; break; }
        }
        this.amountInput.setSelectionRange(newPos, newPos);
      }
    });

    const termSection = form.createDiv('finance-early-term-section');
    termSection.style.display = 'none';
    termSection.createEl('label', { text: 'На сколько месяцев сократить срок?', cls: 'finance-field-label' });
    const termInput = termSection.createEl('input', {
      type: 'number',
      cls: 'finance-input',
    });
    termInput.setAttribute('min', '1');
    termInput.setAttribute('max', String(this.pendingPayments.length));
    termInput.value = '1';

    amountBtn.addEventListener('click', () => {
      this.selectedOption = 'amount';
      activeBtnStyle(amountBtn);
      inactiveBtnStyle(termBtn);
      amountSection.style.display = 'block';
      termSection.style.display = 'none';
    });

    termBtn.addEventListener('click', () => {
      this.selectedOption = 'term';
      activeBtnStyle(termBtn);
      inactiveBtnStyle(amountBtn);
      amountSection.style.display = 'none';
      termSection.style.display = 'block';
    });

    const noteG = form.createDiv('finance-field-group');
    noteG.createEl('label', { text: 'Примечание', cls: 'finance-field-label' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = 'Необязательно';
    noteIn.rows = 2;

    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: 'Отмена', cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: 'Погасить', cls: 'finance-btn-save' })
      .addEventListener('click', () => {
        const todayStr = new Date().toISOString().split('T')[0];
        const repaymentDate = dateIn.value || todayStr;

        if (this.selectedOption === 'amount') {
          const amount = parseAmount(this.amountInput.value);
          if (!amount || amount <= 0) {
            new Notice('⚠️ Укажите сумму больше нуля');
            this.amountInput.focus();
            return;
          }

          let remainingAmount = amount;

          for (const payment of this.pendingPayments) {
            if (remainingAmount <= 0) break;
            const payAmount = Math.min(payment.amount, remainingAmount);
            payment.status = 'paid';
            payment.paidDate = repaymentDate;
            if (noteIn.value) payment.note = noteIn.value;
            remainingAmount -= payAmount;
          }

          this.credit.currentAmount = Math.max(0, this.actualRemaining - amount);
          const stillPending = this.credit.payments.filter(p => p.status === 'pending');
          if (this.credit.currentAmount <= 0 || stillPending.length === 0) {
            this.credit.status = 'paid';
          }

        } else {
          const monthsToRemove = parseInt(termInput.value) || 1;
          const toRemove = Math.min(monthsToRemove, this.pendingPayments.length);

          for (let i = 0; i < toRemove; i++) {
            this.pendingPayments[i].status = 'paid';
            this.pendingPayments[i].paidDate = repaymentDate;
            if (noteIn.value) this.pendingPayments[i].note = noteIn.value;
          }

          const stillPending = this.credit.payments.filter(p => p.status === 'pending');
          this.credit.currentAmount = stillPending.reduce((s, p) => s + p.amount, 0);
          this.credit.status = stillPending.length === 0 ? 'paid' : 'active';
        }

        this.o.onSave(this.credit);
        this.close();
      });
  }

  onClose(): void { this.contentEl.empty(); }
}
