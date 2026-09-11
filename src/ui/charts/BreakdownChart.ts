import { ViewContext } from '../../context';
import { FinanceRecord, OverviewGroupBy, OVERVIEW_MIN_BAR_PCT, PERCENT_100, DEFAULT_FILTER } from '../../types';
import { createChartTooltip } from '../chartHelpers';
import { calcGroupBreakdown } from '../../domain/overviewMetrics';
import { isoWeekRange, daysInMonth } from '../../domain/dateMath';
import { OverviewRecordsModal } from '../../modals/OverviewRecordsModal';

export class BreakdownChart {
  private ctx: ViewContext;
  private tooltip = createChartTooltip();

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  destroy(): void {
    this.tooltip.destroy();
  }

  render(
    parent: HTMLElement,
    records: FinanceRecord[],
    onNavigate?: (mode: 'records') => void,
    onGroupByChange?: () => void
  ): void {
    const { tr, state } = this.ctx;
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
      chartWrap.createEl('p', { text: tr.noChartData, cls: 'finance-no-data' });
      return;
    }

    const maxVal = Math.max(...breakdown.map(b => Math.max(b.income, b.expense))) || 1;
    const list = chartWrap.createDiv('finance-breakdown-list');

    breakdown.forEach(item => {
      const card = list.createDiv('finance-breakdown-item is-clickable');
      card.title = `${item.key} (${tr.overviewViewDetails})`;

      card.addEventListener('click', () => {
        this.tooltip.hideTip();
        const from = state.overviewDateFrom ?? '';
        const to = state.overviewDateTo ?? '';

        const nonInternalRecords = records.filter(r => !r.isInternal);
        let sliceRecords: FinanceRecord[] = [];
        let filterDateFrom = from;
        let filterDateTo = to;

        if (currentGroupBy === 'category') {
          sliceRecords = nonInternalRecords.filter(r => (item.key === tr.other ? !r.category?.trim() : r.category?.trim() === item.key));
        } else if (currentGroupBy === 'tag') {
          sliceRecords = nonInternalRecords.filter(r => (item.key === tr.other ? !r.tag?.trim() : r.tag?.trim() === item.key));
        } else if (currentGroupBy === 'payer') {
          sliceRecords = nonInternalRecords.filter(r => (item.key === tr.other ? !r.payer?.trim() : r.payer?.trim() === item.key));
        } else if (currentGroupBy === 'year') {
          if (item.key === tr.other) {
            sliceRecords = nonInternalRecords.filter(r => !r.date);
            filterDateFrom = '';
            filterDateTo = '';
          } else {
            filterDateFrom = `${item.key}-01-01`;
            filterDateTo = `${item.key}-12-31`;
            sliceRecords = nonInternalRecords.filter(r => r.date >= filterDateFrom && r.date <= filterDateTo);
          }
        } else if (currentGroupBy === 'month') {
          if (item.key === tr.other) {
            sliceRecords = nonInternalRecords.filter(r => !r.date);
            filterDateFrom = '';
            filterDateTo = '';
          } else {
            const [y, m] = item.key.split('-');
            const lastDay = daysInMonth(Number(y), Number(m));
            filterDateFrom = `${item.key}-01`;
            filterDateTo = `${item.key}-${String(lastDay).padStart(2, '0')}`;
            sliceRecords = nonInternalRecords.filter(r => r.date >= filterDateFrom && r.date <= filterDateTo);
          }
        } else if (currentGroupBy === 'week') {
          if (item.key === tr.other) {
            sliceRecords = nonInternalRecords.filter(r => !r.date);
            filterDateFrom = '';
            filterDateTo = '';
          } else {
            const [yStr, wStr] = item.key.split('-W');
            const range = isoWeekRange(Number(yStr), Number(wStr));
            filterDateFrom = range.from;
            filterDateTo = range.to;
            sliceRecords = nonInternalRecords.filter(r => r.date >= filterDateFrom && r.date <= filterDateTo);
          }
        }

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
          onNavigate?.('records');
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

  private fmt(amount: number): string {
    return (
      amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) +
      ' ' +
      this.ctx.currency
    );
  }
}
