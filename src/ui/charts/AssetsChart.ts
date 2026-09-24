import { CreditRecord, CurrencyExchange, DebtRecord, DepositRecord } from '../../types';
import {
  calcAssetsLiabilitiesOverTime,
  AssetLiabilityMonth,
} from '../../domain/metrics';
import { fmtShort, svg } from '../chartHelpers';
import {
  OVERVIEW_CHART_PAD_LEFT,
  OVERVIEW_CHART_PAD_TOP,
  OVERVIEW_LABEL_OFFSET_Y,
  OVERVIEW_LINE_STROKE_W,
  OVERVIEW_POINT_RADIUS,
  OVERVIEW_POINT_RADIUS_HOVER,
  OVERVIEW_TREND_MONTHS,
} from '../../types';
import { BaseChart } from './BaseChart';

/**
 * AssetsChart: визуализация активов и обязательств во времени.
 * Показывает два тренда - активы (депозиты + валюты) и обязательства (кредиты + долги).
 */
export class AssetsChart extends BaseChart {

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

    const { chartWrap, scrollWrap } = this.createChartWrapper(parent, tr.overviewAssetLiabilityTrend);

    if (trendData.length === 0) {
      this.renderNoData(chartWrap, tr.noChartData);
      return;
    }

    const maxValue = Math.max(...trendData.map(d => Math.max(d.assets, d.liabilities)));
    const containerWidth = chartWrap.clientWidth || 400;
    const dims = this.calculateChartDimensions(containerWidth, trendData.length);

    const svg_el = this.createSvg(dims.chartWidth, dims.chartHeight);

    const baselineY = OVERVIEW_CHART_PAD_TOP + dims.plotHeight;

    // Y-axis grid
    this.renderYAxisGrid(svg_el, dims.plotWidth, dims.plotHeight, maxValue, {
      formatLabel: (v: number) => fmtShort(v),
    });

    // Area paths and points
    const { assetPoints, liabilityPoints } = this.renderAreaPaths(
      svg_el,
      trendData,
      dims.plotWidth,
      dims.plotHeight,
      baselineY,
      maxValue
    );

    // Interactive points
    this.renderPoints(svg_el, assetPoints, liabilityPoints);

    scrollWrap.appendChild(svg_el);
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
}
