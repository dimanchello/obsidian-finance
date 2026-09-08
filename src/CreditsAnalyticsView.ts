import { fmtDate, fmtInteger } from "./utils";
import { ViewContext } from './context';
import {
  CreditRecord, FinanceRecord, CreditAnalyticsGroupBy, CreditType,
  CHART_SVG_HEIGHT_COMPACT, CHART_SVG_PAD_LEFT, CHART_SVG_PAD_RIGHT,
  CHART_SVG_PAD_TOP, CHART_SVG_PAD_BOTTOM_COMPACT, CHART_MIN_GROUP_MOBILE, CHART_MIN_GROUP_DESKTOP,
  CHART_MAX_BAR_W_MOBILE, CHART_MAX_BAR_W_SMALL, CHART_MAX_BAR_W_MED, CHART_MAX_BAR_W_LARGE,
  CHART_BAR_RATIO_MOBILE, CHART_BAR_RATIO_DESKTOP, CHART_BAR_RADIUS,
  CHART_COLOR_PRINCIPAL, CHART_COLOR_INTEREST, CHART_GRID_DIVISIONS_COMPACT,
  CHART_CONTAINER_FALLBACK_WIDTH, CHART_MIN_GROUP_MEDIUM, CHART_MIN_GROUP_COMPACT,
  CHART_GROUP_COUNT_MANY, CHART_GROUP_COUNT_SOME, CHART_GROUP_COUNT_FEW,
  CHART_BAR_COUNT_SMALL, CHART_BAR_COUNT_MED, CHART_BAR_MIN_WIDTH,
  CHART_FONT_SIZE_AXIS, CHART_AXIS_LABEL_GAP, CHART_AXIS_BASELINE_WIDTH,
  CHART_TICK_TEXT_OFFSET_Y, CHART_LABEL_OFFSET_Y,
  CHART_LABEL_ROTATE_THRESHOLD, CHART_LABEL_ROTATE_ANGLE,
  PERCENT_100,
} from './types';
import { Translations } from './i18n';
import { safeEndDate } from './domain/dateMath';
import { round2 } from './domain/money';
import {
  calculateRemainingPrincipal,
  calculateTotalInterestPaid,
  calculatePaymentBreakdown,
} from './domain/creditCalculations';
import { svg, fmtShort, shortMonth, createChartTooltip } from './ui/chartHelpers';
import { renderStatCards, StatCardItem } from './ui/tabHelpers';
import { CreditStatus, PaymentStatus } from './constants';

interface PaymentBarItem {
  label: string;
  principal: number;
  interest: number;
  total: number;
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
    return fmtInteger(n, this.currency);
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
    if (type === CreditType.CONSUMER) return this.tr.creditTypeConsumer;
    if (type === CreditType.AUTO) return this.tr.creditTypeAuto;
    if (type === CreditType.MORTGAGE) return this.tr.creditTypeMortgage;
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
    const totalRemaining = credits.filter(c => c.status === CreditStatus.ACTIVE).reduce((s, c) => s + calculateRemainingPrincipal(c), 0);
    const totalPaidPrincipal = credits.reduce((s, c) => s + (c.originalAmount - calculateRemainingPrincipal(c)), 0);
    const totalInterest = credits.reduce((s, c) => s + calculateTotalInterestPaid(c), 0);

