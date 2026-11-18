/**
 * workbenchMotion.ts — 120fps Compositor-Only Motion Choreography Toolkit for App Workbenches
 *
 * Built on `motion` (`animate`, `spring`):
 *  - `computeInversePillRadius` / `animatePillGlider`: Inverse border-radius (`--pill-rx / --pill-ry`)
 *    spring pill gliders on fixed `width: 100px` layers (`translate3d(...) scaleX(...)`), zero layout width writes.
 *  - `animatePaperModal`: 3D Xuan-paper folded-slip (`perspective(1100px) rotateX`) & thread-bound folio
 *    (`perspective(1200px) rotateY`) modal unfurl/fold choreography.
 *  - `animateInkPopover`: Compositor ink-strip popover/drawer reveal & retract (`transform`, `opacity`, `clipPath`).
 *  - `animateCountValue`: Smooth spring/eased numeric counter for workbench telemetry & stats strips.
 *
 * Strictly obeys monochrome water-ink rules: zero dynamic Gaussian blur, zero layout/paint property transitions,
 * and instant deterministic commit under `prefers-reduced-motion: reduce` or non-visual test environments.
 */

import { animate, spring } from 'motion';

export interface MotionHandle {
  stop: () => void;
  finished: Promise<void>;
}

export interface InversePillRadiusOptions {
  baseWidth?: number;
  baseHeight?: number;
  scaleY?: boolean;
  fixedRadius?: number;
}

export interface InversePillRadiusMetrics {
  sx: number;
  sy: number;
  rx: number;
  ry: number;
  transform: string;
}

export interface PillGliderGeometry {
  x: number;
  y?: number;
  width: number;
  height: number;
  opacity?: number;
}

export interface AnimatePillGliderOptions extends InversePillRadiusOptions {
  container?: HTMLElement | null;
  immediate?: boolean;
  stiffness?: number;
  damping?: number;
  mass?: number;
  opacity?: number;
  readyClass?: string;
}

export interface AnimatePaperModalOptions {
  variant?: 'slip' | 'folio';
  immediate?: boolean;
  stiffness?: number;
  damping?: number;
  mass?: number;
  closeDurationSec?: number;
  onComplete?: () => void;
}

export interface AnimateInkPopoverOptions {
  immediate?: boolean;
  useClipPath?: boolean;
  radiusPx?: number;
  offsetY?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
  onComplete?: () => void;
}

export interface AnimateCountValueOptions {
  from?: number;
  durationSec?: number;
  immediate?: boolean;
  formatter?: (value: number) => string;
  onComplete?: () => void;
}

interface GliderRuntimeState {
  x: number;
  y: number;
  width: number;
  height: number;
  initialized: boolean;
  activeStop: (() => void) | null;
}

const gliderStates = new WeakMap<HTMLElement, GliderRuntimeState>();
const elementHandles = new WeakMap<HTMLElement, () => void>();
const counterHandles = new WeakMap<HTMLElement, () => void>();

const NOOP_HANDLE: MotionHandle = {
  stop: () => {},
  finished: Promise.resolve(),
};

