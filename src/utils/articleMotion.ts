function parseCssDurationMs(raw: string, fallbackMs: number): number {
  const match = raw.trim().match(/^(\d*\.?\d+)(ms|s)$/);
  if (!match) return fallbackMs;
  const ms = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
  return Number.isFinite(ms) ? ms : fallbackMs;
}

/** CSS owns the article motion values; GSAP and WAAPI read the same curves. */
export function readArticleMotion() {
  const style = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  // Production CSS may shorten 620ms to .62s. WAAPI and timers always need ms.
  const panelMs = parseCssDurationMs(value('--article-duration-panel', '620ms'), 620);
  const revealMs = parseCssDurationMs(value('--article-duration-reveal', '620ms'), 620);
  const popoverMs = parseCssDurationMs(value('--article-duration-popover', '220ms'), 220);
  return {
    revealEase: value('--article-ease-reveal', 'cubic-bezier(0.25, 0.46, 0.45, 1)'),
    surfaceEase: value('--article-ease-surface', 'cubic-bezier(0.22, 0.61, 0.36, 1)'),
    layoutEase: value('--article-ease-layout', 'cubic-bezier(0.4, 0, 0.2, 1)'),
    panelMs,
    revealMs,
    popoverMs,
  };
}

export function cubicBezierPoints(ease: string) {
  return ease.replace(/^cubic-bezier\(/, '').replace(/\)$/, '');
}
