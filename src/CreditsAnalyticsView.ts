import { ViewContext } from './context';
import {
  CreditRecord, FinanceRecord, CreditAnalyticsGroupBy,
  CHART_COLOR_EXPENSE, CHART_SVG_HEIGHT, CHART_SVG_PAD_LEFT, CHART_SVG_PAD_RIGHT,
  CHART_SVG_PAD_TOP, CHART_SVG_PAD_BOTTOM, CHART_MIN_GROUP_MOBILE, CHART_MIN_GROUP_DESKTOP,
  CHART_MAX_BAR_W_MOBILE, CHART_MAX_BAR_W_SMALL, CHART_MAX_BAR_W_MED, CHART_MAX_BAR_W_LARGE,
  CHART_BAR_RATIO_MOBILE, CHART_BAR_RATIO_DESKTOP, CHART_BAR_RADIUS,
  PERCENT_100,
} from './types';
import { Translations } from './i18n';
import { addMonthsClamped } from './domain/dateMath';
import { round2 } from './domain/money';

const TOOLTIP_CURSOR_GAP = 12;
const TOOLTIP_EDGE_GAP = 8;

function createChartTooltip(): {
  showTip: (e: MouseEvent, text: string) => void;
  hideTip: () => void;
} {
  const tooltip = document.createElement('div');
  tooltip.className = 'finance-bar-tooltip';
  document.body.appendChild(tooltip);

  return {
    showTip: (e: MouseEvent, text: string) => {
      tooltip.textContent = text;
      tooltip.classList.add('is-visible');
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      let left = e.clientX - tw / 2;
      let top = e.clientY - th - TOOLTIP_CURSOR_GAP;
      if (left < TOOLTIP_EDGE_GAP) left = TOOLTIP_EDGE_GAP;
      if (left + tw > window.innerWidth - TOOLTIP_EDGE_GAP) left = window.innerWidth - tw - TOOLTIP_EDGE_GAP;
      if (top < 4) top = e.clientY + 12;
      tooltip.style.setProperty('--ft-tip-left', `${left}px`);
      tooltip.style.setProperty('--ft-tip-top', `${top}px`);
    },
    hideTip: () => { tooltip.classList.remove('is-visible'); },
  };
}

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

export class CreditsAnalyticsView {
  private el: HTMLElement;
  private credits: CreditRecord[];
  private currency: string;
  private tr: Translations;
  private isMobile: boolean;
  private ctx: ViewContext;
  private chartEl!: HTMLElement;

  constructor(el: HTMLElement, credits: CreditRecord[], _records: FinanceRecord[], ctx: ViewContext) {
    this.el = el;
    this.credits = credits;
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
    return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + this.currency;
  }

  render(): void {
    this.el.empty();
    this.el.addClass('finance-analytics');

    this.renderControls();
    this.renderSummaryCards();
    this.chartEl = this.el.createDiv('finance-chart-area');
    this.renderPaymentChart();
    this.renderProgressList();
  }

  private creditTypeLabel(type: string): string {
    if (type === 'consumer') return this.tr.creditTypeConsumer;
    if (type === 'auto') return this.tr.creditTypeAuto;
    if (type === 'mortgage') return this.tr.creditTypeMortgage;
    return type;
  }

  private renderControls(): void {
    const row = this.el.createDiv('finance-filters-row finance-analytics-date-row');

    const fromG = row.createDiv('finance-filter-group');
    fromG.createEl('label', { text: this.tr.from, cls: 'finance-filter-label' });
    const fromI = fromG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    fromI.value = this.state.creditAnalyticsDateFrom ?? '';
    fromI.addEventListener('change', () => {
      this.state.creditAnalyticsDateFrom = fromI.value;
      this.ctx.saveState();
      this.render();
    });

    const toG = row.createDiv('finance-filter-group');
    toG.createEl('label', { text: this.tr.to, cls: 'finance-filter-label' });
    const toI = toG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    toI.value = this.state.creditAnalyticsDateTo ?? '';
    toI.addEventListener('change', () => {
      this.state.creditAnalyticsDateTo = toI.value;
      this.ctx.saveState();
      this.render();
    });

    const grpG = row.createDiv('finance-filter-group');
    grpG.createEl('label', { text: this.tr.groupBy, cls: 'finance-filter-label' });
    const grpSel = grpG.createEl('select', { cls: 'finance-filter-select' });
    const grpOpts: [CreditAnalyticsGroupBy, string][] = [
      ['month', this.tr.byMonth],
      ['quarter', this.tr.groupByQuarter],
      ['year', this.tr.byYear],
      ['type', this.tr.groupByType],
      ['bank', this.tr.groupByBank],
    ];
    const curGroupBy = this.state.creditAnalyticsGroupBy ?? 'month';
    grpOpts.forEach(([v, l]) => {
      const o = grpSel.createEl('option', { text: l });
      o.value = v;
      o.selected = v === curGroupBy;
    });
    grpSel.addEventListener('change', () => {
      this.state.creditAnalyticsGroupBy = grpSel.value as CreditAnalyticsGroupBy;
      this.ctx.saveState();
      this.render();
    });
  }

