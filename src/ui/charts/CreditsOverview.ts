import {
  CreditRecord,
  CHART_PALETTE,
  PERCENT_100,
  AccountMode,
  OVERVIEW_MAX_BAR_W,
  OVERVIEW_BAR_SPACING_PAD,
  OVERVIEW_BAR_RADIUS,
  OVERVIEW_LINE_STROKE_W,
  OVERVIEW_POINT_RADIUS,
  OVERVIEW_POINT_RADIUS_HOVER,
  OVERVIEW_CHART_PAD_LEFT,
  OVERVIEW_CHART_PAD_TOP,
  OVERVIEW_LABEL_OFFSET_Y,
} from '../../types';
import { CSS_CLASS, CreditStatus, PaymentStatus } from '../../constants';
import { MS_PER_DAY } from '../../domain/dateMath';
import {
  calculateRemainingPrincipal,
  calculateTotalInterestPaid,
  calculateCreditEndDate,
  getCreditTypeLabel,
  buildCreditScheduleChartData,
  CreditScheduleChartItem,
} from '../../domain/creditCalculations';
import { sumMoney } from '../../domain/money';
import { fmtDate, getTodayStr } from '../../utils';
import { fmtShort, svg } from '../chartHelpers';
import { CreditDetailModal } from '../../modals/CreditDetailModal';
import { formatChartAmount } from '../../domain/formattingHelpers';
import { BaseChart } from './BaseChart';
import { isCreditOpen, listTabFor } from '../../domain/entityLifecycle';

export class CreditsOverview extends BaseChart {
  private selectedCreditId: string | null = null;
  private containerEl: HTMLElement | null = null;

  private lastParent: HTMLElement | null = null;
  private lastCredits: CreditRecord[] = [];
  private lastToday = '';
  private lastOnNavigate: ((mode: AccountMode) => void) | undefined = undefined;
  private lastOnUpdate: (() => void) | undefined = undefined;

  destroy(): void {
    this.tooltip.destroy();
  }

  render(
    parent: HTMLElement,
    credits: CreditRecord[],
    today: string = getTodayStr(),
    onNavigate?: (mode: AccountMode) => void,
    onUpdate?: () => void
  ): void {
    this.lastParent = parent;
    this.lastCredits = credits;
    this.lastToday = today;
    this.lastOnNavigate = onNavigate;
    this.lastOnUpdate = onUpdate;

    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }

    if (credits.length === 0) {
      // Hide section if no credits exist
      return;
    }

    const { tr } = this.ctx;
    this.containerEl = parent.createDiv('finance-chart-wrap finance-chart-wrap-full');
    this.containerEl.createEl('h3', { text: tr.overviewCreditsSummary, cls: CSS_CLASS.FINANCE_CHART_TITLE });

    const activeCredits = credits.filter(c => c.status === CreditStatus.ACTIVE);
    const availableCredits = activeCredits.length > 0 ? activeCredits : credits;

    if (!this.selectedCreditId || !credits.some(c => c.id === this.selectedCreditId)) {
      this.selectedCreditId = availableCredits[0]?.id ?? null;
    }
    const selectedCredit = credits.find(c => c.id === this.selectedCreditId) ?? availableCredits[0];

    const creditColorMap = new Map<string, string>();
    credits.forEach((c, idx) => {
      const color = CHART_PALETTE[idx % CHART_PALETTE.length] ?? 'var(--color-orange)';
      creditColorMap.set(c.id, color);
    });

    if (selectedCredit) {
      const selectedColor = creditColorMap.get(selectedCredit.id) ?? 'var(--color-orange)';

      // 2-column split row: 50% compact chart, 50% schedule table & summary
      const splitRow = this.containerEl.createDiv('finance-overview-split-row');
      const leftCol = splitRow.createDiv('finance-overview-split-col finance-overview-chart-col');
      const rightCol = splitRow.createDiv('finance-overview-split-col finance-overview-detail-col');

      this.renderCreditPaymentsChart(leftCol, selectedCredit, selectedColor, today);
      this.renderCreditDetailPanel(rightCol, selectedCredit, selectedColor, onNavigate, onUpdate);
    }

