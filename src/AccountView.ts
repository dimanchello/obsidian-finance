import { App, Notice, TFile } from 'obsidian';
import { FinanceStorage }       from './storage';
import {
  AccountData, FinanceRecord, PluginSettings,
  DEFAULT_FILTER, DEFAULT_SORT, COMMON_CURRENCIES, SortField, ViewState,
} from './types';
import { RecordModal }       from './RecordModal';
import { ConfirmModal }      from './ConfirmModal';
import { ImportExportModal } from './ImportExportModal';
import { AnalyticsView }     from './AnalyticsView';

// ── state persistence ─────────────────────────────────────────────────────────

const LS = 'ft-view:';

function loadState(np: string, pageSize: number): ViewState {
  try {
    const raw = localStorage.getItem(LS + np);
    if (raw) { const v = JSON.parse(raw) as ViewState; v.page = 0; return v; }
  } catch { /* ignore */ }
  return { sort: { ...DEFAULT_SORT }, filter: { ...DEFAULT_FILTER }, page: 0, pageSize };
}

function saveState(np: string, s: ViewState): void {
  try { localStorage.setItem(LS + np, JSON.stringify({ ...s, page: 0 })); } catch { /* ignore */ }
}

// ── formatting helpers ────────────────────────────────────────────────────────

function noteFilename(p: string): string {
  return p.split('/').pop()?.replace(/\.md$/i, '') ?? p;
}

function fmtDate(d: string, t = ''): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return t ? `${day}.${m}.${y}\u00a0${t}` : `${day}.${m}.${y}`;
}

function fmt(n: number, cur: string): string {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0' + cur;
}

// ── main view class ───────────────────────────────────────────────────────────

export class AccountView {
  private app:      App;
  private root:     HTMLElement;
  private notePath: string;
  private storage:  FinanceStorage;
  private settings: PluginSettings;
  private state:    ViewState;
  private data:     AccountData | null = null;

