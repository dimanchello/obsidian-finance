import { PAGE_RANGE_THRESHOLD } from '../types';

const RADIUS_DESKTOP = 3;
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
