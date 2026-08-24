import { ViewContext } from './context';
import {
  calcNetBalance,
  calcAssets,
  calcLiabilities,
  calcCreditBurden,
  calcUpcomingPayments,
} from './domain/overviewMetrics';

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

    const today = new Date().toISOString().slice(0, 10);

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

    // Placeholder for charts (Tasks 4-6)
    const chartsWrap = this.el.createDiv('finance-overview-charts');
    chartsWrap.createEl('p', { text: 'Графики будут реализованы в следующих задачах', cls: 'finance-placeholder' });
  }

  private fmt(amount: number): string {
    return amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + this.ctx.currency;
  }

  private createKPICard(parent: HTMLElement, label: string, value: string, mod: 'income' | 'expense' | 'neutral'): void {
    const card = parent.createDiv(`finance-stat-card finance-stat-${mod}`);
    const info = card.createDiv('finance-stat-info');
    info.createEl('div', { text: label, cls: 'finance-stat-label' });
    info.createEl('div', { text: value, cls: 'finance-stat-value' });
  }
}
