# Overview Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new «Обзор» (Overview) tab showing 5 cross-cutting KPI cards and 3 trend charts that integrate data from all tabs.

**Architecture:** Pure KPI calculations live in `src/domain/overviewMetrics.ts`; rendering in `src/tabs/OverviewTab.ts`. Shared SVG helpers extracted to `src/ui/chartHelpers.ts` to eliminate duplication across all analytics files. `AccountView.ts` gains a new `'overview'` mode with a visual separator before the dropdown item.

**Tech Stack:** TypeScript, Obsidian plugin API, hand-rolled SVG, Vitest

## Global Constraints

- All UI strings via `ctx.tr` — never hardcoded. New keys added to `Translations` interface + both `ru` and `en` objects in `src/i18n.ts`.
- No magic numbers: numeric literals other than 0/1/-1/2 go into `src/types.ts` as `UPPER_SNAKE_CASE` constants.
- Mobile support mandatory: `ctx.isMobile` check, card grids reflow on small screens.
- Dates are `YYYY-MM-DD` strings. Use `getTodayStr()` from `src/utils.ts` and `parseDateStr()` / `toDateStr()` from `src/domain/dateMath.ts`.
- ESLint `strict-type-checked`: no `any`, use `prefer-nullish-coalescing`, `prefer-optional-chain`.
- Verification loop after every task: `npm run lint && npm run build && npm test` must pass.
- Tests cover domain logic only — not DOM rendering.

---

## File Map

| Status | File | Role |
|---|---|---|
| Create | `src/ui/chartHelpers.ts` | `svg()`, `fmtShort()`, `shortMonth()`, `createChartTooltip()` |
| Create | `src/domain/overviewMetrics.ts` | Pure KPI calculation functions |
| Create | `src/__tests__/overviewMetrics.test.ts` | Tests for all 5 KPI functions |
| Create | `src/tabs/OverviewTab.ts` | Period filter + KPI cards + 3 charts |
| Modify | `src/AnalyticsView.ts` | Import helpers from `chartHelpers.ts` |
| Modify | `src/CreditsAnalyticsView.ts` | Import helpers from `chartHelpers.ts` |
| Modify | `src/types.ts` | `ViewState` fields + 4 new constants |
| Modify | `src/i18n.ts` | 11 new translation keys |
| Modify | `src/AccountView.ts` | `'overview'` mode, separator, wiring |
| Modify | `styles.css` | `.finance-dropdown-separator`, `.finance-stat-warning` |

---

## Task 1: Extract shared chart helpers into `src/ui/chartHelpers.ts`

**Files:**
- Create: `src/ui/chartHelpers.ts`
- Modify: `src/AnalyticsView.ts` (remove local `svg`, `fmtShort`, `shortMonth`, `createChartTooltip`; add import)
- Modify: `src/CreditsAnalyticsView.ts` (same)

**Interfaces:**
- Produces: `svg<K>()`, `fmtShort()`, `shortMonth()`, `createChartTooltip()`

- [ ] **Step 1: Create `src/ui/chartHelpers.ts`**

```typescript
const TOOLTIP_CURSOR_GAP = 12;
const TOOLTIP_EDGE_GAP = 8;

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function fmtShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(Math.round(n));
}

export function shortMonth(m: number, locale: string): string {
  const d = new Date(2024, m, 1);
  const s = d.toLocaleString(locale, { month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function createChartTooltip(): {
  showTip: (e: MouseEvent, text: string) => void;
  hideTip: () => void;
} {
  const tooltip = document.createElement('div');
  tooltip.className = 'finance-bar-tooltip';
  document.body.appendChild(tooltip);
  return {
    showTip: (e: MouseEvent, text: string) => {
      tooltip.textContent = text;
      tooltip.classList.add('is-visible');
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      let left = e.clientX - tw / 2;
      let top = e.clientY - th - TOOLTIP_CURSOR_GAP;
      if (left < TOOLTIP_EDGE_GAP) left = TOOLTIP_EDGE_GAP;
      if (left + tw > window.innerWidth - TOOLTIP_EDGE_GAP)
        left = window.innerWidth - tw - TOOLTIP_EDGE_GAP;
      if (top < 4) top = e.clientY + 12;
      tooltip.style.setProperty('--ft-tip-left', `${left}px`);
      tooltip.style.setProperty('--ft-tip-top', `${top}px`);
    },
    hideTip: () => { tooltip.classList.remove('is-visible'); },
  };
}
```

