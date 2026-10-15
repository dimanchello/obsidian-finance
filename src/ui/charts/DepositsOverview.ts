import {
  DepositRecord,
  OVERVIEW_TREND_MONTHS,
  OVERVIEW_CHART_PAD_LEFT,
  OVERVIEW_CHART_PAD_TOP,
  OVERVIEW_LABEL_OFFSET_Y,
  OVERVIEW_DEPOSIT_BAR_GAP,
  OVERVIEW_DEPOSIT_BAR_MAX_W,
  OVERVIEW_DEPOSIT_BODY_MIN_HEIGHT_PCT,
  OVERVIEW_DEPOSIT_INTEREST_MIN_HEIGHT,
  OVERVIEW_DEPOSIT_INTEREST_TARGET_WIDTH,
  OVERVIEW_COMPACT_BAR_MIN_W,
  OVERVIEW_BAR_RADIUS,
  CHART_PALETTE,
  AccountMode,
  PERCENT_100,
} from '../../types';
import { CSS_CLASS, DepositAccrualType, PaymentStatus, DepositStatus } from '../../constants';
import { svg } from '../chartHelpers';
import {
  calcDepositInterestOverTime,
  calcActiveDepositsProgress,
  DepositInterestMonth,
  ActiveDepositProgress,
} from '../../domain/metrics';
import { fmtDate, getTodayStr } from '../../utils';
import {
  getDepositInitialAmount,
  getDepositCurrentAmount,
  getDepositAccrued,
  getDepositProfit,
  getDepositTypeLabel,
  getDepositProjectedBalanceBeforeDate,
} from '../../domain/depositCalculations';
import { sumMoney } from '../../domain/money';
import { DepositDetailModal } from '../../modals/DepositDetailModal';
import { formatChartAmount } from '../../domain/formattingHelpers';
import { BaseChart } from './BaseChart';
import { isDepositOpen, listTabFor } from '../../domain/entityLifecycle';

export class DepositsOverview extends BaseChart {
  private selectedDepositId: string | null = null;
  private containerEl: HTMLElement | null = null;
  private selectedChartHostEl: HTMLElement | null = null;
  private selectedDetailHostEl: HTMLElement | null = null;
  private depositCards = new Map<string, HTMLElement>();

  private lastDeposits: DepositRecord[] = [];
  private lastToday = '';
  private lastOnNavigate: ((mode: AccountMode) => void) | undefined = undefined;
  private lastTrendMonths = OVERVIEW_TREND_MONTHS;
  private lastOnUpdate: (() => void) | undefined = undefined;

  destroy(): void {
    this.tooltip.destroy();
  }

  render(
    parent: HTMLElement,
    deposits: DepositRecord[],
    today: string = getTodayStr(),
    onNavigate?: (mode: AccountMode) => void,
    trendMonths: number = OVERVIEW_TREND_MONTHS,
    onUpdate?: () => void
  ): void {
    this.lastDeposits = deposits;
    this.lastToday = today;
    this.lastOnNavigate = onNavigate;
    this.lastTrendMonths = trendMonths;
    this.lastOnUpdate = onUpdate;

    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
    this.selectedChartHostEl = null;
    this.selectedDetailHostEl = null;
    this.depositCards.clear();

    if (deposits.length === 0) {
      // Hide section if no deposits exist
      return;
    }

    const { tr } = this.ctx;
    this.containerEl = parent.createDiv('finance-chart-wrap finance-chart-wrap-full');
    this.containerEl.createEl('h3', { text: tr.overviewDepositsSummary, cls: CSS_CLASS.FINANCE_CHART_TITLE });

    const activeDeposits = deposits.filter(d => d.status === DepositStatus.ACTIVE);
    const availableDeposits = activeDeposits.length > 0 ? activeDeposits : deposits;

    if (!this.selectedDepositId || !deposits.some(d => d.id === this.selectedDepositId)) {
      this.selectedDepositId = availableDeposits[0]?.id ?? null;
    }
    const selectedDeposit = deposits.find(d => d.id === this.selectedDepositId) ?? availableDeposits[0];

    const depositColorMap = new Map<string, string>();
    deposits.forEach((d, idx) => {
      const color = CHART_PALETTE[idx % CHART_PALETTE.length] ?? 'var(--color-green)';
      depositColorMap.set(d.id, color);
    });

    if (selectedDeposit) {
      // 2-column split row: 50% compact chart, 50% schedule table & summary
      const splitRow = this.containerEl.createDiv('finance-overview-split-row');
      this.selectedChartHostEl = splitRow.createDiv('finance-overview-split-col finance-overview-chart-col');
      this.selectedDetailHostEl = splitRow.createDiv('finance-overview-split-col finance-overview-detail-col');
      this.renderSelectedDeposit();
    }

    // List of active deposit cards below
    const activeProgress = calcActiveDepositsProgress(deposits, today);
    if (activeProgress.length > 0) {
      const section = this.containerEl.createDiv('finance-deposits-overview-section');
      this.renderActiveDeposits(section, activeProgress, depositColorMap);
    }
  }

