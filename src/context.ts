import { App } from 'obsidian';
import { FinanceStorage } from './storage';
import {
  AccountData, PluginSettings, ViewState,
  DEFAULT_FILTER, DEFAULT_SORT, DEFAULT_DEBT_FILTER, DEFAULT_CREDIT_FILTER, DEFAULT_DEPOSIT_FILTER,
} from './types';
import { fmt, fmtDate } from './utils';

const LS = (pid: string) => `ft-view:${pid}:`;

export class ViewContext {
  app: App;
  storage: FinanceStorage;
  notePath: string;
  pluginId: string;
  settings: PluginSettings;
  isMobile: boolean;
  container: HTMLElement;

  private _data: AccountData | null = null;
  private _state: ViewState;

  constructor(
    app: App,
    storage: FinanceStorage,
    notePath: string,
    pluginId: string,
    settings: PluginSettings,
    container: HTMLElement,
  ) {
    this.app = app;
    this.storage = storage;
    this.notePath = notePath;
    this.pluginId = pluginId;
    this.settings = settings;
    this.container = container;
    this.isMobile = (app as any).isMobile ?? window.innerWidth <= 480;
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
      localStorage.setItem(LS(this.pluginId) + this.notePath, JSON.stringify({ ...this._state, page: 0 }));
    } catch { /* ignore */ }
  }

  loadState(pageSize: number): ViewState {
    try {
      const raw = localStorage.getItem(LS(this.pluginId) + this.notePath);
      if (raw) {
        const v = JSON.parse(raw) as ViewState;
        v.page = 0;
        v.debtFilter ??= { ...DEFAULT_DEBT_FILTER };
        v.debtSort ??= { field: 'createdAt', dir: 'desc' };
        if (typeof v.debtPage !== 'number') v.debtPage = 0;
        v.creditFilter ??= { ...DEFAULT_CREDIT_FILTER };
        v.creditSort ??= { field: 'createdAt', dir: 'desc' };
        if (typeof v.creditPage !== 'number') v.creditPage = 0;
        v.depositFilter ??= { ...DEFAULT_DEPOSIT_FILTER };
        v.depositSort ??= { field: 'createdAt', dir: 'desc' };
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
      debtSort: { field: 'createdAt', dir: 'desc' },
      debtFilter: { ...DEFAULT_DEBT_FILTER },
      creditSort: { field: 'createdAt', dir: 'desc' },
      creditFilter: { ...DEFAULT_CREDIT_FILTER },
      depositSort: { field: 'createdAt', dir: 'desc' },
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
    const lent = this._data.debts.filter(d => d.direction === 'lent').reduce((s, d) => s + d.amount, 0);
    const borrowed = this._data.debts.filter(d => d.direction === 'borrowed').reduce((s, d) => s + d.amount, 0);
    const bal = inc - exp - lent + borrowed;

    const el = container.createDiv('finance-stats-container');
    const items = [
      { label: 'Доходы', value: this.fmt(inc), mod: 'income', icon: '↑' },
      { label: 'Расходы', value: this.fmt(exp), mod: 'expense', icon: '↓' },
      {
        label: 'Баланс', value: (bal >= 0 ? '+' : '') + this.fmt(bal),
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
