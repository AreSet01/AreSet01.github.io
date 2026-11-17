/** Keep expensive diagram layout out of the title and body entrance frames. */
export function waitForPostEntrance(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.location.hash) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settleTimer = 0;
    const article = document.querySelector('article');
    const isHeld = () => Boolean(
      (window as any).__postTransitionPending ||
      (window as any).__postTitleHoldPending ||
      document.documentElement.hasAttribute('data-post-title-hold') ||
      document.body.hasAttribute('data-post-title-hold') ||
      article?.hasAttribute('data-post-title-hold')
    );
    const finish = (ready: boolean) => {
      window.clearTimeout(settleTimer);
      observer.disconnect();
      window.removeEventListener('post-title-release', check);
      window.removeEventListener('post-transition-release', check);
      signal.removeEventListener('abort', cancel);
      resolve(ready);
    };
    const cancel = () => finish(false);
    const check = () => {
      if (isHeld()) {
        window.clearTimeout(settleTimer);
        settleTimer = 0;
      } else if (!settleTimer) {
        // The body fades in for 1s after docking. A near-viewport diagram must
        // not bypass this wait and import/parse Mermaid during that animation.
        settleTimer = window.setTimeout(() => finish(true), 1100);
      }
    };
    // Observe only the hold attributes, including the layout's fallback release.
    // Watching the subtree would wake this gate on every title animation frame.
    const observer = new MutationObserver(check);
    for (const node of [document.documentElement, document.body, article]) {
      if (node) observer.observe(node, { attributes: true, attributeFilter: ['data-post-title-hold'] });
    }
    window.addEventListener('post-title-release', check);
    window.addEventListener('post-transition-release', check);
    signal.addEventListener('abort', cancel, { once: true });
    check();
  });
}