  private renderSelectedDeposit(): void {
    const chartHost = this.selectedChartHostEl;
    const detailHost = this.selectedDetailHostEl;
    const deposit = this.lastDeposits.find(item => item.id === this.selectedDepositId);
    if (!chartHost || !detailHost || !deposit) return;

    chartHost.empty();
    detailHost.empty();
    const depositIndex = this.lastDeposits.findIndex(item => item.id === deposit.id);
    const color = CHART_PALETTE[depositIndex % CHART_PALETTE.length] ?? 'var(--color-green)';
    const interestData = calcDepositInterestOverTime(
      [deposit],
      this.ctx.state.overviewDateFrom,
      this.ctx.state.overviewDateTo,
      this.lastToday,
      this.lastTrendMonths
    );

    this.renderInterestChart(chartHost, interestData, color, deposit, this.lastToday);
    this.renderDepositDetailPanel(
      detailHost,
      deposit,
      color,
      this.lastOnNavigate,
      this.lastOnUpdate
    );
    this.depositCards.forEach((card, id) => {
      const isSelected = id === deposit.id;
      if (isSelected) card.addClass('is-selected');
      else card.removeClass('is-selected');
      card.setAttribute('aria-pressed', String(isSelected));
    });
  }

  private renderInterestChart(
    parent: HTMLElement,
    interestData: DepositInterestMonth[],
    color: string,
    deposit: DepositRecord,
    today: string
  ): void {
    const { tr } = this.ctx;

    const chartPanel = parent.createDiv('finance-overview-chart-panel');

    const legendItems: { label: string; color?: string; cssClass?: string }[] = [
      {
        label: tr.overviewDepositBodyAmount,
        color,
      },
      {
        label: tr.overviewDepositMonthlyInterest,
        color: 'var(--color-green)',
      },
    ];

    this.renderLegend(chartPanel, legendItems);

    if (interestData.length === 0) {
      this.renderNoData(chartPanel, tr.noChartData);
      return;
    }

    const chartPoints = interestData.map(data => {
      const monthStart = `${data.monthKey}-01`;
      const topUpsThisMonth = sumMoney((deposit.topUps ?? [])
        .filter(topUp => topUp.date.slice(0, 7) === data.monthKey)
        .map(topUp => topUp.amount));
      const withdrawalsThisMonth = sumMoney((deposit.withdrawals ?? [])
        .filter(withdrawal => withdrawal.date.slice(0, 7) === data.monthKey)
        .map(withdrawal => withdrawal.amount));
      const balanceBeforeInterest = Math.max(
        0,
        getDepositProjectedBalanceBeforeDate(deposit, monthStart)
          + topUpsThisMonth
          - withdrawalsThisMonth
      );
      return { data, balanceBeforeInterest };
    });

    if (chartPoints.every(point => point.balanceBeforeInterest <= 0 && point.data.total === 0)) {
      this.renderNoData(chartPanel, tr.noChartData);
      return;
    }

    const containerWidth = parent.clientWidth || 360;
    const dims = this.calculateChartDimensions(containerWidth, interestData.length);
    const maxBalance = Math.max(
      1,
      ...chartPoints.map(point => point.balanceBeforeInterest + point.data.total)
    );
    const interestScale = Math.max(0, dims.plotHeight - OVERVIEW_DEPOSIT_INTEREST_MIN_HEIGHT) / maxBalance;
    const chartPointsWithInterestHeight = chartPoints.map(point => ({
      ...point,
      profitHeight: point.data.total > 0
        ? Math.max(OVERVIEW_DEPOSIT_INTEREST_MIN_HEIGHT, point.data.total * interestScale)
        : 0,
    }));
    const maxProfitHeight = Math.max(...chartPointsWithInterestHeight.map(point => point.profitHeight));
    const maxPrincipalHeight = Math.max(0, dims.plotHeight - maxProfitHeight);
    const minPrincipalHeight = maxPrincipalHeight * OVERVIEW_DEPOSIT_BODY_MIN_HEIGHT_PCT / PERCENT_100;
    const minBalance = Math.min(...chartPoints.map(point => point.balanceBeforeInterest));
    const maxPrincipalBalance = Math.max(...chartPoints.map(point => point.balanceBeforeInterest));
    const balanceRange = maxPrincipalBalance - minBalance;

    const spacing = dims.plotWidth / interestData.length;
    const barWidth = Math.min(
      OVERVIEW_DEPOSIT_BAR_MAX_W,
      Math.max(OVERVIEW_COMPACT_BAR_MIN_W, spacing - OVERVIEW_DEPOSIT_BAR_GAP)
    );

    const scrollWrap = chartPanel.createDiv('finance-overview-chart-scroll');
    const svg_el = this.createSvg(dims.chartWidth, dims.chartHeight);

    const baselineY = OVERVIEW_CHART_PAD_TOP + dims.plotHeight;

    chartPointsWithInterestHeight.forEach(({ data: d, balanceBeforeInterest, profitHeight }, i) => {
      const x = OVERVIEW_CHART_PAD_LEFT + i * spacing + (spacing - barWidth) / 2;
      const cx = x + barWidth / 2;
      const balanceProgress = balanceRange > 0
        ? (balanceBeforeInterest - minBalance) / balanceRange
        : 0;
      const principalHeight = minPrincipalHeight
        + balanceProgress * (maxPrincipalHeight - minPrincipalHeight);
      const principalY = baselineY - principalHeight;
      const profitY = principalY - profitHeight;

      const principalBar = svg('rect', {
        x,
        y: principalY,
        width: Math.max(1, barWidth),
        height: Math.max(1, principalHeight),
        fill: color,
        rx: OVERVIEW_BAR_RADIUS,
        class: 'finance-chart-bar-hover',
      });
      const principalTip = `${d.label}\n${tr.overviewDepositBodyAmount}: ${formatChartAmount(balanceBeforeInterest, this.ctx.currency)}`;
      principalBar.addEventListener('mouseenter', e => this.tooltip.showTip(e, principalTip));
      principalBar.addEventListener('mousemove', e => this.tooltip.showTip(e, principalTip));
      principalBar.addEventListener('mouseleave', () => this.tooltip.hideTip());
      svg_el.appendChild(principalBar);

      if (d.total > 0) {
        const profitBar = svg('rect', {
          x,
          y: profitY,
          width: Math.max(1, barWidth),
          height: Math.max(1, profitHeight),
          fill: 'var(--color-green)',
          rx: OVERVIEW_BAR_RADIUS,
          class: 'finance-deposit-interest-bar',
        });
        const profitLines = [
          d.label,
          `${tr.overviewDepositMonthlyInterest}: ${formatChartAmount(d.total, this.ctx.currency)}`,
          `${tr.overviewDepositCumulativeProfit}: ${formatChartAmount(d.cumulativeTotal, this.ctx.currency)}`,
        ];
        if (d.paidInterest > 0) {
          profitLines.push(`${tr.overviewDepositAccrued}: ${formatChartAmount(d.paidInterest, this.ctx.currency)}`);
        }
        if (d.pendingInterest > 0) {
          profitLines.push(`${tr.overviewDepositPending}: ${formatChartAmount(d.pendingInterest, this.ctx.currency)}`);
        }
        const profitTip = profitLines.join('\n');
        svg_el.appendChild(profitBar);

        const interestHitTarget = svg('rect', {
          x: cx - Math.max(barWidth, OVERVIEW_DEPOSIT_INTEREST_TARGET_WIDTH) / 2,
          y: profitY,
          width: Math.max(barWidth, OVERVIEW_DEPOSIT_INTEREST_TARGET_WIDTH),
          height: profitHeight,
          fill: 'transparent',
          class: 'finance-chart-bar-hover',
        });
        interestHitTarget.addEventListener('mouseenter', e => this.tooltip.showTip(e, profitTip));
        interestHitTarget.addEventListener('mousemove', e => this.tooltip.showTip(e, profitTip));
        interestHitTarget.addEventListener('mouseleave', () => this.tooltip.hideTip());
        interestHitTarget.addEventListener('click', e => this.tooltip.showTip(e, profitTip));
        svg_el.appendChild(interestHitTarget);
      }

      // X-axis label includes year
      const label = svg('text', {
        x: cx,
        y: baselineY + OVERVIEW_LABEL_OFFSET_Y,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px',
      });
      label.textContent = d.label;
      svg_el.appendChild(label);
    });

    scrollWrap.appendChild(svg_el);
    this.scrollToCurrentOrEnd(scrollWrap, containerWidth, interestData.map(d => d.label), today);
  }