    const cards: StatCardItem[] = [
      { label: this.tr.creditTotalBorrowed, value: this.fmt(totalBorrowed) },
      { label: this.tr.creditTotalRemaining, value: this.fmt(totalRemaining), mod: 'expense' },
      { label: this.tr.creditPrincipalPaid, value: this.fmt(totalPaidPrincipal), mod: 'income' },
      { label: this.tr.creditInterestPaid, value: this.fmt(totalInterest), mod: 'neutral' },
    ];
    renderStatCards(this.el, cards, 'finance-credit-analytics-cards');
  }

  private buildBarData(): PaymentBarItem[] {
    const groupBy = this.state.creditAnalyticsGroupBy ?? 'month';
    const dateFrom = this.state.creditAnalyticsDateFrom ?? '';
    const dateTo = this.state.creditAnalyticsDateTo ?? '';
    const mapPrincipal = new Map<string, number>();
    const mapInterest = new Map<string, number>();

    this.credits.forEach(c => {
      let runningPrincipal = c.originalAmount;
      c.payments.forEach((p, i) => {
        if (p.status !== PaymentStatus.PAID) return;
        const d = p.paidDate ?? p.dueDate;
        if (!d) return;

        let principalPart = p.principalPart;
        let interestPart = p.interestPart;

        if (principalPart === undefined || interestPart === undefined) {
          const isLast = i === c.payments.length - 1;
          const breakdown = calculatePaymentBreakdown(runningPrincipal, p.amount, c.interestRate, isLast);
          principalPart = breakdown.principalPart;
          interestPart = breakdown.interestPart;
          runningPrincipal = breakdown.remainingDebt;
        }

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

        mapPrincipal.set(key, (mapPrincipal.get(key) ?? 0) + principalPart);
        mapInterest.set(key, (mapInterest.get(key) ?? 0) + interestPart);
      });
    });

    const allKeys = new Set([...mapPrincipal.keys(), ...mapInterest.keys()]);
    let items: PaymentBarItem[] = Array.from(allKeys).map(key => {
      const principal = mapPrincipal.get(key) ?? 0;
      const interest = mapInterest.get(key) ?? 0;
      return {
        label: key,
        principal: round2(principal),
        interest: round2(interest),
        total: round2(principal + interest),
      };
    });

    if (groupBy === 'month' || groupBy === 'quarter' || groupBy === 'year') {
      items.sort((a, b) => a.label.localeCompare(b.label));
      if (groupBy === 'month') {
        items = items.map(d => {
          const [y, m] = d.label.split('-');
          return { ...d, label: `${shortMonth((parseInt(m ?? '1') - 1) % 12, this.locale)} ${y}` };
        });
      }
    } else {
      items.sort((a, b) => b.total - a.total);
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
    const containerW = this.chartEl.clientWidth || CHART_CONTAINER_FALLBACK_WIDTH;
    const MIN_GROUP = data.length > CHART_GROUP_COUNT_MANY ? CHART_MIN_GROUP_MOBILE
      : data.length > CHART_GROUP_COUNT_SOME ? CHART_MIN_GROUP_MEDIUM
        : data.length > CHART_GROUP_COUNT_FEW ? CHART_MIN_GROUP_COMPACT
          : CHART_MIN_GROUP_DESKTOP;
    const PL = CHART_SVG_PAD_LEFT, PR = CHART_SVG_PAD_RIGHT;
    const minW = PL + data.length * MIN_GROUP + PR;
    const W = Math.max(minW, containerW);
    const CH = CHART_SVG_HEIGHT_COMPACT;
    const PT = CHART_SVG_PAD_TOP, PB = CHART_SVG_PAD_BOTTOM_COMPACT;
    const chartH = CH - PT - PB;
    const groupW = (W - PL - PR) / data.length;
    const maxBarW = isMobile ? CHART_MAX_BAR_W_MOBILE
      : (data.length <= CHART_BAR_COUNT_SMALL ? CHART_MAX_BAR_W_SMALL
        : data.length <= CHART_BAR_COUNT_MED ? CHART_MAX_BAR_W_MED : CHART_MAX_BAR_W_LARGE);
    const barRatio = isMobile ? CHART_BAR_RATIO_MOBILE : CHART_BAR_RATIO_DESKTOP;
    const barW = Math.max(CHART_BAR_MIN_WIDTH, Math.min(groupW * barRatio, maxBarW));

    let maxVal = 1;
    data.forEach(d => { maxVal = Math.max(maxVal, d.total); });

    const { showTip, hideTip } = createChartTooltip();

    const root = svg('svg', { viewBox: `0 0 ${W} ${CH}` });
    root.classList.add('finance-chart-svg', 'finance-bar-chart-svg');
    root.style.setProperty('--ft-chart-w', `${W}px`);
    root.style.setProperty('--ft-chart-h', `${CH}px`);

    const divisions = CHART_GRID_DIVISIONS_COMPACT;
    for (let i = 0; i <= divisions; i++) {
      const y = PT + chartH * i / divisions;
      const val = maxVal * (1 - i / divisions);
      const line = svg('line', {
        x1: PL, y1: y, x2: W - PR, y2: y,
        stroke: 'var(--background-modifier-border)',
        'stroke-width': i === divisions ? CHART_AXIS_BASELINE_WIDTH : 1,
      });
      if (i > 0 && i < divisions) line.setAttribute('stroke-dasharray', '3 4');
      root.appendChild(line);
      const t = svg('text', {
        x: PL - CHART_AXIS_LABEL_GAP, y: y + CHART_TICK_TEXT_OFFSET_Y,
        'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': CHART_FONT_SIZE_AXIS,
      });
      t.textContent = fmtShort(val);
      root.appendChild(t);
    }

    data.forEach((d, i) => {
      const cx = PL + groupW * i + groupW / 2;
      const x = cx - barW / 2;

      if (d.total > 0) {
        const totalH = (d.total / maxVal) * chartH;
        const interestH = (d.interest / maxVal) * chartH;
        const principalH = totalH - interestH;

        // Bottom rect: Interest (Red)
        if (interestH > 0) {
          const interestY = PT + chartH - interestH;
          const rectInt = svg('rect', {
            x, y: interestY, width: barW, height: interestH,
            fill: CHART_COLOR_INTEREST,
            rx: principalH > 0 ? 0 : CHART_BAR_RADIUS,
          });
          root.appendChild(rectInt);
        }

        // Top rect: Principal (Purple)
        if (principalH > 0) {
          const principalY = PT + chartH - totalH;
          const rectPrin = svg('rect', {
            x, y: principalY, width: barW, height: principalH,
            fill: CHART_COLOR_PRINCIPAL,
            rx: CHART_BAR_RADIUS,
          });
          root.appendChild(rectPrin);
        }

        // Transparent hit-area rect for tooltip
        const hitRect = svg('rect', {
          x, y: PT + chartH - totalH, width: barW, height: totalH,
          fill: 'transparent',
        });
        const tipText = `${d.label}\n${this.tr.creditPrincipal}: ${this.fmt(d.principal)}\n${this.tr.creditInterest}: ${this.fmt(d.interest)}\n${this.tr.sum}: ${this.fmt(d.total)}`;
        hitRect.addEventListener('mouseenter', e => showTip(e, tipText));
        hitRect.addEventListener('mousemove', e => showTip(e, tipText));
        hitRect.addEventListener('mouseleave', hideTip);
        root.appendChild(hitRect);
      }

      const lbl = svg('text', {
        x: cx, y: CH - PB + CHART_LABEL_OFFSET_Y,
        'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': CHART_FONT_SIZE_AXIS,
      });
      lbl.textContent = d.label;
      if (data.length > CHART_LABEL_ROTATE_THRESHOLD) {
        lbl.setAttribute('transform',
          `rotate(${CHART_LABEL_ROTATE_ANGLE}, ${cx}, ${CH - PB + CHART_LABEL_OFFSET_Y})`);
        lbl.setAttribute('text-anchor', 'end');
      }
      root.appendChild(lbl);
    });

    const wrap = this.chartEl.createDiv('finance-chart-svg-wrap');
    wrap.appendChild(root);

    // Title & Legend
    const header = this.chartEl.createDiv('finance-chart-header-row');
    header.createEl('div', { text: this.tr.creditPaymentSchedule, cls: 'finance-analytics-section-title' });

    const legend = header.createDiv('finance-chart-legend');
    const legPrincipal = legend.createDiv('finance-chart-legend-row');
    const dotPrin = legPrincipal.createDiv('finance-chart-legend-dot');
    dotPrin.style.setProperty('--ft-dot-color', CHART_COLOR_PRINCIPAL);
    legPrincipal.createEl('span', { text: this.tr.creditPrincipal });

    const legInterest = legend.createDiv('finance-chart-legend-row');
    const dotInt = legInterest.createDiv('finance-chart-legend-dot');
    dotInt.style.setProperty('--ft-dot-color', CHART_COLOR_INTEREST);
    legInterest.createEl('span', { text: this.tr.creditInterest });

    wrap.before(header);
  }

  private renderProgressList(): void {
    const credits = this.getFilteredCredits().filter(c => c.status === CreditStatus.ACTIVE);
    if (!credits.length) return;

    const section = this.el.createDiv('finance-credit-progress-list');
    section.createEl('div', { text: this.tr.creditRepaymentProgress, cls: 'finance-analytics-section-title' });

    credits.forEach(c => {
      const remainingPrincipal = calculateRemainingPrincipal(c);
      const pct = c.originalAmount > 0
        ? Math.min(PERCENT_100, round2(((c.originalAmount - remainingPrincipal) / c.originalAmount) * PERCENT_100))
        : 0;

      const endDate = safeEndDate(c.startDate, c.termMonths);

      const item = section.createDiv('finance-credit-progress-item');
      const header = item.createDiv('finance-credit-progress-header');
      header.createEl('span', { text: c.name || c.bankName || '—', cls: 'finance-credit-progress-name' });
      header.createEl('span', { text: `${pct}%`, cls: 'finance-credit-progress-pct' });

      const sub = item.createDiv('finance-credit-progress-sub');
      sub.createEl('span', { text: c.bankName || '—', cls: 'finance-credit-progress-bank' });
      if (endDate) sub.createEl('span', { text: fmtDate(endDate), cls: 'finance-credit-progress-date' });
      sub.createEl('span', { text: this.fmt(remainingPrincipal), cls: 'finance-credit-progress-amount' });

      const bar = item.createDiv('finance-deposit-progress');
      const fill = bar.createDiv('finance-deposit-progress-fill');
      fill.style.width = `${pct}%`;
    });
  }
}
