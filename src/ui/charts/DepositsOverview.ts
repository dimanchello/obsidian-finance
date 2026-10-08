import {
  DepositRecord,
  OVERVIEW_TREND_MONTHS,
  OVERVIEW_CHART_PAD_LEFT,
  OVERVIEW_CHART_PAD_TOP,
  OVERVIEW_LABEL_OFFSET_Y,
  OVERVIEW_MAX_BAR_W,
  OVERVIEW_BAR_SPACING_PAD,
  OVERVIEW_BAR_RADIUS,
  OVERVIEW_LINE_STROKE_W,
  OVERVIEW_POINT_RADIUS,
  OVERVIEW_POINT_RADIUS_HOVER,
  CHART_PALETTE,
  AccountMode,
  PERCENT_100,
} from '../../types';
import { CSS_CLASS, DepositAccrualType, PaymentStatus, DepositStatus } from '../../constants';
import { fmtShort, svg } from '../chartHelpers';
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
} from '../../domain/depositCalculations';
import { DepositDetailModal } from '../../modals/DepositDetailModal';
import { formatChartAmount } from '../../domain/formattingHelpers';
import { BaseChart } from './BaseChart';
import { isDepositOpen, listTabFor } from '../../domain/entityLifecycle';

export class DepositsOverview extends BaseChart {
  private selectedDepositId: string | null = null;
  private containerEl: HTMLElement | null = null;

