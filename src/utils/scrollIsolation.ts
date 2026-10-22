/**
 * 悬浮面板与抽屉滚动边界隔离引擎 (Scroll Isolation & Overscroll Containment)
 *
 * 彻底杜绝在悬浮面板（高亮笔记、墨问伴读、对照工作台）上滚动时穿透并联动文章正文滚动的问题。
 */

export interface ScrollIsolationOptions {
  /** 可滚动主体的 CSS 选择器，默认匹配 [data-scroll-isolated-body], .notes-drawer-body, .ink-ask-drawer-body 等 */
  scrollableSelector?: string;
  /** 允许内部特定元素（如 pre, code, textarea）优先响应自身滚动的选择器 */
  nestedScrollSelector?: string;
}

/**
 * 在容器元素上绑定滚动事件拦截与边界隔离
 * @param container 抽屉或悬浮窗根容器 (如 #article-notes-drawer, .ink-ask-drawer)
 * @param options 可选配置项
 * @returns 解绑函数
 */
export function bindScrollIsolation(
  container: HTMLElement,
  options: ScrollIsolationOptions = {}
): () => void {
  const {
    scrollableSelector = '.notes-drawer-body, .ink-ask-drawer-body, .pin-window-body, .pin-sheet-content, [data-scroll-isolated-body]',
    nestedScrollSelector = 'textarea, pre, code, [data-scrollable]',
  } = options;

  let touchStartY = 0;
  let touchStartX = 0;

  function findScrollable(target: Element | null): HTMLElement | null {
    let curr = target as HTMLElement | null;
    while (curr && curr !== container) {
      if (curr.matches(nestedScrollSelector)) {
        const style = window.getComputedStyle(curr);
        if (
          style.overflowY === 'auto' ||
          style.overflowY === 'scroll' ||
          style.overflowX === 'auto' ||
          style.overflowX === 'scroll' ||
          curr.tagName === 'TEXTAREA'
        ) {
          return curr;
        }
      }
      if (curr.matches(scrollableSelector)) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }

  const onWheel = (e: WheelEvent) => {
    // 阻断滚轮事件继续向上冒泡至 window / body，杜绝外部平滑滚动库误触发
    e.stopPropagation();

    const scrollable = findScrollable(e.target as Element | null);

    // 1. 若指针位于头部标题栏、底部操作栏、外边框等非可滚动区域：100% 阻断正文滚动
    if (!scrollable) {
      e.preventDefault();
      return;
    }

    const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = scrollable;

    // 2. 判断是横向主导还是纵向主导滚动
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);

    if (isHorizontal) {
      if (scrollWidth <= clientWidth) {
        e.preventDefault();
        return;
      }
      const isAtLeft = scrollLeft <= 0;
      const isAtRight = scrollLeft + clientWidth >= scrollWidth - 1.5;
      if ((e.deltaX < 0 && isAtLeft) || (e.deltaX > 0 && isAtRight)) {
        e.preventDefault();
      }
      return;
    }

    // 3. 纵向滚动边界检查
    // 当内容高度不足以产生纵向滚动条（例如“暂无笔记”空状态，或高度未超限）
    if (scrollHeight <= clientHeight) {
      e.preventDefault();
      return;
    }

    const deltaY = e.deltaY;
    const isScrollingUp = deltaY < 0;
    const isScrollingDown = deltaY > 0;

    const isAtTop = scrollTop <= 0;
    // 留出 1.5px 容差应对高分屏亚像素缩放与浮点截断
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1.5;

    // 当位于顶部继续向上滚，或位于底部继续向下滚时，彻底阻止默认行为，杜绝文章级联滚动
    if ((isScrollingUp && isAtTop) || (isScrollingDown && isAtBottom)) {
      e.preventDefault();
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = touchStartY - currentY; // > 0: 向下滚动；< 0: 向上滚动
    const deltaX = touchStartX - currentX;

    const scrollable = findScrollable(e.target as Element | null);

    if (!scrollable) {
      if (e.cancelable) e.preventDefault();
      return;
    }

    const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = scrollable;
    const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);

    if (isHorizontal) {
      if (scrollWidth <= clientWidth) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      const isAtLeft = scrollLeft <= 0;
      const isAtRight = scrollLeft + clientWidth >= scrollWidth - 1.5;
      if ((deltaX < 0 && isAtLeft) || (deltaX > 0 && isAtRight)) {
        if (e.cancelable) e.preventDefault();
      }
      return;
    }

    if (scrollHeight <= clientHeight) {
      if (e.cancelable) e.preventDefault();
      return;
    }

    const isScrollingUp = deltaY < 0;
    const isScrollingDown = deltaY > 0;
    const isAtTop = scrollTop <= 0;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1.5;

    if ((isScrollingUp && isAtTop) || (isScrollingDown && isAtBottom)) {
      if (e.cancelable) e.preventDefault();
    }
  };

  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: false });

  return () => {
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
  };
}
