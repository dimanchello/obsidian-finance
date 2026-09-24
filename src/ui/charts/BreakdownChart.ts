import { FinanceRecord, OverviewGroupBy, OVERVIEW_MIN_BAR_PCT, PERCENT_100, DEFAULT_FILTER, AccountMode } from '../../types';
import { CSS_CLASS } from '../../constants';
import { calcGroupBreakdown } from '../../domain/metrics';
import { OverviewRecordsModal } from '../../modals/OverviewRecordsModal';
import { formatChartAmount } from '../../domain/formattingHelpers';
import { filterRecordsByGrouping } from '../../domain/filterUtils';
import { BaseChart } from './BaseChart';

export class BreakdownChart extends BaseChart {

  destroy(): void {
    this.tooltip.destroy();
  }

  render(
    parent: HTMLElement,
    records: FinanceRecord[],
    onNavigate?: (mode: AccountMode) => void,
    onGroupByChange?: () => void
  ): void {
    const { tr, state } = this.ctx;
    const chartWrap = parent.createDiv('finance-chart-wrap');

    chartWrap.createEl('h3', { text: tr.overviewBreakdown, cls: CSS_CLASS.FINANCE_CHART_TITLE });

    const controls = chartWrap.createDiv('finance-chart-controls');
    controls.createSpan({ text: tr.groupBy, cls: 'finance-stat-label' });

    const select = controls.createEl('select', { cls: 'dropdown' });
    const groupOptions: { value: OverviewGroupBy; label: string }[] = [
      { value: 'category', label: tr.byCategory },
      { value: 'tag', label: tr.byTag },
      { value: 'payer', label: tr.byPayer },
      { value: 'year', label: tr.byYear },
      { value: 'month', label: tr.byMonth },
      { value: 'week', label: tr.byWeek },
    ];

    const currentGroupBy = state.overviewGroupBy ?? 'category';
    groupOptions.forEach(opt => {
      const option = select.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === currentGroupBy) {
        option.selected = true;
      }
    });

    select.addEventListener('change', () => {
      state.overviewGroupBy = select.value as OverviewGroupBy;
      this.ctx.saveState();
      onGroupByChange?.();
    });

    const breakdown = calcGroupBreakdown(records, currentGroupBy, tr.other);
    if (breakdown.length === 0) {
      this.renderNoData(chartWrap, tr.noChartData);
      return;
    }

    const maxVal = Math.max(...breakdown.map(b => Math.max(b.income, b.expense))) || 1;
    const list = chartWrap.createDiv('finance-breakdown-list');

    breakdown.forEach(item => {
      const card = list.createDiv('finance-breakdown-item is-clickable');
      card.title = `${item.key} (${tr.overviewViewDetails})`;

      card.addEventListener('click', () => {
        this.tooltip.hideTip();

        const nonInternalRecords = records.filter(r => !r.isInternal);
        const { records: sliceRecords, dateFrom: filterDateFrom, dateTo: filterDateTo } = filterRecordsByGrouping(
          nonInternalRecords,
          currentGroupBy,
          item.key,
          tr.other
        );

        const handleNavigate = () => {
          this.ctx.state.filter = {
            ...DEFAULT_FILTER,
            category: currentGroupBy === 'category' ? (item.key === tr.other ? '' : item.key) : '',
            tag: currentGroupBy === 'tag' ? (item.key === tr.other ? '' : item.key) : '',
            payer: currentGroupBy === 'payer' ? (item.key === tr.other ? '' : item.key) : '',
            dateFrom: filterDateFrom,
            dateTo: filterDateTo,
          };

          this.ctx.state.page = 0;
          this.ctx.saveState();
          onNavigate?.(AccountMode.RECORDS);
        };

        new OverviewRecordsModal(this.ctx.app, {
          ctx: this.ctx,
          title: item.key,
          records: sliceRecords,
          onNavigateToRecords: onNavigate ? handleNavigate : undefined,
          onRecordUpdated: () => onGroupByChange?.(),
        }).open();
      });

      const header = card.createDiv('finance-breakdown-item-header');
      const nameEl = header.createDiv('finance-breakdown-item-name');
      nameEl.textContent = item.key;
      nameEl.title = item.key;

      const netEl = header.createDiv(`finance-breakdown-item-net ${item.net >= 0 ? 'income' : 'expense'}`);
      netEl.textContent = (item.net > 0 ? '+' : '') + formatChartAmount(item.net, this.ctx.currency);

      if (item.income > 0) {
        const row = card.createDiv('finance-breakdown-bar-row');
        row.createDiv({ text: tr.income, cls: 'finance-breakdown-bar-label' });
        const track = row.createDiv('finance-breakdown-bar-track');
        const fill = track.createDiv('finance-breakdown-bar-fill income');
        const pct = Math.max(OVERVIEW_MIN_BAR_PCT, (item.income / maxVal) * PERCENT_100);
        fill.style.width = `${pct}%`;
        row.createDiv({ text: `+${formatChartAmount(item.income, this.ctx.currency)}`, cls: 'finance-breakdown-bar-amount income' });

        const tipText = `${item.key}\n${tr.income}: ${formatChartAmount(item.income, this.ctx.currency)}`;
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
        row.createDiv({ text: `-${formatChartAmount(item.expense, this.ctx.currency)}`, cls: 'finance-breakdown-bar-amount expense' });

        const tipText = `${item.key}\n${tr.expense}: ${formatChartAmount(item.expense, this.ctx.currency)}`;
        row.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mouseleave', () => this.tooltip.hideTip());
      }
    });
  }
}
