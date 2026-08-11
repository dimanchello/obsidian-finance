import { FOCUS_DELAY_MS, SEARCH_DEBOUNCE_MS } from '../types';

export interface ComboOption {
  value: string;
  label: string;
}

export interface AutocompleteOptions {
  options: () => string[];
  onPick: (value: string) => void;
  /** Shows a "create «query»" item when the query matches nothing. */
  createLabel?: (query: string) => string;
}

/**
 * Free-text input with a suggestions dropdown — the modal flavour of the widget
 * (RecordModal/DebtModal/CreditModal/DepositModal each had their own copy).
 * Closing is focus-driven, not the old setTimeout(close, 150) race.
 */
export function attachAutocomplete(input: HTMLInputElement, opts: AutocompleteOptions): void {
  const wrapper = input.parentElement;
  if (!wrapper) return;
  let dropdown: HTMLElement | null = null;

  const close = () => {
    const el = dropdown;
    dropdown = null;
    if (el?.parentNode) {
      el.remove();
    }
  };

  const pick = (value: string) => {
    input.value = value;
    opts.onPick(value);
    close();
  };

  const open = (q: string) => {
    close();
    const lq = q.toLowerCase();
    const filtered = opts.options().filter(o => !lq || o.toLowerCase().includes(lq));

    if (!filtered.length) {
      if (!q || !opts.createLabel) return;
      dropdown = wrapper.createDiv('finance-combobox-dropdown');
      const addItem = dropdown.createDiv('finance-combobox-item finance-combobox-create');
      addItem.textContent = opts.createLabel(q);
      addItem.addEventListener('mousedown', e => { e.preventDefault(); pick(q); });
      return;
    }

    dropdown = wrapper.createDiv('finance-combobox-dropdown');
    filtered.forEach(opt => {
      const item = dropdown!.createDiv({
        cls: `finance-combobox-item${opt === input.value ? ' is-active' : ''}`,
      });
      item.textContent = opt;
      item.addEventListener('mousedown', e => { e.preventDefault(); pick(opt); });
    });
  };

  input.addEventListener('focus', () => open(input.value));
  input.addEventListener('input', () => { opts.onPick(input.value); open(input.value); });
  input.addEventListener('blur', (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && dropdown?.contains(next)) return;
    close();
  });
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && dropdown) {
      const first = dropdown.querySelector<HTMLElement>('.finance-combobox-item');
      if (first) {
        e.preventDefault();
        first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
    }
    if (e.key === 'Escape') { pick(''); }
    if (e.key === 'ArrowDown' && dropdown) {
      dropdown.querySelector<HTMLElement>('.finance-combobox-item')?.focus();
    }
  });
}

export interface ComboboxOptions {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  searchPlaceholder: string;
  emptyText: string;
  /** When set, a "create «query»" item appears for queries that match no option. */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
}

/**
 * The one dropdown-with-search widget. Replaces five hand-rolled copies whose
 * keyboard handling had quietly diverged.
 */
export class Combobox {
  private readonly opts: ComboboxOptions;
  private readonly trigger: HTMLElement;
  private readonly triggerText: HTMLElement;
  private dropdown: HTMLElement | null = null;
  private outsideHandler: ((e: MouseEvent) => void) | null = null;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  private activeIndex = -1;
  private filtered: ComboOption[] = [];

