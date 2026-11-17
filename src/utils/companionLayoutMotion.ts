import { readArticleMotion } from './articleMotion.ts';

type LayoutPanel = {
  panel: HTMLElement;
  entering?: boolean;
  leaving?: boolean;
  direction?: number;
};

/** Move empty frames together; lay out their real text once, while faded out. */
export function createCompanionLayoutMotion() {
  let active: {
    frames: Map<HTMLElement, HTMLElement>;
    finish: () => void;
    cancel: () => void;
  } | null = null;

  function transitionMany(panels: LayoutPanel[], commit: () => void) {
    // Read every visible frame before cancelling the previous group. Reversals
    // retain each panel's own position, including a peer that was fading away.
    const firsts = panels.map(entry => {
      const frame = active?.frames.get(entry.panel);
      const rect = (frame || entry.panel).getBoundingClientRect();
      return {
        rect,
        visible: Boolean(frame) || (!entry.entering && rect.width > 0 && rect.height > 0),
        opacity: frame ? getComputedStyle(frame).opacity : '1',
      };
    });
    const interrupted = Boolean(active) || panels.some(({ panel }) => panel.getAnimations().some(a => a.playState === 'running'));
    active?.cancel();
    if (!panels.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches || panels.some(({ panel }) => !panel.animate)) {
      commit();
      return;
    }

    const { panelMs, layoutEase, surfaceEase } = readArticleMotion();
    const animations: Animation[] = [];
    const saved = panels.map(({ panel }) => ['opacity', 'transition', 'backdrop-filter'].map(name => ({
      name, value: panel.style.getPropertyValue(name), priority: panel.style.getPropertyPriority(name),
    })));
    const restore = (panel: HTMLElement, property: typeof saved[number][number]) => {
      if (property.value) panel.style.setProperty(property.name, property.value, property.priority);
      else panel.style.removeProperty(property.name);
    };
    let committed = false;
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      panels.forEach(({ panel }, i) => {
        restore(panel, saved[i][0]);
        panel.style.setProperty('transition', 'none', 'important');
      });
      animations.forEach(animation => animation.cancel());
      panels.forEach(({ panel }, i) => {
        panel.removeAttribute('data-companion-layout-motion');
        restore(panel, saved[i][2]);
      });
      // Resolve final theme transforms before restoring transitions. Otherwise
      // equivalent identity transforms can trigger an extra 620ms CSS animation.
      panels.forEach(({ panel }) => { void panel.offsetWidth; });
      panels.forEach(({ panel }, i) => restore(panel, saved[i][1]));
      state.frames.forEach(frame => frame.remove());
      if (active === state) active = null;
    };
    const apply = () => {
      if (committed) return;
      committed = true;
      commit();
    };
    const state = { frames: new Map<HTMLElement, HTMLElement>(), cancel: cleanup, finish: () => { apply(); cleanup(); } };
    active = state;

    const surfaceOf = (panel: HTMLElement) => {
      const style = getComputedStyle(panel);
      return { background: style.background, border: style.border, borderRadius: style.borderRadius, boxShadow: style.boxShadow };
    };
    const makeFrame = (panel: HTMLElement, rect: DOMRect, surface: ReturnType<typeof surfaceOf>) => {
      const frame = document.createElement('div');
      frame.className = 'companion-layout-frame';
      frame.dataset.companionPanel = panel.id || panel.classList[0] || 'panel';
      frame.setAttribute('aria-hidden', 'true');
      Object.assign(frame.style, {
        position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`,
        willChange: 'transform, opacity',
        ...surface,
      });
      state.frames.set(panel, frame);
      document.body.appendChild(frame);
      return frame;
    };

    const move = () => {
      if (disposed) return;
      const oldSurfaces = panels.map(({ panel }) => surfaceOf(panel));
      panels.forEach(({ panel }) => {
        panel.style.opacity = '0';
        panel.setAttribute('data-companion-layout-motion', 'measure');
        panel.getAnimations().forEach(animation => animation.cancel());
      });
      apply();
      const lasts = panels.map(({ panel }) => panel.getBoundingClientRect());
      const surfaces = panels.map(({ panel }) => surfaceOf(panel));
      animations.forEach(animation => animation.cancel());
      animations.length = 0;

      panels.forEach(({ panel, leaving, direction = 1 }, i) => {
        const { rect: firstRect, visible, opacity } = firsts[i];
        if (leaving) {
          if (!visible) return;
          const frame = makeFrame(panel, firstRect, oldSurfaces[i]);
          animations.push(frame.animate([
            { opacity, transform: 'translate3d(0, 0, 0)' },
            { opacity: 0, transform: `translate3d(${direction * 16}px, 0, 0)` },
          ], { duration: panelMs * 0.7, easing: surfaceEase, fill: 'both' }));
          return;
        }
        const last = lasts[i];
        if (!last.width || !last.height) return;
        const first = visible ? firstRect : {
          left: last.left + direction * 18, top: last.top, width: last.width, height: last.height,
        };
        const surface = surfaces[i];
        const frame = makeFrame(panel, last, surface);
        panel.setAttribute('data-companion-layout-motion', 'moving');
        // Preserve the unprefixed override through CSS minifiers as well.
        panel.style.setProperty('backdrop-filter', 'none', 'important');
        animations.push(frame.animate([
          { opacity: visible ? opacity : 0, transform: `translate3d(${first.left - last.left}px, ${first.top - last.top}px, 0) scale(${first.width / last.width}, ${first.height / last.height})` },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1, 1)' },
        ], { duration: panelMs, easing: layoutEase, fill: 'both' }));
        animations.push(panel.animate([{ opacity: 0 }, { opacity: 1 }], {
          delay: panelMs * 0.2, duration: panelMs * 0.65, easing: surfaceEase, fill: 'both',
        }));
        // Clip to the moving frame without stretching glyphs or animating width.
        animations.push(panel.animate([
          { clipPath: `inset(${first.top - last.top}px ${last.left + last.width - first.left - first.width}px ${last.top + last.height - first.top - first.height}px ${first.left - last.left}px round ${surface.borderRadius})` },
          { clipPath: `inset(0px 0px 0px 0px round ${surface.borderRadius})` },
        ], { duration: panelMs, easing: layoutEase, fill: 'both' }));
      });
      void Promise.all(animations.map(animation => animation.finished)).then(cleanup, () => {});
    };

    if (interrupted) {
      move();
    } else {
      panels.forEach(({ panel }, i) => {
        if (!firsts[i].visible) return;
        for (const child of panel.children) {
          if (!(child instanceof HTMLElement)) continue;
          animations.push(child.animate([{ opacity: getComputedStyle(child).opacity }, { opacity: 0 }], {
            duration: Math.min(100, panelMs * 0.16), easing: surfaceEase, fill: 'forwards',
          }));
        }
      });
      void Promise.all(animations.map(animation => animation.finished)).then(move, () => {});
    }
  }

  return {
    transition: (panel: HTMLElement, commit: () => void) => transitionMany([{ panel }], commit),
    transitionMany,
    finish: () => active?.finish(),
    cancel: () => active?.cancel(),
  };
}
