import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { CreditRecord, CreditType, ACCRUAL_STEP_MONTHLY, PERCENT_100 } from './types';
import { fmtAmount, parseAmount, getTodayStr, normalizeDateStr, parseDate } from './utils';
import { CreditInfoModal } from './CreditInfoModal';

export interface CreditModalOptions {
  title:     string;
  credit?:   CreditRecord;
  banks:     string[];
  records:   any[]; // FinanceRecord[]
  onSave:    (credit: CreditRecord, updatedRecords: any[]) => void;
}

export class CreditModal extends Modal {
  private tr: Translations;
  private o: CreditModalOptions;
  private credit: CreditRecord;
  private amountInput!: HTMLInputElement;
  private paymentInput!: HTMLInputElement;
  private rateInput!: HTMLInputElement;
  private termInput!: HTMLInputElement;
  private downPaymentValueInput!: HTMLInputElement;
  private downPaymentDateInput!: HTMLInputElement;
  private finalAmountDisplay!: HTMLElement;
  private calcTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, opts: CreditModalOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.o = opts;
    const nowStr = getTodayStr();
    this.credit = opts.credit
      ? {
          ...opts.credit,
          startDate: normalizeDateStr(opts.credit.startDate),
          downPaymentDate: opts.credit.downPaymentDate ? normalizeDateStr(opts.credit.downPaymentDate) : '',
          payments: opts.credit.payments.map(p => ({
            ...p,
            dueDate: normalizeDateStr(p.dueDate),
            paidDate: p.paidDate ? normalizeDateStr(p.paidDate) : undefined,
          }))
        }
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
          purchasePrice: 0,
          downPayment: 0,
          downPaymentType: 'amount',
          downPaymentValue: 0,
          downPaymentDate: '',
          downPaymentRecordId: undefined,
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

    // === РЯД 2: Стоимость покупки | Процентная ставка ===
    const row2 = form.createDiv('finance-form-row finance-full-width');

