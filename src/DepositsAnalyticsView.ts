import { ViewContext } from './context';
import {
  DepositRecord, DepositAnalyticsGroupBy,
  CHART_COLOR_INCOME, CHART_PALETTE,
  CHART_SVG_HEIGHT, CHART_SVG_PAD_LEFT, CHART_SVG_PAD_RIGHT,
  CHART_SVG_PAD_TOP, CHART_SVG_PAD_BOTTOM, CHART_MIN_GROUP_MOBILE, CHART_MIN_GROUP_DESKTOP,
  CHART_MAX_BAR_W_MOBILE, CHART_MAX_BAR_W_SMALL, CHART_MAX_BAR_W_MED, CHART_MAX_BAR_W_LARGE,
  CHART_BAR_RATIO_MOBILE, CHART_BAR_RATIO_DESKTOP, CHART_BAR_GAP, CHART_BAR_RADIUS,
  PERCENT_100,
} from './types';
import { Translations } from './i18n';
import { addMonthsClamped, toDateStr } from './domain/dateMath';
import { round2 } from './domain/money';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(Math.round(n));
}

function shortMonth(m: number, locale: string): string {
  const d = new Date(2024, m, 1);
  const s = d.toLocaleString(locale, { month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class DepositsAnalyticsView {
  private el: HTMLElement;
  private deposits: DepositRecord[];
  private currency: string;
  private tr: Translations;
  private isMobile: boolean;
  private ctx: ViewContext;
  private chartEl!: HTMLElement;

  constructor(el: HTMLElement, deposits: DepositRecord[], ctx: ViewContext) {
    this.el = el;
    this.deposits = deposits;
    this.currency = ctx.currency;
    this.tr = ctx.tr;
    this.isMobile = ctx.isMobile;
    this.ctx = ctx;
  }

  private get state() { return this.ctx.state; }

  private get locale(): string {
    return this.tr.income === '↑ Доход' ? 'ru' : 'en';
  }

  private fmt(n: number): string {
    return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + this.currency;
  }

  render(): void {
    this.el.empty();
    this.el.addClass('finance-analytics');

    this.renderControls();
    this.renderSummaryCards();
    this.chartEl = this.el.createDiv('finance-chart-area');
    this.renderAccrualChart();
    this.renderDepositList();
    this.renderMaturityTimeline();
  }

  private renderControls(): void {
    const row = this.el.createDiv('finance-filters-row finance-analytics-date-row');

    const fromG = row.createDiv('finance-filter-group');
    fromG.createEl('label', { text: this.tr.from, cls: 'finance-filter-label' });
    const fromI = fromG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    fromI.value = this.state.depositAnalyticsDateFrom ?? '';
    fromI.addEventListener('change', () => {
      this.state.depositAnalyticsDateFrom = fromI.value;
      this.ctx.saveState();
      this.render();
    });

    const toG = row.createDiv('finance-filter-group');
    toG.createEl('label', { text: this.tr.to, cls: 'finance-filter-label' });
    const toI = toG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    toI.value = this.state.depositAnalyticsDateTo ?? '';
    toI.addEventListener('change', () => {
      this.state.depositAnalyticsDateTo = toI.value;
      this.ctx.saveState();
      this.render();
    });

    const grpG = row.createDiv('finance-filter-group');
    grpG.createEl('label', { text: this.tr.groupBy, cls: 'finance-filter-label' });
    const grpSel = grpG.createEl('select', { cls: 'finance-filter-select' });
    const grpOpts: [DepositAnalyticsGroupBy, string][] = [
      ['month', this.tr.byMonth],
      ['quarter', this.tr.groupByQuarter],
      ['year', this.tr.byYear],
      ['type', this.tr.groupByType],
      ['bank', this.tr.groupByBank],
    ];
    const curGroupBy = this.state.depositAnalyticsGroupBy ?? 'month';
    grpOpts.forEach(([v, l]) => {
      const o = grpSel.createEl('option', { text: l });
      o.value = v;
      o.selected = v === curGroupBy;
    });
    grpSel.addEventListener('change', () => {
      this.state.depositAnalyticsGroupBy = grpSel.value as DepositAnalyticsGroupBy;
      this.ctx.saveState();
      this.render();
    });
  }

  private getFilteredDeposits(): DepositRecord[] {
    const dateFrom = this.state.depositAnalyticsDateFrom ?? '';
    const dateTo = this.state.depositAnalyticsDateTo ?? '';
    return this.deposits.filter(d => {
      if (dateFrom && d.startDate < dateFrom) return false;
      if (dateTo && d.startDate > dateTo) return false;
      return true;
    });
  }

  private renderSummaryCards(): void {
    const deposits = this.getFilteredDeposits();
    const active = deposits.filter(d => d.status === 'active');
    const totalBalance = active.reduce((s, d) => s + d.amount, 0);
    const totalAccrued = deposits.reduce((s, d) =>
      s + d.accruals.filter(a => a.status === 'paid').reduce((ps, a) => ps + a.amount, 0), 0);

    const dateTo = this.state.depositAnalyticsDateTo ?? toDateStr(new Date());
    const projectedIncome = deposits.reduce((s, d) =>
      s + d.accruals.filter(a => a.dueDate <= dateTo).reduce((ps, a) => ps + a.amount, 0), 0);

    let weightedRate = 0, totalWeight = 0;
    active.forEach(d => { weightedRate += d.interestRate * d.amount; totalWeight += d.amount; });
    const avgRate = totalWeight > 0 ? round2(weightedRate / totalWeight) : 0;

    const wrap = this.el.createDiv('finance-credit-analytics-cards');
    const cards: { label: string; value: string; mod?: string }[] = [
      { label: this.tr.depositTotalBalance, value: this.fmt(totalBalance) },
      { label: this.tr.depositTotalAccrued, value: this.fmt(totalAccrued), mod: 'income' },
      { label: this.tr.depositProjectedIncome, value: this.fmt(projectedIncome), mod: 'income' },
      { label: this.tr.depositAvgRate, value: `${avgRate}%` },
    ];
    cards.forEach(({ label, value, mod }) => {
      const card = wrap.createDiv(`finance-stat-card${mod ? ` finance-stat-${mod}` : ''}`);
      const info = card.createDiv('finance-stat-info');
      info.createEl('div', { text: label, cls: 'finance-stat-label' });
      info.createEl('div', { text: value, cls: 'finance-stat-value' });
    });
  }

  private buildAccrualBarData(): { label: string; cap: number; toAccount: number }[] {
    const groupBy = this.state.depositAnalyticsGroupBy ?? 'month';
    const dateFrom = this.state.depositAnalyticsDateFrom ?? '';
    const dateTo = this.state.depositAnalyticsDateTo ?? '';
    const mapCap = new Map<string, number>();
    const mapAcc = new Map<string, number>();

    this.deposits.forEach(d => {
      d.accruals.forEach(a => {
        if (a.status !== 'paid') return;
        const dt = a.paidDate ?? a.dueDate;
        if (!dt) return;
        if (dateFrom && dt < dateFrom) return;
        if (dateTo && dt > dateTo) return;

        let key: string;
        if (groupBy === 'month') {
          key = dt.slice(0, 7);
        } else if (groupBy === 'quarter') {
          const [y, m] = dt.split('-');
          const q = Math.ceil(parseInt(m ?? '1') / 3);
          key = `${y}-Q${q}`;
        } else if (groupBy === 'year') {
          key = dt.slice(0, 4);
        } else if (groupBy === 'type') {
          key = d.type;
        } else {
          key = d.bankName || '—';
        }

        if (d.accrualType === 'capitalization') {
          mapCap.set(key, (mapCap.get(key) ?? 0) + a.amount);
        } else {
          mapAcc.set(key, (mapAcc.get(key) ?? 0) + a.amount);
        }
      });
    });

    const keys = new Set([...mapCap.keys(), ...mapAcc.keys()]);
    let items = Array.from(keys).map(label => ({
      label,
      cap: mapCap.get(label) ?? 0,
      toAccount: mapAcc.get(label) ?? 0,
    }));

    if (groupBy === 'month' || groupBy === 'quarter' || groupBy === 'year') {
      items.sort((a, b) => a.label.localeCompare(b.label));
      if (groupBy === 'month') {
        items = items.map(d => {
          const [y, m] = d.label.split('-');
          return { ...d, label: `${shortMonth((parseInt(m ?? '1') - 1) % 12, this.locale)} ${y}` };
        });
      }
    } else {
      items.sort((a, b) => (b.cap + b.toAccount) - (a.cap + a.toAccount));
    }
    return items;
  }

  private renderAccrualChart(): void {
    const data = this.buildAccrualBarData();
    if (!data.length) {
      const e = this.chartEl.createDiv('finance-empty-state finance-empty-chart');
      e.createEl('p', { text: this.tr.depositNoAnalyticsData, cls: 'finance-empty-sub' });
      return;
    }

    const title = this.chartEl.createEl('div', { text: this.tr.depositInterestSchedule, cls: 'finance-analytics-section-title' });

    const isMobile = this.isMobile;
    const containerW = this.chartEl.clientWidth || 600;
    const MIN_GROUP = data.length > 12 ? CHART_MIN_GROUP_MOBILE : data.length > 6 ? 50 : data.length > 3 ? 55 : CHART_MIN_GROUP_DESKTOP;
    const PL = CHART_SVG_PAD_LEFT, PR = CHART_SVG_PAD_RIGHT;
    const minW = PL + data.length * MIN_GROUP + PR;
    const W = Math.max(minW, containerW);
    const CH = CHART_SVG_HEIGHT;
    const PT = CHART_SVG_PAD_TOP, PB = CHART_SVG_PAD_BOTTOM;
    const chartH = CH - PT - PB;
    const gap = CHART_BAR_GAP;
    const groupW = (W - PL - PR) / data.length;
    const maxBarW = isMobile ? CHART_MAX_BAR_W_MOBILE : (data.length <= 4 ? CHART_MAX_BAR_W_SMALL : data.length <= 8 ? CHART_MAX_BAR_W_MED : CHART_MAX_BAR_W_LARGE);
    const barRatio = isMobile ? CHART_BAR_RATIO_MOBILE : CHART_BAR_RATIO_DESKTOP;
    const barW = Math.max(2, Math.min(groupW * barRatio, maxBarW));

    let maxVal = 1;
    data.forEach(d => { maxVal = Math.max(maxVal, d.cap, d.toAccount); });

    const hasBoth = data.some(d => d.cap > 0) && data.some(d => d.toAccount > 0);

    const root = svg('svg', { viewBox: `0 0 ${W} ${CH}` });
    root.classList.add('finance-chart-svg', 'finance-bar-chart-svg');
    root.style.setProperty('--ft-chart-w', `${W}px`);
    root.style.setProperty('--ft-chart-h', `${CH}px`);

    for (let i = 0; i <= 4; i++) {
      const y = PT + chartH * i / 4;
      const val = maxVal * (1 - i / 4);
      const line = svg('line', { x1: PL, y1: y, x2: W - PR, y2: y, stroke: 'var(--background-modifier-border)', 'stroke-width': i === 4 ? 1.5 : 1 });
      if (i > 0 && i < 4) line.setAttribute('stroke-dasharray', '3 4');
      root.appendChild(line);
      const t = svg('text', { x: PL - 8, y: y + 6, 'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': 14 });
      t.textContent = fmtShort(val);
      root.appendChild(t);
    }

    data.forEach((d, i) => {
      const cx = PL + groupW * i + groupW / 2;

      if (d.cap > 0) {
        const h = (d.cap / maxVal) * chartH;
        const x = hasBoth ? cx - barW - gap / 2 : cx - barW / 2;
        const rect = svg('rect', { x, y: PT + chartH - h, width: barW, height: h, fill: CHART_COLOR_INCOME, rx: CHART_BAR_RADIUS });
        root.appendChild(rect);
      }
      if (d.toAccount > 0) {
        const h = (d.toAccount / maxVal) * chartH;
        const x = hasBoth ? cx + gap / 2 : cx - barW / 2;
        const rect = svg('rect', { x, y: PT + chartH - h, width: barW, height: h, fill: CHART_PALETTE[2]!, rx: CHART_BAR_RADIUS });
        root.appendChild(rect);
      }

      const lbl = svg('text', { x: cx, y: CH - PB + 20, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': 12 });
      lbl.textContent = d.label;
      if (data.length > 10) {
        lbl.setAttribute('transform', `rotate(-30, ${cx}, ${CH - PB + 20})`);
        lbl.setAttribute('text-anchor', 'end');
      }
      root.appendChild(lbl);
    });

    const wrap = this.chartEl.createDiv('finance-chart-svg-wrap');
    wrap.appendChild(root);
    title.before(wrap);
    // Put title after wrap
    wrap.after(title);

    if (hasBoth) {
      const legEl = this.chartEl.createDiv('finance-chart-legend');
      const legendItems: [string, string][] = [
        [CHART_COLOR_INCOME, this.tr.accrualCapitalization],
        [CHART_PALETTE[2]!, this.tr.accrualToAccount],
      ];
      legendItems.forEach(([c, lbl]) => {
        const row = legEl.createDiv('finance-chart-legend-row');
        const dot = row.createDiv('finance-chart-legend-dot');
        dot.style.setProperty('--ft-dot-color', c);
        row.createEl('span', { text: lbl });
      });
    }
  }

  private renderDepositList(): void {
    const deposits = this.getFilteredDeposits().filter(d => d.status === 'active');
    if (!deposits.length) return;

    const section = this.el.createDiv('finance-credit-progress-list');
    section.createEl('div', { text: this.tr.depositInterestSchedule, cls: 'finance-analytics-section-title' });

    deposits.forEach(d => {
      const endDate = this.safeEndDate(d);
      const today = toDateStr(new Date());
      let pct = 0;
      if (d.startDate && endDate) {
        const start = new Date(d.startDate).getTime();
        const end = new Date(endDate).getTime();
        const now = new Date(today).getTime();
        const total = end - start;
        if (total > 0) pct = Math.min(PERCENT_100, Math.max(0, round2(((now - start) / total) * PERCENT_100)));
      }

      const item = section.createDiv('finance-credit-progress-item');
      const header = item.createDiv('finance-credit-progress-header');
      header.createEl('span', { text: d.name || d.bankName || '—', cls: 'finance-credit-progress-name' });
      header.createEl('span', { text: `${d.interestRate}%`, cls: 'finance-credit-progress-pct' });

      const sub = item.createDiv('finance-credit-progress-sub');
      sub.createEl('span', { text: d.bankName || '—', cls: 'finance-credit-progress-bank' });
      if (endDate) sub.createEl('span', { text: this.ctx.fmtDate(endDate), cls: 'finance-credit-progress-date' });
      sub.createEl('span', { text: this.fmt(d.amount), cls: 'finance-credit-progress-amount' });

      const bar = item.createDiv('finance-deposit-progress');
      const fill = bar.createDiv('finance-deposit-progress-fill');
      fill.style.width = `${pct}%`;
    });
  }

  private renderMaturityTimeline(): void {
    const today = toDateStr(new Date());
    const sixMonths = addMonthsClamped(today, 6);

    const upcoming = this.getFilteredDeposits()
      .filter(d => d.status === 'active')
      .map(d => ({ d, end: this.safeEndDate(d) }))
      .filter(({ end }) => end && end >= today && end <= sixMonths)
      .sort((a, b) => a.end.localeCompare(b.end));

    if (!upcoming.length) return;

    const section = this.el.createDiv();
    section.createEl('div', { text: this.tr.depositMaturitySoon, cls: 'finance-analytics-section-title' });

    const byMonth = new Map<string, typeof upcoming>();
    upcoming.forEach(item => {
      const key = item.end.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(item);
    });

    byMonth.forEach((items, monthKey) => {
      const [y, m] = monthKey.split('-');
      const label = `${shortMonth((parseInt(m ?? '1') - 1) % 12, this.locale)} ${y}`;
      section.createEl('div', { text: label, cls: 'finance-analytics-month-label' });
      items.forEach(({ d, end }) => {
        const row = section.createDiv('finance-credit-progress-item finance-maturity-item');
        row.createEl('span', { text: d.name || d.bankName || '—', cls: 'finance-credit-progress-name' });
        row.createEl('span', { text: this.ctx.fmtDate(end), cls: 'finance-credit-progress-date' });
        row.createEl('span', { text: this.fmt(d.amount), cls: 'finance-credit-progress-amount' });
      });
    });
  }

  private safeEndDate(d: DepositRecord): string {
    if (!d.startDate) return '';
    try { return addMonthsClamped(d.startDate, d.termMonths || 0); } catch { return ''; }
  }
}
