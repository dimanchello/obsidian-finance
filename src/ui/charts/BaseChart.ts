import { ViewContext } from '../../context';
import { createChartTooltip } from '../chartHelpers';
import { svg } from '../chartHelpers';
import {
  OVERVIEW_CHART_HEIGHT,
  OVERVIEW_CHART_PAD_LEFT,
  OVERVIEW_CHART_PAD_RIGHT,
  OVERVIEW_CHART_PAD_TOP,
  OVERVIEW_CHART_PAD_BOTTOM,
  OVERVIEW_MIN_GROUP_W,
  OVERVIEW_MIN_GROUP_W_MOBILE,
  OVERVIEW_Y_TICKS,
} from '../../types';
import { CSS_CLASS } from '../../constants';

/**
 * Base class for all chart components.
 * Provides common functionality: dimensions calculation, tooltip, formatting, SVG setup.
 */
export abstract class BaseChart {
  protected ctx: ViewContext;
  protected tooltip = createChartTooltip();

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  /**
   * Format number using context formatter
   */
  protected fmt(n: number): string {
    return this.ctx.fmt(n);
  }

  /**
   * Calculate chart dimensions based on data length and container width
   */
  protected calculateChartDimensions(
    containerWidth: number,
    dataLength: number,
    options?: {
      minGroupWidth?: number;
      height?: number;
      padLeft?: number;
      padRight?: number;
      padTop?: number;
      padBottom?: number;
    }
  ): {
    chartWidth: number;
    chartHeight: number;
    plotWidth: number;
    plotHeight: number;
    groupWidth: number;
  } {
    const minGroupW = options?.minGroupWidth ??
      (this.ctx.isMobile ? OVERVIEW_MIN_GROUP_W_MOBILE : OVERVIEW_MIN_GROUP_W);

    const height = options?.height ?? OVERVIEW_CHART_HEIGHT;
    const padLeft = options?.padLeft ?? OVERVIEW_CHART_PAD_LEFT;
    const padRight = options?.padRight ?? OVERVIEW_CHART_PAD_RIGHT;
    const padTop = options?.padTop ?? OVERVIEW_CHART_PAD_TOP;
    const padBottom = options?.padBottom ?? OVERVIEW_CHART_PAD_BOTTOM;

    const calculatedWidth = padLeft + dataLength * minGroupW + padRight;
    const chartWidth = Math.max(containerWidth, calculatedWidth);
    const plotWidth = chartWidth - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;
    const groupWidth = plotWidth / dataLength;

    return {
      chartWidth,
      chartHeight: height,
      plotWidth,
      plotHeight,
      groupWidth,
    };
  }

  /**
   * Create SVG element with standard setup
   */
  protected createSvg(
    chartWidth: number,
    chartHeight: number,
    className = 'finance-chart-svg'
  ): SVGElement {
    return svg('svg', {
      width: chartWidth,
      height: chartHeight,
      viewBox: `0 0 ${chartWidth} ${chartHeight}`,
      class: className,
    });
  }

  /**
   * Render Y-axis grid lines
   */
  protected renderYAxisGrid(
    svg_el: SVGElement,
    plotWidth: number,
    plotHeight: number,
    maxValue: number,
    options?: {
      ticks?: number;
      padLeft?: number;
      padTop?: number;
      formatLabel?: (value: number) => string;
    }
  ): void {
    const ticks = options?.ticks ?? OVERVIEW_Y_TICKS;
    const padLeft = options?.padLeft ?? OVERVIEW_CHART_PAD_LEFT;
    const padTop = options?.padTop ?? OVERVIEW_CHART_PAD_TOP;
    const formatLabel = options?.formatLabel ?? ((v: number) => this.fmt(v));

    for (let i = 0; i <= ticks; i++) {
      const y = padTop + plotHeight * (1 - i / ticks);
      const value = (maxValue * i) / ticks;

      // Grid line
      const line = svg('line', {
        x1: padLeft,
        y1: y,
        x2: padLeft + plotWidth,
        y2: y,
        stroke: 'var(--background-modifier-border)',
        'stroke-width': 1,
        'stroke-dasharray': '2,2',
      });
      svg_el.appendChild(line);

      // Y-axis label
      if (i > 0) {
        const text = svg('text', {
          x: padLeft - 10,
          y: y + 4,
          'text-anchor': 'end',
          fill: 'var(--text-muted)',
          'font-size': '11px',
        });
        text.textContent = formatLabel(value);
        svg_el.appendChild(text);
      }
    }
  }

  /**
   * Create chart wrapper with title and scroll container
   */
  protected createChartWrapper(
    parent: HTMLElement,
    title: string
  ): {
    chartWrap: HTMLElement;
    scrollWrap: HTMLElement;
  } {
    const chartWrap = parent.createDiv('finance-chart-wrap');
    chartWrap.createEl('h3', { text: title, cls: CSS_CLASS.FINANCE_CHART_TITLE });
    const scrollWrap = chartWrap.createDiv('finance-overview-chart-scroll');

    return { chartWrap, scrollWrap };
  }

  /**
   * Show "no data" message
   */
  protected renderNoData(parent: HTMLElement, message: string): void {
    parent.createEl('p', { text: message, cls: 'finance-no-data' });
  }

  /**
   * Render chart legend with colored dots and labels
   */
  protected renderLegend(
    parent: HTMLElement,
    items: {
      label: string;
      color?: string;
      cssClass?: string;
    }[]
  ): HTMLElement {
    const legend = parent.createDiv('finance-chart-legend');

    items.forEach(item => {
      const legendItem = legend.createDiv('finance-chart-legend-item');
      const dot = legendItem.createSpan({ cls: `finance-chart-legend-dot${item.cssClass ? ' ' + item.cssClass : ''}` });
      if (item.color) {
        dot.style.background = item.color;
      }
      legendItem.createSpan({ text: item.label });
    });

    return legend;
  }
}
