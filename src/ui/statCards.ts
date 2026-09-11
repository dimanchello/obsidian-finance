export interface StatCardItem {
  label: string;
  value: string;
  mod?: string;
  icon?: string;
}

/**
 * Renders a single `.finance-stat-card` into an existing container and returns it,
 * so callers that need the element (KPI cards) can keep decorating it.
 *
 * Lives in its own module rather than in `tabHelpers` because `context.ts` uses it
 * and `tabHelpers` imports `ViewContext` — importing it from there would create a cycle.
 */
export function renderStatCard(container: HTMLElement, item: StatCardItem): HTMLElement {
  const card = container.createDiv(`finance-stat-card${item.mod ? ` finance-stat-${item.mod}` : ''}`);
  if (item.icon) card.createEl('div', { text: item.icon, cls: 'finance-stat-icon' });
  const info = card.createDiv('finance-stat-info');
  info.createEl('div', { text: item.label, cls: 'finance-stat-label' });
  info.createEl('div', { text: item.value, cls: 'finance-stat-value' });
  return card;
}

/**
 * Renders a row of `.finance-stat-card` blocks inside a fresh wrapper div, so a change
 * to the card markup does not have to be repeated per view.
 */
export function renderStatCards(
  container: HTMLElement,
  cards: StatCardItem[],
  wrapperCls = 'finance-stat-cards'
): void {
  const wrap = container.createDiv(wrapperCls);
  cards.forEach(item => renderStatCard(wrap, item));
}

export interface SummaryCardItem {
  icon: string;
  title: string;
  main: string;
  sub: string;
  mod?: string;
}

/**
 * Renders a two-column summary card (used in Debts, Credits, Deposits, Currency tabs)
 * with an icon and title on the left and main/sub values on the right.
 */
export function renderSummaryCard(
  container: HTMLElement,
  opts: SummaryCardItem
): HTMLElement {
  const card = container.createDiv(`finance-stat-card ${opts.mod ?? ''}`);
  const header = card.createDiv('finance-debt-summary-header');
  header.createEl('span', { text: opts.icon, cls: 'finance-debt-summary-icon' });
  header.createEl('span', { text: opts.title, cls: 'finance-debt-summary-title' });
  const content = card.createDiv('finance-debt-summary-content');
  content.createEl('div', { text: opts.main, cls: 'finance-debt-summary-main' });
  content.createEl('div', { text: opts.sub, cls: 'finance-debt-summary-sub' });
  return card;
}