  private getFilteredCredits(): CreditRecord[] {
    const dateFrom = this.state.creditAnalyticsDateFrom ?? '';
    const dateTo = this.state.creditAnalyticsDateTo ?? '';
    return this.credits.filter(c => {
      if (dateFrom && c.startDate < dateFrom) return false;
      if (dateTo && c.startDate > dateTo) return false;
      return true;
    });
  }

  private renderSummaryCards(): void {
    const credits = this.getFilteredCredits();
    const totalBorrowed = credits.reduce((s, c) => s + c.originalAmount, 0);
    const totalRemaining = credits.filter(c => c.status === 'active').reduce((s, c) => s + c.currentAmount, 0);
    const totalPaid = credits.reduce((s, c) => s + (c.originalAmount - c.currentAmount), 0);
    const totalPayments = credits.reduce((s, c) => s + c.payments.filter(p => p.status === 'paid').reduce((ps, p) => ps + p.amount, 0), 0);
    // Fixed: Interest = Total Payments Made - Principal Repaid
    // Principal Repaid = Original Amount - Current Remaining
    const totalInterest = Math.max(0, totalPayments - totalPaid);

    const wrap = this.el.createDiv('finance-credit-analytics-cards');
    const cards: { label: string; value: string; mod?: string }[] = [
      { label: this.tr.creditTotalBorrowed, value: this.fmt(totalBorrowed) },
      { label: this.tr.creditTotalRemaining, value: this.fmt(totalRemaining), mod: 'expense' },
      { label: this.tr.creditTotalPaid, value: this.fmt(totalPaid), mod: 'income' },
      { label: this.tr.creditTotalInterest, value: this.fmt(totalInterest), mod: 'neutral' },
    ];
    cards.forEach(({ label, value, mod }) => {
      const card = wrap.createDiv(`finance-stat-card${mod ? ` finance-stat-${mod}` : ''}`);
      const info = card.createDiv('finance-stat-info');
      info.createEl('div', { text: label, cls: 'finance-stat-label' });
      info.createEl('div', { text: value, cls: 'finance-stat-value' });
    });
  }

  private buildBarData(): { label: string; value: number }[] {
    const groupBy = this.state.creditAnalyticsGroupBy ?? 'month';
    const dateFrom = this.state.creditAnalyticsDateFrom ?? '';
    const dateTo = this.state.creditAnalyticsDateTo ?? '';
    const map = new Map<string, number>();

    this.credits.forEach(c => {
      c.payments.forEach(p => {
        if (p.status !== 'paid') return;
        const d = p.paidDate ?? p.dueDate;
        if (!d) return;
        if (dateFrom && d < dateFrom) return;
        if (dateTo && d > dateTo) return;

        let key: string;
        if (groupBy === 'month') {
          key = d.slice(0, 7);
        } else if (groupBy === 'quarter') {
          const [y, m] = d.split('-');
          const q = Math.ceil(parseInt(m ?? '1') / 3);
          key = `${y}-Q${q}`;
        } else if (groupBy === 'year') {
          key = d.slice(0, 4);
        } else if (groupBy === 'type') {
          key = this.creditTypeLabel(c.type);
        } else {
          key = c.bankName || '—';
        }
        map.set(key, (map.get(key) ?? 0) + p.amount);
      });
    });

    let items = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    if (groupBy === 'month' || groupBy === 'quarter' || groupBy === 'year') {
      items.sort((a, b) => a.label.localeCompare(b.label));
      if (groupBy === 'month') {
        items = items.map(d => {
          const [y, m] = d.label.split('-');
          return { ...d, label: `${shortMonth((parseInt(m ?? '1') - 1) % 12, this.locale)} ${y}` };
        });
      }
    } else {
      items.sort((a, b) => b.value - a.value);
    }
    return items;
  }

