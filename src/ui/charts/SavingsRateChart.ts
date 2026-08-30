import { ViewContext } from '../../context';
import { FinanceRecord, OVERVIEW_TREND_MONTHS, OVERVIEW_CHART_HEIGHT, OVERVIEW_CHART_PAD_LEFT, OVERVIEW_CHART_PAD_RIGHT, OVERVIEW_CHART_PAD_TOP, OVERVIEW_CHART_PAD_BOTTOM, OVERVIEW_LABEL_OFFSET_Y, OVERVIEW_MIN_GROUP_W, OVERVIEW_MIN_GROUP_W_MOBILE, OVERVIEW_MAX_BAR_W, OVERVIEW_BAR_SPACING_PAD, OVERVIEW_BAR_RADIUS, OVERVIEW_SAVINGS_BENCHMARK } from '../../types';
import { createChartTooltip, svg } from '../chartHelpers';
import { calcSavingsRateOverTime, SavingsRateMonth } from '../../domain/overviewMetrics';

export class SavingsRateChart {
  private ctx: ViewContext;
  private tooltip = createChartTooltip();

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  destroy(): void {
    this.tooltip.destroy();
  }

  render(parent: HTMLElement, records: FinanceRecord[], today: string): void {
    const { tr, state, isMobile } = this.ctx;
    const chartWrap = parent.createDiv('finance-chart-wrap');
    chartWrap.createEl('h3', { text: tr.overviewSavingsRateChart, cls: 'finance-chart-title' });

    const legend = chartWrap.createDiv('finance-chart-legend');
    const itemTarget = legend.createDiv('finance-chart-legend-item');
    itemTarget.createSpan({ cls: 'finance-chart-legend-dot target' });
    itemTarget.createSpan({ text: tr.savingsTarget });

    const itemMod = legend.createDiv('finance-chart-legend-item');
    itemMod.createSpan({ cls: 'finance-chart-legend-dot moderate' });
    itemMod.createSpan({ text: tr.savingsModerate });

    const itemDef = legend.createDiv('finance-chart-legend-item');
    itemDef.createSpan({ cls: 'finance-chart-legend-dot deficit' });
    itemDef.createSpan({ text: tr.savingsDeficit });

    const savingsData = calcSavingsRateOverTime(
      records,
      state.overviewDateFrom,
      state.overviewDateTo,
      today,
      OVERVIEW_TREND_MONTHS
    );

    if (savingsData.length === 0 || savingsData.every(d => d.income === 0 && d.expense === 0)) {
      chartWrap.createEl('p', { text: tr.noChartData, cls: 'finance-no-data' });
      return;
    }

    const minGroupW = isMobile ? OVERVIEW_MIN_GROUP_W_MOBILE : OVERVIEW_MIN_GROUP_W;
    const containerWidth = chartWrap.clientWidth || 400;
    const calculatedWidth = OVERVIEW_CHART_PAD_LEFT + savingsData.length * minGroupW + OVERVIEW_CHART_PAD_RIGHT;
    const chartWidth = Math.max(containerWidth, calculatedWidth);

    const plotWidth = chartWidth - OVERVIEW_CHART_PAD_LEFT - OVERVIEW_CHART_PAD_RIGHT;
    const plotHeight = OVERVIEW_CHART_HEIGHT - OVERVIEW_CHART_PAD_TOP - OVERVIEW_CHART_PAD_BOTTOM;

    const groupWidth = plotWidth / savingsData.length;
    const barWidth = Math.min(OVERVIEW_MAX_BAR_W, Math.max(6, groupWidth - OVERVIEW_BAR_SPACING_PAD));

    const scrollWrap = chartWrap.createDiv('finance-overview-chart-scroll');
    const svg_el = svg('svg', {
      width: chartWidth,
      height: OVERVIEW_CHART_HEIGHT,
      viewBox: `0 0 ${chartWidth} ${OVERVIEW_CHART_HEIGHT}`,
      class: 'finance-chart-svg',
    });

    const baselineY = OVERVIEW_CHART_PAD_TOP + plotHeight / 2;

    // Grid lines: +100%, +50%, 0%, -50%, -100%
    const ticks = [100, 50, 0, -50, -100];
    ticks.forEach(rate => {
      const y = OVERVIEW_CHART_PAD_TOP + plotHeight * (1 - (rate + 100) / 200);
      const line = svg('line', {
        x1: OVERVIEW_CHART_PAD_LEFT,
        y1: y,
        x2: OVERVIEW_CHART_PAD_LEFT + plotWidth,
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
    const benchmarkY = OVERVIEW_CHART_PAD_TOP + plotHeight * (1 - (OVERVIEW_SAVINGS_BENCHMARK + 100) / 200);
    const benchmarkLine = svg('line', {
      x1: OVERVIEW_CHART_PAD_LEFT,
      y1: benchmarkY,
      x2: OVERVIEW_CHART_PAD_LEFT + plotWidth,
      y2: benchmarkY,
      stroke: 'var(--color-green)',
      'stroke-width': 1,
      'stroke-dasharray': '4,4',
      opacity: 0.6,
    });
    svg_el.appendChild(benchmarkLine);

    savingsData.forEach((d: SavingsRateMonth, i: number) => {
      const cx = OVERVIEW_CHART_PAD_LEFT + i * groupWidth + groupWidth / 2;
      const clampedRate = Math.max(-100, Math.min(100, d.savingsRate));
      const rateHeight = (Math.abs(clampedRate) / 200) * plotHeight;
      const barY = clampedRate >= 0 ? baselineY - rateHeight : baselineY;

      const barColor =
        clampedRate >= OVERVIEW_SAVINGS_BENCHMARK
          ? 'var(--color-green)'
          : clampedRate >= 0
          ? 'var(--color-orange)'
          : 'var(--color-red)';

      const bar = svg('rect', {
        x: cx - barWidth / 2,
        y: barY,
        width: barWidth,
        height: Math.max(2, rateHeight),
        fill: barColor,
        rx: OVERVIEW_BAR_RADIUS,
        class: 'finance-chart-bar-hover',
      });

      const tipText = `${d.label}\n${tr.overviewSavingsRate}: ${clampedRate.toFixed(1)}%\n${tr.income}: ${this.fmt(d.income)}\n${tr.expense}: ${this.fmt(d.expense)}\n${tr.balance}: ${(d.savings >= 0 ? '+' : '') + this.fmt(d.savings)}`;
      bar.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
      bar.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
      bar.addEventListener('mouseleave', () => this.tooltip.hideTip());
      svg_el.appendChild(bar);

      const label = svg('text', {
        x: cx,
        y: OVERVIEW_CHART_PAD_TOP + plotHeight + OVERVIEW_LABEL_OFFSET_Y,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px',
      });
      label.textContent = d.label.slice(5);
      svg_el.appendChild(label);
    });

    scrollWrap.appendChild(svg_el);
  }

  private fmt(amount: number): string {
    return (
      amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) +
      ' ' +
      this.ctx.currency
    );
  }
}
