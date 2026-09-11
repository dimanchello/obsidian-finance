import { App, MarkdownRenderChild, Notice, Platform } from 'obsidian';
import { FinanceStorage } from './storage';
import {
  AccountData, PluginSettings, MOBILE_BREAKPOINT, RecordType,
} from './types';
import { getTodayStr, getTodayTime } from './utils';
import { applyAutoTransactions, type AutoTxDeps } from './domain/autoTransactions';
import { RecordModal } from './RecordModal';
import { ViewContext } from './context';
import { AccountHeader, type AccountMode } from './AccountHeader';
import { AutoTxScheduler } from './AutoTxScheduler';
import { OverviewTab } from './tabs/OverviewTab';
import { RecordsTab } from './tabs/RecordsTab';
import { DebtsTab } from './tabs/DebtsTab';
import { CreditsTab } from './tabs/CreditsTab';
import { DepositsTab } from './tabs/DepositsTab';
import { CurrencyTab } from './tabs/CurrencyTab';

export class AccountView extends MarkdownRenderChild {
  private app:      App;
  private root:     HTMLElement;
  private accountId: string;
  private storage:  FinanceStorage;
  private settings: PluginSettings;
  private pluginId: string;
  private ctx:      ViewContext;
  private header:   AccountHeader;
  private scheduler: AutoTxScheduler;

  private mode: AccountMode = 'overview';
  private isMobile = false;
  private isCheckingAutoTransactions = false;

  constructor(
    app: App, root: HTMLElement, accountId: string, notePath: string,
    storage: FinanceStorage, settings: PluginSettings, pluginId: string,
  ) {
    super(root);
    this.app = app; this.root = root; this.accountId = accountId;
    this.storage = storage; this.settings = settings; this.pluginId = pluginId;
    this.ctx = new ViewContext(app, storage, accountId, pluginId, settings, root);

    this.scheduler = new AutoTxScheduler(() => { void this.refreshAndRender(); });

    this.header = new AccountHeader(root, {
      ctx: this.ctx,
      notePath,
      settings,
      getMode: () => this.mode,
      onModeChange: mode => {
        this.mode = mode;
        this.header.updateButtons();
        this.renderBodyContent();
      },
      onRename: async name => {
        await this.storage.updateMeta(this.accountId, { name });
        if (this.data) this.data.name = name;
      },
      onCurrencyChange: async currency => {
        if (!this.data) return;
        this.data.currency = currency;
        await this.storage.updateMeta(this.accountId, { currency });
      },
      registerDomEvent: (el, type, cb) => {
        this.registerDomEvent(el, type, cb);
      },
    });
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

    this.header.render();

    this.root.createDiv('finance-body');

    if (this.data?.accentColor) {
      this.applyAccentColor(this.data.accentColor);
    }

    // Advancing schedules is an event, not part of drawing: once on open, then hourly.
    await this.checkAutoTransactions();
    this.scheduler.start();

    this.renderBodyContent();
  }

  override onunload(): void {
    this.scheduler.stop();
  }

  private renderBodyContent(): void {
    document.querySelectorAll('.finance-bar-tooltip').forEach(el => el.classList.remove('is-visible'));
    const body = this.root.querySelector<HTMLElement>('.finance-body');
    if (!body) return;
    body.empty();
    this.header.actionsContainer?.empty();

    if (this.mode === 'overview') {
      this.renderOverviewTab(body);
    } else if (this.mode === 'debts') {
      this.renderDebtsTab(body);
    } else if (this.mode === 'credits') {
      this.renderCreditsTab(body);
    } else if (this.mode === 'deposits') {
      this.renderDepositsTab(body);
    } else if (this.mode === 'currency') {
      this.renderCurrencyTab(body);
    } else {
      this.renderRecordsTab(body);
    }
  }

  private renderOverviewTab(body: HTMLElement): void {
    const tab = new OverviewTab(body, this.ctx);
    tab.onNavigate = targetMode => {
      this.mode = targetMode;
      this.header.updateButtons();
      this.renderBodyContent();
    };
    tab.onUpdate = () => this.refreshAndRender();
    tab.render();
  }

  private renderRecordsTab(body: HTMLElement): void {
    const actions = this.header.actionsContainer;

    const incBtn = actions.createEl('button', { cls: 'finance-add-btn finance-income-btn' });
    incBtn.createEl('span', { text: '↑', cls: 'btn-icon' });
    incBtn.createEl('span', { text: this.ctx.tr.typeIncome });

    const expBtn = actions.createEl('button', { cls: 'finance-add-btn finance-expense-btn' });
    expBtn.createEl('span', { text: '↓', cls: 'btn-icon' });
    expBtn.createEl('span', { text: this.ctx.tr.typeExpense });

    incBtn.addEventListener('click', () => { this.mode = 'records'; this.renderBodyContent(); this.openAddModal(RecordType.INCOME); });
    expBtn.addEventListener('click', () => { this.mode = 'records'; this.renderBodyContent(); this.openAddModal(RecordType.EXPENSE); });

    new RecordsTab(this.ctx, body).render();
  }

  private renderDebtsTab(body: HTMLElement): void {
    const tab = new DebtsTab(this.ctx, body);
    tab.onUpdate = () => this.refreshAndRender();
    tab.renderHeaderActions?.(this.header.actionsContainer);
    tab.render();
  }

  private renderCreditsTab(body: HTMLElement): void {
    const tab = new CreditsTab(this.ctx, body);
    tab.renderHeaderActions?.(this.header.actionsContainer);
    tab.render();
  }

  private renderDepositsTab(body: HTMLElement): void {
    const tab = new DepositsTab(this.ctx, body);
    tab.onUpdate = () => this.refreshAndRender();
    tab.renderHeaderActions?.(this.header.actionsContainer);
    tab.render();
  }

  private renderCurrencyTab(body: HTMLElement): void {
    const tab = new CurrencyTab(this.ctx, body);
    tab.onUpdate = () => this.refreshAndRender();
    tab.renderHeaderActions?.(this.header.actionsContainer);
    tab.render();
  }

  private async refreshAndRender(): Promise<void> {
    this.ctx.data = await this.storage.load(this.accountId);
    await this.checkAutoTransactions();
    this.renderBodyContent();
  }

  private applyAccentColor(color: string): void {
    // Empty string would set the property to "" rather than falling back to the theme
    if (color) this.root.style.setProperty('--ft-accent', color);
    else this.root.style.removeProperty('--ft-accent');
  }

  private openAddModal(type: RecordType): void {
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
        nowTime: getTodayTime(),
        newId: () => crypto.randomUUID(),
        labels: {
          depositInterestCat: this.ctx.tr.depositInterestCat,
          depositInterestNote: this.ctx.tr.depositInterestNote,
          depositRefundCat: this.ctx.tr.depositRefundCat,
          depositRefundNote: this.ctx.tr.depositRefundNote,
          depositOpeningCat: this.ctx.tr.depositOpeningCat,
          depositOpenNote: this.ctx.tr.depositOpenNote,
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
