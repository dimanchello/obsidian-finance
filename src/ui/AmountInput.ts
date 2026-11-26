import {
  DECIMAL_PLACES,
  DECIMAL_SEPARATOR,
  DEFAULT_NUMBER_LOCALE,
  INPUT_ATTR,
  STRING_SEPARATOR,
} from '../constants';
import { round2 } from '../domain/money';
import { fmtAmount, parseAmount } from '../utils';

const SIGNIFICANT_CHAR_RE = /[\d.,]/;
const DIGIT_CHAR_RE = /\d/;
const THOUSANDS_GROUP_RE = /\B(?=(\d{3})+(?!\d))/g;
/** Above 1e21, `String(n)` switches to scientific notation; format via locale instead. */
const SCIENTIFIC_NOTATION_THRESHOLD = 1e21;

export const AMOUNT_INPUT_TYPE = {
  INSERT_TEXT: 'insertText',
  INSERT_FROM_PASTE: 'insertFromPaste',
  INSERT_COMPOSITION_TEXT: 'insertCompositionText',
  DELETE_BACKWARD: 'deleteContentBackward',
  DELETE_FORWARD: 'deleteContentForward',
  INSERT_PREFIX: 'insert',
  DELETE_PREFIX: 'delete',
} as const;

export interface NormalizedAmount {
  text: string;
  caret: number;
}

export type BeforeAmountInputDecision =
  | { action: 'allow' }
  | { action: 'prevent' }
  | { action: 'replace'; text: string; caret: number };

export interface ResolvedAmountInput {
  text: string;
  caret: number;
  shouldUpdateDom: boolean;
}

function caretAtSignificantCount(formatted: string, significantCount: number): number {
  if (significantCount <= 0) return 0;
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (SIGNIFICANT_CHAR_RE.test(formatted[i]!)) count++;
    if (count >= significantCount) return i + 1;
  }
  return formatted.length;
}

function formatRoundedPositive(rounded: number): string {
  const raw = rounded >= SCIENTIFIC_NOTATION_THRESHOLD
    ? rounded.toLocaleString(DEFAULT_NUMBER_LOCALE, { useGrouping: false, maximumFractionDigits: DECIMAL_PLACES })
    : String(rounded);
  return fmtAmount(raw);
}

/**
 * After reformatting, the caret must land after the same count of significant
 * (digit/separator) characters it was after in the raw string.
 * Pure — extracted from nine hand-rolled copies so it can be unit-tested.
 */
export function caretAfterFormat(raw: string, caret: number, formatted: string): number {
  const significantBefore = raw.slice(0, caret).replace(/[^\d.,]/g, '').length;
  return caretAtSignificantCount(formatted, significantBefore);
}

/**
 * Normalizes live user input for amount fields while preserving partial decimal
 * entry (`0,`, `1,`, `,5` -> `0,5`) and keeping the caret position aligned.
 */
export function normalizeAmountInput(raw: string, caret = raw.length): NormalizedAmount {
  const safeCaret = Number.isFinite(caret) ? Math.max(0, Math.min(caret, raw.length)) : raw.length;
  let intDigits = '';
  let decDigits = '';
  let hasSep = false;
  let keptBeforeCaret = 0;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    let kept = false;

    if (DIGIT_CHAR_RE.test(ch)) {
      if (!hasSep) {
        intDigits += ch;
        kept = true;
      } else if (decDigits.length < DECIMAL_PLACES) {
        decDigits += ch;
        kept = true;
      }
    } else if ((ch === STRING_SEPARATOR.DOT || ch === STRING_SEPARATOR.COMMA) && !hasSep) {
      hasSep = true;
      kept = true;
    }

    if (kept && i < safeCaret) {
      keptBeforeCaret++;
    }
  }

  if (!intDigits && !hasSep) {
    return { text: '', caret: 0 };
  }

  if (hasSep && intDigits.length === 0) {
    intDigits = INPUT_ATTR.PLACEHOLDER_ZERO;
    if (keptBeforeCaret > 0) {
      keptBeforeCaret += 1;
    }
  }

  const groupedInt = intDigits.replace(THOUSANDS_GROUP_RE, STRING_SEPARATOR.NBSP);
  const text = hasSep ? `${groupedInt}${DECIMAL_SEPARATOR.INPUT}${decDigits}` : groupedInt;
  return {
    text,
    caret: caretAtSignificantCount(text, keptBeforeCaret),
  };
}

