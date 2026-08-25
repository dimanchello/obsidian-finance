import { ViewContext } from '../context';
import {
  calcNetBalance,
  calcAssets,
  calcLiabilities,
  calcCreditBurden,
  calcUpcomingPayments,
  groupRecordsByMonth,
  calcCreditBurdenOverTime,
  calcAssetsLiabilitiesOverTime,
  MonthGroup,
  CreditBurdenMonth,
  AssetLiabilityMonth,
} from '../domain/overviewMetrics';
import { toDateStr } from '../domain/dateMath';

const CHART_HEIGHT = 300;
const CHART_PAD_LEFT = 60;
const CHART_PAD_RIGHT = 20;
const CHART_PAD_TOP = 20;
const CHART_PAD_BOTTOM = 40;
const BAR_GAP = 8;
const GROUP_GAP = 24;

export class OverviewTab {
  private el: HTMLElement;
  private ctx: ViewContext;

  constructor(el: HTMLElement, ctx: ViewContext) {
    this.el = el;
    this.ctx = ctx;
  }

  render(): void {
    this.el.empty();
    this.el.addClass('finance-overview-tab');

    const { data, tr } = this.ctx;
    if (!data) return;

    const today = toDateStr(new Date());

    // KPI Cards
    const netBalance = calcNetBalance(data.records);
    const assets = calcAssets(data.deposits, data.exchanges, data.debts);
    const liabilities = calcLiabilities(data.credits, data.debts);
    const burden = calcCreditBurden(data.credits, data.records, today);
    const upcoming = calcUpcomingPayments(data.credits, data.debts, today);

    const cardsWrap = this.el.createDiv('finance-overview-cards');

    this.createKPICard(cardsWrap, tr.balance, this.fmt(netBalance), netBalance >= 0 ? 'income' : 'expense');
    this.createKPICard(cardsWrap, tr.overviewAssets, this.fmt(assets), 'income');
    this.createKPICard(cardsWrap, tr.overviewLiabilities, this.fmt(liabilities), 'expense');
    this.createKPICard(
      cardsWrap,
      tr.overviewCreditBurden,
      burden !== null ? `${Math.round(burden)}%` : tr.noData,
      'neutral'
    );
    this.createKPICard(cardsWrap, tr.overviewUpcomingPayments, this.fmt(upcoming), 'neutral');

    // Charts
    const chartsWrap = this.el.createDiv('finance-overview-charts');
    this.renderMoneyFlowChart(chartsWrap);
    this.renderCreditBurdenChart(chartsWrap);
    this.renderAssetLiabilityChart(chartsWrap);
  }

  private renderMoneyFlowChart(parent: HTMLElement): void {
    const { data, tr } = this.ctx;
    if (!data) return;

    const chartWrap = parent.createDiv('finance-chart-wrap');
    chartWrap.createEl('h3', { text: tr.overviewMoneyFlow, cls: 'finance-chart-title' });

    const groups = groupRecordsByMonth(data.records);
    if (groups.length === 0) {
      chartWrap.createEl('p', { text: tr.noChartData, cls: 'finance-no-data' });
      return;
    }

    const maxValue = Math.max(
      ...groups.map((g: MonthGroup) => Math.max(g.income, g.expense))
    );

    const chartWidth = chartWrap.offsetWidth || 800;
    const plotWidth = chartWidth - CHART_PAD_LEFT - CHART_PAD_RIGHT;
    const plotHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;

    const groupWidth = plotWidth / groups.length;
    const barWidth = (groupWidth - GROUP_GAP - BAR_GAP) / 2;

    const svg = this.svg('svg', {
      width: chartWidth,
      height: CHART_HEIGHT,
      class: 'finance-chart-svg'
    });

    // Y-axis grid
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const y = CHART_PAD_TOP + plotHeight * (1 - i / yTicks);
      const line = this.svg('line', {
        x1: CHART_PAD_LEFT,
        y1: y,
        x2: CHART_PAD_LEFT + plotWidth,
        y2: y,
        stroke: 'var(--background-modifier-border)',
        'stroke-width': 1,
        'stroke-dasharray': '2,2'
      });
      svg.appendChild(line);

      const label = this.svg('text', {
        x: CHART_PAD_LEFT - 10,
        y: y + 4,
        'text-anchor': 'end',
        fill: 'var(--text-muted)',
        'font-size': '11px'
      });
      label.textContent = this.fmtShort((maxValue * i) / yTicks);
      svg.appendChild(label);
    }

    // Bars and net line
    const netPoints: { x: number; y: number }[] = [];

