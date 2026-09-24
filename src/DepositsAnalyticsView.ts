import { fmtDate } from "./utils";
import { ViewContext } from './context';
import { DepositRecord, PERCENT_100 } from './types';
import { safeEndDate, toDateStr } from './domain/dateMath';
import { round2 } from './domain/money';
import { CSS_CLASS, DepositStatus, PaymentStatus} from './constants';
import { renderStatCards, StatCardItem } from './ui/tabHelpers';
import { renderDateRangeFilter } from './tabs/tabUtils';
import { BaseAnalyticsView } from './ui/BaseAnalyticsView';

export class DepositsAnalyticsView extends BaseAnalyticsView {
  private deposits: DepositRecord[];

  constructor(el: HTMLElement, deposits: DepositRecord[], ctx: ViewContext) {
    super(el, ctx);
    this.deposits = deposits;
  }

  render(): void {
    this.setupContainer();

    this.renderControls();
    this.renderSummaryCards();
    this.renderActiveDepositsList();
  }

  private renderControls(): void {
    renderDateRangeFilter(
      this.el,
      this.ctx,
      {
        from: 'depositAnalyticsDateFrom',
        to: 'depositAnalyticsDateTo',
      },
      this.tr,
      () => this.render()
    );
  }

  private getFilteredDeposits(): DepositRecord[] {
    const dateFrom = this.state.depositAnalyticsDateFrom ?? '';
    const dateTo = this.state.depositAnalyticsDateTo ?? '';
    return this.deposits.filter(d => {
      if (dateFrom && d.startDate < dateFrom) return false;
      if (dateTo && d.startDate > dateTo) return false;
      return true;
    });
  }

  private renderSummaryCards(): void {
    const deposits = this.getFilteredDeposits();
    const active = deposits.filter(d => d.status === DepositStatus.ACTIVE);
    const totalBalance = active.reduce((s, d) => s + d.amount, 0);
    const totalAccrued = deposits.reduce((s, d) =>
      s + d.accruals.filter(a => a.status === PaymentStatus.PAID).reduce((ps, a) => ps + a.amount, 0), 0);

    const projectedIncome = deposits.reduce((s, d) =>
      s + d.accruals.reduce((ps, a) => ps + a.amount, 0), 0);

    let weightedRate = 0, totalWeight = 0;
    active.forEach(d => { weightedRate += d.interestRate * d.amount; totalWeight += d.amount; });
    const avgRate = totalWeight > 0 ? round2(weightedRate / totalWeight) : 0;

    const cards: StatCardItem[] = [
      { label: this.tr.depositTotalBalance, value: this.ctx.fmt(totalBalance) },
      { label: this.tr.depositTotalAccrued, value: this.ctx.fmt(totalAccrued), mod: CSS_CLASS.INCOME },
      { label: this.tr.depositProjectedIncome, value: this.ctx.fmt(projectedIncome), mod: CSS_CLASS.INCOME },
      { label: this.tr.depositAvgRate, value: `${avgRate}%`, mod: 'neutral' },
    ];
    renderStatCards(this.el, cards, 'finance-credit-analytics-cards');
  }

  private renderActiveDepositsList(): void {
    const deposits = this.getFilteredDeposits().filter(d => d.status === DepositStatus.ACTIVE);
    if (!deposits.length) return;

    const section = this.el.createDiv('finance-credit-progress-list');
    section.createDiv({ text: this.tr.depositActiveList, cls: 'finance-analytics-section-title' });

    deposits.forEach(d => {
      const endDate = safeEndDate(d.startDate, d.termMonths);
      const today = toDateStr(new Date());
      let pct = 0;
      if (d.startDate && endDate) {
        const start = new Date(d.startDate).getTime();
        const end = new Date(endDate).getTime();
        const now = new Date(today).getTime();
        const total = end - start;
        if (total > 0) pct = Math.min(PERCENT_100, Math.max(0, round2(((now - start) / total) * PERCENT_100)));
      }

      const totalProfit = d.accruals.reduce((s, a) => s + a.amount, 0);

      const item = section.createDiv('finance-credit-progress-item');
      const header = item.createDiv('finance-credit-progress-header');
      header.createSpan({ text: d.name || d.bankName || '—', cls: 'finance-credit-progress-name' });
      header.createSpan({ text: `${d.interestRate}% · ${this.ctx.fmt(d.amount)}`, cls: 'finance-credit-progress-pct' });

      const sub = item.createDiv('finance-credit-progress-sub');
      sub.createSpan({ text: d.bankName || '—', cls: 'finance-credit-progress-bank' });
      if (endDate) sub.createSpan({ text: `До ${fmtDate(endDate)}`, cls: 'finance-credit-progress-date' });
      sub.createSpan({ text: `+${this.ctx.fmt(totalProfit)}`, cls: 'finance-credit-progress-amount finance-text-success' });

      if (d.startDate && endDate) {
        const bar = item.createDiv('finance-deposit-progress');
        const fill = bar.createDiv('finance-deposit-progress-fill');
        fill.style.width = `${pct}%`;
      }
    });
  }
}
