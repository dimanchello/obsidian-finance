import { PluginSettings } from './types';
import { noteFilename } from './utils';
import { ViewContext } from './context';

export type AccountMode = 'overview' | 'records' | 'debts' | 'credits' | 'deposits' | 'currency';

export interface AccountHeaderOptions {
  ctx: ViewContext;
  notePath: string;
  settings: PluginSettings;
  /** Current tab — read at click time, so it is a getter rather than a value. */
  getMode: () => AccountMode;
  onModeChange: (mode: AccountMode) => void;
  onRename: (name: string) => Promise<void>;
  onCurrencyChange: (currency: string) => Promise<void>;
  /** AccountView owns DOM listener lifetimes via MarkdownRenderChild. */
  registerDomEvent: (el: Document, type: 'click', cb: (ev: MouseEvent) => void) => void;
}

/**
 * Renders the account header: title (inline-rename), currency badge, per-tab
 * action slot and the tab dropdown.
 *
 * Extracted from AccountView, which now only coordinates data and tabs.
 */
export class AccountHeader {
  private readonly o: AccountHeaderOptions;
  private readonly root: HTMLElement;

  /** Per-tab buttons are rendered into this slot by the active tab. */
  actionsContainer!: HTMLElement;

  constructor(root: HTMLElement, options: AccountHeaderOptions) {
    this.root = root;
    this.o = options;
  }

  private get tr() { return this.o.ctx.tr; }

  render(): void {
    const header = this.root.createDiv('finance-header');
    const left = header.createDiv('finance-header-left');

    const rawName = this.o.ctx.data?.name;
    const displayName = rawName?.trim() ? rawName : noteFilename(this.o.notePath);
    const nameEl = left.createEl('h2', { text: displayName, cls: 'finance-title' });
    nameEl.title = this.tr.clickToRename;
    nameEl.addEventListener('click', () => { this.startNameEdit(nameEl); });

    const curWrap = left.createDiv('finance-currency-badge');
    curWrap.title = this.tr.changeCurrency;
    this.renderCurrencyBadge(curWrap);

    const right = header.createDiv('finance-header-right');
    this.actionsContainer = right.createDiv('finance-header-actions');

    this.renderModeDropdown(right);
  }

  /** Highlights the "•••" button while a tab reachable only from it is active. */
  updateButtons(): void {
    const moreBtn = this.root.querySelector<HTMLElement>('.finance-more-btn');
    if (!moreBtn) return;
    const mode = this.o.getMode();
    moreBtn.toggleClass('is-active-mode', mode !== 'records');
  }

  private renderModeDropdown(parent: HTMLElement): void {
    const moreWrap = parent.createDiv('finance-more-dropdown');
    const moreBtn = moreWrap.createEl('button', { cls: 'finance-add-btn finance-more-btn', text: '•••' });

    const dropdown = moreWrap.createDiv('finance-dropdown-menu');
    dropdown.addClass('is-hidden');

    const mkItem = (icon: string, label: string, targetMode: AccountMode) => {
      const isActive = this.o.getMode() === targetMode;
      const item = dropdown.createDiv(`finance-dropdown-item${isActive ? ' active' : ''}`);
      item.createEl('span', { text: icon, cls: 'btn-icon' });
      item.createEl('span', { text: label });
      if (isActive) return;
      item.addEventListener('click', () => {
        dropdown.addClass('is-hidden');
        this.o.onModeChange(targetMode);
      });
    };

    moreBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!dropdown.hasClass('is-hidden')) {
        dropdown.addClass('is-hidden');
        return;
      }
      dropdown.empty();
      mkItem('📄', this.tr.records, 'records');
      mkItem('💳', this.tr.debts, 'debts');
      mkItem('🏦', this.tr.credits, 'credits');
      mkItem('📈', this.tr.deposits, 'deposits');
      mkItem('💱', this.tr.currencyExchange, 'currency');
      dropdown.createDiv('finance-dropdown-separator');
      mkItem('📊', this.tr.overview, 'overview');
      dropdown.removeClass('is-hidden');
    });

    this.o.registerDomEvent(document, 'click', () => { dropdown.addClass('is-hidden'); });
  }

  private startNameEdit(el: HTMLElement): void {
    const current = el.textContent ?? '';
    el.contentEditable = 'true';
    el.addClass('finance-title-editing');
    el.focus();

    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const finish = async () => {
      el.contentEditable = 'false';
      el.removeClass('finance-title-editing');
      const val = el.textContent?.trim() || current;
      if (val !== current) await this.o.onRename(val);
      el.textContent = val;
    };

    el.addEventListener('blur', () => { void finish(); }, { once: true });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = current; el.blur(); }
    });
  }

  private renderCurrencyBadge(wrap: HTMLElement): void {
    const cur = this.o.ctx.currency;
    wrap.empty();

    const badge = wrap.createEl('span', { text: cur, cls: 'finance-cur-badge' });

    badge.addEventListener('click', e => {
      e.stopPropagation();
      const existing = wrap.querySelector('.finance-cur-popup');
      if (existing) { existing.remove(); return; }

      const popup = wrap.createDiv('finance-cur-popup');

      this.o.settings.customCurrencies.forEach(c => {
        const btn = popup.createEl('button', { text: c, cls: 'finance-cur-option' });
        if (c === cur) btn.addClass('active');
        btn.addEventListener('click', async ev => {
          ev.stopPropagation();
          if (c !== cur) await this.o.onCurrencyChange(c);
          this.renderCurrencyBadge(wrap);
        });
      });

      const close = (ev: MouseEvent) => {
        if (!popup.contains(ev.target as Node)) popup.remove();
      };
      // registerDomEvent, not addEventListener: the popup can be removed by a
      // re-render before any click lands, and the listener would outlive it.
      window.setTimeout(() => { this.o.registerDomEvent(document, 'click', close); }, 0);
    });
  }
}
