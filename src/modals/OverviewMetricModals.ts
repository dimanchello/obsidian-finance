import { App } from 'obsidian';
import { FinanceBaseModal } from '../ui/FinanceBaseModal';
import { ViewContext } from '../context';
import {
  CreditRecord,
  DebtRecord,
  DepositRecord,
  CurrencyExchange,
  FinanceRecord,
  OVERVIEW_UPCOMING_DAYS,
  OVERVIEW_BURDEN_MONTHS,
  OVERVIEW_BURDEN_WARN,
  OVERVIEW_BURDEN_DANGER,
} from '../types';
import {
  DepositStatus,
  CreditStatus,
  DebtDirection,
  PaymentStatus,
  RecordType,
  CSS_CLASS,
} from '../constants';
import {
  calcAssets,
  calcLiabilities,
  calcCreditBurden,
  calcUpcomingPayments,
} from '../domain/metrics';
import { calculateRemainingPrincipal, calculatePaymentBreakdown } from '../domain/creditCalculations';
import { getDepositCurrentAmount } from '../domain/depositCalculations';
import { getDebtAmountAsOf } from '../domain/debtCalculations';
import { fmtDate, fmt } from '../utils';
import { addMonthsClamped, addDays } from '../domain/dateMath';
import { isFutureTransaction } from '../domain/records';
import { getCurrencyBalances } from '../domain/currencyBalance';
import type { Translations } from '../i18n';

