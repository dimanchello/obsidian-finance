import { ViewContext } from '../../context';
import { FinanceRecord } from '../../types';
import {
  groupRecordsByMonth,
  MonthGroup,
} from '../../domain/overviewMetrics';
import { createChartTooltip, fmtShort, svg } from '../chartHelpers';
import {
  OVERVIEW_CHART_HEIGHT,
  OVERVIEW_CHART_PAD_LEFT,
  OVERVIEW_CHART_PAD_RIGHT,
  OVERVIEW_CHART_PAD_TOP,
  OVERVIEW_CHART_PAD_BOTTOM,
  OVERVIEW_LABEL_OFFSET_Y,
  OVERVIEW_BAR_GAP,
  OVERVIEW_GROUP_GAP,
  OVERVIEW_MIN_GROUP_W,
  OVERVIEW_MIN_GROUP_W_MOBILE,
  OVERVIEW_Y_TICKS,
  OVERVIEW_MAX_BAR_W,
  OVERVIEW_BAR_RADIUS,
  OVERVIEW_LINE_STROKE_W,
  OVERVIEW_POINT_RADIUS,
  OVERVIEW_POINT_RADIUS_HOVER,
} from '../../types';

/**
 * MoneyFlowChart: визуализация доходов, расходов и чистого баланса по месяцам.
 * Отображает столбчатый график с доходами (зелёный) и расходами (красный),
 * а также линию тренда чистого баланса.
 */
export class MoneyFlowChart {
  private ctx: ViewContext;
  private tooltip = createChartTooltip();

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  /**
   * Рендерит график в указанный контейнер.
   * @param parent - родительский HTML элемент
   * @param records - массив финансовых записей для отображения
   */
  render(parent: HTMLElement, records: FinanceRecord[]): void {
    const { tr } = this.ctx;

    const chartWrap = parent.createDiv('finance-chart-wrap');
    chartWrap.createEl('h3', { text: tr.overviewMoneyFlow, cls: 'finance-chart-title' });

    const groups = groupRecordsByMonth(records);
    if (groups.length === 0) {
      chartWrap.createEl('p', { text: tr.noChartData, cls: 'finance-no-data' });
      return;
    }

    const maxValue = Math.max(
      ...groups.map((g: MonthGroup) => Math.max(g.income, g.expense))
    );

    const minGroupW = this.ctx.isMobile ? OVERVIEW_MIN_GROUP_W_MOBILE : OVERVIEW_MIN_GROUP_W;
    const containerWidth = chartWrap.clientWidth || 400;
    const calculatedWidth = OVERVIEW_CHART_PAD_LEFT + groups.length * minGroupW + OVERVIEW_CHART_PAD_RIGHT;
    const chartWidth = Math.max(containerWidth, calculatedWidth);

    const plotWidth = chartWidth - OVERVIEW_CHART_PAD_LEFT - OVERVIEW_CHART_PAD_RIGHT;
    const plotHeight = OVERVIEW_CHART_HEIGHT - OVERVIEW_CHART_PAD_TOP - OVERVIEW_CHART_PAD_BOTTOM;

    const groupWidth = plotWidth / groups.length;
    const rawBarWidth = (groupWidth - OVERVIEW_GROUP_GAP - OVERVIEW_BAR_GAP) / 2;
    const barWidth = Math.min(OVERVIEW_MAX_BAR_W, Math.max(2, rawBarWidth));

    const scrollWrap = chartWrap.createDiv('finance-overview-chart-scroll');
    const svg_el = svg('svg', {
      width: chartWidth,
      height: OVERVIEW_CHART_HEIGHT,
      viewBox: `0 0 ${chartWidth} ${OVERVIEW_CHART_HEIGHT}`,
      class: 'finance-chart-svg',
    });

    const baselineY = OVERVIEW_CHART_PAD_TOP + plotHeight;

    // Y-axis grid and labels
    this.renderYAxisGrid(svg_el, plotWidth, plotHeight, maxValue);

    // Bars and net line
    const netPoints = this.renderBars(svg_el, groups, groupWidth, barWidth, baselineY, plotHeight, maxValue);

    // Net balance trend line
    this.renderNetLine(svg_el, netPoints);

    // Net balance points
    this.renderNetPoints(svg_el, netPoints);

    scrollWrap.appendChild(svg_el);
  }

