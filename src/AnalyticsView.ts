import { FinanceRecord,
  CHART_PALETTE, CHART_COLOR_INCOME, CHART_COLOR_EXPENSE,
  CHART_SVG_HEIGHT, CHART_SVG_PAD_LEFT, CHART_SVG_PAD_RIGHT, CHART_SVG_PAD_TOP, CHART_SVG_PAD_BOTTOM,
  CHART_MIN_GROUP_MOBILE, CHART_MIN_GROUP_DESKTOP,
  CHART_MAX_BAR_W_MOBILE, CHART_MAX_BAR_W_SMALL, CHART_MAX_BAR_W_MED, CHART_MAX_BAR_W_LARGE,
  CHART_BAR_RATIO_MOBILE, CHART_BAR_RATIO_DESKTOP,
  CHART_MAX_ITEMS, CHART_BAR_GAP, CHART_BAR_RADIUS, CHART_LABEL_ROTATE_THRESHOLD,} from './types';
import { ViewContext } from './context';
import { isoWeek } from './domain/dateMath';
import { svg, fmtShort, shortMonth, createChartTooltip } from './ui/chartHelpers';
import { CSS_CLASS, RecordType, DATE_FORMAT_LENGTH} from './constants';
import { BaseAnalyticsView } from './ui/BaseAnalyticsView';
import { fmtPercentage } from './utils';

type ChartType = 'bar' | 'pie';
type GroupBy   = 'category' | 'payer' | 'month' | 'week' | 'year';
type ShowType  = 'both' | RecordType;

interface Item { label: string; rawKey: string; income: number; expense: number; }

export interface BarClickAction { groupBy: GroupBy; rawKey: string; label: string; }
export type OnBarClick = (action: BarClickAction) => void;

// ── Main class ────────────────────────────────────────────────────────────────
export class AnalyticsView extends BaseAnalyticsView {
  private records:   FinanceRecord[];
  private chartType: ChartType = 'bar';
  private groupBy:   GroupBy   = 'category';
  private showType:  ShowType  = 'both';
  private chartEl!:  HTMLElement;
  private dateFrom = '';
  private dateTo = '';
  private timeFrom = '00:00';
  private timeTo = '23:59';
  private onBarClick: OnBarClick | null;

  constructor(el: HTMLElement, records: FinanceRecord[], ctx: ViewContext, onBarClick?: OnBarClick) {
    super(el, ctx);
    this.records  = records;
    this.onBarClick = onBarClick ?? null;
  }

  /** Call when filter changes outside */
  update(records: FinanceRecord[]): void {
    this.records  = records;
    this.redrawChart();
  }