function createMetricCell(row: HTMLElement, label: string, text: string, cls: string = CSS_CLASS.FINANCE_TD): HTMLElement {
  const cell = row.createEl('td', { text, cls });
  cell.setAttribute('data-label', label);
  return cell;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Assets Breakdown Modal
// ─────────────────────────────────────────────────────────────────────────────

export class OverviewAssetsModal extends FinanceBaseModal {
  protected tr: Translations;
  private ctx: ViewContext;
  private deposits: DepositRecord[];
  private exchanges: CurrencyExchange[];
  private debts: DebtRecord[];

  constructor(
    app: App,
    ctx: ViewContext,
    deposits: DepositRecord[],
    exchanges: CurrencyExchange[],
    debts: DebtRecord[]
  ) {
    super(app);
    this.ctx = ctx;
    this.tr = ctx.tr;
    this.deposits = deposits;
    this.exchanges = exchanges;
    this.debts = debts;
  }

  override onOpen(): void {
    this.modalEl.addClass('finance-overview-metric-modal');
    this.openHeader(this.tr.overviewAssetsModalTitle);

    this.contentEl.createDiv({
      text: this.tr.overviewAssetsModalDesc,
      cls: 'finance-modal-subtitle',
    });

    const body = this.contentEl.createDiv('finance-overview-modal-body');

    const now = new Date();
    const activeDeposits = this.deposits.filter(
      d => d.status === DepositStatus.ACTIVE && getDepositCurrentAmount(d, now) > 0
    );
    const depositSum = activeDeposits.reduce((s, d) => s + getDepositCurrentAmount(d, now), 0);

    const currencyMap = getCurrencyBalances(this.exchanges, now);
    const positiveCurrencies: {
      currency: string;
      balance: number;
      avgRate: number;
      value: number;
    }[] = [];

    currencyMap.forEach((metrics, currency) => {
      if (metrics.balance > 0) {
        const val = metrics.valueInAccountCurrency > 0
          ? metrics.valueInAccountCurrency
          : metrics.balance * (metrics.averageBuyRate > 0 ? metrics.averageBuyRate : 1);
        positiveCurrencies.push({
          currency,
          balance: metrics.balance,
          avgRate: metrics.averageBuyRate,
          value: val,
        });
      }
    });

    const exchangeSum = positiveCurrencies.reduce((s, c) => s + c.value, 0);

    const lentDebts = this.debts.filter(
      d => d.direction === DebtDirection.LENT && getDebtAmountAsOf(d, now) > 0
    );
    const lentSum = lentDebts.reduce((s, d) => s + getDebtAmountAsOf(d, now), 0);

    const totalAssets = calcAssets(this.deposits, this.exchanges, this.debts, now);

    // Summary cards
    const statBar = body.createDiv('finance-modal-stat-bar');
    const addStatPill = (label: string, valStr: string, modCls: string) => {
      const pill = statBar.createDiv(`finance-modal-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-modal-stat-label' });
      pill.createDiv({ text: valStr, cls: 'finance-modal-stat-val' });
    };

    addStatPill(`🏦 ${this.tr.deposits}`, this.ctx.fmt(depositSum), 'finance-stat-positive');
    addStatPill(`💱 ${this.tr.overviewCurrencyBalances}`, this.ctx.fmt(exchangeSum), 'finance-stat-neutral');
    addStatPill(`🤝 ${this.tr.overviewDebtsLent}`, this.ctx.fmt(lentSum), 'finance-stat-positive');
    addStatPill(`📈 ${this.tr.overviewAssets}`, this.ctx.fmt(totalAssets), 'finance-stat-income');

    // Breakdown list
    const listWrap = body.createDiv('finance-metric-breakdown-list');

    if (activeDeposits.length > 0) {
      listWrap.createEl('h4', { text: `🏦 ${this.tr.deposits} (${activeDeposits.length})`, cls: CSS_CLASS.FINANCE_SECTION_TITLE });
      const table = listWrap.createEl('table', { cls: 'finance-table finance-metric-breakdown-table' });
      activeDeposits.forEach(d => {
        const row = table.createEl('tr');
        createMetricCell(row, this.tr.name, d.name || d.bankName || '—');
        createMetricCell(row, this.tr.interestRate, `${d.interestRate}%`, 'finance-td finance-td-muted');
        createMetricCell(row, this.tr.sum, this.ctx.fmt(getDepositCurrentAmount(d, now)), 'finance-td finance-amount-cell finance-amount-income');
      });
    }

    if (positiveCurrencies.length > 0) {
      listWrap.createEl('h4', { text: `💱 ${this.tr.overviewCurrencyBalances} (${positiveCurrencies.length})`, cls: CSS_CLASS.FINANCE_SECTION_TITLE });
      const table = listWrap.createEl('table', { cls: 'finance-table finance-metric-breakdown-table' });
      positiveCurrencies.forEach(c => {
        const row = table.createEl('tr');
        createMetricCell(row, this.tr.currency, c.currency);
        createMetricCell(row, this.tr.rate, c.avgRate > 0 ? `@ ${c.avgRate.toFixed(2)}` : '—', 'finance-td finance-td-muted');
        createMetricCell(row, this.tr.sum, `${fmt(c.balance, c.currency)} (~${this.ctx.fmt(c.value)})`, 'finance-td finance-amount-cell finance-amount-income');
      });
    }

    if (lentDebts.length > 0) {
      listWrap.createEl('h4', { text: `🤝 ${this.tr.overviewDebtsLent} (${lentDebts.length})`, cls: CSS_CLASS.FINANCE_SECTION_TITLE });
      const table = listWrap.createEl('table', { cls: 'finance-table finance-metric-breakdown-table' });
      lentDebts.forEach(d => {
        const row = table.createEl('tr');
        createMetricCell(row, this.tr.person, d.person || '—');
        createMetricCell(row, this.tr.dueDate, d.dueDate ? fmtDate(d.dueDate) : '—', 'finance-td finance-td-muted');
        createMetricCell(row, this.tr.sum, this.ctx.fmt(getDebtAmountAsOf(d, now)), 'finance-td finance-amount-cell finance-amount-income');
      });
    }

    this.renderFooter();
  }

  private renderFooter(): void {
    const btnsWrap = this.contentEl.createDiv('finance-modal-btns');
    const closeBtn = btnsWrap.createEl('button', { text: this.tr.close, cls: CSS_CLASS.FINANCE_BTN_CANCEL });
    closeBtn.addEventListener('click', () => this.close());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Liabilities Breakdown Modal
// ─────────────────────────────────────────────────────────────────────────────

export class OverviewLiabilitiesModal extends FinanceBaseModal {
  protected tr: Translations;
  private ctx: ViewContext;
  private credits: CreditRecord[];
  private debts: DebtRecord[];

  constructor(app: App, ctx: ViewContext, credits: CreditRecord[], debts: DebtRecord[]) {
    super(app);
    this.ctx = ctx;
    this.tr = ctx.tr;
    this.credits = credits;
    this.debts = debts;
  }

  override onOpen(): void {
    this.modalEl.addClass('finance-overview-metric-modal');
    this.openHeader(this.tr.overviewLiabilitiesModalTitle);

    this.contentEl.createDiv({
      text: this.tr.overviewLiabilitiesModalDesc,
      cls: 'finance-modal-subtitle',
    });

    const body = this.contentEl.createDiv('finance-overview-modal-body');

    const now = new Date();
    const activeCredits = this.credits.filter(c => c.status === CreditStatus.ACTIVE);
    const creditPrincipal = activeCredits.reduce((s, c) => s + calculateRemainingPrincipal(c), 0);

    const borrowedDebts = this.debts.filter(
      d => d.direction === DebtDirection.BORROWED && getDebtAmountAsOf(d, now) > 0
    );
    const borrowedSum = borrowedDebts.reduce((s, d) => s + getDebtAmountAsOf(d, now), 0);

    const totalLiabilities = calcLiabilities(this.credits, this.debts, now);

    // Summary cards
    const statBar = body.createDiv('finance-modal-stat-bar');
    const addStatPill = (label: string, valStr: string, modCls: string) => {
      const pill = statBar.createDiv(`finance-modal-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-modal-stat-label' });
      pill.createDiv({ text: valStr, cls: 'finance-modal-stat-val' });
    };

    addStatPill(`💳 ${this.tr.credits}`, this.ctx.fmt(creditPrincipal), 'finance-stat-expense');
    addStatPill(`🤝 ${this.tr.overviewDebtsBorrowed}`, this.ctx.fmt(borrowedSum), 'finance-stat-expense');
    addStatPill(`📉 ${this.tr.overviewLiabilities}`, this.ctx.fmt(totalLiabilities), 'finance-stat-negative');

    // Breakdown list
    const listWrap = body.createDiv('finance-metric-breakdown-list');

    if (activeCredits.length > 0) {
      listWrap.createEl('h4', { text: `💳 ${this.tr.credits} (${activeCredits.length})`, cls: CSS_CLASS.FINANCE_SECTION_TITLE });
      const table = listWrap.createEl('table', { cls: 'finance-table finance-metric-breakdown-table' });
      activeCredits.forEach(c => {
        const remaining = calculateRemainingPrincipal(c);
        const row = table.createEl('tr');
        createMetricCell(row, this.tr.name, c.name || c.bankName || '—');
        createMetricCell(row, this.tr.interestRate, `${c.interestRate}% · ${this.ctx.fmt(c.monthlyPayment)} ${this.tr.perMonth}`, 'finance-td finance-td-muted');
        createMetricCell(row, this.tr.overviewCreditRemaining, this.ctx.fmt(remaining), 'finance-td finance-amount-cell finance-amount-expense');
      });
    }

    if (borrowedDebts.length > 0) {
      listWrap.createEl('h4', { text: `🤝 ${this.tr.overviewDebtsBorrowed} (${borrowedDebts.length})`, cls: CSS_CLASS.FINANCE_SECTION_TITLE });
      const table = listWrap.createEl('table', { cls: 'finance-table finance-metric-breakdown-table' });
      borrowedDebts.forEach(d => {
        const row = table.createEl('tr');
        createMetricCell(row, this.tr.person, d.person || '—');
        createMetricCell(row, this.tr.dueDate, d.dueDate ? fmtDate(d.dueDate) : '—', 'finance-td finance-td-muted');
        createMetricCell(row, this.tr.sum, this.ctx.fmt(getDebtAmountAsOf(d, now)), 'finance-td finance-amount-cell finance-amount-expense');
      });
    }

    this.renderFooter();
  }

  private renderFooter(): void {
    const btnsWrap = this.contentEl.createDiv('finance-modal-btns');
    const closeBtn = btnsWrap.createEl('button', { text: this.tr.close, cls: CSS_CLASS.FINANCE_BTN_CANCEL });
    closeBtn.addEventListener('click', () => this.close());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Credit Burden Modal
// ─────────────────────────────────────────────────────────────────────────────

export class OverviewBurdenModal extends FinanceBaseModal {
  protected tr: Translations;
  private ctx: ViewContext;
  private credits: CreditRecord[];
  private records: FinanceRecord[];
  private asOfDate: string;
  private targetMonth: string | undefined;

  constructor(
    app: App,
    ctx: ViewContext,
    credits: CreditRecord[],
    records: FinanceRecord[],
    asOfDate: string,
    targetMonth?: string
  ) {
    super(app);
    this.ctx = ctx;
    this.tr = ctx.tr;
    this.credits = credits;
    this.records = records;
    this.asOfDate = asOfDate;
    this.targetMonth = targetMonth;
  }

  override onOpen(): void {
    this.modalEl.addClass('finance-overview-metric-modal');

    if (this.targetMonth) {
      this.renderMonthView();
    } else {
      this.renderOverallView();
    }
  }

  private renderMonthView(): void {
    const month = this.targetMonth ?? '';
    this.openHeader(`${this.tr.overviewBurdenModalTitle} · ${month}`);

    this.contentEl.createDiv({
      text: this.tr.overviewBurdenMonthDesc,
      cls: 'finance-modal-subtitle',
    });

    const body = this.contentEl.createDiv('finance-overview-modal-body');

    const monthStart = `${month}-01`;
    const monthEnd = addMonthsClamped(monthStart, 1);
    const now = new Date();

    const monthIncome = this.records
      .filter(r => r.type === RecordType.INCOME && !r.isInternal && !isFutureTransaction(r, now) && r.date >= monthStart && r.date < monthEnd)
      .reduce((s, r) => s + r.amount, 0);

    let totalPrincipal = 0;
    let totalInterest = 0;
    const creditRows: {
      name: string;
      principal: number;
      interest: number;
      total: number;
      statusText: string;
    }[] = [];

    this.credits.filter(c => c.status === CreditStatus.ACTIVE).forEach(c => {
      const monthPayments = (c.payments ?? []).filter(
        p => (p.dueDate >= monthStart && p.dueDate < monthEnd) ||
             (p.paidDate && p.paidDate >= monthStart && p.paidDate < monthEnd)
      );

      if (monthPayments.length > 0) {
        monthPayments.forEach(p => {
          let pPart = p.principalPart;
          let iPart = p.interestPart;
          if (pPart === undefined || iPart === undefined) {
            const breakdown = calculatePaymentBreakdown(
              c.currentAmount ?? c.originalAmount,
              p.amount,
              c.interestRate
            );
            pPart = breakdown.principalPart;
            iPart = breakdown.interestPart;
          }
          const pVal = pPart ?? 0;
          const iVal = iPart ?? 0;
          totalPrincipal += pVal;
          totalInterest += iVal;
          creditRows.push({
            name: c.name || c.bankName || this.tr.credits,
            principal: pVal,
            interest: iVal,
            total: p.amount,
            statusText: p.status === PaymentStatus.PAID ? this.tr.overviewCreditPaid : this.tr.pendingStatus,
          });
        });
      } else if (c.startDate < monthEnd && c.monthlyPayment > 0) {
        const breakdown = calculatePaymentBreakdown(
          c.currentAmount ?? c.originalAmount,
          c.monthlyPayment,
          c.interestRate
        );
        totalPrincipal += breakdown.principalPart;
        totalInterest += breakdown.interestPart;
        creditRows.push({
          name: c.name || c.bankName || this.tr.credits,
          principal: breakdown.principalPart,
          interest: breakdown.interestPart,
          total: c.monthlyPayment,
          statusText: this.tr.pendingStatus,
        });
      }
    });

    const totalPayments = totalPrincipal + totalInterest;
    const burdenPercent = monthIncome > 0 ? (totalPayments / monthIncome) * 100 : null;

    // Stat bar
    const statBar = body.createDiv('finance-modal-stat-bar');
    const addStatPill = (label: string, valStr: string, modCls: string) => {
      const pill = statBar.createDiv(`finance-modal-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-modal-stat-label' });
      pill.createDiv({ text: valStr, cls: 'finance-modal-stat-val' });
    };

    const burdenValue = burdenPercent !== null ? `${burdenPercent.toFixed(1)}%` : this.tr.noData;
    const burdenMod =
      burdenPercent === null
        ? 'finance-stat-neutral'
        : burdenPercent >= OVERVIEW_BURDEN_DANGER
        ? 'finance-stat-expense'
        : burdenPercent >= OVERVIEW_BURDEN_WARN
        ? 'finance-stat-warning'
        : 'finance-stat-income';

    addStatPill(`⚖️ ${this.tr.overviewCreditBurden}`, burdenValue, burdenMod);
    addStatPill(`💳 ${this.tr.overviewBurdenMonthPayments}`, this.ctx.fmt(totalPayments), 'finance-stat-expense');
    addStatPill(`💵 ${this.tr.overviewBurdenMonthIncome}`, this.ctx.fmt(monthIncome), 'finance-stat-income');
    addStatPill(`🏦 ${this.tr.creditPrincipal}`, this.ctx.fmt(totalPrincipal), 'finance-stat-neutral');
    addStatPill(`📈 ${this.tr.creditInterest ?? 'Проценты'}`, this.ctx.fmt(totalInterest), 'finance-stat-neutral');

    // Credit breakdown table
    const listWrap = body.createDiv('finance-metric-breakdown-list');
    listWrap.createEl('h4', { text: `💳 ${this.tr.credits} (${creditRows.length})`, cls: CSS_CLASS.FINANCE_SECTION_TITLE });

    if (creditRows.length === 0) {
      listWrap.createEl('p', { text: this.tr.overviewBurdenNoPaymentsInMonth, cls: CSS_CLASS.FINANCE_EMPTY_TEXT });
    } else {
      const table = listWrap.createEl('table', { cls: 'finance-table finance-metric-breakdown-table' });
      const thead = table.createEl('thead');
      const trHead = thead.createEl('tr');
      const labels = [this.tr.name, this.tr.creditPrincipal, this.tr.creditInterest, this.tr.sum, this.tr.status];
      labels.forEach(h =>
        trHead.createEl('th', { text: h })
      );
      const tbody = table.createEl('tbody');
      creditRows.forEach(r => {
        const row = tbody.createEl('tr');
        createMetricCell(row, labels[0]!, r.name);
        createMetricCell(row, labels[1]!, this.ctx.fmt(r.principal), 'finance-td finance-td-muted');
        createMetricCell(row, labels[2]!, this.ctx.fmt(r.interest), 'finance-td finance-td-muted');
        createMetricCell(row, labels[3]!, this.ctx.fmt(r.total), 'finance-td finance-amount-cell');
        createMetricCell(row, labels[4]!, r.statusText, 'finance-td finance-td-muted');
      });
    }

    this.renderInfoBox(body);
    this.renderFooter();
  }

  private renderOverallView(): void {
    this.openHeader(this.tr.overviewBurdenModalTitle);

    this.contentEl.createDiv({
      text: this.tr.overviewBurdenModalDesc,
      cls: 'finance-modal-subtitle',
    });

    const body = this.contentEl.createDiv('finance-overview-modal-body');

    const now = new Date();
    const burden = calcCreditBurden(this.credits, this.records, this.asOfDate, now);
    const activeCredits = this.credits.filter(c => c.status === CreditStatus.ACTIVE);
    const monthlyBurden = activeCredits.reduce((s, c) => s + c.monthlyPayment, 0);

    const startDate = addMonthsClamped(this.asOfDate, -OVERVIEW_BURDEN_MONTHS);
    const relevantIncome = this.records.filter(r =>
      r.type === RecordType.INCOME && !r.isInternal && !isFutureTransaction(r, now) && r.date >= startDate && r.date <= this.asOfDate
    );
    const totalIncome = relevantIncome.reduce((s, r) => s + r.amount, 0);
    const avgMonthlyIncome = totalIncome / OVERVIEW_BURDEN_MONTHS;

    // Stat bar
    const statBar = body.createDiv('finance-modal-stat-bar');
    const addStatPill = (label: string, valStr: string, modCls: string) => {
      const pill = statBar.createDiv(`finance-modal-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-modal-stat-label' });
      pill.createDiv({ text: valStr, cls: 'finance-modal-stat-val' });
    };

    const burdenValue = burden !== null ? `${Math.round(burden)}%` : this.tr.noData;
    const burdenMod =
      burden === null
        ? 'finance-stat-neutral'
        : burden >= OVERVIEW_BURDEN_DANGER
        ? 'finance-stat-expense'
        : burden >= OVERVIEW_BURDEN_WARN
        ? 'finance-stat-warning'
        : 'finance-stat-income';

    addStatPill(`⚖️ ${this.tr.overviewCreditBurden}`, burdenValue, burdenMod);
    addStatPill(`💳 ${this.tr.overviewBurdenMonthlyPayments}`, this.ctx.fmt(monthlyBurden), 'finance-stat-expense');
    addStatPill(`💵 ${this.tr.overviewBurdenAvgIncome}`, this.ctx.fmt(avgMonthlyIncome), 'finance-stat-income');
    addStatPill(`💰 ${this.tr.overviewBurdenTotal3MoIncome}`, this.ctx.fmt(totalIncome), 'finance-stat-neutral');

    // List of active credits contributing to monthly payments
    if (activeCredits.length > 0) {
      const listWrap = body.createDiv('finance-metric-breakdown-list');
      listWrap.createEl('h4', { text: `💳 ${this.tr.credits} (${activeCredits.length})`, cls: CSS_CLASS.FINANCE_SECTION_TITLE });
      const table = listWrap.createEl('table', { cls: 'finance-table finance-metric-breakdown-table' });
      const thead = table.createEl('thead');
      const trHead = thead.createEl('tr');
      const labels = [this.tr.name, this.tr.monthlyPayment, this.tr.interestRate, this.tr.overviewCreditRemaining];
      labels.forEach(h =>
        trHead.createEl('th', { text: h })
      );
      const tbody = table.createEl('tbody');
      activeCredits.forEach(c => {
        const remaining = calculateRemainingPrincipal(c);
        const row = tbody.createEl('tr');
        createMetricCell(row, labels[0]!, c.name || c.bankName || this.tr.credits);
        createMetricCell(row, labels[1]!, this.ctx.fmt(c.monthlyPayment), 'finance-td finance-amount-cell finance-amount-expense');
        createMetricCell(row, labels[2]!, `${c.interestRate}%`, 'finance-td finance-td-muted');
        createMetricCell(row, labels[3]!, this.ctx.fmt(remaining), 'finance-td finance-td-muted');
      });
    }

    this.renderInfoBox(body);
    this.renderFooter();
  }

  private renderInfoBox(parent: HTMLElement): void {
    const infoBox = parent.createDiv('finance-metric-info-box');
    infoBox.createEl('p', { text: this.tr.overviewBurdenFormula, cls: 'finance-metric-formula' });

    infoBox.createEl('h4', { text: this.tr.overviewBurdenScale, cls: CSS_CLASS.FINANCE_SECTION_TITLE });
    const scaleList = infoBox.createEl('ul', { cls: 'finance-burden-scale-list' });
    scaleList.createEl('li', { text: `🟢 ${this.tr.overviewBurdenLevelSafe}` });
    scaleList.createEl('li', { text: `🟡 ${this.tr.overviewBurdenLevelWarning}` });
    scaleList.createEl('li', { text: `🔴 ${this.tr.overviewBurdenLevelDanger}` });
  }

  private renderFooter(): void {
    const btnsWrap = this.contentEl.createDiv('finance-modal-btns');
    const closeBtn = btnsWrap.createEl('button', { text: this.tr.close, cls: CSS_CLASS.FINANCE_BTN_CANCEL });
    closeBtn.addEventListener('click', () => this.close());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Upcoming Payments Modal
// ─────────────────────────────────────────────────────────────────────────────

export class OverviewUpcomingPaymentsModal extends FinanceBaseModal {
  protected tr: Translations;
  private ctx: ViewContext;
  private credits: CreditRecord[];
  private debts: DebtRecord[];
  private asOfDate: string;

  constructor(
    app: App,
    ctx: ViewContext,
    credits: CreditRecord[],
    debts: DebtRecord[],
    asOfDate: string
  ) {
    super(app);
    this.ctx = ctx;
    this.tr = ctx.tr;
    this.credits = credits;
    this.debts = debts;
    this.asOfDate = asOfDate;
  }

  override onOpen(): void {
    this.modalEl.addClass('finance-overview-metric-modal');
    this.openHeader(this.tr.overviewUpcomingPaymentsModalTitle);

    const endDate = addDays(this.asOfDate, OVERVIEW_UPCOMING_DAYS);
    const dateRangeStr = `${fmtDate(this.asOfDate)} — ${fmtDate(endDate)}`;

    this.contentEl.createDiv({
      text: `${this.tr.overviewUpcomingPaymentsModalDesc} (${dateRangeStr})`,
      cls: 'finance-modal-subtitle',
    });

    const body = this.contentEl.createDiv('finance-overview-modal-body');

    const now = new Date();
    const totalUpcoming = calcUpcomingPayments(this.credits, this.debts, this.asOfDate, now);

    // Filter upcoming credit payments
    interface UpcomingItem {
      title: string;
      subtitle: string;
      date: string;
      amount: number;
      icon: string;
    }
    const items: UpcomingItem[] = [];

    this.credits
      .filter(c => c.status === CreditStatus.ACTIVE)
      .forEach(c => {
        c.payments
          .filter(p => p.status === PaymentStatus.PENDING && p.dueDate >= this.asOfDate && p.dueDate <= endDate)
          .forEach(p => {
            items.push({
              title: c.name || c.bankName || this.tr.credits,
              subtitle: this.tr.credits,
              date: p.dueDate,
              amount: p.amount,
              icon: '💳',
            });
          });
      });

    // Filter upcoming debts
    this.debts
      .filter(d => d.direction === DebtDirection.BORROWED && d.dueDate >= this.asOfDate && d.dueDate <= endDate && getDebtAmountAsOf(d, now) > 0)
      .forEach(d => {
        items.push({
          title: d.person || this.tr.overviewDebtsBorrowed,
          subtitle: this.tr.overviewDebtsBorrowed,
          date: d.dueDate,
          amount: getDebtAmountAsOf(d, now),
          icon: '🤝',
        });
      });

    // Sort by date
    items.sort((a, b) => a.date.localeCompare(b.date));

    // Summary cards
    const statBar = body.createDiv('finance-modal-stat-bar');
    const addStatPill = (label: string, valStr: string, modCls: string) => {
      const pill = statBar.createDiv(`finance-modal-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-modal-stat-label' });
      pill.createDiv({ text: valStr, cls: 'finance-modal-stat-val' });
    };

    addStatPill(`📅 ${this.tr.overviewUpcomingPayments}`, this.ctx.fmt(totalUpcoming), totalUpcoming > 0 ? 'finance-stat-expense' : 'finance-stat-neutral');
    addStatPill(`🗓️ ${this.tr.overviewUpcomingPeriod}`, `${OVERVIEW_UPCOMING_DAYS} ${this.tr.overviewDaysShort}`, 'finance-stat-neutral');
    addStatPill(`📋 ${this.tr.overviewOperationsCount}`, String(items.length), 'finance-stat-neutral');

    // List of items
    const listWrap = body.createDiv('finance-metric-breakdown-list');

    if (items.length === 0) {
      listWrap.createEl('p', {
        text: this.tr.overviewNoUpcomingPayments,
        cls: CSS_CLASS.FINANCE_EMPTY_TEXT,
      });
    } else {
      const table = listWrap.createEl('table', { cls: 'finance-table finance-metric-breakdown-table' });
      items.forEach(it => {
        const row = table.createEl('tr');
        createMetricCell(row, this.tr.name, `${it.icon} ${it.title}`);
        createMetricCell(row, this.tr.date, fmtDate(it.date), 'finance-td finance-td-muted');
        createMetricCell(row, this.tr.sum, this.ctx.fmt(it.amount), 'finance-td finance-amount-cell finance-amount-expense');
      });
    }

    this.renderFooter();
  }

  private renderFooter(): void {
    const btnsWrap = this.contentEl.createDiv('finance-modal-btns');
    const closeBtn = btnsWrap.createEl('button', { text: this.tr.close, cls: CSS_CLASS.FINANCE_BTN_CANCEL });
    closeBtn.addEventListener('click', () => this.close());
  }
}