  constructor(host: HTMLElement, opts: ComboboxOptions) {
    this.opts = opts;

    const wrapper = host.createDiv('finance-custom-select');
    this.trigger = wrapper.createDiv('finance-custom-select-trigger');
    this.trigger.setAttribute('tabindex', '0');
    this.triggerText = this.trigger.createEl('span', { cls: 'finance-custom-select-text' });
    this.triggerText.textContent = this.labelFor(opts.value);

    this.trigger.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(wrapper); });
    this.trigger.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggle(wrapper); }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
  }

  private labelFor(value: string): string {
    const match = this.opts.options.find(o => o.value === value);
    if (match) return match.label;
    // If no match and value is non-empty, show the value itself (edge case)
    if (value !== '') return value;
    // If value is empty and no match, show first option or fallback
    return this.opts.options[0]?.label ?? '—';
  }

  private toggle(wrapper: HTMLElement): void {
    if (this.dropdown) { this.close(); return; }
    this.open(wrapper);
  }

  private open(wrapper: HTMLElement): void {
    this.dropdown = wrapper.createDiv('finance-custom-select-dropdown');

    const searchInput = this.dropdown.createEl('input', {
      type: 'text',
      cls: 'finance-custom-select-search',
      placeholder: this.opts.searchPlaceholder,
    });
    const list = this.dropdown.createDiv('finance-custom-select-list');

    const renderList = (q: string) => {
      list.empty();
      const lq = q.toLowerCase();
      this.filtered = this.opts.options.filter(o =>
        !lq || o.label.toLowerCase().includes(lq) || o.value.toLowerCase().includes(lq));
      this.activeIndex = this.filtered.length ? 0 : -1;

      if (!this.filtered.length && !this.opts.onCreate) {
        list.createDiv({ cls: 'finance-custom-select-empty', text: this.opts.emptyText });
        return;
      }

      this.filtered.forEach((o, i) => {
        const item = list.createDiv({
          cls: `finance-custom-select-item${o.value === this.opts.value ? ' is-active' : ''}`,
        });
        item.dataset.index = String(i);
        item.textContent = o.label;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.select(o);
        });
      });

      const q2 = q.trim();
      if (this.opts.onCreate && q2 && !this.opts.options.some(o => o.label.toLowerCase() === lq)) {
        const createItem = list.createDiv({ cls: 'finance-custom-select-item finance-custom-select-create' });
        createItem.textContent = this.opts.createLabel ? this.opts.createLabel(q2) : `+ "${q2}"`;
        createItem.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.close();
          this.opts.onCreate!(q2);
        });
      }

      this.highlight(list);
    };

    renderList('');

    searchInput.addEventListener('input', () => {
      if (this.searchDebounce) clearTimeout(this.searchDebounce);
      this.searchDebounce = setTimeout(() => renderList(searchInput.value), SEARCH_DEBOUNCE_MS);
    });

    searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeIndex = Math.min(this.activeIndex + 1, this.filtered.length - 1);
        this.highlight(list);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeIndex = Math.max(this.activeIndex - 1, 0);
        this.highlight(list);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = this.filtered[this.activeIndex];
        if (chosen) this.select(chosen);
        else if (this.opts.onCreate && searchInput.value.trim()) {
          const q = searchInput.value.trim();
          this.close();
          this.opts.onCreate(q);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        this.trigger.focus();
      }
    });

    // focusout with relatedTarget instead of the old setTimeout(close, 150) race
    this.dropdown.addEventListener('focusout', (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && this.dropdown?.contains(next)) return;
      if (next && this.trigger.contains(next)) return;
      this.close();
    });

    this.outsideHandler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!this.dropdown?.contains(t) && !this.trigger.contains(t)) this.close();
    };
    document.addEventListener('mousedown', this.outsideHandler);

    setTimeout(() => searchInput.focus(), FOCUS_DELAY_MS);
  }

  private highlight(list: HTMLElement): void {
    list.querySelectorAll('.finance-custom-select-item').forEach(el => {
      const idx = Number((el as HTMLElement).dataset.index ?? -1);
      el.toggleClass('is-highlighted', idx === this.activeIndex);
    });
  }

  private select(o: ComboOption): void {
    this.triggerText.textContent = o.label;
    this.close();
    this.opts.onChange(o.value);
  }

  private close(): void {
    if (this.outsideHandler) {
      document.removeEventListener('mousedown', this.outsideHandler);
      this.outsideHandler = null;
    }

    const el = this.dropdown;
    this.dropdown = null; // Set to null before removing to prevent re-entrancy from synchronous focusout events

    if (el?.parentNode) {
      el.remove();
    }
  }
}
