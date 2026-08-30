import { ViewContext } from '../context';
import {
  FinanceRecord,
  DebtRecord,
  OverviewGroupBy,
  OVERVIEW_BURDEN_WARN,
  OVERVIEW_BURDEN_DANGER,
  OVERVIEW_PRESET_MONTHS_3,
  OVERVIEW_PRESET_MONTHS_6,
  OVERVIEW_TREND_MONTHS,
  OVERVIEW_CHART_HEIGHT,
  OVERVIEW_CHART_PAD_LEFT,
  OVERVIEW_CHART_PAD_RIGHT,
  OVERVIEW_CHART_PAD_TOP,
  OVERVIEW_CHART_PAD_BOTTOM,
  OVERVIEW_LABEL_OFFSET_Y,
  OVERVIEW_MIN_GROUP_W,
  OVERVIEW_MIN_GROUP_W_MOBILE,
  OVERVIEW_Y_TICKS,
  OVERVIEW_MIN_BAR_PCT,
  OVERVIEW_MAX_BAR_W,
  OVERVIEW_BAR_SPACING_PAD,
  OVERVIEW_BAR_RADIUS,
  OVERVIEW_LINE_STROKE_W,
  OVERVIEW_POINT_RADIUS,
  OVERVIEW_POINT_RADIUS_HOVER,
  OVERVIEW_SAVINGS_BENCHMARK,
  OVERVIEW_INPUT_DEBOUNCE_MS,
  PERCENT_100,
  CHART_PALETTE,
} from '../types';
import {
  calcNetBalance,
  calcAssets,
  calcLiabilities,
  calcCreditBurden,
  calcUpcomingPayments,
  calcSavingsRateOverTime,
  calcDebtsBreakdown,
  filterRecordsByDateRange,
  calcGroupBreakdown,
  calcDepositInterestOverTime,
  calcActiveDepositsProgress,
  SavingsRateMonth,
  DepositInterestMonth,
  ActiveDepositProgress,
} from '../domain/overviewMetrics';
import { createChartTooltip, fmtShort, svg } from '../ui/chartHelpers';
import { shiftMonths, getTodayStr, fmtDate } from '../utils';
import { isoWeekRange, daysInMonth } from '../domain/dateMath';
import { MoneyFlowChart } from '../ui/charts/MoneyFlowChart';
import { AssetsChart } from '../ui/charts/AssetsChart';
import { BurdenChart } from '../ui/charts/BurdenChart';

export class OverviewTab {
  private el: HTMLElement;
  private ctx: ViewContext;
  private tooltip = createChartTooltip();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Chart components
  private moneyFlowChart: MoneyFlowChart;
  private assetsChart: AssetsChart;
  private burdenChart: BurdenChart;

  public onNavigate?: (mode: 'records' | 'debts' | 'credits' | 'deposits' | 'currency') => void;

  private filterBarEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private fromInput: HTMLInputElement | null = null;
  private toInput: HTMLInputElement | null = null;
  private presetButtons: { btn: HTMLButtonElement; from: string; to: string }[] = [];

  constructor(el: HTMLElement, ctx: ViewContext) {
    this.el = el;
    this.ctx = ctx;
    this.moneyFlowChart = new MoneyFlowChart(ctx);
    this.assetsChart = new AssetsChart(ctx);
    this.burdenChart = new BurdenChart(ctx);
  }