    // List of active credit cards below
    if (activeCredits.length > 0) {
      const section = this.containerEl.createDiv('finance-deposits-overview-section');
      this.renderActiveCredits(section, activeCredits, creditColorMap, onNavigate, credits, onUpdate, today);
    }
  }

  private rerender(): void {
    if (this.lastParent) {
      this.render(
        this.lastParent,
        this.lastCredits,
        this.lastToday,
        this.lastOnNavigate,
        this.lastOnUpdate
      );
    }
  }

  private renderCreditPaymentsChart(
    parent: HTMLElement,
    credit: CreditRecord,
    color: string,
    today: string
  ): void {
    const { tr } = this.ctx;

    const chartPanel = parent.createDiv('finance-overview-chart-panel');

    const legendItems: { label: string; color?: string; cssClass?: string }[] = [
      {
        label: tr.creditPrincipal ?? 'Основной долг',
        color: 'var(--color-blue)',
      },
      {
        label: tr.creditInterest ?? 'Проценты',
        color,
      },
      {
        label: tr.overviewCreditRemaining ?? 'Остаток долга',
        cssClass: 'is-cumulative',
      },
    ];

    this.renderLegend(chartPanel, legendItems);

    const items = buildCreditScheduleChartData(credit);

    if (items.length === 0) {
      this.renderNoData(chartPanel, tr.noChartData);
      return;
    }

    const maxPaymentValue = Math.max(...items.map(it => it.total)) || 1;
    const maxDebtValue = credit.originalAmount || 1;

    const containerWidth = parent.clientWidth || 360;
    const dims = this.calculateChartDimensions(containerWidth, items.length);

    const spacing = dims.plotWidth / items.length;
    const barWidth = Math.min(OVERVIEW_MAX_BAR_W, Math.max(4, spacing - OVERVIEW_BAR_SPACING_PAD));

    const scrollWrap = chartPanel.createDiv('finance-overview-chart-scroll');
    const svg_el = this.createSvg(dims.chartWidth, dims.chartHeight);

    const baselineY = OVERVIEW_CHART_PAD_TOP + dims.plotHeight;

    // Grid lines
    this.renderYAxisGrid(svg_el, dims.plotWidth, dims.plotHeight, maxPaymentValue, {
      formatLabel: (v: number) => fmtShort(v),
    });

    const debtPoints: { x: number; y: number; item: CreditScheduleChartItem }[] = [];

    items.forEach((it: CreditScheduleChartItem, i: number) => {
      const x = OVERVIEW_CHART_PAD_LEFT + i * spacing + (spacing - barWidth) / 2;
      const cx = x + barWidth / 2;
      const isPending = it.status === PaymentStatus.PENDING;

      // Principal part (bottom)
      const principalHeight = maxPaymentValue > 0 ? (it.principalPart / maxPaymentValue) * dims.plotHeight : 0;
      const principalY = baselineY - principalHeight;

      if (it.principalPart > 0) {
        const principalBar = svg('rect', {
          x,
          y: principalY,
          width: Math.max(1, barWidth),
          height: Math.max(1, principalHeight),
          fill: 'var(--color-blue)',
          opacity: isPending ? 0.55 : 1,
          stroke: isPending ? 'var(--color-blue)' : 'none',
          'stroke-width': isPending ? 1 : 0,
          'stroke-dasharray': isPending ? '2,2' : '',
          rx: OVERVIEW_BAR_RADIUS,
          class: 'finance-chart-bar-hover',
        });
        const tipText = `${fmtDate(it.dueDate)}\n${tr.creditPrincipal ?? 'Основной долг'}: ${this.fmt(it.principalPart)}\n${tr.creditInterest ?? 'Проценты'}: ${this.fmt(it.interestPart)}\n${tr.total}: ${this.fmt(it.total)}\n${tr.overviewCreditRemaining}: ${this.fmt(it.remainingDebt)}`;
        principalBar.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        principalBar.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        principalBar.addEventListener('mouseleave', () => this.tooltip.hideTip());
        svg_el.appendChild(principalBar);
      }

      // Interest part (stacked on top)
      const interestHeight = maxPaymentValue > 0 ? (it.interestPart / maxPaymentValue) * dims.plotHeight : 0;
      const interestY = principalY - interestHeight;

      if (it.interestPart > 0) {
        const interestBar = svg('rect', {
          x,
          y: interestY,
          width: Math.max(1, barWidth),
          height: Math.max(1, interestHeight),
          fill: color,
          opacity: isPending ? 0.55 : 1,
          stroke: isPending ? color : 'none',
          'stroke-width': isPending ? 1 : 0,
          'stroke-dasharray': isPending ? '2,2' : '',
          rx: OVERVIEW_BAR_RADIUS,
          class: 'finance-chart-bar-hover',
        });
        const tipText = `${fmtDate(it.dueDate)}\n${tr.creditPrincipal ?? 'Основной долг'}: ${this.fmt(it.principalPart)}\n${tr.creditInterest ?? 'Проценты'}: ${this.fmt(it.interestPart)}\n${tr.total}: ${this.fmt(it.total)}\n${tr.overviewCreditRemaining}: ${this.fmt(it.remainingDebt)}`;
        interestBar.addEventListener('mouseenter', e => this.tooltip.showTip(e, tipText));
        interestBar.addEventListener('mousemove', e => this.tooltip.showTip(e, tipText));
        interestBar.addEventListener('mouseleave', () => this.tooltip.hideTip());
        svg_el.appendChild(interestBar);
      }

      // Remaining debt point
      const debtY = baselineY - Math.min(dims.plotHeight, (it.remainingDebt / maxDebtValue) * dims.plotHeight);
      debtPoints.push({ x: cx, y: debtY, item: it });

      // X-axis label with year
      const label = svg('text', {
        x: cx,
        y: baselineY + OVERVIEW_LABEL_OFFSET_Y,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': '11px',
      });
      label.textContent = it.label;
      svg_el.appendChild(label);
    });

    // Remaining debt trend line
    if (debtPoints.length > 1) {
      const pathD = debtPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const debtLine = svg('path', {
        d: pathD,
        stroke: 'var(--text-accent)',
        'stroke-width': OVERVIEW_LINE_STROKE_W,
        fill: 'none',
        'stroke-dasharray': '3,3',
      });
      svg_el.appendChild(debtLine);
    }

    // Remaining debt points
    debtPoints.forEach(p => {
      const point = svg('circle', {
        cx: p.x,
        cy: p.y,
        r: OVERVIEW_POINT_RADIUS,
        fill: 'var(--text-accent)',
        class: 'finance-chart-point',
      });
      const tipText = `${fmtDate(p.item.dueDate)}\n${tr.overviewCreditRemaining}: ${this.fmt(p.item.remainingDebt)}`;
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
    this.scrollToCurrentOrEnd(scrollWrap, containerWidth, items.map(it => it.label), today);
  }

  private renderCreditDetailPanel(
    parent: HTMLElement,
    credit: CreditRecord,
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
    title.textContent = `${credit.name || credit.bankName || tr.credits} (${credit.interestRate}%)`;
    if (credit.bankName) {
      title.title = `${credit.name} · ${credit.bankName}`;
    }

    const typeBadge = header.createDiv('finance-deposit-badge accrual-type');
    typeBadge.textContent = getCreditTypeLabel(credit.type, tr);

    const modalBtn = header.createEl('button', {
      cls: 'finance-action-btn',
      text: '↗️',
    });
    modalBtn.title = tr.overviewViewDetails;
    modalBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      new CreditDetailModal(this.ctx.app, {
        ctx: this.ctx,
        credit,
        onNavigateToCredits: onNavigate ? () => {
          this.ctx.state.creditListTab = listTabFor(isCreditOpen(credit));
          this.ctx.state.creditExpandedId = credit.id;
          this.ctx.state.creditPage = 0;
          this.ctx.saveState();
          onNavigate(AccountMode.CREDITS);
        } : undefined,
        onCreditUpdated: () => onUpdate?.(),
      }).open();
    });

    // Stats grid
    const remaining = calculateRemainingPrincipal(credit);
    const paidInterest = calculateTotalInterestPaid(credit);
    const paidPrincipal = Math.max(0, credit.originalAmount - remaining);
    const totalPaid = paidPrincipal + paidInterest;

    const statsGrid = panel.createDiv('finance-overview-detail-stats');
    const addStatPill = (label: string, val: string, modCls = '') => {
      const pill = statsGrid.createDiv(`finance-overview-detail-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-overview-detail-stat-label' });
      pill.createDiv({ text: val, cls: 'finance-overview-detail-stat-val' });
    };

    addStatPill(tr.overviewInitialAmount, this.ctx.fmt(credit.originalAmount));
    addStatPill(tr.overviewCreditRemaining, this.ctx.fmt(remaining), remaining > 0 ? 'finance-stat-expense' : 'finance-stat-positive');
    addStatPill(tr.overviewCreditPaid, this.ctx.fmt(totalPaid), 'finance-stat-income');
    addStatPill(tr.monthlyPayment, this.ctx.fmt(credit.monthlyPayment), 'finance-stat-neutral');

    // Payments schedule table
    const tableScroll = panel.createDiv('finance-overview-table-scroll');
    if (!credit.payments || credit.payments.length === 0) {
      tableScroll.createEl('p', { text: tr.noScheduledPayments ?? 'Нет платежей', cls: CSS_CLASS.FINANCE_EMPTY_TEXT });
    } else {
      const table = tableScroll.createEl('table', { cls: 'finance-table' });
      const thead = table.createEl('thead');
      const trHead = thead.createEl('tr');
      ['#', tr.date, tr.sum, tr.creditPrincipal ?? 'Осн. долг', tr.creditInterest ?? 'Проценты', tr.status].forEach((h, i) =>
        trHead.createEl('th', { text: h, cls: i === 0 ? 'finance-overview-col-idx' : '' })
      );
      const tbody = table.createEl('tbody');
      const scheduleItems = buildCreditScheduleChartData(credit);
      scheduleItems.forEach((p, idx) => {
        const row = tbody.createEl('tr');
        row.createEl('td', { text: String(idx + 1), cls: 'finance-td finance-td-muted finance-overview-col-idx' });
        row.createEl('td', { text: fmtDate(p.dueDate), cls: `${CSS_CLASS.FINANCE_TD} finance-overview-col-date` });
        row.createEl('td', { text: this.ctx.fmt(p.total), cls: 'finance-td finance-amount-cell' });
        row.createEl('td', { text: this.ctx.fmt(p.principalPart), cls: 'finance-td finance-td-muted' });
        row.createEl('td', { text: this.ctx.fmt(p.interestPart), cls: 'finance-td finance-td-muted' });
        const isPaid = p.status === PaymentStatus.PAID;
        const statusTd = row.createEl('td', { cls: `${CSS_CLASS.FINANCE_TD} finance-overview-col-status` });
        statusTd.createSpan({
          text: isPaid ? tr.overviewCreditPaid : tr.pendingStatus,
          cls: isPaid ? 'finance-badge-paid' : 'finance-badge-pending',
        });
      });
    }
  }

  private renderActiveCredits(
    parent: HTMLElement,
    activeCredits: CreditRecord[],
    creditColorMap: Map<string, string>,
    _onNavigate?: (mode: AccountMode) => void,
    _credits?: CreditRecord[],
    _onUpdate?: () => void,
    today: string = getTodayStr()
  ): void {
    const { tr } = this.ctx;
    const grid = parent.createDiv('finance-deposits-overview-grid');

    activeCredits.forEach(credit => {
      const isSelected = credit.id === this.selectedCreditId;
      const card = grid.createDiv(`finance-deposit-overview-card is-clickable${isSelected ? ' is-selected' : ''}`);
      card.title = `${credit.name} (${tr.overviewSelectedCredit})`;

      card.addEventListener('click', () => {
        this.selectedCreditId = credit.id;
        this.rerender();
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
      val1.createSpan({ text: formatChartAmount(credit.originalAmount, this.ctx.currency) });
      val1.createSpan({ text: ` (${credit.interestRate}%)`, cls: 'finance-deposit-rate-tag' });

      // Col 2: След. платёж
      const col2 = bodyRow.createDiv('finance-deposit-stat-col');
      col2.createDiv({ text: tr.overviewCreditNextPayment, cls: 'finance-deposit-stat-lbl' });
      const val2 = col2.createDiv('finance-deposit-stat-val');
      if (nextPayment) {
        val2.textContent = `${fmtDate(nextPayment.dueDate)} · ${formatChartAmount(nextPayment.amount, this.ctx.currency)}`;
      } else {
        val2.textContent = '—';
      }

      // Col 3: Выплачено
      const col3 = bodyRow.createDiv('finance-deposit-stat-col');
      col3.createDiv({ text: tr.overviewCreditPaid, cls: 'finance-deposit-stat-lbl' });
      const val3 = col3.createDiv('finance-deposit-stat-val success');
      val3.createSpan({ text: formatChartAmount(paidSum, this.ctx.currency) });
      col3.createDiv({
        text: `${paidPayments.length} / ${credit.payments.length} ${tr.overviewCreditPaymentsCount}`,
        cls: 'finance-deposit-stat-sub',
      });

      // Col 4: Остаток долга
      const col4 = bodyRow.createDiv('finance-deposit-stat-col');
      col4.createDiv({ text: tr.overviewCreditRemaining, cls: 'finance-deposit-stat-lbl' });
      const val4 = col4.createDiv('finance-deposit-stat-val bold');
      val4.textContent = formatChartAmount(remaining, this.ctx.currency);

      // Progress bar
      if (credit.originalAmount > 0) {
        const progressWrap = card.createDiv('finance-deposit-progress');
        const fill = progressWrap.createDiv('finance-deposit-progress-fill');
        const paidRatio = Math.min(
          PERCENT_100,
          Math.max(0, ((credit.originalAmount - remaining) / credit.originalAmount) * PERCENT_100)
        );
        fill.style.width = `${paidRatio}%`;
        fill.style.background = creditColor;
      }
    });
  }
}
