import { FinanceRecord } from '../../types';
import {
  groupRecordsByMonth,
  MonthGroup,
} from '../../domain/metrics';
import { fmtShort, svg } from '../chartHelpers';
import {
  OVERVIEW_CHART_PAD_LEFT,
  OVERVIEW_CHART_PAD_TOP,
  OVERVIEW_LABEL_OFFSET_Y,
  OVERVIEW_BAR_GAP,
  OVERVIEW_GROUP_GAP,
  OVERVIEW_MAX_BAR_W,
  OVERVIEW_BAR_RADIUS,
  OVERVIEW_LINE_STROKE_W,
  OVERVIEW_POINT_RADIUS,
  OVERVIEW_POINT_RADIUS_HOVER,
} from '../../types';
import { BaseChart } from './BaseChart';

/**
 * MoneyFlowChart: визуализация доходов, расходов и чистого баланса по месяцам.
 * Отображает столбчатый график с доходами (зелёный) и расходами (красный),
 * а также линию тренда чистого баланса.
 */
export class MoneyFlowChart extends BaseChart {

  /**
   * Рендерит график в указанный контейнер.
   * @param parent - родительский HTML элемент
   * @param records - массив финансовых записей для отображения
   */
  render(parent: HTMLElement, records: FinanceRecord[]): void {
    const { tr } = this.ctx;

    const groups = groupRecordsByMonth(records);

    const { chartWrap, scrollWrap } = this.createChartWrapper(parent, tr.overviewMoneyFlow);

    if (groups.length === 0) {
      this.renderNoData(chartWrap, tr.noChartData);
      return;
    }

    const maxValue = Math.max(
      ...groups.map((g: MonthGroup) => Math.max(g.income, g.expense))
    );

    const containerWidth = chartWrap.clientWidth || 400;
    const dims = this.calculateChartDimensions(containerWidth, groups.length);

    const groupWidth = dims.plotWidth / groups.length;
    const rawBarWidth = (groupWidth - OVERVIEW_GROUP_GAP - OVERVIEW_BAR_GAP) / 2;
    const barWidth = Math.min(OVERVIEW_MAX_BAR_W, Math.max(2, rawBarWidth));

    const svg_el = this.createSvg(dims.chartWidth, dims.chartHeight);

    const baselineY = OVERVIEW_CHART_PAD_TOP + dims.plotHeight;

    // Y-axis grid and labels
    this.renderYAxisGrid(svg_el, dims.plotWidth, dims.plotHeight, maxValue, {
      formatLabel: (v: number) => fmtShort(v),
    });

    // Bars and net line
    const netPoints = this.renderBars(svg_el, groups, groupWidth, barWidth, baselineY, dims.plotHeight, maxValue);

    // Net balance trend line
    this.renderNetLine(svg_el, netPoints);

    // Net balance points
    this.renderNetPoints(svg_el, netPoints);

    scrollWrap.appendChild(svg_el);
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
        const showIncomeTip = (e: MouseEvent | TouchEvent) => {
          let clientX: number, clientY: number;
          if ('touches' in e && e.touches.length > 0 && e.touches[0]) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
          } else if ('changedTouches' in e && e.changedTouches.length > 0 && e.changedTouches[0]) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
          } else if ('clientX' in e) {
            clientX = e.clientX;
            clientY = e.clientY;
          } else {
            return;
          }
          this.tooltip.showTip({ clientX, clientY } as MouseEvent, tipText);
        };

        incomeBar.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        incomeBar.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        incomeBar.addEventListener('mouseleave', () => {
          if (!this.ctx.isMobile) this.tooltip.hideTip();
        });
        incomeBar.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          showIncomeTip(e);
        });
        incomeBar.addEventListener('touchend', (e: TouchEvent) => {
          e.stopPropagation();
          showIncomeTip(e);
        });
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
        const showExpenseTip = (e: MouseEvent | TouchEvent) => {
          let clientX: number, clientY: number;
          if ('touches' in e && e.touches.length > 0 && e.touches[0]) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
          } else if ('changedTouches' in e && e.changedTouches.length > 0 && e.changedTouches[0]) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
          } else if ('clientX' in e) {
            clientX = e.clientX;
            clientY = e.clientY;
          } else {
            return;
          }
          this.tooltip.showTip({ clientX, clientY } as MouseEvent, tipText);
        };

        expenseBar.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        expenseBar.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        expenseBar.addEventListener('mouseleave', () => {
          if (!this.ctx.isMobile) this.tooltip.hideTip();
        });
        expenseBar.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          showExpenseTip(e);
        });
        expenseBar.addEventListener('touchend', (e: TouchEvent) => {
          e.stopPropagation();
          showExpenseTip(e);
        });
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
      const showPointTip = (e: MouseEvent | TouchEvent) => {
        point.setAttribute('r', String(OVERVIEW_POINT_RADIUS_HOVER));
        let clientX: number, clientY: number;
        if ('touches' in e && e.touches.length > 0 && e.touches[0]) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else if ('changedTouches' in e && e.changedTouches.length > 0 && e.changedTouches[0]) {
          clientX = e.changedTouches[0].clientX;
          clientY = e.changedTouches[0].clientY;
        } else if ('clientX' in e) {
          clientX = e.clientX;
          clientY = e.clientY;
        } else {
          return;
        }
        this.tooltip.showTip({ clientX, clientY } as MouseEvent, tipText);
      };

      point.addEventListener('mouseenter', e => {
        point.setAttribute('r', String(OVERVIEW_POINT_RADIUS_HOVER));
        this.tooltip.showTip(e, tipText);
      });
      point.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
      point.addEventListener('mouseleave', () => {
        point.setAttribute('r', String(OVERVIEW_POINT_RADIUS));
        if (!this.ctx.isMobile) this.tooltip.hideTip();
      });
      point.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        showPointTip(e);
      });
      point.addEventListener('touchend', (e: TouchEvent) => {
        e.stopPropagation();
        showPointTip(e);
      });
      svg_el.appendChild(point);
    });
  }
}
