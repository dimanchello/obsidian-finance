import { App, Modal, Notice } from 'obsidian';
import { CreditRecord, CreditType } from './types';

export interface CreditModalOptions {
  title: string;
  credit?: CreditRecord;
  allBanks: string[];
  onSave: (credit: CreditRecord) => void;
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

export class CreditModal extends Modal {
  private o: CreditModalOptions;
  private credit: CreditRecord;
  private amountInput!: HTMLInputElement;
  private paymentInput!: HTMLInputElement;
  private rateInput!: HTMLInputElement;

  constructor(app: App, opts: CreditModalOptions) {
    super(app);
    this.o = opts;
    const nowStr = new Date().toISOString().split('T')[0];
    this.credit = opts.credit
      ? { ...opts.credit, payments: [...opts.credit.payments] }
      : {
          id: crypto.randomUUID(),
          name: 'Кредит',
          type: 'consumer' as CreditType,
          bankName: '',
          originalAmount: 0,
          currentAmount: 0,
          interestRate: 0,
          monthlyPayment: 0,
          termMonths: 12,
          startDate: nowStr,
          createdAt: Date.now(),
          note: '',
          status: 'active',
          earlyRepaymentOption: null,
          payments: [],
        };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h2', { text: this.o.title, cls: 'finance-modal-title' });

    const form = contentEl.createDiv('finance-form');

    const nameG = form.createDiv('finance-field-group');
    nameG.createEl('label', { text: 'Название', cls: 'finance-field-label' });
    const nameIn = nameG.createEl('input', { type: 'text', cls: 'finance-input' });
    nameIn.value = this.credit.name;
    nameIn.addEventListener('input', () => { this.credit.name = nameIn.value; });

    const typeG = form.createDiv('finance-field-group');
    typeG.createEl('label', { text: 'Тип кредита', cls: 'finance-field-label' });
    const typeSel = typeG.createEl('select', { cls: 'finance-input' });
    const types: { value: CreditType; label: string }[] = [
      { value: 'consumer', label: 'Потребительский' },
      { value: 'auto', label: 'Автокредит' },
      { value: 'mortgage', label: 'Ипотека' },
      { value: 'credit', label: 'Кредит' },
    ];
    types.forEach(t => {
      const opt = typeSel.createEl('option', { value: t.value, text: t.label });
      if (t.value === this.credit.type) opt.selected = true;
    });
    typeSel.addEventListener('change', () => { this.credit.type = typeSel.value as CreditType; });

    const bankG = form.createDiv('finance-field-group');
    const bankLabel = bankG.createEl('label', { text: 'Банк *', cls: 'finance-field-label' });
    const bankWrap = bankG.createDiv('finance-combobox');
    const bankIn = bankWrap.createEl('input', { type: 'text', cls: 'finance-input finance-combobox-input' });
    bankIn.value = this.credit.bankName;
    bankIn.setAttribute('autocomplete', 'off');

    let dropdown: HTMLElement | null = null;
    const bankOpts = this.o.allBanks;

    const closeDropdown = () => { dropdown?.remove(); dropdown = null; };
    const openDropdown = (q: string) => {
      closeDropdown();
      const lq = q.toLowerCase();
      const filtered = bankOpts.filter(o => !lq || o.toLowerCase().includes(lq));
      if (!filtered.length) {
        if (q) {
          dropdown = bankWrap.createDiv('finance-combobox-dropdown');
          const addItem = dropdown.createDiv({ cls: 'finance-combobox-item' });
          addItem.textContent = `➕ "${q}"`;
          addItem.style.fontStyle = 'italic';
          addItem.style.color = 'var(--text-muted)';
          addItem.addEventListener('mousedown', e => {
            e.preventDefault();
            bankIn.value = q;
            this.credit.bankName = q;
            closeDropdown();
          });
        }
        return;
      }
      dropdown = bankWrap.createDiv('finance-combobox-dropdown');
      filtered.forEach(opt => {
        const item = dropdown!.createDiv({ cls: `finance-combobox-item${opt === bankIn.value ? ' is-active' : ''}` });
        item.textContent = opt;
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          bankIn.value = opt;
          this.credit.bankName = opt;
          closeDropdown();
        });
      });
    };

    bankIn.addEventListener('focus', () => openDropdown(bankIn.value));
    bankIn.addEventListener('input', () => { this.credit.bankName = bankIn.value; openDropdown(bankIn.value); });
    bankIn.addEventListener('blur', () => setTimeout(closeDropdown, 150));