  private renderDepositDetailPanel(
    parent: HTMLElement,
    deposit: DepositRecord,
    color: string,
    onNavigate?: (mode: AccountMode) => void,
    onUpdate?: () => void
  ): void {
    const { tr } = this.ctx;
    const panel = parent.createDiv('finance-overview-detail-panel');

    // Header
    const header = panel.createDiv('finance-overview-detail-header');
    const titleWrap = header.createDiv('finance-overview-detail-title-wrap');
    const dot = titleWrap.createSpan({ cls: 'finance-deposit-overview-dot' });
    dot.style.background = color;
    const title = titleWrap.createDiv('finance-overview-detail-title');
    title.textContent = `${deposit.name || deposit.bankName || tr.deposits} (${deposit.interestRate}%)`;
    if (deposit.bankName) {
      title.title = `${deposit.name} · ${deposit.bankName}`;
    }

    const badges = header.createDiv('finance-deposit-overview-badges');
    const termBadge = badges.createDiv('finance-deposit-badge remaining');
    termBadge.textContent = getDepositTypeLabel(deposit.type, tr);

    const typeBadge = badges.createDiv('finance-deposit-badge accrual-type');
    typeBadge.textContent =
      deposit.accrualType === DepositAccrualType.CAPITALIZATION
        ? tr.overviewDepositCapitalization
        : tr.overviewDepositToAccount;

    const modalBtn = header.createEl('button', {
      cls: 'finance-action-btn',
      text: '↗️',
    });
    modalBtn.title = tr.overviewViewDetails;
    modalBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      new DepositDetailModal(this.ctx.app, {
        ctx: this.ctx,
        deposit,
        onNavigateToDeposits: onNavigate ? () => {
          this.ctx.state.depositListTab = listTabFor(isDepositOpen(deposit));
          this.ctx.state.depositExpandedId = deposit.id;
          this.ctx.state.depositPage = 0;
          this.ctx.saveState();
          onNavigate(AccountMode.DEPOSITS);
        } : undefined,
        onDepositUpdated: () => onUpdate?.(),
      }).open();
    });

    // Stats grid
    const initialAmount = getDepositInitialAmount(deposit);
    const currentAmount = getDepositCurrentAmount(deposit);
    const accrued = getDepositAccrued(deposit);
    const totalProfit = getDepositProfit(deposit);
    const pendingProfit = Math.max(0, totalProfit - accrued);

    const statsGrid = panel.createDiv('finance-overview-detail-stats');
    const addStatPill = (label: string, val: string, modCls = '') => {
      const pill = statsGrid.createDiv(`finance-overview-detail-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-overview-detail-stat-label' });
      pill.createDiv({ text: val, cls: 'finance-overview-detail-stat-val' });
    };

    addStatPill(tr.overviewInitialAmount, this.ctx.fmt(initialAmount));
    addStatPill(tr.overviewCurrentBalance, this.ctx.fmt(currentAmount), 'finance-stat-positive');
    addStatPill(tr.overviewDepositProfitAccrued, `+${this.ctx.fmt(accrued)}`, 'finance-stat-income');
    addStatPill(tr.overviewDepositProfitPending, `+${this.ctx.fmt(pendingProfit)}`, 'finance-stat-neutral');

    // Accruals table
    const tableScroll = panel.createDiv('finance-overview-table-scroll');
    if (!deposit.accruals || deposit.accruals.length === 0) {
      tableScroll.createEl('p', { text: tr.noScheduledAccruals, cls: CSS_CLASS.FINANCE_EMPTY_TEXT });
    } else {
      const table = tableScroll.createEl('table', { cls: 'finance-table' });
      const thead = table.createEl('thead');
      const trHead = thead.createEl('tr');
      const labels = ['#', tr.date, tr.sum, tr.status];
      labels.forEach((h, i) =>
        trHead.createEl('th', { text: h, cls: i === 0 ? 'finance-overview-col-idx' : '' })
      );
      const tbody = table.createEl('tbody');
      deposit.accruals.forEach((a, idx) => {
        const isPaid = a.status === PaymentStatus.PAID;
        const row = tbody.createEl('tr', {
          cls: isPaid ? 'finance-payment-paid' : 'finance-payment-pending',
        });
        const createCell = (labelIndex: number, text: string, cls: string) => {
          const cell = row.createEl('td', { text, cls });
          cell.setAttribute('data-label', labels[labelIndex]!);
          return cell;
        };
        createCell(0, String(idx + 1), 'finance-td finance-td-muted finance-overview-col-idx');
        createCell(1, fmtDate(a.dueDate), `${CSS_CLASS.FINANCE_TD} finance-overview-col-date`);
        createCell(2, `+${this.ctx.fmt(a.amount)}`, 'finance-td finance-amount-cell finance-amount-income');
        const statusTd = row.createEl('td', { cls: `${CSS_CLASS.FINANCE_TD} finance-overview-col-status` });
        statusTd.setAttribute('data-label', labels[3]!);
        statusTd.createSpan({
          text: isPaid
            ? deposit.accrualType === DepositAccrualType.CAPITALIZATION
              ? tr.accrualIncluded
              : tr.accrualPaidToAccount
            : tr.pendingStatus,
          cls: isPaid ? 'finance-badge-paid' : 'finance-badge-pending',
        });
      });
    }
  }

  private renderActiveDeposits(
    parent: HTMLElement,
    activeDeposits: ActiveDepositProgress[],
    depositColorMap: Map<string, string>
  ): void {
    const { tr } = this.ctx;
    const grid = parent.createDiv('finance-deposits-overview-grid');

    activeDeposits.forEach((dep: ActiveDepositProgress) => {
      const isSelected = dep.id === this.selectedDepositId;
      const card = grid.createDiv(`finance-deposit-overview-card is-clickable${isSelected ? ' is-selected' : ''}`);
      card.title = `${dep.name} (${tr.overviewSelectedDeposit})`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', String(isSelected));
      this.depositCards.set(dep.id, card);

      const selectDeposit = () => {
        if (this.selectedDepositId === dep.id) return;
        this.selectedDepositId = dep.id;
        this.renderSelectedDeposit();
      };
      card.addEventListener('click', selectDeposit);
      card.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectDeposit();
      });

      const depositColor = depositColorMap.get(dep.id) ?? 'var(--color-green)';

      const header = card.createDiv('finance-deposit-overview-header');
      const nameWrap = header.createDiv('finance-deposit-overview-name-wrap');

      const dot = nameWrap.createSpan({ cls: 'finance-deposit-overview-dot' });
      dot.style.background = depositColor;

      const nameEl = nameWrap.createDiv('finance-deposit-overview-name');
      nameEl.textContent = dep.name;
      nameEl.title = dep.name;

      if (dep.bankName && dep.bankName !== '—') {
        const bankEl = nameWrap.createDiv('finance-deposit-overview-bank');
        bankEl.textContent = dep.bankName;
      }

      const badges = header.createDiv('finance-deposit-overview-badges');
      const accrualTypeBadge = badges.createDiv('finance-deposit-badge accrual-type');
      accrualTypeBadge.textContent =
        dep.accrualType === DepositAccrualType.CAPITALIZATION
          ? tr.overviewDepositCapitalization
          : tr.overviewDepositToAccount;

      const remainingBadge = badges.createDiv('finance-deposit-badge remaining');
      if (dep.isDemand) {
        remainingBadge.textContent = tr.overviewDepositDemand;
      } else if (dep.remainingDays !== null) {
        remainingBadge.textContent = `⏳ ${tr.overviewDepositRemainingDays} ${dep.remainingDays} ${tr.overviewDaysShort}`;
      } else {
        remainingBadge.textContent = '—';
      }

      const bodyRow = card.createDiv('finance-deposit-overview-body-row');

      const col1 = bodyRow.createDiv('finance-deposit-stat-col');
      col1.createDiv({ text: tr.overviewDepositBodyAmount, cls: 'finance-deposit-stat-lbl' });
      const val1 = col1.createDiv('finance-deposit-stat-val');
      val1.createSpan({ text: formatChartAmount(dep.amount, this.ctx.currency) });
      val1.createSpan({ text: ` (${dep.interestRate}%)`, cls: 'finance-deposit-rate-tag' });

      const col2 = bodyRow.createDiv('finance-deposit-stat-col');
      col2.createDiv({ text: tr.overviewDepositNextPayout, cls: 'finance-deposit-stat-lbl' });
      const val2 = col2.createDiv('finance-deposit-stat-val success');
      if (dep.nextAccrualDate) {
        val2.textContent = `${fmtDate(dep.nextAccrualDate)} · +${formatChartAmount(dep.nextAccrualAmount ?? 0, this.ctx.currency)}`;
      } else {
        val2.textContent = '—';
      }

      const col3 = bodyRow.createDiv('finance-deposit-stat-col');
      col3.createDiv({ text: tr.overviewDepositTotalProfit, cls: 'finance-deposit-stat-lbl' });
      const val3 = col3.createDiv('finance-deposit-stat-val success');
      val3.createSpan({ text: dep.totalProfit > 0 ? `+${formatChartAmount(dep.totalProfit, this.ctx.currency)}` : '—' });
      if (dep.totalProfit > 0) {
        const sub = col3.createDiv('finance-deposit-stat-sub');
        const accruedPill = sub.createSpan('finance-deposit-sub-pill accrued');
        accruedPill.createSpan({ cls: 'pill-dot', text: '●' });
        accruedPill.createSpan({ cls: 'pill-text', text: `${formatChartAmount(dep.accruedProfit, this.ctx.currency)} ${tr.overviewDepositProfitAccrued}` });

        const pendingPill = sub.createSpan('finance-deposit-sub-pill pending');
        pendingPill.createSpan({ cls: 'pill-dot', text: '○' });
        pendingPill.createSpan({ cls: 'pill-text', text: `${formatChartAmount(dep.pendingProfit, this.ctx.currency)} ${tr.overviewDepositProfitPending}` });
      }

      const col4 = bodyRow.createDiv('finance-deposit-stat-col');
      col4.createDiv({ text: tr.overviewDepositTotalReturn, cls: 'finance-deposit-stat-lbl' });
      const val4 = col4.createDiv('finance-deposit-stat-val bold');
      val4.textContent = formatChartAmount(dep.totalEstimatedReturn, this.ctx.currency);

      if (!dep.isDemand && dep.remainingDays !== null) {
        const progressWrap = card.createDiv('finance-deposit-progress');
        const fill = progressWrap.createDiv('finance-deposit-progress-fill');
        fill.style.width = `${Math.min(PERCENT_100, Math.max(0, dep.progressPercent))}%`;
        fill.style.background = depositColor;
      }
    });
  }
}