export function prefersReducedWorkbenchMotion(win?: Window | null): boolean {
  const targetWin =
    win || (typeof window !== 'undefined' ? window : null);
  if (!targetWin || typeof targetWin.matchMedia !== 'function') return false;
  try {
    return Boolean(targetWin.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

function canRunMotionFrames(el?: Element | null): boolean {
  const docWin = el?.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
  if (prefersReducedWorkbenchMotion(docWin)) return false;
  const hasRaf =
    typeof globalThis.requestAnimationFrame === 'function' ||
    typeof docWin?.requestAnimationFrame === 'function';
  if (!hasRaf) return false;

  // Ensure JSDOM globals required by motion's subject resolver exist when running in tests
  if (docWin) {
    const g = globalThis as Record<string, unknown>;
    for (const key of ['NodeList', 'HTMLCollection', 'SVGElement', 'HTMLElement', 'Element']) {
      if (typeof g[key] === 'undefined' && typeof (docWin as unknown as Record<string, unknown>)[key] !== 'undefined') {
        g[key] = (docWin as unknown as Record<string, unknown>)[key];
      }
    }
  }
  return true;
}

/**
 * Computes pure-compositor scale factors (`sx`, `sy`) and inverse border-radius values (`--pill-rx`, `--pill-ry`)
 * so that a fixed `width: 100px` glider scaled non-uniformly preserves circular capsule endcaps with zero CSS corner clamping.
 */
export function computeInversePillRadius(
  width: number,
  height: number,
  x = 0,
  y = 0,
  options: InversePillRadiusOptions = {}
): InversePillRadiusMetrics {
  const baseWidth = options.baseWidth && options.baseWidth > 0 ? options.baseWidth : 100;
  const baseHeight = options.baseHeight && options.baseHeight > 0 ? options.baseHeight : 36;
  const useScaleY = Boolean(options.scaleY);

  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const sx = Math.max(0.05, safeW / baseWidth);
  const sy = useScaleY ? Math.max(0.05, safeH / baseHeight) : 1;

  const maxAllowedRadius = Math.min(safeW, safeH) * 0.5;
  const targetRadius =
    typeof options.fixedRadius === 'number' && options.fixedRadius > 0
      ? Math.min(options.fixedRadius, maxAllowedRadius)
      : maxAllowedRadius;

  const rx = Number((targetRadius / sx).toFixed(2));
  const ry = Number((useScaleY ? targetRadius / sy : targetRadius).toFixed(2));

  const transform = useScaleY
    ? `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`
    : `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scaleX(${sx.toFixed(4)})`;

  return { sx, sy, rx, ry, transform };
}

function resolvePillTargetGeometry(
  glider: HTMLElement,
  target: HTMLElement | PillGliderGeometry,
  container?: HTMLElement | null
): PillGliderGeometry | null {
  if (!(target instanceof Element)) {
    if (!target || !(target.width > 0) || !(target.height > 0)) return null;
    return target;
  }

  const targetEl = target as HTMLElement;
  const host = container || (targetEl.offsetParent as HTMLElement | null) || targetEl.parentElement;

  let width = targetEl.offsetWidth;
  let height = glider.offsetHeight || targetEl.offsetHeight;
  let x = targetEl.offsetLeft;
  let y = 0;

  if ((!width || !height) && typeof targetEl.getBoundingClientRect === 'function') {
    const tRect = targetEl.getBoundingClientRect();
    width = tRect.width;
    height = glider.offsetHeight || tRect.height;
    if (host && typeof host.getBoundingClientRect === 'function') {
      const hRect = host.getBoundingClientRect();
      x = tRect.left - hRect.left + (host.scrollLeft || 0);
      y = tRect.top - hRect.top + (host.scrollTop || 0);
    }
  } else if (container && targetEl.offsetParent !== container && typeof targetEl.getBoundingClientRect === 'function') {
    const tRect = targetEl.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    if (tRect.width > 0 && tRect.height > 0) {
      width = tRect.width;
      height = glider.offsetHeight || tRect.height;
      x = tRect.left - cRect.left + (container.scrollLeft || 0);
      y = tRect.top - cRect.top + (container.scrollTop || 0);
    }
  }

  if (!(width > 0) || !(height > 0)) return null;
  return { x, y, width, height };
}

function applyGliderFrame(
  glider: HTMLElement,
  x: number,
  y: number,
  width: number,
  height: number,
  options: AnimatePillGliderOptions
): InversePillRadiusMetrics {
  const metrics = computeInversePillRadius(width, height, x, y, options);
  glider.style.setProperty('--pill-rx', `${metrics.rx.toFixed(2)}px`);
  glider.style.setProperty('--pill-ry', `${metrics.ry.toFixed(2)}px`);
  glider.style.transform = metrics.transform;
  if (typeof options.opacity === 'number') {
    glider.style.opacity = String(options.opacity);
  }
  if (options.readyClass) {
    glider.classList.add(options.readyClass);
  }
  return metrics;
}

export function stopPillGlider(glider: HTMLElement | null | undefined): void {
  if (!glider) return;
  const st = gliderStates.get(glider);
  if (st?.activeStop) {
    st.activeStop();
    st.activeStop = null;
  }
}

/**
 * Drives a `width: 100px` capsule glider with a 120fps `motion` spring while continuously compensating
 * `--pill-rx` and `--pill-ry` per frame so capsule corners never distort during width morphs.
 */
export function animatePillGlider(
  glider: HTMLElement | null | undefined,
  target: HTMLElement | PillGliderGeometry | null | undefined,
  options: AnimatePillGliderOptions = {}
): MotionHandle {
  if (!glider || !target) return NOOP_HANDLE;

  const geom = resolvePillTargetGeometry(glider, target, options.container);
  if (!geom) return NOOP_HANDLE;

  const nextX = geom.x;
  const nextY = options.scaleY ? (geom.y ?? 0) : 0;
  const nextW = geom.width;
  const nextH = geom.height;

  let state = gliderStates.get(glider);
  if (state?.activeStop) {
    state.activeStop();
    state.activeStop = null;
  }

  if (!state) {
    state = {
      x: nextX,
      y: nextY,
      width: nextW,
      height: nextH,
      initialized: false,
      activeStop: null,
    };
    gliderStates.set(glider, state);
  }

  const shouldSnap =
    Boolean(options.immediate) ||
    !state.initialized ||
    !canRunMotionFrames(glider) ||
    (Math.abs(state.x - nextX) < 0.25 &&
      Math.abs(state.y - nextY) < 0.25 &&
      Math.abs(state.width - nextW) < 0.25 &&
      Math.abs(state.height - nextH) < 0.25);

  if (shouldSnap) {
    glider.style.transition = 'none';
    applyGliderFrame(glider, nextX, nextY, nextW, nextH, {
      ...options,
      opacity: options.opacity ?? geom.opacity,
    });
    state.x = nextX;
    state.y = nextY;
    state.width = nextW;
    state.height = nextH;
    state.initialized = true;
    return NOOP_HANDLE;
  }

  const fromX = state.x;
  const fromY = state.y;
  const fromW = state.width;
  const fromH = state.height;
  const targetOpacity = options.opacity ?? geom.opacity;

  glider.style.transition = 'none';
  if (typeof targetOpacity === 'number') {
    glider.style.opacity = String(targetOpacity);
  }
  if (options.readyClass) {
    glider.classList.add(options.readyClass);
  }

  let stopped = false;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  try {
    const controls = animate(0, 1, {
      type: spring,
      stiffness: options.stiffness ?? 460,
      damping: options.damping ?? 36,
      mass: options.mass ?? 0.72,
      onUpdate: (progress: number) => {
        if (stopped) return;
        const curX = fromX + (nextX - fromX) * progress;
        const curY = fromY + (nextY - fromY) * progress;
        const curW = Math.max(4, fromW + (nextW - fromW) * progress);
        const curH = Math.max(4, fromH + (nextH - fromH) * progress);
        state!.x = curX;
        state!.y = curY;
        state!.width = curW;
        state!.height = curH;
        applyGliderFrame(glider, curX, curY, curW, curH, options);
      },
      onComplete: () => {
        if (stopped) return;
        state!.x = nextX;
        state!.y = nextY;
        state!.width = nextW;
        state!.height = nextH;
        state!.activeStop = null;
        applyGliderFrame(glider, nextX, nextY, nextW, nextH, options);
        resolveFinished();
      },
    });

    const stop = () => {
      if (stopped) return;
      stopped = true;
      state!.activeStop = null;
      controls.stop();
      resolveFinished();
    };
    state.activeStop = stop;
    return { stop, finished };
  } catch {
    applyGliderFrame(glider, nextX, nextY, nextW, nextH, {
      ...options,
      opacity: targetOpacity,
    });
    state.x = nextX;
    state.y = nextY;
    state.width = nextW;
    state.height = nextH;
    state.initialized = true;
    resolveFinished();
    return NOOP_HANDLE;
  }
}

/**
 * Animates a 3D Xuan-paper modal overlay + card (`slip` rotateX unfurl or `folio` rotateY book-page flip)
 * using compositor-only `transform` and `opacity` springs.
 */
export function animatePaperModal(
  overlay: HTMLElement | null | undefined,
  card: HTMLElement | null | undefined,
  mode: 'open' | 'close',
  options: AnimatePaperModalOptions = {}
): MotionHandle {
  const targetCard = card || overlay;
  if (!overlay || !targetCard) {
    options.onComplete?.();
    return NOOP_HANDLE;
  }

  elementHandles.get(overlay)?.();
  if (card) elementHandles.get(card)?.();

  const variant = options.variant ?? 'slip';
  const immediate = Boolean(options.immediate) || !canRunMotionFrames(targetCard);

  if (immediate) {
    overlay.style.opacity = '';
    if (card) {
      card.style.opacity = '';
      card.style.transform = '';
    }
    options.onComplete?.();
    return NOOP_HANDLE;
  }

  const closedTransform =
    variant === 'folio'
      ? 'perspective(1200px) rotateY(-14deg) rotateX(3deg) translate3d(-12px, 14px, 0px) scale(0.95)'
      : 'perspective(1100px) translate3d(0px, 18px, 0px) scale(0.955) rotateX(5.5deg)';
  const closeExitTransform =
    variant === 'folio'
      ? 'perspective(1200px) rotateY(-10deg) rotateX(2deg) translate3d(-8px, 10px, 0px) scale(0.968)'
      : 'perspective(1100px) translate3d(0px, 14px, 0px) scale(0.968) rotateX(4.2deg)';
  const openTransform =
    variant === 'folio'
      ? 'perspective(1200px) rotateY(0deg) rotateX(0deg) translate3d(0px, 0px, 0px) scale(1)'
      : 'perspective(1100px) translate3d(0px, 0px, 0px) scale(1) rotateX(0deg)';

  let done = false;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const cleanInline = () => {
    overlay.style.opacity = '';
    overlay.style.transition = '';
    if (card) {
      card.style.opacity = '';
      card.style.transform = '';
      card.style.transition = '';
    }
  };

  const finishOnce = (invokeCallback: boolean) => {
    if (done) return;
    done = true;
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    elementHandles.delete(overlay);
    if (card) elementHandles.delete(card);
    cleanInline();
    if (invokeCallback) options.onComplete?.();
    resolveFinished();
  };

  try {
    overlay.style.transition = 'none';
    if (card) card.style.transition = 'none';

    const closeDur = options.closeDurationSec ?? 0.24;
    const overlayCtrl =
      mode === 'open'
        ? animate(overlay, { opacity: [0, 1] }, { duration: 0.22, ease: [0.22, 1, 0.36, 1] })
        : animate(overlay, { opacity: [1, 0] }, { duration: closeDur, ease: [0.32, 0, 0.2, 1] });

    const cardCtrl = card
      ? mode === 'open'
        ? animate(
            card,
            {
              opacity: [0, 1],
              transform: [closedTransform, openTransform],
            },
            {
              type: spring,
              stiffness: options.stiffness ?? (variant === 'folio' ? 360 : 395),
              damping: options.damping ?? (variant === 'folio' ? 30 : 32),
              mass: options.mass ?? 0.78,
            }
          )
        : animate(
            card,
            {
              opacity: [1, 0],
              transform: [openTransform, closeExitTransform],
            },
            {
              duration: closeDur,
              ease: [0.32, 0, 0.2, 1],
            }
          )
      : null;

    const targetPromise = cardCtrl ? Promise.all([overlayCtrl.finished, cardCtrl.finished]) : overlayCtrl.finished;
    void targetPromise.then(
      () => finishOnce(true),
      () => finishOnce(true)
    );

    safetyTimer = setTimeout(() => finishOnce(true), mode === 'open' ? 680 : Math.round(closeDur * 1000) + 120);

    const stop = () => {
      overlayCtrl.stop();
      cardCtrl?.stop();
      finishOnce(false);
    };
    elementHandles.set(overlay, stop);
    if (card) elementHandles.set(card, stop);
    return { stop, finished };
  } catch {
    finishOnce(true);
    return NOOP_HANDLE;
  }
}

/**
 * Reveals or retracts a floating Xuan-paper popover / ink-strip drawer using compositor `transform`,
 * `opacity`, and optional transient `clipPath` (cleared immediately upon rest so no mask layer persists).
 */
export function animateInkPopover(
  panel: HTMLElement | null | undefined,
  mode: 'open' | 'close',
  options: AnimateInkPopoverOptions = {}
): MotionHandle {
  if (!panel) {
    options.onComplete?.();
    return NOOP_HANDLE;
  }

  elementHandles.get(panel)?.();

  const immediate = Boolean(options.immediate) || !canRunMotionFrames(panel);
  if (immediate) {
    panel.style.opacity = '';
    panel.style.transform = '';
    panel.style.clipPath = '';
    options.onComplete?.();
    return NOOP_HANDLE;
  }

  const offsetY = options.offsetY ?? -8;
  const radius = options.radiusPx ?? 14;
  const useClip = options.useClipPath !== false;

  let done = false;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const settle = (invokeCallback: boolean) => {
    if (done) return;
    done = true;
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    elementHandles.delete(panel);
    panel.style.opacity = '';
    panel.style.transform = '';
    panel.style.clipPath = '';
    panel.style.transition = '';
    if (invokeCallback) options.onComplete?.();
    resolveFinished();
  };

  try {
    panel.style.transition = 'none';
    const keyframes: Record<string, string[] | number[]> =
      mode === 'open'
        ? {
            opacity: [0, 1],
            transform: [`translate3d(0px, ${offsetY}px, 0px) scale(0.96)`, 'translate3d(0px, 0px, 0px) scale(1)'],
            ...(useClip
              ? { clipPath: [`inset(0% 0% 14% 0% round ${radius}px)`, `inset(0% 0% 0% 0% round ${radius}px)`] }
              : {}),
          }
        : {
            opacity: [1, 0],
            transform: ['translate3d(0px, 0px, 0px) scale(1)', `translate3d(0px, ${offsetY * 0.75}px, 0px) scale(0.965)`],
          };

    const ctrl =
      mode === 'open'
        ? animate(panel, keyframes, {
            type: spring,
            stiffness: options.stiffness ?? 480,
            damping: options.damping ?? 34,
            mass: options.mass ?? 0.66,
          })
        : animate(panel, keyframes, {
            duration: 0.18,
            ease: [0.32, 0, 0.2, 1],
          });

    void ctrl.finished.then(
      () => settle(true),
      () => settle(true)
    );
    safetyTimer = setTimeout(() => settle(true), mode === 'open' ? 560 : 260);

    const stop = () => {
      ctrl.stop();
      settle(false);
    };
    elementHandles.set(panel, stop);
    return { stop, finished };
  } catch {
    settle(true);
    return NOOP_HANDLE;
  }
}

/**
 * Smoothly counts an element's textContent from its previous value (or `options.from`) to `targetValue`
 * using `motion`'s `animate()`, only touching DOM text when the formatted string changes.
 */
export function animateCountValue(
  el: HTMLElement | null | undefined,
  targetValue: number,
  options: AnimateCountValueOptions = {}
): MotionHandle {
  if (!el) {
    options.onComplete?.();
    return NOOP_HANDLE;
  }

  counterHandles.get(el)?.();

  const safeTarget = Number.isFinite(targetValue) ? targetValue : 0;
  const format = options.formatter ?? ((v: number) => String(Math.round(v)));
  const finalText = format(safeTarget);

  const parsedCurrent = Number.parseFloat((el.textContent || '').replace(/[^\d.-]/g, ''));
  const fromVal =
    typeof options.from === 'number' && Number.isFinite(options.from)
      ? options.from
      : Number.isFinite(parsedCurrent)
        ? parsedCurrent
        : 0;

  if (
    Boolean(options.immediate) ||
    !canRunMotionFrames(el) ||
    Math.abs(safeTarget - fromVal) < 0.01
  ) {
    if (el.textContent !== finalText) el.textContent = finalText;
    options.onComplete?.();
    return NOOP_HANDLE;
  }

  let done = false;
  let prevRendered = el.textContent || '';
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const durationSec = options.durationSec ?? 0.46;

  const commitFinal = (invokeCallback: boolean) => {
    if (done) return;
    done = true;
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    counterHandles.delete(el);
    if (el.textContent !== finalText) {
      el.textContent = finalText;
    }
    if (invokeCallback) options.onComplete?.();
    resolveFinished();
  };

  try {
    const ctrl = animate(fromVal, safeTarget, {
      duration: durationSec,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest: number) => {
        if (done) return;
        const nextStr = format(latest);
        if (nextStr !== prevRendered) {
          el.textContent = nextStr;
          prevRendered = nextStr;
        }
      },
      onComplete: () => commitFinal(true),
    });

    safetyTimer = setTimeout(() => commitFinal(true), Math.round(durationSec * 1000) + 140);

    const stop = () => {
      ctrl.stop();
      commitFinal(false);
    };
    counterHandles.set(el, stop);
    return { stop, finished };
  } catch {
    commitFinal(true);
    return NOOP_HANDLE;
  }
}
