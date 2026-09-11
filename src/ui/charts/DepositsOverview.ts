import { ViewContext } from '../../context';
import { DepositRecord, OVERVIEW_TREND_MONTHS, OVERVIEW_CHART_HEIGHT, OVERVIEW_CHART_PAD_LEFT, OVERVIEW_CHART_PAD_RIGHT, OVERVIEW_CHART_PAD_TOP, OVERVIEW_CHART_PAD_BOTTOM, OVERVIEW_LABEL_OFFSET_Y, OVERVIEW_MIN_GROUP_W, OVERVIEW_MIN_GROUP_W_MOBILE, OVERVIEW_Y_TICKS, OVERVIEW_MAX_BAR_W, OVERVIEW_BAR_SPACING_PAD, OVERVIEW_BAR_RADIUS, OVERVIEW_LINE_STROKE_W, OVERVIEW_POINT_RADIUS, OVERVIEW_POINT_RADIUS_HOVER, CHART_PALETTE } from '../../types';
import { createChartTooltip, fmtShort, svg } from '../chartHelpers';
import { calcDepositInterestOverTime, calcActiveDepositsProgress, DepositInterestMonth, ActiveDepositProgress } from '../../domain/overviewMetrics';
import { fmtDate } from '../../utils';
import { DepositAccrualType, PaymentStatus } from '../../constants';
import { DepositDetailModal } from '../../modals/DepositDetailModal';

export class DepositsOverview {
  private ctx: ViewContext;
  private tooltip = createChartTooltip();

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  destroy(): void {
    this.tooltip.destroy();
  }

  render(
    parent: HTMLElement,
    deposits: DepositRecord[],
    today: string,
    onNavigate?: (mode: 'deposits') => void,
    trendMonths: number = OVERVIEW_TREND_MONTHS,
    onUpdate?: () => void
  ): void {
    const { tr, state } = this.ctx;
    const chartWrap = parent.createDiv('finance-chart-wrap finance-chart-wrap-full');
    chartWrap.createEl('h3', { text: tr.overviewDepositsSummary, cls: 'finance-chart-title' });

    if (deposits.length === 0) {
      chartWrap.createEl('p', { text: tr.overviewNoDeposits, cls: 'finance-no-data' });
      return;
    }

    const depositColorMap = new Map<string, string>();
    deposits.forEach((d, idx) => {
      const color = CHART_PALETTE[idx % CHART_PALETTE.length] ?? 'var(--color-green)';
      depositColorMap.set(d.id, color);
    });

    const interestData = calcDepositInterestOverTime(
      deposits,
      state.overviewDateFrom,
      state.overviewDateTo,
      today,
      trendMonths
    );

    const hasInterestData = interestData.length > 0 && interestData.some(d => d.total > 0);

    if (hasInterestData) {
      this.renderInterestChart(chartWrap, interestData, depositColorMap, deposits);
    }

    const activeDeposits = calcActiveDepositsProgress(deposits, today);
    const section = chartWrap.createDiv('finance-deposits-overview-section');

    if (activeDeposits.length === 0) {
      section.createEl('p', { text: tr.overviewNoActiveDeposits, cls: 'finance-no-data' });
      return;
    }

    this.renderActiveDeposits(section, activeDeposits, depositColorMap, onNavigate, deposits, onUpdate);
  }