    groups.forEach((g: MonthGroup, i: number) => {
      const x = CHART_PAD_LEFT + i * groupWidth + GROUP_GAP / 2;

      // Income bar
      const incomeHeight = (g.income / maxValue) * plotHeight;
      const incomeBar = this.svg('rect', {
        x: x,
        y: CHART_PAD_TOP + plotHeight - incomeHeight,
        width: barWidth,
        height: incomeHeight,
        fill: 'var(--color-green)',
        rx: 4
      });
      svg.appendChild(incomeBar);

      // Expense bar
      const expenseHeight = (g.expense / maxValue) * plotHeight;
      const expenseBar = this.svg('rect', {
        x: x + barWidth + BAR_GAP,
        y: CHART_PAD_TOP + plotHeight - expenseHeight,
        width: barWidth,
        height: expenseHeight,
        fill: 'var(--color-red)',
        rx: 4
      });
      svg.appendChild(expenseBar);

      // Net line point
      const net = g.income - g.expense;
      const netY = CHART_PAD_TOP + plotHeight - (Math.abs(net) / maxValue) * plotHeight * (net >= 0 ? 1 : -1);
      netPoints.push({ x: x + groupWidth / 2, y: netY });

      // X-axis label
      const label = this.svg('text', {
        x: x + groupWidth / 2,
        y: CHART_HEIGHT - 10,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px'
      });
      label.textContent = g.label;
      svg.appendChild(label);
    });

    // Net line
    const pathD = netPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const netLine = this.svg('path', {
      d: pathD,
      stroke: 'var(--text-accent)',
      'stroke-width': 2,
      fill: 'none'
    });
    svg.appendChild(netLine);

