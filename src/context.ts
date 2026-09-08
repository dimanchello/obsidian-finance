import { App, Platform } from 'obsidian';
import { FinanceStorage } from './storage';
import { AccountData, PluginSettings, ViewState, MOBILE_BREAKPOINT } from './types';
import { fmt } from './utils';
import { defaultViewState, parseViewState } from './domain/viewState';
import { getLocaleFromApp, t, type Translations, type Locale } from './i18n';
import { RecordType } from './constants';
import { renderStatCard, type StatCardItem } from './ui/statCards';

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
    this.isMobile = Platform.isMobile || window.innerWidth <= MOBILE_BREAKPOINT;
    this._state = defaultViewState(this.settings.defaultPageSize);
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

  /** state.json is the single source of truth: it survives reinstalls and travels with the account. */
  saveState(): void {
    this.storage.saveViewState(this.accountId, { ...this._state, page: 0 }).catch((e: unknown) => {
      console.error('[finance] saveState failed:', e);
    });
  }

  async loadStateFromFile(): Promise<void> {
    try {
      const raw = await this.storage.loadViewState(this.accountId);
      this._state = parseViewState(raw, this.settings.defaultPageSize);
    } catch { /* keep defaults */ }
  }

  fmt(n: number): string {
    return fmt(n, this.currency);
  }


  renderRecordsStats(container: HTMLElement): void {
    if (!this._data) return;
    const recs = this._data.records;
    const inc = recs.filter(r => r.type === RecordType.INCOME && !r.isInternal).reduce((s, r) => s + r.amount, 0);
    const exp = recs.filter(r => r.type === RecordType.EXPENSE && !r.isInternal).reduce((s, r) => s + r.amount, 0);
    const totalInc = recs.filter(r => r.type === RecordType.INCOME).reduce((s, r) => s + r.amount, 0);
    const totalExp = recs.filter(r => r.type === RecordType.EXPENSE).reduce((s, r) => s + r.amount, 0);
    const bal = totalInc - totalExp;

    const el = container.createDiv('finance-stats-container');
    const items: StatCardItem[] = [
      { label: this.tr.incomeStat, value: this.fmt(inc), mod: 'income', icon: '↑' },
      { label: this.tr.expenseStat, value: this.fmt(exp), mod: 'expense', icon: '↓' },
      {
        label: this.tr.balance, value: (bal >= 0 ? '+' : '') + this.fmt(bal),
        mod: bal >= 0 ? 'positive' : 'negative', icon: '＝',
      },
    ];
    items.forEach(item => renderStatCard(el, item));
  }
}