  private renderInterestChart(
    parent: HTMLElement,
    interestData: DepositInterestMonth[],
    depositColorMap: Map<string, string>,
    deposits: DepositRecord[]
  ): void {
    const { tr, isMobile } = this.ctx;

    const legend = parent.createDiv('finance-chart-legend');

    deposits.forEach(d => {
      const color = depositColorMap.get(d.id) ?? 'var(--color-green)';
      const item = legend.createDiv('finance-chart-legend-item');
      const dot = item.createSpan({ cls: 'finance-chart-legend-dot' });
      dot.style.background = color;
      item.createSpan({ text: d.name || d.bankName || '—' });
    });

    const itemCumulative = legend.createDiv('finance-chart-legend-item');
    const dotCum = itemCumulative.createSpan({ cls: 'finance-chart-legend-dot' });
    dotCum.style.background = 'var(--color-green)';
    itemCumulative.createSpan({ text: tr.overviewDepositCumulativeProfit });

    const maxMonthlyValue = Math.max(...interestData.map(d => d.total));
    const maxCumulativeValue = Math.max(...interestData.map(d => d.cumulativeTotal)) || 1;

    const minGroupW = isMobile ? OVERVIEW_MIN_GROUP_W_MOBILE : OVERVIEW_MIN_GROUP_W;
    const containerWidth = parent.clientWidth || 400;
    const calculatedWidth = OVERVIEW_CHART_PAD_LEFT + interestData.length * minGroupW + OVERVIEW_CHART_PAD_RIGHT;
    const chartWidth = Math.max(containerWidth, calculatedWidth);

    const plotWidth = chartWidth - OVERVIEW_CHART_PAD_LEFT - OVERVIEW_CHART_PAD_RIGHT;
    const plotHeight = OVERVIEW_CHART_HEIGHT - OVERVIEW_CHART_PAD_TOP - OVERVIEW_CHART_PAD_BOTTOM;

    const spacing = plotWidth / interestData.length;
    const barWidth = Math.min(OVERVIEW_MAX_BAR_W, Math.max(4, spacing - OVERVIEW_BAR_SPACING_PAD));

    const scrollWrap = parent.createDiv('finance-overview-chart-scroll');
    const svg_el = svg('svg', {
      width: chartWidth,
      height: OVERVIEW_CHART_HEIGHT,
      viewBox: `0 0 ${chartWidth} ${OVERVIEW_CHART_HEIGHT}`,
      class: 'finance-chart-svg',
    });

    const baselineY = OVERVIEW_CHART_PAD_TOP + plotHeight;

    // Grid lines
    for (let i = 0; i <= OVERVIEW_Y_TICKS; i++) {
      const y = OVERVIEW_CHART_PAD_TOP + plotHeight * (1 - i / OVERVIEW_Y_TICKS);
      const line = svg('line', {
        x1: OVERVIEW_CHART_PAD_LEFT,
        y1: y,
        x2: OVERVIEW_CHART_PAD_LEFT + plotWidth,
        y2: y,
        stroke: 'var(--background-modifier-border)',
        'stroke-width': 1,
        'stroke-dasharray': '2,2',
      });
      svg_el.appendChild(line);

      const label = svg('text', {
        x: OVERVIEW_CHART_PAD_LEFT - 8,
        y: y + 4,
        'text-anchor': 'end',
        fill: 'var(--text-muted)',
        'font-size': '11px',
      });
      label.textContent = fmtShort((maxMonthlyValue * i) / OVERVIEW_Y_TICKS);
      svg_el.appendChild(label);
    }

    const cumulativePoints: { x: number; y: number; item: DepositInterestMonth }[] = [];

    interestData.forEach((d: DepositInterestMonth, i: number) => {
      const x = OVERVIEW_CHART_PAD_LEFT + i * spacing + (spacing - barWidth) / 2;
      const cx = x + barWidth / 2;

      let accumulatedHeight = 0;

      d.segments.forEach(seg => {
        if (seg.amount <= 0) return;
        const segHeight = maxMonthlyValue > 0 ? (seg.amount / maxMonthlyValue) * plotHeight : 0;
        const segY = baselineY - accumulatedHeight - segHeight;
        const segColor = depositColorMap.get(seg.depositId) ?? 'var(--color-green)';
        const isPending = seg.status === PaymentStatus.PENDING;

        const rect = svg('rect', {
          x: x,
          y: segY,
          width: Math.max(1, barWidth),
          height: Math.max(1, segHeight),
          fill: segColor,
          opacity: isPending ? 0.55 : 1,
          stroke: isPending ? segColor : 'none',
          'stroke-width': isPending ? 1 : 0,
          'stroke-dasharray': isPending ? '2,2' : '',
          rx: OVERVIEW_BAR_RADIUS,
          class: 'finance-chart-bar-hover',
        });

        const statusLabel = isPending ? tr.overviewDepositPending : tr.overviewDepositAccrued;
        const tipText = `${seg.depositName} (${seg.bankName})\n${statusLabel}: ${this.fmt(seg.amount)}\n${d.label}`;
        rect.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        rect.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        rect.addEventListener('mouseleave', () => this.tooltip.hideTip());
        svg_el.appendChild(rect);

        accumulatedHeight += segHeight;
      });

      if (d.cumulativeTotal > 0 && maxCumulativeValue > 0) {
        const cumY = baselineY - Math.min(plotHeight, (d.cumulativeTotal / maxMonthlyValue) * plotHeight);
        cumulativePoints.push({ x: cx, y: cumY, item: d });
      }

      const label = svg('text', {
        x: cx,
        y: baselineY + OVERVIEW_LABEL_OFFSET_Y,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px',
      });
      label.textContent = d.label.slice(5);
      svg_el.appendChild(label);
    });

    // Cumulative line
    if (cumulativePoints.length > 1) {
      const pathD = cumulativePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const cumLine = svg('path', {
        d: pathD,
        stroke: 'var(--color-green)',
        'stroke-width': OVERVIEW_LINE_STROKE_W,
        fill: 'none',
        'stroke-dasharray': '4,4',
      });
      svg_el.appendChild(cumLine);
    }

    // Cumulative points
    cumulativePoints.forEach(p => {
      const point = svg('circle', {
        cx: p.x,
        cy: p.y,
        r: OVERVIEW_POINT_RADIUS,
        fill: 'var(--color-green)',
        class: 'finance-chart-point',
      });
      const tipText = `${p.item.label}\n${tr.overviewDepositCumulativeProfit}: ${this.fmt(p.item.cumulativeTotal)}`;
      point.addEventListener('mouseenter', e => {
        point.setAttribute('r', String(OVERVIEW_POINT_RADIUS_HOVER));
        this.tooltip.showTip(e, tipText);
      });
      point.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
      point.addEventListener('mouseleave', () => {
        point.setAttribute('r', String(OVERVIEW_POINT_RADIUS));
        this.tooltip.hideTip();
      });
      svg_el.appendChild(point);
    });

    scrollWrap.appendChild(svg_el);
  }

