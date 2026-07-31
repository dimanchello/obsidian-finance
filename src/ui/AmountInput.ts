import { fmtAmount, parseAmount } from '../utils';

/**
 * After reformatting, the caret must land after the same count of significant
 * (digit/separator) characters it was after in the raw string.
 * Pure — extracted from nine hand-rolled copies so it can be unit-tested.
 */
export function caretAfterFormat(raw: string, caret: number, formatted: string): number {
  const significantBefore = raw.slice(0, caret).replace(/[^\d.,]/g, '').length;
  if (significantBefore === 0) return 0;
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d.,]/.test(formatted[i])) count++;
    if (count >= significantBefore) return i + 1;
  }
  return formatted.length;
}

export interface AmountInputOptions {
  value?: number;
  placeholder?: string;
  onChange: (value: number) => void;
  /** Called after blur re-formats the field (e.g. to update colouring). */
  onBlur?: () => void;
}

export interface AmountInputHandle {
  input: HTMLInputElement;
  /** Programmatically set the value, formatted. */
  set: (value: number) => void;
}

/**
 * Text input with live thousands-grouping that keeps the caret in place —
 * previously ~40 lines duplicated in every modal with an amount field.
 */
export function createAmountInput(parent: HTMLElement, opts: AmountInputOptions): AmountInputHandle {
  const input = parent.createEl('input', {
    type: 'text',
    cls: 'finance-input finance-amount-input',
  });
  input.setAttribute('inputmode', 'decimal');
  input.setAttribute('placeholder', opts.placeholder ?? '0');
  input.setAttribute('autocomplete', 'off');

  let current = opts.value ?? 0;
  if (current > 0) input.value = fmtAmount(String(current));

  input.addEventListener('focus', () => {
    // Plain number while editing: no NBSP groups to fight with
    if (current > 0) input.value = String(current).replace('.', ',');
  });

  input.addEventListener('input', () => {
    const raw = input.value;
    current = parseAmount(raw);
    opts.onChange(current);

    const caret = input.selectionStart ?? raw.length;
    const formatted = fmtAmount(raw);
    if (formatted !== raw) {
      input.value = formatted;
      const pos = caretAfterFormat(raw, caret, formatted);
      input.setSelectionRange(pos, pos);
    }
  });

  input.addEventListener('blur', () => {
    current = parseAmount(input.value);
    opts.onChange(current);
    input.value = current > 0 ? fmtAmount(String(current)) : '';
    opts.onBlur?.();
  });

  return {
    input,
    set: (value: number) => {
      current = value;
      opts.onChange(current);
      input.value = value > 0 ? fmtAmount(String(value)) : '';
    },
  };
}
