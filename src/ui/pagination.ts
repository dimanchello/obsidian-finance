import { PAGE_RANGE_THRESHOLD } from '../types';

const RADIUS_DESKTOP = 2;
const RADIUS_MOBILE = 1;

/**
 * Page indices to render, with -1 marking an ellipsis. First and last pages are
 * always present, so the list stays bounded no matter how many pages exist.
 */
export function pageRange(cur: number, total: number, isMobile: boolean): number[] {
  if (total <= PAGE_RANGE_THRESHOLD) return Array.from({ length: total }, (_, i) => i);

  const radius = isMobile ? RADIUS_MOBILE : RADIUS_DESKTOP;
  const pages: number[] = [0];

  if (cur > radius + 1) pages.push(-1);
  for (let i = Math.max(1, cur - radius); i <= Math.min(total - 2, cur + radius); i++) pages.push(i);
  if (cur < total - (radius + 2)) pages.push(-1);

  pages.push(total - 1);
  return pages;
}

export interface PaginationOptions {
  container: HTMLElement;
  currentPage: number;
  totalPages: number;
  isMobile: boolean;
  onPageChange: (page: number) => void;
  cls?: string;
}

/**
 * Renders unified pagination controls with prev/next buttons and smart page range.
 * Returns the created container element, or null if totalPages <= 1.
 */
export function renderPagination(opts: PaginationOptions): HTMLElement | null {
  if (opts.totalPages <= 1) return null;

  const nav = opts.container.createDiv(`finance-pagination-nav${opts.cls ? ` ${opts.cls}` : ''}`);

  const prev = nav.createEl('button', { cls: 'finance-page-btn', text: '←' });
  prev.disabled = opts.currentPage === 0;
  prev.addEventListener('click', () => opts.onPageChange(opts.currentPage - 1));

  pageRange(opts.currentPage, opts.totalPages, opts.isMobile).forEach(p => {
    if (p === -1) {
      nav.createEl('span', { text: '…', cls: 'finance-page-ellipsis' });
      return;
    }
    const btn = nav.createEl('button', {
      text: String(p + 1),
      cls: `finance-page-btn${p === opts.currentPage ? ' active' : ''}`,
    });
    btn.addEventListener('click', () => opts.onPageChange(p));
  });

  const next = nav.createEl('button', { cls: 'finance-page-btn', text: '→' });
  next.disabled = opts.currentPage >= opts.totalPages - 1;
  next.addEventListener('click', () => opts.onPageChange(opts.currentPage + 1));

  return nav;
}
