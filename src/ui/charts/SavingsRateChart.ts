import {
  FinanceRecord,
  OVERVIEW_TREND_MONTHS,
  OVERVIEW_CHART_HEIGHT,
  OVERVIEW_CHART_PAD_LEFT,
  OVERVIEW_CHART_PAD_TOP,
  OVERVIEW_LABEL_OFFSET_Y,
  OVERVIEW_MAX_BAR_W,
  OVERVIEW_BAR_SPACING_PAD,
  OVERVIEW_BAR_RADIUS,
  OVERVIEW_SAVINGS_BENCHMARK,
  SAVINGS_RATE_TICKS,
  SAVINGS_RATE_RANGE,
  PERCENT_100,
  DEFAULT_FILTER,
  AccountMode,
} from '../../types';
import { svg } from '../chartHelpers';
import { calcSavingsRateOverTime, SavingsRateMonth } from '../../domain/metrics';
import { daysInMonth } from '../../domain/dateMath';
import { OverviewRecordsModal } from '../../modals/OverviewRecordsModal';
import { formatChartAmount } from '../../domain/formattingHelpers';
import { BaseChart } from './BaseChart';

export class SavingsRateChart extends BaseChart {

  destroy(): void {
    this.tooltip.destroy();
  }

  render(
    parent: HTMLElement,
    records: FinanceRecord[],
    today: string,
    onNavigate?: (mode: AccountMode) => void,
    trendMonths: number = OVERVIEW_TREND_MONTHS
  ): void {
    const { tr, state } = this.ctx;

    const savingsData = calcSavingsRateOverTime(
      records,
      state.overviewDateFrom,
      state.overviewDateTo,
      today,
      trendMonths
    );

    const { chartWrap, scrollWrap } = this.createChartWrapper(parent, tr.overviewSavingsRateChart);

    this.renderLegend(chartWrap, [
      { label: tr.savingsTarget, cssClass: 'target' },
      { label: tr.savingsModerate, cssClass: 'moderate' },
      { label: tr.savingsDeficit, cssClass: 'deficit' },
    ]);

    if (savingsData.length === 0 || savingsData.every(d => d.income === 0 && d.expense === 0)) {
      this.renderNoData(chartWrap, tr.noChartData);
      return;
    }

    const containerWidth = chartWrap.clientWidth || 400;
    const dims = this.calculateChartDimensions(containerWidth, savingsData.length);

    const groupWidth = dims.plotWidth / savingsData.length;
    const barWidth = Math.min(OVERVIEW_MAX_BAR_W, Math.max(6, groupWidth - OVERVIEW_BAR_SPACING_PAD));

    const svg_el = this.createSvg(dims.chartWidth, dims.chartHeight);

    const baselineY = OVERVIEW_CHART_PAD_TOP + dims.plotHeight / 2;

    // Grid lines: +100%, +50%, 0%, -50%, -100%
    SAVINGS_RATE_TICKS.forEach(rate => {
      const y = OVERVIEW_CHART_PAD_TOP + dims.plotHeight * (1 - (rate + PERCENT_100) / SAVINGS_RATE_RANGE);
      const line = svg('line', {
        x1: OVERVIEW_CHART_PAD_LEFT,
        y1: y,
        x2: OVERVIEW_CHART_PAD_LEFT + dims.plotWidth,
        y2: y,
        stroke: rate === 0 ? 'var(--text-muted)' : 'var(--background-modifier-border)',
        'stroke-width': rate === 0 ? 1.5 : 1,
        'stroke-dasharray': rate === 0 ? '' : '2,2',
      });
      svg_el.appendChild(line);

      const label = svg('text', {
        x: OVERVIEW_CHART_PAD_LEFT - 8,
        y: y + 4,
        'text-anchor': 'end',
        fill: 'var(--text-muted)',
        'font-size': '11px',
      });
      label.textContent = `${rate}%`;
      svg_el.appendChild(label);
    });

    // 20% benchmark reference line (golden standard)
    const benchmarkY = OVERVIEW_CHART_PAD_TOP + dims.plotHeight * (1 - (OVERVIEW_SAVINGS_BENCHMARK + PERCENT_100) / SAVINGS_RATE_RANGE);
    const benchmarkLine = svg('line', {
      x1: OVERVIEW_CHART_PAD_LEFT,
      y1: benchmarkY,
      x2: OVERVIEW_CHART_PAD_LEFT + dims.plotWidth,
      y2: benchmarkY,
      stroke: 'var(--color-green)',
      'stroke-width': 1,
      'stroke-dasharray': '4,4',
      opacity: 0.6,
    });
    svg_el.appendChild(benchmarkLine);

    savingsData.forEach((d: SavingsRateMonth, i: number) => {
      const cx = OVERVIEW_CHART_PAD_LEFT + i * groupWidth + groupWidth / 2;
      const clampedRate = Math.max(-PERCENT_100, Math.min(PERCENT_100, d.savingsRate));
      const rateHeight = (Math.abs(clampedRate) / SAVINGS_RATE_RANGE) * dims.plotHeight;
      const barY = clampedRate >= 0 ? baselineY - rateHeight : baselineY;

      const barColor =
        clampedRate >= OVERVIEW_SAVINGS_BENCHMARK
          ? 'var(--color-green)'
          : clampedRate >= 0
          ? 'var(--color-orange)'
          : 'var(--color-red)';

      const colGroup = svg('g', {
        class: 'finance-chart-bar-hover finance-chart-clickable',
      });

      const hitArea = svg('rect', {
        x: cx - groupWidth / 2,
        y: OVERVIEW_CHART_PAD_TOP,
        width: groupWidth,
        height: OVERVIEW_CHART_HEIGHT - OVERVIEW_CHART_PAD_TOP,
        fill: 'transparent',
      });
      colGroup.appendChild(hitArea);

      const bar = svg('rect', {
        x: cx - barWidth / 2,
        y: barY,
        width: barWidth,
        height: Math.max(2, rateHeight),
        fill: barColor,
        rx: OVERVIEW_BAR_RADIUS,
      });
      colGroup.appendChild(bar);

      const label = svg('text', {
        x: cx,
        y: OVERVIEW_CHART_PAD_TOP + dims.plotHeight + OVERVIEW_LABEL_OFFSET_Y,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px',
      });
      label.textContent = d.label.slice(5);
      colGroup.appendChild(label);

      const tipText = `${d.label}\n${tr.overviewSavingsRate}: ${clampedRate.toFixed(1)}%\n${tr.income}: ${formatChartAmount(d.income, this.ctx.currency)}\n${tr.expense}: ${formatChartAmount(d.expense, this.ctx.currency)}\n${tr.balance}: ${d.savings >= 0 ? '+' : ''}${formatChartAmount(d.savings, this.ctx.currency)}`;
      colGroup.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
      colGroup.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
      colGroup.addEventListener('mouseleave', () => this.tooltip.hideTip());

      if (onNavigate) {
        colGroup.addEventListener('click', () => {
          this.tooltip.hideTip();
          const [y, m] = d.label.split('-');
          if (!y || !m) return;
          const lastDay = daysInMonth(Number(y), Number(m));
          const dateFrom = `${d.label}-01`;
          const dateTo = `${d.label}-${String(lastDay).padStart(2, '0')}`;

          const monthRecords = records.filter(r => !r.isInternal && r.date >= dateFrom && r.date <= dateTo);

          const handleNavigate = () => {
            this.ctx.state.filter = { ...DEFAULT_FILTER };
            this.ctx.state.filter.dateFrom = dateFrom;
            this.ctx.state.filter.dateTo = dateTo;
            this.ctx.state.page = 0;
            this.ctx.saveState();
            onNavigate(AccountMode.RECORDS);
          };

          new OverviewRecordsModal(this.ctx.app, {
            ctx: this.ctx,
            title: d.label,
            records: monthRecords,
            onNavigateToRecords: handleNavigate,
          }).open();
        });
      }

      svg_el.appendChild(colGroup);
    });

    scrollWrap.appendChild(svg_el);
  }
}