  private lastParent: HTMLElement | null = null;
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
    this.lastParent = parent;
    this.lastDeposits = deposits;
    this.lastToday = today;
    this.lastOnNavigate = onNavigate;
    this.lastTrendMonths = trendMonths;
    this.lastOnUpdate = onUpdate;

    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }

    if (deposits.length === 0) {
      // Hide section if no deposits exist
      return;
    }

    const { tr, state } = this.ctx;
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
      const selectedColor = depositColorMap.get(selectedDeposit.id) ?? 'var(--color-green)';

      // 2-column split row: 50% compact chart, 50% schedule table & summary
      const splitRow = this.containerEl.createDiv('finance-overview-split-row');
      const leftCol = splitRow.createDiv('finance-overview-split-col finance-overview-chart-col');
      const rightCol = splitRow.createDiv('finance-overview-split-col finance-overview-detail-col');

      const interestData = calcDepositInterestOverTime(
        [selectedDeposit],
        state.overviewDateFrom,
        state.overviewDateTo,
        today,
        trendMonths
      );

      this.renderInterestChart(leftCol, interestData, selectedColor, selectedDeposit, today);
      this.renderDepositDetailPanel(rightCol, selectedDeposit, selectedColor, onNavigate, onUpdate);
    }

    // List of active deposit cards below
    const activeProgress = calcActiveDepositsProgress(deposits, today);
    if (activeProgress.length > 0) {
      const section = this.containerEl.createDiv('finance-deposits-overview-section');
      this.renderActiveDeposits(section, activeProgress, depositColorMap, onNavigate, deposits, onUpdate);
    }
  }

  private rerender(): void {
    if (this.lastParent) {
      this.render(
        this.lastParent,
        this.lastDeposits,
        this.lastToday,
        this.lastOnNavigate,
        this.lastTrendMonths,
        this.lastOnUpdate
      );
    }
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
        label: deposit.name || deposit.bankName || '—',
        color,
      },
      {
        label: tr.overviewDepositCumulativeProfit,
        cssClass: 'is-cumulative',
      },
    ];

    this.renderLegend(chartPanel, legendItems);

    if (interestData.length === 0 || interestData.every(d => d.total === 0)) {
      this.renderNoData(chartPanel, tr.noChartData);
      return;
    }

    const maxMonthlyValue = Math.max(...interestData.map(d => d.total));
    const maxCumulativeValue = Math.max(...interestData.map(d => d.cumulativeTotal)) || 1;

    const containerWidth = parent.clientWidth || 360;
    const dims = this.calculateChartDimensions(containerWidth, interestData.length);

    const spacing = dims.plotWidth / interestData.length;
    const barWidth = Math.min(OVERVIEW_MAX_BAR_W, Math.max(4, spacing - OVERVIEW_BAR_SPACING_PAD));

    const scrollWrap = chartPanel.createDiv('finance-overview-chart-scroll');
    const svg_el = this.createSvg(dims.chartWidth, dims.chartHeight);

    const baselineY = OVERVIEW_CHART_PAD_TOP + dims.plotHeight;

    // Grid lines
    this.renderYAxisGrid(svg_el, dims.plotWidth, dims.plotHeight, maxMonthlyValue, {
      formatLabel: (v: number) => fmtShort(v),
    });

    const cumulativePoints: { x: number; y: number; item: DepositInterestMonth }[] = [];

    interestData.forEach((d: DepositInterestMonth, i: number) => {
      const x = OVERVIEW_CHART_PAD_LEFT + i * spacing + (spacing - barWidth) / 2;
      const cx = x + barWidth / 2;

      let accumulatedHeight = 0;

      d.segments.forEach(seg => {
        if (seg.amount <= 0) return;
        const segHeight = maxMonthlyValue > 0 ? (seg.amount / maxMonthlyValue) * dims.plotHeight : 0;
        const segY = baselineY - accumulatedHeight - segHeight;
        const isPending = seg.status === PaymentStatus.PENDING;

        const rect = svg('rect', {
          x,
          y: segY,
          width: Math.max(1, barWidth),
          height: Math.max(1, segHeight),
          fill: color,
          opacity: isPending ? 0.55 : 1,
          stroke: isPending ? color : 'none',
          'stroke-width': isPending ? 1 : 0,
          'stroke-dasharray': isPending ? '2,2' : '',
          rx: OVERVIEW_BAR_RADIUS,
          class: 'finance-chart-bar-hover',
        });

        const statusLabel = isPending ? tr.overviewDepositPending : tr.overviewDepositAccrued;
        const tipText = `${seg.depositName} (${seg.bankName})\n${statusLabel}: ${formatChartAmount(seg.amount, this.ctx.currency)}\n${d.label}`;
        rect.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        rect.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        rect.addEventListener('mouseleave', () => this.tooltip.hideTip());
        svg_el.appendChild(rect);

        accumulatedHeight += segHeight;
      });

      if (d.cumulativeTotal > 0 && maxCumulativeValue > 0) {
        const cumY = baselineY - Math.min(dims.plotHeight, (d.cumulativeTotal / maxMonthlyValue) * dims.plotHeight);
        cumulativePoints.push({ x: cx, y: cumY, item: d });
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

    // Cumulative line
    if (cumulativePoints.length > 1) {
      const pathD = cumulativePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const cumLine = svg('path', {
        d: pathD,
        stroke: 'var(--color-green)',
        'stroke-width': OVERVIEW_LINE_STROKE_W,
        fill: 'none',
        'stroke-dasharray': '4,4',
      });
      svg_el.appendChild(cumLine);
    }

    // Cumulative points
    cumulativePoints.forEach(p => {
      const point = svg('circle', {
        cx: p.x,
        cy: p.y,
        r: OVERVIEW_POINT_RADIUS,
        fill: 'var(--color-green)',
        class: 'finance-chart-point',
      });
      const tipText = `${p.item.label}\n${tr.overviewDepositCumulativeProfit}: ${formatChartAmount(p.item.cumulativeTotal, this.ctx.currency)}`;
      point.addEventListener('mouseenter', e => {
        point.setAttribute('r', String(OVERVIEW_POINT_RADIUS_HOVER));
        this.tooltip.showTip(e, tipText);
      });
      point.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
      point.addEventListener('mouseleave', () => {
        point.setAttribute('r', String(OVERVIEW_POINT_RADIUS));
        this.tooltip.hideTip();
      });
      svg_el.appendChild(point);
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
      ['#', tr.date, tr.sum, tr.status].forEach((h, i) =>
        trHead.createEl('th', { text: h, cls: i === 0 ? 'finance-overview-col-idx' : '' })
      );
      const tbody = table.createEl('tbody');
      deposit.accruals.forEach((a, idx) => {
        const row = tbody.createEl('tr');
        row.createEl('td', { text: String(idx + 1), cls: 'finance-td finance-td-muted finance-overview-col-idx' });
        row.createEl('td', { text: fmtDate(a.dueDate), cls: `${CSS_CLASS.FINANCE_TD} finance-overview-col-date` });
        row.createEl('td', { text: `+${this.ctx.fmt(a.amount)}`, cls: 'finance-td finance-amount-cell finance-amount-income' });
        const isPaid = a.status === PaymentStatus.PAID;
        const statusTd = row.createEl('td', { cls: `${CSS_CLASS.FINANCE_TD} finance-overview-col-status` });
        statusTd.createSpan({
          text: isPaid ? tr.overviewDepositAccrued : tr.overviewDepositPending,
          cls: isPaid ? 'finance-badge-paid' : 'finance-badge-pending',
        });
      });
    }
  }

  private renderActiveDeposits(
    parent: HTMLElement,
    activeDeposits: ActiveDepositProgress[],
    depositColorMap: Map<string, string>,
    _onNavigate?: (mode: AccountMode) => void,
    _deposits?: DepositRecord[],
    _onUpdate?: () => void
  ): void {
    const { tr } = this.ctx;
    const grid = parent.createDiv('finance-deposits-overview-grid');

    activeDeposits.forEach((dep: ActiveDepositProgress) => {
      const isSelected = dep.id === this.selectedDepositId;
      const card = grid.createDiv(`finance-deposit-overview-card is-clickable${isSelected ? ' is-selected' : ''}`);
      card.title = `${dep.name} (${tr.overviewSelectedDeposit})`;

      card.addEventListener('click', () => {
        this.selectedDepositId = dep.id;
        this.rerender();
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
