import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { CreditRecord, CreditType } from './types';
import { fmtAmount, parseAmount } from './utils';

export interface CreditModalOptions {
  title:     string;
  credit?:   CreditRecord;
  banks:     string[];
  onSave:    (credit: CreditRecord) => void;
}

export class CreditModal extends Modal {
  private tr: Translations;
  private o: CreditModalOptions;
  private credit: CreditRecord;
  private amountInput!: HTMLInputElement;
  private paymentInput!: HTMLInputElement;
  private rateInput!: HTMLInputElement;
  private termInput!: HTMLInputElement;
  private calcTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, opts: CreditModalOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o = opts;
    const nowStr = new Date().toISOString().split('T')[0];
    this.credit = opts.credit
      ? { ...opts.credit, payments: [...opts.credit.payments] }
      : {
          id: crypto.randomUUID(),
          name: 'Кредит',
          type: 'consumer',
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

    const form = contentEl.createDiv('finance-form finance-form-grid finance-form-compact');

    // === РЯД 1: Название | Банк ===
    const row1 = form.createDiv('finance-form-row finance-full-width');

    const nameG = row1.createDiv('finance-field-group');
    nameG.createEl('label', { text: this.tr.name, cls: 'finance-field-label' });
    const nameIn = nameG.createEl('input', { type: 'text', cls: 'finance-input' });
    nameIn.value = this.credit.name;
    nameIn.addEventListener('input', () => { this.credit.name = nameIn.value; });

    const bankG = row1.createDiv('finance-field-group');
    bankG.createEl('label', { text: this.tr.bankName + ' *', cls: 'finance-field-label' });
    const bankWrap = bankG.createDiv('finance-combobox');
    const bankIn = bankWrap.createEl('input', { type: 'text', cls: 'finance-input finance-combobox-input' });
    bankIn.value = this.credit.bankName;
    bankIn.setAttribute('autocomplete', 'off');

    let dropdown: HTMLElement | null = null;
    const bankOpts = this.o.banks;
    const closeDropdown = () => { dropdown?.remove(); dropdown = null; };
    const openDropdown = (q: string) => {
      closeDropdown();
      const lq = q.toLowerCase();
      const filtered = bankOpts.filter(o => !lq || o.toLowerCase().includes(lq));
      if (!filtered.length) {
        if (q) {
          dropdown = bankWrap.createDiv('finance-combobox-dropdown');
          const addItem = dropdown.createDiv({ cls: 'finance-combobox-item' });
          addItem.textContent = ` "${q}"`;
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

    // === РЯД 2: Сумма | Процентная ставка ===
    const row2 = form.createDiv('finance-form-row finance-full-width');

    const amtG = row2.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.amountLabel, cls: 'finance-field-label' });
    this.amountInput = amtG.createEl('input', { type: 'text', cls: 'finance-input finance-amount-input' });
    this.amountInput.setAttribute('inputmode', 'decimal');
    this.amountInput.setAttribute('placeholder', '0');
    this.amountInput.setAttribute('autocomplete', 'off');

    if (this.credit.originalAmount > 0) {
      this.amountInput.value = fmtAmount(String(this.credit.originalAmount));
    }

    this.amountInput.addEventListener('focus', () => {
      if (this.credit.originalAmount > 0) {
        this.amountInput.value = String(this.credit.originalAmount).replace('.', ',');
      }
    });

    this.amountInput.addEventListener('input', () => {
      const raw = this.amountInput.value;
      this.credit.originalAmount = parseAmount(raw);
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
      this.scheduleCalc();
    });

    this.amountInput.addEventListener('blur', () => {
      const n = parseAmount(this.amountInput.value);
      this.credit.originalAmount = n;
      this.amountInput.value = n > 0 ? fmtAmount(String(n)) : '';
    });

    const rateG = row2.createDiv('finance-field-group');
    rateG.createEl('label', { text: this.tr.interestRate + ' (%)', cls: 'finance-field-label' });
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
      this.scheduleCalc();
    });

    this.rateInput.addEventListener('blur', () => {
      const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.credit.interestRate = rate;
      this.rateInput.value = rate > 0 ? String(rate) : '';
    });

    // === РЯД 3: Ежемесячный платёж | Срок ===
    const row3 = form.createDiv('finance-form-row finance-full-width');

    const paymentG = row3.createDiv('finance-field-group finance-amount-group');
    paymentG.createEl('label', { text: this.tr.monthlyPayment, cls: 'finance-field-label' });
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

