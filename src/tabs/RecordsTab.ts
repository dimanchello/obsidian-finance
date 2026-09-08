import { fmtDate } from "../utils";
import { Notice } from 'obsidian';
import { ViewContext } from '../context';
import {
  FinanceRecord,
  DEFAULT_FILTER,
  SortField,
  PAGE_SIZE_OPTIONS,
  DEFAULT_ACCENT_COLOR,
} from '../types';
import { RecordModal } from '../RecordModal';
import { ConfirmModal } from '../ConfirmModal';
import { ImportExportModal } from '../ImportExportModal';
import { AnalyticsView, type BarClickAction } from '../AnalyticsView';
import { noteFilename } from '../utils';
import { isoWeekRange, daysInMonth } from '../domain/dateMath';
import { DataTable, DataTableApi, FilterControl } from '../ui/DataTable';
import { renderMobileCard, dateRangeControls, compareValues } from '../ui/tabHelpers';
import { renderStatCard } from '../ui/statCards';
import { RecordType } from '../constants';

type Panel = 'analytics' | 'filters' | 'settings';

export class RecordsTab {
  private ctx: ViewContext;
  private el: HTMLElement;
  private table: DataTable<FinanceRecord>;

  private openPanel: Panel | null = null;
  private analyticsView: AnalyticsView | null = null;

  private get tr() { return this.ctx.tr; }

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;