  private renderPaymentChart(): void {
    const data = this.buildBarData();
    if (!data.length) {
      const e = this.chartEl.createDiv('finance-empty-state finance-empty-chart');
      e.createEl('p', { text: this.tr.creditNoAnalyticsData, cls: 'finance-empty-sub' });
      return;
    }

    const isMobile = this.isMobile;
    const containerW = this.chartEl.clientWidth || 600;
    const MIN_GROUP = data.length > 12 ? CHART_MIN_GROUP_MOBILE : data.length > 6 ? 50 : data.length > 3 ? 55 : CHART_MIN_GROUP_DESKTOP;
    const PL = CHART_SVG_PAD_LEFT, PR = CHART_SVG_PAD_RIGHT;
    const minW = PL + data.length * MIN_GROUP + PR;
    const W = Math.max(minW, containerW);
    const CH = CHART_SVG_HEIGHT;
    const PT = CHART_SVG_PAD_TOP, PB = CHART_SVG_PAD_BOTTOM;
    const chartH = CH - PT - PB;
    const groupW = (W - PL - PR) / data.length;
    const maxBarW = isMobile ? CHART_MAX_BAR_W_MOBILE : (data.length <= 4 ? CHART_MAX_BAR_W_SMALL : data.length <= 8 ? CHART_MAX_BAR_W_MED : CHART_MAX_BAR_W_LARGE);
    const barRatio = isMobile ? CHART_BAR_RATIO_MOBILE : CHART_BAR_RATIO_DESKTOP;
    const barW = Math.max(2, Math.min(groupW * barRatio, maxBarW));

    let maxVal = 1;
    data.forEach(d => { maxVal = Math.max(maxVal, d.value); });

    const { showTip, hideTip } = createChartTooltip();

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
      if (d.value > 0) {
        const h = (d.value / maxVal) * chartH;
        const x = cx - barW / 2;
        const rect = svg('rect', { x, y: PT + chartH - h, width: barW, height: h, fill: CHART_COLOR_EXPENSE, rx: CHART_BAR_RADIUS });
        rect.addEventListener('mouseenter', (e) => showTip(e, `${d.label} — ${this.tr.creditTotalPaid.toLowerCase()}: ${this.fmt(d.value)}`));
        rect.addEventListener('mousemove', (e) => showTip(e, `${d.label} — ${this.tr.creditTotalPaid.toLowerCase()}: ${this.fmt(d.value)}`));
        rect.addEventListener('mouseleave', hideTip);
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

    // title
    const title = this.chartEl.createEl('div', { text: this.tr.creditPaymentSchedule, cls: 'finance-analytics-section-title' });
    wrap.before(title);
  }

  private renderProgressList(): void {
    const credits = this.getFilteredCredits().filter(c => c.status === 'active');
    if (!credits.length) return;

    const section = this.el.createDiv('finance-credit-progress-list');
    section.createEl('div', { text: this.tr.creditRepaymentProgress, cls: 'finance-analytics-section-title' });

    credits.forEach(c => {
      const pct = c.originalAmount > 0
        ? Math.min(PERCENT_100, round2(((c.originalAmount - c.currentAmount) / c.originalAmount) * PERCENT_100))
        : 0;

      const endDate = this.safeEndDate(c);

      const item = section.createDiv('finance-credit-progress-item');
      const header = item.createDiv('finance-credit-progress-header');
      header.createEl('span', { text: c.name || c.bankName || '—', cls: 'finance-credit-progress-name' });
      header.createEl('span', { text: `${pct}%`, cls: 'finance-credit-progress-pct' });

      const sub = item.createDiv('finance-credit-progress-sub');
      sub.createEl('span', { text: c.bankName || '—', cls: 'finance-credit-progress-bank' });
      if (endDate) sub.createEl('span', { text: this.ctx.fmtDate(endDate), cls: 'finance-credit-progress-date' });
      sub.createEl('span', { text: this.fmt(c.currentAmount), cls: 'finance-credit-progress-amount' });

      const bar = item.createDiv('finance-deposit-progress');
      const fill = bar.createDiv('finance-deposit-progress-fill');
      fill.style.width = `${pct}%`;
    });
  }

  private safeEndDate(c: CreditRecord): string {
    if (!c.startDate) return '';
    try { return addMonthsClamped(c.startDate, c.termMonths || 0); } catch { return ''; }
  }
}
