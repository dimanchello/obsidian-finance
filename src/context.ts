import { App } from 'obsidian';
import { FinanceStorage } from './storage';
import {
  AccountData, PluginSettings, ViewState,
  DEFAULT_FILTER, DEFAULT_SORT, DEFAULT_DEBT_FILTER, DEFAULT_CREDIT_FILTER, DEFAULT_DEPOSIT_FILTER,
  MOBILE_BREAKPOINT,
} from './types';
import { fmt, fmtDate } from './utils';
import { getLocaleFromApp, t, type Translations, type Locale } from './i18n';

const LS = (pid: string) => `ft-view:${pid}:`;

export class ViewContext {
  app: App;
  storage: FinanceStorage;
  accountId: string;
  pluginId: string;
  settings: PluginSettings;
  isMobile: boolean;
  container: HTMLElement;

  locale: Locale;
  tr: Translations;

  private _data: AccountData | null = null;
  private _state: ViewState;

  constructor(
    app: App,
    storage: FinanceStorage,
    accountId: string,
    pluginId: string,
    settings: PluginSettings,
    container: HTMLElement,
  ) {
    this.app = app;
    this.storage = storage;
    this.accountId = accountId;
    this.pluginId = pluginId;
    this.settings = settings;
    this.container = container;
    this.locale = getLocaleFromApp(app);
    this.tr = t(this.locale);
    this.isMobile = (app as any).isMobile ?? window.innerWidth <= MOBILE_BREAKPOINT;
    this._state = this.loadState(this.settings.defaultPageSize);
  }

  get data(): AccountData | null {
    return this._data;
  }

  set data(val: AccountData | null) {
    this._data = val;
  }

  get state(): ViewState {
    return this._state;
  }

  set state(val: ViewState) {
    this._state = val;
  }

  get currency(): string {
    return this._data?.currency ?? this.settings.defaultCurrency;
  }

  saveState(): void {
    try {
      localStorage.setItem(LS(this.pluginId) + this.accountId, JSON.stringify({ ...this._state, page: 0 }));
    } catch { /* ignore */ }
    this.storage.saveViewState(this.accountId, { ...this._state, page: 0 }).catch(() => {});
  }

  async loadStateFromFile(): Promise<void> {
    try {
      const fileState = await this.storage.loadViewState(this.accountId);
      if (fileState) {
        this._state = { ...this._state, ...fileState } as ViewState;
      }
    } catch { /* ignore */ }
  }

  loadState(pageSize: number): ViewState {
    try {
      const raw = localStorage.getItem(LS(this.pluginId) + this.accountId);
      if (raw) {
        const v = JSON.parse(raw) as ViewState;
        v.page = 0;
        v.debtFilter ??= { ...DEFAULT_DEBT_FILTER };
        v.debtSort ??= { field: 'date', dir: 'desc' };
        if (typeof v.debtPage !== 'number') v.debtPage = 0;
        v.creditFilter ??= { ...DEFAULT_CREDIT_FILTER };
        v.creditSort ??= { field: 'date', dir: 'desc' };
        if (typeof v.creditPage !== 'number') v.creditPage = 0;
        v.depositFilter ??= { ...DEFAULT_DEPOSIT_FILTER };
        v.depositSort ??= { field: 'date', dir: 'desc' };
        if (typeof v.depositPage !== 'number') v.depositPage = 0;
        if (v.filter.showInternal === undefined || typeof v.filter.showInternal === 'boolean') {
          v.filter.showInternal = v.filter.showInternal === true ? 'only' : 'all';
        }
        return v;
      }
    } catch { /* ignore */ }
    return {
      sort: { ...DEFAULT_SORT },
      filter: { ...DEFAULT_FILTER },
      debtSort: { field: 'date', dir: 'desc' },
      debtFilter: { ...DEFAULT_DEBT_FILTER },
      creditSort: { field: 'date', dir: 'desc' },
      creditFilter: { ...DEFAULT_CREDIT_FILTER },
      depositSort: { field: 'date', dir: 'desc' },
      depositFilter: { ...DEFAULT_DEPOSIT_FILTER },
      page: 0,
      debtPage: 0,
      creditPage: 0,
      depositPage: 0,
      pageSize,
    };
  }

  fmt(n: number): string {
    return fmt(n, this.currency);
  }

  fmtDate(d: string, t?: string): string {
    return fmtDate(d, t);
  }

  renderRecordsStats(container: HTMLElement): void {
    if (!this._data) return;
    const recs = this._data.records;
    const inc = recs.filter(r => r.type === 'income' && !r.isInternal).reduce((s, r) => s + r.amount, 0);
    const exp = recs.filter(r => r.type === 'expense' && !r.isInternal).reduce((s, r) => s + r.amount, 0);
    const totalInc = recs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const totalExp = recs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const bal = totalInc - totalExp;

    const el = container.createDiv('finance-stats-container');
    const items = [
      { label: this.tr.incomeStat, value: this.fmt(inc), mod: 'income', icon: '↑' },
      { label: this.tr.expenseStat, value: this.fmt(exp), mod: 'expense', icon: '↓' },
      {
        label: this.tr.balance, value: (bal >= 0 ? '+' : '') + this.fmt(bal),
        mod: bal >= 0 ? 'positive' : 'negative', icon: '＝',
      },
    ];
    items.forEach(item => {
      const card = el.createDiv(`finance-stat-card finance-stat-${item.mod}`);
      card.createEl('div', { text: item.icon, cls: 'finance-stat-icon' });
      const info = card.createDiv('finance-stat-info');
      info.createEl('div', { text: item.label, cls: 'finance-stat-label' });
      info.createEl('div', { text: item.value, cls: 'finance-stat-value' });
    });
  }
}
