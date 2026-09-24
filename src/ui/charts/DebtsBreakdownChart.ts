import { DebtRecord, AccountMode } from '../../types';
import { CSS_CLASS } from '../../constants';
import { calcDebtsBreakdown } from '../../domain/metrics';
import { DebtDetailModal } from '../../modals/DebtDetailModal';
import { formatChartAmount } from '../../domain/formattingHelpers';
import { BaseChart } from './BaseChart';

export class DebtsBreakdownChart extends BaseChart {

  destroy(): void {
    this.tooltip.destroy();
  }

  render(
    parent: HTMLElement,
    debts: DebtRecord[],
    onNavigate?: (mode: AccountMode) => void,
    onUpdate?: () => void
  ): void {
    const { tr, data } = this.ctx;
    const chartWrap = parent.createDiv('finance-chart-wrap');

    chartWrap.createEl('h3', { text: tr.overviewDebtsSummary, cls: CSS_CLASS.FINANCE_CHART_TITLE });

    const activeDebts = debts.filter(d => d.amount > 0);
    if (activeDebts.length === 0) {
      this.renderNoData(chartWrap, tr.overviewNoDebts);
      return;
    }

    const breakdown = calcDebtsBreakdown(activeDebts);
    const list = chartWrap.createDiv('finance-breakdown-list');

    breakdown.forEach(item => {
      const card = list.createDiv('finance-breakdown-item is-clickable');
      card.title = `${item.person} (${tr.overviewViewDetails})`;

      card.addEventListener('click', () => {
        this.tooltip.hideTip();
        const person = item.person.trim();
        const match = (data?.debts ?? []).find(d => (d.person.trim() || '—') === person);
        if (!match) return;

        const handleNavigate = () => {
          this.ctx.state.debtFilter = {
            search: '',
            status: 'all',
            direction: 'all',
            dateFrom: '',
            dateTo: '',
            person: person === '—' ? '' : person,
          };

          this.ctx.state.debtExpandedId = match.id;
          this.ctx.state.debtPage = 0;
          this.ctx.saveState();
          onNavigate?.(AccountMode.DEBTS);
        };

        new DebtDetailModal(this.ctx.app, {
          ctx: this.ctx,
          debt: match,
          person,
          onNavigateToDebts: onNavigate ? handleNavigate : undefined,
          onDebtUpdated: () => onUpdate?.(),
        }).open();
      });

      const header = card.createDiv('finance-breakdown-item-header');
      const nameEl = header.createDiv('finance-breakdown-item-name');
      nameEl.textContent = item.person;
      nameEl.title = item.person;

      const netEl = header.createDiv(`finance-breakdown-item-net ${item.net >= 0 ? 'income' : 'expense'}`);
      const netLabel = item.net >= 0 ? `+${formatChartAmount(item.net, this.ctx.currency)}` : `-${formatChartAmount(Math.abs(item.net), this.ctx.currency)}`;
      netEl.textContent = netLabel;

      if (item.lent > 0) {
        const row = card.createDiv('finance-breakdown-bar-row');
        row.createDiv({ text: `↑ ${tr.overviewDebtsLent}`, cls: 'finance-breakdown-bar-label' });
        const track = row.createDiv('finance-breakdown-bar-track');
        const fill = track.createDiv('finance-breakdown-bar-fill income');

        const maxLent = Math.max(...breakdown.map(b => b.lent));
        const pct = maxLent > 0 ? (item.lent / maxLent) * 100 : 0;
        fill.style.width = `${pct}%`;
        row.createDiv({ text: `+${formatChartAmount(item.lent, this.ctx.currency)}`, cls: 'finance-breakdown-bar-amount income' });

        const repaidPct = item.lentRepaidPct;
        const tipText = `${item.person}\n${tr.overviewDebtsLent}: ${formatChartAmount(item.lent, this.ctx.currency)}\n${tr.overviewDebtsRepaid}: ${formatChartAmount(item.lentRepaid, this.ctx.currency)} (${repaidPct}%)`;
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
        row.createDiv({ text: `-${formatChartAmount(item.borrowed, this.ctx.currency)}`, cls: 'finance-breakdown-bar-amount expense' });

        const repaidPct = item.borrowedRepaidPct;
        const tipText = `${item.person}\n${tr.overviewDebtsBorrowed}: ${formatChartAmount(item.borrowed, this.ctx.currency)}\n${tr.overviewDebtsPaid}: ${formatChartAmount(item.borrowedRepaid, this.ctx.currency)} (${repaidPct}%)`;
        row.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        row.addEventListener('mouseleave', () => this.tooltip.hideTip());
      }
    });
  }
}