  render(): void {
    this.setupContainer();

    // ── controls ──────────────────────────────────────────────────────────
    const ctrl = this.el.createDiv('finance-analytics-controls');
    this.el.toggleClass('is-mobile', this.isMobile);

    // chart type (row 1)
    const tg = ctrl.createDiv('finance-analytics-group');
    tg.createSpan({ text: this.tr.chartView, cls: 'finance-analytics-label' });
    const tgBtnWrap = tg.createDiv('finance-analytics-btn-wrap');
    const barBtn = this.mkToggle(tgBtnWrap, this.tr.barChart, this.chartType === 'bar');
    const pieBtn = this.mkToggle(tgBtnWrap, this.tr.pieChart, this.chartType === 'pie');
    barBtn.addEventListener('click', () => { this.chartType = 'bar'; barBtn.classList.add(CSS_CLASS.ACTIVE); pieBtn.classList.remove(CSS_CLASS.ACTIVE); this.redrawChart(); });
    pieBtn.addEventListener('click', () => { this.chartType = 'pie'; pieBtn.classList.add(CSS_CLASS.ACTIVE); barBtn.classList.remove(CSS_CLASS.ACTIVE); this.redrawChart(); });

    // row 2: group by + show type
    const ctrl2 = ctrl.createDiv('finance-analytics-group finance-analytics-group-row');

    const gg = ctrl2.createDiv('finance-analytics-group');
    gg.createSpan({ text: this.tr.groupBy, cls: 'finance-analytics-label' });
    const gSel = this.mkSelect(gg, [['category',this.tr.byCategory],['payer',this.tr.byPayer],['week',this.tr.byWeek],['month',this.tr.byMonth],['year',this.tr.byYear]], this.groupBy);
    gSel.addEventListener('change', () => { this.groupBy = gSel.value as GroupBy; this.redrawChart(); });

    const sg = ctrl2.createDiv('finance-analytics-group');
    sg.createSpan({ text: this.tr.showData, cls: 'finance-analytics-label' });
    const sSel = this.mkSelect(sg, [['both',this.tr.all],[RecordType.INCOME,this.tr.incomeStat],[RecordType.EXPENSE,this.tr.expenseStat]], this.showType);
    sSel.addEventListener('change', () => { this.showType = sSel.value as ShowType; this.redrawChart(); });

    // ── date/time range ───────────────────────────────────────────────────
    const dateRow = this.el.createDiv('finance-filters-row finance-analytics-date-row');

    const dfG = dateRow.createDiv('finance-filter-group');
    dfG.createEl('label', { text: this.tr.from, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
    const dfI = dfG.createEl('input', { type: 'datetime-local', cls: CSS_CLASS.FINANCE_FILTER_INPUT });
    if (this.dateFrom) dfI.value = `${this.dateFrom}T${this.timeFrom || '00:00'}`;
    dfI.addEventListener('change', () => {
      if (dfI.value) {
        const [d, t] = dfI.value.split('T');
        this.dateFrom = d ?? '';
        this.timeFrom = t ?? '00:00';
      } else {
        this.dateFrom = '';
        this.timeFrom = '00:00';
      }
      this.redrawChart();
    });

    const dtG = dateRow.createDiv('finance-filter-group');
    dtG.createEl('label', { text: this.tr.to, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
    const dtI = dtG.createEl('input', { type: 'datetime-local', cls: CSS_CLASS.FINANCE_FILTER_INPUT });
    if (this.dateTo) dtI.value = `${this.dateTo}T${this.timeTo || '23:59'}`;
    dtI.addEventListener('change', () => {
      if (dtI.value) {
        const [d, t] = dtI.value.split('T');
        this.dateTo = d ?? '';
        this.timeTo = t ?? '00:00';
      } else {
        this.dateTo = '';
        this.timeTo = '00:00';
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
    return this.fmt(n);
  }

  // ── data aggregation ─────────────────────────────────────────────────────

  private aggregate(): Item[] {
    const map = new Map<string, { income: number; expense: number }>();

    this.records.forEach(r => {
      if (r.isInternal) return;

      // Filter by analytics date range
      if (this.dateFrom && r.date < this.dateFrom) return;
      if (this.dateTo && r.date > this.dateTo) return;

      // Time filtering: treat empty time as "00:00" for start boundary and "23:59" for end boundary
      const recordTime = r.time || '00:00';
      if (this.dateFrom && r.date === this.dateFrom && recordTime < this.timeFrom) return;
      if (this.dateTo && r.date === this.dateTo && recordTime > this.timeTo) return;

      let key: string;
      if      (this.groupBy === 'category') key = r.category || this.tr.uncategorized;
      else if (this.groupBy === 'payer')    key = r.payer    || this.tr.notSpecified;
      else if (this.groupBy === 'year') {
        if (!r.date) return;
        key = r.date.slice(0, DATE_FORMAT_LENGTH.YEAR);
      } else if (this.groupBy === 'week') {
        const iso = r.date ? isoWeek(r.date) : null;
        if (!iso) return;
        key = `${iso.year}-W${String(iso.week).padStart(2, '0')}`;
      } else {
        if (!r.date) return;
        const [y, m] = r.date.split('-');
        key = `${y}-${m}`; // for sort
      }
      const cur = map.get(key) ?? { income: 0, expense: 0 };
      if (r.type === RecordType.INCOME) cur.income += r.amount;
      else                     cur.expense += r.amount;
      map.set(key, cur);
    });

    let items = Array.from(map.entries()).map(([rawKey, v]) => ({ label: rawKey, rawKey, ...v }));

    if (this.groupBy === 'month') {
      items.sort((a, b) => a.label.localeCompare(b.label));
      items = items.map(d => {
        const [y, m] = d.label.split('-');
        return { ...d, label: `${shortMonth((parseInt(m ?? '1') - 1) % 12, this.locale)} ${y}` };
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
      const e = this.chartEl.createDiv('finance-empty-state finance-empty-chart');
      e.createEl('p', { text: this.tr.noChartData, cls: CSS_CLASS.FINANCE_EMPTY_SUB });
      return;
    }

    if (this.chartType === 'bar') this.renderBar(data);
    else                          this.renderPie(data);
  }

  // ── Bar chart (SVG) ───────────────────────────────────────────────────────

  private renderBar(rawData: Item[]): void {
    let data = rawData;

    if (this.groupBy !== 'month' && this.groupBy !== 'week' && this.groupBy !== 'year' && data.length > CHART_MAX_ITEMS) {
      const rest = data.slice(CHART_MAX_ITEMS);
      data = [
        ...data.slice(0, CHART_MAX_ITEMS),
        {
          label:   this.tr.other,
          rawKey:  'Другое',
          income:  rest.reduce((s, d) => s + d.income,  0),
          expense: rest.reduce((s, d) => s + d.expense, 0),
        },
      ];
    }

    const containerW = this.chartEl.clientWidth || 600;
    const MIN_GROUP = data.length > 12 ? CHART_MIN_GROUP_MOBILE : data.length > 6 ? 50 : data.length > 3 ? 55 : CHART_MIN_GROUP_DESKTOP;
    const PL = CHART_SVG_PAD_LEFT, PR = CHART_SVG_PAD_RIGHT;
    const minW = PL + data.length * MIN_GROUP + PR;
    const W = Math.max(minW, containerW);
    const CH = CHART_SVG_HEIGHT;
    const PT = CHART_SVG_PAD_TOP, PB = CHART_SVG_PAD_BOTTOM;
    const chartH = CH - PT - PB;
    const fsY = 14, fsX = 12;
    const gap = CHART_BAR_GAP;

    let maxVal = 1;
    data.forEach(d => {
      if (this.showType !== RecordType.EXPENSE) maxVal = Math.max(maxVal, d.income);
      if (this.showType !== RecordType.INCOME)  maxVal = Math.max(maxVal, d.expense);
    });

    const groupW = (W - PL - PR) / data.length;
    const maxBarW = this.isMobile ? CHART_MAX_BAR_W_MOBILE : (data.length <= 4 ? CHART_MAX_BAR_W_SMALL : data.length <= 8 ? CHART_MAX_BAR_W_MED : CHART_MAX_BAR_W_LARGE);
    const barRatio = this.isMobile ? CHART_BAR_RATIO_MOBILE : CHART_BAR_RATIO_DESKTOP;
    const barW   = Math.max(2, Math.min(groupW * barRatio, maxBarW));

    const root = svg('svg', { viewBox: `0 0 ${W} ${CH}` });
    root.classList.add('finance-chart-svg');

    const { showTip, hideTip } = createChartTooltip();

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

      if (this.showType !== RecordType.EXPENSE && d.income > 0) {
        const h = (d.income / maxVal) * chartH;
        const x = this.showType === 'both' ? cx - barW - gap / 2 : cx - barW / 2;
        const rect = svg('rect', { x, y: PT + chartH - h, width: barW, height: h, fill: CHART_COLOR_INCOME, rx: CHART_BAR_RADIUS });
        rect.classList.add(CSS_CLASS.FINANCE_CHART_CLICKABLE);
        rect.addEventListener('click', fireClick);
        rect.addEventListener('mouseenter', (e) => showTip(e, `${d.label} — ${this.tr.incomeStat.toLowerCase()}: ${this.fmtNum(d.income)}`));
        rect.addEventListener('mousemove', (e) => showTip(e, `${d.label} — ${this.tr.incomeStat.toLowerCase()}: ${this.fmtNum(d.income)}`));
        rect.addEventListener('mouseleave', hideTip);
        root.appendChild(rect);
      }

      if (this.showType !== RecordType.INCOME && d.expense > 0) {
        const h = (d.expense / maxVal) * chartH;
        const x = this.showType === 'both' ? cx + gap / 2 : cx - barW / 2;
        const rect = svg('rect', { x, y: PT + chartH - h, width: barW, height: h, fill: CHART_COLOR_EXPENSE, rx: CHART_BAR_RADIUS });
        rect.classList.add(CSS_CLASS.FINANCE_CHART_CLICKABLE);
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
      if (data.length > CHART_LABEL_ROTATE_THRESHOLD) {
        lbl.setAttribute('transform', `rotate(-30, ${cx}, ${CH - PB + 20})`);
        lbl.setAttribute('text-anchor', 'end');
      }
      root.appendChild(lbl);
    });

    const wrap = this.chartEl.createDiv('finance-chart-svg-wrap');
    root.classList.add('finance-bar-chart-svg');
    root.style.setProperty('--ft-chart-w', `${W}px`);
    root.style.setProperty('--ft-chart-h', `${CH}px`);
    wrap.appendChild(root);

    if (this.showType === 'both') {
      const legEl = this.chartEl.createDiv('finance-chart-legend');
      const legendItems: [string, string][] = [
        [CHART_COLOR_INCOME, this.tr.incomeStat],
        [CHART_COLOR_EXPENSE, this.tr.expenseStat],
      ];
      legendItems.forEach(([c, lbl]) => {
        const row = legEl.createDiv('finance-chart-legend-row');
        const dot = row.createDiv('finance-chart-legend-dot');
        dot.style.setProperty('--ft-dot-color', c);
        row.createSpan({ text: lbl });
      });
    }
  }

  // ── Pie / donut chart (SVG) ───────────────────────────────────────────────

  private renderPie(rawData: Item[]): void {
    const MAX = 14;
    let items = rawData
      .map(d => ({
        label: d.label,
        value: this.showType === RecordType.INCOME  ? d.income
             : this.showType === RecordType.EXPENSE ? d.expense
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
      this.chartEl.createEl('p', { text: this.tr.noData, cls: CSS_CLASS.FINANCE_EMPTY_SUB });
      return;
    }

    const SZ = 160, cx = SZ / 2, cy = SZ / 2, R = 64, iR = 36;
    const root = svg('svg', { viewBox: `0 0 ${SZ} ${SZ}` });
    root.classList.add('finance-chart-svg');

    const { showTip, hideTip } = createChartTooltip();

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

      const f = (n: number) => n.toFixed(2); // SVG coordinate precision
      const path = svg('path', {
        d:   `M ${f(ix1)} ${f(iy1)} L ${f(x1)} ${f(y1)} A ${R} ${R} 0 ${large} 1 ${f(x2)} ${f(y2)} L ${f(ix2)} ${f(iy2)} A ${iR} ${iR} 0 ${large} 0 ${f(ix1)} ${f(iy1)} Z`,
        fill: CHART_PALETTE[idx % CHART_PALETTE.length]!,
        stroke: 'var(--background-primary)',
        'stroke-width': 2,
      });
      path.classList.add(CSS_CLASS.FINANCE_CHART_CLICKABLE);
      path.addEventListener('mouseenter', (e) => showTip(e, `${d.label}: ${this.fmtNum(d.value)} (${fmtPercentage(d.value, total)})`));
      path.addEventListener('mousemove', (e) => showTip(e, `${d.label}: ${this.fmtNum(d.value)} (${fmtPercentage(d.value, total)})`));
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
    root.classList.add('finance-pie-chart-svg');
    wrap.appendChild(root);

    const legend = wrap.createDiv('finance-pie-legend');
    items.forEach((d, idx) => {
      const row = legend.createDiv('finance-pie-legend-row');
      const dot = row.createDiv('finance-pie-dot');
      dot.style.setProperty('--ft-dot-color', CHART_PALETTE[idx % CHART_PALETTE.length]!);
      row.createSpan({ text: d.label,                      cls: 'finance-pie-label' });
      row.createSpan({ text: `${this.fmtNum(d.value)} · ${fmtPercentage(d.value, total)}`, cls: 'finance-pie-val' });
    });
  }
}