/**
 * Formats a numeric value for programmatic initialization / `set()`.
 * Non-finite or non-positive numbers collapse to `0` and an empty display string.
 */
export function formatAmountValue(value: number): { value: number; text: string } {
  if (!Number.isFinite(value) || value <= 0) {
    return { value: 0, text: '' };
  }
  const rounded = Number.isInteger(value) ? value : round2(value);
  if (rounded <= 0) {
    return { value: 0, text: '' };
  }
  return { value: rounded, text: formatRoundedPositive(rounded) };
}

/**
 * Formats field text on blur. Explicitly typed zero (`0`, `000`, `0,`) stays `'0'`
 * rather than disappearing, while an empty field stays `''`.
 */
export function formatAmountOnBlur(raw: string): { value: number; text: string } {
  const { text: normalized } = normalizeAmountInput(raw, raw.length);
  if (!normalized) {
    return { value: 0, text: '' };
  }
  const rawParsed = parseAmount(normalized);
  const parsed = Number.isInteger(rawParsed) ? rawParsed : round2(rawParsed);
  if (parsed > 0) {
    return { value: parsed, text: formatRoundedPositive(parsed) };
  }
  return { value: 0, text: INPUT_ATTR.PLACEHOLDER_ZERO };
}

/**
 * Pre-edit decision for `beforeinput`:
 * - skips over NBSP grouping separators on Backspace/Delete so the first keypress deletes a digit;
 * - ignores disallowed characters (letters, `-`, spaces) so selecting all and typing them does not wipe the field;
 * - ignores a duplicate separator or a leading separator that would truncate trailing digits.
 */
export function resolveBeforeAmountInput(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  inputType: string,
  data: string,
): BeforeAmountInputDecision {
  if (inputType === AMOUNT_INPUT_TYPE.DELETE_BACKWARD) {
    if (
      selectionStart === selectionEnd &&
      selectionStart >= 2 &&
      value[selectionStart - 1] === STRING_SEPARATOR.NBSP
    ) {
      const nextRaw = value.slice(0, selectionStart - 2) + value.slice(selectionStart - 1);
      const normalized = normalizeAmountInput(nextRaw, selectionStart - 2);
      return { action: 'replace', text: normalized.text, caret: normalized.caret };
    }
    return { action: 'allow' };
  }

  if (inputType === AMOUNT_INPUT_TYPE.DELETE_FORWARD) {
    if (
      selectionStart === selectionEnd &&
      selectionStart < value.length - 1 &&
      value[selectionStart] === STRING_SEPARATOR.NBSP
    ) {
      const nextRaw = value.slice(0, selectionStart + 1) + value.slice(selectionStart + 2);
      const normalized = normalizeAmountInput(nextRaw, selectionStart);
      return { action: 'replace', text: normalized.text, caret: normalized.caret };
    }
    return { action: 'allow' };
  }

  if (inputType === AMOUNT_INPUT_TYPE.INSERT_TEXT || inputType === AMOUNT_INPUT_TYPE.INSERT_FROM_PASTE) {
    if (data.length > 0 && !SIGNIFICANT_CHAR_RE.test(data)) {
      return { action: 'prevent' };
    }
    if (data === STRING_SEPARATOR.DOT || data === STRING_SEPARATOR.COMMA) {
      const outside = value.slice(0, selectionStart) + value.slice(selectionEnd);
      if (outside.includes(STRING_SEPARATOR.DOT) || outside.includes(STRING_SEPARATOR.COMMA)) {
        return { action: 'prevent' };
      }
      if (selectionStart === 0 && selectionEnd === 0) {
        const digitsAfter = value.slice(selectionEnd).replace(/\D/g, '').length;
        if (digitsAfter > DECIMAL_PLACES) {
          return { action: 'prevent' };
        }
      }
    }
  }

  return { action: 'allow' };
}

/**
 * Post-edit resolution for `input` (also provides fallbacks when `beforeinput`
 * was not fired or not cancelable, e.g. mobile IME composition).
 */
