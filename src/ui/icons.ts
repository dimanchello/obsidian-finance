const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Calculator glyph, built as nodes rather than an innerHTML blob. */
export function buildCalculatorIcon(host: HTMLElement): void {
  const svg = svgEl('svg', {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    width: 18,
    height: 18,
  });

  svg.appendChild(svgEl('rect', { x: 3, y: 2, width: 14, height: 16, rx: 1.5 }));
  svg.appendChild(svgEl('line', { x1: 7, y1: 6, x2: 13, y2: 6 }));
  for (const cy of [10, 14]) {
    for (const cx of [7, 13]) {
      svg.appendChild(svgEl('circle', { cx, cy, r: 0.8, fill: 'currentColor' }));
    }
  }

  host.appendChild(svg);
}
