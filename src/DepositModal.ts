import { App, Modal, Notice } from 'obsidian';
import { DepositRecord, DepositType, AccrualFrequency, DepositAccrualType } from './types';

export interface DepositModalOptions {
  title: string;
  deposit?: DepositRecord;
  allBanks: string[];
  onSave: (deposit: DepositRecord) => void;
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

export class DepositModal extends Modal {
  private o: DepositModalOptions;
  private deposit: DepositRecord;
  private amountInput!: HTMLInputElement;
  private rateInput!: HTMLInputElement;
  private frequencyContainer!: HTMLElement;

  constructor(app: App, opts: DepositModalOptions) {
    super(app);
    this.o = opts;
    const nowStr = new Date().toISOString().split('T')[0];
    this.deposit = opts.deposit
        ? { ...opts.deposit, accruals: [...opts.deposit.accruals], topUps: [...(opts.deposit.topUps || [])], withdrawals: [...(opts.deposit.withdrawals || [])] }
        : {
          id: crypto.randomUUID(),
          name: 'Вклад',
          type: 'term' as DepositType,
          bankName: '',
          amount: 0,
          interestRate: 0,
          startDate: nowStr,
          termMonths: 12,
          accrualType: 'end_of_term' as DepositAccrualType,
          paymentFrequency: 'monthly' as AccrualFrequency,
          createdAt: Date.now(),
          note: '',
          status: 'active',
          accruals: [],
          topUps: [],
          withdrawals: [],
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
    nameG.createEl('label', { text: 'Название', cls: 'finance-field-label' });
    const nameIn = nameG.createEl('input', { type: 'text', cls: 'finance-input' });
    nameIn.value = this.deposit.name;
    nameIn.addEventListener('input', () => { this.deposit.name = nameIn.value; });

    const bankG = row1.createDiv('finance-field-group');
    bankG.createEl('label', { text: 'Банк', cls: 'finance-field-label' });
    const bankWrap = bankG.createDiv('finance-combobox');
    const bankIn = bankWrap.createEl('input', { type: 'text', cls: 'finance-input finance-combobox-input' });
    bankIn.value = this.deposit.bankName;
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
            this.deposit.bankName = q;
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
          this.deposit.bankName = opt;
          closeDropdown();
        });
      });
    };
    bankIn.addEventListener('focus', () => openDropdown(bankIn.value));
    bankIn.addEventListener('input', () => { this.deposit.bankName = bankIn.value; openDropdown(bankIn.value); });
    bankIn.addEventListener('blur', () => setTimeout(closeDropdown, 150));

    // === РЯД 2: Сумма | Процентная ставка ===
    const row2 = form.createDiv('finance-form-row finance-full-width');

    const amtG = row2.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: 'Сумма', cls: 'finance-field-label' });
    // Класс finance-amount-input сохранен для выравнивания текста, но его размер мы поправим в CSS
    this.amountInput = amtG.createEl('input', { type: 'text', cls: 'finance-input finance-amount-input' });
    this.amountInput.setAttribute('inputmode', 'decimal');
    this.amountInput.setAttribute('placeholder', '0');
    this.amountInput.setAttribute('autocomplete', 'off');
    if (this.deposit.amount > 0) {
      this.amountInput.value = fmtAmount(String(this.deposit.amount));
    }
    this.amountInput.addEventListener('input', () => {
      const raw = this.amountInput.value;
      this.deposit.amount = parseAmount(raw);
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
      this.deposit.amount = n;
      this.amountInput.value = n > 0 ? fmtAmount(String(n)) : '';
    });

    const rateG = row2.createDiv('finance-field-group');
    rateG.createEl('label', { text: 'Процентная ставка (%)', cls: 'finance-field-label' });
    this.rateInput = rateG.createEl('input', { type: 'text', cls: 'finance-input' });
    this.rateInput.setAttribute('inputmode', 'decimal');
    this.rateInput.setAttribute('placeholder', '0');
    this.rateInput.setAttribute('autocomplete', 'off');
    if (this.deposit.interestRate > 0) {
      this.rateInput.value = String(this.deposit.interestRate);
    }
    this.rateInput.addEventListener('input', () => {
      const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.deposit.interestRate = rate;
    });
    this.rateInput.addEventListener('blur', () => {
      const rate = parseFloat(this.rateInput.value.replace(',', '.')) || 0;
      this.deposit.interestRate = rate;
      this.rateInput.value = rate > 0 ? String(rate) : '';
    });

    // === РЯД 3: Дата начала | Срок ===
    const row3 = form.createDiv('finance-form-row finance-full-width');

    const dateG = row3.createDiv('finance-field-group');
    dateG.createEl('label', { text: 'Дата начала', cls: 'finance-field-label' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    dateIn.value = this.deposit.startDate;
    dateIn.addEventListener('change', () => { this.deposit.startDate = dateIn.value; });

    const termG = row3.createDiv('finance-field-group');
    termG.createEl('label', { text: 'Срок (мес)', cls: 'finance-field-label' });
    const termIn = termG.createEl('input', { type: 'number', cls: 'finance-input' });
    termIn.value = String(this.deposit.termMonths || 12);
    termIn.setAttribute('min', '1');
    termIn.setAttribute('max', '360');
    termIn.addEventListener('change', () => { this.deposit.termMonths = parseInt(termIn.value) || 12; });

    // === РЯД 4: Тип вклада | Тип начисления ===
    const row4 = form.createDiv('finance-form-row finance-full-width');

    const typeG = row4.createDiv('finance-field-group');
    typeG.createEl('label', { text: 'Тип вклада', cls: 'finance-field-label' });
    const typeSel = typeG.createEl('select', { cls: 'finance-input finance-filter-select' });
    const types: { value: DepositType; label: string }[] = [
      { value: 'term', label: 'Срочный' },
      { value: 'demand', label: 'До востребования' },
      { value: 'savings', label: 'Накопительный' },
    ];
    types.forEach(t => {
      const opt = typeSel.createEl('option', { value: t.value, text: t.label });
      if (t.value === this.deposit.type) opt.selected = true;
    });
    typeSel.addEventListener('change', () => { this.deposit.type = typeSel.value as DepositType; });

    const accrualG = row4.createDiv('finance-field-group');
    accrualG.createEl('label', { text: 'Тип начисления', cls: 'finance-field-label' });
    const accrualSel = accrualG.createEl('select', { cls: 'finance-input finance-filter-select' });
    const accrualTypes: { value: DepositAccrualType; label: string }[] = [
      { value: 'capitalization', label: 'На счёт (капитализация)' },
      { value: 'end_of_term', label: 'В конце срока' },
      { value: 'capitalization_at_end', label: 'В конце с капитал.' },
    ];
    accrualTypes.forEach(t => {
      const opt = accrualSel.createEl('option', { value: t.value, text: t.label });
      if (t.value === this.deposit.accrualType) opt.selected = true;
    });
    accrualSel.addEventListener('change', () => {
      this.deposit.accrualType = accrualSel.value as DepositAccrualType;
      this.frequencyContainer.style.display = (this.deposit.accrualType === 'end_of_term' || this.deposit.accrualType === 'capitalization_at_end') ? 'none' : 'block';
    });

    // === ДИНАМИЧЕСКИЙ РЯД: Периодичность ===
    this.frequencyContainer = form.createDiv('finance-form-row finance-full-width');
    const freqG = this.frequencyContainer.createDiv('finance-field-group');
    freqG.createEl('label', { text: 'Периодичность', cls: 'finance-field-label' });
    const freqSel = freqG.createEl('select', { cls: 'finance-input finance-filter-select' });
    const freqs: { value: AccrualFrequency; label: string }[] = [
      { value: 'monthly', label: 'Ежемесячно' },
      { value: 'quarterly', label: 'Ежеквартально' },
    ];
    freqs.forEach(f => {
      const opt = freqSel.createEl('option', { value: f.value, text: f.label });
      if (f.value === this.deposit.paymentFrequency) opt.selected = true;
    });
    freqSel.addEventListener('change', () => { this.deposit.paymentFrequency = freqSel.value as AccrualFrequency; });
    this.frequencyContainer.style.display = (this.deposit.accrualType === 'end_of_term' || this.deposit.accrualType === 'capitalization_at_end') ? 'none' : 'block';

    // === РЯД 5: Примечание ===
    const row5 = form.createDiv('finance-form-row finance-full-width');
    const noteG = row5.createDiv('finance-field-group');
    noteG.createEl('label', { text: 'Примечание', cls: 'finance-field-label' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = 'Необязательно';
    noteIn.value = this.deposit.note;
    noteIn.rows = 2;
    noteIn.addEventListener('input', () => { this.deposit.note = noteIn.value; });

    // Кнопки управления
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
    if (!this.deposit.bankName.trim()) {
      new Notice('⚠️ Укажите банк');
      return;
    }
    this.deposit.bankName = this.deposit.bankName.trim();
    if (!this.deposit.name.trim()) {
      this.deposit.name = 'Вклад';
    }
    this.deposit.name = this.deposit.name.trim();

    if (!this.deposit.accruals.length && this.deposit.termMonths > 0) {
      const startDate = new Date(this.deposit.startDate);
      const today = new Date().toISOString().split('T')[0];
      if (this.deposit.accrualType === 'capitalization') {
        const monthsStep = this.deposit.paymentFrequency === 'monthly' ? 1 : 3;
        for (let i = monthsStep; i <= this.deposit.termMonths; i += monthsStep) {
          const dueDate = new Date(startDate);
          dueDate.setMonth(dueDate.getMonth() + i);
          const dueDateStr = dueDate.toISOString().split('T')[0];
          const interestAmount = (this.deposit.amount * this.deposit.interestRate / 100) * (monthsStep / 12);
          const isPast = dueDateStr <= today;
          this.deposit.accruals.push({
            id: crypto.randomUUID(),
            amount: Math.round(interestAmount * 100) / 100,
            dueDate: dueDateStr,
            status: isPast ? 'paid' : 'pending',
            paidDate: isPast ? dueDateStr : undefined,
          });
        }
      } else if (this.deposit.accrualType === 'capitalization_at_end') {
        const monthsStep = this.deposit.paymentFrequency === 'monthly' ? 1 : 3;
        for (let i = monthsStep; i <= this.deposit.termMonths; i += monthsStep) {
          const dueDate = new Date(startDate);
          dueDate.setMonth(dueDate.getMonth() + i);
          const dueDateStr = dueDate.toISOString().split('T')[0];
          const interestAmount = (this.deposit.amount * this.deposit.interestRate / 100) * (monthsStep / 12);
          const isPast = dueDateStr <= today;
          this.deposit.accruals.push({
            id: crypto.randomUUID(),
            amount: Math.round(interestAmount * 100) / 100,
            dueDate: dueDateStr,
            status: isPast ? 'paid' : 'pending',
            paidDate: isPast ? dueDateStr : undefined,
          });
        }
      } else if (this.deposit.accrualType === 'end_of_term') {
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + this.deposit.termMonths);
        const endDateStr = endDate.toISOString().split('T')[0];
        const totalInterest = (this.deposit.amount * this.deposit.interestRate / 100) * (this.deposit.termMonths / 12);
        const isPast = endDateStr <= today;
        this.deposit.accruals.push({
          id: crypto.randomUUID(),
          amount: Math.round(totalInterest * 100) / 100,
          dueDate: endDateStr,
          status: isPast ? 'paid' : 'pending',
          paidDate: isPast ? endDateStr : undefined,
        });
      }
    }

    this.o.onSave(this.deposit);
    this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}
