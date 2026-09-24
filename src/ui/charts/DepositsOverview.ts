import { DepositRecord, OVERVIEW_TREND_MONTHS, OVERVIEW_CHART_PAD_LEFT, OVERVIEW_CHART_PAD_TOP, OVERVIEW_LABEL_OFFSET_Y, OVERVIEW_MAX_BAR_W, OVERVIEW_BAR_SPACING_PAD, OVERVIEW_BAR_RADIUS, OVERVIEW_LINE_STROKE_W, OVERVIEW_POINT_RADIUS, OVERVIEW_POINT_RADIUS_HOVER, CHART_PALETTE, AccountMode, PERCENT_100 } from '../../types';
import { CSS_CLASS } from '../../constants';
import { fmtShort, svg } from '../chartHelpers';
import { calcDepositInterestOverTime, calcActiveDepositsProgress, DepositInterestMonth, ActiveDepositProgress } from '../../domain/metrics';
import { fmtDate } from '../../utils';
import { DepositAccrualType, PaymentStatus } from '../../constants';
import { DepositDetailModal } from '../../modals/DepositDetailModal';
import { formatChartAmount } from '../../domain/formattingHelpers';
import { BaseChart } from './BaseChart';

export class DepositsOverview extends BaseChart {

  destroy(): void {
    this.tooltip.destroy();
  }

  render(
    parent: HTMLElement,
    deposits: DepositRecord[],
    today: string,
    onNavigate?: (mode: AccountMode) => void,
    trendMonths: number = OVERVIEW_TREND_MONTHS,
    onUpdate?: () => void
  ): void {
    const { tr, state } = this.ctx;
    const chartWrap = parent.createDiv('finance-chart-wrap finance-chart-wrap-full');
    chartWrap.createEl('h3', { text: tr.overviewDepositsSummary, cls: CSS_CLASS.FINANCE_CHART_TITLE });

    if (deposits.length === 0) {
      this.renderNoData(chartWrap, tr.overviewNoDeposits);
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
      this.renderNoData(section, tr.overviewNoActiveDeposits);
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
    const { tr } = this.ctx;

    const legendItems: { label: string; color?: string; cssClass?: string }[] = deposits.map(d => ({
      label: d.name || d.bankName || '—',
      color: depositColorMap.get(d.id) ?? 'var(--color-green)',
    }));

    legendItems.push({
      label: tr.overviewDepositCumulativeProfit,
      cssClass: 'is-cumulative',
    });

    this.renderLegend(parent, legendItems);

    const maxMonthlyValue = Math.max(...interestData.map(d => d.total));
    const maxCumulativeValue = Math.max(...interestData.map(d => d.cumulativeTotal)) || 1;

    const containerWidth = parent.clientWidth || 400;
    const dims = this.calculateChartDimensions(containerWidth, interestData.length);

    const spacing = dims.plotWidth / interestData.length;
    const barWidth = Math.min(OVERVIEW_MAX_BAR_W, Math.max(4, spacing - OVERVIEW_BAR_SPACING_PAD));

    const scrollWrap = parent.createDiv('finance-overview-chart-scroll');
    const svg_el = this.createSvg(dims.chartWidth, dims.chartHeight);

    const baselineY = OVERVIEW_CHART_PAD_TOP + dims.plotHeight;

    // Grid lines
    this.renderYAxisGrid(svg_el, dims.plotWidth, dims.plotHeight, maxMonthlyValue, {
      formatLabel: (v: number) => fmtShort(v),
    });

    const cumulativePoints: { x: number; y: number; item: DepositInterestMonth }[] = [];

    interestData.forEach((d: DepositInterestMonth, i: number) => {
      const x = OVERVIEW_CHART_PAD_LEFT + i * spacing + (spacing - barWidth) / 2;
      const cx = x + barWidth / 2;

      let accumulatedHeight = 0;

      d.segments.forEach(seg => {
        if (seg.amount <= 0) return;
        const segHeight = maxMonthlyValue > 0 ? (seg.amount / maxMonthlyValue) * dims.plotHeight : 0;
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
        const tipText = `${seg.depositName} (${seg.bankName})\n${statusLabel}: ${formatChartAmount(seg.amount, this.ctx.currency)}\n${d.label}`;
        rect.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        rect.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        rect.addEventListener('mouseleave', () => this.tooltip.hideTip());
        svg_el.appendChild(rect);

        accumulatedHeight += segHeight;
      });

      if (d.cumulativeTotal > 0 && maxCumulativeValue > 0) {
        const cumY = baselineY - Math.min(dims.plotHeight, (d.cumulativeTotal / maxMonthlyValue) * dims.plotHeight);
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
      const tipText = `${p.item.label}\n${tr.overviewDepositCumulativeProfit}: ${formatChartAmount(p.item.cumulativeTotal, this.ctx.currency)}`;
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
    onNavigate?: (mode: AccountMode) => void,
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
          onNavigate?.(AccountMode.DEPOSITS);
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
      val1.createSpan({ text: formatChartAmount(dep.amount, this.ctx.currency) });
      val1.createSpan({ text: ` (${dep.interestRate}%)`, cls: 'finance-deposit-rate-tag' });

      const col2 = bodyRow.createDiv('finance-deposit-stat-col');
      col2.createDiv({ text: tr.overviewDepositNextPayout, cls: 'finance-deposit-stat-lbl' });
      const val2 = col2.createDiv('finance-deposit-stat-val success');
      if (dep.nextAccrualDate) {
        val2.textContent = `${fmtDate(dep.nextAccrualDate)} · +${formatChartAmount(dep.nextAccrualAmount ?? 0, this.ctx.currency)}`;
      } else {
        val2.textContent = '—';
      }

      const col3 = bodyRow.createDiv('finance-deposit-stat-col');
      col3.createDiv({ text: tr.overviewDepositTotalProfit, cls: 'finance-deposit-stat-lbl' });
      const val3 = col3.createDiv('finance-deposit-stat-val success');
      val3.createSpan({ text: dep.totalProfit > 0 ? `+${formatChartAmount(dep.totalProfit, this.ctx.currency)}` : '—' });
      if (dep.totalProfit > 0) {
        const sub = col3.createDiv('finance-deposit-stat-sub');
        const accruedPill = sub.createSpan('finance-deposit-sub-pill accrued');
        accruedPill.createSpan({ cls: 'pill-dot', text: '●' });
        accruedPill.createSpan({ cls: 'pill-text', text: `${formatChartAmount(dep.accruedProfit, this.ctx.currency)} ${tr.overviewDepositProfitAccrued}` });

        const pendingPill = sub.createSpan('finance-deposit-sub-pill pending');
        pendingPill.createSpan({ cls: 'pill-dot', text: '○' });
        pendingPill.createSpan({ cls: 'pill-text', text: `${formatChartAmount(dep.pendingProfit, this.ctx.currency)} ${tr.overviewDepositProfitPending}` });
      }

      const col4 = bodyRow.createDiv('finance-deposit-stat-col');
      col4.createDiv({ text: tr.overviewDepositTotalReturn, cls: 'finance-deposit-stat-lbl' });
      const val4 = col4.createDiv('finance-deposit-stat-val bold');
      val4.textContent = formatChartAmount(dep.totalEstimatedReturn, this.ctx.currency);

      if (!dep.isDemand && dep.remainingDays !== null) {
        const progressWrap = card.createDiv('finance-deposit-progress');
        const fill = progressWrap.createDiv('finance-deposit-progress-fill');
        fill.style.width = `${Math.min(PERCENT_100, Math.max(0, dep.progressPercent))}%`;
        fill.style.background = depositColor;
      }
    });
  }
}
