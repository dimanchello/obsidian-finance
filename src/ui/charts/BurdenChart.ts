import { ViewContext } from '../../context';
import { CreditRecord, FinanceRecord } from '../../types';
import {
  calcCreditBurdenOverTime,
  CreditBurdenMonth,
} from '../../domain/overviewMetrics';
import { createChartTooltip, fmtShort, svg } from '../chartHelpers';
import {
  OVERVIEW_CHART_HEIGHT,
  OVERVIEW_CHART_PAD_LEFT,
  OVERVIEW_CHART_PAD_RIGHT,
  OVERVIEW_CHART_PAD_TOP,
  OVERVIEW_CHART_PAD_BOTTOM,
  OVERVIEW_LABEL_OFFSET_Y,
  OVERVIEW_MIN_GROUP_W,
  OVERVIEW_MIN_GROUP_W_MOBILE,
  OVERVIEW_Y_TICKS,
  OVERVIEW_MAX_BAR_W,
  OVERVIEW_BAR_SPACING_PAD,
  OVERVIEW_BAR_RADIUS,
  OVERVIEW_LINE_STROKE_W,
  OVERVIEW_POINT_RADIUS,
  OVERVIEW_POINT_RADIUS_HOVER,
  OVERVIEW_TREND_MONTHS,
  PERCENT_100,
} from '../../types';

/**
 * BurdenChart: визуализация кредитной нагрузки во времени.
 * Показывает основной долг (синий) и проценты (оранжевый) в виде стэков,
 * а также линию процента кредитной нагрузки от дохода.
 */
