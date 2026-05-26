import { App, Modal, Notice, normalizePath } from 'obsidian';
import { FinanceRecord, RecordType, PluginSettings } from './types';
import { fmtAmount, parseAmount } from './utils';
import { CalculatorModal } from './CalculatorModal';

export interface RecordModalOptions {
  initial:    Partial<FinanceRecord>;
  records:    FinanceRecord[];
  categories: string[];
  tags:       string[];
  payers:     string[];
  currency:   string;
  settings:   PluginSettings;
  pluginId:   string;
  onSave:     (r: FinanceRecord) => void;
}

// ── modal ─────────────────────────────────────────────────────────────────────

export class RecordModal extends Modal {
  private o:   RecordModalOptions;
  private rec: Partial<FinanceRecord>;

  private amountInput!:      HTMLInputElement;
  private incomeBtn!:         HTMLButtonElement;
  private expenseBtn!:        HTMLButtonElement;
  private categoryInput!:     HTMLInputElement;
  private tagInput!:          HTMLInputElement;
  private payerInput!:        HTMLInputElement;
  private autofillBadge!:     HTMLElement;
  private autofillTimer:      ReturnType<typeof setTimeout> | null = null;
  private exchangeRateInput?: HTMLInputElement;
  private exchangeRateWrap?:  HTMLElement;

  constructor(app: App, opts: RecordModalOptions) {
    super(app);
    this.o   = opts;
    this.rec = {
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      type: 'expense', amount: 0,
      category: '', tag: '', payer: '', note: '', attachmentPath: '',
      ...opts.initial,
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    const isEdit = !!this.o.initial.id;
    contentEl.createEl('h2', {
      text: isEdit ? '✏️ Редактировать запись' : '➕ Новая запись',
      cls:  'finance-modal-title',
    });

    // ── Type toggle ──────────────────────────────────────────────────────
    const typeRow    = contentEl.createDiv('finance-type-row');
    this.incomeBtn   = typeRow.createEl('button', { cls: 'finance-type-toggle', text: '↑ Доход' });
    this.expenseBtn  = typeRow.createEl('button', { cls: 'finance-type-toggle', text: '↓ Расход' });
    this.applyType(this.rec.type ?? 'expense');
    this.incomeBtn .addEventListener('click', () => { this.applyType('income');  this.updateAmountColor(); });
    this.expenseBtn.addEventListener('click', () => { this.applyType('expense'); this.updateAmountColor(); });

    const form = contentEl.createDiv('finance-form');

    // ── Amount ───────────────────────────────────────────────────────────
    const amtG = form.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: `Сумма * (${this.o.currency})`, cls: 'finance-field-label' });

    const amtRow = amtG.createDiv('finance-amount-row');

    this.amountInput = amtRow.createEl('input', {
      type: 'text',
      cls: 'finance-input finance-amount-input',
    });
    this.amountInput.setAttribute('inputmode', 'decimal');
    this.amountInput.setAttribute('placeholder', '0');
    this.amountInput.setAttribute('autocomplete', 'off');

    // Display existing value formatted
    if (this.rec.amount && this.rec.amount > 0) {
      this.amountInput.value = fmtAmount(String(this.rec.amount));
    }

    this.amountInput.addEventListener('focus', () => {
      // On focus show plain number for easy editing
      if (this.rec.amount && this.rec.amount > 0) {
        this.amountInput.value = String(this.rec.amount).replace('.', ',');
      }
    });

