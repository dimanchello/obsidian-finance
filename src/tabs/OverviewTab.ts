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
  OVERVIEW_BAR_GAP,
  OVERVIEW_GROUP_GAP,
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
} from '../types';
import {
  calcNetBalance,
  calcAssets,
  calcLiabilities,
  calcCreditBurden,
  calcUpcomingPayments,
  groupRecordsByMonth,
  calcCreditBurdenOverTime,
  calcAssetsLiabilitiesOverTime,
  calcSavingsRateOverTime,
  calcDebtsBreakdown,
  filterRecordsByDateRange,
  calcGroupBreakdown,
  MonthGroup,
  CreditBurdenMonth,
  AssetLiabilityMonth,
  SavingsRateMonth,
} from '../domain/overviewMetrics';
import { createChartTooltip, fmtShort, svg } from '../ui/chartHelpers';
import { shiftMonths, getTodayStr } from '../utils';
import { isoWeekRange, daysInMonth } from '../domain/dateMath';

export class OverviewTab {
  private el: HTMLElement;
  private ctx: ViewContext;
  private tooltip = createChartTooltip();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  public onNavigate?: (mode: 'records' | 'debts' | 'credits' | 'deposits' | 'currency') => void;

  private filterBarEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private fromInput: HTMLInputElement | null = null;
  private toInput: HTMLInputElement | null = null;
  private presetButtons: { btn: HTMLButtonElement; from: string; to: string }[] = [];

  constructor(el: HTMLElement, ctx: ViewContext) {
    this.el = el;
    this.ctx = ctx;
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
    this.renderMoneyFlowChart(chartsWrap, filteredRecords);
    this.renderBreakdownChart(chartsWrap, filteredRecords);
    this.renderSavingsRateChart(chartsWrap, data.records, today);
    this.renderCreditBurdenChart(chartsWrap, today);
    this.renderAssetLiabilityChart(chartsWrap, today);
    this.renderDebtsBreakdownChart(chartsWrap, data.debts);
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

  private renderMoneyFlowChart(parent: HTMLElement, records: FinanceRecord[]): void {
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

    const netPoints: { x: number; y: number; group: MonthGroup }[] = [];

    groups.forEach((g: MonthGroup, i: number) => {
      const cx = OVERVIEW_CHART_PAD_LEFT + i * groupWidth + groupWidth / 2;

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

      const net = g.income - g.expense;
      const netY =
        maxValue > 0
          ? baselineY - Math.max(0, (net / maxValue) * plotHeight)
          : baselineY;
      netPoints.push({ x: cx, y: netY, group: g });

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

    if (netPoints.length > 1) {
      const pathD = netPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const netLine = svg('path', {
        d: pathD,
        stroke: 'var(--text-accent)',
        'stroke-width': OVERVIEW_LINE_STROKE_W,
        fill: 'none',
      });
      svg_el.appendChild(netLine);
    }

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

    scrollWrap.appendChild(svg_el);
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

  private renderCreditBurdenChart(parent: HTMLElement, today: string): void {
    const { data, tr } = this.ctx;
    if (!data) return;

    const chartWrap = parent.createDiv('finance-chart-wrap');
    chartWrap.createEl('h3', { text: tr.overviewCreditBurdenChart, cls: 'finance-chart-title' });

    const burdenData = calcCreditBurdenOverTime(
      data.credits,
      data.records,
      this.state.overviewDateFrom,
      this.state.overviewDateTo,
      today,
      OVERVIEW_TREND_MONTHS
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

    const burdenPoints: { x: number; y: number; item: CreditBurdenMonth }[] = [];

    burdenData.forEach((d: CreditBurdenMonth, i: number) => {
      const x = OVERVIEW_CHART_PAD_LEFT + i * spacing + (spacing - barWidth) / 2;

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

      if (d.burdenPercent !== null) {
        const burdenY = baselineY - Math.min(plotHeight, Math.max(0, (d.burdenPercent / PERCENT_100) * plotHeight));
        burdenPoints.push({ x: x + barWidth / 2, y: burdenY, item: d });
      }

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

    scrollWrap.appendChild(svg_el);
  }

  private renderAssetLiabilityChart(parent: HTMLElement, today: string): void {
    const { data, tr } = this.ctx;
    if (!data) return;

    const chartWrap = parent.createDiv('finance-chart-wrap');
    chartWrap.createEl('h3', { text: tr.overviewAssetLiabilityTrend, cls: 'finance-chart-title' });

    const trendData = calcAssetsLiabilitiesOverTime(
      data.deposits,
      data.exchanges,
      data.credits,
      data.debts,
      this.state.overviewDateFrom,
      this.state.overviewDateTo,
      today,
      OVERVIEW_TREND_MONTHS
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

    const xStep = plotWidth / Math.max(1, trendData.length - 1);
    const assetsPoints: string[] = [];
    const liabilitiesPoints: string[] = [];
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

      assetsPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${assetsY}`);
      liabilitiesPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${liabilitiesY}`);
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

    const assetsAreaPoints = [...assetsPoints, `L ${lastX} ${bottomY}`, `L ${OVERVIEW_CHART_PAD_LEFT} ${bottomY}`, 'Z'];
    const liabilitiesAreaPoints = [...liabilitiesPoints, `L ${lastX} ${bottomY}`, `L ${OVERVIEW_CHART_PAD_LEFT} ${bottomY}`, 'Z'];

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

    assetPointCoords.forEach(p => {
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

    liabilityPointCoords.forEach(p => {
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
    const maxVal = Math.max(...breakdown.map(b => Math.max(b.lent, b.borrowed))) || 1;
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
        const pct = Math.max(OVERVIEW_MIN_BAR_PCT, (item.lent / maxVal) * PERCENT_100);
        fill.style.width = `${pct}%`;
        row.createDiv({ text: `+${this.fmt(item.lent)}`, cls: 'finance-breakdown-bar-amount income' });

        const tipText = `${item.person}\n${tr.overviewDebtsLent}: ${this.fmt(item.lent)}`;
        row.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mouseleave', () => this.tooltip.hideTip());
      }

      if (item.borrowed > 0) {
        const row = card.createDiv('finance-breakdown-bar-row');
        row.createDiv({ text: `↓ ${tr.overviewDebtsBorrowed}`, cls: 'finance-breakdown-bar-label' });
        const track = row.createDiv('finance-breakdown-bar-track');
        const fill = track.createDiv('finance-breakdown-bar-fill expense');
        const pct = Math.max(OVERVIEW_MIN_BAR_PCT, (item.borrowed / maxVal) * PERCENT_100);
        fill.style.width = `${pct}%`;
        row.createDiv({ text: `-${this.fmt(item.borrowed)}`, cls: 'finance-breakdown-bar-amount expense' });

        const tipText = `${item.person}\n${tr.overviewDebtsBorrowed}: ${this.fmt(item.borrowed)}`;
        row.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mouseleave', () => this.tooltip.hideTip());
      }
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
