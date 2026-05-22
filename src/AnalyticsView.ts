import { FinanceRecord } from './types';

type ChartType = 'bar' | 'pie';
type GroupBy   = 'category' | 'payer' | 'month';
type ShowType  = 'both' | 'income' | 'expense';

interface Item { label: string; income: number; expense: number; }

const PALETTE = [
  '#6366f1','#f59e0b','#10b981','#f43f5e','#3b82f6',
  '#8b5cf6','#14b8a6','#fb923c','#22c55e','#a855f7',
  '#06b6d4','#84cc16','#e879f9','#64748b',
];

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

// ── SVG helper ────────────────────────────────────────────────────────────────
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'М';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'К';
  return String(Math.round(n));
}

// ── Main class ────────────────────────────────────────────────────────────────
export class AnalyticsView {
  private el:        HTMLElement;
  private records:   FinanceRecord[];
  private currency:  string;
  private chartType: ChartType = 'bar';
  private groupBy:   GroupBy   = 'category';
  private showType:  ShowType  = 'both';
  private chartEl!:  HTMLElement;
  private dateFrom:  string = '';
  private dateTo:    string = '';
  private timeFrom:  string = '00:00';
  private timeTo:    string = '23:59';

  constructor(el: HTMLElement, records: FinanceRecord[], currency: string) {
    this.el       = el;
    this.records  = records;
    this.currency = currency;
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
    tg.createEl('span', { text: 'Вид:', cls: 'finance-analytics-label' });
    const barBtn = this.mkToggle(tg, '▮▮ Столбцы', this.chartType === 'bar');
    const pieBtn = this.mkToggle(tg, '◕ Пирог',    this.chartType === 'pie');
    if (isMobile) {
      [barBtn, pieBtn].forEach(b => {
        b.style.fontSize = '12px';
        b.style.padding = '2px 8px';
      });
    }
    barBtn.addEventListener('click', () => { this.chartType = 'bar'; barBtn.classList.add('active'); pieBtn.classList.remove('active'); this.redrawChart(); });
    pieBtn.addEventListener('click', () => { this.chartType = 'pie'; pieBtn.classList.add('active'); barBtn.classList.remove('active'); this.redrawChart(); });

    // row 2: group by + show type
    const ctrl2 = ctrl.createDiv('finance-analytics-group');
    if (isMobile) {
      ctrl2.style.flexDirection = 'column';
      ctrl2.style.alignItems = 'stretch';
    }

    const gg = ctrl2.createDiv('finance-analytics-group');
    gg.createEl('span', { text: 'Группировка:', cls: 'finance-analytics-label' });
    const gSel = this.mkSelect(gg, [['category','По категории'],['payer','По плательщику'],['month','По месяцу']], this.groupBy);
    gSel.addEventListener('change', () => { this.groupBy = gSel.value as GroupBy; this.redrawChart(); });

    const sg = ctrl2.createDiv('finance-analytics-group');
    sg.createEl('span', { text: 'Данные:', cls: 'finance-analytics-label' });
    const sSel = this.mkSelect(sg, [['both','Все'],['income','Доходы'],['expense','Расходы']], this.showType);
    sSel.addEventListener('change', () => { this.showType = sSel.value as ShowType; this.redrawChart(); });

    // ── date/time range ───────────────────────────────────────────────────
    const dateRow = this.el.createDiv('finance-filters-row finance-analytics-date-row');

    const dfG = dateRow.createDiv('finance-filter-group');
    dfG.createEl('label', { text: 'С', cls: 'finance-filter-label' });
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
    dtG.createEl('label', { text: 'По', cls: 'finance-filter-label' });
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
      if      (this.groupBy === 'category') key = r.category || 'Без категории';
      else if (this.groupBy === 'payer')    key = r.payer    || 'Не указан';
      else {
        if (!r.date) return;
        const [y, m] = r.date.split('-');
        key = `${y}-${m}`; // for sort
      }
      const cur = map.get(key) ?? { income: 0, expense: 0 };
      if (r.type === 'income') cur.income += r.amount;
      else                     cur.expense += r.amount;
      map.set(key, cur);
    });

    let items = Array.from(map.entries()).map(([label, v]) => ({ label, ...v }));

    if (this.groupBy === 'month') {
      // Sort chronologically, convert key to readable label
      items.sort((a, b) => a.label.localeCompare(b.label));
      items = items.map(d => {
        const [y, m] = d.label.split('-');
        return { ...d, label: `${MONTHS[(parseInt(m) - 1) % 12]} ${y}` };
      });
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
      e.createEl('p', { text: '📊 Нет данных для отображения', cls: 'finance-empty-sub' });
      return;
    }

    if (this.chartType === 'bar') this.renderBar(data);
    else                          this.renderPie(data);
  }

  // ── Bar chart (SVG) ───────────────────────────────────────────────────────

  private renderBar(rawData: Item[]): void {
    const MAX = 20;
    let data = rawData;

    // When grouped by month, never truncate — months are chronological,
    // grouping extras into "Другое" would be meaningless.
    if (this.groupBy !== 'month' && data.length > MAX) {
      const rest = data.slice(MAX);
      data = [
        ...data.slice(0, MAX),
        {
          label:   'Другое',
          income:  rest.reduce((s, d) => s + d.income,  0),
          expense: rest.reduce((s, d) => s + d.expense, 0),
        },
      ];
    }

    const isMobile = window.innerWidth <= 480;
    const availW = Math.max(this.chartEl.clientWidth || 600, 500);
    const W = Math.min(availW, 1200);
    const ratio = W / 1000;
    const PL = 60, PB = Math.round(70 * ratio), PT = Math.round(16 * ratio), PR = Math.round(14 * ratio);
    const H = Math.round(W * (isMobile ? 0.55 : 0.36));
    const CW = W - PL - PR, CH = H - PT - PB;
    const fsY = Math.max(Math.round(16 * ratio), isMobile ? 14 : 12);
    const fsX = Math.max(Math.round(13 * ratio), isMobile ? 12 : 10);
    const fsLegend = Math.max(Math.round(17 * ratio), isMobile ? 15 : 13);

    let maxVal = 1;
    data.forEach(d => {
      if (this.showType !== 'expense') maxVal = Math.max(maxVal, d.income);
      if (this.showType !== 'income')  maxVal = Math.max(maxVal, d.expense);
    });

    const groupW = CW / data.length;
    const barW   = Math.max(2, Math.min(groupW * (isMobile ? 0.50 : 0.30), Math.round((isMobile ? 28 : 18) * ratio)));
    const gap    = Math.max(1, Math.round(ratio));

    const root = svg('svg', { viewBox: `0 0 ${W} ${H}` });
    root.classList.add('finance-chart-svg');

    // Tooltip div
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
      tooltip.style.left = left + 'px';
      tooltip.style.top  = top + 'px';
    };
    const hideTip = () => { tooltip.style.display = 'none'; };

    // Y grid
    for (let i = 0; i <= 4; i++) {
      const y   = PT + CH * i / 4;
      const val = maxVal * (1 - i / 4);

      const line = svg('line', { x1: PL, y1: y, x2: W - PR, y2: y, stroke: 'var(--background-modifier-border)', 'stroke-width': i === 4 ? 1.5 : 1 });
      if (i > 0 && i < 4) line.setAttribute('stroke-dasharray', '3 4');
      root.appendChild(line);

      const t = svg('text', { x: PL - 8, y: y + Math.round(6 * ratio), 'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': fsY });
      t.textContent = fmtShort(val);
      root.appendChild(t);
    }

    // Bars + X labels
    data.forEach((d, i) => {
      const cx = PL + groupW * i + groupW / 2;

      if (this.showType !== 'expense' && d.income > 0) {
        const h = (d.income / maxVal) * CH;
        const x = this.showType === 'both' ? cx - barW - gap / 2 : cx - barW / 2;
        const rect = svg('rect', { x, y: PT + CH - h, width: barW, height: h, fill: '#22c55e', rx: 3 });
        rect.style.cursor = 'pointer';
        rect.addEventListener('mouseenter', (e) => showTip(e, `${d.label} — доход: ${this.fmtNum(d.income)}`));
        rect.addEventListener('mousemove', (e) => showTip(e, `${d.label} — доход: ${this.fmtNum(d.income)}`));
        rect.addEventListener('mouseleave', hideTip);
        root.appendChild(rect);
      }

      if (this.showType !== 'income' && d.expense > 0) {
        const h = (d.expense / maxVal) * CH;
        const x = this.showType === 'both' ? cx + gap / 2 : cx - barW / 2;
        const rect = svg('rect', { x, y: PT + CH - h, width: barW, height: h, fill: '#ef4444', rx: 3 });
        rect.style.cursor = 'pointer';
        rect.addEventListener('mouseenter', (e) => showTip(e, `${d.label} — расход: ${this.fmtNum(d.expense)}`));
        rect.addEventListener('mousemove', (e) => showTip(e, `${d.label} — расход: ${this.fmtNum(d.expense)}`));
        rect.addEventListener('mouseleave', hideTip);
        root.appendChild(rect);
      }

      // X label
      const lbl = svg('text', {
        x: cx, y: H - PB + Math.round(20 * ratio),
        'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': fsX,
      });
      const short = d.label.length > 8 ? d.label.slice(0, 7) + '…' : d.label;
      lbl.textContent = short;
      if (data.length > 10) {
        lbl.setAttribute('transform', `rotate(-30, ${cx}, ${H - PB + Math.round(20 * ratio)})`);
        lbl.setAttribute('text-anchor', 'end');
      }
      root.appendChild(lbl);
    });

    // Legend
    if (this.showType === 'both') {
      const lx = Math.round(ratio * 110);
      const leg = svg('g', { transform: `translate(${PL}, ${H - Math.round(8 * ratio)})` });
      [['#22c55e', 'Доходы'], ['#ef4444', 'Расходы']].forEach(([c, lbl], i) => {
        const dotS = Math.round(8 * ratio);
        const gx = i * lx;
        const r  = svg('rect', { x: gx, y: -dotS, width: dotS, height: dotS, fill: c, rx: Math.round(ratio) });
        const t  = svg('text', { x: gx + dotS + Math.round(8 * ratio), y: Math.round(2 * ratio), fill: 'var(--text-muted)', 'font-size': fsLegend });
        t.textContent = lbl;
        leg.appendChild(r); leg.appendChild(t);
      });
      root.appendChild(leg);
    }

    const wrap = this.chartEl.createDiv('finance-chart-svg-wrap');
    wrap.appendChild(root);
  }

  // ── Pie / donut chart (SVG) ───────────────────────────────────────────────

  private renderPie(rawData: Item[]): void {
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
      items = [...items.slice(0, MAX), { label: 'Другое', value: rest }];
    }

    const total = items.reduce((s, d) => s + d.value, 0);
    if (!total) {
      this.chartEl.createEl('p', { text: 'Нет данных', cls: 'finance-empty-sub' });
      return;
    }

    const SZ = 120, cx = SZ / 2, cy = SZ / 2, R = 48, iR = 26;
    const root = svg('svg', { viewBox: `0 0 ${SZ} ${SZ}` });
    root.classList.add('finance-chart-svg');
    root.style.flexShrink = '0';

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
      const tip = svg('title');
      tip.textContent = `${d.label}: ${this.fmtNum(d.value)} (${pct(d.value, total)})`;
      path.appendChild(tip);
      root.appendChild(path);

      angle += sweep;
    });

    // Center label
    const tc = svg('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': 7 });
    tc.textContent = 'Итого';
    root.appendChild(tc);
    const tv = svg('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', fill: 'var(--text-normal)', 'font-size': 9, 'font-weight': 'bold' });
    tv.textContent = fmtShort(total);
    root.appendChild(tv);

    // Layout: chart + legend
    const wrap = this.chartEl.createDiv('finance-pie-wrap');
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
