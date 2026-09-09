import { ViewContext } from '../../context';
import { CreditRecord, CurrencyExchange, DebtRecord, DepositRecord } from '../../types';
import {
  calcAssetsLiabilitiesOverTime,
  AssetLiabilityMonth,
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
  OVERVIEW_LINE_STROKE_W,
  OVERVIEW_POINT_RADIUS,
  OVERVIEW_POINT_RADIUS_HOVER,
  OVERVIEW_TREND_MONTHS,
} from '../../types';

/**
 * AssetsChart: визуализация активов и обязательств во времени.
 * Показывает два тренда - активы (депозиты + валюты) и обязательства (кредиты + долги).
 */
export class AssetsChart {
  private ctx: ViewContext;
  private tooltip = createChartTooltip();

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  /**
   * Рендерит график активов/обязательств
   * @param parent - родительский HTML элемент
   * @param deposits - депозиты
   * @param exchanges - валютные операции
   * @param credits - кредиты
   * @param debts - долги
   * @param dateFrom - начало периода (может быть undefined)
   * @param dateTo - конец периода (может быть undefined)
   * @param today - текущая дата
   * @param trendMonths - ширина окна в месяцах; ALL_TIME_MONTHS растягивает график на все данные
   */
  render(
    parent: HTMLElement,
    deposits: DepositRecord[],
    exchanges: CurrencyExchange[],
    credits: CreditRecord[],
    debts: DebtRecord[],
    dateFrom: string | undefined,
    dateTo: string | undefined,
    today: string,
    trendMonths: number = OVERVIEW_TREND_MONTHS
  ): void {
    const { tr } = this.ctx;

    const chartWrap = parent.createDiv('finance-chart-wrap');
    chartWrap.createEl('h3', { text: tr.overviewAssetLiabilityTrend, cls: 'finance-chart-title' });

    const trendData = calcAssetsLiabilitiesOverTime(
      deposits,
      exchanges,
      credits,
      debts,
      dateFrom,
      dateTo,
      today,
      trendMonths
    );

    if (trendData.length === 0) {
      chartWrap.createEl('p', { text: tr.noChartData, cls: 'finance-no-data' });
      return;
    }

    const maxValue = Math.max(...trendData.map(d => Math.max(d.assets, d.liabilities)));
    const minGroupW = this.ctx.isMobile ? OVERVIEW_MIN_GROUP_W_MOBILE : OVERVIEW_MIN_GROUP_W;
    const containerWidth = chartWrap.clientWidth || 400;
    const calculatedWidth = OVERVIEW_CHART_PAD_LEFT + trendData.length * minGroupW + OVERVIEW_CHART_PAD_RIGHT;
    const chartWidth = Math.max(containerWidth, calculatedWidth);

    const plotWidth = chartWidth - OVERVIEW_CHART_PAD_LEFT - OVERVIEW_CHART_PAD_RIGHT;
    const plotHeight = OVERVIEW_CHART_HEIGHT - OVERVIEW_CHART_PAD_TOP - OVERVIEW_CHART_PAD_BOTTOM;

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

    // Area paths and points
    const { assetPoints, liabilityPoints } = this.renderAreaPaths(
      svg_el,
      trendData,
      plotWidth,
      plotHeight,
      baselineY,
      maxValue
    );

    // Interactive points
    this.renderPoints(svg_el, assetPoints, liabilityPoints);

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

  private renderAreaPaths(
    svg_el: SVGElement,
    trendData: AssetLiabilityMonth[],
    plotWidth: number,
    plotHeight: number,
    baselineY: number,
    maxValue: number
  ): {
    assetPoints: { x: number; y: number; item: AssetLiabilityMonth }[];
    liabilityPoints: { x: number; y: number; item: AssetLiabilityMonth }[];
  } {
    const xStep = plotWidth / Math.max(1, trendData.length - 1);
    const assetsPathPoints: string[] = [];
    const liabilitiesPathPoints: string[] = [];
    const assetPointCoords: { x: number; y: number; item: AssetLiabilityMonth }[] = [];
    const liabilityPointCoords: { x: number; y: number; item: AssetLiabilityMonth }[] = [];

    trendData.forEach((d: AssetLiabilityMonth, i: number) => {
      const x = OVERVIEW_CHART_PAD_LEFT + i * xStep;
      const assetsY =
        maxValue > 0 ? baselineY - Math.min(plotHeight, Math.max(0, (d.assets / maxValue) * plotHeight)) : baselineY;
      const liabilitiesY =
        maxValue > 0
          ? baselineY - Math.min(plotHeight, Math.max(0, (d.liabilities / maxValue) * plotHeight))
          : baselineY;

      assetsPathPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${assetsY}`);
      liabilitiesPathPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${liabilitiesY}`);
      assetPointCoords.push({ x, y: assetsY, item: d });
      liabilityPointCoords.push({ x, y: liabilitiesY, item: d });

      const label = svg('text', {
        x: x,
        y: baselineY + OVERVIEW_LABEL_OFFSET_Y,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px',
      });
      label.textContent = d.label.slice(5);
      svg_el.appendChild(label);
    });

    const lastX = OVERVIEW_CHART_PAD_LEFT + (trendData.length - 1) * xStep;
    const bottomY = baselineY;

    const assetsAreaPoints = [...assetsPathPoints, `L ${lastX} ${bottomY}`, `L ${OVERVIEW_CHART_PAD_LEFT} ${bottomY}`, 'Z'];
    const liabilitiesAreaPoints = [...liabilitiesPathPoints, `L ${lastX} ${bottomY}`, `L ${OVERVIEW_CHART_PAD_LEFT} ${bottomY}`, 'Z'];

    const assetsPath = svg('path', {
      d: assetsAreaPoints.join(' '),
      fill: 'var(--color-green)',
      'fill-opacity': '0.15',
      stroke: 'var(--color-green)',
      'stroke-width': OVERVIEW_LINE_STROKE_W,
    });
    svg_el.appendChild(assetsPath);

    const liabilitiesPath = svg('path', {
      d: liabilitiesAreaPoints.join(' '),
      fill: 'var(--color-red)',
      'fill-opacity': '0.15',
      stroke: 'var(--color-red)',
      'stroke-width': OVERVIEW_LINE_STROKE_W,
    });
    svg_el.appendChild(liabilitiesPath);

    return { assetPoints: assetPointCoords, liabilityPoints: liabilityPointCoords };
  }

  private renderPoints(
    svg_el: SVGElement,
    assetPoints: { x: number; y: number; item: AssetLiabilityMonth }[],
    liabilityPoints: { x: number; y: number; item: AssetLiabilityMonth }[]
  ): void {
    const { tr } = this.ctx;

    assetPoints.forEach(p => {
      const point = svg('circle', {
        cx: p.x,
        cy: p.y,
        r: OVERVIEW_POINT_RADIUS,
        fill: 'var(--color-green)',
        class: 'finance-chart-point',
      });
      const tipText = `${p.item.label}\n${tr.overviewAssets}: ${this.fmt(p.item.assets)}`;
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

    liabilityPoints.forEach(p => {
      const point = svg('circle', {
        cx: p.x,
        cy: p.y,
        r: OVERVIEW_POINT_RADIUS,
        fill: 'var(--color-red)',
        class: 'finance-chart-point',
      });
      const tipText = `${p.item.label}\n${tr.overviewLiabilities}: ${this.fmt(p.item.liabilities)}`;
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