export class BurdenChart {
  private ctx: ViewContext;
  private tooltip = createChartTooltip();

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  /**
   * Рендерит график кредитной нагрузки
   * @param parent - родительский HTML элемент
   * @param credits - кредиты
   * @param records - финансовые записи
   * @param dateFrom - начало периода
   * @param dateTo - конец периода
   * @param today - текущая дата
   * @param trendMonths - ширина окна в месяцах; ALL_TIME_MONTHS растягивает график на все данные
   */
  render(
    parent: HTMLElement,
    credits: CreditRecord[],
    records: FinanceRecord[],
    dateFrom: string | undefined,
    dateTo: string | undefined,
    today: string,
    trendMonths: number = OVERVIEW_TREND_MONTHS
  ): void {
    const { tr } = this.ctx;

    const chartWrap = parent.createDiv('finance-chart-wrap');
    chartWrap.createEl('h3', { text: tr.overviewCreditBurdenChart, cls: 'finance-chart-title' });

    const burdenData = calcCreditBurdenOverTime(
      credits,
      records,
      dateFrom,
      dateTo,
      today,
      trendMonths
    );

    if (burdenData.length === 0 || burdenData.every(d => d.total === 0)) {
      chartWrap.createEl('p', { text: tr.noChartData, cls: 'finance-no-data' });
      return;
    }

    const maxValue = Math.max(...burdenData.map(d => d.total));
    const minGroupW = this.ctx.isMobile ? OVERVIEW_MIN_GROUP_W_MOBILE : OVERVIEW_MIN_GROUP_W;
    const containerWidth = chartWrap.clientWidth || 400;
    const calculatedWidth = OVERVIEW_CHART_PAD_LEFT + burdenData.length * minGroupW + OVERVIEW_CHART_PAD_RIGHT;
    const chartWidth = Math.max(containerWidth, calculatedWidth);

    const plotWidth = chartWidth - OVERVIEW_CHART_PAD_LEFT - OVERVIEW_CHART_PAD_RIGHT;
    const plotHeight = OVERVIEW_CHART_HEIGHT - OVERVIEW_CHART_PAD_TOP - OVERVIEW_CHART_PAD_BOTTOM;

    const spacing = plotWidth / burdenData.length;
    const barWidth = Math.min(OVERVIEW_MAX_BAR_W, Math.max(4, spacing - OVERVIEW_BAR_SPACING_PAD));

    const scrollWrap = chartWrap.createDiv('finance-overview-chart-scroll');
    const svg_el = svg('svg', {
      width: chartWidth,
      height: OVERVIEW_CHART_HEIGHT,
      viewBox: `0 0 ${chartWidth} ${OVERVIEW_CHART_HEIGHT}`,
      class: 'finance-chart-svg',
    });

    const baselineY = OVERVIEW_CHART_PAD_TOP + plotHeight;

    // Y-axis grid
    this.renderYAxisGrid(svg_el, plotWidth, plotHeight, maxValue);

    // Stacked bars and burden line
    const burdenPoints = this.renderStackedBars(svg_el, burdenData, spacing, barWidth, baselineY, plotHeight, maxValue);

    // Burden percentage trend line
    this.renderBurdenLine(svg_el, burdenPoints);

    // Burden percentage points
    this.renderBurdenPoints(svg_el, burdenPoints);

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

  private renderStackedBars(
    svg_el: SVGElement,
    burdenData: CreditBurdenMonth[],
    spacing: number,
    barWidth: number,
    baselineY: number,
    plotHeight: number,
    maxValue: number
  ): { x: number; y: number; item: CreditBurdenMonth }[] {
    const { tr } = this.ctx;
    const burdenPoints: { x: number; y: number; item: CreditBurdenMonth }[] = [];

    burdenData.forEach((d: CreditBurdenMonth, i: number) => {
      const x = OVERVIEW_CHART_PAD_LEFT + i * spacing + (spacing - barWidth) / 2;

      // Principal bar (bottom)
      if (d.principal > 0) {
        const principalHeight = maxValue > 0 ? (d.principal / maxValue) * plotHeight : 0;
        const principalBar = svg('rect', {
          x: x,
          y: baselineY - principalHeight,
          width: Math.max(1, barWidth),
          height: principalHeight,
          fill: 'var(--color-blue)',
          rx: OVERVIEW_BAR_RADIUS,
          class: 'finance-chart-bar-hover',
        });
        const tipText = `${d.label}\n${tr.creditPrincipal ?? 'Основной долг'}: ${this.fmt(d.principal)}`;
        principalBar.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        principalBar.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        principalBar.addEventListener('mouseleave', () => this.tooltip.hideTip());
        svg_el.appendChild(principalBar);
      }

      // Interest bar (stacked on top)
      if (d.interest > 0) {
        const principalHeight = maxValue > 0 ? (d.principal / maxValue) * plotHeight : 0;
        const interestHeight = maxValue > 0 ? (d.interest / maxValue) * plotHeight : 0;
        const interestBar = svg('rect', {
          x: x,
          y: baselineY - principalHeight - interestHeight,
          width: Math.max(1, barWidth),
          height: interestHeight,
          fill: 'var(--color-orange)',
          rx: OVERVIEW_BAR_RADIUS,
          class: 'finance-chart-bar-hover',
        });
        const tipText = `${d.label}\n${tr.creditInterest ?? 'Проценты'}: ${this.fmt(d.interest)}`;
        interestBar.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        interestBar.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        interestBar.addEventListener('mouseleave', () => this.tooltip.hideTip());
        svg_el.appendChild(interestBar);
      }

      // Burden percentage point
      if (d.burdenPercent !== null) {
        const burdenY = baselineY - Math.min(plotHeight, Math.max(0, (d.burdenPercent / PERCENT_100) * plotHeight));
        burdenPoints.push({ x: x + barWidth / 2, y: burdenY, item: d });
      }

      // Month label
      const label = svg('text', {
        x: x + barWidth / 2,
        y: baselineY + OVERVIEW_LABEL_OFFSET_Y,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px',
      });
      label.textContent = d.label.slice(5);
      svg_el.appendChild(label);
    });

    return burdenPoints;
  }

  private renderBurdenLine(svg_el: SVGElement, burdenPoints: { x: number; y: number; item: CreditBurdenMonth }[]): void {
    if (burdenPoints.length > 1) {
      const pathD = burdenPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const burdenLine = svg('path', {
        d: pathD,
        stroke: 'var(--text-accent)',
        'stroke-width': OVERVIEW_LINE_STROKE_W,
        fill: 'none',
        'stroke-dasharray': '4,4',
      });
      svg_el.appendChild(burdenLine);
    }
  }

  private renderBurdenPoints(svg_el: SVGElement, burdenPoints: { x: number; y: number; item: CreditBurdenMonth }[]): void {
    const { tr } = this.ctx;

    burdenPoints.forEach(p => {
      const point = svg('circle', {
        cx: p.x,
        cy: p.y,
        r: OVERVIEW_POINT_RADIUS,
        fill: 'var(--text-accent)',
        class: 'finance-chart-point',
      });
      const tipText = `${p.item.label}\n${tr.overviewCreditBurden}: ${p.item.burdenPercent !== null ? p.item.burdenPercent.toFixed(1) + '%' : '—'}\n${tr.total}: ${this.fmt(p.item.total)}`;
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
