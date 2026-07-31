import { normalizeDateStr, normalizeTimeStr } from '../utils';
import { toDateTimeLocalStr } from '../domain/dateMath';

export interface DateTimeFieldOptions {
  label: string;
  date: string;
  time: string;
  onChange: (date: string, time: string) => void;
}

/** Labelled `datetime-local` field, defaulting to now — previously ~10 copies. */
export function createDateTimeField(parent: HTMLElement, opts: DateTimeFieldOptions): HTMLInputElement {
  const g = parent.createDiv('finance-field-group');
  g.createEl('label', { text: opts.label, cls: 'finance-field-label' });
  const input = g.createEl('input', { type: 'datetime-local', cls: 'finance-input' });

  const normDate = opts.date ? normalizeDateStr(opts.date) : '';
  const normTime = opts.time ? normalizeTimeStr(opts.time) : '';
  input.value = normDate
    ? `${normDate}T${normTime || '00:00'}`
    : toDateTimeLocalStr(new Date());

  input.addEventListener('change', () => {
    if (!input.value) return;
    const [d, t] = input.value.slice(0, 16).split('T');
    opts.onChange(normalizeDateStr(d), normalizeTimeStr(t));
  });

  return input;
}

export interface DateFieldOptions {
  label: string;
  value: string;
  onChange: (date: string) => void;
}

/** Labelled `date` field. */
export function createDateField(parent: HTMLElement, opts: DateFieldOptions): HTMLInputElement {
  const g = parent.createDiv('finance-field-group');
  g.createEl('label', { text: opts.label, cls: 'finance-field-label' });
  const input = g.createEl('input', { type: 'date', cls: 'finance-input' });
  input.value = opts.value ? normalizeDateStr(opts.value) : '';
  input.addEventListener('change', () => {
    opts.onChange(input.value ? normalizeDateStr(input.value) : '');
  });
  return input;
}
