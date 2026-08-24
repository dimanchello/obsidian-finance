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