    const amtG = row2.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.purchasePriceLabel, cls: 'finance-field-label' });
    this.amountInput = amtG.createEl('input', { type: 'text', cls: 'finance-input finance-amount-input' });
    this.amountInput.setAttribute('inputmode', 'decimal');
    this.amountInput.setAttribute('placeholder', '0');
    this.amountInput.setAttribute('autocomplete', 'off');

    if ((this.credit.purchasePrice ?? 0) > 0) {
      this.amountInput.value = fmtAmount(String(this.credit.purchasePrice));
    }

    this.amountInput.addEventListener('focus', () => {
      if ((this.credit.purchasePrice ?? 0) > 0) {
        this.amountInput.value = String(this.credit.purchasePrice).replace('.', ',');
      }
    });

    this.amountInput.addEventListener('input', () => {
      const raw = this.amountInput.value;
      this.credit.purchasePrice = parseAmount(raw);
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
      this.credit.purchasePrice = n;
      this.amountInput.value = n > 0 ? fmtAmount(String(n)) : '';
      this.updateCalculatedValues();
      this.scheduleCalc();
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
      this.updateCalculatedValues();
      this.scheduleCalc();
    });

    // === РЯД 2.5: Первоначальный взнос (значение, тип, дата) ===
    const rowDp = form.createDiv('finance-form-row finance-full-width');

    const dpValG = rowDp.createDiv('finance-field-group');
    dpValG.createEl('label', { text: this.tr.downPaymentLabel, cls: 'finance-field-label' });
    
    const dpInputWrap = dpValG.createDiv('finance-input-with-select');
    dpInputWrap.style.display = 'flex';
    dpInputWrap.style.gap = '8px';

    this.downPaymentValueInput = dpInputWrap.createEl('input', { type: 'text', cls: 'finance-input' });
    this.downPaymentValueInput.style.flex = '1';
    this.downPaymentValueInput.setAttribute('inputmode', 'decimal');
    this.downPaymentValueInput.setAttribute('placeholder', '0');
    this.downPaymentValueInput.setAttribute('autocomplete', 'off');
    if ((this.credit.downPaymentValue ?? 0) > 0) {
      this.downPaymentValueInput.value = this.credit.downPaymentType === 'amount' 
        ? fmtAmount(String(this.credit.downPaymentValue))
        : String(this.credit.downPaymentValue);
    }

    const btnGroup = dpInputWrap.createDiv('finance-btn-group');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '4px';

    const amtBtn = btnGroup.createEl('button', {
      text: '💵',
      cls: `finance-type-toggle${this.credit.downPaymentType === 'amount' ? ' active' : ''}`,
    });
    amtBtn.setAttribute('type', 'button');
    amtBtn.style.padding = '0 10px';
    amtBtn.style.minHeight = '32px';
    amtBtn.style.fontSize = '1.1em';
    amtBtn.style.cursor = 'pointer';

    const pctBtn = btnGroup.createEl('button', {
      text: '%',
      cls: `finance-type-toggle${this.credit.downPaymentType === 'percent' ? ' active' : ''}`,
    });
    pctBtn.setAttribute('type', 'button');
    pctBtn.style.padding = '0 12px';
    pctBtn.style.minHeight = '32px';
    pctBtn.style.fontSize = '1.1em';
    pctBtn.style.fontWeight = 'bold';
    pctBtn.style.cursor = 'pointer';

    const dpDateG = rowDp.createDiv('finance-field-group');
    dpDateG.createEl('label', { text: this.tr.downPaymentDateLabel, cls: 'finance-field-label' });
    this.downPaymentDateInput = dpDateG.createEl('input', { type: 'date', cls: 'finance-input' });
    this.downPaymentDateInput.value = this.credit.downPaymentDate ? normalizeDateStr(this.credit.downPaymentDate) : '';

    this.downPaymentValueInput.addEventListener('focus', () => {
      if ((this.credit.downPaymentValue ?? 0) > 0) {
        this.downPaymentValueInput.value = String(this.credit.downPaymentValue).replace('.', ',');
      }
    });

    const onDpBlurOrChange = () => {
      const type = this.credit.downPaymentType;
      let rawVal = parseAmount(this.downPaymentValueInput.value);
      
      if (type === 'percent' && rawVal > PERCENT_100) {
        rawVal = PERCENT_100;
      }
      
      this.credit.downPaymentValue = rawVal;
      
      if (rawVal > 0) {
        this.downPaymentValueInput.value = type === 'amount' ? fmtAmount(String(rawVal)) : String(rawVal);
      } else {
        this.downPaymentValueInput.value = '';
      }
      this.updateCalculatedValues();
      this.scheduleCalc();
    };

    const setDpType = (type: 'amount' | 'percent') => {
      this.credit.downPaymentType = type;
      amtBtn.classList.toggle('active', type === 'amount');
      pctBtn.classList.toggle('active', type === 'percent');
      onDpBlurOrChange();
    };

    amtBtn.addEventListener('click', (e) => { e.preventDefault(); setDpType('amount'); });
    pctBtn.addEventListener('click', (e) => { e.preventDefault(); setDpType('percent'); });

    this.downPaymentValueInput.addEventListener('blur', onDpBlurOrChange);
    this.downPaymentDateInput.addEventListener('change', () => {
      this.credit.downPaymentDate = this.downPaymentDateInput.value ? normalizeDateStr(this.downPaymentDateInput.value) : '';
    });

    // === РЯД 2.6: Инфо-блок Итого сумма кредита ===
    const rowInfo = form.createDiv('finance-form-row finance-full-width');
    rowInfo.style.marginTop = '-4px';
    rowInfo.style.marginBottom = '4px';
    this.finalAmountDisplay = rowInfo.createDiv('finance-final-amount-info');
    this.finalAmountDisplay.style.fontSize = '13px';
    this.finalAmountDisplay.style.fontWeight = 'bold';
    this.finalAmountDisplay.style.color = 'var(--text-muted)';

    this.updateCalculatedValues();

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
    dateIn.value = normalizeDateStr(this.credit.startDate);
    dateIn.addEventListener('change', () => { this.credit.startDate = normalizeDateStr(dateIn.value); });

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
    const infoBtn = btnRow.createEl('button', { text: '❓', cls: 'finance-btn-cancel' });
    infoBtn.style.marginRight = 'auto';
    infoBtn.addEventListener('click', () => new CreditInfoModal(this.app).open());
    btnRow.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: this.tr.save, cls: 'finance-btn-save' })
      .addEventListener('click', () => this.handleSave());
  }

  private scheduleCalc(): void {
    if (this.calcTimer) clearTimeout(this.calcTimer);
    this.calcTimer = setTimeout(() => this.calcMonthlyPayment(), 500);
  }

  private updateCalculatedValues(): void {
    const purchase = parseAmount(this.amountInput.value);
    this.credit.purchasePrice = purchase;

    const dpVal = this.credit.downPaymentValue ?? 0;
    const dpType = this.credit.downPaymentType ?? 'amount';

    let dpAmount = 0;
    if (dpType === 'percent') {
      dpAmount = Math.round(purchase * (dpVal / PERCENT_100) * 100) / 100;
    } else {
      dpAmount = dpVal;
    }

    this.credit.downPayment = dpAmount;
    this.credit.originalAmount = Math.max(0, purchase - dpAmount);

    this.finalAmountDisplay.textContent = `${this.tr.finalAmountLabel}: ${fmtAmount(String(this.credit.originalAmount))}`;
  }

  private calcMonthlyPayment(): void {
    const amount = this.credit.originalAmount;
    const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
    const term = parseInt(this.termInput.value) || 0;
    if (amount <= 0 || term <= 0) return;
    const monthlyRate = rate / 100 / ACCRUAL_STEP_MONTHLY;
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
    this.credit.purchasePrice = amount;

    // Validate Down Payment
    const dpVal = this.credit.downPayment ?? 0;
    const dpDate = this.credit.downPaymentDate;
    if (dpVal > 0 && !dpDate) {
      new Notice(this.tr.downPaymentDateRequired);
      this.downPaymentDateInput.focus();
      return;
    }
    if (dpDate && dpVal <= 0) {
      new Notice(this.tr.downPaymentAmountRequired);
      this.downPaymentValueInput.focus();
      return;
    }

    const loanPrincipal = this.credit.originalAmount;
    if (!loanPrincipal || loanPrincipal <= 0) {
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
      const today = getTodayStr();
      const startDate = parseDate(this.credit.startDate) ?? new Date();

      const kept = this.credit.payments.filter(p => p.status === 'paid');
      for (const p of kept) p.amount = this.credit.monthlyPayment;
      this.credit.payments = [...kept];

      for (let i = kept.length + 1; i <= this.credit.termMonths; i++) {
        const dueDate = new Date(startDate);
        dueDate.setUTCMonth(dueDate.getUTCMonth() + i);
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
    const totalToPay = this.credit.monthlyPayment * this.credit.termMonths;
    this.credit.currentAmount = Math.max(0, totalToPay - paidSum);

    // Manage Down Payment Transaction
    let updatedRecords = [...this.o.records];
    if (dpVal > 0 && dpDate) {
      if (this.credit.downPaymentRecordId) {
        const existingDpRec = updatedRecords.find(r => r.id === this.credit.downPaymentRecordId);
        if (existingDpRec) {
          existingDpRec.date = dpDate;
          existingDpRec.amount = dpVal;
          existingDpRec.payer = this.credit.bankName;
          existingDpRec.note = this.tr.downPaymentNotePrefix + this.credit.name;
        } else {
          updatedRecords.push({
            id: this.credit.downPaymentRecordId,
            createdAt: Date.now(),
            date: dpDate,
            time: '',
            type: 'expense',
            amount: dpVal,
            category: 'Кредит',
            tag: '',
            payer: this.credit.bankName,
            note: this.tr.downPaymentNotePrefix + this.credit.name,
            attachmentPath: '',
          });
        }
      } else {
        const newDpId = crypto.randomUUID();
        this.credit.downPaymentRecordId = newDpId;
        updatedRecords.push({
          id: newDpId,
          createdAt: Date.now(),
          date: dpDate,
          time: '',
          type: 'expense',
          amount: dpVal,
          category: 'Кредит',
          tag: '',
          payer: this.credit.bankName,
          note: this.tr.downPaymentNotePrefix + this.credit.name,
          attachmentPath: '',
        });
      }
    } else {
      if (this.credit.downPaymentRecordId) {
        updatedRecords = updatedRecords.filter(r => r.id !== this.credit.downPaymentRecordId);
        this.credit.downPaymentRecordId = undefined;
      }
    }

    this.o.onSave(this.credit, updatedRecords);
    this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}