  private renderActiveDeposits(
    parent: HTMLElement,
    activeDeposits: ActiveDepositProgress[],
    depositColorMap: Map<string, string>,
    onNavigate?: (mode: 'deposits') => void,
    deposits?: DepositRecord[],
    onUpdate?: () => void
  ): void {
    const { tr } = this.ctx;
    const grid = parent.createDiv('finance-deposits-overview-grid');

    activeDeposits.forEach((dep: ActiveDepositProgress) => {
      const card = grid.createDiv('finance-deposit-overview-card is-clickable');
      card.title = `${dep.name} (${tr.overviewViewDetails})`;

      card.addEventListener('click', () => {
        this.tooltip.hideTip();
        const fullDeposit = deposits?.find(d => d.id === dep.id);
        if (!fullDeposit) return;

        const handleNavigate = () => {
          this.ctx.state.depositExpandedId = dep.id;
          this.ctx.state.depositPage = 0;
          this.ctx.saveState();
          onNavigate?.('deposits');
        };

        new DepositDetailModal(this.ctx.app, {
          ctx: this.ctx,
          deposit: fullDeposit,
          onNavigateToDeposits: onNavigate ? handleNavigate : undefined,
          onDepositUpdated: () => onUpdate?.(),
        }).open();
      });

      const depositColor = depositColorMap.get(dep.id) ?? 'var(--color-green)';

      const header = card.createDiv('finance-deposit-overview-header');
      const nameWrap = header.createDiv('finance-deposit-overview-name-wrap');

      const dot = nameWrap.createSpan({ cls: 'finance-deposit-overview-dot' });
      dot.style.background = depositColor;

      const nameEl = nameWrap.createDiv('finance-deposit-overview-name');
      nameEl.textContent = dep.name;
      nameEl.title = dep.name;

      if (dep.bankName && dep.bankName !== '—') {
        const bankEl = nameWrap.createDiv('finance-deposit-overview-bank');
        bankEl.textContent = dep.bankName;
      }

      const badges = header.createDiv('finance-deposit-overview-badges');
      const accrualTypeBadge = badges.createDiv('finance-deposit-badge accrual-type');
      accrualTypeBadge.textContent =
        dep.accrualType === DepositAccrualType.CAPITALIZATION
          ? tr.overviewDepositCapitalization
          : tr.overviewDepositToAccount;

      const remainingBadge = badges.createDiv('finance-deposit-badge remaining');
      if (dep.isDemand) {
        remainingBadge.textContent = tr.overviewDepositDemand;
      } else if (dep.remainingDays !== null) {
        remainingBadge.textContent = `⏳ ${tr.overviewDepositRemainingDays} ${dep.remainingDays} ${tr.overviewDaysShort}`;
      } else {
        remainingBadge.textContent = '—';
      }

      const bodyRow = card.createDiv('finance-deposit-overview-body-row');

      const col1 = bodyRow.createDiv('finance-deposit-stat-col');
      col1.createDiv({ text: tr.overviewDepositBodyAmount, cls: 'finance-deposit-stat-lbl' });
      const val1 = col1.createDiv('finance-deposit-stat-val');
      val1.createSpan({ text: this.fmt(dep.amount) });
      val1.createSpan({ text: ` (${dep.interestRate}%)`, cls: 'finance-deposit-rate-tag' });

      const col2 = bodyRow.createDiv('finance-deposit-stat-col');
      col2.createDiv({ text: tr.overviewDepositNextPayout, cls: 'finance-deposit-stat-lbl' });
      const val2 = col2.createDiv('finance-deposit-stat-val success');
      if (dep.nextAccrualDate) {
        val2.textContent = `${fmtDate(dep.nextAccrualDate)} · +${this.fmt(dep.nextAccrualAmount ?? 0)}`;
      } else {
        val2.textContent = '—';
      }

      const col3 = bodyRow.createDiv('finance-deposit-stat-col');
      col3.createDiv({ text: tr.overviewDepositTotalProfit, cls: 'finance-deposit-stat-lbl' });
      const val3 = col3.createDiv('finance-deposit-stat-val success');
      val3.createSpan({ text: dep.totalProfit > 0 ? `+${this.fmt(dep.totalProfit)}` : '—' });
      if (dep.totalProfit > 0) {
        const sub = col3.createDiv('finance-deposit-stat-sub');
        const accruedPill = sub.createSpan('finance-deposit-sub-pill accrued');
        accruedPill.createSpan({ cls: 'pill-dot', text: '●' });
        accruedPill.createSpan({ cls: 'pill-text', text: `${this.fmt(dep.accruedProfit)} ${tr.overviewDepositProfitAccrued}` });

        const pendingPill = sub.createSpan('finance-deposit-sub-pill pending');
        pendingPill.createSpan({ cls: 'pill-dot', text: '○' });
        pendingPill.createSpan({ cls: 'pill-text', text: `${this.fmt(dep.pendingProfit)} ${tr.overviewDepositProfitPending}` });
      }

      const col4 = bodyRow.createDiv('finance-deposit-stat-col');
      col4.createDiv({ text: tr.overviewDepositTotalReturn, cls: 'finance-deposit-stat-lbl' });
      const val4 = col4.createDiv('finance-deposit-stat-val bold');
      val4.textContent = this.fmt(dep.totalEstimatedReturn);

      const progressWrap = card.createDiv('finance-deposit-progress');
      const fill = progressWrap.createDiv('finance-deposit-progress-fill');
      fill.style.width = `${dep.progressPercent}%`;
      fill.style.background = depositColor;
    });
  }

  private fmt(amount: number): string {
    return (
      amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) +
      ' ' +
      this.ctx.currency
    );
  }
}