    chartWrap.appendChild(svg);
  }

  private renderCreditBurdenChart(parent: HTMLElement): void {
    const { data, tr } = this.ctx;
    if (!data) return;

    const chartWrap = parent.createDiv('finance-chart-wrap');
    chartWrap.createEl('h3', { text: tr.overviewCreditBurdenChart, cls: 'finance-chart-title' });

    const today = toDateStr(new Date());
    const burdenData = calcCreditBurdenOverTime(data.credits, data.records, today, 6);

    if (burdenData.length === 0 || burdenData.every(d => d.total === 0)) {
      chartWrap.createEl('p', { text: tr.noChartData, cls: 'finance-no-data' });
      return;
    }

    const maxValue = Math.max(...burdenData.map(d => d.total));
    const chartWidth = chartWrap.offsetWidth || 800;
    const plotWidth = chartWidth - CHART_PAD_LEFT - CHART_PAD_RIGHT;
    const plotHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;

    const barWidth = Math.min(60, plotWidth / burdenData.length - 20);
    const spacing = plotWidth / burdenData.length;

    const svg = this.svg('svg', {
      width: chartWidth,
      height: CHART_HEIGHT,
      class: 'finance-chart-svg'
    });

    // Y-axis grid
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const y = CHART_PAD_TOP + plotHeight * (1 - i / yTicks);
      const line = this.svg('line', {
        x1: CHART_PAD_LEFT,
        y1: y,
        x2: CHART_PAD_LEFT + plotWidth,
        y2: y,
        stroke: 'var(--background-modifier-border)',
        'stroke-width': 1,
        'stroke-dasharray': '2,2'
      });
      svg.appendChild(line);

      const label = this.svg('text', {
        x: CHART_PAD_LEFT - 10,
        y: y + 4,
        'text-anchor': 'end',
        fill: 'var(--text-muted)',
        'font-size': '11px'
      });
      label.textContent = this.fmtShort((maxValue * i) / yTicks);
      svg.appendChild(label);
    }

    // Stacked bars and burden line
    const burdenPoints: { x: number; y: number }[] = [];

    burdenData.forEach((d: CreditBurdenMonth, i: number) => {
      const x = CHART_PAD_LEFT + i * spacing + (spacing - barWidth) / 2;

      // Principal bar (bottom)
      const principalHeight = (d.principal / maxValue) * plotHeight;
      const principalBar = this.svg('rect', {
        x: x,
        y: CHART_PAD_TOP + plotHeight - principalHeight,
        width: barWidth,
        height: principalHeight,
        fill: 'var(--color-blue)',
        rx: 4
      });
      svg.appendChild(principalBar);

      // Interest bar (top, stacked)
      const interestHeight = (d.interest / maxValue) * plotHeight;
      const interestBar = this.svg('rect', {
        x: x,
        y: CHART_PAD_TOP + plotHeight - principalHeight - interestHeight,
        width: barWidth,
        height: interestHeight,
        fill: 'var(--color-orange)',
        rx: 4
      });
      svg.appendChild(interestBar);

      // Burden percentage point (for line)
      if (d.burdenPercent !== null) {
        const burdenY = CHART_PAD_TOP + plotHeight - (d.burdenPercent / 100) * plotHeight;
        burdenPoints.push({ x: x + barWidth / 2, y: burdenY });
      }

      // X-axis label
      const label = this.svg('text', {
        x: x + barWidth / 2,
        y: CHART_HEIGHT - 10,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px'
      });
      label.textContent = d.label.slice(5); // MM only
      svg.appendChild(label);
    });

    // Burden % line
    if (burdenPoints.length > 1) {
      const pathD = burdenPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const burdenLine = this.svg('path', {
        d: pathD,
        stroke: 'var(--text-accent)',
        'stroke-width': 2,
        fill: 'none',
        'stroke-dasharray': '4,4'
      });
      svg.appendChild(burdenLine);
    }

    chartWrap.appendChild(svg);
  }

  private renderAssetLiabilityChart(parent: HTMLElement): void {
    const { data, tr } = this.ctx;
    if (!data) return;

    const chartWrap = parent.createDiv('finance-chart-wrap');
    chartWrap.createEl('h3', { text: tr.overviewAssetLiabilityTrend, cls: 'finance-chart-title' });

    const today = toDateStr(new Date());
    const trendData = calcAssetsLiabilitiesOverTime(
      data.deposits,
      data.exchanges,
      data.credits,
      data.debts,
      today,
      6
    );

    if (trendData.length === 0) {
      chartWrap.createEl('p', { text: tr.noChartData, cls: 'finance-no-data' });
      return;
    }

    const maxValue = Math.max(...trendData.map(d => Math.max(d.assets, d.liabilities)));
    const chartWidth = chartWrap.offsetWidth || 800;
    const plotWidth = chartWidth - CHART_PAD_LEFT - CHART_PAD_RIGHT;
    const plotHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;

    const svg = this.svg('svg', {
      width: chartWidth,
      height: CHART_HEIGHT,
      class: 'finance-chart-svg'
    });

    // Y-axis grid
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const y = CHART_PAD_TOP + plotHeight * (1 - i / yTicks);
      const line = this.svg('line', {
        x1: CHART_PAD_LEFT,
        y1: y,
        x2: CHART_PAD_LEFT + plotWidth,
        y2: y,
        stroke: 'var(--background-modifier-border)',
        'stroke-width': 1,
        'stroke-dasharray': '2,2'
      });
      svg.appendChild(line);

      const label = this.svg('text', {
        x: CHART_PAD_LEFT - 10,
        y: y + 4,
        'text-anchor': 'end',
        fill: 'var(--text-muted)',
        'font-size': '11px'
      });
      label.textContent = this.fmtShort((maxValue * i) / yTicks);
      svg.appendChild(label);
    }

    // Build area paths
    const xStep = plotWidth / (trendData.length - 1);
    const assetsPoints: string[] = [];
    const liabilitiesPoints: string[] = [];

    trendData.forEach((d: AssetLiabilityMonth, i: number) => {
      const x = CHART_PAD_LEFT + i * xStep;
      const assetsY = CHART_PAD_TOP + plotHeight - (d.assets / maxValue) * plotHeight;
      const liabilitiesY = CHART_PAD_TOP + plotHeight - (d.liabilities / maxValue) * plotHeight;

      assetsPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${assetsY}`);
      liabilitiesPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${liabilitiesY}`);

      // X-axis label
      const label = this.svg('text', {
        x: x,
        y: CHART_HEIGHT - 10,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px'
      });
      label.textContent = d.label.slice(5); // MM only
      svg.appendChild(label);
    });

    // Close area paths
    const lastX = CHART_PAD_LEFT + (trendData.length - 1) * xStep;
    const bottomY = CHART_PAD_TOP + plotHeight;
    assetsPoints.push(`L ${lastX} ${bottomY}`, `L ${CHART_PAD_LEFT} ${bottomY}`, 'Z');
    liabilitiesPoints.push(`L ${lastX} ${bottomY}`, `L ${CHART_PAD_LEFT} ${bottomY}`, 'Z');

    // Assets area (green)
    const assetsPath = this.svg('path', {
      d: assetsPoints.join(' '),
      fill: 'var(--color-green)',
      'fill-opacity': '0.2',
      stroke: 'var(--color-green)',
      'stroke-width': 2
    });
    svg.appendChild(assetsPath);

    // Liabilities area (red)
    const liabilitiesPath = this.svg('path', {
      d: liabilitiesPoints.join(' '),
      fill: 'var(--color-red)',
      'fill-opacity': '0.2',
      stroke: 'var(--color-red)',
      'stroke-width': 2
    });
    svg.appendChild(liabilitiesPath);

    chartWrap.appendChild(svg);
  }

  private fmt(amount: number): string {
    return amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + this.ctx.currency;
  }

  private fmtShort(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return String(Math.round(n));
  }

  private svg<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number> = {}
  ): SVGElementTagNameMap[K] {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  private createKPICard(parent: HTMLElement, label: string, value: string, mod: 'income' | 'expense' | 'neutral'): void {
    const card = parent.createDiv(`finance-stat-card finance-stat-${mod}`);
    const info = card.createDiv('finance-stat-info');
    info.createEl('div', { text: label, cls: 'finance-stat-label' });
    info.createEl('div', { text: value, cls: 'finance-stat-value' });
  }
}
