import { App, Modal, Notice, normalizePath } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { FinanceRecord, RecordType, PluginSettings, FOCUS_DELAY_MS, AUTOFILL_BADGE_MS } from './types';
import { parseAmount, getTodayStr, normalizeDateStr, normalizeTimeStr } from './utils';
import { toDateTimeLocalStr } from './domain/dateMath';
import { attachAutocomplete } from './ui/Combobox';
import { createAmountInput, type AmountInputHandle } from './ui/AmountInput';
import { CalculatorModal } from './CalculatorModal';
import { buildCalculatorIcon } from './ui/icons';

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
  private tr: Translations;
  private o:   RecordModalOptions;
  private rec: Partial<FinanceRecord>;
  private uploadInProgress = false;

  private amountInput!:      HTMLInputElement;
  private amountHandle!:     AmountInputHandle;
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
    this.tr = t(getLocaleFromApp(app));
    this.o   = opts;
    this.rec = {
      date: getTodayStr(),
      time: new Date().toTimeString().slice(0, 5),
      type: 'expense', amount: 0,
      category: '', tag: '', payer: '', note: '', attachmentPath: '',
      ...opts.initial,
    };
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    const isEdit = !!this.o.initial.id;
    contentEl.createEl('h2', {
      text: isEdit ? '✏️ ' + this.tr.editRecord : '➕ ' + this.tr.newRecord,
      cls:  'finance-modal-title',
    });

    // ── Type toggle ──────────────────────────────────────────────────────
    const typeRow    = contentEl.createDiv('finance-type-row');
    this.incomeBtn   = typeRow.createEl('button', { cls: 'finance-type-toggle', text: this.tr.income });
    this.expenseBtn  = typeRow.createEl('button', { cls: 'finance-type-toggle', text: this.tr.expense });
    this.applyType(this.rec.type ?? 'expense');
    this.incomeBtn .addEventListener('click', () => { this.applyType('income');  this.updateAmountColor(); });
    this.expenseBtn.addEventListener('click', () => { this.applyType('expense'); this.updateAmountColor(); });

    const form = contentEl.createDiv('finance-form');

    // ── Amount ───────────────────────────────────────────────────────────
    const amtG = form.createDiv('finance-field-group finance-amount-group');
    amtG.createEl('label', { text: this.tr.amountRequired.replace('{currency}', this.o.currency), cls: 'finance-field-label' });

    const amtRow = amtG.createDiv('finance-amount-row');

    const amountHandle = createAmountInput(amtRow, {
      value: this.rec.amount,
      onChange: v => { this.rec.amount = v; },
      onBlur: () => this.updateAmountColor(),
    });
    this.amountInput = amountHandle.input;
    this.amountHandle = amountHandle;

    this.updateAmountColor();

    const calcIconBtn = amtRow.createEl('button', { cls: 'finance-calc-icon-btn' });
    calcIconBtn.title = this.tr.calculatorTitle;
    buildCalculatorIcon(calcIconBtn);
    calcIconBtn.addEventListener('click', () => {
      const currentValue = this.amountInput.value.replace(/\u00a0/g, '').replace(',', '.');
      new CalculatorModal(this.app, (result) => {
        amountHandle.set(result);
        this.updateAmountColor();
      }, currentValue).open();
    });


    // ── Exchange rate — collapsible ─────────────────────────────────────
    this.exchangeRateWrap = form.createDiv('finance-field-group finance-exrate-group');
    this.exchangeRateWrap.addClass('is-hidden');

    const erLabelRow = this.exchangeRateWrap.createDiv('finance-exrate-label-row');
    erLabelRow.createEl('label', { text: this.tr.exchangeRateQuestion.replace('{currency}', this.o.currency), cls: 'finance-field-label' });
    erLabelRow.createEl('span', { text: '💱', cls: 'finance-exrate-icon' });

    this.exchangeRateInput = this.exchangeRateWrap.createEl('input', {
      type: 'text',
      cls:  'finance-input finance-exrate-input',
    });
    this.exchangeRateInput.setAttribute('inputmode', 'decimal');
    this.exchangeRateInput.setAttribute('placeholder', this.tr.exchangeRateExample);
    this.exchangeRateInput.setAttribute('autocomplete', 'off');

    if (this.rec.exchangeRate && this.rec.exchangeRate > 0) {
      this.exchangeRateInput.value = String(this.rec.exchangeRate).replace('.', ',');
      this.exchangeRateWrap.removeClass('is-hidden');
    }

    this.exchangeRateInput.addEventListener('input', () => {
      const raw = this.exchangeRateInput!.value.replace(',', '.').replace(/[^\d.]/g, '');
      this.rec.exchangeRate = parseFloat(raw) || undefined;
    });

    const erToggle = form.createDiv('finance-exrate-toggle');
    erToggle.textContent = this.rec.exchangeRate ? this.tr.exchangeRateHide : this.tr.exchangeRateShow;
    erToggle.addEventListener('click', () => {
      const wrap = this.exchangeRateWrap!;
      const willShow = wrap.hasClass('is-hidden');
      wrap.toggleClass('is-hidden', !willShow);
      erToggle.textContent = willShow ? this.tr.exchangeRateHide : this.tr.exchangeRateShow;
      if (willShow) setTimeout(() => this.exchangeRateInput!.focus(), FOCUS_DELAY_MS);
    });

    // ── Autofill badge ───────────────────────────────────────────────────
    this.autofillBadge = form.createDiv('finance-autofill-badge');
    this.autofillBadge.addClass('is-hidden');

    // ── Grid: date+time / payer / category / tag ──────────────────────
    const grid = form.createDiv('finance-form-grid');

    // Date+Time (single datetime-local picker)
    const dtG = grid.createDiv('finance-field-group');
    dtG.createEl('label', { text: this.tr.dateTime, cls: 'finance-field-label' });
    const dtIn = dtG.createEl('input', { type: 'datetime-local', cls: 'finance-input' });
    const nowStr = toDateTimeLocalStr(new Date());
    const normDate = this.rec.date ? normalizeDateStr(this.rec.date) : '';
    const normTime = this.rec.time ? normalizeTimeStr(this.rec.time) : '';
    dtIn.value = normDate
      ? `${normDate}T${normTime || '00:00'}`
      : nowStr;
    dtIn.addEventListener('change', () => {
      if (dtIn.value) {
        const [d, t] = dtIn.value.slice(0, 16).split('T');
        this.rec.date = normalizeDateStr(d ?? '');
        this.rec.time = normalizeTimeStr(t ?? '');
      }
    });

    // Payer — autofill trigger + internal toggle inline
    this.payerInput = this.buildAutocomplete(
      grid, this.tr.payer, this.rec.payer ?? '', this.o.payers,
      v => { this.rec.payer = v; this.scheduleAutofill('payer', v); },
      {
        withInternalToggle: true,
        isInternal: !!this.rec.isInternal,
        onToggleInternal: (v) => { this.rec.isInternal = v; },
      },
    );

    // Category — autofill trigger
    this.categoryInput = this.buildAutocomplete(
      grid, this.tr.category, this.rec.category ?? '', this.o.categories,
      v => { this.rec.category = v; this.scheduleAutofill('category', v); },
    );

    // Tag
    this.tagInput = this.buildAutocomplete(
      grid, this.tr.tag, this.rec.tag ?? '', this.o.tags,
      v => { this.rec.tag = v; },
    );

    // ── Note — visually distinct ─────────────────────────────────────────
    const noteG = form.createDiv('finance-field-group');
    const noteLabelRow = noteG.createDiv('finance-note-label-row');
    noteLabelRow.createEl('label', { text: this.tr.note, cls: 'finance-field-label' });
    noteLabelRow.createEl('span', { text: '📝', cls: 'finance-note-icon' });

    const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
    noteIn.placeholder = this.tr.notePlaceholder;
    noteIn.value = this.rec.note ?? '';
    noteIn.rows  = 3;
    noteIn.addEventListener('input', () => { this.rec.note = noteIn.value; });

    // ── Attachment ───────────────────────────────────────────────────────
    this.buildAttachmentField(form);

    // ── Buttons ──────────────────────────────────────────────────────────
    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
          .addEventListener('click', () => this.close());
    btnRow.createEl('button', {
      text: isEdit ? this.tr.save : this.tr.addBtn,
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

    if (opts?.withInternalToggle) {
      let internalState = opts.isInternal ?? false;
      const intBtn = wrapper.createEl('button', {
        type: 'button',
        text: '🔄',
        cls: `finance-internal-btn${internalState ? ' is-active' : ''}`,
        attr: { title: this.tr.internalOpDesc },
      });
      intBtn.addEventListener('click', () => {
        internalState = !internalState;
        opts.onToggleInternal?.(internalState);
        intBtn.classList.toggle('is-active', internalState);
      });
    }

    attachAutocomplete(input, { options: () => options, onPick: onChange });
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
      this.amountHandle.set(match.amount);
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
        this.exchangeRateWrap.removeClass('is-hidden');
        this.exchangeRateInput.value = String(match.exchangeRate).replace('.', ',');
        this.rec.exchangeRate = match.exchangeRate;
        const toggle = this.exchangeRateWrap.parentElement?.querySelector('.finance-exrate-toggle');
        if (toggle) toggle.textContent = this.tr.exchangeRateHide;
        filled = true;
      }
    }

    if (filled) {
      this.autofillBadge.removeClass('is-hidden');
      const d = match.date.split('-');
      this.autofillBadge.textContent = this.tr.autofillFromDate.replace('{date}', `${d[2]}.${d[1]}.${d[0]}`);
      setTimeout(() => { this.autofillBadge.addClass('is-hidden'); }, AUTOFILL_BADGE_MS);
    }
  }

  // ── attachment ────────────────────────────────────────────────────────────

  private buildAttachmentField(form: HTMLElement): void {
    const g   = form.createDiv('finance-field-group');
    g.createEl('label', { text: this.tr.attachment, cls: 'finance-field-label' });

    const wrap   = g.createDiv('finance-attach-wrapper');
    const fi     = wrap.createEl('input', { type: 'file', cls: 'finance-file-input' });
    fi.accept    = 'image/*,.pdf';
    const uid    = `ft-${Date.now()}`;
    fi.id        = uid;
    const lbl    = wrap.createEl('label', { cls: 'finance-attach-label' });
    lbl.setAttribute('for', uid);
    lbl.createEl('span', { text: '📎' });
    lbl.createEl('span', { text: this.tr.selectFile });
    const nameEl = wrap.createEl('span', {
      text: this.rec.attachmentPath
        ? (this.rec.attachmentPath.split('/').pop() ?? this.rec.attachmentPath)
        : this.tr.notSelected,
      cls: 'finance-attach-name',
    });
    const preview = g.createDiv('finance-image-preview');

    // Show existing
    if (this.rec.attachmentPath) {
      const af = this.app.vault.getAbstractFileByPath(this.rec.attachmentPath);
      if (af) {
        const src = this.app.vault.getResourcePath(af as any);
        if (src) {
          preview.removeClass('is-hidden');
          preview.createEl('img', { cls: 'finance-preview-img' }).src = src;
        }
      }
    }

    fi.addEventListener('change', async () => {
      if (this.uploadInProgress) return;
      const file = fi.files?.[0];
      if (!file) return;
      this.uploadInProgress = true;
      nameEl.textContent = file.name;

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => {
          preview.empty(); preview.removeClass('is-hidden');
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
      } catch { new Notice(this.tr.saveError); }
      finally { this.uploadInProgress = false; }
    });
  }

  // ── save ─────────────────────────────────────────────────────────────────

  private handleSave(): void {
    const amount = parseAmount(this.amountInput.value);
    if (!amount || amount <= 0) {
      new Notice(this.tr.invalidAmount);
      this.amountInput.focus();
      return;
    }
    const record: FinanceRecord = {
      id:             this.rec.id             ?? crypto.randomUUID(),
      createdAt:      this.rec.createdAt      ?? Date.now(),
      date:           this.rec.date           ?? getTodayStr(),
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

  override onClose(): void { this.contentEl.empty(); }
}
