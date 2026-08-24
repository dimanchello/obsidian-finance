import { ViewContext } from '../context';
import {
  calcNetBalance,
  calcAssets,
  calcLiabilities,
  calcCreditBurden,
  calcUpcomingPayments,
} from '../domain/overviewMetrics';
import { OVERVIEW_BURDEN_WARN, OVERVIEW_BURDEN_DANGER } from '../types';
import type { CreditRecord, FinanceRecord, DebtRecord } from '../types';
import { toDateStr } from '../domain/dateMath';

export class OverviewTab {
  constructor(private ctx: ViewContext) {}

  render(container: HTMLElement): void {
    container.empty();
    container.addClass('ft-overview-tab');

    this.renderMetricCards(container);
  }

  private renderMetricCards(container: HTMLElement): void {
    const grid = container.createDiv({ cls: 'ft-overview-grid' });

    const data = this.ctx.data;
    if (!data) return;

    const records = data.records ?? [];
    const deposits = data.deposits ?? [];
    const exchanges = data.exchanges ?? [];
    const debts = data.debts ?? [];
    const credits = data.credits ?? [];
    const today = toDateStr(new Date());

    // Net Worth card
    const netBalance = calcNetBalance(records);
    this.renderCard(
      grid,
      this.ctx.tr.overviewNetBalance,
      netBalance,
      'net-balance',
      netBalance >= 0 ? 'positive' : 'negative'
    );

    // Assets card
    const assets = calcAssets(deposits, exchanges, debts);
    this.renderCard(
      grid,
      this.ctx.tr.overviewAssets,
      assets,
      'assets',
      'neutral'
    );

    // Liabilities card
    const liabilities = calcLiabilities(credits, debts);
    this.renderCard(
      grid,
      this.ctx.tr.overviewLiabilities,
      liabilities,
      'liabilities',
      'neutral'
    );

    // Credit Burden card
    this.renderCreditBurdenCard(grid, credits, records, today);

    // Upcoming Payments card
    this.renderUpcomingPaymentsCard(grid, credits, debts, today);
  }

  private renderCard(
    container: HTMLElement,
    label: string,
    amount: number,
    cssClass: string,
    variant: 'positive' | 'negative' | 'neutral' | 'warn' | 'danger'
  ): void {
    const card = container.createDiv({ cls: `ft-metric-card ft-metric-${cssClass}` });
    card.createDiv({ cls: 'ft-metric-label', text: label });

    const valueEl = card.createDiv({ cls: 'ft-metric-value' });
    valueEl.addClass(`ft-metric-${variant}`);
    valueEl.setText(this.ctx.fmt(amount));
  }

  private renderCreditBurdenCard(
    container: HTMLElement,
    credits: CreditRecord[],
    records: FinanceRecord[],
    today: string
  ): void {
    const burden = calcCreditBurden(credits, records, today);

    if (burden === null) {
      // No active credits
      const card = container.createDiv({ cls: 'ft-metric-card ft-metric-credit-burden' });
      card.createDiv({ cls: 'ft-metric-label', text: this.ctx.tr.overviewCreditBurden });
      card.createDiv({
        cls: 'ft-metric-empty',
        text: this.ctx.tr.overviewNoBurden
      });
      return;
    }

    const variant = burden >= OVERVIEW_BURDEN_DANGER
      ? 'danger'
      : burden >= OVERVIEW_BURDEN_WARN
      ? 'warn'
      : 'neutral';

    const card = container.createDiv({ cls: 'ft-metric-card ft-metric-credit-burden' });
    card.createDiv({ cls: 'ft-metric-label', text: this.ctx.tr.overviewCreditBurden });

    const valueEl = card.createDiv({ cls: 'ft-metric-value' });
    valueEl.addClass(`ft-metric-${variant}`);
    valueEl.setText(`${(burden * 100).toFixed(1)}%`);

    if (burden === -1) {
      // No income
      const note = card.createDiv({ cls: 'ft-metric-note' });
      note.setText(this.ctx.tr.overviewNoIncome);
    } else if (variant === 'warn') {
      const note = card.createDiv({ cls: 'ft-metric-note' });
      note.setText(this.ctx.tr.overviewBurdenWarn);
    } else if (variant === 'danger') {
      const note = card.createDiv({ cls: 'ft-metric-note' });
      note.setText(this.ctx.tr.overviewBurdenDanger);
    }
  }

  private renderUpcomingPaymentsCard(
    container: HTMLElement,
    credits: CreditRecord[],
    debts: DebtRecord[],
    today: string
  ): void {
    const upcoming = calcUpcomingPayments(credits, debts, today);

    const card = container.createDiv({ cls: 'ft-metric-card ft-metric-upcoming' });
    card.createDiv({ cls: 'ft-metric-label', text: this.ctx.tr.overviewUpcomingPayments });

    if (upcoming === 0) {
      card.createDiv({
        cls: 'ft-metric-empty',
        text: this.ctx.tr.overviewNoPayments
      });
      return;
    }

    const valueEl = card.createDiv({ cls: 'ft-metric-value' });
    valueEl.setText(this.ctx.fmt(upcoming));

    const note = card.createDiv({ cls: 'ft-metric-note' });
    note.setText(this.ctx.tr.overviewNext30Days);
  }
}
