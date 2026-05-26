import { Notice, TFile } from 'obsidian';
import { ViewContext } from '../context';
import {
  FinanceRecord,
  DEFAULT_FILTER,
  SortField,
  SEARCH_DEBOUNCE_MS, PAGE_SIZE_OPTIONS, PAGE_RANGE_THRESHOLD, FOCUS_DELAY_MS,
} from '../types';
import { RecordModal } from '../RecordModal';
import { ConfirmModal } from '../ConfirmModal';
import { ImportExportModal } from '../ImportExportModal';
import { AnalyticsView } from '../AnalyticsView';
import { noteFilename } from '../utils';

export class RecordsTab {
  private ctx: ViewContext;
  private el: HTMLElement;

  private statsEl?: HTMLElement;
  private filtersEl?: HTMLElement;
  private tableEl?: HTMLElement;
  private paginationEl?: HTMLElement;
  private analyticsEl?: HTMLElement;
  private analyticsView: AnalyticsView | null = null;
  private analyticsOpen = false;
  private filtersOpen = false;
  private settingsOpen = false;
  private settingsEl?: HTMLElement;
  private filterDebounce: ReturnType<typeof setTimeout> | null = null;

  private analBtn?: HTMLButtonElement;
  private filtBtn?: HTMLButtonElement;
  private setBtn?: HTMLButtonElement;

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;
  }

  render(): void {
    this.el.empty();

    this.statsEl = this.el.createDiv('finance-stats-container');
    this.renderStats();

    const toggleRow = this.el.createDiv('finance-analytics-toggle-row');

    this.analBtn = toggleRow.createEl('button', {
      cls: 'finance-analytics-toggle-btn',
      text: '📈 Аналитика ▼',
    });
    this.filtBtn = toggleRow.createEl('button', {
      cls: 'finance-analytics-toggle-btn',
      text: '🔍 Фильтры ▼',
    });
    this.setBtn = toggleRow.createEl('button', {
      cls: 'finance-analytics-toggle-btn',
      text: '⚙️ Настройки ▼',
    });

    this.analyticsEl = this.el.createDiv('finance-analytics-panel');
    this.analyticsEl.style.display = 'none';

    this.filtersEl = this.el.createDiv('finance-filters-container');
    this.filtersEl.style.display = 'none';

    this.settingsEl = this.el.createDiv('finance-settings-panel');
    this.settingsEl.style.display = 'none';

    this.analBtn.addEventListener('click', () => this.togglePanel('analytics'));
    this.filtBtn.addEventListener('click', () => this.togglePanel('filters'));
    this.setBtn.addEventListener('click', () => this.togglePanel('settings'));

    const tw = this.el.createDiv('finance-table-wrapper');
    this.tableEl = tw.createDiv('finance-table-container');
    this.paginationEl = tw.createDiv('finance-pagination');
    this.renderTable();
  }

  private togglePanel(panel: 'analytics' | 'filters' | 'settings'): void {
    const wasAnalytics = this.analyticsOpen;
    const wasFilters = this.filtersOpen;
    const wasSettings = this.settingsOpen;

    const isOpening = (panel === 'analytics' && !wasAnalytics)
      || (panel === 'filters' && !wasFilters)
      || (panel === 'settings' && !wasSettings);

    this.analyticsOpen = false;
    this.filtersOpen = false;
    this.settingsOpen = false;

    if (isOpening) {
      if (panel === 'analytics') {
        this.analyticsOpen = true;
        this.renderAnalytics();
      } else if (panel === 'filters') {
        this.filtersOpen = true;
        this.renderFilters();
      } else if (panel === 'settings') {
        this.settingsOpen = true;
        this.renderSettings();
      }
    }

    this.analyticsEl!.style.display = this.analyticsOpen ? 'block' : 'none';
    this.filtersEl!.style.display = this.filtersOpen ? 'block' : 'none';
    this.settingsEl!.style.display = this.settingsOpen ? 'block' : 'none';

    this.analBtn!.classList.toggle('active', this.analyticsOpen);
    this.filtBtn!.classList.toggle('active', this.filtersOpen);
    this.setBtn!.classList.toggle('active', this.settingsOpen);

    this.analBtn!.textContent = `📈 Аналитика ${this.analyticsOpen ? '▲' : '▼'}`;
    this.filtBtn!.textContent = `🔍 Фильтры ${this.filtersOpen ? '▲' : '▼'}`;
    this.setBtn!.textContent = `⚙️ Настройки ${this.settingsOpen ? '▲' : '▼'}`;
  }

  update(): void {
    this.renderStats();
    if (this.filtersOpen) this.renderFilters();
    this.renderTable();
  }

  private renderStats(): void {
    if (!this.statsEl || !this.ctx.data) return;
    this.statsEl.empty();
    const recs = this.ctx.data.records;
    const inc = recs.filter(r => r.type === 'income' && !r.isInternal).reduce((s, r) => s + r.amount, 0);
    const exp = recs.filter(r => r.type === 'expense' && !r.isInternal).reduce((s, r) => s + r.amount, 0);
    const lent = this.ctx.data.debts.filter(d => d.direction === 'lent').reduce((s, d) => s + d.amount, 0);
    const borrowed = this.ctx.data.debts.filter(d => d.direction === 'borrowed').reduce((s, d) => s + d.amount, 0);
    const bal = inc - exp - lent + borrowed;

    [
      { label: 'Доходы', value: this.ctx.fmt(inc), mod: 'income', icon: '↑' },
      { label: 'Расходы', value: this.ctx.fmt(exp), mod: 'expense', icon: '↓' },
      {
        label: 'Баланс', value: (bal >= 0 ? '+' : '') + this.ctx.fmt(bal),
        mod: bal >= 0 ? 'positive' : 'negative', icon: '＝',
      },
    ].forEach(item => {
      const card = this.statsEl!.createDiv(`finance-stat-card finance-stat-${item.mod}`);
      card.createEl('div', { text: item.icon, cls: 'finance-stat-icon' });
      const info = card.createDiv('finance-stat-info');
      info.createEl('div', { text: item.label, cls: 'finance-stat-label' });
      info.createEl('div', { text: item.value, cls: 'finance-stat-value' });
    });
  }

  private renderAnalytics(): void {
    if (!this.analyticsEl) return;
    const filtered = this.getFiltered();
    const cur = this.ctx.currency;

    if (this.analyticsView) {
      this.analyticsView.update(filtered, cur);
    } else {
      const lang = (this.ctx.app.vault as any).getConfig?.('language') ?? 'ru';
      this.analyticsView = new AnalyticsView(this.analyticsEl, filtered, cur, lang);
      this.analyticsView.render();
    }
  }

  private renderFilters(): void {
    if (!this.filtersEl || !this.ctx.data) return;
    this.filtersEl.empty();
    const f = this.ctx.state.filter;

    const row1 = this.filtersEl.createDiv('finance-filters-row');

    const sg = row1.createDiv('finance-filter-group finance-filter-search');
    sg.createEl('label', { text: 'Поиск', cls: 'finance-filter-label' });
    const si = sg.createEl('input', {
      type: 'text', cls: 'finance-filter-input', placeholder: 'Поиск по всем полям…',
    });
    si.value = f.search;
    si.addEventListener('input', () => {
      if (this.filterDebounce) clearTimeout(this.filterDebounce);
      this.filterDebounce = setTimeout(() => {
        this.ctx.state.filter.search = si.value;
        this.resetPage();
      }, SEARCH_DEBOUNCE_MS);
    });

    this.mkSelect(row1, 'Тип',
      [{ v: 'all', l: 'Все типы' }, { v: 'income', l: '↑ Доходы' }, { v: 'expense', l: '↓ Расходы' }],
      f.type, v => { this.ctx.state.filter.type = v as any; this.resetPage(); });

    this.mkSearchSelect(row1, 'Категория',
      [{ v: '', l: 'Все' }, ...this.ctx.data.categories.map(c => ({ v: c, l: c }))],
      f.category, v => { this.ctx.state.filter.category = v; this.resetPage(); });

    const row2 = this.filtersEl.createDiv('finance-filters-row');

    const dfG = row2.createDiv('finance-filter-group');
    dfG.createEl('label', { text: 'С', cls: 'finance-filter-label' });
    const dfI = dfG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dfI.value = f.dateFrom;
    dfI.addEventListener('change', () => { this.ctx.state.filter.dateFrom = dfI.value; this.resetPage(); });

    const dtG = row2.createDiv('finance-filter-group');
    dtG.createEl('label', { text: 'По', cls: 'finance-filter-label' });
    const dtI = dtG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dtI.value = f.dateTo;
    dtI.addEventListener('change', () => { this.ctx.state.filter.dateTo = dtI.value; this.resetPage(); });

    this.mkSearchSelect(row2, 'Плательщик',
      [{ v: '', l: 'Все' }, ...this.ctx.data.payers.map(p => ({ v: p, l: p }))],
      f.payer, v => { this.ctx.state.filter.payer = v; this.resetPage(); });

    this.mkSearchSelect(row2, 'Тег',
      [{ v: '', l: 'Все' }, ...this.ctx.data.tags.map(t => ({ v: t, l: t }))],
      f.tag, v => { this.ctx.state.filter.tag = v; this.resetPage(); });

    const intG = row2.createDiv('finance-filter-group finance-filter-internal');
    const intLabel = intG.createEl('label', { cls: 'finance-filter-label' });
    const intBtn = intG.createEl('button', {
      type: 'button',
      cls: 'finance-internal-btn',
      attr: { title: 'Показать только внутренние операции' },
    });
    intBtn.innerHTML = '🔄';
    const applyInternalLabel = () => {
      const only = f.showInternal === 'only';
      intLabel.textContent = only ? 'Только внутр.' : 'Внутренние';
      intBtn.style.opacity = only ? '1' : '.4';
    };
    applyInternalLabel();
    intBtn.addEventListener('click', () => {
      this.ctx.state.filter.showInternal = f.showInternal === 'only' ? 'all' : 'only';
      applyInternalLabel();
      this.resetPage();
    });

    const rG = row2.createDiv('finance-filter-group finance-filter-reset');
    rG.createEl('label', { text: '\u00A0', cls: 'finance-filter-label' });
    rG.createEl('button', { text: '✕ Сбросить', cls: 'finance-reset-btn' })
      .addEventListener('click', () => {
        this.ctx.state.filter = { ...DEFAULT_FILTER };
        this.ctx.state.page = 0;
        this.ctx.saveState();
        this.renderFilters();
        this.renderTable();
        if (this.analyticsOpen) this.renderAnalytics();
      });

    const sortRow = this.filtersEl.createDiv('finance-sort-row');
    sortRow.createEl('span', { text: 'Сортировка:', cls: 'finance-sort-label' });

    const sortFields: { field: SortField; label: string }[] = [
      { field: 'createdAt', label: 'Добавлена' },
      { field: 'date', label: 'Дата' },
      { field: 'amount', label: 'Сумма' },
      { field: 'category', label: 'Категория' },
      { field: 'type', label: 'Тип' },
      { field: 'payer', label: 'Плательщик' },
    ];
    sortFields.forEach(({ field, label }) => {
      const active = this.ctx.state.sort.field === field;
      const btn = sortRow.createEl('button', {
        cls: `finance-sort-btn${active ? ' active' : ''}`,
        text: label + (active ? (this.ctx.state.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''),
      });
      btn.addEventListener('click', () => {
        this.ctx.state.sort = this.ctx.state.sort.field === field
          ? { field, dir: this.ctx.state.sort.dir === 'asc' ? 'desc' : 'asc' }
          : { field, dir: 'desc' };
        this.ctx.state.page = 0;
        this.ctx.saveState();
        this.renderFilters();
        this.renderTable();
        if (this.analyticsOpen) this.renderAnalytics();
      });
    });
  }

  private mkSelect(
    row: HTMLElement, label: string,
    opts: { v: string; l: string }[],
    cur: string, onChange: (v: string) => void,
  ): void {
    const g = row.createDiv('finance-filter-group');
    g.createEl('label', { text: label, cls: 'finance-filter-label' });
    const sel = g.createEl('select', { cls: 'finance-filter-select' });
    opts.forEach(({ v, l }) => { const o = sel.createEl('option', { text: l }); o.value = v; o.selected = v === cur; });
    sel.addEventListener('change', () => onChange(sel.value));
  }

  private mkSearchSelect(
    row: HTMLElement, label: string,
    opts: { v: string; l: string }[],
    cur: string, onChange: (v: string) => void,
  ): void {
    const g = row.createDiv('finance-filter-group');
    g.createEl('label', { text: label, cls: 'finance-filter-label' });

    const wrapper = g.createDiv('finance-custom-select');
    let selectedValue = cur;

    const trigger = wrapper.createDiv('finance-custom-select-trigger');
    trigger.setAttribute('tabindex', '0');
    const triggerText = trigger.createEl('span', { cls: 'finance-custom-select-text' });
    triggerText.textContent = opts.find(o => o.v === cur)?.l ?? cur ?? opts[0]?.l ?? '—';

    let dropdown: HTMLElement | null = null;
    let isOpen = false;
    let outsideHandler: ((e: MouseEvent) => void) | null = null;

    const closeDropdown = () => {
      if (!isOpen) return;
      isOpen = false;
      dropdown?.remove();
      dropdown = null;
      if (outsideHandler) { document.removeEventListener('mousedown', outsideHandler); outsideHandler = null; }
    };

    const resetSelection = () => {
      selectedValue = opts[0]?.v ?? '';
      triggerText.textContent = opts[0]?.l ?? '—';
      onChange(selectedValue);
      closeDropdown();
    };

    const openDropdown = () => {
      if (isOpen) { closeDropdown(); return; }
      isOpen = true;

      dropdown = wrapper.createDiv('finance-custom-select-dropdown');

      const searchInput = dropdown.createEl('input', {
        type: 'text',
        cls: 'finance-custom-select-search',
        placeholder: 'Поиск…',
      });

      const list = dropdown.createDiv('finance-custom-select-list');

      const renderList = (q: string) => {
        list.empty();
        const lq = q.toLowerCase();
        const filtered = opts.filter(o => !lq || o.l.toLowerCase().includes(lq) || o.v.toLowerCase().includes(lq));
        if (!filtered.length) {
          list.createDiv({ cls: 'finance-custom-select-empty', text: 'Нет вариантов' });
          return;
        }
        filtered.forEach(({ v, l }) => {
          const item = list.createDiv({ cls: `finance-custom-select-item${v === selectedValue ? ' is-active' : ''}` });
          item.textContent = l;
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectedValue = v;
            triggerText.textContent = l;
            onChange(v);
            closeDropdown();
          });
        });
      };

      renderList('');
      searchInput.addEventListener('input', () => renderList(searchInput.value));
      searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = list.querySelector<HTMLElement>('.finance-custom-select-item');
          if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
        if (e.key === 'ArrowDown') {
          const first = list.querySelector<HTMLElement>('.finance-custom-select-item');
          first?.focus();
        }
        if (e.key === 'Escape') { resetSelection(); }
      });
      setTimeout(() => searchInput.focus(), FOCUS_DELAY_MS);

      outsideHandler = (e: MouseEvent) => {
        if (!wrapper.contains(e.target as Node)) closeDropdown();
      };
      setTimeout(() => document.addEventListener('mousedown', outsideHandler!), 0);
    };

    trigger.addEventListener('click', openDropdown);
    trigger.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown(); }
      if (e.key === 'Escape') { e.preventDefault(); resetSelection(); }
    });
  }

  private getFiltered(): FinanceRecord[] {
    if (!this.ctx.data) return [];
    const { filter, sort } = this.ctx.state;
    const q = filter.search.toLowerCase();

    let rows = this.ctx.data.records.filter(r => {
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

    rows = rows.slice().sort((a, b) => {
      const av = a[sort.field as keyof FinanceRecord] ?? '';
      const bv = b[sort.field as keyof FinanceRecord] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'ru');
      return sort.dir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }

  private renderTable(): void {
    if (!this.tableEl || !this.paginationEl) return;
    this.tableEl.empty();
    this.paginationEl.empty();

    const filtered = this.getFiltered();
    const { pageSize } = this.ctx.state;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.max(0, Math.min(this.ctx.state.page, totalPages - 1));
    this.ctx.state.page = page;
    const start = page * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);
    const cur = this.ctx.currency;

    if (this.analyticsOpen && this.analyticsView) {
      this.analyticsView.update(filtered, cur);
    }

    if (!filtered.length) {
      const e = this.tableEl.createDiv('finance-empty-state');
      e.createEl('div', { text: '📊', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Записей не найдено', cls: 'finance-empty-title' });
      e.createEl('p', {
        text: this.ctx.data?.records.length ? 'Попробуйте изменить фильтры' : 'Нажмите «Доход» или «Расход»',
        cls: 'finance-empty-sub',
      });
      return;
    }

    const infoBar = this.tableEl.createDiv('finance-table-info-bar');

    const metaLeft = infoBar.createDiv('finance-table-meta');
    metaLeft.createEl('span', {
      text: `${start + 1}–${Math.min(start + pageSize, filtered.length)} из ${filtered.length}`,
      cls: 'finance-count-text',
    });

    const fi = filtered.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const fe = filtered.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const sums = infoBar.createDiv('finance-table-sums');
    sums.createEl('span', { text: `↑\u00a0${this.ctx.fmt(fi)}`, cls: 'finance-sum-income' });
    sums.createEl('span', { text: '·', cls: 'finance-sum-sep' });
    sums.createEl('span', { text: `↓\u00a0${this.ctx.fmt(fe)}`, cls: 'finance-sum-expense' });

    const cols = [
      { key: 'date', label: 'Дата / Время' },
      { key: 'type', label: 'Тип' },
      { key: 'amount', label: 'Сумма' },
      { key: 'category', label: 'Категория' },
      { key: 'tag', label: 'Тег' },
      { key: 'payer', label: 'Плательщик' },
      { key: 'note', label: 'Примечание' },
      { key: '_act', label: '' },
    ];

    if (this.ctx.isMobile) {
      this.renderRecordsAsBlocks(pageRows);
    } else {
      this.renderRecordsAsTable(pageRows, cols);
    }
    if (totalPages > 1) this.renderPagination(totalPages, page);
  }

  private renderRecordsAsBlocks(pageRows: FinanceRecord[]): void {
    if (!this.tableEl) return;
    const list = this.tableEl.createDiv('finance-records-list');
    const frag = document.createDocumentFragment();

    pageRows.forEach(rec => {
      const block = document.createElement('div');
      block.classList.add('finance-record-block', rec.type === 'income' ? 'finance-row-income' : 'finance-row-expense');
      if (rec.isInternal) block.classList.add('finance-tr-internal');

      const header = block.createDiv('finance-record-header');
      const amount = (rec.type === 'income' ? '+' : '−') + this.ctx.fmt(rec.amount);
      header.createEl('span', {
        text: amount,
        cls: 'finance-record-amount ' + (rec.type === 'income' ? 'finance-amount-income' : 'finance-amount-expense'),
      });
      header.createEl('span', { text: this.ctx.fmtDate(rec.date, rec.time), cls: 'finance-record-date' });

      if (rec.category) {
        block.createEl('div', { text: rec.category, cls: 'finance-record-category' });
      }

      const details = block.createDiv('finance-record-details');
      if (rec.tag) {
        details.createEl('span', { text: `🏷️ ${rec.tag}`, cls: 'finance-record-detail' });
      }
      if (rec.payer) {
        details.createEl('span', { text: `👤 ${rec.payer}`, cls: 'finance-record-detail' });
      }
      if (rec.exchangeRate) {
        details.createEl('span', { text: `💱 @ ${rec.exchangeRate}`, cls: 'finance-record-detail' });
      }

      if (rec.note) {
        block.createEl('div', { text: rec.note, cls: 'finance-record-note' });
      }

      const actions = block.createDiv('finance-record-actions');
      if (rec.attachmentPath) {
        this.mkActionBtn(actions, '📎', 'Открыть вложение', () => this.openAttachment(rec));
      }
      this.mkActionBtn(actions, '✏️', 'Редактировать', () => this.openEditModal(rec));
      this.mkActionBtn(actions, '🗑️', 'Удалить', () => this.confirmDelete(rec), 'finance-delete-btn');

      frag.appendChild(block);
    });

    list.appendChild(frag);
  }

  private renderRecordsAsTable(pageRows: FinanceRecord[], cols: { key: string; label: string }[]): void {
    if (!this.tableEl) return;
    const scroll = this.tableEl.createDiv('finance-table-scroll');
    const table = scroll.createEl('table', { cls: 'finance-table' });

    const hRow = table.createEl('thead').createEl('tr');
    cols.forEach(c => hRow.createEl('th', { text: c.label, cls: 'finance-th' }));

    const tbody = table.createEl('tbody');
    const frag = document.createDocumentFragment();

    pageRows.forEach(rec => {
      const tr = document.createElement('tr');
      tr.classList.add('finance-tr', rec.type === 'income' ? 'finance-row-income' : 'finance-row-expense');
      if (rec.isInternal) tr.classList.add('finance-tr-internal');

      const cells = [
        { key: 'date', text: this.ctx.fmtDate(rec.date, rec.time), cls: 'finance-td-date' },
        {
          key: 'type', text: rec.type === 'income' ? '↑ Доход' : '↓ Расход',
          cls: rec.type === 'income' ? 'finance-type-income' : 'finance-type-expense',
        },
        {
          key: 'amount', text: (rec.type === 'income' ? '+' : '−') + this.ctx.fmt(rec.amount)
            + (rec.exchangeRate ? ` @ ${rec.exchangeRate}` : ''),
          cls: 'finance-amount-cell ' + (rec.type === 'income' ? 'finance-amount-income' : 'finance-amount-expense'),
        },
        { key: 'category', text: rec.category || '—', cls: '' },
        { key: 'tag', text: rec.tag || '—', cls: 'finance-td-muted' },
        { key: 'payer', text: rec.payer || '—', cls: '' },
        { key: 'note', text: rec.note || '—', cls: 'finance-note-cell' },
      ];

      cells.forEach(c => {
        const td = document.createElement('td');
        td.classList.add('finance-td');
        if (c.cls) c.cls.split(' ').filter(Boolean).forEach(x => td.classList.add(x));
        td.setAttribute('data-label', cols.find(co => co.key === c.key)?.label ?? '');
        td.textContent = c.text;
        tr.appendChild(td);
      });

      const atd = document.createElement('td');
      atd.classList.add('finance-td', 'finance-actions-td');
      atd.setAttribute('data-label', '');

      if (rec.attachmentPath) {
        this.mkActionBtn(atd, '📎', 'Открыть вложение', () => this.openAttachment(rec));
      }
      this.mkActionBtn(atd, '✏️', 'Редактировать', () => this.openEditModal(rec));
      this.mkActionBtn(atd, '🗑️', 'Удалить', () => this.confirmDelete(rec), 'finance-delete-btn');

      tr.appendChild(atd);
      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
  }

  private mkActionBtn(parent: HTMLElement, icon: string, title: string, onClick: () => void, extraCls = ''): void {
    const btn = document.createElement('button');
    btn.classList.add('finance-action-btn');
    if (extraCls) btn.classList.add(extraCls);
    btn.title = title;
    btn.textContent = icon;
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
  }

  private renderPagination(totalPages: number, current: number): void {
    if (!this.paginationEl) return;
    const nav = this.paginationEl.createDiv('finance-pagination-nav');

    const go = (page: number) => {
      this.ctx.state.page = page;
      this.renderTable();
    };

    const prev = nav.createEl('button', { cls: 'finance-page-btn', text: '←' });
    prev.disabled = current === 0;
    prev.addEventListener('click', () => go(current - 1));

    this.pageRange(current, totalPages).forEach(p => {
      if (p === -1) { nav.createEl('span', { text: '…', cls: 'finance-page-ellipsis' }); return; }
      const btn = nav.createEl('button', {
        text: String(p + 1),
        cls: `finance-page-btn${p === current ? ' active' : ''}`,
      });
      btn.addEventListener('click', () => go(p));
    });

    const next = nav.createEl('button', { cls: 'finance-page-btn', text: '→' });
    next.disabled = current >= totalPages - 1;
    next.addEventListener('click', () => go(current + 1));
  }

  private pageRange(cur: number, total: number): number[] {
    if (total <= PAGE_RANGE_THRESHOLD) return Array.from({ length: total }, (_, i) => i);
    const p: number[] = [0];
    if (cur > 2) p.push(-1);
    for (let i = Math.max(1, cur - 1); i <= Math.min(total - 2, cur + 1); i++) p.push(i);
    if (cur < total - 3) p.push(-1);
    p.push(total - 1);
    return p;
  }

  private openAddModal(type: 'income' | 'expense'): void {
    if (!this.ctx.data) { new Notice('⏳ Загрузка…'); return; }
    const cur = this.ctx.currency;
    new RecordModal(this.ctx.app, {
      initial: { type }, records: this.ctx.data.records,
      categories: this.ctx.data.categories, tags: this.ctx.data.tags, payers: this.ctx.data.payers,
      currency: cur, settings: this.ctx.settings, pluginId: this.ctx.pluginId,
      onSave: async rec => {
        await this.ctx.storage.addRecord(this.ctx.notePath, rec);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.renderStats();
        this.renderFilters();
        this.renderTable();
        new Notice('✅ Запись добавлена');
      },
    }).open();
  }

  private openEditModal(rec: FinanceRecord): void {
    if (!this.ctx.data) return;
    const cur = this.ctx.currency;
    new RecordModal(this.ctx.app, {
      initial: { ...rec }, records: this.ctx.data.records.filter(r => r.id !== rec.id),
      categories: this.ctx.data.categories, tags: this.ctx.data.tags, payers: this.ctx.data.payers,
      currency: cur, settings: this.ctx.settings, pluginId: this.ctx.pluginId,
      onSave: async updated => {
        await this.ctx.storage.updateRecord(this.ctx.notePath, updated);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.renderStats();
        this.renderTable();
        new Notice('✅ Запись обновлена');
      },
    }).open();
  }

  private confirmDelete(rec: FinanceRecord): void {
    const label = `${rec.type === 'income' ? '+' : '−'}${this.ctx.fmt(rec.amount)}  ·  ${rec.category || '—'}  ·  ${this.ctx.fmtDate(rec.date, rec.time)}`;
    new ConfirmModal(this.ctx.app, `Удалить запись?\n${label}`, async () => {
      await this.ctx.storage.deleteRecord(this.ctx.notePath, rec.id);
      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.renderStats();
      this.renderTable();
      new Notice('🗑️ Удалено');
    }).open();
  }

  private openAttachment(rec: FinanceRecord): void {
    const f = this.ctx.app.vault.getAbstractFileByPath(rec.attachmentPath);
    if (f instanceof TFile) this.ctx.app.workspace.getLeaf(false).openFile(f);
    else new Notice(`⚠️ Файл не найден: ${rec.attachmentPath}`);
  }

  private openIEModal(mode: 'export' | 'import'): void {
    if (!this.ctx.data) { new Notice('⏳ Загрузка…'); return; }
    const modal = new ImportExportModal(this.ctx.app, {
      noteName: this.ctx.data.name || noteFilename(this.ctx.notePath),
      currency: this.ctx.currency,
      records: this.ctx.data.records,
      onImport: async recs => {
        await this.ctx.storage.importRecords(this.ctx.notePath, recs);
        this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
        this.renderStats();
        this.renderTable();
        if (this.filtersOpen) this.renderFilters();
      },
      mode,
    });
    modal.open();
  }

  private resetPage(): void {
    this.ctx.state.page = 0;
    this.ctx.saveState();
    this.renderTable();
    if (this.analyticsOpen) this.renderAnalytics();
    if (this.filtersOpen) this.renderFilters();
  }

  private renderSettings(): void {
    if (!this.settingsEl || !this.ctx.data) return;
    const el = this.settingsEl;
    el.empty();
    el.addClass('finance-settings-panel');

    const row = (): HTMLDivElement => el.createDiv('finance-settings-row');

    // ── Page size ────────────────────────────────────────────────────────
    const psRow = row();
    psRow.createEl('label', { text: 'Записей на странице', cls: 'finance-filter-label' });
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
      this.renderTable();
    });

    // ── Accent color ─────────────────────────────────────────────────────
    const acRow = row();
    acRow.createEl('label', { text: 'Цвет акцента счёта', cls: 'finance-filter-label' });
    const acC = acRow.createDiv('finance-settings-controls');
    const acIn = acC.createEl('input', { type: 'color', cls: 'finance-settings-color-input' });
    acIn.value = this.ctx.data.accentColor ?? '#7c3aed';
    const hexLabel = acC.createEl('span', { text: acIn.value, cls: 'finance-settings-hex' });
    acIn.addEventListener('input', async () => {
      hexLabel.textContent = acIn.value;
      await this.ctx.storage.updateMeta(this.ctx.notePath, { accentColor: acIn.value });
      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.applyAccentColor(acIn.value);
    });
    const rstBtn = acC.createEl('button', { text: 'Сбросить', cls: 'finance-btn-cancel' });
    rstBtn.style.padding = '4px 12px';
    rstBtn.style.fontSize = '.8em';
    rstBtn.addEventListener('click', async () => {
      await this.ctx.storage.updateMeta(this.ctx.notePath, { accentColor: '' });
      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.applyAccentColor('');
      acIn.value = '#7c3aed';
      hexLabel.textContent = '#7c3aed';
    });

    // ── Import / Export ────────────────────────────────────────────────────
    const ieRow = row();
    ieRow.classList.add('finance-settings-sep');
    ieRow.createEl('label', { text: 'Импорт / Экспорт', cls: 'finance-filter-label' });
    const ieC = ieRow.createDiv('finance-settings-controls');
    const expBtn = ieC.createEl('button', { cls: 'finance-add-btn finance-ie-btn', text: '📤 Экспорт' });
    const impBtn = ieC.createEl('button', { cls: 'finance-add-btn finance-ie-btn', text: '📥 Импорт' });
    expBtn.addEventListener('click', () => this.openIEModal('export'));
    impBtn.addEventListener('click', () => this.openIEModal('import'));

    // ── Danger zone ───────────────────────────────────────────────────────
    const dgRow = row();
    dgRow.classList.add('finance-settings-danger');
    dgRow.createEl('label', { text: 'ОПАСНАЯ ЗОНА', cls: 'finance-danger-label' });

    const dangerDesc = el.createDiv('finance-danger-desc');
    dangerDesc.textContent = 'Введите "Yes" и нажмите кнопку ниже, чтобы удалить ВСЕ записи и долги безвозвратно.';

    const cfRow = row();
    cfRow.classList.add('finance-settings-cf');
    const cfIn = cfRow.createEl('input', {
      type: 'text', cls: 'finance-input', placeholder: 'Введите Yes для подтверждения',
    });
    cfIn.style.borderColor = '#dc2626';
    const delBtn = cfRow.createEl('button', { text: '🗑️ Удалить ВСЕ данные', cls: 'finance-btn-danger' });
    delBtn.addEventListener('click', async () => {
      if (cfIn.value.trim() !== 'Yes') {
        new Notice('⚠️ Введите "Yes" для подтверждения');
        return;
      }
      await this.ctx.storage.resetAllData(this.ctx.notePath);
      this.ctx.data = await this.ctx.storage.load(this.ctx.notePath);
      this.renderStats();
      this.renderFilters();
      this.renderTable();
      new Notice('🗑️ Все данные удалены');
    });
  }

  private applyAccentColor(color: string): void {
    if (color) {
      this.el.style.setProperty('--ft-accent', color);
    } else {
      this.el.style.removeProperty('--ft-accent');
    }
  }
}
