import { ViewContext } from '../../context';
import { CreditRecord, CHART_PALETTE, PERCENT_100 } from '../../types';
import { MS_PER_DAY } from '../../domain/dateMath';
import { createChartTooltip } from '../chartHelpers';
import {
  calculateRemainingPrincipal,
  calculateCreditEndDate,
  getCreditTypeLabel,
} from '../../domain/creditCalculations';
import { sumMoney } from '../../domain/money';
import { fmtDate, getTodayStr } from '../../utils';
import { CreditStatus, PaymentStatus } from '../../constants';
import { CreditDetailModal } from '../../modals/CreditDetailModal';

export class CreditsOverview {
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
    credits: CreditRecord[],
    today: string,
    onNavigate?: (mode: 'credits') => void,
    onUpdate?: () => void
  ): void {
    const { tr } = this.ctx;
    const chartWrap = parent.createDiv('finance-chart-wrap finance-chart-wrap-full');
    chartWrap.createEl('h3', { text: tr.overviewCreditsSummary, cls: 'finance-chart-title' });

    if (credits.length === 0) {
      chartWrap.createEl('p', { text: tr.overviewNoCredits, cls: 'finance-no-data' });
      return;
    }

    const activeCredits = credits.filter(c => c.status === CreditStatus.ACTIVE);
    const section = chartWrap.createDiv('finance-deposits-overview-section');

    if (activeCredits.length === 0) {
      section.createEl('p', { text: tr.overviewNoActiveCredits, cls: 'finance-no-data' });
      return;
    }

    const creditColorMap = new Map<string, string>();
    activeCredits.forEach((c, idx) => {
      const color = CHART_PALETTE[idx % CHART_PALETTE.length] ?? 'var(--color-orange)';
      creditColorMap.set(c.id, color);
    });

    this.renderActiveCredits(section, activeCredits, creditColorMap, onNavigate, credits, onUpdate, today);
  }

  private renderActiveCredits(
    parent: HTMLElement,
    activeCredits: CreditRecord[],
    creditColorMap: Map<string, string>,
    onNavigate?: (mode: 'credits') => void,
    credits?: CreditRecord[],
    onUpdate?: () => void,
    today: string = getTodayStr()
  ): void {
    const { tr } = this.ctx;
    const grid = parent.createDiv('finance-deposits-overview-grid');

    activeCredits.forEach(credit => {
      const card = grid.createDiv('finance-deposit-overview-card is-clickable');
      card.title = `${credit.name} (${tr.overviewViewDetails})`;

      card.addEventListener('click', () => {
        this.tooltip.hideTip();
        const fullCredit = credits?.find(c => c.id === credit.id);
        if (!fullCredit) return;

        const handleNavigate = () => {
          this.ctx.state.creditExpandedId = credit.id;
          this.ctx.state.creditPage = 0;
          this.ctx.saveState();
          onNavigate?.('credits');
        };

        new CreditDetailModal(this.ctx.app, {
          ctx: this.ctx,
          credit: fullCredit,
          onNavigateToCredits: onNavigate ? handleNavigate : undefined,
          onCreditUpdated: () => onUpdate?.(),
        }).open();
      });

      const creditColor = creditColorMap.get(credit.id) ?? 'var(--color-orange)';

      const header = card.createDiv('finance-deposit-overview-header');
      const nameWrap = header.createDiv('finance-deposit-overview-name-wrap');

      const dot = nameWrap.createSpan({ cls: 'finance-deposit-overview-dot' });
      dot.style.background = creditColor;

      const nameEl = nameWrap.createDiv('finance-deposit-overview-name');
      nameEl.textContent = credit.name;
      nameEl.title = credit.name;

      if (credit.bankName && credit.bankName !== '—') {
        const bankEl = nameWrap.createDiv('finance-deposit-overview-bank');
        bankEl.textContent = credit.bankName;
      }

      const badges = header.createDiv('finance-deposit-overview-badges');
      const typeBadge = badges.createDiv('finance-deposit-badge accrual-type');
      typeBadge.textContent = getCreditTypeLabel(credit.type, tr);

      const endDate = calculateCreditEndDate(credit);
      const remainingDays = endDate
        ? Math.ceil((new Date(endDate).getTime() - new Date(today).getTime()) / MS_PER_DAY)
        : null;

      const remainingBadge = badges.createDiv('finance-deposit-badge remaining');
      if (remainingDays !== null && remainingDays > 0) {
        remainingBadge.textContent = `⏳ ${tr.overviewDepositRemainingDays} ${remainingDays} ${tr.overviewDaysShort}`;
      } else if (endDate) {
        remainingBadge.textContent = fmtDate(endDate);
      } else {
        remainingBadge.textContent = '—';
      }

      const remaining = calculateRemainingPrincipal(credit);
      const paidPayments = credit.payments.filter(p => p.status === PaymentStatus.PAID);
      const paidSum = sumMoney(paidPayments.map(p => p.amount));

      const pendingPayments = credit.payments
        .filter(p => p.status === PaymentStatus.PENDING && p.dueDate >= today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const nextPayment = pendingPayments[0] ?? credit.payments.find(p => p.status === PaymentStatus.PENDING);

      const bodyRow = card.createDiv('finance-deposit-overview-body-row');

      // Col 1: Сумма кредита + ставка
      const col1 = bodyRow.createDiv('finance-deposit-stat-col');
      col1.createDiv({ text: tr.overviewInitialAmount, cls: 'finance-deposit-stat-lbl' });
      const val1 = col1.createDiv('finance-deposit-stat-val');
      val1.createSpan({ text: this.fmt(credit.originalAmount) });
      val1.createSpan({ text: ` (${credit.interestRate}%)`, cls: 'finance-deposit-rate-tag' });

      // Col 2: След. платёж
      const col2 = bodyRow.createDiv('finance-deposit-stat-col');
      col2.createDiv({ text: tr.overviewCreditNextPayment, cls: 'finance-deposit-stat-lbl' });
      const val2 = col2.createDiv('finance-deposit-stat-val');
      if (nextPayment) {
        val2.textContent = `${fmtDate(nextPayment.dueDate)} · ${this.fmt(nextPayment.amount)}`;
      } else {
        val2.textContent = '—';
      }

      // Col 3: Выплачено
      const col3 = bodyRow.createDiv('finance-deposit-stat-col');
      col3.createDiv({ text: tr.overviewCreditPaid, cls: 'finance-deposit-stat-lbl' });
      const val3 = col3.createDiv('finance-deposit-stat-val success');
      val3.createSpan({ text: this.fmt(paidSum) });
      col3.createDiv({
        text: `${paidPayments.length} / ${credit.payments.length} ${tr.overviewCreditPaymentsCount}`,
        cls: 'finance-deposit-stat-sub',
      });

      // Col 4: Остаток долга
      const col4 = bodyRow.createDiv('finance-deposit-stat-col');
      col4.createDiv({ text: tr.overviewCreditRemaining, cls: 'finance-deposit-stat-lbl' });
      const val4 = col4.createDiv('finance-deposit-stat-val bold');
      val4.textContent = this.fmt(remaining);

      // Progress bar
      const progressWrap = card.createDiv('finance-deposit-progress');
      const fill = progressWrap.createDiv('finance-deposit-progress-fill');
      const paidRatio = credit.originalAmount > 0
        ? Math.min(PERCENT_100, Math.max(0, ((credit.originalAmount - remaining) / credit.originalAmount) * PERCENT_100))
        : 0;
      fill.style.width = `${paidRatio}%`;
      fill.style.background = creditColor;
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