    this.table = new DataTable<FinanceRecord>({
      ctx,
      items: () => this.getFiltered(),
      itemId: r => r.id,
      hasAnyItems: () => (this.ctx.data?.records.length ?? 0) > 0,
      columns: [
        {
          key: 'date', label: `${this.tr.date} / ${this.tr.time}`,
          cell: r => ({ text: fmtDate(r.date, r.time), cls: 'finance-td-date' }),
        },
        {
          key: 'type', label: this.tr.type,
          cell: r => ({
            text: r.type === RecordType.INCOME ? this.tr.typeIncome : this.tr.typeExpense,
            cls: r.type === RecordType.INCOME ? 'finance-type-income' : 'finance-type-expense',
          }),
        },
        {
          key: 'amount', label: this.tr.sum,
          cell: r => ({
            text: (r.type === RecordType.INCOME ? '+' : '−') + this.ctx.fmt(r.amount)
              + (r.exchangeRate ? ` @ ${r.exchangeRate}` : ''),
            cls: 'finance-amount-cell ' + (r.type === RecordType.INCOME ? 'finance-amount-income' : 'finance-amount-expense'),
          }),
        },
        { key: 'category', label: this.tr.category, cell: r => ({ text: r.category || '—' }) },
        { key: 'tag', label: this.tr.tag, cell: r => ({ text: r.tag || '—', cls: 'finance-td-muted' }) },
        { key: 'payer', label: this.tr.payer, cell: r => ({ text: r.payer || '—' }) },
        { key: 'note', label: this.tr.note, cell: r => ({ text: r.note || '—', cls: 'finance-note-cell' }) },
      ],
      rowCls: r => {
        const cls = [r.type === RecordType.INCOME ? 'finance-row-income' : 'finance-row-expense'];
        if (r.isInternal) cls.push('finance-tr-internal');
        return cls;
      },
      rowActions: r => [
        { icon: '✏️', title: this.tr.edit, onClick: () => this.openEditModal(r) },
        { icon: '🗑️', title: this.tr.delete, onClick: () => this.confirmDelete(r), cls: 'finance-delete-btn' },
      ],
      renderCard: (block, r) => this.renderCard(block, r),
      filterControls: () => this.filterControls(),
      sortFields: [
        { field: 'date', label: this.tr.sortDate },
        { field: 'amount', label: this.tr.sum },
        { field: 'category', label: this.tr.category },
        { field: 'type', label: this.tr.type },
        { field: 'payer', label: this.tr.payer },
      ],
      state: {
        getPage: () => this.ctx.state.page,
        setPage: p => { this.ctx.state.page = p; },
        getSort: () => this.ctx.state.sort,
        setSort: s => { this.ctx.state.sort = s as { field: SortField; dir: 'asc' | 'desc' }; },
        resetFilter: () => { this.ctx.state.filter = { ...DEFAULT_FILTER }; },
        getColumns: () => (this.ctx.state.recordsColumns ??= {}),
        setColumns: c => { this.ctx.state.recordsColumns = c; },
      },
      renderStats: host => this.renderStats(host),
      ownToolbar: (toolbar, api) => this.renderToolbar(toolbar, api),
      renderPanels: host => this.renderPanels(host),
      infoBarSums: (host, filtered) => {
        const fi = filtered.filter(r => r.type === RecordType.INCOME && !r.isInternal).reduce((s, r) => s + r.amount, 0);
        const fe = filtered.filter(r => r.type === RecordType.EXPENSE && !r.isInternal).reduce((s, r) => s + r.amount, 0);
        const sums = host.createDiv('finance-table-sums');
        sums.createEl('span', { text: `↑ ${this.ctx.fmt(fi)}`, cls: 'finance-sum-income' });
        sums.createEl('span', { text: '·', cls: 'finance-sum-sep' });
        sums.createEl('span', { text: `↓ ${this.ctx.fmt(fe)}`, cls: 'finance-sum-expense' });
      },
      emptyState: { icon: '📊', title: this.tr.noRecords, subtitle: this.tr.noRecordsFilter },
      emptyFiltered: { icon: '📊', title: this.tr.noRecords, subtitle: this.tr.tryChangeFilters },
      onBulkDelete: async ids => {
        await this.ctx.storage.deleteRecordsBatch(this.ctx.accountId, ids);
        await this.reload();
        new Notice(this.tr.deleted);
      },
      confirmBulkDeleteText: count => this.tr.confirmDeleteSelectedRecords.replace('{count}', String(count)),
      onFilterChange: () => { this.analyticsView?.update(this.ctx.data?.records ?? [], this.ctx.currency); },
      rerender: () => this.render(),
    });
  }

  render(): void {
    if (this.ctx.state.sort.field === 'createdAt' as SortField) {
      this.ctx.state.sort = { field: 'date', dir: 'desc' };
      this.ctx.saveState();
    }
    this.el.empty();
    this.table.render(this.el);
  }

  update(): void {
    this.render();
  }

  private async reload(): Promise<void> {
    this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
    this.render();
  }

  // ── Toolbar with three exclusive panels ─────────────────────────────────

  private renderToolbar(toolbar: HTMLElement, api: DataTableApi): void {
    const mkToggle = (label: string, panel: Panel, onClick: () => void) => {
      const open = panel === 'filters' ? api.filtersOpen : this.openPanel === panel;
      const btn = toolbar.createEl('button', {
        cls: `finance-analytics-toggle-btn${open ? ' active' : ''}`,
        text: `${label} ${open ? '▲' : '▼'}`,
      });
      btn.addEventListener('click', onClick);
    };

    mkToggle(`📈 ${this.tr.analytics}`, 'analytics', () => this.switchPanel('analytics', api));
    mkToggle(`🔍 ${this.tr.filters}`, 'filters', () => this.switchPanel('filters', api));
    mkToggle(this.tr.settings, 'settings', () => this.switchPanel('settings', api));

    if (this.ctx.isMobile) {
      const bulkBtn = toolbar.createEl('button', {
        cls: `finance-analytics-toggle-btn${api.bulkMode ? ' active' : ''}`,
        text: `☑️ ${this.tr.bulkSelect}`,
      });
      bulkBtn.addEventListener('click', () => api.toggleBulkMode());
    }
  }

  private switchPanel(panel: Panel, api: DataTableApi): void {
    if (panel === 'filters') {
      if (this.openPanel !== null) this.openPanel = null;
      api.toggleFilters();
      return;
    }
    const opening = this.openPanel !== panel;
    this.openPanel = opening ? panel : null;
    if (opening && api.filtersOpen) { api.toggleFilters(); return; }
    this.render();
  }

  private renderPanels(host: HTMLElement): void {
    if (this.openPanel === 'analytics') {
      const panel = host.createDiv('finance-analytics-panel');
      this.analyticsView = new AnalyticsView(
        panel, this.ctx.data?.records ?? [], this.ctx.currency, this.tr,
        a => this.onAnalyticsBarClick(a),
      );
      this.analyticsView.render();
    } else {
      this.analyticsView = null;
    }
    if (this.openPanel === 'settings') {
      this.renderSettings(host.createDiv('finance-settings-panel'));
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  private renderStats(host: HTMLElement): void {
    if (!this.ctx.data) return;
    const statsEl = host.createDiv('finance-stats-container');
    const recs = this.ctx.data.records;
    const inc = recs.filter(r => r.type === RecordType.INCOME && !r.isInternal).reduce((s, r) => s + r.amount, 0);
    const exp = recs.filter(r => r.type === RecordType.EXPENSE && !r.isInternal).reduce((s, r) => s + r.amount, 0);
    const totalInc = recs.filter(r => r.type === RecordType.INCOME).reduce((s, r) => s + r.amount, 0);
    const totalExp = recs.filter(r => r.type === RecordType.EXPENSE).reduce((s, r) => s + r.amount, 0);
    const bal = totalInc - totalExp;

    const cards = [
      { label: this.tr.incomeStat, value: this.ctx.fmt(inc), mod: 'income', icon: '↑' },
      { label: this.tr.expenseStat, value: this.ctx.fmt(exp), mod: 'expense', icon: '↓' },
      {
        label: this.tr.balance, value: (bal >= 0 ? '+' : '') + this.ctx.fmt(bal),
        mod: bal >= 0 ? 'positive' : 'negative', icon: '＝',
      },
    ];

    cards.forEach(item => renderStatCard(statsEl, item));
  }

  // ── Filters ──────────────────────────────────────────────────────────────

  private filterControls(): FilterControl[] {
    const f = this.ctx.state.filter;
    const data = this.ctx.data;
    return [
      {
        kind: 'search', label: this.tr.search, placeholder: this.tr.searchAllFields,
        get: () => f.search, set: v => { f.search = v; },
      },
      {
        kind: 'select', label: this.tr.type,
        options: [
          { value: 'all', label: this.tr.allTypes },
          { value: RecordType.INCOME, label: '↑ ' + this.tr.incomeStat },
          { value: RecordType.EXPENSE, label: '↓ ' + this.tr.expenseStat },
        ],
        get: () => f.type, set: v => { f.type = v as typeof f.type; },
      },
      {
        kind: 'searchSelect', label: this.tr.category,
        options: () => [{ value: '', label: this.tr.all }, ...(data?.categories ?? []).map(c => ({ value: c, label: c }))],
        get: () => f.category, set: v => { f.category = v; },
      },
      ...dateRangeControls(f, this.tr),
      {
        kind: 'searchSelect', label: this.tr.payer,
        options: () => [{ value: '', label: this.tr.all }, ...(data?.payers ?? []).map(p => ({ value: p, label: p }))],
        get: () => f.payer, set: v => { f.payer = v; },
      },
      {
        kind: 'searchSelect', label: this.tr.tag,
        options: () => [{ value: '', label: this.tr.all }, ...(data?.tags ?? []).map(t => ({ value: t, label: t }))],
        get: () => f.tag, set: v => { f.tag = v; },
      },
      {
        kind: 'custom',
        render: (row, onChange) => {
          const g = row.createDiv('finance-filter-group finance-filter-internal');
          const label = g.createEl('label', { cls: 'finance-filter-label' });
          const btn = g.createEl('button', {
            type: 'button', cls: 'finance-internal-btn', text: '🔄',
            attr: { title: this.tr.internalOnly },
          });
          const applyLabel = () => {
            const only = f.showInternal === 'only';
            label.textContent = only ? this.tr.showInternal : this.tr.internal;
            btn.classList.toggle('is-dimmed', !only);
          };
          applyLabel();
          btn.addEventListener('click', () => {
            f.showInternal = f.showInternal === 'only' ? 'all' : 'only';
            applyLabel();
            onChange();
          });
        },
      },
    ];
  }

  private getFiltered(): FinanceRecord[] {
    if (!this.ctx.data) return [];
    const { filter, sort } = this.ctx.state;
    const q = filter.search.toLowerCase();

    const rows = this.ctx.data.records.filter(r => {
      if (filter.showInternal === 'only' && !r.isInternal) return false;
      if (filter.type !== 'all' && r.type !== filter.type) return false;
      if (filter.category && r.category !== filter.category) return false;
      if (filter.tag && r.tag !== filter.tag) return false;
      if (filter.payer && r.payer !== filter.payer) return false;
      if (filter.dateFrom && r.date < filter.dateFrom) return false;
      if (filter.dateTo && r.date > filter.dateTo) return false;
      if (q) {
        const hay = [r.category, r.tag, r.payer, r.note, String(r.amount), r.exchangeRate ? String(r.exchangeRate) : ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return rows.sort((a, b) => {
      const av = a[sort.field as keyof FinanceRecord] ?? '';
      const bv = b[sort.field as keyof FinanceRecord] ?? '';
      const cmp = compareValues(av, bv, sort.dir);
      if (cmp !== 0) return cmp;
      // При одинаковых датах — дополнительная сортировка по времени
      if (sort.field === 'date') {
        const timeCmp = (a.time ?? '').localeCompare(b.time ?? '');
        return sort.dir === 'asc' ? timeCmp : -timeCmp;
      }
      return 0;
    });
  }

  // ── Mobile card ──────────────────────────────────────────────────────────

  private renderCard(block: HTMLElement, rec: FinanceRecord): void {
    const details = [];
    if (rec.category) details.push({ label: '', value: rec.category });
    if (rec.tag) details.push({ label: '🏷️', value: rec.tag });
    if (rec.payer) details.push({ label: '👤', value: rec.payer });
    if (rec.exchangeRate) details.push({ label: '💱 @', value: String(rec.exchangeRate) });

    renderMobileCard(block, {
      amountText: (rec.type === RecordType.INCOME ? '+' : '−') + this.ctx.fmt(rec.amount),
      amountCls: rec.type === RecordType.INCOME ? 'finance-amount-income' : 'finance-amount-expense',
      subtitle: fmtDate(rec.date, rec.time),
      details,
      note: rec.note,
    });
  }

  // ── Modals ──────────────────────────────────────────────────────────────

  private openEditModal(rec: FinanceRecord): void {
    if (!this.ctx.data) return;
    new RecordModal(this.ctx.app, {
      initial: { ...rec }, records: this.ctx.data.records.filter(r => r.id !== rec.id),
      categories: this.ctx.data.categories, tags: this.ctx.data.tags, payers: this.ctx.data.payers,
      currency: this.ctx.currency, settings: this.ctx.settings, pluginId: this.ctx.pluginId,
      onSave: async updated => {
        await this.ctx.storage.updateRecord(this.ctx.accountId, updated);
        await this.reload();
        new Notice(this.tr.recordUpdated);
      },
    }).open();
  }

  private confirmDelete(rec: FinanceRecord): void {
    const label = `${rec.type === RecordType.INCOME ? '+' : '−'}${this.ctx.fmt(rec.amount)}  ·  ${rec.category || '—'}  ·  ${fmtDate(rec.date, rec.time)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteRecord}\n${label}`, async () => {
      await this.ctx.storage.deleteRecord(this.ctx.accountId, rec.id);
      await this.reload();
      new Notice(this.tr.deleted);
    }).open();
  }

  private openIEModal(mode: 'export' | 'import'): void {
    if (!this.ctx.data) { new Notice(this.tr.loading); return; }
    new ImportExportModal(this.ctx.app, {
      noteName: this.ctx.data.name || noteFilename(this.ctx.accountId),
      currency: this.ctx.currency,
      records: this.ctx.data.records,
      onImport: async recs => {
        await this.ctx.storage.importRecords(this.ctx.accountId, recs);
        await this.reload();
      },
      mode,
    }).open();
  }

  // ── Analytics drill-down ─────────────────────────────────────────────────

  private onAnalyticsBarClick(action: BarClickAction): void {
    const f = this.ctx.state.filter;
    const { groupBy, rawKey } = action;

    if (groupBy === 'category') {
      f.category = rawKey === this.tr.uncategorized ? '' : rawKey;
      f.payer = ''; f.dateFrom = ''; f.dateTo = '';
    } else if (groupBy === 'payer') {
      f.payer = rawKey === this.tr.notSpecified ? '' : rawKey;
      f.category = ''; f.dateFrom = ''; f.dateTo = '';
    } else if (groupBy === 'year') {
      f.category = ''; f.payer = '';
      f.dateFrom = `${rawKey}-01-01`;
      f.dateTo = `${rawKey}-12-31`;
    } else if (groupBy === 'month') {
      const [y, m] = rawKey.split('-');
      const lastDay = daysInMonth(Number(y), Number(m));
      f.category = ''; f.payer = '';
      f.dateFrom = `${y}-${m}-01`;
      f.dateTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    } else if (groupBy === 'week') {
      const [yStr, wStr] = rawKey.split('-W');
      const { from, to } = isoWeekRange(Number(yStr), Number(wStr));
      f.category = ''; f.payer = '';
      f.dateFrom = from;
      f.dateTo = to;
    }

    f.search = '';
    this.ctx.state.page = 0;
    this.openPanel = null;
    this.ctx.saveState();
    this.render();
  }

  // ── Settings panel ───────────────────────────────────────────────────────

  private renderSettings(el: HTMLElement): void {
    if (!this.ctx.data) return;
    const row = (): HTMLDivElement => el.createDiv('finance-settings-row');

    const psRow = row();
    psRow.createEl('label', { text: this.tr.pageSizeLabel, cls: 'finance-filter-label' });
    const psSel = psRow.createEl('select', { cls: 'finance-filter-select' });
    PAGE_SIZE_OPTIONS.forEach(n => {
      const o = psSel.createEl('option', { text: String(n) });
      o.value = String(n);
      o.selected = n === this.ctx.state.pageSize;
    });
    psSel.addEventListener('change', () => {
      this.ctx.state.pageSize = parseInt(psSel.value);
      this.ctx.state.page = 0;
      this.ctx.saveState();
      this.render();
    });

    const acRow = row();
    acRow.createEl('label', { text: this.tr.accentColor, cls: 'finance-filter-label' });
    const acC = acRow.createDiv('finance-settings-controls');
    const acIn = acC.createEl('input', { type: 'color', cls: 'finance-settings-color-input' });
    acIn.value = this.ctx.data.accentColor ?? DEFAULT_ACCENT_COLOR;
    const hexLabel = acC.createEl('span', { text: acIn.value, cls: 'finance-settings-hex' });
    acIn.addEventListener('input', async () => {
      hexLabel.textContent = acIn.value;
      await this.ctx.storage.updateMeta(this.ctx.accountId, { accentColor: acIn.value });
      this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
      this.applyAccentColor(acIn.value);
    });
    const rstBtn = acC.createEl('button', { text: this.tr.resetColor, cls: 'finance-btn-cancel finance-btn-compact' });
    rstBtn.addEventListener('click', async () => {
      await this.ctx.storage.updateMeta(this.ctx.accountId, { accentColor: '' });
      this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
      this.applyAccentColor('');
      acIn.value = DEFAULT_ACCENT_COLOR;
      hexLabel.textContent = DEFAULT_ACCENT_COLOR;
    });

    const ieRow = row();
    ieRow.classList.add('finance-settings-sep');
    ieRow.createEl('label', { text: this.tr.importExport, cls: 'finance-filter-label' });
    const ieC = ieRow.createDiv('finance-settings-controls');
    ieC.createEl('button', { cls: 'finance-add-btn finance-ie-btn', text: this.tr.export })
      .addEventListener('click', () => this.openIEModal('export'));
    ieC.createEl('button', { cls: 'finance-add-btn finance-ie-btn', text: this.tr.import })
      .addEventListener('click', () => this.openIEModal('import'));

    const dgRow = row();
    dgRow.classList.add('finance-settings-danger');
    dgRow.createEl('label', { text: this.tr.dangerZone, cls: 'finance-danger-label' });

    el.createDiv('finance-danger-desc').textContent = this.tr.confirmDeleteAll;

    const cfRow = row();
    cfRow.classList.add('finance-settings-cf');
    const cfIn = cfRow.createEl('input', {
      type: 'text', cls: 'finance-input finance-input-danger', placeholder: this.tr.enterYes,
    });
    const delBtn = cfRow.createEl('button', { text: this.tr.deleteAllData, cls: 'finance-btn-danger' });
    delBtn.addEventListener('click', async () => {
      if (cfIn.value.trim() !== 'Yes') {
        new Notice(this.tr.enterYes);
        return;
      }
      await this.ctx.storage.resetAllData(this.ctx.accountId);
      await this.reload();
      new Notice(this.tr.allDataDeleted);
    });
  }

  private applyAccentColor(color: string): void {
    if (color) this.el.style.setProperty('--ft-accent', color);
    else this.el.style.removeProperty('--ft-accent');
  }
}