  private statsEl?:      HTMLElement;
  private filtersEl?:    HTMLElement;
  private tableEl?:      HTMLElement;
  private paginationEl?: HTMLElement;
  private analyticsEl?:  HTMLElement;
  private analyticsView: AnalyticsView | null = null;
  private analyticsOpen  = false;
  private filterDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, root: HTMLElement, notePath: string, storage: FinanceStorage, settings: PluginSettings) {
    this.app = app; this.root = root; this.notePath = notePath;
    this.storage = storage; this.settings = settings;
    this.state = loadState(notePath, settings.defaultPageSize);
  }

  async render(): Promise<void> {
    this.root.empty();
    this.root.addClass('finance-tracker');

    // ── Phase 1: instant header + buttons ───────────────────────────────
    this.renderHeader();

    const body = this.root.createDiv('finance-body');
    // skeleton
    const skS = body.createDiv('finance-stats-skeleton');
    for (let i = 0; i < 3; i++) skS.createDiv('finance-skeleton-card');
    const skF = body.createDiv('finance-filters-skeleton');
    skF.createDiv('finance-skeleton-bar');
    skF.createDiv('finance-skeleton-bar finance-skeleton-bar-sm');
    const ldr = body.createDiv('finance-table-loading');
    ldr.createDiv('finance-spinner');
    ldr.createEl('p', { text: 'Загрузка…', cls: 'finance-loading-text' });

    // ── Phase 2: load data ───────────────────────────────────────────────
    this.data = await this.storage.load(this.notePath);

    // ── Phase 3: full render ─────────────────────────────────────────────
    body.empty();

    this.statsEl = body.createDiv('finance-stats-container');
    this.renderStats();

    // Analytics toggle button
    const analToggleRow = body.createDiv('finance-analytics-toggle-row');
    const analBtn = analToggleRow.createEl('button', {
      cls:  'finance-analytics-toggle-btn',
      text: '📈 Аналитика ▼',
    });
    this.analyticsEl = body.createDiv('finance-analytics-panel');
    this.analyticsEl.style.display = 'none';

    analBtn.addEventListener('click', () => {
      this.analyticsOpen = !this.analyticsOpen;
      this.analyticsEl!.style.display = this.analyticsOpen ? 'block' : 'none';
      analBtn.textContent = `📈 Аналитика ${this.analyticsOpen ? '▲' : '▼'}`;
      if (this.analyticsOpen) this.renderAnalytics();
    });

    this.filtersEl = body.createDiv('finance-filters-container');
    this.renderFilters();

    const tw         = body.createDiv('finance-table-wrapper');
    this.tableEl     = tw.createDiv('finance-table-container');
    this.paginationEl= tw.createDiv('finance-pagination');
    this.renderTable();
  }

  // ── Header ────────────────────────────────────────────────────────────────

  private renderHeader(): void {
    const header = this.root.createDiv('finance-header');
    const left   = header.createDiv('finance-header-left');

    const nameWrap   = left.createDiv('finance-account-name-wrap');
    const displayName = this.data?.name || noteFilename(this.notePath);
    const nameEl     = nameWrap.createEl('h2', { text: displayName, cls: 'finance-title' });
    nameEl.title     = 'Нажмите чтобы переименовать';
    nameEl.addEventListener('click', () => this.startNameEdit(nameEl));

    const curWrap = left.createDiv('finance-currency-badge');
    curWrap.title = 'Изменить валюту';
    this.renderCurrencyBadge(curWrap);

    const right  = header.createDiv('finance-header-right');

    const incBtn = right.createEl('button', { cls: 'finance-add-btn finance-income-btn' });
    incBtn.innerHTML = '<span class="btn-icon">↑</span><span>Доход</span>';

    const expBtn = right.createEl('button', { cls: 'finance-add-btn finance-expense-btn' });
    expBtn.innerHTML = '<span class="btn-icon">↓</span><span>Расход</span>';

    const ieBtn  = right.createEl('button', { cls: 'finance-add-btn finance-ie-btn' });
    ieBtn.innerHTML  = '⇅ Импорт/Экспорт';

    incBtn.addEventListener('click', () => this.openAddModal('income'));
    expBtn.addEventListener('click', () => this.openAddModal('expense'));
    ieBtn .addEventListener('click', () => this.openIEModal());
  }

  // ── Editable account name ─────────────────────────────────────────────────

  private startNameEdit(el: HTMLElement): void {
    const original = el.textContent ?? '';
    el.setAttribute('contenteditable', 'true');
    el.addClass('finance-title-editing');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    const finish = async () => {
      el.setAttribute('contenteditable', 'false');
      el.removeClass('finance-title-editing');
      const newName = (el.textContent ?? '').trim();
      if (!newName) { el.textContent = original; return; }
      await this.storage.updateMeta(this.notePath, { name: newName });
      this.data = await this.storage.load(this.notePath);
    };

    el.addEventListener('blur', finish, { once: true });
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter')  { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = original; el.blur(); }
    });
  }

  // ── Currency badge ────────────────────────────────────────────────────────

  private renderCurrencyBadge(wrap: HTMLElement): void {
    wrap.empty();
    const cur   = this.data?.currency ?? this.settings.defaultCurrency;
    const badge = wrap.createEl('span', { text: cur, cls: 'finance-cur-badge' });
    let open    = false;

    badge.addEventListener('click', () => {
      if (open) return;
      open = true;
      const popup = wrap.createDiv('finance-cur-popup');

      COMMON_CURRENCIES.forEach(c => {
        const btn = popup.createEl('button', {
          text: c,
          cls:  `finance-cur-option${c === cur ? ' active' : ''}`,
        });
        btn.addEventListener('click', async () => {
          await this.storage.updateMeta(this.notePath, { currency: c });
          this.data = await this.storage.load(this.notePath);
          popup.remove(); open = false;
          this.renderCurrencyBadge(wrap);
          this.renderStats(); this.renderTable();
        });
      });

      const row = popup.createDiv('finance-cur-custom-row');
      const inp = row.createEl('input', { type: 'text', cls: 'finance-input', placeholder: 'Своя…' });
      inp.style.width = '80px';
      const ok  = row.createEl('button', { text: '✓', cls: 'finance-btn-save finance-cur-ok' });
      ok.addEventListener('click', async () => {
        const v = inp.value.trim();
        if (!v) return;
        await this.storage.updateMeta(this.notePath, { currency: v });
        this.data = await this.storage.load(this.notePath);
        popup.remove(); open = false;
        this.renderCurrencyBadge(wrap);
        this.renderStats(); this.renderTable();
      });

      setTimeout(() => {
        const close = (e: MouseEvent) => {
          if (!popup.contains(e.target as Node) && e.target !== badge) {
            popup.remove(); open = false;
            document.removeEventListener('click', close);
          }
        };
        document.addEventListener('click', close);
      }, 0);
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  private renderStats(): void {
    if (!this.statsEl || !this.data) return;
    this.statsEl.empty();
    const recs = this.data.records;
    const cur  = this.data.currency || this.settings.defaultCurrency;
    const inc  = recs.filter(r => r.type === 'income' ).reduce((s, r) => s + r.amount, 0);
    const exp  = recs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const bal  = inc - exp;

    [
      { label: 'Доходы',  value: fmt(inc, cur), mod: 'income',   icon: '↑' },
      { label: 'Расходы', value: fmt(exp, cur), mod: 'expense',  icon: '↓' },
      { label: 'Баланс',  value: (bal >= 0 ? '+' : '') + fmt(bal, cur),
        mod: bal >= 0 ? 'positive' : 'negative', icon: '＝' },
    ].forEach(item => {
      const card = this.statsEl!.createDiv(`finance-stat-card finance-stat-${item.mod}`);
      card.createEl('div', { text: item.icon, cls: 'finance-stat-icon' });
      const info = card.createDiv('finance-stat-info');
      info.createEl('div', { text: item.label, cls: 'finance-stat-label' });
      info.createEl('div', { text: item.value,  cls: 'finance-stat-value' });
    });
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  private renderAnalytics(): void {
    if (!this.analyticsEl) return;
    const filtered = this.getFiltered();
    const cur      = this.data?.currency || this.settings.defaultCurrency;

    if (this.analyticsView) {
      this.analyticsView.update(filtered, cur);
    } else {
      this.analyticsView = new AnalyticsView(this.analyticsEl, filtered, cur);
      this.analyticsView.render();
    }
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  private renderFilters(): void {
    if (!this.filtersEl || !this.data) return;
    this.filtersEl.empty();
    const f = this.state.filter;

    // Row 1: search / type / category / tag
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
        this.state.filter.search = si.value;
        this.resetPage();
      }, 280);
    });

    this.mkSelect(row1, 'Тип',
      [{ v:'all',l:'Все типы' },{ v:'income',l:'↑ Доходы' },{ v:'expense',l:'↓ Расходы' }],
      f.type, v => { this.state.filter.type = v as any; this.resetPage(); });

    this.mkSearchSelect(row1, 'Категория',
      [{ v:'',l:'Все' }, ...this.data.categories.map(c => ({ v:c,l:c }))],
      f.category, v => { this.state.filter.category = v; this.resetPage(); });

    this.mkSearchSelect(row1, 'Тег',
      [{ v:'',l:'Все' }, ...this.data.tags.map(t => ({ v:t,l:t }))],
      f.tag, v => { this.state.filter.tag = v; this.resetPage(); });

    // Row 2: dates / payer / page size / reset
    const row2 = this.filtersEl.createDiv('finance-filters-row');

    const dfG = row2.createDiv('finance-filter-group');
    dfG.createEl('label', { text: 'С', cls: 'finance-filter-label' });
    const dfI = dfG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dfI.value = f.dateFrom;
    dfI.addEventListener('change', () => { this.state.filter.dateFrom = dfI.value; this.resetPage(); });

    const dtG = row2.createDiv('finance-filter-group');
    dtG.createEl('label', { text: 'По', cls: 'finance-filter-label' });
    const dtI = dtG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dtI.value = f.dateTo;
    dtI.addEventListener('change', () => { this.state.filter.dateTo = dtI.value; this.resetPage(); });

    this.mkSearchSelect(row2, 'Плательщик',
      [{ v:'',l:'Все' }, ...this.data.payers.map(p => ({ v:p,l:p }))],
      f.payer, v => { this.state.filter.payer = v; this.resetPage(); });

    // Per-account page size
    const psG = row2.createDiv('finance-filter-group');
    psG.createEl('label', { text: 'Записей / стр.', cls: 'finance-filter-label' });
    const psSel = psG.createEl('select', { cls: 'finance-filter-select' });
    [10, 20, 25, 50, 100, 200, 500].forEach(n => {
      const o = psSel.createEl('option', { text: String(n) });
      o.value   = String(n);
      o.selected = n === this.state.pageSize;
    });
    psSel.addEventListener('change', () => {
      this.state.pageSize = parseInt(psSel.value);
      this.state.page     = 0;
      saveState(this.notePath, this.state);
      this.renderTable();
    });

    const rG = row2.createDiv('finance-filter-group finance-filter-reset');
    rG.createEl('label', { text: '\u00A0', cls: 'finance-filter-label' });
    rG.createEl('button', { text: '✕ Сбросить', cls: 'finance-reset-btn' })
      .addEventListener('click', () => {
        this.state.filter = { ...DEFAULT_FILTER };
        this.state.page   = 0;
        saveState(this.notePath, this.state);
        this.renderFilters();
        this.renderTable();
        if (this.analyticsOpen) this.renderAnalytics();
      });

    // Sort row
    const sortRow = this.filtersEl.createDiv('finance-sort-row');
    sortRow.createEl('span', { text: 'Сортировка:', cls: 'finance-sort-label' });

    const sortFields: { field: SortField; label: string }[] = [
      { field: 'createdAt', label: 'Добавлена' },
      { field: 'date',      label: 'Дата' },
      { field: 'amount',    label: 'Сумма' },
      { field: 'category',  label: 'Категория' },
      { field: 'type',      label: 'Тип' },
      { field: 'payer',     label: 'Плательщик' },
    ];
    sortFields.forEach(({ field, label }) => {
      const active = this.state.sort.field === field;
      const btn = sortRow.createEl('button', {
        cls:  `finance-sort-btn${active ? ' active' : ''}`,
        text: label + (active ? (this.state.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''),
      });
      btn.addEventListener('click', () => {
        this.state.sort = this.state.sort.field === field
          ? { field, dir: this.state.sort.dir === 'asc' ? 'desc' : 'asc' }
          : { field, dir: 'desc' };
        this.state.page = 0;
        saveState(this.notePath, this.state);
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
    const g   = row.createDiv('finance-filter-group');
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
    const g   = row.createDiv('finance-filter-group');
    g.createEl('label', { text: label, cls: 'finance-filter-label' });

    const listId = `ft-dl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const input = g.createEl('input', { type: 'text', cls: 'finance-filter-input' });
    input.setAttribute('list', listId);
    input.value = cur;

    const dl = g.createEl('datalist', { attr: { id: listId } });
    opts.forEach(({ v, l }) => {
      // Datalist works best when option value is the actual text
      dl.createEl('option', { value: v, text: v !== l ? l : '' });
    });

    input.addEventListener('change', () => onChange(input.value));
  }

  // ── Filtered data ─────────────────────────────────────────────────────────

  private getFiltered(): FinanceRecord[] {
    if (!this.data) return [];
    const { filter, sort } = this.state;
    const q = filter.search.toLowerCase();

    let rows = this.data.records.filter(r => {
      if (filter.type !== 'all' && r.type !== filter.type)   return false;
      if (filter.category && r.category !== filter.category) return false;
      if (filter.tag      && r.tag      !== filter.tag)      return false;
      if (filter.payer    && r.payer    !== filter.payer)    return false;
      if (filter.dateFrom && r.date < filter.dateFrom)       return false;
      if (filter.dateTo   && r.date > filter.dateTo)         return false;
      if (q) {
        const hay = [r.category, r.tag, r.payer, r.note, String(r.amount)].join(' ').toLowerCase();
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

  // ── Table ─────────────────────────────────────────────────────────────────

  private renderTable(): void {
    if (!this.tableEl || !this.paginationEl) return;
    this.tableEl.empty();
    this.paginationEl.empty();

    const filtered   = this.getFiltered();
    const { pageSize } = this.state;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page       = Math.max(0, Math.min(this.state.page, totalPages - 1));
    this.state.page  = page;
    const start      = page * pageSize;
    const pageRows   = filtered.slice(start, start + pageSize);
    const cur        = this.data?.currency || this.settings.defaultCurrency;

    // Update analytics if open
    if (this.analyticsOpen && this.analyticsView) {
      this.analyticsView.update(filtered, cur);
    }

    // Empty state
    if (!filtered.length) {
      const e = this.tableEl.createDiv('finance-empty-state');
      e.createEl('div', { text: '📊', cls: 'finance-empty-icon' });
      e.createEl('p',   { text: 'Записей не найдено', cls: 'finance-empty-title' });
      e.createEl('p',   {
        text: this.data?.records.length ? 'Попробуйте изменить фильтры' : 'Нажмите «Доход» или «Расход»',
        cls: 'finance-empty-sub',
      });
      return;
    }

    // ── Info bar (count + filtered sums + page size) ──────────────────────
    const infoBar = this.tableEl.createDiv('finance-table-info-bar');

    const metaLeft = infoBar.createDiv('finance-table-meta');
    metaLeft.createEl('span', {
      text: `${start + 1}–${Math.min(start + pageSize, filtered.length)} из ${filtered.length}`,
      cls: 'finance-count-text',
    });

    const fi  = filtered.filter(r => r.type === 'income' ).reduce((s, r) => s + r.amount, 0);
    const fe  = filtered.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const sums = infoBar.createDiv('finance-table-sums');
    sums.createEl('span', { text: `↑\u00a0${fmt(fi, cur)}`, cls: 'finance-sum-income'  });
    sums.createEl('span', { text: '·', cls: 'finance-sum-sep' });
    sums.createEl('span', { text: `↓\u00a0${fmt(fe, cur)}`, cls: 'finance-sum-expense' });

    // ── Table ─────────────────────────────────────────────────────────────
    const cols = [
      { key: 'date',     label: 'Дата / Время' },
      { key: 'type',     label: 'Тип' },
      { key: 'amount',   label: 'Сумма' },
      { key: 'category', label: 'Категория' },
      { key: 'tag',      label: 'Тег' },
      { key: 'payer',    label: 'Плательщик' },
      { key: 'note',     label: 'Примечание' },
      { key: '_act',     label: '' },
    ];

    const scroll = this.tableEl.createDiv('finance-table-scroll');
    const table  = scroll.createEl('table', { cls: 'finance-table' });

    const hRow = table.createEl('thead').createEl('tr');
    cols.forEach(c => hRow.createEl('th', { text: c.label, cls: 'finance-th' }));

    const tbody = table.createEl('tbody');
    const frag  = document.createDocumentFragment();

    pageRows.forEach(rec => {
      const tr = document.createElement('tr');
      tr.classList.add('finance-tr', rec.type === 'income' ? 'finance-row-income' : 'finance-row-expense');

      const cells = [
        { key: 'date',     text: fmtDate(rec.date, rec.time), cls: 'finance-td-date' },
        { key: 'type',     text: rec.type === 'income' ? '↑ Доход' : '↓ Расход',
          cls: rec.type === 'income' ? 'finance-type-income' : 'finance-type-expense' },
        { key: 'amount',   text: (rec.type === 'income' ? '+' : '−') + fmt(rec.amount, cur),
          cls: 'finance-amount-cell ' + (rec.type === 'income' ? 'finance-amount-income' : 'finance-amount-expense') },
        { key: 'category', text: rec.category || '—', cls: '' },
        { key: 'tag',      text: rec.tag      || '—', cls: 'finance-td-muted' },
        { key: 'payer',    text: rec.payer    || '—', cls: '' },
        { key: 'note',     text: rec.note     || '—', cls: 'finance-note-cell' },
      ];

      cells.forEach(c => {
        const td = document.createElement('td');
        td.classList.add('finance-td');
        if (c.cls) c.cls.split(' ').filter(Boolean).forEach(x => td.classList.add(x));
        td.setAttribute('data-label', cols.find(co => co.key === c.key)?.label ?? '');
        td.textContent = c.text;
        tr.appendChild(td);
      });

      // Actions
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
    if (totalPages > 1) this.renderPagination(totalPages, page);
  }

  private mkActionBtn(parent: HTMLElement, icon: string, title: string, onClick: () => void, extraCls = ''): void {
    const btn = document.createElement('button');
    btn.classList.add('finance-action-btn');
    if (extraCls) btn.classList.add(extraCls);
    btn.title       = title;
    btn.textContent = icon;
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  private renderPagination(totalPages: number, current: number): void {
    if (!this.paginationEl) return;
    const nav = this.paginationEl.createDiv('finance-pagination-nav');

    const prev = nav.createEl('button', { cls: 'finance-page-btn', text: '← Пред' });
    prev.disabled = current === 0;
    prev.addEventListener('click', () => { this.state.page = current - 1; this.renderTable(); });

    this.pageRange(current, totalPages).forEach(p => {
      if (p === -1) { nav.createEl('span', { text: '…', cls: 'finance-page-ellipsis' }); return; }
      const btn = nav.createEl('button', {
        text: String(p + 1),
        cls:  `finance-page-btn${p === current ? ' active' : ''}`,
      });
      btn.addEventListener('click', () => { this.state.page = p; this.renderTable(); });
    });

    const next = nav.createEl('button', { cls: 'finance-page-btn', text: 'След →' });
    next.disabled = current >= totalPages - 1;
    next.addEventListener('click', () => { this.state.page = current + 1; this.renderTable(); });
  }

  private pageRange(cur: number, total: number): number[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i);
    const p: number[] = [0];
    if (cur > 2) p.push(-1);
    for (let i = Math.max(1, cur - 1); i <= Math.min(total - 2, cur + 1); i++) p.push(i);
    if (cur < total - 3) p.push(-1);
    p.push(total - 1);
    return p;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private openAddModal(type: 'income' | 'expense'): void {
    if (!this.data) { new Notice('⏳ Загрузка…'); return; }
    const cur = this.data.currency || this.settings.defaultCurrency;
    new RecordModal(this.app, {
      initial: { type }, records: this.data.records,
      categories: this.data.categories, tags: this.data.tags, payers: this.data.payers,
      currency: cur, settings: this.settings,
      onSave: async rec => {
        await this.storage.addRecord(this.notePath, rec);
        this.data = await this.storage.load(this.notePath);
        this.renderStats(); this.renderFilters(); this.renderTable();
        new Notice('✅ Запись добавлена');
      },
    }).open();
  }

  private openEditModal(rec: FinanceRecord): void {
    if (!this.data) return;
    const cur = this.data.currency || this.settings.defaultCurrency;
    new RecordModal(this.app, {
      initial: { ...rec }, records: this.data.records.filter(r => r.id !== rec.id),
      categories: this.data.categories, tags: this.data.tags, payers: this.data.payers,
      currency: cur, settings: this.settings,
      onSave: async updated => {
        await this.storage.updateRecord(this.notePath, updated);
        this.data = await this.storage.load(this.notePath);
        this.renderStats(); this.renderTable();
        new Notice('✅ Запись обновлена');
      },
    }).open();
  }

  private confirmDelete(rec: FinanceRecord): void {
    const cur   = this.data?.currency ?? this.settings.defaultCurrency;
    const label = `${rec.type === 'income' ? '+' : '−'}${fmt(rec.amount, cur)}  ·  ${rec.category || '—'}  ·  ${fmtDate(rec.date, rec.time)}`;
    new ConfirmModal(this.app, `Удалить запись?\n${label}`, async () => {
      await this.storage.deleteRecord(this.notePath, rec.id);
      this.data = await this.storage.load(this.notePath);
      this.renderStats(); this.renderTable();
      new Notice('🗑️ Удалено');
    }).open();
  }

  private openAttachment(rec: FinanceRecord): void {
    const f = this.app.vault.getAbstractFileByPath(rec.attachmentPath);
    if (f instanceof TFile) this.app.workspace.getLeaf(false).openFile(f);
    else new Notice(`⚠️ Файл не найден: ${rec.attachmentPath}`);
  }

  private openIEModal(): void {
    if (!this.data) { new Notice('⏳ Загрузка…'); return; }
    new ImportExportModal(this.app, {
      noteName: this.data.name || noteFilename(this.notePath),
      currency: this.data.currency || this.settings.defaultCurrency,
      records:  this.data.records,
      onImport: async recs => {
        await this.storage.importRecords(this.notePath, recs);
        this.data = await this.storage.load(this.notePath);
        this.renderStats(); this.renderFilters(); this.renderTable();
      },
    }).open();
  }

  private resetPage(): void {
    this.state.page = 0;
    saveState(this.notePath, this.state);
    this.renderTable();
    if (this.analyticsOpen) this.renderAnalytics();
  }
}