export function resolveAfterAmountInput(
  raw: string,
  caret: number,
  inputType: string,
  lastText: string,
  lastCaret: number,
): ResolvedAmountInput {
  let nextRaw = raw;
  let nextCaret = caret;

  if (
    inputType === AMOUNT_INPUT_TYPE.DELETE_BACKWARD &&
    nextCaret > 0 &&
    nextRaw.slice(0, nextCaret) + STRING_SEPARATOR.NBSP + nextRaw.slice(nextCaret) === lastText
  ) {
    nextRaw = nextRaw.slice(0, nextCaret - 1) + nextRaw.slice(nextCaret);
    nextCaret = nextCaret - 1;
  } else if (
    inputType === AMOUNT_INPUT_TYPE.DELETE_FORWARD &&
    nextCaret < nextRaw.length &&
    nextRaw.slice(0, nextCaret) + STRING_SEPARATOR.NBSP + nextRaw.slice(nextCaret) === lastText
  ) {
    nextRaw = nextRaw.slice(0, nextCaret) + nextRaw.slice(nextCaret + 1);
  } else if (
    (inputType === '' || inputType.startsWith(AMOUNT_INPUT_TYPE.INSERT_PREFIX)) &&
    nextCaret === 1 &&
    (nextRaw.startsWith(STRING_SEPARATOR.COMMA) || nextRaw.startsWith(STRING_SEPARATOR.DOT)) &&
    nextRaw.slice(1) === lastText &&
    lastText.replace(/\D/g, '').length > DECIMAL_PLACES
  ) {
    return { text: lastText, caret: 0, shouldUpdateDom: true };
  }

  const normalized = normalizeAmountInput(nextRaw, nextCaret);

  if (
    raw.length > 0 &&
    normalized.text === '' &&
    lastText !== '' &&
    !inputType.startsWith(AMOUNT_INPUT_TYPE.DELETE_PREFIX)
  ) {
    return {
      text: lastText,
      caret: Math.min(lastCaret, lastText.length),
      shouldUpdateDom: true,
    };
  }

  return {
    text: normalized.text,
    caret: normalized.caret,
    shouldUpdateDom: normalized.text !== raw,
  };
}

export interface AmountInputOptions {
  value?: number | undefined;
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
  input.setAttribute('inputmode', INPUT_ATTR.INPUTMODE_DECIMAL);
  input.setAttribute('placeholder', opts.placeholder ?? INPUT_ATTR.PLACEHOLDER_ZERO);
  input.setAttribute('autocomplete', INPUT_ATTR.AUTOCOMPLETE_OFF);

  const initial = formatAmountValue(opts.value ?? 0);
  if (initial.text) input.value = initial.text;

  let lastText = input.value;
  let lastCaret = input.value.length;

  const commit = (text: string, caret: number, updateDom: boolean, value: number): void => {
    if (updateDom) {
      input.value = text;
      input.setSelectionRange(caret, caret);
    }
    lastText = text;
    lastCaret = caret;
    opts.onChange(value);
  };

  input.addEventListener('beforeinput', e => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    lastCaret = start;
    const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
    const decision = resolveBeforeAmountInput(input.value, start, end, e.inputType, data);

    if (decision.action === 'prevent') {
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (decision.action === 'replace' && e.cancelable) {
      e.preventDefault();
      commit(decision.text, decision.caret, true, parseAmount(decision.text));
    }
  });

  input.addEventListener('input', e => {
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const inputType = typeof InputEvent !== 'undefined' && e instanceof InputEvent ? e.inputType : '';
    const resolved = resolveAfterAmountInput(raw, caret, inputType, lastText, lastCaret);
    commit(resolved.text, resolved.caret, resolved.shouldUpdateDom, parseAmount(resolved.text));
  });

  input.addEventListener('blur', () => {
    const formatted = formatAmountOnBlur(input.value);
    input.value = formatted.text;
    lastText = formatted.text;
    lastCaret = formatted.text.length;
    opts.onChange(formatted.value);
    opts.onBlur?.();
  });

  return {
    input,
    set: (value: number) => {
      const formatted = formatAmountValue(value);
      input.value = formatted.text;
      lastText = formatted.text;
      lastCaret = formatted.text.length;
      opts.onChange(formatted.value);
    },
  };
}
