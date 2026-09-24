import { fmtDate } from "./utils";
import { ViewContext } from './context';
import { CreditRecord, FinanceRecord, CreditAnalyticsGroupBy, CreditType,
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
  PERCENT_100,} from './types';
import { DATE_FORMAT_LENGTH } from './constants';
import { safeEndDate } from './domain/dateMath';
import { round2 } from './domain/money';
import {
  calculateRemainingPrincipal,
  calculateTotalInterestPaid,
  calculatePaymentBreakdown,
} from './domain/creditCalculations';
import { svg, fmtShort, shortMonth, createChartTooltip } from './ui/chartHelpers';
import { renderStatCards, StatCardItem } from './ui/tabHelpers';
import { CSS_CLASS, CreditStatus, PaymentStatus} from './constants';
import { renderDateRangeFilter } from './tabs/tabUtils';
import { BaseAnalyticsView } from './ui/BaseAnalyticsView';

interface PaymentBarItem {
  label: string;
  principal: number;
  interest: number;
  total: number;
}

export class CreditsAnalyticsView extends BaseAnalyticsView {
  private credits: CreditRecord[];
  private chartEl!: HTMLElement;

  constructor(el: HTMLElement, credits: CreditRecord[], _records: FinanceRecord[], ctx: ViewContext) {
    super(el, ctx);
    this.credits = credits;
  }

  render(): void {
    this.setupContainer();

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

    renderDateRangeFilter(
      this.el,
      this.ctx,
      {
        from: 'creditAnalyticsDateFrom',
        to: 'creditAnalyticsDateTo',
      },
      this.tr,
      () => this.render()
    );

    const grpG = row.createDiv('finance-filter-group');
    grpG.createEl('label', { text: this.tr.groupBy, cls: CSS_CLASS.FINANCE_FILTER_LABEL });
    const grpSel = grpG.createEl('select', { cls: CSS_CLASS.FINANCE_FILTER_SELECT });
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
      { label: this.tr.creditTotalBorrowed, value: this.ctx.fmt(totalBorrowed) },
      { label: this.tr.creditTotalRemaining, value: this.ctx.fmt(totalRemaining), mod: CSS_CLASS.EXPENSE },
      { label: this.tr.creditPrincipalPaid, value: this.ctx.fmt(totalPaidPrincipal), mod: CSS_CLASS.INCOME },
      { label: this.tr.creditInterestPaid, value: this.ctx.fmt(totalInterest), mod: 'neutral' },
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
          key = d.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
        } else if (groupBy === 'quarter') {
          const [y, m] = d.split('-');
          const q = Math.ceil(parseInt(m ?? '1') / 3);
          key = `${y}-Q${q}`;
        } else if (groupBy === 'year') {
          key = d.slice(0, DATE_FORMAT_LENGTH.YEAR);
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
      e.createEl('p', { text: this.tr.creditNoAnalyticsData, cls: CSS_CLASS.FINANCE_EMPTY_SUB });
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
        const tipText = `${d.label}\n${this.tr.creditPrincipal}: ${this.ctx.fmt(d.principal)}\n${this.tr.creditInterest}: ${this.ctx.fmt(d.interest)}\n${this.tr.sum}: ${this.ctx.fmt(d.total)}`;
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
    header.createDiv({ text: this.tr.creditPaymentSchedule, cls: 'finance-analytics-section-title' });

    const legend = header.createDiv('finance-chart-legend');
    const legPrincipal = legend.createDiv('finance-chart-legend-row');
    const dotPrin = legPrincipal.createDiv('finance-chart-legend-dot');
    dotPrin.style.setProperty('--ft-dot-color', CHART_COLOR_PRINCIPAL);
    legPrincipal.createSpan({ text: this.tr.creditPrincipal });

    const legInterest = legend.createDiv('finance-chart-legend-row');
    const dotInt = legInterest.createDiv('finance-chart-legend-dot');
    dotInt.style.setProperty('--ft-dot-color', CHART_COLOR_INTEREST);
    legInterest.createSpan({ text: this.tr.creditInterest });

    wrap.before(header);
  }

  private renderProgressList(): void {
    const credits = this.getFilteredCredits().filter(c => c.status === CreditStatus.ACTIVE);
    if (!credits.length) return;

    const section = this.el.createDiv('finance-credit-progress-list');
    section.createDiv({ text: this.tr.creditRepaymentProgress, cls: 'finance-analytics-section-title' });

    credits.forEach(c => {
      const remainingPrincipal = calculateRemainingPrincipal(c);
      const pct = c.originalAmount > 0
        ? Math.min(PERCENT_100, round2(((c.originalAmount - remainingPrincipal) / c.originalAmount) * PERCENT_100))
        : 0;

      const endDate = safeEndDate(c.startDate, c.termMonths);

      const item = section.createDiv('finance-credit-progress-item');
      const header = item.createDiv('finance-credit-progress-header');
      header.createSpan({ text: c.name || c.bankName || '—', cls: 'finance-credit-progress-name' });
      header.createSpan({ text: `${pct}%`, cls: 'finance-credit-progress-pct' });

      const sub = item.createDiv('finance-credit-progress-sub');
      sub.createSpan({ text: c.bankName || '—', cls: 'finance-credit-progress-bank' });
      if (endDate) sub.createSpan({ text: fmtDate(endDate), cls: 'finance-credit-progress-date' });
      sub.createSpan({ text: this.ctx.fmt(remainingPrincipal), cls: 'finance-credit-progress-amount' });

      if (c.originalAmount > 0) {
        const bar = item.createDiv('finance-deposit-progress');
        const fill = bar.createDiv('finance-deposit-progress-fill');
        fill.style.width = `${pct}%`;
      }
    });
  }
}
