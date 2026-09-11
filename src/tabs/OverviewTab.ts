import { ViewContext } from '../context';
import {
  FinanceRecord,
  OVERVIEW_BURDEN_WARN,
  OVERVIEW_BURDEN_DANGER,
  OVERVIEW_PRESET_MONTHS_3,
  OVERVIEW_PRESET_MONTHS_6,
  OVERVIEW_INPUT_DEBOUNCE_MS,
  OVERVIEW_TREND_MONTHS,
} from '../types';
import {
  calcNetBalance,
  calcAssets,
  calcLiabilities,
  calcCreditBurden,
  calcUpcomingPayments,
  filterRecordsByDateRange,
  ALL_TIME_MONTHS,
} from '../domain/overviewMetrics';
import { shiftMonths, getTodayStr } from '../utils';
import { MoneyFlowChart } from '../ui/charts/MoneyFlowChart';
import { AssetsChart } from '../ui/charts/AssetsChart';
import { BurdenChart } from '../ui/charts/BurdenChart';
import { BreakdownChart } from '../ui/charts/BreakdownChart';
import { SavingsRateChart } from '../ui/charts/SavingsRateChart';
import { DebtsBreakdownChart } from '../ui/charts/DebtsBreakdownChart';
import { DepositsOverview } from '../ui/charts/DepositsOverview';
import { CreditsOverview } from '../ui/charts/CreditsOverview';
import { renderStatCard } from '../ui/statCards';

export class OverviewTab {
  private el: HTMLElement;
  private ctx: ViewContext;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Chart components
  private moneyFlowChart: MoneyFlowChart;
  private assetsChart: AssetsChart;
  private burdenChart: BurdenChart;
  private breakdownChart: BreakdownChart;
  private savingsRateChart: SavingsRateChart;
  private debtsBreakdownChart: DebtsBreakdownChart;
  private depositsOverview: DepositsOverview;
  private creditsOverview: CreditsOverview;

  public onNavigate?: (mode: 'records' | 'debts' | 'credits' | 'deposits' | 'currency') => void;
  public onUpdate?: () => void;

  private filterBarEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private fromInput: HTMLInputElement | null = null;
  private toInput: HTMLInputElement | null = null;
  private presetButtons: { btn: HTMLButtonElement; from: string; to: string; isAllTime: boolean }[] = [];

  constructor(el: HTMLElement, ctx: ViewContext) {
    this.el = el;
    this.ctx = ctx;
    this.moneyFlowChart = new MoneyFlowChart(ctx);
    this.assetsChart = new AssetsChart(ctx);
    this.burdenChart = new BurdenChart(ctx);
    this.breakdownChart = new BreakdownChart(ctx);
    this.savingsRateChart = new SavingsRateChart(ctx);
    this.debtsBreakdownChart = new DebtsBreakdownChart(ctx);
    this.depositsOverview = new DepositsOverview(ctx);
    this.creditsOverview = new CreditsOverview(ctx);
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
    this.breakdownChart.destroy();
    this.savingsRateChart.destroy();
    this.debtsBreakdownChart.destroy();
    this.depositsOverview.destroy();
    this.creditsOverview.destroy();
  }

  render(): void {
    this.el.empty();
    this.el.addClass('finance-overview-tab');
    if (this.ctx.isMobile) this.el.addClass('is-mobile');
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
    // "All time" widens the trend span to the data itself; otherwise charts keep their rolling window.
    const trendMonths = this.state.overviewAllTime === true ? ALL_TIME_MONTHS : OVERVIEW_TREND_MONTHS;

    this.renderKpiCards(filteredRecords, today);

    const handleUpdate = () => {
      this.onUpdate?.();
      this.renderBody();
    };

    const chartsWrap = this.bodyEl.createDiv('finance-overview-charts');
    this.moneyFlowChart.render(chartsWrap, filteredRecords);
    this.breakdownChart.render(chartsWrap, filteredRecords, mode => this.onNavigate?.(mode), handleUpdate);
    this.savingsRateChart.render(chartsWrap, data.records, today, mode => this.onNavigate?.(mode), trendMonths);
    this.burdenChart.render(chartsWrap, data.credits, data.records, this.state.overviewDateFrom, this.state.overviewDateTo, today, trendMonths);
    this.assetsChart.render(chartsWrap, data.deposits, data.exchanges, data.credits, data.debts, this.state.overviewDateFrom, this.state.overviewDateTo, today, trendMonths);
    this.debtsBreakdownChart.render(chartsWrap, data.debts, mode => this.onNavigate?.(mode), handleUpdate);
    this.depositsOverview.render(chartsWrap, data.deposits, today, mode => this.onNavigate?.(mode), trendMonths, handleUpdate);
    this.creditsOverview.render(chartsWrap, data.credits, today, mode => this.onNavigate?.(mode), handleUpdate);
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
        isAllTime: true,
      },
      {
        id: 'this_month',
        label: this.tr.overviewPeriodMonth,
        from: thisMonthStart,
        to: today,
        isAllTime: false,
      },
      {
        id: '3_months',
        label: this.tr.overviewPeriod3Months,
        from: threeMonthsAgo,
        to: today,
        isAllTime: false,
      },
      {
        id: '6_months',
        label: this.tr.overviewPeriod6Months,
        from: sixMonthsAgo,
        to: today,
        isAllTime: false,
      },
      {
        id: 'this_year',
        label: this.tr.overviewPeriodYear,
        from: thisYearStart,
        to: today,
        isAllTime: false,
      },
    ];

    presets.forEach(preset => {
      const btn = presetsWrap.createEl('button', {
        text: preset.label,
        cls: 'finance-overview-preset-btn',
      });
      this.presetButtons.push({ btn, from: preset.from, to: preset.to, isAllTime: preset.isAllTime });

      btn.addEventListener('click', () => {
        if (this.debounceTimer !== null) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        this.state.overviewDateFrom = preset.from;
        this.state.overviewDateTo = preset.to;
        this.state.overviewAllTime = preset.isAllTime;
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
      this.state.overviewAllTime = this.fromInput.value === '' && (!this.toInput || this.toInput.value === '');
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
      this.state.overviewAllTime = this.toInput.value === '' && (!this.fromInput || this.fromInput.value === '');
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
    const curAllTime = this.state.overviewAllTime === true;
    const today = getTodayStr();

    this.presetButtons.forEach(({ btn, from, to, isAllTime }) => {
      const isMatch = isAllTime
        ? curAllTime && curFrom === '' && curTo === ''
        : !curAllTime &&
          from !== '' &&
          curFrom === from &&
          (curTo === to || (!curTo && to === today));

      if (isMatch) {
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
    return renderStatCard(parent, { label, value, mod, icon });
  }
}