    this.amountInput.addEventListener('input', () => {
      const raw = this.amountInput.value;
      this.rec.amount = parseAmount(raw);

      // Real-time format: track cursor
      const sel  = this.amountInput.selectionStart ?? raw.length;
      const rawBefore = raw.slice(0, sel).replace(/[^\d.,]/g, '').length;

      const formatted = fmtAmount(raw);
      if (formatted !== raw) {
        this.amountInput.value = formatted;
        // Reposition cursor: count raw digit/separator chars up to old position
        let newPos = 0, rawCount = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/[\d.,]/.test(formatted[i])) rawCount++;
          if (rawCount >= rawBefore) { newPos = i + 1; break; }
        }
        this.amountInput.setSelectionRange(newPos, newPos);
      }
    });

    this.amountInput.addEventListener('blur', () => {
      // Format nicely on blur
      const n = parseAmount(this.amountInput.value);
      this.rec.amount = n;
      this.amountInput.value = n > 0 ? fmtAmount(String(n)) : '';
      this.updateAmountColor();
    });

    this.updateAmountColor();

    const calcIconBtn = document.createElement('button');
    calcIconBtn.className = 'finance-calc-icon-btn';
    calcIconBtn.title = 'Калькулятор';
    calcIconBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="3" y="2" width="14" height="16" rx="1.5"/><line x1="7" y1="6" x2="13" y2="6"/><circle cx="7" cy="10" r=".8" fill="currentColor"/><circle cx="13" cy="10" r=".8" fill="currentColor"/><circle cx="7" cy="14" r=".8" fill="currentColor"/><circle cx="13" cy="14" r=".8" fill="currentColor"/></svg>`;
    amtRow.appendChild(calcIconBtn);
    calcIconBtn.addEventListener('click', () => {
      const currentValue = this.amountInput.value.replace(/\u00a0/g, '').replace(',', '.');
      new CalculatorModal(this.app, (result) => {
        this.rec.amount = result;
        this.amountInput.value = result > 0 ? fmtAmount(String(result)) : '';
        this.updateAmountColor();
      }, currentValue).open();
    });


    // ── Exchange rate — collapsible ─────────────────────────────────────
    this.exchangeRateWrap = form.createDiv('finance-field-group finance-exrate-group');
    this.exchangeRateWrap.style.display = 'none';

    const erLabelRow = this.exchangeRateWrap.createDiv('finance-exrate-label-row');
    erLabelRow.createEl('label', { text: `Курс (1 ${this.o.currency} = ?)`, cls: 'finance-field-label' });
    erLabelRow.createEl('span', { text: '💱', cls: 'finance-exrate-icon' });

    this.exchangeRateInput = this.exchangeRateWrap.createEl('input', {
      type: 'text',
      cls:  'finance-input finance-exrate-input',
    });
    this.exchangeRateInput.setAttribute('inputmode', 'decimal');
    this.exchangeRateInput.setAttribute('placeholder', 'напр. 95,50');
    this.exchangeRateInput.setAttribute('autocomplete', 'off');

    if (this.rec.exchangeRate && this.rec.exchangeRate > 0) {
      this.exchangeRateInput.value = String(this.rec.exchangeRate).replace('.', ',');
      this.exchangeRateWrap.style.display = '';
    }

    this.exchangeRateInput.addEventListener('input', () => {
      const raw = this.exchangeRateInput!.value.replace(',', '.').replace(/[^\d.]/g, '');
      this.rec.exchangeRate = parseFloat(raw) || undefined;
    });

    const erToggle = form.createDiv('finance-exrate-toggle');
    erToggle.textContent = this.rec.exchangeRate ? '− Курс' : '+ Курс';
    erToggle.addEventListener('click', () => {
      const shown = this.exchangeRateWrap!.style.display !== 'none';
      this.exchangeRateWrap!.style.display = shown ? 'none' : '';
      erToggle.textContent = shown ? '+ Курс' : '− Курс';
      if (!shown) setTimeout(() => this.exchangeRateInput!.focus(), 50);
    });

    // ── Autofill badge ───────────────────────────────────────────────────
    this.autofillBadge = form.createDiv('finance-autofill-badge');
    this.autofillBadge.style.display = 'none';

    // ── Grid: date+time / payer / category / tag ──────────────────────
    const grid = form.createDiv('finance-form-grid');

    // Date+Time (single datetime-local picker)
    const dtG = grid.createDiv('finance-field-group');
    dtG.createEl('label', { text: 'Дата и время', cls: 'finance-field-label' });
    const dtIn = dtG.createEl('input', { type: 'datetime-local', cls: 'finance-input' });
    const nowStr = new Date().toISOString().slice(0, 16);
    dtIn.value = this.rec.date
      ? `${this.rec.date}${this.rec.time ? 'T' + this.rec.time : 'T00:00'}`
      : nowStr;
    dtIn.addEventListener('change', () => {
      if (dtIn.value) {
        const [d, t] = dtIn.value.split('T');
        this.rec.date = d;
        this.rec.time = t || '';
      }
    });

    // Payer — autofill trigger + internal toggle inline
    this.payerInput = this.buildAutocomplete(
      grid, 'Плательщик', this.rec.payer ?? '', this.o.payers,
      v => { this.rec.payer = v; this.scheduleAutofill('payer', v); },
      {
        withInternalToggle: true,
        isInternal: !!this.rec.isInternal,
        onToggleInternal: (v) => { this.rec.isInternal = v; },
      },
    );

    // Category — autofill trigger
    this.categoryInput = this.buildAutocomplete(
      grid, 'Категория', this.rec.category ?? '', this.o.categories,
      v => { this.rec.category = v; this.scheduleAutofill('category', v); },
    );

    // Tag
    this.tagInput = this.buildAutocomplete(
      grid, 'Тег', this.rec.tag ?? '', this.o.tags,
      v => { this.rec.tag = v; },
    );

    // ── Note — visually distinct ─────────────────────────────────────────
    const noteG = form.createDiv('finance-field-group');
    const noteLabelRow = noteG.createDiv('finance-note-label-row');
    noteLabelRow.createEl('label', { text: 'Примечание', cls: 'finance-field-label' });
    noteLabelRow.createEl('span', { text: '📝', cls: 'finance-note-icon' });

    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = 'Необязательно — любой комментарий к записи…';
    noteIn.value = this.rec.note ?? '';
    noteIn.rows  = 3;
    noteIn.addEventListener('input', () => { this.rec.note = noteIn.value; });

    // ── Attachment ───────────────────────────────────────────────────────
    this.buildAttachmentField(form);

    // ── Buttons ──────────────────────────────────────────────────────────
    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: 'Отмена', cls: 'finance-btn-cancel' })
          .addEventListener('click', () => this.close());
    btnRow.createEl('button', {
      text: isEdit ? 'Сохранить' : 'Добавить',
      cls:  'finance-btn-save',
    }).addEventListener('click', () => this.handleSave());

    setTimeout(() => this.amountInput.focus(), 50);
  }

  // ── type ─────────────────────────────────────────────────────────────────

  private applyType(type: RecordType): void {
    this.rec.type = type;
    this.incomeBtn .classList.toggle('active',  type === 'income');
    this.incomeBtn .classList.toggle('income',  type === 'income');
    this.expenseBtn.classList.toggle('active',  type === 'expense');
    this.expenseBtn.classList.toggle('expense', type === 'expense');
  }

  private updateAmountColor(): void {
    if (!this.amountInput) return;
    this.amountInput.classList.toggle('income-color',  this.rec.type === 'income');
    this.amountInput.classList.toggle('expense-color', this.rec.type === 'expense');
  }

  // ── autocomplete ─────────────────────────────────────────────────────────

  private buildAutocomplete(
    parent:   HTMLElement,
    label:    string,
    value:    string,
    options:  string[],
    onChange: (v: string) => void,
    opts?: { withInternalToggle?: boolean; isInternal?: boolean; onToggleInternal?: (v: boolean) => void },
  ): HTMLInputElement {
    const g = parent.createDiv('finance-field-group');
    g.createEl('label', { text: label, cls: 'finance-field-label' });

    const wrapper = g.createDiv('finance-combobox');
    const input   = wrapper.createEl('input', {
      type: 'text', cls: 'finance-input finance-combobox-input',
    });
    input.value = value;
    input.setAttribute('autocomplete', 'off');

    // ── Internal toggle button ───────────────────────────────────────────
    if (opts?.withInternalToggle) {
      let internalState = opts.isInternal ?? false;
      const intBtn = wrapper.createEl('button', {
        type: 'button',
        cls: `finance-internal-btn${internalState ? ' is-active' : ''}`,
        attr: { title: 'Внутренняя операция (не учитывается в статистике)' },
      });
      intBtn.innerHTML = '🔄';
      intBtn.addEventListener('click', () => {
        internalState = !internalState;
        opts.onToggleInternal?.(internalState);
        intBtn.classList.toggle('is-active', internalState);
      });
    }

    let dropdown: HTMLElement | null = null;

    const closeDropdown = () => { dropdown?.remove(); dropdown = null; };

    const openDropdown = (q: string) => {
      closeDropdown();
      const lq       = q.toLowerCase();
      const filtered = options.filter(o => !lq || o.toLowerCase().includes(lq));
      if (!filtered.length) return;

      dropdown = wrapper.createDiv('finance-combobox-dropdown');
      filtered.forEach(opt => {
        const item = dropdown!.createDiv({
          cls: `finance-combobox-item${opt === input.value ? ' is-active' : ''}`,
        });
        item.textContent = opt;
        item.addEventListener('mousedown', e => {
          e.preventDefault();               // keep focus on input
          input.value = opt;
          onChange(opt);
          closeDropdown();
        });
      });
    };

    input.addEventListener('focus', () => openDropdown(input.value));
    input.addEventListener('input', () => { onChange(input.value); openDropdown(input.value); });
    input.addEventListener('blur',  () => setTimeout(closeDropdown, 150));
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && dropdown) {
        const first = dropdown.querySelector<HTMLElement>('.finance-combobox-item');
        if (first) { e.preventDefault(); first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
      }
      if (e.key === 'Escape') { input.value = ''; onChange(''); closeDropdown(); }
      if (e.key === 'ArrowDown' && dropdown) {
        const first = dropdown.querySelector<HTMLElement>('.finance-combobox-item');
        first?.focus();
      }
    });

    return input;
  }

  // ── smart autofill ────────────────────────────────────────────────────────

  private scheduleAutofill(field: 'category' | 'payer', value: string): void {
    if (this.autofillTimer) clearTimeout(this.autofillTimer);
    this.autofillTimer = setTimeout(() => this.doAutofill(field, value), 350);
  }

  private doAutofill(field: 'category' | 'payer', value: string): void {
    const v = value.trim().toLowerCase();
    if (!v) return;

    const match = [...this.o.records]
      .sort((a, b) => b.createdAt - a.createdAt)
      .find(r => r[field].toLowerCase() === v);
    if (!match) return;

    let filled = false;

    if ((!this.amountInput.value || parseAmount(this.amountInput.value) === 0) && match.amount > 0) {
      this.amountInput.value = fmtAmount(String(match.amount));
      this.rec.amount = match.amount;
      this.updateAmountColor();
      filled = true;
    }
    if (!this.tagInput.value && match.tag) {
      this.tagInput.value = match.tag;
      this.rec.tag = match.tag;
      filled = true;
    }
    if (field === 'category' && !this.payerInput.value && match.payer) {
      this.payerInput.value = match.payer;
      this.rec.payer = match.payer;
      filled = true;
    }
    if (field === 'payer' && !this.categoryInput.value && match.category) {
      this.categoryInput.value = match.category;
      this.rec.category = match.category;
      filled = true;
    }

    if (match.exchangeRate && (!this.exchangeRateInput?.value)) {
      if (this.exchangeRateWrap && this.exchangeRateInput) {
        this.exchangeRateWrap.style.display = '';
        this.exchangeRateInput.value = String(match.exchangeRate).replace('.', ',');
        this.rec.exchangeRate = match.exchangeRate;
        const toggle = this.exchangeRateWrap.parentElement?.querySelector('.finance-exrate-toggle');
        if (toggle) toggle.textContent = '− Курс';
        filled = true;
      }
    }

    if (filled) {
      this.autofillBadge.style.display = 'flex';
      const d = match.date.split('-');
      this.autofillBadge.textContent = `✨ Подставлено из записи от ${d[2]}.${d[1]}.${d[0]}`;
      setTimeout(() => { this.autofillBadge.style.display = 'none'; }, 6000);
    }
  }

  // ── attachment ────────────────────────────────────────────────────────────

  private buildAttachmentField(form: HTMLElement): void {
    const g   = form.createDiv('finance-field-group');
    g.createEl('label', { text: 'Вложение', cls: 'finance-field-label' });

    const wrap   = g.createDiv('finance-attach-wrapper');
    const fi     = wrap.createEl('input', { type: 'file', cls: 'finance-file-input' });
    fi.accept    = 'image/*,.pdf';
    const uid    = `ft-${Date.now()}`;
    fi.id        = uid;
    const lbl    = wrap.createEl('label', { cls: 'finance-attach-label' });
    lbl.setAttribute('for', uid);
    lbl.innerHTML = '<span>📎</span><span>Выбрать файл</span>';
    const nameEl = wrap.createEl('span', {
      text: this.rec.attachmentPath
        ? (this.rec.attachmentPath.split('/').pop() ?? this.rec.attachmentPath)
        : 'Не выбран',
      cls: 'finance-attach-name',
    });
    const preview = g.createDiv('finance-image-preview');

    // Show existing
    if (this.rec.attachmentPath) {
      const af = this.app.vault.getAbstractFileByPath(this.rec.attachmentPath);
      if (af) {
        const src = this.app.vault.getResourcePath(af as any);
        if (src) {
          preview.style.display = 'block';
          preview.createEl('img', { cls: 'finance-preview-img' }).src = src;
        }
      }
    }

    fi.addEventListener('change', async () => {
      const file = fi.files?.[0];
      if (!file) return;
      nameEl.textContent = file.name;

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => {
          preview.empty(); preview.style.display = 'block';
          preview.createEl('img', { cls: 'finance-preview-img' }).src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      }

      try {
        const vaultCfg = (this.app.vault as any).getConfig('attachmentFolderPath') ?? '/';
        let folder: string;
        if (vaultCfg === './') {
          folder = this.o.pluginId;
        } else if (vaultCfg === '/') {
          folder = this.o.pluginId;
        } else {
          folder = normalizePath(`${vaultCfg}/${this.o.pluginId}`);
        }
        if (!this.app.vault.getAbstractFileByPath(folder))
          await this.app.vault.createFolder(folder);
        const dest = normalizePath(
          `${folder}/${Date.now()}_${file.name.replace(/[<>:"/\\|?*]/g, '_')}`
        );
        await this.app.vault.createBinary(dest, await file.arrayBuffer());
        this.rec.attachmentPath = dest;
        nameEl.textContent = `✓ ${file.name}`;
        nameEl.classList.add('finance-attach-ok');
      } catch { new Notice('⚠️ Не удалось сохранить вложение'); }
    });
  }

  // ── save ─────────────────────────────────────────────────────────────────

  private handleSave(): void {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) {
      new Notice('⚠️ Укажите сумму больше нуля');
      this.amountInput.focus();
      return;
    }
    const record: FinanceRecord = {
      id:             this.rec.id             ?? crypto.randomUUID(),
      createdAt:      this.rec.createdAt      ?? Date.now(),
      date:           this.rec.date           ?? new Date().toISOString().split('T')[0],
      time:           this.rec.time           ?? '',
      type:           this.rec.type           ?? 'expense',
      amount,
      category:       this.rec.category?.trim()       ?? '',
      tag:            this.rec.tag?.trim()            ?? '',
      payer:          this.rec.payer?.trim()          ?? '',
      note:           this.rec.note?.trim()           ?? '',
      attachmentPath: this.rec.attachmentPath         ?? '',
      isInternal:     this.rec.isInternal             ?? false,
      linkedId:       this.rec.linkedId             ?? '',
      exchangeRate:   this.rec.exchangeRate,
    };
    this.o.onSave(record);
    this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}
