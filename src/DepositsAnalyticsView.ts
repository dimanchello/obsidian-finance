import { fmtDate } from "./utils";
import { ViewContext } from './context';
import { DepositRecord, PERCENT_100 } from './types';
import { Translations } from './i18n';
import { addMonthsClamped, toDateStr } from './domain/dateMath';
import { round2 } from './domain/money';
import { DepositStatus, PaymentStatus } from './constants';

export class DepositsAnalyticsView {
  private el: HTMLElement;
  private deposits: DepositRecord[];
  private currency: string;
  private tr: Translations;
  private ctx: ViewContext;

  constructor(el: HTMLElement, deposits: DepositRecord[], ctx: ViewContext) {
    this.el = el;
    this.deposits = deposits;
    this.currency = ctx.currency;
    this.tr = ctx.tr;
    this.ctx = ctx;
  }

  private get state() { return this.ctx.state; }

  private fmt(n: number): string {
    return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + this.currency;
  }

  render(): void {
    this.el.empty();
    this.el.addClass('finance-analytics');

    this.renderControls();
    this.renderSummaryCards();
    this.renderActiveDepositsList();
  }

  private renderControls(): void {
    const row = this.el.createDiv('finance-filters-row finance-analytics-date-row');

    const fromG = row.createDiv('finance-filter-group');
    fromG.createEl('label', { text: this.tr.from, cls: 'finance-filter-label' });
    const fromI = fromG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    fromI.value = this.state.depositAnalyticsDateFrom ?? '';
    fromI.addEventListener('change', () => {
      this.state.depositAnalyticsDateFrom = fromI.value;
      this.ctx.saveState();
      this.render();
    });

    const toG = row.createDiv('finance-filter-group');
    toG.createEl('label', { text: this.tr.to, cls: 'finance-filter-label' });
    const toI = toG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    toI.value = this.state.depositAnalyticsDateTo ?? '';
    toI.addEventListener('change', () => {
      this.state.depositAnalyticsDateTo = toI.value;
      this.ctx.saveState();
      this.render();
    });
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

    const wrap = this.el.createDiv('finance-credit-analytics-cards');
    const cards: { label: string; value: string; mod?: string }[] = [
      { label: this.tr.depositTotalBalance, value: this.fmt(totalBalance) },
      { label: this.tr.depositTotalAccrued, value: this.fmt(totalAccrued), mod: 'income' },
      { label: this.tr.depositProjectedIncome, value: this.fmt(projectedIncome), mod: 'income' },
      { label: this.tr.depositAvgRate, value: `${avgRate}%`, mod: 'neutral' },
    ];
    cards.forEach(({ label, value, mod }) => {
      const card = wrap.createDiv(`finance-stat-card${mod ? ` finance-stat-${mod}` : ''}`);
      const info = card.createDiv('finance-stat-info');
      info.createEl('div', { text: label, cls: 'finance-stat-label' });
      info.createEl('div', { text: value, cls: 'finance-stat-value' });
    });
  }

  private renderActiveDepositsList(): void {
    const deposits = this.getFilteredDeposits().filter(d => d.status === DepositStatus.ACTIVE);
    if (!deposits.length) return;

    const section = this.el.createDiv('finance-credit-progress-list');
    section.createEl('div', { text: this.tr.depositActiveList, cls: 'finance-analytics-section-title' });

    deposits.forEach(d => {
      const endDate = this.safeEndDate(d);
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
      header.createEl('span', { text: d.name || d.bankName || '—', cls: 'finance-credit-progress-name' });
      header.createEl('span', { text: `${d.interestRate}% · ${this.fmt(d.amount)}`, cls: 'finance-credit-progress-pct' });

      const sub = item.createDiv('finance-credit-progress-sub');
      sub.createEl('span', { text: d.bankName || '—', cls: 'finance-credit-progress-bank' });
      if (endDate) sub.createEl('span', { text: `До ${fmtDate(endDate)}`, cls: 'finance-credit-progress-date' });
      sub.createEl('span', { text: `+${this.fmt(totalProfit)}`, cls: 'finance-credit-progress-amount finance-text-success' });

      const bar = item.createDiv('finance-deposit-progress');
      const fill = bar.createDiv('finance-deposit-progress-fill');
      fill.style.width = `${pct}%`;
    });
  }

  private safeEndDate(d: DepositRecord): string {
    if (!d.startDate) return '';
    try { return addMonthsClamped(d.startDate, d.termMonths || 0); } catch { return ''; }
  }
}
