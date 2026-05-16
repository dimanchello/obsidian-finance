import { App, Notice, Platform, TFile } from 'obsidian';
import { FinanceStorage }       from './storage';
import {
  AccountData, DebtMovement, DebtRecord, FinanceRecord,
  PluginSettings, DEFAULT_FILTER, DEFAULT_SORT, DEFAULT_DEBT_FILTER, COMMON_CURRENCIES,
  SortField, ViewState, DebtSortField,
} from './types';
import { RecordModal }       from './RecordModal';
import { ConfirmModal }      from './ConfirmModal';
import { ImportExportModal } from './ImportExportModal';
import { AnalyticsView }     from './AnalyticsView';
import { DebtModal }         from './DebtModal';
import { DebtMovementModal } from './DebtMovementModal';

// ── state persistence ─────────────────────────────────────────────────────────

const LS = 'ft-view:';

function loadState(np: string, pageSize: number): ViewState {
  try {
    const raw = localStorage.getItem(LS + np);
    if (raw) {
      const v = JSON.parse(raw) as ViewState;
      v.page = 0;
      if (!v.debtFilter) v.debtFilter = { ...DEFAULT_DEBT_FILTER };
      if (!v.debtSort) v.debtSort = { field: 'createdAt', dir: 'desc' };
      if (typeof v.debtPage !== 'number') v.debtPage = 0;
      return v;
    }
  } catch { /* ignore */ }
  return {
    sort: { ...DEFAULT_SORT },
    filter: { ...DEFAULT_FILTER },
    debtSort: { field: 'createdAt', dir: 'desc' },
    debtFilter: { ...DEFAULT_DEBT_FILTER },
    page: 0,
    debtPage: 0,
    pageSize
  };
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
  private debtPaginationEl?: HTMLElement;
  private analyticsEl?:  HTMLElement;
  private analyticsView: AnalyticsView | null = null;
  private analyticsOpen  = false;
  private settingsOpen   = false;
  private settingsEl?:   HTMLElement;
  private filterDebounce: ReturnType<typeof setTimeout> | null = null;
  private mode: 'records' | 'debts' = 'records';
  private isMobile = false;
  private fabEl?: HTMLElement;

  constructor(app: App, root: HTMLElement, notePath: string, storage: FinanceStorage, settings: PluginSettings) {
    this.app = app; this.root = root; this.notePath = notePath;
    this.storage = storage; this.settings = settings;
    this.state = loadState(notePath, settings.defaultPageSize);
  }

  async render(): Promise<void> {
    this.root.empty();
    this.root.addClass('finance-tracker');

    // Detect mobile — Obsidian Platform or narrow viewport
    this.isMobile = Platform.isMobile || window.innerWidth <= 480;
    if (this.isMobile) this.root.addClass('finance-tracker--mobile');

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

    // Apply accent color
    if (this.data.accentColor) {
      this.applyAccentColor(this.data.accentColor);
    }

    // ── Phase 3: full render ─────────────────────────────────────────────
    body.empty();
    this.renderBodyContent();
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
    incBtn.innerHTML = this.isMobile
      ? '<span class="btn-icon">↑</span><span>Доход</span>'
      : '<span class="btn-icon">↑</span><span>Доход</span>';

    const expBtn = right.createEl('button', { cls: 'finance-add-btn finance-expense-btn' });
    expBtn.innerHTML = this.isMobile
      ? '<span class="btn-icon">↓</span><span>Расход</span>'
      : '<span class="btn-icon">↓</span><span>Расход</span>';

    const debtBtn = right.createEl('button', { cls: 'finance-add-btn finance-debt-btn' });
    debtBtn.innerHTML = this.isMobile ? '💳 Долги' : '💳 Долги';

    incBtn.addEventListener('click', () => { this.mode = 'records'; this.renderBodyContent(); this.openAddModal('income'); });
    expBtn.addEventListener('click', () => { this.mode = 'records'; this.renderBodyContent(); this.openAddModal('expense'); });
    debtBtn.addEventListener('click', () => {
      this.mode = this.mode === 'debts' ? 'records' : 'debts';
      this.updateHeaderButtons();
      this.renderBodyContent();
    });
  }

  private updateHeaderButtons(): void {
    const debtBtn = this.root.querySelector('.finance-debt-btn') as HTMLElement | null;
    if (debtBtn) {
      debtBtn.style.border = this.mode === 'debts'
        ? '2px solid var(--color-accent, #7c3aed)'
        : '2px solid transparent';
    }
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
    const recs  = this.data.records;
    const cur   = this.data.currency || this.settings.defaultCurrency;
    const inc   = recs.filter(r => r.type === 'income' ).reduce((s, r) => s + r.amount, 0);
    const exp   = recs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const debtTotal = this.data.debts.reduce((s, d) => s + d.amount, 0);
    const bal   = inc - exp - debtTotal;

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

    // Row 1: search / type / category
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

    // Row 2: dates / payer / tag / page size / reset
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

    this.mkSearchSelect(row2, 'Тег',
      [{ v:'',l:'Все' }, ...this.data.tags.map(t => ({ v:t,l:t }))],
      f.tag, v => { this.state.filter.tag = v; this.resetPage(); });

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
    const g = row.createDiv('finance-filter-group');
    g.createEl('label', { text: label, cls: 'finance-filter-label' });

    const wrapper = g.createDiv('finance-custom-select');
    let selectedValue = cur;

    const trigger = wrapper.createDiv('finance-custom-select-trigger');
    trigger.setAttribute('tabindex', '0');
    const triggerText = trigger.createEl('span', { cls: 'finance-custom-select-text' });
    triggerText.textContent = opts.find(o => o.v === cur)?.l || cur || opts[0]?.l || '—';

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

    // Defined before openDropdown so both can reference each other safely
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
      setTimeout(() => searchInput.focus(), 20);

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

  private getFilteredDebts(): DebtRecord[] {
    if (!this.data) return [];
    const f = this.state.debtFilter || DEFAULT_DEBT_FILTER;
    const s = this.state.debtSort || { field: 'createdAt' as DebtSortField, dir: 'desc' };
    const q = f.search.toLowerCase();

    const repaid = (d: DebtRecord) =>
      d.movements.filter(m => m.type === 'repay').reduce((ss, m) => ss + m.amount, 0);
    const isPaidOff = (d: DebtRecord) => repaid(d) >= d.amount;

    let rows = this.data.debts.filter(d => {
      const dir = (d.direction as string) || 'borrowed';
      if (f.status === 'paid' && !isPaidOff(d)) return false;
      if (f.status === 'unpaid' && isPaidOff(d)) return false;
      if (f.direction !== 'all' && dir !== f.direction) return false;
      if (f.dateFrom && d.date < f.dateFrom) return false;
      if (f.dateTo && d.date > f.dateTo) return false;
      if (f.person && !d.person.toLowerCase().includes(f.person.toLowerCase())) return false;
      if (q) {
        const hay = [d.person, d.note, String(d.amount)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    rows = rows.slice().sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (s.field) {
        case 'date': av = a.date; bv = b.date; break;
        case 'amount': av = a.amount; bv = b.amount; break;
        case 'person': av = a.person; bv = b.person; break;
        default: av = a.createdAt; bv = b.createdAt;
      }
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'ru');
      return s.dir === 'asc' ? cmp : -cmp;
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

    // ── Table (ПК) или блоки (мобильные) ─────────────────────────────────
    if (this.isMobile) {
      this.renderRecordsAsBlocks(pageRows, cur);
    } else {
      this.renderRecordsAsTable(pageRows, cur, cols);
    }
    if (totalPages > 1) this.renderPagination(totalPages, page);
  }

  private renderRecordsAsBlocks(pageRows: FinanceRecord[], cur: string): void {
    if (!this.tableEl) return;
    const list = this.tableEl.createDiv('finance-records-list');
    const frag = document.createDocumentFragment();

    pageRows.forEach(rec => {
      const block = document.createElement('div');
      block.classList.add('finance-record-block', rec.type === 'income' ? 'finance-row-income' : 'finance-row-expense');

      const header = block.createDiv('finance-record-header');
      const amount = (rec.type === 'income' ? '+' : '−') + fmt(rec.amount, cur);
      header.createEl('span', {
        text: amount,
        cls: 'finance-record-amount ' + (rec.type === 'income' ? 'finance-amount-income' : 'finance-amount-expense'),
      });
      header.createEl('span', { text: fmtDate(rec.date, rec.time), cls: 'finance-record-date' });

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

  private renderRecordsAsTable(pageRows: FinanceRecord[], cur: string, cols: { key: string; label: string }[]): void {
    if (!this.tableEl) return;
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
    btn.title       = title;
    btn.textContent = icon;
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
  }

  // ── Debt Filters ───────────────────────────────────────────────────────────

  private renderDebtFilters(body: HTMLElement): void {
    const f = this.state.debtFilter || DEFAULT_DEBT_FILTER;

    const filtersContainer = body.createDiv('finance-filters-container');

    const row1 = filtersContainer.createDiv('finance-filters-row');

    const sg = row1.createDiv('finance-filter-group finance-filter-search');
    sg.createEl('label', { text: 'Поиск', cls: 'finance-filter-label' });
    const si = sg.createEl('input', {
      type: 'text', cls: 'finance-filter-input', placeholder: 'Поиск по всем полям…',
    });
    si.value = f.search;
    si.addEventListener('input', () => {
      if (this.filterDebounce) clearTimeout(this.filterDebounce);
      this.filterDebounce = setTimeout(() => {
        this.state.debtFilter!.search = si.value;
        this.resetDebtPage();
      }, 280);
    });

    const statusG = row1.createDiv('finance-filter-group');
    statusG.createEl('label', { text: 'Статус', cls: 'finance-filter-label' });
    const statusSel = statusG.createEl('select', { cls: 'finance-filter-select' });
    [
      { v: 'all', l: 'Все' },
      { v: 'unpaid', l: 'Не погашены' },
      { v: 'paid', l: 'Погашены' },
    ].forEach(({ v, l }) => {
      const o = statusSel.createEl('option', { text: l });
      o.value = v;
      o.selected = v === f.status;
    });
    statusSel.addEventListener('change', () => {
      this.state.debtFilter!.status = statusSel.value as 'all' | 'paid' | 'unpaid';
      this.resetDebtPage();
    });

    const dirG = row1.createDiv('finance-filter-group');
    dirG.createEl('label', { text: 'Направление', cls: 'finance-filter-label' });
    const dirSel = dirG.createEl('select', { cls: 'finance-filter-select' });
    [
      { v: 'all', l: 'Все' },
      { v: 'lent', l: '💸 Мне должны' },
      { v: 'borrowed', l: '💳 Я должен' },
    ].forEach(({ v, l }) => {
      const o = dirSel.createEl('option', { text: l });
      o.value = v;
      o.selected = v === f.direction;
    });
    dirSel.addEventListener('change', () => {
      this.state.debtFilter!.direction = dirSel.value as 'all' | 'lent' | 'borrowed';
      this.resetDebtPage();
    });

    const row2 = filtersContainer.createDiv('finance-filters-row');

    const dfG = row2.createDiv('finance-filter-group');
    dfG.createEl('label', { text: 'С', cls: 'finance-filter-label' });
    const dfI = dfG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dfI.value = f.dateFrom;
    dfI.addEventListener('change', () => {
      this.state.debtFilter!.dateFrom = dfI.value;
      this.resetDebtPage();
    });

    const dtG = row2.createDiv('finance-filter-group');
    dtG.createEl('label', { text: 'По', cls: 'finance-filter-label' });
    const dtI = dtG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    dtI.value = f.dateTo;
    dtI.addEventListener('change', () => {
      this.state.debtFilter!.dateTo = dtI.value;
      this.resetDebtPage();
    });

    const allPersons = this.data ? [...new Set(this.data.debts.map(d => d.person).filter(Boolean))] : [];
    const personOpts = [{ v: '', l: 'Все' }, ...allPersons.map(p => ({ v: p, l: p }))];
    this.mkSearchSelect(row2, 'Кому', personOpts, f.person, (v) => {
      this.state.debtFilter!.person = v;
      this.resetDebtPage();
    });

    const rG = row2.createDiv('finance-filter-group finance-filter-reset');
    rG.createEl('label', { text: '\u00A0', cls: 'finance-filter-label' });
    rG.createEl('button', { text: '✕ Сбросить', cls: 'finance-reset-btn' })
      .addEventListener('click', () => {
        this.state.debtFilter = { ...DEFAULT_DEBT_FILTER };
        this.resetDebtPage();
      });

    const sortRow = filtersContainer.createDiv('finance-sort-row');
    sortRow.createEl('span', { text: 'Сортировка:', cls: 'finance-sort-label' });

    const sortFields: { field: DebtSortField; label: string }[] = [
      { field: 'createdAt', label: 'Добавлена' },
      { field: 'date', label: 'Дата' },
      { field: 'amount', label: 'Сумма' },
      { field: 'person', label: 'Кому' },
    ];
    const s = this.state.debtSort || { field: 'createdAt' as DebtSortField, dir: 'desc' };
    sortFields.forEach(({ field, label }) => {
      const active = s.field === field;
      const btn = sortRow.createEl('button', {
        cls: `finance-sort-btn${active ? ' active' : ''}`,
        text: label + (active ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''),
      });
      btn.addEventListener('click', () => {
        this.state.debtSort = s.field === field
          ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
          : { field, dir: 'desc' };
        this.saveDebtState();
        this.renderBodyContent();
      });
    });
  }

  private saveDebtState(): void {
    saveState(this.notePath, this.state);
  }

  private getDebtRepaid(debt: DebtRecord): number {
    return debt.movements
      .filter(m => m.type === 'repay')
      .reduce((s, m) => s + m.amount, 0);
  }

  private isDebtPaidOff(debt: DebtRecord): boolean {
    return this.getDebtRepaid(debt) >= debt.amount;
  }

  private getDebtOriginal(debt: DebtRecord): number {
    return debt.movements
      .filter(m => m.type === 'borrow')
      .reduce((s, m) => s + m.amount, 0);
  }

  private getDebtRemaining(debt: DebtRecord): number {
    const original = this.getDebtOriginal(debt);
    const repaid = this.getDebtRepaid(debt);
    return Math.max(0, original - repaid);
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  private renderPagination(
    totalPages: number,
    current: number,
    target: 'records' | 'debts' = 'records',
  ): void {
    const host = target === 'debts' ? this.debtPaginationEl : this.paginationEl;
    if (!host) return;
    const nav = host.createDiv('finance-pagination-nav');

    const go = (page: number) => {
      if (target === 'debts') {
        this.state.debtPage = page;
        saveState(this.notePath, this.state);
        this.renderBodyContent();
      } else {
        this.state.page = page;
        this.renderTable();
      }
    };

    const prev = nav.createEl('button', { cls: 'finance-page-btn', text: '←' });
    prev.disabled = current === 0;
    prev.addEventListener('click', () => go(current - 1));

    this.pageRange(current, totalPages).forEach(p => {
      if (p === -1) { nav.createEl('span', { text: '…', cls: 'finance-page-ellipsis' }); return; }
      const btn = nav.createEl('button', {
        text: String(p + 1),
        cls:  `finance-page-btn${p === current ? ' active' : ''}`,
      });
      btn.addEventListener('click', () => go(p));
    });

    const next = nav.createEl('button', { cls: 'finance-page-btn', text: '→' });
    next.disabled = current >= totalPages - 1;
    next.addEventListener('click', () => go(current + 1));
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

  private openIEModal(defaultTab?: 'export' | 'import'): void {
    if (!this.data) { new Notice('⏳ Загрузка…'); return; }
    const modal = new ImportExportModal(this.app, {
      noteName: this.data.name || noteFilename(this.notePath),
      currency: this.data.currency || this.settings.defaultCurrency,
      records:  this.data.records,
      onImport: async recs => {
        await this.storage.importRecords(this.notePath, recs);
        this.data = await this.storage.load(this.notePath);
        this.renderStats(); this.renderFilters(); this.renderTable();
      },
    });
    if (defaultTab) modal.switchTo(defaultTab);
    modal.open();
  }

  private resetPage(): void {
    this.state.page = 0;
    saveState(this.notePath, this.state);
    this.renderTable();
    if (this.analyticsOpen) this.renderAnalytics();
  }

  private resetDebtPage(): void {
    this.state.debtPage = 0;
    saveState(this.notePath, this.state);
    this.renderBodyContent();
  }

  // ── View switching ───────────────────────────────────────────────────────

  private renderBodyContent(): void {
    if (!this.data) return;
    const body = this.root.querySelector('.finance-body') as HTMLElement;
    if (!body) return;
    body.empty();

    // Remove old FAB if any
    this.fabEl?.remove();
    this.fabEl = undefined;

    this.statsEl = body.createDiv('finance-stats-container');
    this.renderStats();

    if (this.mode === 'debts') {
      this.renderDebtsView(body);
    } else {
      this.analyticsView = null;
      this.analyticsOpen = false;
      this.renderRecordsView(body);
    }
  }

  private renderRecordsView(body: HTMLElement): void {
    const toggleRow = body.createDiv('finance-analytics-toggle-row');
    const analBtn = toggleRow.createEl('button', {
      cls:  'finance-analytics-toggle-btn',
      text: '📈 Аналитика ▼',
    });
    const setBtn = toggleRow.createEl('button', {
      cls:  'finance-analytics-toggle-btn',
      text: '⚙️ Настройки',
    });
    setBtn.style.marginLeft = '8px';

    this.analyticsEl = body.createDiv('finance-analytics-panel');
    this.analyticsEl.style.display = 'none';

    this.settingsEl = body.createDiv('finance-analytics-panel');
    this.settingsEl.style.display = 'none';

    analBtn.addEventListener('click', () => {
      this.analyticsOpen = !this.analyticsOpen;
      this.analyticsEl!.style.display = this.analyticsOpen ? 'block' : 'none';
      analBtn.textContent = `📈 Аналитика ${this.analyticsOpen ? '▲' : '▼'}`;
      if (this.analyticsOpen) this.renderAnalytics();
    });

    setBtn.addEventListener('click', () => {
      this.settingsOpen = !this.settingsOpen;
      this.settingsEl!.style.display = this.settingsOpen ? 'block' : 'none';
      setBtn.textContent = `⚙️ Настройки${this.settingsOpen ? ' ▲' : ''}`;
      if (this.settingsOpen) this.renderSettings();
    });

    this.filtersEl = body.createDiv('finance-filters-container');
    this.renderFilters();

    const tw         = body.createDiv('finance-table-wrapper');
    this.tableEl     = tw.createDiv('finance-table-container');
    this.paginationEl= tw.createDiv('finance-pagination');
    this.renderTable();
  }

  private renderSettings(): void {
    if (!this.settingsEl || !this.data) return;
    this.settingsEl.empty();
    this.settingsEl.addClass('finance-settings-panel');

    // Page size
    const psRow = this.settingsEl.createDiv('finance-settings-row finance-settings-row--page-size');
    const psG = psRow.createDiv('finance-settings-field finance-settings-field--page-size');
    psG.createEl('label', {
      text: 'Записей на странице',
      cls: 'finance-filter-label finance-settings-page-size-label',
    });
    const psSel = psG.createEl('select', { cls: 'finance-filter-select' });
    [10, 20, 25, 50, 100, 200, 500].forEach(n => {
      const o = psSel.createEl('option', { text: String(n) });
      o.value = String(n);
      o.selected = n === this.state.pageSize;
    });
    psSel.addEventListener('change', () => {
      this.state.pageSize = parseInt(psSel.value);
      this.state.page = 0;
      this.state.debtPage = 0;
      saveState(this.notePath, this.state);
      if (this.mode === 'debts') this.renderBodyContent();
      else this.renderTable();
    });

    // Accent color
    const acRow = this.settingsEl.createDiv('finance-settings-row');
    acRow.createEl('label', {
      text: 'Цвет акцента счёта',
      cls: 'finance-filter-label',
    });
    const acColorWrap = acRow.createDiv('finance-settings-color-wrap');
    const acIn = acColorWrap.createEl('input', { type: 'color', cls: 'finance-settings-color-input' });
    acIn.value = this.data.accentColor || '#7c3aed';
    const hexLabel = acColorWrap.createEl('span', {
      text: acIn.value,
      cls: 'finance-settings-hex',
    });
    acIn.addEventListener('input', async () => {
      hexLabel.textContent = acIn.value;
      await this.storage.updateMeta(this.notePath, { accentColor: acIn.value });
      this.data = await this.storage.load(this.notePath);
      this.applyAccentColor(acIn.value);
    });
    const resetColorBtn = acRow.createEl('button', {
      text: 'Сбросить',
      cls: 'finance-btn-cancel',
    });
    resetColorBtn.style.padding = '4px 12px';
    resetColorBtn.style.fontSize = '.8em';
    resetColorBtn.addEventListener('click', async () => {
      await this.storage.updateMeta(this.notePath, { accentColor: '' });
      this.data = await this.storage.load(this.notePath);
      this.applyAccentColor('');
      acIn.value = '#7c3aed';
      hexLabel.textContent = '#7c3aed';
    });

    // Import / Export
    const ieRow = this.settingsEl.createDiv('finance-settings-row');
    ieRow.style.borderTop = '1px solid var(--ft-border)';
    ieRow.style.paddingTop = '14px';
    ieRow.style.marginTop = '4px';
    ieRow.createEl('label', {
      text: 'Импорт / Экспорт',
      cls: 'finance-filter-label',
    });
    const ieBtns = ieRow.createDiv('finance-settings-ie-row');
    const expBtn = ieBtns.createEl('button', {
      cls: 'finance-add-btn finance-ie-btn',
      text: '📤 Экспорт',
    });
    const impBtn = ieBtns.createEl('button', {
      cls: 'finance-add-btn finance-ie-btn',
      text: '📥 Импорт',
    });
    expBtn.addEventListener('click', () => {
      this.openIEModal('export');
    });
    impBtn.addEventListener('click', () => {
      this.openIEModal('import');
    });

    // Danger zone - reset all data
    const dangerRow = this.settingsEl.createDiv('finance-settings-row');
    dangerRow.style.borderTop = '2px solid #dc2626';
    dangerRow.style.paddingTop = '16px';
    dangerRow.style.marginTop = '8px';
    dangerRow.createEl('label', {
      text: 'ОПАСНАЯ ЗОНА',
      cls: 'finance-danger-label',
    });

    const dangerDesc = this.settingsEl.createDiv('finance-danger-desc');
    dangerDesc.textContent = 'Введите "Yes" и нажмите кнопку ниже, чтобы удалить ВСЕ записи и долги безвозвратно.';

    const confirmRow = this.settingsEl.createDiv('finance-settings-row');
    confirmRow.style.flexDirection = 'column';
    confirmRow.style.alignItems = 'stretch';
    const confirmIn = confirmRow.createEl('input', {
      type: 'text',
      cls: 'finance-input',
      placeholder: 'Введите Yes для подтверждения',
    });
    confirmIn.style.borderColor = '#dc2626';

    const deleteBtn = confirmRow.createEl('button', {
      text: '🗑️ Удалить ВСЕ данные',
      cls: 'finance-btn-danger',
    });
    deleteBtn.style.marginTop = '8px';
    deleteBtn.addEventListener('click', async () => {
      if (confirmIn.value.trim() !== 'Yes') {
        new Notice('⚠️ Введите "Yes" для подтверждения');
        return;
      }
      await this.storage.resetAllData(this.notePath);
      this.data = await this.storage.load(this.notePath);
      this.renderStats();
      this.renderFilters();
      this.renderTable();
      new Notice('🗑️ Все данные удалены');
    });
  }

  private applyAccentColor(color: string): void {
    if (color) {
      this.root.style.setProperty('--ft-accent', color);
    } else {
      this.root.style.removeProperty('--ft-accent');
    }
  }

  // ── Debts view ──────────────────────────────────────────────────────────

  private renderDebtsView(body: HTMLElement): void {
    const cur = this.data?.currency || this.settings.defaultCurrency;
    const allDebts = this.data?.debts || [];

    if (!this.state.debtFilter) {
      this.state.debtFilter = { ...DEFAULT_DEBT_FILTER };
    }

    const filteredDebts = this.getFilteredDebts();

    // Summary - 2 cards for lent and borrowed
    const summary = body.createDiv('finance-stats-container');

    const lentDebts = allDebts.filter(d => d.direction === 'lent');
    const borrowedDebts = allDebts.filter(d => d.direction !== 'lent');

    const lentTotal = lentDebts.reduce((s, d) => s + this.getDebtOriginal(d), 0);
    const lentRepaid = lentDebts.reduce((s, d) => s + this.getDebtRepaid(d), 0);
    const lentRemaining = lentTotal - lentRepaid;

    const borrowedTotal = borrowedDebts.reduce((s, d) => s + this.getDebtOriginal(d), 0);
    const borrowedRepaid = borrowedDebts.reduce((s, d) => s + this.getDebtRepaid(d), 0);
    const borrowedRemaining = borrowedTotal - borrowedRepaid;

    const mkDebtCard = (title: string, icon: string, total: number, remaining: number, count: number, isLent: boolean) => {
      const card = summary.createDiv(`finance-stat-card finance-stat-${isLent ? 'lent-summary' : 'borrowed-summary'}`);
      const header = card.createDiv('finance-debt-summary-header');
      header.createEl('span', { text: icon, cls: 'finance-debt-summary-icon' });
      header.createEl('span', { text: title, cls: 'finance-debt-summary-title' });

      const content = card.createDiv('finance-debt-summary-content');
      content.createEl('div', {
        text: remaining > 0 ? fmt(remaining, cur) : '—',
        cls: 'finance-debt-summary-main',
      });
      content.createEl('div', {
        text: `${count} ${count === 1 ? 'долг' : count < 5 ? 'долга' : 'долгов'}`,
        cls: 'finance-debt-summary-sub',
      });
    };

    mkDebtCard('Мне должны', '💸', lentTotal, lentRemaining, lentDebts.length, true);
    mkDebtCard('Я должен', '💳', borrowedTotal, borrowedRemaining, borrowedDebts.length, false);

    // Debt buttons header
    const toolbar = body.createDiv('finance-debt-toolbar');
    const newDebtBtn = toolbar.createEl('button', { cls: 'finance-add-btn finance-expense-btn' });
    newDebtBtn.innerHTML = '<span class="btn-icon">＋</span><span>Новый долг</span>';
    newDebtBtn.addEventListener('click', () => this.openNewDebtModal());

    // Filters for debts
    this.renderDebtFilters(body);

    if (!allDebts.length) {
      const e = body.createDiv('finance-empty-state');
      e.createEl('div', { text: '💳', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Нет долгов', cls: 'finance-empty-title' });
      e.createEl('p', { text: 'Нажмите «Новый долг»', cls: 'finance-empty-sub' });
      return;
    }

    if (!filteredDebts.length) {
      const e = body.createDiv('finance-empty-state');
      e.createEl('div', { text: '🔍', cls: 'finance-empty-icon' });
      e.createEl('p', { text: 'Долгов не найдено', cls: 'finance-empty-title' });
      e.createEl('p', { text: 'Попробуйте изменить фильтры', cls: 'finance-empty-sub' });
      return;
    }

    const tw = body.createDiv('finance-table-wrapper');
    this.renderDebtsList(tw, filteredDebts, cur);
  }

  private renderDebtsList(wrapper: HTMLElement, filteredDebts: DebtRecord[], cur: string): void {
    wrapper.empty();
    this.debtPaginationEl = undefined;

    const container = wrapper.createDiv('finance-table-container');
    this.debtPaginationEl = wrapper.createDiv('finance-pagination');

    const { pageSize } = this.state;
    const totalPages = Math.max(1, Math.ceil(filteredDebts.length / pageSize));
    const page = Math.max(0, Math.min(this.state.debtPage ?? 0, totalPages - 1));
    this.state.debtPage = page;
    const start = page * pageSize;
    const pageDebts = filteredDebts.slice(start, start + pageSize);

    const infoBar = container.createDiv('finance-table-info-bar');
    const metaLeft = infoBar.createDiv('finance-table-meta');
    metaLeft.createEl('span', {
      text: `${start + 1}–${Math.min(start + pageSize, filteredDebts.length)} из ${filteredDebts.length}`,
      cls: 'finance-count-text',
    });

    if (this.isMobile) {
      this.renderDebtsAsBlocks(container, pageDebts, cur);
    } else {
      this.renderDebtsAsTable(container, pageDebts, cur);
    }

    if (totalPages > 1) this.renderPagination(totalPages, page, 'debts');
  }

  private renderDebtMovementsPanel(parent: HTMLElement, debt: DebtRecord, cur: string): void {
    const movPanel = parent.createDiv('finance-mov-panel');
    movPanel.createEl('div', { text: 'История операций', cls: 'finance-mov-panel-title' });

    if (!debt.movements.length) {
      movPanel.createEl('span', { text: 'Нет движений', cls: 'finance-mov-empty' });
      return;
    }

    const movTable = movPanel.createEl('table', { cls: 'finance-mov-table' });
    const movHead = movTable.createEl('thead').createEl('tr');
    ['Тип', 'Сумма', 'Дата', 'Примечание'].forEach(l => {
      movHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' });
    });
    const movBody = movTable.createEl('tbody');
    const isLent = debt.direction === 'lent';
    debt.movements.forEach(m => {
      const mr = movBody.createEl('tr', { cls: `finance-mov-${m.type}` });
      const typeLabel = m.type === 'borrow'
        ? (isLent ? '➕ Дал ещё' : '➕ Взял ещё')
        : (isLent ? '💰 Вернули' : '💰 Погашение');
      mr.createEl('td', { text: typeLabel, cls: 'finance-td' });
      mr.createEl('td', {
        text: (m.type === 'borrow' ? '−' : '+') + fmt(m.amount, cur),
        cls: `finance-td finance-td-mov-${m.type}`,
      });
      mr.createEl('td', { text: fmtDate(m.date, m.time), cls: 'finance-td' });
      mr.createEl('td', { text: m.note || '—', cls: 'finance-td' });
    });
  }

  private renderDebtsAsBlocks(container: HTMLElement, pageDebts: DebtRecord[], cur: string): void {
    const list = container.createDiv('finance-debts-list');
    const frag = document.createDocumentFragment();

    pageDebts.forEach(debt => {
      const dir = (debt.direction as string) || 'borrowed';
      const block = document.createElement('div');
      block.classList.add('finance-debt-block');
      block.classList.add(dir === 'lent' ? 'finance-debt-lent' : 'finance-debt-borrowed');
      if (this.isDebtPaidOff(debt)) {
        block.classList.add('finance-debt-paid');
      } else {
        block.classList.add('finance-debt-unpaid');
      }

      const header = block.createDiv('finance-debt-header');
      header.createEl('span', { text: debt.person || '—', cls: 'finance-debt-person' });
      header.createEl('span', {
        text: dir === 'lent' ? '💸 Мне должны' : '💳 Я должен',
        cls: 'finance-debt-direction ' + (dir === 'lent' ? 'finance-dir-lent' : 'finance-dir-borrowed'),
      });

      const amounts = block.createDiv('finance-debt-amounts');
      const original = this.getDebtOriginal(debt);
      const remaining = this.getDebtRemaining(debt);

      const amtOrig = amounts.createDiv('finance-debt-amount');
      amtOrig.createEl('span', { text: 'Сумма', cls: 'finance-debt-amount-label' });
      amtOrig.createEl('span', { text: fmt(original, cur), cls: 'finance-debt-amount-value' });

      if (remaining > 0) {
        const amtRem = amounts.createDiv('finance-debt-amount');
        amtRem.createEl('span', { text: 'Остаток', cls: 'finance-debt-amount-label' });
        amtRem.createEl('span', { text: fmt(remaining, cur), cls: 'finance-debt-amount-value finance-debt-remaining' });
      }

      if (debt.dueDate) {
        block.createEl('div', { text: `📅 до ${fmtDate(debt.dueDate)}`, cls: 'finance-debt-due-date' });
      }

      if (debt.note) {
        block.createEl('div', { text: debt.note, cls: 'finance-debt-note' });
      }

      const historyToggle = block.createEl('button', {
        cls: 'finance-debt-history-toggle',
        text: `📋 История операций (${debt.movements.length}) ▼`,
      });
      const historyWrap = block.createDiv('finance-debt-history-panel');
      this.renderDebtMovementsPanel(historyWrap, debt, cur);

      historyToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !historyWrap.hasClass('finance-debt-history-open');
        historyWrap.toggleClass('finance-debt-history-open', open);
        block.toggleClass('finance-debt-block-expanded', open);
        historyToggle.textContent = open
          ? `📋 История операций (${debt.movements.length}) ▲`
          : `📋 История операций (${debt.movements.length}) ▼`;
      });

      const actions = block.createDiv('finance-debt-block-actions');
      this.mkActionBtn(actions, '💰', 'Погасить', () => this.openRepayModal(debt));
      this.mkActionBtn(actions, '➕', 'Взять ещё', () => this.openBorrowMoreModal(debt));
      this.mkActionBtn(actions, '✏️', 'Редактировать', () => this.openEditDebtModal(debt));
      this.mkActionBtn(actions, '🗑️', 'Удалить', () => this.confirmDeleteDebt(debt), 'finance-delete-btn');

      frag.appendChild(block);
    });

    list.appendChild(frag);
  }

  private renderDebtsAsTable(container: HTMLElement, pageDebts: DebtRecord[], cur: string): void {
    const scroll = container.createDiv('finance-debt-table-scroll');
    const table = scroll.createEl('table', { cls: 'finance-debt-table' });

    const cols = [
      { key: 'direction', label: 'Тип' },
      { key: 'person',    label: 'Кому' },
      { key: 'original',  label: 'Сумма' },
      { key: 'remaining', label: 'Остаток' },
      { key: 'date',      label: 'Создан' },
      { key: 'dueDate',   label: 'Вернуть до' },
      { key: 'note',      label: 'Примечание' },
      { key: '_act',      label: '' },
    ];

    const hRow = table.createEl('thead').createEl('tr');
    cols.forEach(c => hRow.createEl('th', { text: c.label, cls: 'finance-th' }));

    const tbody = table.createEl('tbody');
    const frag = document.createDocumentFragment();

    pageDebts.forEach(debt => {
      const tr = document.createElement('tr');
      tr.classList.add('finance-tr', 'finance-debt-row');
      const dir = (debt.direction as string) || 'borrowed';
      if (dir === 'lent') {
        tr.classList.add('finance-debt-lent');
      } else {
        tr.classList.add('finance-debt-borrowed');
      }
      if (this.isDebtPaidOff(debt)) {
        tr.classList.add('finance-debt-paid');
      } else {
        tr.classList.add('finance-debt-unpaid');
      }

      const dirText = dir === 'lent' ? '💸 Мне должны' : '💳 Я должен';
      const dirCls = dir === 'lent' ? 'finance-dir-lent' : 'finance-dir-borrowed';
      const original = this.getDebtOriginal(debt);
      const remaining = this.getDebtRemaining(debt);
      const dueDateText = debt.dueDate ? fmtDate(debt.dueDate) : '—';
      const dueDateCls = debt.dueDate ? 'finance-due-date' : '';
      const cells: { key: string; text: string; cls?: string }[] = [
        { key: 'direction', text: dirText, cls: dirCls },
        { key: 'person',    text: debt.person || '—' },
        { key: 'original',  text: fmt(original, cur), cls: 'finance-amount-cell' },
        { key: 'remaining', text: remaining > 0 ? fmt(remaining, cur) : '—',
          cls: remaining > 0 ? 'finance-amount-cell finance-amount-remaining' : 'finance-amount-cell' },
        { key: 'date',      text: fmtDate(debt.date) },
        { key: 'dueDate',   text: dueDateText, cls: dueDateCls },
        { key: 'note',      text: debt.note || '—' },
      ];

      cells.forEach(c => {
        const td = document.createElement('td');
        td.classList.add('finance-td');
        if (c.cls) c.cls.split(' ').forEach(cls => td.classList.add(cls));
        td.setAttribute('data-label', cols.find(co => co.key === c.key)?.label ?? '');
        td.textContent = c.text;
        tr.appendChild(td);
      });

      // Actions
      const atd = document.createElement('td');
      atd.classList.add('finance-td', 'finance-actions-td');
      atd.setAttribute('data-label', '');

      this.mkActionBtn(atd, '💰', 'Погасить', () => this.openRepayModal(debt));
      this.mkActionBtn(atd, '➕', 'Взять ещё', () => this.openBorrowMoreModal(debt));
      this.mkActionBtn(atd, '✏️', 'Редактировать', () => this.openEditDebtModal(debt));
      this.mkActionBtn(atd, '🗑️', 'Удалить', () => this.confirmDeleteDebt(debt), 'finance-delete-btn');

      tr.appendChild(atd);

      // Expandable movements row
      const expandRow = document.createElement('tr');
      expandRow.classList.add('finance-debt-expand-row');
      const expandTd = document.createElement('td');
      expandTd.setAttribute('colspan', String(cols.length));
      expandTd.classList.add('finance-debt-expand-td');
      this.renderDebtMovementsPanel(expandTd, debt, cur);

      expandRow.appendChild(expandTd);
      expandRow.style.display = 'none';

      // Click to toggle
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.finance-action-btn')) return;
        const open = expandRow.style.display === 'none';
        expandRow.style.display = open ? 'table-row' : 'none';
        tr.classList.toggle('finance-debt-row-expanded', open);
        expandRow.classList.toggle('finance-debt-expand-open', open);
      });

      frag.appendChild(tr);
      frag.appendChild(expandRow);
    });

    tbody.appendChild(frag);
  }

  // ── Debt modals ──────────────────────────────────────────────────────────

  private openNewDebtModal(): void {
    if (!this.data) { new Notice('⏳ Загрузка…'); return; }
    const allPersons = this.data.payers;
    new DebtModal(this.app, {
      title: '➕ Новый долг',
      allPersons,
      onSave: async debt => {
        const note = debt.direction === 'lent' ? 'Дано в долг' : 'Взято в долг';
        const mov: DebtMovement = {
          id: crypto.randomUUID(),
          type: 'borrow',
          amount: debt.amount,
          date: debt.date,
          time: debt.time,
          createdAt: debt.createdAt,
          note,
        };
        debt.movements = [mov];
        await this.storage.addDebt(this.notePath, debt);
        this.data = await this.storage.load(this.notePath);
        this.renderStats();
        this.renderBodyContent();
        new Notice('✅ Долг добавлен');
      },
    }).open();
  }

  private openEditDebtModal(debt: DebtRecord): void {
    if (!this.data) return;
    const allPersons = this.data.payers.concat(this.data.debts.map(d => d.person));
    const unique = [...new Set(allPersons)];
    new DebtModal(this.app, {
      title: '✏️ Редактировать долг',
      debt,
      allPersons: unique,
      onSave: async updated => {
        await this.storage.updateDebt(this.notePath, updated);
        this.data = await this.storage.load(this.notePath);
        this.renderStats();
        this.renderBodyContent();
        new Notice('✅ Долг обновлён');
      },
    }).open();
  }

  private openRepayModal(debt: DebtRecord): void {
    new DebtMovementModal(this.app, {
      title: `💰 Погашение долга — ${debt.person}`,
      type: 'repay',
      onSave: async mov => {
        await this.storage.addDebtMovement(this.notePath, debt.id, mov);
        this.data = await this.storage.load(this.notePath);
        this.renderStats();
        this.renderBodyContent();
        new Notice('✅ Погашение записано');
      },
    }).open();
  }

  private openBorrowMoreModal(debt: DebtRecord): void {
    new DebtMovementModal(this.app, {
      title: `➕ Увеличить долг — ${debt.person}`,
      type: 'borrow',
      onSave: async mov => {
        await this.storage.addDebtMovement(this.notePath, debt.id, mov);
        this.data = await this.storage.load(this.notePath);
        this.renderStats();
        this.renderBodyContent();
        new Notice('✅ Сумма долга увеличена');
      },
    }).open();
  }

  private confirmDeleteDebt(debt: DebtRecord): void {
    const cur = this.data?.currency || this.settings.defaultCurrency;
    const label = `${debt.person} · ${fmt(debt.amount, cur)} · ${fmtDate(debt.date, debt.time)}`;
    new ConfirmModal(this.app, `Удалить долг?\n${label}`, async () => {
      await this.storage.deleteDebt(this.notePath, debt.id);
      this.data = await this.storage.load(this.notePath);
      this.renderStats();
      this.renderBodyContent();
      new Notice('🗑️ Долг удалён');
    }).open();
  }
}
