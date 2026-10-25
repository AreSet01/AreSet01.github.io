/**
 * 视口阅读锚点锁定器 (Scroll Anchor Lock)
 * 当展开/收起侧边栏、打开/关闭墨问 AI 或笔记抽屉导致正文排版宽度变化时，
 * 动态锚定当前视口内的阅读段落/标题，并在重排动画期间实时补偿滚动条，
 * 保证用户正在阅读的文字在视口垂直方向上纹丝不动。
 */

export function lockScrollAnchor(duration = 500) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const prose = document.querySelector<HTMLElement>('.prose, article, main');
  if (!prose) return () => {};

  // 筛选文章正文中的有效阅读块级元素
  const candidates = Array.from(
    prose.querySelectorAll<HTMLElement>(
      'h1, h2, h3, h4, h5, h6, p, pre, blockquote, table, li, figure, hr'
    )
  );
  if (!candidates.length) return () => {};

  const viewportH = window.innerHeight;
  let bestAnchor: HTMLElement | null = null;
  let minDistance = Infinity;

  // 优先选取距视口顶部 120px 附近的可视元素（正好处在用户视线聚焦核心区）
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom > 60 && rect.top < viewportH * 0.75) {
      const dist = Math.abs(rect.top - 120);
      if (dist < minDistance) {
        minDistance = dist;
        bestAnchor = el;
      }
    }
  }

  // 若未找到，降级选取第一个 bottom > 80px 的元素
  if (!bestAnchor) {
    bestAnchor = candidates.find((el) => el.getBoundingClientRect().bottom > 80) || null;
  }

  if (!bestAnchor) return () => {};

  const targetTop = bestAnchor.getBoundingClientRect().top;
  let animId: number | null = null;
  const startTime = performance.now();
  let isStopped = false;

  const sync = () => {
    if (isStopped || !bestAnchor || !bestAnchor.isConnected) return;

    const currentTop = bestAnchor.getBoundingClientRect().top;
    const diff = currentTop - targetTop;

    // 当排版重排引起视口垂直位移超过 0.5px 时立即补偿
    if (Math.abs(diff) > 0.5) {
      const lenis = (window as any).lenis;
      if (lenis && typeof lenis.scrollTo === 'function') {
        lenis.scrollTo(lenis.scroll + diff, { immediate: true });
      } else {
        window.scrollBy(0, diff);
      }
    }

    if (performance.now() - startTime < duration) {
      animId = requestAnimationFrame(sync);
    } else {
      // 动画结束后刷新平滑滚动器与滚动触发器尺寸
      try {
        (window as any).lenis?.resize();
        (window as any).ScrollTrigger?.refresh?.();
      } catch {}
    }
  };

  animId = requestAnimationFrame(sync);

  return () => {
    isStopped = true;
    if (animId !== null) cancelAnimationFrame(animId);
    try {
      (window as any).lenis?.resize();
      (window as any).ScrollTrigger?.refresh?.();
    } catch {}
  };
}
