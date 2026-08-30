import { ViewContext } from '../../context';
import { DebtRecord } from '../../types';
import { createChartTooltip } from '../chartHelpers';
import { calcDebtsBreakdown } from '../../domain/overviewMetrics';

export class DebtsBreakdownChart {
  private ctx: ViewContext;
  private tooltip = createChartTooltip();

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  destroy(): void {
    this.tooltip.destroy();
  }

  render(parent: HTMLElement, debts: DebtRecord[], onNavigate?: (mode: 'debts') => void): void {
    const { tr, data } = this.ctx;
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
      card.title = `${tr.debts} → ${item.person}`;

      card.addEventListener('click', () => {
        this.tooltip.hideTip();
        const person = item.person.trim();
        const match = (data?.debts ?? []).find(d => d.person.trim() === person);

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
        onNavigate?.('debts');
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

  private fmt(amount: number): string {
    return (
      amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) +
      ' ' +
      this.ctx.currency
    );
  }
}
