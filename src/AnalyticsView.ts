import { FinanceRecord } from './types';
import { Translations } from './i18n';

type ChartType = 'bar' | 'pie';
type GroupBy   = 'category' | 'payer' | 'month' | 'week' | 'year';
type ShowType  = 'both' | 'income' | 'expense';

interface Item { label: string; rawKey: string; income: number; expense: number; }

export interface BarClickAction { groupBy: GroupBy; rawKey: string; label: string; }
export type OnBarClick = (action: BarClickAction) => void;

const PALETTE = [
  '#6366f1','#f59e0b','#10b981','#f43f5e','#3b82f6',
  '#8b5cf6','#14b8a6','#fb923c','#22c55e','#a855f7',
  '#06b6d4','#84cc16','#e879f9','#64748b',
];

function shortMonth(m: number, locale: string): string {
  const d = new Date(2024, m, 1);
  const s = d.toLocaleString(locale, { month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getWeekNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  const oneWeek = 604800000;
  return Math.ceil((diff + (start.getDay() + 6) * 86400000) / oneWeek);
}

// ── SVG helper ────────────────────────────────────────────────────────────────
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return String(Math.round(n));
}

// ── Main class ────────────────────────────────────────────────────────────────
export class AnalyticsView {
  private el:        HTMLElement;
  private records:   FinanceRecord[];
  private currency:  string;
  private tr:        Translations;
  private chartType: ChartType = 'bar';
  private groupBy:   GroupBy   = 'category';
  private showType:  ShowType  = 'both';
  private chartEl!:  HTMLElement;
  private dateFrom = '';
  private dateTo = '';
  private timeFrom = '00:00';
  private timeTo = '23:59';
  private onBarClick: OnBarClick | null;

  constructor(el: HTMLElement, records: FinanceRecord[], currency: string, tr: Translations, onBarClick?: OnBarClick) {
    this.el       = el;
    this.records  = records;
    this.currency = currency;
    this.tr       = tr;
    this.onBarClick = onBarClick ?? null;
  }

  private get locale(): string {
    return this.tr.income === '↑ Доход' ? 'ru' : 'en';
  }

  /** Call when filter changes outside */
  update(records: FinanceRecord[], currency: string): void {
    this.records  = records;
    this.currency = currency;
    this.redrawChart();
  }

  render(): void {
    this.el.empty();
    this.el.addClass('finance-analytics');

    const isMobile = window.innerWidth <= 480;

    // ── controls ──────────────────────────────────────────────────────────
    const ctrl = this.el.createDiv('finance-analytics-controls');

    // chart type (row 1)
    const tg = ctrl.createDiv('finance-analytics-group');
    if (isMobile) { tg.style.flexDirection = 'column'; tg.style.alignItems = 'flex-start'; }
    tg.createEl('span', { text: this.tr.chartView, cls: 'finance-analytics-label' });
    const tgBtnWrap = tg.createDiv();
    tgBtnWrap.style.display = 'flex';
    tgBtnWrap.style.gap = '6px';
    if (isMobile) { tgBtnWrap.style.width = '100%'; }
    const barBtn = this.mkToggle(tgBtnWrap, this.tr.barChart, this.chartType === 'bar');
    const pieBtn = this.mkToggle(tgBtnWrap, this.tr.pieChart, this.chartType === 'pie');
    barBtn.addEventListener('click', () => { this.chartType = 'bar'; barBtn.classList.add('active'); pieBtn.classList.remove('active'); this.redrawChart(); });
    pieBtn.addEventListener('click', () => { this.chartType = 'pie'; pieBtn.classList.add('active'); barBtn.classList.remove('active'); this.redrawChart(); });

    // row 2: group by + show type
    const ctrl2 = ctrl.createDiv('finance-analytics-group');
    if (isMobile) {
      ctrl2.style.flexDirection = 'column';
      ctrl2.style.alignItems = 'stretch';
    }

    const gg = ctrl2.createDiv('finance-analytics-group');
    if (isMobile) { gg.style.flexDirection = 'column'; gg.style.alignItems = 'flex-start'; }
    gg.createEl('span', { text: this.tr.groupBy, cls: 'finance-analytics-label' });
    const gSel = this.mkSelect(gg, [['category',this.tr.byCategory],['payer',this.tr.byPayer],['week',this.tr.byWeek],['month',this.tr.byMonth],['year',this.tr.byYear]], this.groupBy);
    gSel.addEventListener('change', () => { this.groupBy = gSel.value as GroupBy; this.redrawChart(); });

    const sg = ctrl2.createDiv('finance-analytics-group');
    if (isMobile) { sg.style.flexDirection = 'column'; sg.style.alignItems = 'flex-start'; }
    sg.createEl('span', { text: this.tr.showData, cls: 'finance-analytics-label' });
    const sSel = this.mkSelect(sg, [['both',this.tr.all],['income',this.tr.incomeStat],['expense',this.tr.expenseStat]], this.showType);
    sSel.addEventListener('change', () => { this.showType = sSel.value as ShowType; this.redrawChart(); });

    // ── date/time range ───────────────────────────────────────────────────
    const dateRow = this.el.createDiv('finance-filters-row finance-analytics-date-row');

    const dfG = dateRow.createDiv('finance-filter-group');
    dfG.createEl('label', { text: this.tr.from, cls: 'finance-filter-label' });
    const dfI = dfG.createEl('input', { type: 'datetime-local', cls: 'finance-filter-input' });
    if (this.dateFrom) dfI.value = `${this.dateFrom}T${this.timeFrom || '00:00'}`;
    dfI.addEventListener('change', () => {
      if (dfI.value) {
        const [d, t] = dfI.value.split('T');
        this.dateFrom = d;
        this.timeFrom = t;
      } else {
        this.dateFrom = '';
        this.timeFrom = '00:00';
      }
      this.redrawChart();
    });

    const dtG = dateRow.createDiv('finance-filter-group');
    dtG.createEl('label', { text: this.tr.to, cls: 'finance-filter-label' });
    const dtI = dtG.createEl('input', { type: 'datetime-local', cls: 'finance-filter-input' });
    if (this.dateTo) dtI.value = `${this.dateTo}T${this.timeTo || '23:59'}`;
    dtI.addEventListener('change', () => {
      if (dtI.value) {
        const [d, t] = dtI.value.split('T');
        this.dateTo = d;
        this.timeTo = t;
      } else {
        this.dateTo = '';
        this.timeTo = '23:59';
      }
      this.redrawChart();
    });

    this.chartEl = this.el.createDiv('finance-chart-area');
    this.redrawChart();
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private mkToggle(parent: HTMLElement, label: string, active: boolean): HTMLButtonElement {
    const btn = parent.createEl('button', { text: label, cls: `finance-analytics-btn${active ? ' active' : ''}` });
    return btn;
  }

  private mkSelect(parent: HTMLElement, opts: [string, string][], current: string): HTMLSelectElement {
    const sel = parent.createEl('select', { cls: 'finance-filter-select finance-analytics-select' });
    opts.forEach(([v, l]) => { const o = sel.createEl('option', { text: l }); o.value = v; o.selected = v === current; });
    return sel;
  }

  private fmtNum(n: number): string {
    return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '\u00a0' + this.currency;
  }

  // ── data aggregation ─────────────────────────────────────────────────────

  private aggregate(): Item[] {
    const map = new Map<string, { income: number; expense: number }>();

    this.records.forEach(r => {
      // Filter by analytics date range
      if (this.dateFrom && r.date < this.dateFrom) return;
      if (this.dateTo && r.date > this.dateTo) return;
      if (this.dateFrom && r.date === this.dateFrom && r.time < this.timeFrom) return;
      if (this.dateTo && r.date === this.dateTo && r.time > this.timeTo) return;

      let key: string;
      if      (this.groupBy === 'category') key = r.category || this.tr.uncategorized;
      else if (this.groupBy === 'payer')    key = r.payer    || this.tr.notSpecified;
      else if (this.groupBy === 'year') {
        if (!r.date) return;
        key = r.date.split('-')[0];
      } else if (this.groupBy === 'week') {
        if (!r.date) return;
        const w = getWeekNumber(r.date);
        key = `${r.date.split('-')[0]}-W${String(w).padStart(2, '0')}`;
      } else {
        if (!r.date) return;
        const [y, m] = r.date.split('-');
        key = `${y}-${m}`; // for sort
      }
      const cur = map.get(key) ?? { income: 0, expense: 0 };
      if (r.type === 'income') cur.income += r.amount;
      else                     cur.expense += r.amount;
      map.set(key, cur);
    });

    let items = Array.from(map.entries()).map(([rawKey, v]) => ({ label: rawKey, rawKey, ...v }));

    if (this.groupBy === 'month') {
      items.sort((a, b) => a.label.localeCompare(b.label));
      items = items.map(d => {
        const [y, m] = d.label.split('-');
        return { ...d, label: `${shortMonth((parseInt(m) - 1) % 12, this.locale)} ${y}` };
      });
    } else if (this.groupBy === 'week') {
      items.sort((a, b) => a.label.localeCompare(b.label));
      items = items.map(d => {
        const [y, w] = d.label.split('-W');
        return { ...d, label: `${this.tr.weekLetter}${w} ${y}` };
      });
    } else if (this.groupBy === 'year') {
      items.sort((a, b) => a.label.localeCompare(b.label));
    } else {
      items.sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
    }

    return items;
  }

  // ── chart dispatch ────────────────────────────────────────────────────────

  private redrawChart(): void {
    if (!this.chartEl) return;
    const oldTip = document.querySelector('.finance-bar-tooltip');
    if (oldTip) oldTip.remove();
    this.chartEl.empty();

    const data = this.aggregate();
    if (!data.length) {
      const e = this.chartEl.createDiv('finance-empty-state');
      e.style.padding = '32px';
      e.createEl('p', { text: this.tr.noChartData, cls: 'finance-empty-sub' });
      return;
    }

    if (this.chartType === 'bar') this.renderBar(data);
    else                          this.renderPie(data);
  }

  // ── Bar chart (SVG) ───────────────────────────────────────────────────────

  private renderBar(rawData: Item[]): void {
    const MAX = 20;
    let data = rawData;

    if (this.groupBy !== 'month' && this.groupBy !== 'week' && this.groupBy !== 'year' && data.length > MAX) {
      const rest = data.slice(MAX);
      data = [
        ...data.slice(0, MAX),
        {
          label:   this.tr.other,
          rawKey:  'Другое',
          income:  rest.reduce((s, d) => s + d.income,  0),
          expense: rest.reduce((s, d) => s + d.expense, 0),
        },
      ];
    }

    const isMobile = window.innerWidth <= 480;
    const containerW = this.chartEl.clientWidth || 600;
    const MIN_GROUP = data.length > 12 ? 35 : data.length > 6 ? 50 : data.length > 3 ? 55 : 60;
    const PL = 45, PR = 12;
    const minW = PL + data.length * MIN_GROUP + PR;
    const W = isMobile ? Math.max(minW, containerW) : minW;
    const CH = 340;
    const PT = 18, PB = 96;
    const chartH = CH - PT - PB;
    const fsY = 14, fsX = 12;
    const gap = 2;

    let maxVal = 1;
    data.forEach(d => {
      if (this.showType !== 'expense') maxVal = Math.max(maxVal, d.income);
      if (this.showType !== 'income')  maxVal = Math.max(maxVal, d.expense);
    });

    const groupW = (W - PL - PR) / data.length;
    const maxBarW = isMobile ? 20 : (data.length <= 4 ? 50 : data.length <= 8 ? 30 : 20);
    const barRatio = isMobile ? 0.40 : 0.35;
    const barW   = Math.max(2, Math.min(groupW * barRatio, maxBarW));

    const root = svg('svg', { viewBox: `0 0 ${W} ${CH}` });
    root.classList.add('finance-chart-svg');

    const tooltip = document.createElement('div');
    tooltip.className = 'finance-bar-tooltip';
    tooltip.style.cssText = 'display:none;position:fixed;z-index:10000;pointer-events:none;padding:5px 10px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:5px;font-size:13px;color:var(--text-normal);box-shadow:0 2px 6px rgba(0,0,0,.15);line-height:1.4;max-width:320px;';
    document.body.appendChild(tooltip);

    const showTip = (e: MouseEvent, text: string) => {
      tooltip.textContent = text;
      tooltip.style.display = 'block';
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      let left = e.clientX - tw / 2;
      let top  = e.clientY - th - 10;
      if (left < 6) left = 6;
      if (left + tw > window.innerWidth - 6) left = window.innerWidth - tw - 6;
      if (top < 4) top = e.clientY + 12;
      tooltip.style.left = `${left}px`;
      tooltip.style.top  = `${top}px`;
    };
    const hideTip = () => { tooltip.style.display = 'none'; };

    for (let i = 0; i <= 4; i++) {
      const y   = PT + chartH * i / 4;
      const val = maxVal * (1 - i / 4);

      const line = svg('line', { x1: PL, y1: y, x2: W - PR, y2: y, stroke: 'var(--background-modifier-border)', 'stroke-width': i === 4 ? 1.5 : 1 });
      if (i > 0 && i < 4) line.setAttribute('stroke-dasharray', '3 4');
      root.appendChild(line);

      const t = svg('text', { x: PL - 8, y: y + 6, 'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': fsY });
      t.textContent = fmtShort(val);
      root.appendChild(t);
    }

    data.forEach((d, i) => {
      const cx = PL + groupW * i + groupW / 2;
      const fireClick = () => {
        if (this.onBarClick) this.onBarClick({ groupBy: this.groupBy, rawKey: d.rawKey, label: d.label });
      };

      if (this.showType !== 'expense' && d.income > 0) {
        const h = (d.income / maxVal) * chartH;
        const x = this.showType === 'both' ? cx - barW - gap / 2 : cx - barW / 2;
        const rect = svg('rect', { x, y: PT + chartH - h, width: barW, height: h, fill: '#22c55e', rx: 3 });
        rect.style.cursor = 'pointer';
        rect.addEventListener('click', fireClick);
        rect.addEventListener('mouseenter', (e) => showTip(e, `${d.label} — ${this.tr.incomeStat.toLowerCase()}: ${this.fmtNum(d.income)}`));
        rect.addEventListener('mousemove', (e) => showTip(e, `${d.label} — ${this.tr.incomeStat.toLowerCase()}: ${this.fmtNum(d.income)}`));
        rect.addEventListener('mouseleave', hideTip);
        root.appendChild(rect);
      }

      if (this.showType !== 'income' && d.expense > 0) {
        const h = (d.expense / maxVal) * chartH;
        const x = this.showType === 'both' ? cx + gap / 2 : cx - barW / 2;
        const rect = svg('rect', { x, y: PT + chartH - h, width: barW, height: h, fill: '#ef4444', rx: 3 });
        rect.style.cursor = 'pointer';
        rect.addEventListener('click', fireClick);
        rect.addEventListener('mouseenter', (e) => showTip(e, `${d.label} — ${this.tr.expenseStat.toLowerCase()}: ${this.fmtNum(d.expense)}`));
        rect.addEventListener('mousemove', (e) => showTip(e, `${d.label} — ${this.tr.expenseStat.toLowerCase()}: ${this.fmtNum(d.expense)}`));
        rect.addEventListener('mouseleave', hideTip);
        root.appendChild(rect);
      }

      const lbl = svg('text', {
        x: cx, y: CH - PB + 20,
        'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': fsX,
      });
      lbl.textContent = d.label;
      if (data.length > 10) {
        lbl.setAttribute('transform', `rotate(-30, ${cx}, ${CH - PB + 20})`);
        lbl.setAttribute('text-anchor', 'end');
      }
      root.appendChild(lbl);
    });

    const wrap = this.chartEl.createDiv('finance-chart-svg-wrap');
    root.style.display = 'block';
    root.style.width = `${W}px`;
    root.style.height = `${CH}px`;
    wrap.appendChild(root);

    if (this.showType === 'both') {
      const legEl = this.chartEl.createDiv('finance-chart-legend');
      [['#22c55e', this.tr.incomeStat], ['#ef4444', this.tr.expenseStat]].forEach(([c, lbl]) => {
        const row = legEl.createDiv('finance-chart-legend-row');
        const dot = row.createDiv('finance-chart-legend-dot');
        dot.style.background = c;
        row.createEl('span', { text: lbl });
      });
    }
  }

  // ── Pie / donut chart (SVG) ───────────────────────────────────────────────

  private renderPie(rawData: Item[]): void {
    const isMobile = window.innerWidth <= 480;
    const MAX = 14;
    let items = rawData
      .map(d => ({
        label: d.label,
        value: this.showType === 'income'  ? d.income
             : this.showType === 'expense' ? d.expense
             : d.income + d.expense,
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);

    if (items.length > MAX) {
      const rest = items.slice(MAX).reduce((s, d) => s + d.value, 0);
      items = [...items.slice(0, MAX), { label: this.tr.other, value: rest }];
    }

    const total = items.reduce((s, d) => s + d.value, 0);
    if (!total) {
      this.chartEl.createEl('p', { text: this.tr.noData, cls: 'finance-empty-sub' });
      return;
    }

    const SZ = 160, cx = SZ / 2, cy = SZ / 2, R = 64, iR = 36;
    const root = svg('svg', { viewBox: `0 0 ${SZ} ${SZ}` });
    root.classList.add('finance-chart-svg');

    const tooltip = document.createElement('div');
    tooltip.className = 'finance-bar-tooltip';
    tooltip.style.cssText = 'display:none;position:fixed;z-index:10000;pointer-events:none;padding:5px 10px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:5px;font-size:13px;color:var(--text-normal);box-shadow:0 2px 6px rgba(0,0,0,.15);line-height:1.4;max-width:320px;';
    document.body.appendChild(tooltip);

    const showTip = (e: MouseEvent, text: string) => {
      tooltip.textContent = text;
      tooltip.style.display = 'block';
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      let left = e.clientX - tw / 2;
      let top  = e.clientY - th - 10;
      if (left < 6) left = 6;
      if (left + tw > window.innerWidth - 6) left = window.innerWidth - tw - 6;
      if (top < 4) top = e.clientY + 12;
      tooltip.style.left = `${left}px`;
      tooltip.style.top  = `${top}px`;
    };
    const hideTip = () => { tooltip.style.display = 'none'; };

    let angle = -Math.PI / 2;

    items.forEach((d, idx) => {
      const sweep = (d.value / total) * 2 * Math.PI;
      if (sweep < 0.005) { angle += sweep; return; }

      const cos1 = Math.cos(angle),        sin1 = Math.sin(angle);
      const cos2 = Math.cos(angle + sweep), sin2 = Math.sin(angle + sweep);
      const large = sweep > Math.PI ? 1 : 0;

      const x1 = cx + R  * cos1, y1 = cy + R  * sin1;
      const x2 = cx + R  * cos2, y2 = cy + R  * sin2;
      const ix1= cx + iR * cos1, iy1= cy + iR * sin1;
      const ix2= cx + iR * cos2, iy2= cy + iR * sin2;

      const path = svg('path', {
        d:   `M ${f(ix1)} ${f(iy1)} L ${f(x1)} ${f(y1)} A ${R} ${R} 0 ${large} 1 ${f(x2)} ${f(y2)} L ${f(ix2)} ${f(iy2)} A ${iR} ${iR} 0 ${large} 0 ${f(ix1)} ${f(iy1)} Z`,
        fill: PALETTE[idx % PALETTE.length],
        stroke: 'var(--background-primary)',
        'stroke-width': 2,
      });
      path.style.cursor = 'pointer';
      path.addEventListener('mouseenter', (e) => showTip(e, `${d.label}: ${this.fmtNum(d.value)} (${pct(d.value, total)})`));
      path.addEventListener('mousemove', (e) => showTip(e, `${d.label}: ${this.fmtNum(d.value)} (${pct(d.value, total)})`));
      path.addEventListener('mouseleave', hideTip);
      root.appendChild(path);

      angle += sweep;
    });

    // Center label
    const tc = svg('text', { x: cx, y: cy - 6, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': 9 });
    tc.textContent = this.tr.total;
    root.appendChild(tc);
    const tv = svg('text', { x: cx, y: cy + 8, 'text-anchor': 'middle', fill: 'var(--text-normal)', 'font-size': 12, 'font-weight': 'bold' });
    tv.textContent = fmtShort(total);
    root.appendChild(tv);

    // Layout: chart + legend
    const wrap = this.chartEl.createDiv('finance-pie-wrap');
    root.style.flexShrink = '0';
    if (isMobile) {
      root.style.height = '260px';
    } else {
      root.style.height = '100%';
    }
    wrap.appendChild(root);

    const legend = wrap.createDiv('finance-pie-legend');
    items.forEach((d, idx) => {
      const row = legend.createDiv('finance-pie-legend-row');
      const dot = row.createDiv('finance-pie-dot');
      dot.style.background = PALETTE[idx % PALETTE.length];
      row.createEl('span', { text: d.label,                      cls: 'finance-pie-label' });
      row.createEl('span', { text: `${this.fmtNum(d.value)} · ${pct(d.value, total)}`, cls: 'finance-pie-val' });
    });
  }
}

const f   = (n: number) => n.toFixed(2);
const pct = (v: number, t: number) => `${((v / t) * 100).toFixed(1)}%`;
