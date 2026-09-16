import { fmtDate } from "../utils";
import { Translations } from '../i18n';
import { FilterControl } from './DataTable';
import { PERCENT_100 } from '../types';
import { ViewContext } from '../context';
import { daysBetweenStr, safeEndDate } from '../domain/dateMath';
import { getTodayStr } from '../utils';
import { PaymentStatus } from '../constants';

export function renderProgressBar(
  host: HTMLElement,
  startDate: string,
  endDate: string | null,
  _tr: Translations,
  fmtDate: (d: string) => string
): void {
  if (!startDate || !endDate || startDate >= endDate) return;
  const today = getTodayStr();
  const totalDays = daysBetweenStr(startDate, endDate);
  const elapsedDays = daysBetweenStr(startDate, today);
  const progress = Math.min(PERCENT_100, Math.max(0, (elapsedDays / totalDays) * PERCENT_100));

  const progressWrap = host.createDiv('finance-deposit-progress');
  const progressLabel = progressWrap.createDiv('finance-deposit-progress-label');
  progressLabel.textContent = `${fmtDate(startDate)} → ${fmtDate(endDate)} (${Math.round(progress)}%)`;

  const progressBar = progressWrap.createDiv('finance-deposit-progress-bar');
  const progressFill = progressBar.createDiv('finance-deposit-progress-fill');
  progressFill.style.setProperty('--ft-progress', `${progress}%`);
  if (progress >= PERCENT_100) progressFill.addClass('is-complete');
}

export {
  pageRange,
  renderPagination,
  type PaginationOptions,
} from './pagination';

export function renderPaginatedSchedule<T extends { dueDate: string; status: string; amount: number }>(
  host: HTMLElement,
  items: T[],
  currentPage: number,
  pageSize: number,
  columns: string[],
  ctx: ViewContext,
  formatters?: {
    formatDate?: (item: T) => string;
    formatStatus?: (item: T, isPaid: boolean) => string;
  }
): void {
  const today = getTodayStr();
  const start = currentPage * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  const scrollWrapper = host.createDiv('finance-mov-scroll');
  const movTable = scrollWrapper.createEl('table', { cls: 'finance-mov-table' });
  const movHead = movTable.createEl('thead').createEl('tr');
  columns.forEach(l => movHead.createEl('th', { text: l, cls: 'finance-th finance-mov-th' }));
  const movBody = movTable.createEl('tbody');

  pageItems.forEach((p, idx) => {
    const isPaid = p.status === PaymentStatus.PAID || p.dueDate <= today;
    const mr = movBody.createEl('tr', { cls: isPaid ? 'finance-payment-paid' : 'finance-payment-pending' });
    mr.createEl('td', { text: String(start + idx + 1), cls: 'finance-td' });
    const dateText = formatters?.formatDate ? formatters.formatDate(p) : fmtDate(p.dueDate);
    mr.createEl('td', { text: dateText, cls: 'finance-td' });
    mr.createEl('td', { text: ctx.fmt(p.amount), cls: 'finance-td' });
    const statusText = formatters?.formatStatus
      ? formatters.formatStatus(p, isPaid)
      : (isPaid ? ctx.tr.paidStatus : ctx.tr.pendingStatus);
    mr.createEl('td', { 
      text: statusText, 
      cls: 'finance-td finance-payment-status' 
    });
  });
}

export {
  renderStatCard,
  renderStatCards,
  type StatCardItem,
  renderSummaryCard,
  type SummaryCardItem,
} from './statCards';

export function renderMobileCard(
  block: HTMLElement,
  opts: {
    amountText: string;
    amountCls?: string;
    subtitle: string;
    details: { label: string; value: string }[];
    note?: string;
  }
): void {
  const header = block.createDiv('finance-record-header');
  header.createSpan({ text: opts.amountText, cls: `finance-record-amount ${opts.amountCls ?? ''}` });
  header.createSpan({ text: opts.subtitle, cls: 'finance-record-date' });

  const details = block.createDiv('finance-record-details');
  opts.details.forEach(d => {
    details.createSpan({ text: `${d.label} ${d.value}`, cls: 'finance-record-detail' });
  });

  if (opts.note) {
    block.createDiv({ text: opts.note, cls: 'finance-record-note' });
  }
}

export interface CompactTransactionOptions {
  indicator: string;
  indicatorCls?: string;
  title: string;
  subtitle?: string;
  amountText: string;
  amountCls?: string;
  dateText: string;
  deleteTitle?: string;
  onDelete?: () => void;
  onClick?: () => void;
}

export function renderCompactTransactionCard(
  block: HTMLElement,
  opts: CompactTransactionOptions
): void {
  const ind = block.createDiv('finance-compact-indicator');
  if (opts.indicatorCls) ind.addClass(opts.indicatorCls);
  ind.textContent = opts.indicator;

  const main = block.createDiv('finance-compact-main');
  const titleEl = main.createDiv('finance-compact-title');
  titleEl.textContent = opts.title;
  if (opts.subtitle) {
    const subEl = main.createDiv('finance-compact-subtitle');
    subEl.textContent = opts.subtitle;
  }

  const right = block.createDiv('finance-compact-right');
  const amtEl = right.createDiv('finance-compact-amount');
  if (opts.amountCls) amtEl.addClass(opts.amountCls);
  amtEl.textContent = opts.amountText;

  const dateEl = right.createDiv('finance-compact-date');
  dateEl.textContent = opts.dateText;

  if (opts.onDelete) {
    const delBtn = block.createEl('button', {
      cls: 'finance-compact-del-btn',
      text: '🗑️',
    });
    if (opts.deleteTitle) delBtn.title = opts.deleteTitle;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onDelete?.();
    });
  }

  if (opts.onClick) {
    block.addClass('finance-card-clickable');
    block.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.finance-compact-del-btn') || t.closest('.finance-action-btn') || t.tagName === 'INPUT') return;
      opts.onClick?.();
    });
  }
}

export function dateRangeControls(
  f: { dateFrom: string; dateTo: string },
  tr: Translations
): FilterControl[] {
  return [
    { kind: 'date', label: tr.from, get: () => f.dateFrom, set: v => { f.dateFrom = v; } },
    { kind: 'date', label: tr.to, get: () => f.dateTo, set: v => { f.dateTo = v; } },
  ];
}

export function compareValues(av: unknown, bv: unknown, dir: 'asc' | 'desc', locale = 'ru'): number {
  let cmp = 0;
  if (typeof av === 'number' && typeof bv === 'number') {
    cmp = av - bv;
  } else {
    cmp = String(av).localeCompare(String(bv), locale);
  }
  return dir === 'asc' ? cmp : -cmp;
}

export function uniqueOptions<T>(items: T[], key: keyof T, allLabel: string): { value: string; label: string }[] {
  const unique = [...new Set(items.map(item => String(item[key])).filter(Boolean))];
  return [
    { value: '', label: allLabel },
    ...unique.map(val => ({ value: val, label: val })),
  ];
}

export function createAnalyticsToggle(
  toolbar: HTMLElement,
  isOpen: boolean,
  onClick: () => void,
  tr: Translations
): HTMLButtonElement {
  const toggleBtn = toolbar.createEl('button', {
    cls: `finance-analytics-toggle-btn${isOpen ? ' active' : ''}`,
    text: `📈 ${tr.analytics} ${isOpen ? '▲' : '▼'}`,
  });
  toggleBtn.addEventListener('click', onClick);
  return toggleBtn;
}

export function calculateEndDate(startDate: string, termMonths: number | undefined): string | null {
  return safeEndDate(startDate, termMonths) || null;
}
