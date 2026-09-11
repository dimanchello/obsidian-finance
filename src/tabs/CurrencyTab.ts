import { fmtDate } from "../utils";
import { Notice } from 'obsidian';
import { ViewContext } from '../context';
import {
  CurrencyExchange, CurrencyOperationType, RecordType,
  CurrencySortField, DEFAULT_CURRENCY_FILTER, SortDir,
} from '../types';
import { CurrencyExchangeModal } from '../modals/CurrencyExchangeModal';
import { ConfirmModal } from '../ConfirmModal';
import { getCurrencyBalances } from '../domain/currencyBalance';
import { DataTable, FilterControl } from '../ui/DataTable';
import { fmt } from '../utils';
import { AccountCommands } from '../domain/AccountCommands';
import { renderSummaryCard } from '../ui/statCards';

export class CurrencyTab {
  private ctx: ViewContext;
  private el: HTMLElement;
  private table: DataTable<CurrencyExchange>;
  private commands: AccountCommands;
  private openPanel: 'analytics' | 'filters' | null = null;
  onUpdate: (() => void) | null = null;

  private get tr() { return this.ctx.tr; }

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;
    this.commands = new AccountCommands(ctx.storage, ctx.accountId);
    
    this.table = new DataTable<CurrencyExchange>({
      ctx,
      items: () => this.getFilteredExchanges(),
      itemId: e => e.id,
      hasAnyItems: () => (this.ctx.data?.exchanges.length ?? 0) > 0,
      columns: [
        { key: 'date', label: this.tr.date, cell: e => ({ text: fmtDate(e.date, e.time) }) },
        { key: 'type', label: this.tr.type, cell: e => ({ text: this.typeLabel(e.type), cls: this.typeCls(e.type) }) },
        { key: 'currency', label: this.tr.currency, cell: e => ({ text: e.targetCurrency }) },
        { key: 'amount', label: `${this.tr.sum} (${this.ctx.data?.currency ?? ''})`, cell: e => ({ text: e.type === CurrencyOperationType.ADD ? '—' : this.ctx.fmt(e.amountInAccountCurrency), cls: 'finance-amount-cell' }) },
        { key: 'targetAmount', label: this.tr.targetAmount, cell: e => {
          const isIncome = e.type === CurrencyOperationType.BUY || e.type === CurrencyOperationType.ADD;
          const sign = isIncome ? '+' : '−';
          return { text: `${sign}${fmt(e.targetAmount, e.targetCurrency)}`, cls: isIncome ? 'finance-amount-income' : 'finance-amount-expense' };
        }},
        { key: 'rate', label: this.tr.rate, cell: e => ({ text: e.type === CurrencyOperationType.ADD ? '—' : String(e.exchangeRate) }) },
        { key: 'provider', label: this.tr.provider, cell: e => ({ text: e.provider ?? '—' }) },
        { key: 'category', label: this.tr.category, cell: e => ({ text: e.category ?? '—' }) },
      ],
      rowCls: e => [(e.type === CurrencyOperationType.BUY || e.type === CurrencyOperationType.ADD) ? 'finance-row-income' : 'finance-row-expense'],
      rowActions: e => [
        { icon: '✏️', title: this.tr.edit, onClick: () => this.openModal(e.type, e) },
        { icon: '🗑️', title: this.tr.delete, onClick: () => this.confirmDeleteExchange(e), cls: 'finance-delete-btn' },
      ],
      actionsPosition: 'inline',
      renderCard: (block, e) => this.renderCard(block, e),
      filterControls: () => this.filterControls(),
      sortFields: [
        { field: 'date', label: this.tr.date },
        { field: 'amount', label: this.tr.sum },
        { field: 'targetCurrency', label: this.tr.currency },
        { field: 'provider', label: this.tr.provider },
      ],
      state: {
        getPage: () => this.ctx.state.currencyPage ?? 0,
        setPage: p => { this.ctx.state.currencyPage = p; },
        getSort: () => this.ctx.state.currencySort ?? { field: 'date', dir: 'desc' },
        setSort: s => { this.ctx.state.currencySort = s as { field: CurrencySortField; dir: SortDir }; },
        resetFilter: () => { this.ctx.state.currencyFilter = { ...DEFAULT_CURRENCY_FILTER }; },
        getColumns: () => (this.ctx.state.currencyColumns ??= {}),
        setColumns: c => { this.ctx.state.currencyColumns = c; },
      },
      renderStats: host => this.ctx.renderRecordsStats(host),
      renderPanels: host => {
        if (this.openPanel === 'analytics') {
          const panel = host.createDiv('finance-analytics-panel');
          this.renderCurrencyCards(panel);
        }
      },
      ownToolbar: (toolbar, api) => {
        toolbar.removeClass('finance-debt-toolbar');
        toolbar.addClass('finance-currency-toolbar-container');

        const row2 = toolbar.createDiv('finance-debt-toolbar');
        const openAnalytics = this.openPanel === 'analytics';
        const toggleBtn = row2.createEl('button', {
          cls: `finance-analytics-toggle-btn${openAnalytics ? ' active' : ''}`,
          text: `📈 ${this.tr.analytics} ${openAnalytics ? '▲' : '▼'}`,
        });
        toggleBtn.addEventListener('click', () => {
          if (this.openPanel === 'analytics') {
            this.openPanel = null;
          } else {
            this.openPanel = 'analytics';
            if (api.filtersOpen) api.toggleFilters();
          }
          this.render();
        });

        const filtBtn = row2.createEl('button', {
          cls: `finance-analytics-toggle-btn${api.filtersOpen ? ' active' : ''}`,
          text: `🔍 ${this.tr.filters} ${api.filtersOpen ? '▲' : '▼'}`,
        });
        filtBtn.addEventListener('click', () => {
          if (!api.filtersOpen && this.openPanel === 'analytics') {
            this.openPanel = null;
          }
          api.toggleFilters();
        });

        if (this.ctx.isMobile) {
          const bulkToggleBtn = row2.createEl('button', {
            cls: `finance-analytics-toggle-btn${api.bulkMode ? ' active' : ''}`,
            text: `☑️ ${this.tr.bulkSelect}`,
          });
          bulkToggleBtn.addEventListener('click', () => api.toggleBulkMode());
        }
      },
      infoBarSums: (host, filtered) => {
        const selCur = this.ctx.state.currencyFilter?.targetCurrency;
        const fiAcc = filtered.filter(r => r.type === CurrencyOperationType.BUY || r.type === CurrencyOperationType.ADD).reduce((s, r) => s + r.amountInAccountCurrency, 0);
        const feAcc = filtered.filter(r => r.type === CurrencyOperationType.SELL || r.type === CurrencyOperationType.SPEND).reduce((s, r) => s + r.amountInAccountCurrency, 0);
        
        let fiText = `↑\u00A0${this.ctx.fmt(fiAcc)}`;
        let feText = `↓\u00A0${this.ctx.fmt(feAcc)}`;
        
        if (selCur) {
          const fiCur = filtered.filter(r => r.type === CurrencyOperationType.BUY || r.type === CurrencyOperationType.ADD).reduce((s, r) => s + r.targetAmount, 0);
          const feCur = filtered.filter(r => r.type === CurrencyOperationType.SELL || r.type === CurrencyOperationType.SPEND).reduce((s, r) => s + r.targetAmount, 0);
          fiText = `↑\u00A0${fmt(fiCur, selCur)} (${this.ctx.fmt(fiAcc)})`;
          feText = `↓\u00A0${fmt(feCur, selCur)} (${this.ctx.fmt(feAcc)})`;
        }

        const sums = host.createDiv('finance-table-sums');
        sums.createEl('span', { text: fiText, cls: 'finance-sum-income' });
        sums.createEl('span', { text: '·', cls: 'finance-sum-sep' });
        sums.createEl('span', { text: feText, cls: 'finance-sum-expense' });
      },
      emptyState: { icon: '💱', title: this.tr.noRecords, subtitle: this.tr.newCurrencyExchange },
      emptyFiltered: { icon: '🔍', title: this.tr.noRecordsFilter, subtitle: this.tr.tryChangeFilters },
      onBulkDelete: async ids => {
        await this.commands.deleteExchanges(ids);
        await this.reload(this.tr.deleted);
      },
      confirmBulkDeleteText: count => this.tr.confirmDeleteSelectedExchanges?.replace('{count}', String(count)) ?? this.tr.confirmDeleteSelectedRecords?.replace('{count}', String(count)),
      onFilterChange: () => {},
      onFiltersToggle: () => {
        if (this.openPanel === 'analytics') {
          this.openPanel = null;
        }
      },
      rerender: () => this.render(),
    });
  }

  public renderHeaderActions(container: HTMLElement): void {
    const createBtn = (label: string, icon: string, type: CurrencyOperationType, cls = '') => {
      const btn = container.createEl('button', { cls: `finance-add-btn finance-currency-btn ${cls}`.trim() });
      btn.createEl('span', { text: icon, cls: 'btn-icon' });
      btn.createEl('span', { text: label, cls: 'finance-currency-btn-text' });
      btn.addEventListener('click', () => this.openModal(type));
    };
    
    createBtn(this.tr.buyButton, '＋', CurrencyOperationType.BUY, 'finance-accent-btn');
    createBtn(this.tr.sellButton, '－', CurrencyOperationType.SELL);
    createBtn(this.tr.addButton, '💰', CurrencyOperationType.ADD);
    createBtn(this.tr.spendButton, '💸', CurrencyOperationType.SPEND);
  }

  render(): void {
    // Legacy migration: 'createdAt' was replaced with 'date'
    if (this.ctx.state.currencySort?.field === 'createdAt' as CurrencySortField) {
      this.ctx.state.currencySort = { field: 'date', dir: 'desc' };
      this.ctx.saveState();
    }
    this.ctx.state.currencyFilter ??= { ...DEFAULT_CURRENCY_FILTER };
    this.el.empty();

    if (this.ctx.data) {
      // Data is already loaded
    }

    this.table.render(this.el);
  }

  update(): void {
    this.render();
  }

  private async reload(notice?: string): Promise<void> {
    this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
    this.onUpdate?.();
    if (notice) new Notice(notice);
  }
  
  private typeLabel(type: CurrencyOperationType): string {
    switch (type) {
      case CurrencyOperationType.BUY: return this.tr.buy;
      case CurrencyOperationType.SELL: return this.tr.sell;
      case CurrencyOperationType.ADD: return this.tr.add;
      case CurrencyOperationType.SPEND: return this.tr.spend;
    }
  }
  
  private typeCls(type: CurrencyOperationType): string {
    switch (type) {
      case CurrencyOperationType.BUY: return 'finance-text-success';
      case CurrencyOperationType.SELL: return 'finance-text-error';
      case CurrencyOperationType.ADD: return 'finance-text-accent';
      case CurrencyOperationType.SPEND: return 'finance-text-warning';
    }
  }

  private renderCurrencyCards(host: HTMLElement): void {
    const balances = getCurrencyBalances(this.ctx.data?.exchanges ?? []);
    if (balances.size === 0) return;

    const summary = host.createDiv('finance-stats-container finance-stats-currency');

    balances.forEach((metrics, currency) => {
      if (metrics.balance === 0) return;

      let subText = `${this.tr.averageRate}: ${metrics.averageBuyRate.toFixed(2)}`;
      if (metrics.averageBuyRate > 0 && this.ctx.data) {
        subText += ` · ~ ${this.ctx.fmt(metrics.balance * metrics.averageBuyRate)}`;
      }

      renderSummaryCard(summary, {
        icon: '💱',
        title: currency,
        main: fmt(metrics.balance, currency),
        sub: subText,
        mod: 'finance-stat-deposit-active',
      });
    });
  }

  private filterControls(): FilterControl[] {
    const f = this.ctx.state.currencyFilter ?? (this.ctx.state.currencyFilter = { ...DEFAULT_CURRENCY_FILTER });
    const exchanges = this.ctx.data?.exchanges ?? [];
    
    return [
      {
        kind: 'search', label: this.tr.search, placeholder: this.tr.searchAllFields,
        get: () => f.search, set: v => { f.search = v; },
      },
      {
        kind: 'select', label: this.tr.type,
        options: [
          { value: 'all', label: this.tr.allOperationTypes },
          { value: CurrencyOperationType.BUY, label: this.tr.buy },
          { value: CurrencyOperationType.SELL, label: this.tr.sell },
          { value: CurrencyOperationType.ADD, label: this.tr.add },
          { value: CurrencyOperationType.SPEND, label: this.tr.spend },
        ],
        get: () => f.type, set: v => { f.type = v as typeof f.type; },
      },
      {
        kind: 'searchSelect', label: this.tr.currency,
        options: () => [
          { value: '', label: this.tr.all },
          ...[...new Set(exchanges.map(e => e.targetCurrency))].map(c => ({ value: c, label: c })),
        ],
        get: () => f.targetCurrency, set: v => { f.targetCurrency = v; },
      },
      { kind: 'date', label: this.tr.from, get: () => f.dateFrom, set: v => { f.dateFrom = v; } },
      { kind: 'date', label: this.tr.to, get: () => f.dateTo, set: v => { f.dateTo = v; } },
      {
        kind: 'searchSelect', label: this.tr.provider,
        options: () => [
          { value: '', label: this.tr.all },
          ...[...new Set(exchanges.map(e => e.provider).filter(Boolean))].map(p => ({ value: p, label: p })),
        ],
        get: () => f.provider, set: v => { f.provider = v; },
      },
    ];
  }

  private getFilteredExchanges(): CurrencyExchange[] {
    if (!this.ctx.data) return [];
    const f = this.ctx.state.currencyFilter ?? DEFAULT_CURRENCY_FILTER;
    const s = this.ctx.state.currencySort ?? { field: 'date', dir: 'desc' };
    
    let result = [...this.ctx.data.exchanges];
    
    if (f.search) {
      const q = f.search.toLowerCase();
      result = result.filter(e => 
        e.provider.toLowerCase().includes(q) || 
        (e.category?.toLowerCase().includes(q) ?? false) ||
        (e.note?.toLowerCase().includes(q) ?? false)
      );
    }
    if (f.type !== 'all') result = result.filter(e => e.type === f.type);
    if (f.targetCurrency) result = result.filter(e => e.targetCurrency === f.targetCurrency);
    if (f.provider) result = result.filter(e => e.provider === f.provider);
    if (f.category) result = result.filter(e => e.category === f.category);
    if (f.dateFrom) result = result.filter(e => e.date >= f.dateFrom);
    if (f.dateTo) result = result.filter(e => e.date <= f.dateTo);
    
    result.sort((a, b) => {
      let cmp = 0;
      if (s.field === 'amount') cmp = a.amountInAccountCurrency - b.amountInAccountCurrency;
      else if (s.field === 'targetCurrency') cmp = a.targetCurrency.localeCompare(b.targetCurrency);
      else if (s.field === 'provider') cmp = a.provider.localeCompare(b.provider);
      else {
        cmp = a.date.localeCompare(b.date);
        if (cmp === 0) cmp = a.createdAt - b.createdAt;
      }
      return s.dir === 'asc' ? cmp : -cmp;
    });
    
    return result;
  }

  private renderCard(block: HTMLElement, e: CurrencyExchange): void {
    const isIncome = e.type === CurrencyOperationType.BUY || e.type === CurrencyOperationType.ADD;
    block.addClass(isIncome ? 'finance-row-income' : 'finance-row-expense');
    
    const header = block.createDiv('finance-record-header');
    const sign = isIncome ? '+' : '−';
    header.createEl('span', {
      text: `${sign}${this.ctx.fmt(e.targetAmount)} ${e.targetCurrency}`,
      cls: `finance-record-amount ${isIncome ? 'finance-amount-income' : 'finance-amount-expense'}`,
    });
    header.createEl('span', { text: fmtDate(e.date, e.time), cls: 'finance-record-date' });
    
    const details = block.createDiv('finance-record-details');
    details.createEl('span', { text: this.typeLabel(e.type), cls: 'finance-record-detail' });
    if (e.type !== CurrencyOperationType.ADD) {
      details.createEl('span', { text: `${this.tr.sum}: ${this.ctx.fmt(e.amountInAccountCurrency)} ${this.ctx.data?.currency ?? ''}`, cls: 'finance-record-detail' });
      details.createEl('span', { text: `${this.tr.rate}: ${e.exchangeRate}`, cls: 'finance-record-detail' });
    }
    if (e.provider) details.createEl('span', { text: e.provider, cls: 'finance-record-detail' });
  }

  private openModal(type: CurrencyOperationType, initial?: CurrencyExchange): void {
    new CurrencyExchangeModal(this.ctx.app, {
      initial: initial ? { ...initial, type } : { type },
      exchanges: this.ctx.data!.exchanges,
      providers: Array.from(new Set(this.ctx.data!.exchanges.map(e => e.provider))).filter((p): p is string => Boolean(p)),
      categories: this.ctx.data!.categories,
      currencies: this.ctx.settings.customCurrencies,
      accountCurrency: this.ctx.data!.currency,
      tr: this.ctx.tr,
      pluginId: this.ctx.pluginId,
      onSave: async (exchange) => {
        if (initial) {
          await this.ctx.storage.updateExchange(this.ctx.accountId, exchange);

          if (initial.type === exchange.type && exchange.type !== CurrencyOperationType.ADD) {
            // Same type: just update the existing linked record
            const linked = this.ctx.data!.records.find(r => r.linkedId === exchange.id);
            if (linked) {
              linked.type = exchange.type === CurrencyOperationType.SELL ? RecordType.INCOME : RecordType.EXPENSE;
              linked.amount = exchange.amountInAccountCurrency;
              linked.date = exchange.date;
              linked.time = exchange.time;
              linked.payer = exchange.provider;
              linked.exchangeRate = exchange.exchangeRate;
              linked.category = exchange.category ?? linked.category;
              linked.note = this.generateExchangeNote(exchange);
              await this.ctx.storage.updateRecord(this.ctx.accountId, linked);
            }
          } else {
            // Type changed: delete old record and create new one
            const linked = this.ctx.data!.records.find(r => r.linkedId === exchange.id);
            if (linked) {
              await this.ctx.storage.deleteRecord(this.ctx.accountId, linked.id);
            }
            if (exchange.type !== CurrencyOperationType.ADD) {
              await this.ctx.storage.addRecord(this.ctx.accountId, this.createFinanceRecordForExchange(exchange));
            }
          }
        } else {
          await this.ctx.storage.addExchange(this.ctx.accountId, exchange);
          if (exchange.type !== CurrencyOperationType.ADD) {
            await this.ctx.storage.addRecord(this.ctx.accountId, this.createFinanceRecordForExchange(exchange));
          }
        }
        await this.reload(initial ? this.tr.currencyExchangeUpdated : this.tr.currencyExchangeAdded);
      }
    }).open();
  }

  private generateExchangeNote(exchange: CurrencyExchange): string {
    const { tr } = this.ctx;
    let noteStr = '';
    if (exchange.type === CurrencyOperationType.BUY) noteStr = `${tr.currencyPurchase} ${exchange.targetAmount.toFixed(2)} ${exchange.targetCurrency} @ ${exchange.exchangeRate.toFixed(2)}`;
    if (exchange.type === CurrencyOperationType.SELL) noteStr = `${tr.currencySale} ${exchange.targetAmount.toFixed(2)} ${exchange.targetCurrency} @ ${exchange.exchangeRate.toFixed(2)}`;
    if (exchange.type === CurrencyOperationType.SPEND) noteStr = `${tr.currencySpend} ${exchange.targetAmount.toFixed(2)} ${exchange.targetCurrency} @ ${exchange.exchangeRate.toFixed(2)}`;

    if (exchange.fee && exchange.type !== CurrencyOperationType.SPEND) {
      noteStr += ` (${tr.feeLabel} ${exchange.fee.toFixed(2)})`;
    }
    return noteStr;
  }

  private createFinanceRecordForExchange(exchange: CurrencyExchange) {
    const isExpense = exchange.type === CurrencyOperationType.BUY || exchange.type === CurrencyOperationType.SPEND;
    const { tr } = this.ctx;

    const noteStr = this.generateExchangeNote(exchange);

    let catStr = '';
    if (exchange.type === CurrencyOperationType.BUY) catStr = tr.currencyExchangeCat;
    if (exchange.type === CurrencyOperationType.SELL) catStr = tr.currencySaleCat;
    if (exchange.type === CurrencyOperationType.SPEND) catStr = exchange.category ?? tr.currencySpendCat;

    return {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      date: exchange.date,
      time: exchange.time,
      type: isExpense ? RecordType.EXPENSE : RecordType.INCOME,
      amount: exchange.amountInAccountCurrency,
      category: catStr,
      tag: '',
      payer: exchange.provider,
      note: noteStr,
      attachmentPath: '',
      linkedId: exchange.id,
      exchangeRate: exchange.exchangeRate,
      isInternal: true,
    };
  }

  private confirmDeleteExchange(exchange: CurrencyExchange): void {
    new ConfirmModal(this.ctx.app, this.tr.confirmDeleteSelectedExchanges?.replace('{count}', '1') ?? this.tr.confirmDeleteSelectedRecords?.replace('{count}', '1'), async () => {
      await this.commands.deleteExchange(exchange.id);
      await this.reload(this.tr.deleted);
    }).open();
  }
}