  private debouncedRenderBody(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.renderBody();
    }, OVERVIEW_INPUT_DEBOUNCE_MS);
  }

  private get data() {
    return this.ctx.data;
  }

  private get tr() {
    return this.ctx.tr;
  }

  private get state() {
    return this.ctx.state;
  }

  destroy(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.tooltip.destroy();
  }

  render(): void {
    this.tooltip.hideTip();
    this.el.empty();
    this.el.addClass('finance-overview-tab');
    this.filterBarEl = null;
    this.bodyEl = null;
    this.fromInput = null;
    this.toInput = null;
    this.presetButtons = [];

    const data = this.data;
    if (!data) return;

    this.renderFilterBar();
    this.bodyEl = this.el.createDiv('finance-overview-body');
    this.renderBody();
  }

  private renderBody(): void {
    this.tooltip.hideTip();
    if (!this.bodyEl) return;
    this.bodyEl.empty();

    const data = this.data;
    if (!data) return;

    const today = getTodayStr();
    const filteredRecords = filterRecordsByDateRange(
      data.records,
      this.state.overviewDateFrom,
      this.state.overviewDateTo
    );

    this.renderKpiCards(filteredRecords, today);

    const chartsWrap = this.bodyEl.createDiv('finance-overview-charts');
    this.moneyFlowChart.render(chartsWrap, filteredRecords);
    this.renderBreakdownChart(chartsWrap, filteredRecords);
    this.renderSavingsRateChart(chartsWrap, data.records, today);
    this.burdenChart.render(chartsWrap, data.credits, data.records, this.state.overviewDateFrom, this.state.overviewDateTo, today);
    this.assetsChart.render(chartsWrap, data.deposits, data.exchanges, data.credits, data.debts, this.state.overviewDateFrom, this.state.overviewDateTo, today);
    this.renderDebtsBreakdownChart(chartsWrap, data.debts);
    this.renderDepositsOverviewSection(chartsWrap, today);
  }

  private renderFilterBar(): void {
    this.filterBarEl = this.el.createDiv('finance-overview-filter-bar');
    const presetsWrap = this.filterBarEl.createDiv('finance-overview-presets');

    const today = getTodayStr();
    const [todayYear, todayMonth] = today.split('-');
    const thisMonthStart = `${todayYear}-${todayMonth}-01`;
    const threeMonthsAgo = shiftMonths(today, -OVERVIEW_PRESET_MONTHS_3);
    const sixMonthsAgo = shiftMonths(today, -OVERVIEW_PRESET_MONTHS_6);
    const thisYearStart = `${todayYear}-01-01`;

    const presets = [
      {
        id: 'all',
        label: this.tr.overviewPeriodAll,
        from: '',
        to: '',
      },
      {
        id: 'this_month',
        label: this.tr.overviewPeriodMonth,
        from: thisMonthStart,
        to: today,
      },
      {
        id: '3_months',
        label: this.tr.overviewPeriod3Months,
        from: threeMonthsAgo,
        to: today,
      },
      {
        id: '6_months',
        label: this.tr.overviewPeriod6Months,
        from: sixMonthsAgo,
        to: today,
      },
      {
        id: 'this_year',
        label: this.tr.overviewPeriodYear,
        from: thisYearStart,
        to: today,
      },
    ];

    presets.forEach(preset => {
      const btn = presetsWrap.createEl('button', {
        text: preset.label,
        cls: 'finance-overview-preset-btn',
      });
      this.presetButtons.push({ btn, from: preset.from, to: preset.to });

      btn.addEventListener('click', () => {
        if (this.debounceTimer !== null) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        this.state.overviewDateFrom = preset.from;
        this.state.overviewDateTo = preset.to;
        this.ctx.saveState();
        if (this.fromInput) this.fromInput.value = preset.from;
        if (this.toInput) this.toInput.value = preset.to;
        this.updatePresetActiveStates();
        this.renderBody();
      });
    });

    const dateRangeWrap = this.filterBarEl.createDiv('finance-overview-date-range');

    const fromGroup = dateRangeWrap.createDiv('finance-filter-group');
    fromGroup.createEl('label', { text: this.tr.from, cls: 'finance-filter-label' });
    this.fromInput = fromGroup.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    this.fromInput.value = this.state.overviewDateFrom ?? '';

    const handleFromChange = () => {
      if (!this.fromInput) return;
      this.state.overviewDateFrom = this.fromInput.value;
      this.ctx.saveState();
      this.updatePresetActiveStates();
      this.debouncedRenderBody();
    };
    this.fromInput.addEventListener('input', handleFromChange);
    this.fromInput.addEventListener('change', handleFromChange);

    const toGroup = dateRangeWrap.createDiv('finance-filter-group');
    toGroup.createEl('label', { text: this.tr.to, cls: 'finance-filter-label' });
    this.toInput = toGroup.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    this.toInput.value = this.state.overviewDateTo ?? '';

    const handleToChange = () => {
      if (!this.toInput) return;
      this.state.overviewDateTo = this.toInput.value;
      this.ctx.saveState();
      this.updatePresetActiveStates();
      this.debouncedRenderBody();
    };
    this.toInput.addEventListener('input', handleToChange);
    this.toInput.addEventListener('change', handleToChange);

    this.updatePresetActiveStates();
  }

  private updatePresetActiveStates(): void {
    const curFrom = this.state.overviewDateFrom ?? '';
    const curTo = this.state.overviewDateTo ?? '';
    const today = getTodayStr();

    this.presetButtons.forEach(({ btn, from, to }) => {
      const isAll = from === '' && to === '' && curFrom === '' && curTo === '';
      const isMatch =
        from !== '' &&
        curFrom === from &&
        (curTo === to || (!curTo && to === today));

      if (isAll || isMatch) {
        btn.addClass('is-active');
      } else {
        btn.removeClass('is-active');
      }
    });
  }

  private renderKpiCards(filteredRecords: FinanceRecord[], today: string): void {
    if (!this.bodyEl) return;
    const data = this.data;
    if (!data) return;

    const cardsWrap = this.bodyEl.createDiv('finance-overview-cards');

    const netBalance = calcNetBalance(filteredRecords);
    const assets = calcAssets(data.deposits, data.exchanges, data.debts);
    const liabilities = calcLiabilities(data.credits, data.debts);
    const burden = calcCreditBurden(data.credits, data.records, today);
    const upcoming = calcUpcomingPayments(data.credits, data.debts, today);

    this.createKPICard(
      cardsWrap,
      this.tr.balance,
      this.fmt(netBalance),
      netBalance >= 0 ? 'income' : 'expense',
      '💰'
    );
    this.createKPICard(cardsWrap, this.tr.overviewAssets, this.fmt(assets), 'income', '📈');
    this.createKPICard(cardsWrap, this.tr.overviewLiabilities, this.fmt(liabilities), 'expense', '📉');

    const burdenValue = burden !== null ? `${Math.round(burden)}%` : this.tr.noData;
    const burdenMod =
      burden === null
        ? 'neutral'
        : burden >= OVERVIEW_BURDEN_DANGER
        ? 'expense'
        : burden >= OVERVIEW_BURDEN_WARN
        ? 'warning'
        : 'income';

    this.createKPICard(cardsWrap, this.tr.overviewCreditBurden, burdenValue, burdenMod, '⚖️');
    this.createKPICard(
      cardsWrap,
      this.tr.overviewUpcomingPayments,
      this.fmt(upcoming),
      upcoming > 0 ? 'expense' : 'neutral',
      '📅'
    );
  }

  private renderBreakdownChart(parent: HTMLElement, records: FinanceRecord[]): void {
    const { tr } = this.ctx;
    const chartWrap = parent.createDiv('finance-chart-wrap');

    chartWrap.createEl('h3', { text: tr.overviewBreakdown, cls: 'finance-chart-title' });

    const controls = chartWrap.createDiv('finance-chart-controls');
    controls.createEl('span', { text: tr.groupBy, cls: 'finance-stat-label' });

    const select = controls.createEl('select', { cls: 'dropdown' });
    const groupOptions: { value: OverviewGroupBy; label: string }[] = [
      { value: 'category', label: tr.byCategory },
      { value: 'tag', label: tr.byTag },
      { value: 'payer', label: tr.byPayer },
      { value: 'year', label: tr.byYear },
      { value: 'month', label: tr.byMonth },
      { value: 'week', label: tr.byWeek },
    ];

    const currentGroupBy = this.state.overviewGroupBy ?? 'category';
    groupOptions.forEach(opt => {
      const option = select.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === currentGroupBy) {
        option.selected = true;
      }
    });

    select.addEventListener('change', () => {
      this.state.overviewGroupBy = select.value as OverviewGroupBy;
      this.ctx.saveState();
      this.renderBody();
    });

    const breakdown = calcGroupBreakdown(records, currentGroupBy, tr.other);
    if (breakdown.length === 0) {
      chartWrap.createEl('p', { text: tr.noChartData, cls: 'finance-no-data' });
      return;
    }

    const maxVal = Math.max(...breakdown.map(b => Math.max(b.income, b.expense))) || 1;
    const list = chartWrap.createDiv('finance-breakdown-list');

    breakdown.forEach(item => {
      const card = list.createDiv('finance-breakdown-item is-clickable');
      card.title = `${this.tr.records} → ${item.key}`;

      card.addEventListener('click', () => {
        this.tooltip.hideTip();
        const from = this.state.overviewDateFrom ?? '';
        const to = this.state.overviewDateTo ?? '';

        this.ctx.state.filter = {
          search: '',
          type: 'all',
          category: '',
          tag: '',
          payer: '',
          dateFrom: from,
          dateTo: to,
        };

        if (currentGroupBy === 'category') {
          this.ctx.state.filter.category = item.key === tr.other ? '' : item.key;
        } else if (currentGroupBy === 'tag') {
          this.ctx.state.filter.tag = item.key === tr.other ? '' : item.key;
        } else if (currentGroupBy === 'payer') {
          this.ctx.state.filter.payer = item.key === tr.other ? '' : item.key;
        } else if (currentGroupBy === 'year') {
          this.ctx.state.filter.dateFrom = `${item.key}-01-01`;
          this.ctx.state.filter.dateTo = `${item.key}-12-31`;
        } else if (currentGroupBy === 'month') {
          const [y, m] = item.key.split('-');
          const lastDay = daysInMonth(Number(y), Number(m));
          this.ctx.state.filter.dateFrom = `${item.key}-01`;
          this.ctx.state.filter.dateTo = `${item.key}-${String(lastDay).padStart(2, '0')}`;
        } else if (currentGroupBy === 'week') {
          const [yStr, wStr] = item.key.split('-W');
          const range = isoWeekRange(Number(yStr), Number(wStr));
          this.ctx.state.filter.dateFrom = range.from;
          this.ctx.state.filter.dateTo = range.to;
        }

        this.ctx.state.page = 0;
        this.ctx.saveState();
        this.onNavigate?.('records');
      });

      const header = card.createDiv('finance-breakdown-item-header');
      const nameEl = header.createDiv('finance-breakdown-item-name');
      nameEl.textContent = item.key;
      nameEl.title = item.key;

      const netEl = header.createDiv(`finance-breakdown-item-net ${item.net >= 0 ? 'income' : 'expense'}`);
      netEl.textContent = (item.net > 0 ? '+' : '') + this.fmt(item.net);

      if (item.income > 0) {
        const row = card.createDiv('finance-breakdown-bar-row');
        row.createDiv({ text: tr.income, cls: 'finance-breakdown-bar-label' });
        const track = row.createDiv('finance-breakdown-bar-track');
        const fill = track.createDiv('finance-breakdown-bar-fill income');
        const pct = Math.max(OVERVIEW_MIN_BAR_PCT, (item.income / maxVal) * PERCENT_100);
        fill.style.width = `${pct}%`;
        row.createDiv({ text: `+${this.fmt(item.income)}`, cls: 'finance-breakdown-bar-amount income' });

        const tipText = `${item.key}\n${tr.income}: ${this.fmt(item.income)}`;
        row.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mouseleave', () => this.tooltip.hideTip());
      }

      if (item.expense > 0) {
        const row = card.createDiv('finance-breakdown-bar-row');
        row.createDiv({ text: tr.expense, cls: 'finance-breakdown-bar-label' });
        const track = row.createDiv('finance-breakdown-bar-track');
        const fill = track.createDiv('finance-breakdown-bar-fill expense');
        const pct = Math.max(OVERVIEW_MIN_BAR_PCT, (item.expense / maxVal) * PERCENT_100);
        fill.style.width = `${pct}%`;
        row.createDiv({ text: `-${this.fmt(item.expense)}`, cls: 'finance-breakdown-bar-amount expense' });

        const tipText = `${item.key}\n${tr.expense}: ${this.fmt(item.expense)}`;
        row.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mouseleave', () => this.tooltip.hideTip());
      }
    });
  }

  private renderSavingsRateChart(parent: HTMLElement, records: FinanceRecord[], today: string): void {
    const { tr } = this.ctx;
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
      this.state.overviewDateFrom,
      this.state.overviewDateTo,
      today,
      OVERVIEW_TREND_MONTHS
    );

    if (savingsData.length === 0 || savingsData.every(d => d.income === 0 && d.expense === 0)) {
      chartWrap.createEl('p', { text: tr.noChartData, cls: 'finance-no-data' });
      return;
    }

    const minGroupW = this.ctx.isMobile ? OVERVIEW_MIN_GROUP_W_MOBILE : OVERVIEW_MIN_GROUP_W;
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

  private renderDebtsBreakdownChart(parent: HTMLElement, debts: DebtRecord[]): void {
    const { tr } = this.ctx;
    const chartWrap = parent.createDiv('finance-chart-wrap');

    chartWrap.createEl('h3', { text: tr.overviewDebtsSummary, cls: 'finance-chart-title' });

    const activeDebts = debts.filter(d => d.amount > 0);
    if (activeDebts.length === 0) {
      chartWrap.createEl('p', { text: tr.overviewNoDebts, cls: 'finance-no-data' });
      return;
    }

    const breakdown = calcDebtsBreakdown(activeDebts);
    const list = chartWrap.createDiv('finance-breakdown-list');

    breakdown.forEach(item => {
      const card = list.createDiv('finance-breakdown-item is-clickable');
      card.title = `${this.tr.debts} → ${item.person}`;

      card.addEventListener('click', () => {
        this.tooltip.hideTip();
        const person = item.person.trim();
        const match = (this.data?.debts ?? []).find(d => d.person.trim() === person);

        this.ctx.state.debtFilter = {
          search: '',
          status: 'all',
          direction: 'all',
          dateFrom: '',
          dateTo: '',
          person: person === '—' ? '' : person,
        };

        if (match) {
          this.ctx.state.debtExpandedId = match.id;
        }

        this.ctx.state.debtPage = 0;
        this.ctx.saveState();
        this.onNavigate?.('debts');
      });

      const header = card.createDiv('finance-breakdown-item-header');
      const nameEl = header.createDiv('finance-breakdown-item-name');
      nameEl.textContent = item.person;
      nameEl.title = item.person;

      const netEl = header.createDiv(`finance-breakdown-item-net ${item.net >= 0 ? 'income' : 'expense'}`);
      const netLabel = item.net >= 0 ? `+${this.fmt(item.net)}` : `-${this.fmt(Math.abs(item.net))}`;
      netEl.textContent = netLabel;

      if (item.lent > 0) {
        const row = card.createDiv('finance-breakdown-bar-row');
        row.createDiv({ text: `↑ ${tr.overviewDebtsLent}`, cls: 'finance-breakdown-bar-label' });
        const track = row.createDiv('finance-breakdown-bar-track');
        const fill = track.createDiv('finance-breakdown-bar-fill income');

        const maxLent = Math.max(...breakdown.map(b => b.lent));
        const pct = maxLent > 0 ? (item.lent / maxLent) * 100 : 0;
        fill.style.width = `${pct}%`;
        row.createDiv({ text: `+${this.fmt(item.lent)}`, cls: 'finance-breakdown-bar-amount income' });

        const repaidPct = item.lentRepaidPct;
        const tipText = `${item.person}\n${tr.overviewDebtsLent}: ${this.fmt(item.lent)}\n${tr.overviewDebtsRepaid}: ${this.fmt(item.lentRepaid)} (${repaidPct}%)`;
        row.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mouseleave', () => this.tooltip.hideTip());
      }

      if (item.borrowed > 0) {
        const row = card.createDiv('finance-breakdown-bar-row');
        row.createDiv({ text: `↓ ${tr.overviewDebtsBorrowed}`, cls: 'finance-breakdown-bar-label' });
        const track = row.createDiv('finance-breakdown-bar-track');
        const fill = track.createDiv('finance-breakdown-bar-fill expense');

        const maxBorrowed = Math.max(...breakdown.map(b => b.borrowed));
        const pct = maxBorrowed > 0 ? (item.borrowed / maxBorrowed) * 100 : 0;
        fill.style.width = `${pct}%`;
        row.createDiv({ text: `-${this.fmt(item.borrowed)}`, cls: 'finance-breakdown-bar-amount expense' });

        const repaidPct = item.borrowedRepaidPct;
        const tipText = `${item.person}\n${tr.overviewDebtsBorrowed}: ${this.fmt(item.borrowed)}\n${tr.overviewDebtsPaid}: ${this.fmt(item.borrowedRepaid)} (${repaidPct}%)`;
        row.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mouseleave', () => this.tooltip.hideTip());
      }
    });
  }

  private renderDepositsOverviewSection(parent: HTMLElement, today: string): void {
    const { data, tr } = this.ctx;
    if (!data) return;

    const chartWrap = parent.createDiv('finance-chart-wrap finance-chart-wrap-full');
    chartWrap.createEl('h3', { text: tr.overviewDepositsSummary, cls: 'finance-chart-title' });

    const deposits = data.deposits ?? [];
    if (deposits.length === 0) {
      chartWrap.createEl('p', { text: tr.overviewNoDeposits, cls: 'finance-no-data' });
      return;
    }

    const depositColorMap = new Map<string, string>();
    deposits.forEach((d, idx) => {
      const color = CHART_PALETTE[idx % CHART_PALETTE.length] ?? 'var(--color-green)';
      depositColorMap.set(d.id, color);
    });

    const interestData = calcDepositInterestOverTime(
      deposits,
      this.state.overviewDateFrom,
      this.state.overviewDateTo,
      today,
      OVERVIEW_TREND_MONTHS
    );

    const hasInterestData = interestData.length > 0 && interestData.some(d => d.total > 0);

    if (hasInterestData) {
      const legend = chartWrap.createDiv('finance-chart-legend');

      deposits.forEach(d => {
        const color = depositColorMap.get(d.id) ?? 'var(--color-green)';
        const item = legend.createDiv('finance-chart-legend-item');
        const dot = item.createSpan({ cls: 'finance-chart-legend-dot' });
        dot.style.background = color;
        item.createSpan({ text: d.name || d.bankName || '—' });
      });

      const itemCumulative = legend.createDiv('finance-chart-legend-item');
      const dotCum = itemCumulative.createSpan({ cls: 'finance-chart-legend-dot' });
      dotCum.style.background = 'var(--color-green)';
      itemCumulative.createSpan({ text: tr.overviewDepositCumulativeProfit });

      const maxMonthlyValue = Math.max(...interestData.map(d => d.total));
      const maxCumulativeValue = Math.max(...interestData.map(d => d.cumulativeTotal)) || 1;

      const minGroupW = this.ctx.isMobile ? OVERVIEW_MIN_GROUP_W_MOBILE : OVERVIEW_MIN_GROUP_W;
      const containerWidth = chartWrap.clientWidth || 400;
      const calculatedWidth = OVERVIEW_CHART_PAD_LEFT + interestData.length * minGroupW + OVERVIEW_CHART_PAD_RIGHT;
      const chartWidth = Math.max(containerWidth, calculatedWidth);

      const plotWidth = chartWidth - OVERVIEW_CHART_PAD_LEFT - OVERVIEW_CHART_PAD_RIGHT;
      const plotHeight = OVERVIEW_CHART_HEIGHT - OVERVIEW_CHART_PAD_TOP - OVERVIEW_CHART_PAD_BOTTOM;

      const spacing = plotWidth / interestData.length;
      const barWidth = Math.min(OVERVIEW_MAX_BAR_W, Math.max(4, spacing - OVERVIEW_BAR_SPACING_PAD));

      const scrollWrap = chartWrap.createDiv('finance-overview-chart-scroll');
      const svg_el = svg('svg', {
        width: chartWidth,
        height: OVERVIEW_CHART_HEIGHT,
        viewBox: `0 0 ${chartWidth} ${OVERVIEW_CHART_HEIGHT}`,
        class: 'finance-chart-svg',
      });

      const baselineY = OVERVIEW_CHART_PAD_TOP + plotHeight;

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
        label.textContent = fmtShort((maxMonthlyValue * i) / OVERVIEW_Y_TICKS);
        svg_el.appendChild(label);
      }

      const cumulativePoints: { x: number; y: number; item: DepositInterestMonth }[] = [];

      interestData.forEach((d: DepositInterestMonth, i: number) => {
        const x = OVERVIEW_CHART_PAD_LEFT + i * spacing + (spacing - barWidth) / 2;
        const cx = x + barWidth / 2;

        let accumulatedHeight = 0;

        d.segments.forEach(seg => {
          if (seg.amount <= 0) return;
          const segHeight = maxMonthlyValue > 0 ? (seg.amount / maxMonthlyValue) * plotHeight : 0;
          const segY = baselineY - accumulatedHeight - segHeight;
          const segColor = depositColorMap.get(seg.depositId) ?? 'var(--color-green)';
          const isPending = seg.status === 'pending';

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
          const tipText = `${seg.depositName} (${seg.bankName})\n${statusLabel}: ${this.fmt(seg.amount)}\n${d.label}`;
          rect.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
          rect.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
          rect.addEventListener('mouseleave', () => this.tooltip.hideTip());
          svg_el.appendChild(rect);

          accumulatedHeight += segHeight;
        });

        if (d.cumulativeTotal > 0 && maxCumulativeValue > 0) {
          const cumY = baselineY - Math.min(plotHeight, (d.cumulativeTotal / maxMonthlyValue) * plotHeight);
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

      cumulativePoints.forEach(p => {
        const point = svg('circle', {
          cx: p.x,
          cy: p.y,
          r: OVERVIEW_POINT_RADIUS,
          fill: 'var(--color-green)',
          class: 'finance-chart-point',
        });
        const tipText = `${p.item.label}\n${tr.overviewDepositCumulativeProfit}: ${this.fmt(p.item.cumulativeTotal)}`;
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

    const activeDeposits = calcActiveDepositsProgress(deposits, today);
    const section = chartWrap.createDiv('finance-deposits-overview-section');

    if (activeDeposits.length === 0) {
      section.createEl('p', { text: tr.overviewNoActiveDeposits, cls: 'finance-no-data' });
      return;
    }

    const grid = section.createDiv('finance-deposits-overview-grid');

    activeDeposits.forEach((dep: ActiveDepositProgress) => {
      const card = grid.createDiv('finance-deposit-overview-card is-clickable');
      card.title = `${tr.deposits} → ${dep.name}`;

      card.addEventListener('click', () => {
        this.tooltip.hideTip();
        this.ctx.state.depositExpandedId = dep.id;
        this.ctx.state.depositPage = 0;
        this.ctx.saveState();
        this.onNavigate?.('deposits');
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
        dep.accrualType === 'capitalization'
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
      val1.createSpan({ text: this.fmt(dep.amount) });
      val1.createSpan({ text: ` (${dep.interestRate}%)`, cls: 'finance-deposit-rate-tag' });

      const col2 = bodyRow.createDiv('finance-deposit-stat-col');
      col2.createDiv({ text: tr.overviewDepositNextPayout, cls: 'finance-deposit-stat-lbl' });
      const val2 = col2.createDiv('finance-deposit-stat-val success');
      if (dep.nextAccrualDate) {
        val2.textContent = `${fmtDate(dep.nextAccrualDate)} · +${this.fmt(dep.nextAccrualAmount ?? 0)}`;
      } else {
        val2.textContent = '—';
      }

      const col3 = bodyRow.createDiv('finance-deposit-stat-col');
      col3.createDiv({ text: tr.overviewDepositTotalReturn, cls: 'finance-deposit-stat-lbl' });
      const val3 = col3.createDiv('finance-deposit-stat-val bold');
      val3.textContent = this.fmt(dep.totalEstimatedReturn);

      const progressWrap = card.createDiv('finance-deposit-progress');
      const fill = progressWrap.createDiv('finance-deposit-progress-fill');
      fill.style.width = `${dep.progressPercent}%`;
      fill.style.background = depositColor;
    });
  }

  private fmt(amount: number): string {
    return (
      amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) +
      ' ' +
      this.ctx.currency
    );
  }


  private createKPICard(
    parent: HTMLElement,
    label: string,
    value: string,
    mod: 'income' | 'expense' | 'neutral' | 'warning',
    icon: string
  ): HTMLElement {
    const card = parent.createDiv(`finance-stat-card finance-stat-${mod}`);
    card.createEl('div', { text: icon, cls: 'finance-stat-icon' });
    const info = card.createDiv('finance-stat-info');
    info.createEl('div', { text: label, cls: 'finance-stat-label' });
    info.createEl('div', { text: value, cls: 'finance-stat-value' });
    return card;
  }
}
