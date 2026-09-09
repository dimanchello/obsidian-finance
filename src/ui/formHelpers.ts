import { Notice } from 'obsidian';
import { Translations } from '../i18n';
import { parseAmount, normalizeDateStr, normalizeTimeStr } from '../utils';
import { toDateTimeLocalStr } from '../domain/dateMath';
import { attachAutocomplete } from './Combobox';

export function buildNoteField(
  parent: HTMLElement,
  opts: { label: string; icon?: string; value: string; rows?: number; placeholder?: string; onChange: (v: string) => void }
): HTMLTextAreaElement {
  const noteG = parent.createDiv('finance-field-group finance-full-width');
  const labelText = opts.icon ? `${opts.icon} ${opts.label}` : opts.label;
  noteG.createEl('label', { text: labelText, cls: 'finance-field-label' });
  const noteIn = noteG.createEl('textarea', { cls: 'finance-textarea finance-note-field' });
  if (opts.placeholder) noteIn.placeholder = opts.placeholder;
  noteIn.value = opts.value || '';
  if (opts.rows) noteIn.rows = opts.rows;
  noteIn.addEventListener('input', () => opts.onChange(noteIn.value));
  return noteIn;
}

export function buildRateInput(
  parent: HTMLElement,
  label: string,
  initialRate: number,
  callbacks: { onInput?: (v: number) => void; onBlur?: (v: number) => void }
): HTMLInputElement {
  const rateG = parent.createDiv('finance-field-group');
  rateG.createEl('label', { text: label, cls: 'finance-field-label' });
  const rateInput = rateG.createEl('input', { type: 'text', cls: 'finance-input' });
  rateInput.setAttribute('inputmode', 'decimal');
  rateInput.setAttribute('placeholder', '0');
  rateInput.setAttribute('autocomplete', 'off');

  if (initialRate > 0) {
    rateInput.value = String(initialRate);
  }

  rateInput.addEventListener('input', () => {
    const rate = parseFloat(rateInput.value.replace(',', '.')) || 0;
    callbacks.onInput?.(rate);
  });

  rateInput.addEventListener('blur', () => {
    const rate = parseFloat(rateInput.value.replace(',', '.')) || 0;
    rateInput.value = rate > 0 ? String(rate) : '';
    callbacks.onBlur?.(rate);
  });

  return rateInput;
}

export function buildDateField(
  parent: HTMLElement,
  label: string,
  initial: string,
  onChange: (v: string) => void
): HTMLInputElement {
  const dateG = parent.createDiv('finance-field-group');
  dateG.createEl('label', { text: label, cls: 'finance-field-label' });
  const dateIn = dateG.createEl('input', { type: 'date', cls: 'finance-input' });
  dateIn.value = initial;
  dateIn.addEventListener('change', () => onChange(dateIn.value));
  return dateIn;
}

export function buildDateTimeField(
  parent: HTMLElement,
  label: string,
  date: string,
  time: string,
  _tr: Translations,
  onChange: (date: string, time: string) => void
): HTMLInputElement {
  const group = parent.createDiv('finance-field-group');
  group.createEl('label', { text: label, cls: 'finance-field-label' });
  const input = group.createEl('input', { type: 'datetime-local', cls: 'finance-input' });

  const normDate = date ? normalizeDateStr(date) : '';
  const normTime = time ? normalizeTimeStr(time) : '';
  input.value = normDate
    ? `${normDate}T${normTime || '00:00'}`
    : toDateTimeLocalStr(new Date());

  input.addEventListener('change', () => {
    if (!input.value) return;
    const [d, t] = input.value.slice(0, 16).split('T');
    onChange(normalizeDateStr(d ?? ''), normalizeTimeStr(t ?? ''));
  });

  return input;
}

export function buildButtonRow(
  parent: HTMLElement,
  tr: Translations,
  opts: { onSave: () => void; onCancel: () => void; isEdit?: boolean; saveText?: string }
): void {
  const btnRow = parent.createDiv('finance-modal-btns');

  btnRow.createEl('button', { text: tr.cancel, cls: 'finance-btn-cancel' })
    .addEventListener('click', opts.onCancel);
  const saveLabel = opts.saveText ?? (opts.isEdit ? tr.save : tr.addBtn);
  btnRow.createEl('button', { text: saveLabel, cls: 'finance-btn-save' })
    .addEventListener('click', opts.onSave);
}

export function validateAmountInput(input: HTMLInputElement, tr: Translations): number | null {
  const amount = parseAmount(input.value);
  if (!amount || amount <= 0) {
    new Notice(tr.invalidAmount);
    input.focus();
    return null;
  }
  return amount;
}

export function buildComboboxField(
  parent: HTMLElement,
  label: string,
  value: string,
  options: () => string[],
  onChange: (v: string) => void
): HTMLInputElement {
  const group = parent.createDiv('finance-field-group');
  group.createEl('label', { text: label, cls: 'finance-field-label' });
  const wrap = group.createDiv('finance-combobox');
  const input = wrap.createEl('input', { type: 'text', cls: 'finance-input finance-combobox-input' });
  input.value = value;
  input.setAttribute('autocomplete', 'off');

  attachAutocomplete(input, {
    options,
    onPick: v => {
      input.value = v;
      onChange(v);
    },
    createLabel: q => ` "${q}"`,
  });
  
  input.addEventListener('input', () => onChange(input.value));
  return input;
}
