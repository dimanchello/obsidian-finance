import { svg } from './chartHelpers';

/** Calculator glyph, built as nodes rather than an innerHTML blob. */
export function buildCalculatorIcon(host: HTMLElement): void {
  const icon = svg('svg', {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    width: 18,
    height: 18,
  });

  icon.appendChild(svg('rect', { x: 3, y: 2, width: 14, height: 16, rx: 1.5 }));
  icon.appendChild(svg('line', { x1: 7, y1: 6, x2: 13, y2: 6 }));
  for (const cy of [10, 14]) {
    for (const cx of [7, 13]) {
      icon.appendChild(svg('circle', { cx, cy, r: 0.8, fill: 'currentColor' }));
    }
  }

  host.appendChild(icon);
}