- [ ] **Step 2: Update `src/AnalyticsView.ts`**

Delete the module-level functions `shortMonth` (~lines 23–27), `svg` (~30–36), `fmtShort` (~38–42), `createChartTooltip` (~51–75). Add to the top import block:

```typescript
import { svg, fmtShort, shortMonth, createChartTooltip } from './ui/chartHelpers';
```

- [ ] **Step 3: Update `src/CreditsAnalyticsView.ts`**

Delete `createChartTooltip` (~lines 24–48), `svg` (~50–56), `fmtShort` (~58–62), `shortMonth` (~64–68). Add import:

```typescript
import { svg, fmtShort, shortMonth, createChartTooltip } from './ui/chartHelpers';
```

- [ ] **Step 4: Verify and commit**

```bash
npm run lint && npm run build && npm test
git add src/ui/chartHelpers.ts src/AnalyticsView.ts src/CreditsAnalyticsView.ts
git commit -m "refactor: extract shared SVG chart helpers into ui/chartHelpers.ts"
```

---

## Task 2: Domain metrics + tests

**Files:**
- Create: `src/domain/overviewMetrics.ts`
- Create: `src/__tests__/overviewMetrics.test.ts`
- Modify: `src/types.ts` (4 new constants)

**Interfaces:**
- Produces: `calcNetBalance(records)`, `calcAssets(deposits, exchanges, debts)`, `calcLiabilities(credits, debts)`, `calcCreditBurden(credits, records, today)`, `calcUpcomingPayments(credits, debts, today)`

- [ ] **Step 1: Add constants to `src/types.ts`** (after `PERCENT_100 = 100`)

```typescript
export const OVERVIEW_UPCOMING_DAYS = 30;
export const OVERVIEW_BURDEN_MONTHS = 3;
export const OVERVIEW_BURDEN_WARN   = 30;
export const OVERVIEW_BURDEN_DANGER = 50;
```

