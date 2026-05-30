import { App, Modal, Notice } from 'obsidian';
import { DebtMovement, DebtMovementType } from './types';
import { fmtAmount, parseAmount } from './utils';

export interface DebtMovementOptions {
  title:           string;
  type:            DebtMovementType;
  movement?:       DebtMovement;
  remainingAmount?: number;
  currency?:       string;
  onSave:          (m: DebtMovement) => void;
}

export class DebtMovementModal extends Modal {
  private o: DebtMovementOptions;
  private mov: DebtMovement;
  private amountInput!: HTMLInputElement;
  private typeInput!: HTMLSelectElement;

  constructor(app: App, opts: DebtMovementOptions) {
    super(app);
    this.o = opts;
    const nowStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().slice(0, 5);
    this.mov = {
      id: crypto.randomUUID(),
      type: opts.type,
      amount: 0,
      date: nowStr,
      time: timeStr,
      createdAt: Date.now(),
      note: '',
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

    const form = contentEl.createDiv('finance-form');

    // ── Amount ───────────────────────────────────────────────────────────
    const amtG = form.createDiv('finance-field-group finance-amount-group');
    const labelText = this.o.type === 'borrow'
      ? 'Сумма (увеличить долг) *'
      : 'Сумма (погашение) *';
    amtG.createEl('label', { text: labelText, cls: 'finance-field-label' });

    this.amountInput = amtG.createEl('input', {
      type: 'text',
      cls: 'finance-input finance-amount-input',
    });
    this.amountInput.setAttribute('inputmode', 'decimal');
    this.amountInput.setAttribute('placeholder', '0');
    this.amountInput.setAttribute('autocomplete', 'off');

    this.amountInput.addEventListener('focus', () => {
      if (this.mov.amount > 0) {
        this.amountInput.value = String(this.mov.amount).replace('.', ',');
      }
    });

    this.amountInput.addEventListener('input', () => {
      const raw = this.amountInput.value;
      this.mov.amount = parseAmount(raw);
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
      this.mov.amount = n;
      this.amountInput.value = n > 0 ? fmtAmount(String(n)) : '';
    });

    // ── Full repayment link (only for repay type) ────────────────────────
    if (this.o.type === 'repay' && this.o.remainingAmount && this.o.remainingAmount > 0) {
      const cur = this.o.currency ?? '';
      const formatted = this.o.remainingAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const link = amtG.createEl('span');
      link.textContent = `→ ${formatted} ${cur}`;
      link.style.cssText = 'cursor:pointer;color:var(--ft-accent);font-size:.85em;text-decoration:underline;display:inline-block;margin-top:4px;';
      link.addEventListener('click', () => {
        this.amountInput.value = fmtAmount(String(this.o.remainingAmount!));
        this.mov.amount = this.o.remainingAmount!;
      });
    }

    // ── Date+Time ────────────────────────────────────────────────────────
    const dtG = form.createDiv('finance-field-group');
    dtG.createEl('label', { text: 'Дата и время', cls: 'finance-field-label' });
    const dtIn = dtG.createEl('input', { type: 'datetime-local', cls: 'finance-input' });
    dtIn.value = this.mov.date
      ? `${this.mov.date}${this.mov.time ? 'T' + this.mov.time : 'T00:00'}`
      : new Date().toISOString().slice(0, 16);
    dtIn.addEventListener('change', () => {
      if (dtIn.value) {
        const [d, t] = dtIn.value.split('T');
        this.mov.date = d;
        this.mov.time = t || '';
      }
    });

    // ── Note — visually distinct ─────────────────────────────────────────
    const noteG = form.createDiv('finance-field-group');
    const noteLabelRow = noteG.createDiv('finance-note-label-row');
    noteLabelRow.createEl('label', { text: 'Примечание', cls: 'finance-field-label' });
    noteLabelRow.createEl('span', { text: '📝', cls: 'finance-note-icon' });
    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = 'Необязательно — любой комментарий…';
    noteIn.value = this.mov.note;
    noteIn.rows = 2;
    noteIn.addEventListener('input', () => { this.mov.note = noteIn.value; });

    // ── Buttons ──────────────────────────────────────────────────────────
    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: 'Отмена', cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btnRow.createEl('button', { text: 'Сохранить', cls: 'finance-btn-save' })
      .addEventListener('click', () => this.handleSave());

    setTimeout(() => this.amountInput.focus(), 50);
  }

  private handleSave(): void {
    const amount = parseAmount(this.amountInput.value);
    this.mov.amount = amount;
    if (!amount || amount <= 0) {
      new Notice('⚠️ Укажите сумму больше нуля');
      this.amountInput.focus();
      return;
    }
    this.o.onSave(this.mov);
    this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}