  private renderYAxisGrid(svg_el: SVGElement, plotWidth: number, plotHeight: number, maxValue: number): void {
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
      label.textContent = fmtShort((maxValue * i) / OVERVIEW_Y_TICKS);
      svg_el.appendChild(label);
    }
  }

  private renderBars(
    svg_el: SVGElement,
    groups: MonthGroup[],
    groupWidth: number,
    barWidth: number,
    baselineY: number,
    plotHeight: number,
    maxValue: number
  ): { x: number; y: number; group: MonthGroup }[] {
    const { tr } = this.ctx;
    const netPoints: { x: number; y: number; group: MonthGroup }[] = [];

    groups.forEach((g: MonthGroup, i: number) => {
      const cx = OVERVIEW_CHART_PAD_LEFT + i * groupWidth + groupWidth / 2;

      // Income bar
      if (g.income > 0) {
        const incomeHeight = maxValue > 0 ? (g.income / maxValue) * plotHeight : 0;
        const incomeBar = svg('rect', {
          x: cx - barWidth - OVERVIEW_BAR_GAP / 2,
          y: baselineY - incomeHeight,
          width: barWidth,
          height: incomeHeight,
          fill: 'var(--color-green)',
          rx: OVERVIEW_BAR_RADIUS,
          class: 'finance-chart-bar-hover',
        });
        const tipText = `${g.label}\n${tr.income}: ${this.fmt(g.income)}`;
        incomeBar.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        incomeBar.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        incomeBar.addEventListener('mouseleave', () => this.tooltip.hideTip());
        svg_el.appendChild(incomeBar);
      }

      // Expense bar
      if (g.expense > 0) {
        const expenseHeight = maxValue > 0 ? (g.expense / maxValue) * plotHeight : 0;
        const expenseBar = svg('rect', {
          x: cx + OVERVIEW_BAR_GAP / 2,
          y: baselineY - expenseHeight,
          width: barWidth,
          height: expenseHeight,
          fill: 'var(--color-red)',
          rx: OVERVIEW_BAR_RADIUS,
          class: 'finance-chart-bar-hover',
        });
        const tipText = `${g.label}\n${tr.expense}: ${this.fmt(g.expense)}`;
        expenseBar.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        expenseBar.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        expenseBar.addEventListener('mouseleave', () => this.tooltip.hideTip());
        svg_el.appendChild(expenseBar);
      }

      // Net point for trend line
      const net = g.income - g.expense;
      const netY =
        maxValue > 0
          ? baselineY - Math.max(0, (net / maxValue) * plotHeight)
          : baselineY;
      netPoints.push({ x: cx, y: netY, group: g });

      // Month label
      const label = svg('text', {
        x: cx,
        y: baselineY + OVERVIEW_LABEL_OFFSET_Y,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px',
      });
      label.textContent = g.label;
      svg_el.appendChild(label);
    });

    return netPoints;
  }

  private renderNetLine(svg_el: SVGElement, netPoints: { x: number; y: number; group: MonthGroup }[]): void {
    if (netPoints.length > 1) {
      const pathD = netPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const netLine = svg('path', {
        d: pathD,
        stroke: 'var(--text-accent)',
        'stroke-width': OVERVIEW_LINE_STROKE_W,
        fill: 'none',
        'stroke-dasharray': '4,4',
      });
      svg_el.appendChild(netLine);
    }
  }

  private renderNetPoints(svg_el: SVGElement, netPoints: { x: number; y: number; group: MonthGroup }[]): void {
    const { tr } = this.ctx;

    netPoints.forEach(p => {
      const point = svg('circle', {
        cx: p.x,
        cy: p.y,
        r: OVERVIEW_POINT_RADIUS,
        fill: 'var(--text-accent)',
        class: 'finance-chart-point',
      });
      const tipText = `${p.group.label}\n${tr.balance}: ${(p.group.net >= 0 ? '+' : '') + this.fmt(p.group.net)}`;
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
  }

  private fmt(n: number): string {
    return this.ctx.fmt(n);
  }
}