- [ ] **Step 2: Write the failing tests** (`src/__tests__/overviewMetrics.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import type { FinanceRecord, DebtRecord, CreditRecord, DepositRecord, CurrencyExchange } from '../types';
import {
  calcNetBalance, calcAssets, calcLiabilities,
  calcCreditBurden, calcUpcomingPayments,
} from '../domain/overviewMetrics';

function rec(overrides: Partial<FinanceRecord> = {}): FinanceRecord {
  return { id: 'r1', createdAt: 0, date: '2026-01-15', time: '',
    type: 'income', amount: 1000, category: '', tag: '', payer: '',
    note: '', attachmentPath: '', ...overrides };
}
function debt(overrides: Partial<DebtRecord> = {}): DebtRecord {
  return { id: 'd1', person: 'А', amount: 1000, originalAmount: 1000,
    interestRate: 0, direction: 'lent', date: '2026-01-01', time: '',
    dueDate: '2027-01-01', createdAt: 0, note: '',
    movements: [{ id: 'm1', type: 'borrow', amount: 1000,
      date: '2026-01-01', time: '', createdAt: 0, note: '' }],
    ...overrides };
}
function credit(overrides: Partial<CreditRecord> = {}): CreditRecord {
  return { id: 'c1', name: '', type: 'consumer', bankName: '', originalAmount: 100000,
    currentAmount: 100000, interestRate: 10, monthlyPayment: 5000, termMonths: 24,
    startDate: '2025-01-01', createdAt: 0, note: '', status: 'active',
    earlyRepaymentOption: null, payments: [], ...overrides };
}
function deposit(overrides: Partial<DepositRecord> = {}): DepositRecord {
  return { id: 'dep1', name: '', type: 'term', bankName: '', amount: 50000,
    interestRate: 8, startDate: '2026-01-01', termMonths: 12, accrualType: 'to_account',
    createdAt: 0, note: '', status: 'active', accruals: [], topUps: [], withdrawals: [],
    ...overrides };
}
function exchange(overrides: Partial<CurrencyExchange> = {}): CurrencyExchange {
  return { id: 'e1', createdAt: 0, date: '2026-01-01', time: '',
    type: 'buy', amountInAccountCurrency: 9500, targetCurrency: 'USD',
    targetAmount: 100, exchangeRate: 95, provider: '', note: '', ...overrides };
}

describe('calcNetBalance', () => {
  it('доход минус расход', () => {
    expect(calcNetBalance([rec({ type: 'income', amount: 1000 }), rec({ type: 'expense', amount: 400 })])).toBe(600);
  });
  it('isInternal игнорируется', () => {
    expect(calcNetBalance([rec({ amount: 1000 }), rec({ type: 'expense', amount: 200, isInternal: true })])).toBe(1000);
  });
  it('пустой массив → 0', () => { expect(calcNetBalance([])).toBe(0); });
});

describe('calcAssets', () => {
  it('сумма депозита + валюта + одолженный долг', () => {
    const result = calcAssets(
      [deposit({ amount: 50000 })],
      [exchange({ targetAmount: 100, exchangeRate: 95, type: 'buy' })],
      [debt({ direction: 'lent' })],
    );
    expect(result).toBe(50000 + 100 * 95 + 1000);
  });
  it('закрытый депозит не считается', () => {
    expect(calcAssets([deposit({ status: 'closed' })], [], [])).toBe(0);
  });
  it('долг borrowed не входит в активы', () => {
    expect(calcAssets([], [], [debt({ direction: 'borrowed' })])).toBe(0);
  });
});

describe('calcLiabilities', () => {
  it('остаток по кредиту + взятый долг', () => {
    const c = credit({ payments: [] }); // все 100000 остаток
    const d = debt({ direction: 'borrowed' });
    expect(calcLiabilities([c], [d])).toBe(100000 + 1000);
  });
  it('погашенный кредит не считается', () => {
    expect(calcLiabilities([credit({ status: 'paid' })], [])).toBe(0);
  });
});

describe('calcCreditBurden', () => {
  it('нет дохода → null', () => {
    expect(calcCreditBurden([credit({ monthlyPayment: 5000 })], [], '2026-08-21')).toBeNull();
  });
  it('нагрузка = платёж / средний доход * 100', () => {
    const incomeRecords = [
      rec({ date: '2026-05-10', amount: 10000 }),
      rec({ date: '2026-06-10', amount: 10000 }),
      rec({ date: '2026-07-10', amount: 10000 }),
    ];
    // monthlyBurden=5000, avgIncome=10000 → 50%
    expect(calcCreditBurden([credit({ monthlyPayment: 5000 })], incomeRecords, '2026-08-21')).toBe(50);
  });
});

describe('calcUpcomingPayments', () => {
  it('платёж кредита в пределах 30 дней', () => {
    const c = credit({ payments: [{ id: 'p1', amount: 5000, dueDate: '2026-09-01',
      status: 'pending' }] });
    expect(calcUpcomingPayments([c], [], '2026-08-21')).toBe(5000);
  });
  it('просроченный платёж (в прошлом) не включается', () => {
    const c = credit({ payments: [{ id: 'p1', amount: 5000, dueDate: '2026-07-01',
      status: 'pending' }] });
    expect(calcUpcomingPayments([c], [], '2026-08-21')).toBe(0);
  });
  it('долг с dueDate в диапазоне', () => {
    const d = debt({ direction: 'borrowed', dueDate: '2026-09-01' });
    expect(calcUpcomingPayments([], [d], '2026-08-21')).toBe(1000);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL** (module not found)

```bash
npx vitest run src/__tests__/overviewMetrics.test.ts
```
Expected: `Cannot find module '../domain/overviewMetrics'`

- [ ] **Step 4: Create `src/domain/overviewMetrics.ts`**

```typescript
import {
  FinanceRecord, DebtRecord, CreditRecord, DepositRecord, CurrencyExchange,
  PERCENT_100, OVERVIEW_UPCOMING_DAYS, OVERVIEW_BURDEN_MONTHS,
} from '../types';
import { getDebtRemaining } from './debtCalculations';
import { calculateRemainingPrincipal } from './creditCalculations';
import { getCurrencyBalances } from './currencyBalance';
import { parseDateStr } from './dateMath';
import { round2, sumMoney } from './money';

function addDaysToDateStr(dateStr: string, days: number): string {
  const p = parseDateStr(dateStr);
  if (!p) return dateStr;
  const ms = Date.UTC(p.year, p.month - 1, p.day + days);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function calcNetBalance(records: FinanceRecord[]): number {
  let sum = 0;
  for (const r of records) {
    if (r.isInternal === true) continue;
    if (r.type === 'income') sum += r.amount;
    else sum -= r.amount;
  }
  return round2(sum);
}

export function calcAssets(
  deposits: DepositRecord[],
  exchanges: CurrencyExchange[],
  debts: DebtRecord[],
): number {
  const depositTotal = sumMoney(deposits.filter(d => d.status === 'active').map(d => d.amount));
  const balances = getCurrencyBalances(exchanges);
  let currencyTotal = 0;
  balances.forEach(metrics => {
    if (metrics.balance > 0) currencyTotal += metrics.balance * metrics.averageBuyRate;
  });
  const lentTotal = sumMoney(
    debts.filter(d => d.direction === 'lent').map(d => getDebtRemaining(d)),
  );
  return round2(depositTotal + currencyTotal + lentTotal);
}

export function calcLiabilities(credits: CreditRecord[], debts: DebtRecord[]): number {
  const creditTotal = sumMoney(
    credits.filter(c => c.status === 'active').map(c => calculateRemainingPrincipal(c)),
  );
  const debtTotal = sumMoney(
    debts.filter(d => d.direction === 'borrowed').map(d => getDebtRemaining(d)),
  );
  return round2(creditTotal + debtTotal);
}

export function calcCreditBurden(
  credits: CreditRecord[],
  records: FinanceRecord[],
  today: string,
): number | null {
  const monthlyBurden = sumMoney(
    credits.filter(c => c.status === 'active').map(c => c.monthlyPayment),
  );
  const todayParsed = parseDateStr(today);
  if (!todayParsed) return null;
  const monthKeys: string[] = [];
  for (let i = 1; i <= OVERVIEW_BURDEN_MONTHS; i++) {
    const totalM = todayParsed.year * 12 + (todayParsed.month - 1) - i;
    const y = Math.floor(totalM / 12);
    const m = totalM - y * 12 + 1;
    monthKeys.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
  }
  let totalIncome = 0;
  for (const r of records) {
    if (r.isInternal === true || r.type !== 'income') continue;
    if (monthKeys.includes(r.date.slice(0, 7))) totalIncome += r.amount;
  }
  const avg = round2(totalIncome / OVERVIEW_BURDEN_MONTHS);
  if (avg <= 0) return null;
  return round2((monthlyBurden / avg) * PERCENT_100);
}

export function calcUpcomingPayments(
  credits: CreditRecord[],
  debts: DebtRecord[],
  today: string,
): number {
  const deadline = addDaysToDateStr(today, OVERVIEW_UPCOMING_DAYS);
  let sum = 0;
  for (const c of credits) {
    for (const p of c.payments) {
      if (p.status === 'pending' && p.dueDate >= today && p.dueDate <= deadline)
        sum += p.amount;
    }
  }
  for (const d of debts) {
    if (!d.dueDate || d.dueDate < today || d.dueDate > deadline) continue;
    const remaining = getDebtRemaining(d);
    if (remaining > 0) sum += remaining;
  }
  return round2(sum);
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run src/__tests__/overviewMetrics.test.ts
```
Expected: all 10 tests pass.

- [ ] **Step 6: Full verification and commit**

```bash
npm run lint && npm run build && npm test
git add src/types.ts src/domain/overviewMetrics.ts src/__tests__/overviewMetrics.test.ts
git commit -m "feat: add overviewMetrics domain functions with tests"
```

---

## Task 3: i18n keys + ViewState fields

**Files:**
- Modify: `src/i18n.ts`
- Modify: `src/types.ts` (ViewState)

- [ ] **Step 1: Add to `ViewState` interface in `src/types.ts`** (after `depositAnalyticsDateTo?`)

```typescript
overviewDateFrom?: string;
overviewDateTo?: string;
```

- [ ] **Step 2: Add to `Translations` interface in `src/i18n.ts`** (before the closing `}` of interface)

```typescript
overviewTab: string;
overviewNetBalance: string;
overviewAssets: string;
overviewLiabilities: string;
overviewCreditBurden: string;
overviewBurdenOfIncome: string;
overviewUpcomingPayments: string;
overviewNext30Days: string;
overviewCashFlow: string;
overviewCumulativeBalance: string;
overviewDebtService: string;
```

- [ ] **Step 3: Add Russian translations to `ru` object in `src/i18n.ts`** (before the closing `}` of `ru`)

```typescript
overviewTab: '📊 Обзор',
overviewNetBalance: 'Чистый баланс',
overviewAssets: 'Активы',
overviewLiabilities: 'Обязательства',
overviewCreditBurden: 'Кредитная нагрузка',
overviewBurdenOfIncome: 'от дохода',
overviewUpcomingPayments: 'Ближайшие платежи',
overviewNext30Days: 'за следующие 30 дней',
overviewCashFlow: 'Денежный поток',
overviewCumulativeBalance: 'Накопленный баланс',
overviewDebtService: 'Обслуживание долга',
```

- [ ] **Step 4: Add English translations to `en` object in `src/i18n.ts`** (before the closing `}` of `en`)

```typescript
overviewTab: '📊 Overview',
overviewNetBalance: 'Net Balance',
overviewAssets: 'Assets',
overviewLiabilities: 'Liabilities',
overviewCreditBurden: 'Credit Burden',
overviewBurdenOfIncome: 'of income',
overviewUpcomingPayments: 'Upcoming Payments',
overviewNext30Days: 'next 30 days',
overviewCashFlow: 'Cash Flow',
overviewCumulativeBalance: 'Cumulative Balance',
overviewDebtService: 'Debt Service',
```

- [ ] **Step 5: Add CSS** — in `styles.css`, find `.finance-dropdown-item` block and add after it:

```css
.finance-dropdown-separator {
  height: 1px;
  background: var(--ft-border);
  margin: 4px 8px;
}
.finance-stat-warning .finance-stat-value { color: #f59e0b; }
```

- [ ] **Step 6: Verify and commit**

```bash
npm run lint && npm run build && npm test
git add src/types.ts src/i18n.ts styles.css
git commit -m "feat: add i18n keys, ViewState fields, and CSS for overview tab"
```

---

## Task 4: `OverviewTab.ts` — skeleton, period filter, KPI cards

**Files:**
- Create: `src/tabs/OverviewTab.ts`

**Interfaces:**
- Consumes: `ViewContext` from `../context`; `calcNetBalance`, `calcAssets`, `calcLiabilities`, `calcCreditBurden`, `calcUpcomingPayments` from `../domain/overviewMetrics`; constants `OVERVIEW_BURDEN_WARN`, `OVERVIEW_BURDEN_DANGER` from `../types`
- Produces: `class OverviewTab { constructor(ctx, el); render(): void }`

- [ ] **Step 1: Create `src/tabs/OverviewTab.ts`** with the full class:

```typescript
import { ViewContext } from '../context';
import {
  OVERVIEW_BURDEN_WARN, OVERVIEW_BURDEN_DANGER,
} from '../types';
import { getTodayStr } from '../utils';
import { addMonthsClamped } from '../domain/dateMath';
import {
  calcNetBalance, calcAssets, calcLiabilities,
  calcCreditBurden, calcUpcomingPayments,
} from '../domain/overviewMetrics';
import {
  svg, fmtShort, shortMonth, createChartTooltip,
} from '../ui/chartHelpers';
import {
  CHART_SVG_HEIGHT_COMPACT, CHART_SVG_PAD_LEFT, CHART_SVG_PAD_RIGHT,
  CHART_SVG_PAD_TOP, CHART_SVG_PAD_BOTTOM_COMPACT, CHART_GRID_DIVISIONS_COMPACT,
  CHART_MIN_GROUP_MOBILE, CHART_MIN_GROUP_DESKTOP,
  CHART_MAX_BAR_W_MOBILE, CHART_MAX_BAR_W_SMALL, CHART_MAX_BAR_W_MED, CHART_MAX_BAR_W_LARGE,
  CHART_BAR_RATIO_MOBILE, CHART_BAR_RATIO_DESKTOP, CHART_BAR_RADIUS,
  CHART_COLOR_INCOME, CHART_COLOR_EXPENSE, CHART_COLOR_PRINCIPAL,
} from '../types';

export class OverviewTab {
  private ctx: ViewContext;
  private el: HTMLElement;

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.el = el;
  }

  private get tr() { return this.ctx.tr; }
  private get data() { return this.ctx.data; }
  private get state() { return this.ctx.state; }

  private get locale(): string {
    return this.tr.income === '↑ Доход' ? 'ru' : 'en';
  }

  private defaultDateFrom(): string {
    return addMonthsClamped(getTodayStr(), -12);
  }

  render(): void {
    this.el.empty();
    this.el.addClass('finance-analytics');
    this.renderPeriodFilter();
    this.renderKpiCards();
    this.renderCashFlowChart();
    this.renderCumulativeChart();
    this.renderDebtServiceChart();
  }

  private renderPeriodFilter(): void {
    const row = this.el.createDiv('finance-filters-row finance-analytics-date-row');

    const fromG = row.createDiv('finance-filter-group');
    fromG.createEl('label', { text: this.tr.from, cls: 'finance-filter-label' });
    const fromI = fromG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    fromI.value = this.state.overviewDateFrom ?? '';
    fromI.addEventListener('change', () => {
      this.state.overviewDateFrom = fromI.value || undefined;
      this.ctx.saveState();
      this.render();
    });

    const toG = row.createDiv('finance-filter-group');
    toG.createEl('label', { text: this.tr.to, cls: 'finance-filter-label' });
    const toI = toG.createEl('input', { type: 'date', cls: 'finance-filter-input' });
    toI.value = this.state.overviewDateTo ?? '';
    toI.addEventListener('change', () => {
      this.state.overviewDateTo = toI.value || undefined;
      this.ctx.saveState();
      this.render();
    });
  }

  private renderKpiCards(): void {
    if (!this.data) return;
    const { records, debts, credits, deposits, exchanges } = this.data;

    const netBalance = calcNetBalance(records);
    const assets     = calcAssets(deposits, exchanges, debts);
    const liabilities = calcLiabilities(credits, debts);
    const burden     = calcCreditBurden(credits, records, getTodayStr());
    const upcoming   = calcUpcomingPayments(credits, debts, getTodayStr());

    const wrap = this.el.createDiv('finance-credit-analytics-cards');

    // 1. Net balance
    const netMod = netBalance >= 0 ? 'income' : 'expense';
    this.renderKpiCard(wrap, this.tr.overviewNetBalance, this.ctx.fmt(netBalance), netMod);

    // 2. Assets
    this.renderKpiCard(wrap, this.tr.overviewAssets, this.ctx.fmt(assets), 'income');

    // 3. Liabilities
    this.renderKpiCard(wrap, this.tr.overviewLiabilities, this.ctx.fmt(liabilities), 'expense');

    // 4. Credit burden
    if (burden !== null) {
      const burdenMod = burden >= OVERVIEW_BURDEN_DANGER ? 'expense'
        : burden >= OVERVIEW_BURDEN_WARN ? 'warning' : 'income';
      this.renderKpiCard(
        wrap, this.tr.overviewCreditBurden,
        `${burden.toFixed(1)}% ${this.tr.overviewBurdenOfIncome}`,
        burdenMod,
      );
    } else {
      this.renderKpiCard(wrap, this.tr.overviewCreditBurden, '—');
    }

    // 5. Upcoming payments
    const upcomingMod = upcoming > 0 ? 'expense' : undefined;
    const upcomingCard = this.renderKpiCard(wrap, this.tr.overviewUpcomingPayments, this.ctx.fmt(upcoming), upcomingMod);
    upcomingCard.createEl('div', { text: this.tr.overviewNext30Days, cls: 'finance-stat-sublabel' });
  }

  private renderKpiCard(
    parent: HTMLElement,
    label: string,
    value: string,
    mod?: string,
  ): HTMLElement {
    const card = parent.createDiv(`finance-stat-card${mod ? ` finance-stat-${mod}` : ''}`);
    const info = card.createDiv('finance-stat-info');
    info.createEl('div', { text: label, cls: 'finance-stat-label' });
    info.createEl('div', { text: value, cls: 'finance-stat-value' });
    return info;
  }
```

- [ ] **Step 2: Verify build** (no tests for DOM)

```bash
npm run lint && npm run build
```
Expected: 0 errors.

- [ ] **Step 3: Commit skeleton**

```bash
git add src/tabs/OverviewTab.ts
git commit -m "feat: add OverviewTab skeleton with KPI cards"
```

---

## Task 5: Chart 1 — Cash Flow (grouped bars + net line)

**Files:**
- Modify: `src/tabs/OverviewTab.ts` — implement `renderCashFlowChart()`

**Algorithm:** group non-internal records by `YYYY-MM`, build income/expense bars side-by-side, overlay a line for `income − expense` per month.

- [ ] **Step 1: Add `renderCashFlowChart()` to `OverviewTab.ts`**

After the `renderKpiCard()` method, before the closing `}` of the class:

```typescript
  private getMonthRange(): { from: string; to: string } {
    return {
      from: this.state.overviewDateFrom ?? this.defaultDateFrom(),
      to:   this.state.overviewDateTo   ?? getTodayStr(),
    };
  }

  private renderCashFlowChart(): void {
    if (!this.data) return;
    const { from, to } = this.getMonthRange();
    const map = new Map<string, { income: number; expense: number }>();

    for (const r of this.data.records) {
      if (r.isInternal === true) continue;
      if (r.date < from.slice(0, 7) + '-01' || r.date > to) continue;
      const key = r.date.slice(0, 7);
      const cur = map.get(key) ?? { income: 0, expense: 0 };
      if (r.type === 'income') cur.income += r.amount;
      else cur.expense += r.amount;
      map.set(key, cur);
    }

    const section = this.el.createDiv();
    section.createEl('div', { text: this.tr.overviewCashFlow, cls: 'finance-analytics-section-title' });

    if (!map.size) {
      section.createEl('p', { text: this.ctx.tr.noChartData, cls: 'finance-empty-sub' });
      return;
    }

    const keys = Array.from(map.keys()).sort();
    const data = keys.map(k => {
      const [y, m] = k.split('-');
      return {
        label: `${shortMonth((parseInt(m ?? '1') - 1) % 12, this.locale)} ${y}`,
        income: map.get(k)!.income,
        expense: map.get(k)!.expense,
      };
    });

    const isMobile = this.ctx.isMobile;
    const containerW = this.el.clientWidth || 600;
    const PL = CHART_SVG_PAD_LEFT, PR = CHART_SVG_PAD_RIGHT;
    const CH = CHART_SVG_HEIGHT_COMPACT;
    const PT = CHART_SVG_PAD_TOP, PB = CHART_SVG_PAD_BOTTOM_COMPACT;
    const chartH = CH - PT - PB;
    const MIN_GROUP = data.length > 12 ? CHART_MIN_GROUP_MOBILE : CHART_MIN_GROUP_DESKTOP;
    const W = Math.max(PL + data.length * MIN_GROUP + PR, containerW);
    const groupW = (W - PL - PR) / data.length;
    const maxBarW = isMobile ? CHART_MAX_BAR_W_MOBILE
      : data.length <= 4 ? CHART_MAX_BAR_W_SMALL
      : data.length <= 8 ? CHART_MAX_BAR_W_MED : CHART_MAX_BAR_W_LARGE;
    const barW = Math.max(2, Math.min(groupW * (isMobile ? CHART_BAR_RATIO_MOBILE : CHART_BAR_RATIO_DESKTOP), maxBarW));
    const GAP = 2;

    let maxVal = 1;
    data.forEach(d => { maxVal = Math.max(maxVal, d.income, d.expense); });

    const { showTip, hideTip } = createChartTooltip();
    const root = svg('svg', { viewBox: `0 0 ${W} ${CH}` });
    root.classList.add('finance-chart-svg', 'finance-bar-chart-svg');
    root.style.setProperty('--ft-chart-w', `${W}px`);
    root.style.setProperty('--ft-chart-h', `${CH}px`);

    for (let i = 0; i <= CHART_GRID_DIVISIONS_COMPACT; i++) {
      const y = PT + chartH * i / CHART_GRID_DIVISIONS_COMPACT;
      const val = maxVal * (1 - i / CHART_GRID_DIVISIONS_COMPACT);
      const line = svg('line', { x1: PL, y1: y, x2: W - PR, y2: y,
        stroke: 'var(--background-modifier-border)', 'stroke-width': i === CHART_GRID_DIVISIONS_COMPACT ? 1.5 : 1 });
      if (i > 0 && i < CHART_GRID_DIVISIONS_COMPACT) line.setAttribute('stroke-dasharray', '3 4');
      root.appendChild(line);
      const t = svg('text', { x: PL - 8, y: y + 4, 'text-anchor': 'end',
        fill: 'var(--text-muted)', 'font-size': 11 });
      t.textContent = fmtShort(val);
      root.appendChild(t);
    }

    const netPoints: string[] = [];
    data.forEach((d, i) => {
      const cx = PL + groupW * i + groupW / 2;

      if (d.income > 0) {
        const h = (d.income / maxVal) * chartH;
        const x = cx - barW - GAP / 2;
        const r = svg('rect', { x, y: PT + chartH - h, width: barW, height: h,
          fill: CHART_COLOR_INCOME, rx: CHART_BAR_RADIUS });
        const tip = `${d.label}\n${this.tr.income}: ${this.ctx.fmt(d.income)}`;
        r.addEventListener('mouseenter', e => showTip(e, tip));
        r.addEventListener('mousemove', e => showTip(e, tip));
        r.addEventListener('mouseleave', hideTip);
        root.appendChild(r);
      }
      if (d.expense > 0) {
        const h = (d.expense / maxVal) * chartH;
        const x = cx + GAP / 2;
        const r = svg('rect', { x, y: PT + chartH - h, width: barW, height: h,
          fill: CHART_COLOR_EXPENSE, rx: CHART_BAR_RADIUS });
        const tip = `${d.label}\n${this.tr.expense}: ${this.ctx.fmt(d.expense)}`;
        r.addEventListener('mouseenter', e => showTip(e, tip));
        r.addEventListener('mousemove', e => showTip(e, tip));
        r.addEventListener('mouseleave', hideTip);
        root.appendChild(r);
      }

      const net = d.income - d.expense;
      const netY = PT + chartH - Math.max(0, (net / maxVal) * chartH);
      netPoints.push(`${cx},${netY}`);

      const lbl = svg('text', { x: cx, y: CH - PB + 16, 'text-anchor': 'middle',
        fill: 'var(--text-muted)', 'font-size': 11 });
      lbl.textContent = d.label;
      if (data.length > 10) {
        lbl.setAttribute('transform', `rotate(-30, ${cx}, ${CH - PB + 16})`);
        lbl.setAttribute('text-anchor', 'end');
      }
      root.appendChild(lbl);
    });

    if (netPoints.length > 1) {
      const polyline = svg('polyline', {
        points: netPoints.join(' '),
        fill: 'none', stroke: 'var(--text-muted)', 'stroke-width': 1.5,
        'stroke-dasharray': '4 3',
      });
      root.appendChild(polyline);
    }

    const wrap = section.createDiv('finance-chart-svg-wrap');
    wrap.appendChild(root);
  }
```

- [ ] **Step 2: Build and commit**

```bash
npm run lint && npm run build
git add src/tabs/OverviewTab.ts
git commit -m "feat: add cash flow chart to OverviewTab"
```