    const amtG = form.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: 'Сумма *', cls: 'finance-field-label' });

    this.amountInput = amtG.createEl('input', { type: 'text', cls: 'finance-input finance-amount-input' });
    this.amountInput.setAttribute('inputmode', 'decimal');
    this.amountInput.setAttribute('placeholder', '0');
    this.amountInput.setAttribute('autocomplete', 'off');

    if (this.credit.currentAmount > 0) {
      this.amountInput.value = fmtAmount(String(this.credit.currentAmount));
    }

    this.amountInput.addEventListener('focus', () => {
      if (this.credit.currentAmount > 0) {
        this.amountInput.value = String(this.credit.currentAmount).replace('.', ',');
      }
    });

    this.amountInput.addEventListener('input', () => {
      const raw = this.amountInput.value;
      this.credit.currentAmount = parseAmount(raw);
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

    this.amountInput.addEventListener('blur', () => {
      const n = parseAmount(this.amountInput.value);
      this.credit.originalAmount = n;
      this.credit.currentAmount = n;
      this.amountInput.value = n > 0 ? fmtAmount(String(n)) : '';
    });

    const rateG = form.createDiv('finance-field-group');
    rateG.createEl('label', { text: 'Процентная ставка (%)', cls: 'finance-field-label' });

    this.rateInput = rateG.createEl('input', { type: 'text', cls: 'finance-input' });
    this.rateInput.setAttribute('inputmode', 'decimal');
    this.rateInput.setAttribute('placeholder', '0');
    this.rateInput.setAttribute('autocomplete', 'off');

    if (this.credit.interestRate > 0) {
      this.rateInput.value = String(this.credit.interestRate);
    }

    this.rateInput.addEventListener('input', () => {
      const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.credit.interestRate = rate;
    });

    this.rateInput.addEventListener('blur', () => {
      const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.credit.interestRate = rate;
      this.rateInput.value = rate > 0 ? String(rate) : '';
    });

    const paymentG = form.createDiv('finance-field-group finance-amount-group');
    paymentG.createEl('label', { text: 'Ежемесячный платёж', cls: 'finance-field-label' });

    this.paymentInput = paymentG.createEl('input', { type: 'text', cls: 'finance-input finance-amount-input' });
    this.paymentInput.setAttribute('inputmode', 'decimal');
    this.paymentInput.setAttribute('placeholder', '0');
    this.paymentInput.setAttribute('autocomplete', 'off');

    if (this.credit.monthlyPayment > 0) {
      this.paymentInput.value = fmtAmount(String(this.credit.monthlyPayment));
    }

    this.paymentInput.addEventListener('focus', () => {
      if (this.credit.monthlyPayment > 0) {
        this.paymentInput.value = String(this.credit.monthlyPayment).replace('.', ',');
      }
    });

    this.paymentInput.addEventListener('input', () => {
      const raw = this.paymentInput.value;
      this.credit.monthlyPayment = parseAmount(raw);
      const sel = this.paymentInput.selectionStart ?? raw.length;
      const rawBefore = raw.slice(0, sel).replace(/[^\d.,]/g, '').length;
      const formatted = fmtAmount(raw);
      if (formatted !== raw) {
        this.paymentInput.value = formatted;
        let newPos = 0, rawCount = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/[\d.,]/.test(formatted[i])) rawCount++;
          if (rawCount >= rawBefore) { newPos = i + 1; break; }
        }
        this.paymentInput.setSelectionRange(newPos, newPos);
      }
    });

    this.paymentInput.addEventListener('blur', () => {
      const n = parseAmount(this.paymentInput.value);
      this.credit.monthlyPayment = n;
      this.paymentInput.value = n > 0 ? fmtAmount(String(n)) : '';
    });

    const dateG = form.createDiv('finance-field-group');
    dateG.createEl('label', { text: 'Дата начала', cls: 'finance-field-label' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    dateIn.value = this.credit.startDate;
    dateIn.addEventListener('change', () => { this.credit.startDate = dateIn.value; });

    const termG = form.createDiv('finance-field-group');
    termG.createEl('label', { text: 'Срок (месяцев)', cls: 'finance-field-label' });
    const termIn = termG.createEl('input', { type: 'number', cls: 'finance-input' });
    termIn.value = String(this.credit.termMonths || 12);
    termIn.setAttribute('min', '1');
    termIn.setAttribute('max', '360');
    termIn.addEventListener('change', () => { this.credit.termMonths = parseInt(termIn.value) || 12; });

    const noteG = form.createDiv('finance-field-group');
    noteG.createEl('label', { text: 'Примечание', cls: 'finance-field-label' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = 'Необязательно — любой комментарий…';
    noteIn.value = this.credit.note;
    noteIn.rows = 2;
    noteIn.addEventListener('input', () => { this.credit.note = noteIn.value; });

    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: 'Отмена', cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: 'Сохранить', cls: 'finance-btn-save' })
      .addEventListener('click', () => this.handleSave());
  }

  private handleSave(): void {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) {
      new Notice('⚠️ Укажите сумму больше нуля');
      this.amountInput.focus();
      return;
    }
    if (!this.credit.bankName.trim()) {
      new Notice('⚠️ Укажите банк');
      return;
    }
    this.credit.bankName = this.credit.bankName.trim();
    if (!this.credit.name.trim()) {
      this.credit.name = 'Кредит';
    }
    this.credit.name = this.credit.name.trim();

    if (!this.credit.payments.length && this.credit.termMonths > 0 && this.credit.monthlyPayment > 0) {
      const startDate = new Date(this.credit.startDate);
      for (let i = 1; i <= this.credit.termMonths; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        const dueDateStr = dueDate.toISOString().split('T')[0];
        this.credit.payments.push({
          id: crypto.randomUUID(),
          amount: this.credit.monthlyPayment,
          dueDate: dueDateStr,
          status: 'pending',
        });
      }
    }

    this.o.onSave(this.credit);
    this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}