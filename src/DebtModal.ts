import { App, Modal, Notice } from 'obsidian';
import { DebtRecord } from './types';

export interface DebtModalOptions {
  title:   string;
  debt?:   DebtRecord;
  allPersons: string[];
  onSave:  (debt: DebtRecord) => void;
}

function fmtAmount(raw: string): string {
  const clean = raw.replace(/[^\d.,]/g, '');
  const dotPos = clean.search(/[.,]/);
  let intPart  = dotPos >= 0 ? clean.slice(0, dotPos)  : clean;
  let decPart  = dotPos >= 0 ? clean.slice(dotPos + 1) : '';
  decPart = decPart.slice(0, 2).replace(/[.,]/g, '');
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return decPart.length > 0 ? `${intPart},${decPart}` : intPart;
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(/\u00a0|\s/g, '').replace(',', '.')) || 0;
}

export class DebtModal extends Modal {
  private o: DebtModalOptions;
  private debt: DebtRecord;
  private amountInput!: HTMLInputElement;
  private interestInput!: HTMLInputElement;
  private totalDisplayEl!: HTMLElement;

  constructor(app: App, opts: DebtModalOptions) {
    super(app);
    this.o = opts;
    const nowStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().slice(0, 5);
    this.debt = opts.debt
      ? { ...opts.debt, direction: (opts.debt.direction || 'borrowed') as 'lent' | 'borrowed', movements: [...opts.debt.movements] }
      : {
          id: crypto.randomUUID(),
          person: '',
          amount: 0,
          originalAmount: 0,
          interestRate: 0,
          direction: 'borrowed',
          date: nowStr,
          time: '',
          dueDate: '',
          createdAt: Date.now(),
          note: '',
          movements: [],
        };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h2', {
      text: this.o.title,
      cls: 'finance-modal-title',
    });

    const dirRow = contentEl.createDiv('finance-type-row');
    const lentBtn = dirRow.createEl('button', {
      text: '💸 Мне должны',
      cls: `finance-type-toggle${this.debt.direction === 'lent' ? ' active lent' : ''}`,
    });
    const borrowedBtn = dirRow.createEl('button', {
      text: '💳 Я должен',
      cls: `finance-type-toggle${this.debt.direction === 'borrowed' ? ' active borrowed' : ''}`,
    });

    const setDirection = (dir: 'lent' | 'borrowed') => {
      this.debt.direction = dir;
      lentBtn.classList.toggle('active', dir === 'lent');
      lentBtn.classList.toggle('lent', dir === 'lent');
      borrowedBtn.classList.toggle('active', dir === 'borrowed');
      borrowedBtn.classList.toggle('borrowed', dir === 'borrowed');
    };

    const form = contentEl.createDiv('finance-form');

    // ── Person label placeholder (will be updated after direction toggle) ────
    let personLabelText = this.debt.direction === 'lent' ? 'Кто *' : 'Кому *';

    const updatePersonLabel = () => {
      const isLent = this.debt.direction === 'lent';
      if (personLabel) personLabel.textContent = isLent ? 'Кто *' : 'Кому *';
    };

    lentBtn.addEventListener('click', () => { setDirection('lent'); updatePersonLabel(); });
    borrowedBtn.addEventListener('click', () => { setDirection('borrowed'); updatePersonLabel(); });

    // ── Amount ───────────────────────────────────────────────────────────
    const amtG = form.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: 'Сумма *', cls: 'finance-field-label' });

    this.amountInput = amtG.createEl('input', {
      type: 'text',
      cls: 'finance-input finance-amount-input',
    });
    this.amountInput.setAttribute('inputmode', 'decimal');
    this.amountInput.setAttribute('placeholder', '0');
    this.amountInput.setAttribute('autocomplete', 'off');

    if (this.debt.amount > 0) {
      this.amountInput.value = fmtAmount(String(this.debt.amount));
    }

    this.amountInput.addEventListener('focus', () => {
      if (this.debt.amount > 0) {
        this.amountInput.value = String(this.debt.amount).replace('.', ',');
      }
    });

    this.amountInput.addEventListener('input', () => {
      const raw = this.amountInput.value;
      this.debt.amount = parseAmount(raw);
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
      this.debt.originalAmount = n;
      this.debt.amount = this.calculateTotalAmount(n, this.debt.interestRate);
      this.amountInput.value = n > 0 ? fmtAmount(String(n)) : '';
      this.updateTotalDisplay();
    });

    // ── Interest Rate ──────────────────────────────────────────────────────
    const interestG = form.createDiv('finance-field-group finance-interest-group');
    interestG.createEl('label', { text: 'Процент', cls: 'finance-field-label' });
    interestG.createEl('span', { text: 'если долг под %, например 10', cls: 'finance-field-hint' });

    this.interestInput = interestG.createEl('input', {
      type: 'text',
      cls: 'finance-input finance-interest-input',
    });
    this.interestInput.setAttribute('inputmode', 'decimal');
    this.interestInput.setAttribute('placeholder', '0');
    this.interestInput.setAttribute('autocomplete', 'off');

    if (this.debt.interestRate > 0) {
      this.interestInput.value = String(this.debt.interestRate);
    }

    this.interestInput.addEventListener('input', () => {
      const rate = parseFloat(this.interestInput.value.replace(',', '.')) || 0;
      this.debt.interestRate = rate;
      this.debt.amount = this.calculateTotalAmount(this.debt.originalAmount, rate);
      this.updateTotalDisplay();
    });

    this.interestInput.addEventListener('blur', () => {
      const rate = parseFloat(this.interestInput.value.replace(',', '.')) || 0;
      this.debt.interestRate = rate;
      this.debt.amount = this.calculateTotalAmount(this.debt.originalAmount, rate);
      this.interestInput.value = rate > 0 ? String(rate) : '';
      this.updateTotalDisplay();
    });

    // Total amount display
    const totalG = form.createDiv('finance-field-group finance-total-group');
    totalG.createEl('label', { text: 'Итого к возврату', cls: 'finance-field-label' });
    this.totalDisplayEl = totalG.createEl('div', { cls: 'finance-total-display' });
    this.totalDisplayEl.textContent = fmtAmount(String(this.debt.amount)) || '0';

    // ── Person (autocomplete combobox like RecordModal) ────────────────
    const personG = form.createDiv('finance-field-group');
    const personLabel = personG.createEl('label', {
      text: this.debt.direction === 'lent' ? 'Кто *' : 'Кому *',
      cls: 'finance-field-label',
    });

    const comboboxWrap = personG.createDiv('finance-combobox');
    const personIn = comboboxWrap.createEl('input', {
      type: 'text',
      cls: 'finance-input finance-combobox-input',
    });
    personIn.value = this.debt.person;
    personIn.setAttribute('autocomplete', 'off');

    let dropdown: HTMLElement | null = null;
    const opts = this.o.allPersons;

    const closeDropdown = () => { dropdown?.remove(); dropdown = null; };

    const openDropdown = (q: string) => {
      closeDropdown();
      const lq = q.toLowerCase();
      const filtered = opts.filter(o => !lq || o.toLowerCase().includes(lq));
      if (!filtered.length) {
        if (q) {
          dropdown = comboboxWrap.createDiv('finance-combobox-dropdown');
          const addItem = dropdown.createDiv({ cls: 'finance-combobox-item' });
          addItem.textContent = `➕ "${q}"`;
          addItem.style.fontStyle = 'italic';
          addItem.style.color = 'var(--text-muted)';
          addItem.addEventListener('mousedown', e => {
            e.preventDefault();
            personIn.value = q;
            this.debt.person = q;
            closeDropdown();
          });
        }
        return;
      }
      dropdown = comboboxWrap.createDiv('finance-combobox-dropdown');
      filtered.forEach(opt => {
        const item = dropdown!.createDiv({
          cls: `finance-combobox-item${opt === personIn.value ? ' is-active' : ''}`,
        });
        item.textContent = opt;
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          personIn.value = opt;
          this.debt.person = opt;
          closeDropdown();
        });
      });
    };

    personIn.addEventListener('focus', () => openDropdown(personIn.value));
    personIn.addEventListener('input', () => { this.debt.person = personIn.value; openDropdown(personIn.value); });
    personIn.addEventListener('blur', () => setTimeout(closeDropdown, 150));
    personIn.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && dropdown) {
        const first = dropdown.querySelector<HTMLElement>('.finance-combobox-item');
        if (first) { e.preventDefault(); first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
      }
      if (e.key === 'Escape') { personIn.value = ''; this.debt.person = ''; closeDropdown(); }
      if (e.key === 'ArrowDown' && dropdown) {
        const first = dropdown.querySelector<HTMLElement>('.finance-combobox-item');
        first?.focus();
      }
    });

    // ── Dates ───────────────────────────────────────────────────────────────
    const dateG = form.createDiv('finance-field-group');
    dateG.createEl('label', { text: 'Дата создания', cls: 'finance-field-label' });
    dateG.createEl('span', { text: 'когда возник долг', cls: 'finance-field-hint' });
    const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
    dateIn.value = this.debt.date;
    dateIn.addEventListener('change', () => { this.debt.date = dateIn.value; });

    const dueDateG = form.createDiv('finance-field-group');
    dueDateG.createEl('label', { text: 'Дата возврата', cls: 'finance-field-label' });
    dueDateG.createEl('span', { text: 'когда нужно вернуть', cls: 'finance-field-hint' });
    const dueDateIn = dueDateG.createEl('input', { type: 'date', cls: 'finance-input' });
    dueDateIn.value = this.debt.dueDate || '';
    dueDateIn.addEventListener('change', () => { this.debt.dueDate = dueDateIn.value; });

    // ── Note — visually distinct ─────────────────────────────────────────
    const noteG = form.createDiv('finance-field-group');
    const noteLabelRow = noteG.createDiv('finance-note-label-row');
    noteLabelRow.createEl('label', { text: 'Примечание', cls: 'finance-field-label' });
    noteLabelRow.createEl('span', { text: '📝', cls: 'finance-note-icon' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = 'Необязательно — любой комментарий…';
    noteIn.value = this.debt.note;
    noteIn.rows = 2;
    noteIn.addEventListener('input', () => { this.debt.note = noteIn.value; });

    // ── Buttons ──────────────────────────────────────────────────────────
    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: 'Отмена', cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: 'Сохранить', cls: 'finance-btn-save' })
      .addEventListener('click', () => this.handleSave());

  }

  private handleSave(): void {
    const amount = parseAmount(this.amountInput.value);
    this.debt.originalAmount = amount;
    this.debt.amount = this.calculateTotalAmount(amount, this.debt.interestRate);
    if (!amount || amount <= 0) {
      new Notice('⚠️ Укажите сумму больше нуля');
      this.amountInput.focus();
      return;
    }
    if (!this.debt.person.trim()) {
      new Notice('⚠️ Укажите кому');
      return;
    }
    this.debt.person = this.debt.person.trim();
    this.o.onSave(this.debt);
    this.close();
  }

  private calculateTotalAmount(original: number, rate: number): number {
    if (rate <= 0) return original;
    return original + (original * rate / 100);
  }

  private updateTotalDisplay(): void {
    if (this.totalDisplayEl) {
      const total = this.calculateTotalAmount(this.debt.originalAmount, this.debt.interestRate);
      if (this.debt.interestRate > 0) {
        this.totalDisplayEl.innerHTML = `${fmtAmount(String(total))} <span class="finance-total-hint">(${fmtAmount(String(this.debt.originalAmount))} + ${this.debt.interestRate}%)</span>`;
      } else {
        this.totalDisplayEl.textContent = fmtAmount(String(total)) || '0';
      }
    }
  }

  onClose(): void { this.contentEl.empty(); }
}
