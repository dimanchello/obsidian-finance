import { App, MarkdownRenderChild, Notice, Platform } from 'obsidian';
import { FinanceStorage } from './storage';
import {
  AccountData, PluginSettings,
  MOBILE_BREAKPOINT, AUTO_TX_INTERVAL_MS,
} from './types';
import { noteFilename, getTodayStr } from './utils';
import { applyAutoTransactions, type AutoTxDeps } from './domain/autoTransactions';
import { RecordModal } from './RecordModal';
import { ViewContext } from './context';
import { RecordsTab } from './tabs/RecordsTab';
import { DebtsTab } from './tabs/DebtsTab';
import { CreditsTab } from './tabs/CreditsTab';
import { DepositsTab } from './tabs/DepositsTab';

export class AccountView extends MarkdownRenderChild {
  private app:      App;
  private root:     HTMLElement;
  private accountId: string;
  private notePath: string;
  private storage:  FinanceStorage;
  private settings: PluginSettings;
  private pluginId: string;
  private ctx:      ViewContext;

  private mode:     'records' | 'debts' | 'credits' | 'deposits' = 'records';
  private isMobile = false;
  private isCheckingAutoTransactions = false;
  private autoTxTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    app: App, root: HTMLElement, accountId: string, notePath: string,
    storage: FinanceStorage, settings: PluginSettings, pluginId: string,
  ) {
    super(root);
    this.app = app; this.root = root; this.accountId = accountId; this.notePath = notePath;
    this.storage = storage; this.settings = settings; this.pluginId = pluginId;
    this.ctx = new ViewContext(app, storage, accountId, pluginId, settings, root);
  }

  private get data(): AccountData | null {
    return this.ctx.data;
  }

  async render(): Promise<void> {
    this.root.empty();
    this.root.addClass('finance-tracker');

    this.isMobile = Platform.isMobile || window.innerWidth <= MOBILE_BREAKPOINT;
    this.ctx.isMobile = this.isMobile;
    if (this.isMobile) this.root.addClass('finance-tracker--mobile');

    this.ctx.data = await this.storage.load(this.accountId);

    await this.ctx.loadStateFromFile();

    this.renderHeader();

    this.root.createDiv('finance-body');

    if (this.data?.accentColor) {
      this.applyAccentColor(this.data.accentColor);
    }

    // Advancing schedules is an event, not part of drawing: once on open, then hourly.
    await this.checkAutoTransactions();
    this.startAutoTxTimer();

    this.renderBodyContent();
  }

  onunload(): void {
    this.stopAutoTxTimer();
  }

  private startAutoTxTimer(): void {
    this.stopAutoTxTimer();
    this.autoTxTimer = setInterval(() => {
      void this.refreshAndRender();
    }, AUTO_TX_INTERVAL_MS);
  }

  private stopAutoTxTimer(): void {
    if (this.autoTxTimer !== null) {
      clearInterval(this.autoTxTimer);
      this.autoTxTimer = null;
    }
  }

  private renderHeader(): void {
    const header = this.root.createDiv('finance-header');
    const left   = header.createDiv('finance-header-left');

    const rawName = this.data?.name;
    const displayName = rawName?.trim() ? rawName : noteFilename(this.notePath);
    const nameEl     = left.createEl('h2', { text: displayName, cls: 'finance-title' });
    nameEl.title     = this.ctx.tr.clickToRename;
    nameEl.addEventListener('click', () => this.startNameEdit(nameEl));

    const curWrap = left.createDiv('finance-currency-badge');
    curWrap.title = this.ctx.tr.changeCurrency;
    this.renderCurrencyBadge(curWrap);

    const right  = header.createDiv('finance-header-right');

    const incBtn = right.createEl('button', { cls: 'finance-add-btn finance-income-btn' });
    incBtn.innerHTML = `<span class="btn-icon">↑</span><span>${this.ctx.tr.typeIncome}</span>`;

    const expBtn = right.createEl('button', { cls: 'finance-add-btn finance-expense-btn' });
    expBtn.innerHTML = `<span class="btn-icon">↓</span><span>${this.ctx.tr.typeExpense}</span>`;

    const moreWrap = right.createDiv('finance-more-dropdown');
    const moreBtn = moreWrap.createEl('button', { cls: 'finance-add-btn finance-more-btn' });
    moreBtn.innerHTML = this.isMobile ? '•••' : '•••';

    const dropdown = moreWrap.createDiv('finance-dropdown-menu');
    dropdown.style.display = 'none';

    const mkDropdownItem = (icon: string, label: string, targetMode: string) => {
      const item = dropdown.createDiv(`finance-dropdown-item${this.mode === targetMode ? ' active' : ''}`);
      item.innerHTML = `${icon} ${label}`;
      if (this.mode !== targetMode) {
        item.addEventListener('click', () => {
          this.mode = targetMode as 'records' | 'debts' | 'credits' | 'deposits';
          this.updateHeaderButtons();
          this.renderBodyContent();
          dropdown.style.display = 'none';
        });
      }
    };

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown.style.display === 'none') {
        dropdown.innerHTML = '';
        mkDropdownItem('📄', this.ctx.tr.records, 'records');
        mkDropdownItem('💳', this.ctx.tr.debts, 'debts');
        mkDropdownItem('🏦', this.ctx.tr.credits, 'credits');
        mkDropdownItem('📈', this.ctx.tr.deposits, 'deposits');
        dropdown.createDiv('finance-dropdown-separator');
        dropdown.style.display = 'block';
      } else {
        dropdown.style.display = 'none';
      }
    });

    this.registerDomEvent(document, 'click', () => { dropdown.style.display = 'none'; });

    incBtn.addEventListener('click', () => { this.mode = 'records'; this.renderBodyContent(); this.openAddModal('income'); });
    expBtn.addEventListener('click', () => { this.mode = 'records'; this.renderBodyContent(); this.openAddModal('expense'); });
  }

  private updateHeaderButtons(): void {
    const moreBtn = this.root.querySelector<HTMLElement>('.finance-more-btn');
    if (moreBtn) {
      const isActive = this.mode === 'debts' || this.mode === 'credits' || this.mode === 'deposits';
      moreBtn.style.border = isActive
        ? '2px solid var(--ft-accent)'
        : '2px solid transparent';
    }
  }

  private renderBodyContent(): void {
    const body = this.root.querySelector<HTMLElement>('.finance-body');
    if (!body) return;
    body.empty();

    if (this.mode === 'debts') {
      this.renderDebtsTab(body);
    } else if (this.mode === 'credits') {
      this.renderCreditsTab(body);
    } else if (this.mode === 'deposits') {
      this.renderDepositsTab(body);
    } else {
      this.renderRecordsTab(body);
    }
  }

  private renderRecordsTab(body: HTMLElement): void {
    new RecordsTab(this.ctx, body).render();
  }

  private renderDebtsTab(body: HTMLElement): void {
    const tab = new DebtsTab(this.ctx, body);
    tab.onUpdate = () => this.refreshAndRender();
    tab.render();
  }

  private renderCreditsTab(body: HTMLElement): void {
    new CreditsTab(this.ctx, body).render();
  }

  private renderDepositsTab(body: HTMLElement): void {
    const tab = new DepositsTab(this.ctx, body);
    tab.onUpdate = () => this.refreshAndRender();
    tab.render();
  }

  private async refreshAndRender(): Promise<void> {
    this.ctx.data = await this.storage.load(this.accountId);
    await this.checkAutoTransactions();
    this.renderBodyContent();
  }

  private startNameEdit(el: HTMLElement): void {
    const current = el.textContent || '';
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
      if (val !== current && this.data) {
        this.data.name = val;
        await this.storage.updateMeta(this.accountId, { name: val });
      }
      el.textContent = val;
    };

    el.addEventListener('blur', finish, { once: true });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = current; el.blur(); }
    });
  }

  private renderCurrencyBadge(wrap: HTMLElement): void {
    const cur = this.ctx.currency;
    wrap.empty();

    const applyCurrency = async (newCur: string) => {
      if (newCur !== cur && this.data) {
        this.data.currency = newCur;
        await this.storage.updateMeta(this.accountId, { currency: newCur });
      }
      this.renderCurrencyBadge(wrap);
    };

    const badge = wrap.createEl('span', { text: cur, cls: 'finance-cur-badge' });

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = wrap.querySelector('.finance-cur-popup');
      if (existing) { existing.remove(); return; }

      const popup = wrap.createDiv('finance-cur-popup');

      const currencies = this.settings.customCurrencies;
      currencies.forEach(c => {
        const btn = popup.createEl('button', { text: c, cls: 'finance-cur-option' });
        if (c === cur) btn.addClass('active');
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          applyCurrency(c);
        });
      });

      const close = (ev: MouseEvent) => {
        if (!popup.contains(ev.target as Node)) popup.remove();
      };
      // registerDomEvent, not addEventListener: the popup can be removed by a
      // re-render before any click lands, and the listener would outlive it.
      window.setTimeout(() => this.registerDomEvent(document, 'click', close), 0);
    });
  }

  private applyAccentColor(color: string): void {
    this.root.style.setProperty('--ft-accent', color);
  }

  private openAddModal(type: 'income' | 'expense'): void {
    if (!this.data) return;
    new RecordModal(this.app, {
      initial: { type },
      records: this.data.records,
      categories: this.data.categories,
      tags: this.data.tags,
      payers: this.data.payers,
      currency: this.ctx.currency,
      settings: this.settings,
      pluginId: this.pluginId,
      onSave: async rec => {
        await this.storage.addRecord(this.accountId, rec);
        this.ctx.data = await this.storage.load(this.accountId);
        this.renderBodyContent();
        new Notice(this.ctx.tr.recordAdded);
      },
    }).open();
  }


  private async checkAutoTransactions(): Promise<void> {
    const data = this.data;
    if (!data || this.isCheckingAutoTransactions) return;
    this.isCheckingAutoTransactions = true;

    try {
      const deps: AutoTxDeps = {
        today: getTodayStr(),
        now: Date.now(),
        nowTime: new Date().toTimeString().slice(0, 5),
        newId: () => crypto.randomUUID(),
        labels: {
          depositInterestCat: this.ctx.tr.depositInterestCat,
          depositInterestNote: this.ctx.tr.depositInterestNote,
          depositRefundCat: this.ctx.tr.depositRefundCat,
          depositRefundNote: this.ctx.tr.depositRefundNote,
          creditDefaultCat: this.ctx.tr.creditDefaultCat,
          creditPaymentNote: this.ctx.tr.creditPaymentNote,
        },
      };

      const result = applyAutoTransactions(data, deps);
      if (!result.changed.records && !result.changed.deposits && !result.changed.credits) return;

      this.ctx.data = { ...data, records: result.records, deposits: result.deposits, credits: result.credits };

      if (result.changed.records) await this.storage.saveAllRecords(this.accountId, result.records);
      if (result.changed.deposits) await this.storage.saveAllDeposits(this.accountId, result.deposits);
      if (result.changed.credits) await this.storage.saveAllCredits(this.accountId, result.credits);
    } finally {
      this.isCheckingAutoTransactions = false;
    }
  }
}