    const termG = row3.createDiv('finance-field-group');
    termG.createEl('label', { text: this.tr.termLabel, cls: 'finance-field-label' });
    this.termInput = termG.createEl('input', { type: 'number', cls: 'finance-input' });
    this.termInput.value = String(this.credit.termMonths || 12);
    this.termInput.setAttribute('min', '1');
    this.termInput.setAttribute('max', '360');
    this.termInput.addEventListener('change', () => { this.credit.termMonths = parseInt(this.termInput.value) || 12; });
    this.termInput.addEventListener('input', () => this.scheduleCalc());

    // === РЯД 4: Дата начала | Тип кредита ===
    const row4 = form.createDiv('finance-form-row finance-full-width');

    const dateG = row4.createDiv('finance-field-group');
    dateG.createEl('label', { text: this.tr.startDate, cls: 'finance-field-label' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    dateIn.value = this.credit.startDate;
    dateIn.addEventListener('change', () => { this.credit.startDate = dateIn.value; });

    const typeG = row4.createDiv('finance-field-group');
    typeG.createEl('label', { text: this.tr.creditTypeLabel, cls: 'finance-field-label' });
    const typeSel = typeG.createEl('select', { cls: 'finance-input finance-filter-select' });
    const types: { value: CreditType; label: string }[] = [
      { value: 'consumer', label: this.tr.creditTypeConsumer },
      { value: 'auto', label: this.tr.creditTypeAuto },
      { value: 'mortgage', label: this.tr.creditTypeMortgage },
    ];
    types.forEach(t => {
      const opt = typeSel.createEl('option', { value: t.value, text: t.label });
      if (t.value === this.credit.type) opt.selected = true;
    });
    typeSel.addEventListener('change', () => { this.credit.type = typeSel.value as CreditType; });

    // === РЯД 5: Примечание (на всю ширину) ===
    const row5 = form.createDiv('finance-form-row finance-full-width');
    const noteG = row5.createDiv('finance-field-group');
    noteG.createEl('label', { text: this.tr.note, cls: 'finance-field-label' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = this.tr.optional;
    noteIn.value = this.credit.note;
    noteIn.rows = 2;
    noteIn.addEventListener('input', () => { this.credit.note = noteIn.value; });

    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: this.tr.save, cls: 'finance-btn-save' })
      .addEventListener('click', () => this.handleSave());
  }

  private scheduleCalc(): void {
    if (this.calcTimer) clearTimeout(this.calcTimer);
    this.calcTimer = setTimeout(() => this.calcMonthlyPayment(), 500);
  }

  private calcMonthlyPayment(): void {
    const amount = parseAmount(this.amountInput.value);
    const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
    const term = parseInt(this.termInput.value) || 0;
    if (amount <= 0 || term <= 0) return;
    const monthlyRate = rate / 100 / 12;
    let payment: number;
    if (monthlyRate > 0) {
      const factor = Math.pow(1 + monthlyRate, term);
      payment = amount * (monthlyRate * factor) / (factor - 1);
    } else {
      payment = amount / term;
    }
    this.credit.monthlyPayment = Math.round(payment * 100) / 100;
    this.paymentInput.value = fmtAmount(String(this.credit.monthlyPayment));
  }

  private handleSave(): void {
    const amount = parseAmount(this.amountInput.value);
    this.credit.originalAmount = amount;
    if (!amount || amount <= 0) {
      new Notice(this.tr.invalidAmount);
      this.amountInput.focus();
      return;
    }
    if (!this.credit.bankName.trim()) {
      new Notice(this.tr.specifyBank);
      return;
    }
    this.credit.bankName = this.credit.bankName.trim();
    if (!this.credit.name.trim()) {
      this.credit.name = 'Кредит';
    }
    this.credit.name = this.credit.name.trim();

    if (this.credit.termMonths > 0 && this.credit.monthlyPayment > 0) {
      const today = new Date().toISOString().split('T')[0];
      const startDate = new Date(this.credit.startDate);

      const kept = this.credit.payments.filter(p => p.status === 'paid');
      for (const p of kept) p.amount = this.credit.monthlyPayment;
      this.credit.payments = [...kept];

      for (let i = kept.length + 1; i <= this.credit.termMonths; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        const dueDateStr = dueDate.toISOString().split('T')[0];
        const isPast = dueDateStr <= today;
        this.credit.payments.push({
          id: crypto.randomUUID(),
          amount: this.credit.monthlyPayment,
          dueDate: dueDateStr,
          status: isPast ? 'paid' : 'pending',
          paidDate: isPast ? dueDateStr : undefined,
        });
      }
    }

    const paidSum = this.credit.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    this.credit.currentAmount = Math.max(0, this.credit.originalAmount - paidSum);

    this.o.onSave(this.credit);
    this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}
