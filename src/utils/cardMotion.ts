import gsap from 'gsap';
import CustomEase from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

// 3D 纸笺落案曲线：
// - card-enter：执笺递入槽位后带 1.5% 极微触案沉实感，俯仰与偏角同步流畅贴平案面
// - card-exit：筛选切换时轻巧掀离案面
CustomEase.create('card-enter', 'M0,0 C0.16,0.88 0.28,1.015 1,1');
CustomEase.create('card-exit', 'M0,0 C0.38,0 0.2,1 1,1');

export const CARD_MOTION = {
  enterDuration: 0.62,
  enterDurationReplay: 0.44,
  enterOpacityDuration: 0.24,
  enterOpacityDurationReplay: 0.19,
  enterDistance: 44,
  enterDistanceReplay: 24,
  enterScale: 0.918,
  enterScaleReplay: 0.958,
  enterRotateX: 16,
  enterRotateXReplay: 9,
  enterPerspective: 960,
  enterStagger: 0.06,
  enterStaggerMid: 0.036,
  enterStaggerTail: 0.018,
  enterStaggerCap: 0.56,
  exitDuration: 0.24,
  exitDistance: -15,
  exitScale: 0.958,
  exitRotateX: -6.5,
  exitStagger: 0.022,
  exitStaggerCap: 0.14,
} as const;

export const PAPER_TILT_CONFIG = {
  maxTilt: 5.2,
  liftY: -4,
  perspective: 1000,
  hoverFollowRate: 15,
  springStiffness: 185,
  springDamping: 17.5,
  sheenFadeRate: 9.5,
  restAngleEpsilon: 0.003,
  restVelocityEpsilon: 0.012,
  restLiftEpsilon: 0.02,
} as const;

const PAPER_YAW_ANGLES = [-1.55, 1.35, -1.1, 1.6, -1.28, 1.18] as const;
const WIDE_PANEL_SELECTOR =
  '.stats-hero, .stats-kpis, .chart-card, .stats-table, [id*="empty-state"], .empty-state';
const MAX_AIRBORNE_SHADOW_CARDS = 12;

const WAAPI_ENTER_EASE = 'cubic-bezier(0.16, 0.88, 0.28, 1.015)';
const WAAPI_OPACITY_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const WAAPI_EXIT_EASE = 'cubic-bezier(0.38, 0, 0.2, 1)';
const activeWaapiMap = new WeakMap<Element, Animation[]>();
const waapiPoseMap = new WeakMap<Element, CardPoseSpec>();

function formatCardStartTransform(pose: CardPoseSpec): string {
  return (
    `perspective(${CARD_MOTION.enterPerspective}px) translate3d(0px, ${pose.dirSign * pose.dist}px, 0px) ` +
    `scale(${pose.scale}) rotateX(${pose.dirSign * pose.rotXMag}deg) rotate(${pose.rotZ}deg)`
  );
}

export type CardMotionTarget = gsap.TweenTarget;
export type CardScrollDirection = -1 | 0 | 1;

interface CardPoseSpec {
  isPanel: boolean;
  dist: number;
  scale: number;
  rotXMag: number;
  rotZ: number;
  dirSign: 1 | -1;
}

export interface PaperCardSpringState {
  isHovered: boolean;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  rectValid: boolean;
  pointerX: number;
  pointerY: number;
  rotX: number;
  rotY: number;
  velRotX: number;
  velRotY: number;
  liftY: number;
  velLiftY: number;
  sheenX: number;
  sheenY: number;
  sheenAlpha: number;
}

function registerWaapi(el: Element, anim: Animation) {
  let list = activeWaapiMap.get(el);
  if (!list) {
    list = [];
    activeWaapiMap.set(el, list);
  }
  list.push(anim);
}

function cancelElementWaapi(el: Element) {
  const list = activeWaapiMap.get(el);
  if (!list) return;
  activeWaapiMap.delete(el);
  for (const anim of list) {
    try {
      anim.cancel();
    } catch {}
  }
}

function canUseWaapi(elements: Element[]): boolean {
  if (elements.length === 0) return false;
  if (typeof window !== 'undefined' && (window as any).__forceGsapCardMotion) return false;
  return typeof (elements[0] as HTMLElement).animate === 'function';
}

/**
 * 渐进阻尼斜向波浪错峰：
 * 首屏前 6 张保持清晰的 60ms 逐张节奏，中段收窄至 36ms，长列表尾段 18ms 在 0.56s 封顶，
 * 避免大量并发 3D 合成图层堆积造成掉帧。
 */
export function cardEnterDelay(index: number): number {
  const i = Math.max(0, index);
  if (i <= 6) return i * CARD_MOTION.enterStagger;
  if (i <= 14) return 6 * CARD_MOTION.enterStagger + (i - 6) * CARD_MOTION.enterStaggerMid;
  const raw =
    6 * CARD_MOTION.enterStagger +
    8 * CARD_MOTION.enterStaggerMid +
    (i - 14) * CARD_MOTION.enterStaggerTail;
  return Math.min(raw, CARD_MOTION.enterStaggerCap);
}

export function cardExitDelay(index: number): number {
  return Math.min(Math.max(0, index) * CARD_MOTION.exitStagger, CARD_MOTION.exitStaggerCap);
}

export function cardExitDuration(count: number): number {
  return count > 0 ? CARD_MOTION.exitDuration + cardExitDelay(count - 1) : 0;
}

/** 识别大尺寸通栏图表或空状态面板：先走零重排选择器判断，仅必要时在只读阶段读取宽度。 */
function isWidePanelTarget(el: Element, knownWidth?: number): boolean {
  if (el.matches?.(WIDE_PANEL_SELECTOR)) {
    return true;
  }
  if (typeof knownWidth === 'number') {
    return knownWidth > 680;
  }
  return el instanceof HTMLElement && el.offsetWidth > 680;
}

function paperYawForIndex(index: number, replay: boolean): number {
  const base = PAPER_YAW_ANGLES[Math.abs(index) % PAPER_YAW_ANGLES.length];
  return replay ? Number((base * 0.5).toFixed(2)) : base;
}

function computePoseSpec(
  isPanel: boolean,
  idxWithOffset: number,
  replay: boolean,
  direction: CardScrollDirection,
): CardPoseSpec {
  const baseDist = replay ? CARD_MOTION.enterDistanceReplay : CARD_MOTION.enterDistance;
  const dirSign: 1 | -1 = direction === -1 ? -1 : 1;
  const dist = isPanel ? Math.round(baseDist * 0.62) : baseDist;
  const scale = isPanel
    ? replay
      ? 0.982
      : 0.968
    : replay
      ? CARD_MOTION.enterScaleReplay
      : CARD_MOTION.enterScale;
  const rotXMag = isPanel
    ? replay
      ? 4
      : 7
    : replay
      ? CARD_MOTION.enterRotateXReplay
      : CARD_MOTION.enterRotateX;
  const rotZ = isPanel ? 0 : paperYawForIndex(idxWithOffset, replay);
  return { isPanel, dist, scale, rotXMag, rotZ, dirSign };
}

/**
 * 将多列瀑布流/网格卡片按真实屏幕坐标排成「左上 → 右下」斜向波浪序（向上回滚时为「左下 → 右上」），
 * 解决纵向 .masonry-col 按 DOM 列序触发导致“第 1 列底部比第 1 排中间先出”的反直觉问题。
 */
export function resolveDiagonalCardOrder(
  target: CardMotionTarget,
  direction: CardScrollDirection = 0,
): Element[] {
  const arr = gsap.utils.toArray<Element>(target).filter((el): el is Element => el instanceof Element);
  if (arr.length <= 1) return arr;

  const measured = arr.map((el, idx) => {
    const rect = el.getBoundingClientRect();
    const curY = (el as any)._gsap ? (Number(gsap.getProperty(el, 'y')) || 0) : 0;
    const naturalTop = rect.top - curY;
    const naturalLeft = rect.left;
    const hasLayout =
      rect.width > 0 || rect.height > 0 || naturalTop !== 0 || naturalLeft !== 0;
    const verticalScore = direction === -1 ? -naturalTop : naturalTop;
    const score = verticalScore + naturalLeft * 0.48;
    return { el, idx, score, hasLayout };
  });

  if (!measured.some((m) => m.hasLayout)) {
    return arr;
  }

  measured.sort((a, b) => a.score - b.score || a.idx - b.idx);
  return measured.map((m) => m.el);
}

/**
 * 预置「3D 纸笺落案（执笺递上贴平）」初始姿态：
 * 先集中完成所有几何/尺寸只读测量，再统一批量写入内联变换，彻底杜绝强制同步重排（Layout Thrashing）。
 */
export function setCardEnterState(
  target: CardMotionTarget,
  {
    replay = false,
    direction = 0,
    indexOffset = 0,
    preOrdered = false,
    knownPanel,
  }: {
    replay?: boolean;
    direction?: CardScrollDirection;
    indexOffset?: number;
    preOrdered?: boolean;
    knownPanel?: boolean;
  } = {},
) {
  const rawList = gsap.utils.toArray<Element>(target).filter((el): el is Element => el instanceof Element);
  if (rawList.length === 0) return;

  const elements = preOrdered || rawList.length <= 1
    ? rawList
    : resolveDiagonalCardOrder(rawList, direction);

  const panelFlags = elements.map((el) =>
    typeof knownPanel === 'boolean' ? knownPanel : isWidePanelTarget(el)
  );

  const useWaapi = canUseWaapi(elements);

  elements.forEach((el, idx) => {
    cancelElementWaapi(el);
    const pose = computePoseSpec(panelFlags[idx], idx + indexOffset, replay, direction);

    if (
      el instanceof HTMLElement &&
      !pose.isPanel &&
      !replay &&
      idx + indexOffset < MAX_AIRBORNE_SHADOW_CARDS
    ) {
      el.dataset.cardAirborne = 'true';
    }

    if (useWaapi && el instanceof HTMLElement) {
      waapiPoseMap.set(el, pose);
      el.style.willChange = 'transform, opacity';
      el.style.opacity = '0';
      el.style.transformOrigin = direction === -1 ? '50% 82%' : '50% 18%';
      el.style.transform = formatCardStartTransform(pose);
      return;
    }

    gsap.set(el, {
      opacity: 0,
      x: 0,
      y: pose.dirSign * pose.dist,
      scale: pose.scale,
      rotateX: pose.dirSign * pose.rotXMag,
      rotation: pose.rotZ,
      transformPerspective: CARD_MOTION.enterPerspective,
      transformOrigin: direction === -1 ? '50% 82%' : '50% 18%',
    });
  });
}

function readPoseFromElement(el: Element, idx: number, replay: boolean, direction: CardScrollDirection, isPanel: boolean): CardPoseSpec {
  const cached = waapiPoseMap.get(el);
  if (cached && cached.isPanel === isPanel) return cached;
  const fallback = computePoseSpec(isPanel, idx, replay, direction);
  if (!(el as any)._gsap) return fallback;
  const inlineY = parseFloat(String(gsap.getProperty(el, 'y')));
  const inlineScale = parseFloat(String(gsap.getProperty(el, 'scaleX')));
  const inlineRotX = parseFloat(String(gsap.getProperty(el, 'rotateX')));
  const inlineRotZ = parseFloat(String(gsap.getProperty(el, 'rotation')));
  return {
    isPanel,
    dist: Number.isFinite(inlineY) && inlineY !== 0 ? Math.abs(inlineY) : fallback.dist,
    dirSign: Number.isFinite(inlineY) && inlineY !== 0 ? (inlineY < 0 ? -1 : 1) : fallback.dirSign,
    scale: Number.isFinite(inlineScale) && inlineScale > 0 && inlineScale < 1 ? inlineScale : fallback.scale,
    rotXMag: Number.isFinite(inlineRotX) && inlineRotX !== 0 ? Math.abs(inlineRotX) : fallback.rotXMag,
    rotZ: Number.isFinite(inlineRotZ) && inlineRotZ !== 0 ? inlineRotZ : fallback.rotZ,
  };
}

/**
 * 将「3D 纸笺落案」编排挂入时间线：
 * - 真实浏览器优先走 GPU Compositor 线程的 Web Animations API (el.animate)，
 *   实现 0 主线程逐帧样式重算与 0 GSAP matrix3d 字符串序列化；
 * - JSDOM 等无 el.animate 环境自动回退为精简单通道 GSAP 补间，保证测试行为完全一致。
 */
export function addCardEnter(
  timeline: gsap.core.Timeline,
  target: CardMotionTarget,
  at: number | string = 0,
  {
    replay = false,
    direction = 0,
    preOrdered = false,
    knownPanel,
    onComplete,
  }: {
    replay?: boolean;
    direction?: CardScrollDirection;
    preOrdered?: boolean;
    knownPanel?: boolean;
    onComplete?: () => void;
  } = {},
): number {
  const rawList = gsap.utils.toArray<Element>(target).filter((el): el is Element => el instanceof Element);
  if (rawList.length === 0) {
    onComplete?.();
    return 0;
  }

  const elements = preOrdered || rawList.length <= 1
    ? rawList
    : resolveDiagonalCardOrder(rawList, direction);

  const moveDuration = replay
    ? CARD_MOTION.enterDurationReplay
    : CARD_MOTION.enterDuration;
  const opacityDuration = replay
    ? CARD_MOTION.enterOpacityDurationReplay
    : CARD_MOTION.enterOpacityDuration;

  if (canUseWaapi(elements)) {
    const baseAt = typeof at === 'number' ? Math.max(0, at) : 0;
    const maxStagger = elements.length > 0 ? cardEnterDelay(elements.length - 1) : 0;
    const totalSpan = moveDuration + maxStagger;
    const ts = timeline.timeScale() || 1;
    const needsDeferredLaunch =
      elements.some((el) => el.classList.contains('is-filtered-out')) ||
      (baseAt > 0.001 &&
        elements.some((el) => !waapiPoseMap.has(el) && !el.classList.contains('is-entering')));
    const tlDelayOffset = !needsDeferredLaunch && timeline.totalTime() < 0.001 ? timeline.delay() : 0;

    const panelFlags = elements.map((el) =>
      typeof knownPanel === 'boolean' ? knownPanel : isWidePanelTarget(el)
    );

    const launchBatchWaapi = (includeBaseOffset: boolean) => {
      let remaining = elements.length;
      const doneOne = () => {
        remaining -= 1;
        if (remaining <= 0) {
          onComplete?.();
        }
      };

      elements.forEach((el, idx) => {
        const pose = readPoseFromElement(el, idx, replay, direction, panelFlags[idx]);
        cancelElementWaapi(el);

        const delaySec = cardEnterDelay(idx) + (includeBaseOffset ? baseAt + tlDelayOffset : 0);
        const delayMs = Math.max(0, (delaySec * 1000) / ts);
        const moveMs = (moveDuration * 1000) / ts;
        const opacityMs = (opacityDuration * 1000) / ts;
        const startTransform = formatCardStartTransform(pose);
        const endTransform =
          `perspective(${CARD_MOTION.enterPerspective}px) translate3d(0px, 0px, 0px) scale(1) rotateX(0deg) rotate(0deg)`;

        if (el instanceof HTMLElement) {
          el.style.willChange = 'transform, opacity';
          el.style.transformOrigin = direction === -1 ? '50% 82%' : '50% 18%';
        }

        const opacityAnim = (el as HTMLElement).animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: opacityMs, delay: delayMs, easing: WAAPI_OPACITY_EASE, fill: 'both' },
        );
        const transformAnim = (el as HTMLElement).animate(
          [{ transform: startTransform }, { transform: endTransform }],
          { duration: moveMs, delay: delayMs, easing: WAAPI_ENTER_EASE, fill: 'both' },
        );

        let cancelled = false;
        registerWaapi(el, opacityAnim);
        registerWaapi(el, transformAnim);

        opacityAnim.onfinish = () => {
          if (!cancelled && el instanceof HTMLElement && el.isConnected) {
            delete el.dataset.cardAirborne;
          }
        };
        transformAnim.oncancel = () => {
          cancelled = true;
        };
        transformAnim.onfinish = () => {
          if (cancelled) return;
          waapiPoseMap.delete(el);
          if (el instanceof HTMLElement) {
            delete el.dataset.cardAirborne;
            el.style.opacity = '';
            el.style.transform = '';
            el.style.transformOrigin = '';
            el.style.willChange = '';
          }
          if ((el as any)._gsap) {
            gsap.set(el, {
              clearProps:
                'clipPath,opacity,transform,scale,x,y,rotation,rotateX,rotateY,transformPerspective,filter,transformOrigin,willChange',
            });
          }
          cancelElementWaapi(el);
          doneOne();
        };
      });
    };

    if (needsDeferredLaunch) {
      timeline.call(() => launchBatchWaapi(false), undefined, at);
    } else {
      launchBatchWaapi(true);
    }

    // 用零开销空白标记撑起 GSAP 时间轴总时长，使外部 timeline.onComplete 严格对齐动画落定时刻
    timeline.set({}, {}, baseAt + totalSpan);
    return moveDuration;
  }

  timeline.to(
    elements,
    {
      opacity: 1,
      duration: opacityDuration,
      ease: 'power2.out',
      stagger: cardEnterDelay,
    },
    at,
  );

  const baseAt = typeof at === 'number' ? at : 0;
  elements.forEach((el, idx) => {
    if (el instanceof HTMLElement && el.dataset.cardAirborne === 'true') {
      const shadowDropAt = baseAt + cardEnterDelay(idx) + 0.18;
      timeline.call(
        () => {
          if (el.isConnected) delete el.dataset.cardAirborne;
        },
        undefined,
        shadowDropAt,
      );
    }
  });

  timeline.to(
    elements,
    {
      x: 0,
      y: 0,
      scale: 1,
      rotateX: 0,
      rotation: 0,
      duration: moveDuration,
      ease: 'card-enter',
      stagger: cardEnterDelay,
      onComplete: () => {
        elements.forEach((el) => {
          if (el instanceof HTMLElement) {
            delete el.dataset.cardAirborne;
            el.style.willChange = '';
          }
        });
        onComplete?.();
      },
    },
    at,
  );

  return moveDuration;
}

export function animateCardEnter(
  target: CardMotionTarget,
  {
    delay = 0,
    replay = false,
    direction = 0,
    onComplete,
  }: {
    delay?: number;
    replay?: boolean;
    direction?: CardScrollDirection;
    onComplete?: () => void;
  } = {},
): gsap.core.Timeline {
  const ordered = resolveDiagonalCardOrder(target, direction);
  const timeline = gsap.timeline();
  if (ordered.length === 0) {
    onComplete?.();
    return timeline;
  }
  const panelFlags = ordered.map((el) => isWidePanelTarget(el));
  setCardEnterState(ordered, { replay, direction, preOrdered: true, knownPanel: panelFlags.every(Boolean) ? true : panelFlags.some(Boolean) ? undefined : false });
  addCardEnter(timeline, ordered, delay, {
    replay,
    direction,
    preOrdered: true,
    knownPanel: panelFlags.every(Boolean) ? true : panelFlags.some(Boolean) ? undefined : false,
    onComplete,
  });
  return timeline;
}

export function addCardExit(
  timeline: gsap.core.Timeline,
  target: CardMotionTarget,
  at: number | string = 0,
): number {
  const elements = resolveDiagonalCardOrder(target, 0);
  if (elements.length === 0) return 0;

  if (canUseWaapi(elements)) {
    const baseAt = typeof at === 'number' ? Math.max(0, at) : 0;
    const ts = timeline.timeScale() || 1;
    const exitMs = (CARD_MOTION.exitDuration * 1000) / ts;
    const startT = `perspective(${CARD_MOTION.enterPerspective}px) translate3d(0px, 0px, 0px) scale(1) rotateX(0deg)`;
    const endT = `perspective(${CARD_MOTION.enterPerspective}px) translate3d(0px, ${CARD_MOTION.exitDistance}px, 0px) scale(${CARD_MOTION.exitScale}) rotateX(${CARD_MOTION.exitRotateX}deg)`;

    const runExit = (includeBase: boolean) => {
      elements.forEach((el, idx) => {
        cancelElementWaapi(el);
        waapiPoseMap.delete(el);
        if ((el as any)._gsap) gsap.killTweensOf(el);
        if (el instanceof HTMLElement) {
          delete el.dataset.cardAirborne;
          el.style.willChange = 'transform, opacity';
          el.style.transformOrigin = '50% 20%';
        }
        const delayMs = ((cardExitDelay(idx) + (includeBase ? baseAt : 0)) * 1000) / ts;
        const anim = (el as HTMLElement).animate(
          [
            { opacity: 1, transform: startT },
            { opacity: 0, transform: endT },
          ],
          { duration: exitMs, delay: delayMs, easing: WAAPI_EXIT_EASE, fill: 'forwards' },
        );
        registerWaapi(el, anim);
      });
    };

    if (baseAt > 0.02) {
      timeline.call(() => runExit(false), undefined, at);
    } else {
      runExit(true);
    }

    const totalExitSpan = CARD_MOTION.exitDuration + cardExitDelay(elements.length - 1);
    timeline.set({}, {}, baseAt + totalExitSpan);
    return CARD_MOTION.exitDuration;
  }

  timeline.to(
    elements,
    {
      opacity: 0,
      y: CARD_MOTION.exitDistance,
      scale: CARD_MOTION.exitScale,
      rotateX: CARD_MOTION.exitRotateX,
      transformPerspective: CARD_MOTION.enterPerspective,
      transformOrigin: '50% 20%',
      duration: CARD_MOTION.exitDuration,
      ease: 'card-exit',
      stagger: cardExitDelay,
    },
    at,
  );
  return CARD_MOTION.exitDuration;
}

/** 释放内联三维变换、取消 WAAPI 动画与浮影标记，把控制权干净交还给悬停与 3D Tilt 系统。 */
export function clearCardMotion(target: CardMotionTarget, kill = true) {
  const elements = gsap.utils.toArray<Element>(target).filter((el): el is Element => el instanceof Element);
  let hasGsapCache = !canUseWaapi(elements);
  elements.forEach((el) => {
    if (kill) cancelElementWaapi(el);
    waapiPoseMap.delete(el);
    if (el instanceof HTMLElement) {
      delete el.dataset.cardAirborne;
      el.style.opacity = '';
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.willChange = '';
    }
    if ((el as any)._gsap) {
      hasGsapCache = true;
      if (kill) gsap.killTweensOf(el);
    }
  });
  if (hasGsapCache) {
    gsap.set(elements, {
      clearProps:
        'clipPath,opacity,transform,scale,x,y,rotation,rotateX,rotateY,transformPerspective,filter,transformOrigin,willChange',
    });
  }
}

/* =========================================================================
   3D Xuan Paper Card Physics Engine (宣纸三维受光漫反射 + 弹簧回弹阻尼)
   - Zero getBoundingClientRect() inside pointermove (cached on pointerenter,
     marked dirty passively on scroll/resize, refreshed once in rAF read pass)
   - Single shared rAF loop across all cards; auto-sleeps when all cards settle
   - Natural underdamped Xuan-paper rebound spring on pointerleave
   ========================================================================= */

export function createPaperCardSpringState(): PaperCardSpringState {
  return {
    isHovered: false,
    rectLeft: 0,
    rectTop: 0,
    rectWidth: 1,
    rectHeight: 1,
    rectValid: false,
    pointerX: 0,
    pointerY: 0,
    rotX: 0,
    rotY: 0,
    velRotX: 0,
    velRotY: 0,
    liftY: 0,
    velLiftY: 0,
    sheenX: 50,
    sheenY: 50,
    sheenAlpha: 0,
  };
}

/**
 * 帧率无关的宣纸卡片单步阻尼/弹簧积分器（支持 60Hz–240Hz 高刷屏一致性）：
 * 返回 true 表示卡片仍处于运动中需继续下一帧，false 表示已完全落定可休眠。
 */
export function stepPaperCardSpring(state: PaperCardSpringState, rawDt: number): boolean {
  const dt = Math.min(0.05, Math.max(0.001, rawDt));

  if (state.isHovered) {
    const nx = Math.max(0, Math.min(1, (state.pointerX - state.rectLeft) / Math.max(1, state.rectWidth)));
    const ny = Math.max(0, Math.min(1, (state.pointerY - state.rectTop) / Math.max(1, state.rectHeight)));

    const targetRotX = -(ny - 0.5) * 2 * PAPER_TILT_CONFIG.maxTilt;
    const targetRotY = (nx - 0.5) * 2 * PAPER_TILT_CONFIG.maxTilt;
    const targetLift = PAPER_TILT_CONFIG.liftY;
    const targetSheenX = nx * 100;
    const targetSheenY = ny * 100;

    const blend = 1 - Math.exp(-PAPER_TILT_CONFIG.hoverFollowRate * dt);
    const prevRotX = state.rotX;
    const prevRotY = state.rotY;
    const prevLift = state.liftY;

    state.rotX += (targetRotX - state.rotX) * blend;
    state.rotY += (targetRotY - state.rotY) * blend;
    state.liftY += (targetLift - state.liftY) * blend;
    state.sheenX += (targetSheenX - state.sheenX) * blend;
    state.sheenY += (targetSheenY - state.sheenY) * blend;
    state.sheenAlpha += (1 - state.sheenAlpha) * (1 - Math.exp(-11 * dt));

    // 保留平滑角速度，令手指/指针移出瞬间衔接自然纸张回弹惯性
    state.velRotX = (state.rotX - prevRotX) / dt * 0.35;
    state.velRotY = (state.rotY - prevRotY) / dt * 0.35;
    state.velLiftY = (state.liftY - prevLift) / dt * 0.35;
    return true;
  }

  // 移出卡片：欠阻尼宣纸轻弹落案物理（sub-step 2 次确保高刚度弹簧在低帧率下依然绝对稳定）
  const subDt = dt * 0.5;
  const k = PAPER_TILT_CONFIG.springStiffness;
  const c = PAPER_TILT_CONFIG.springDamping;

  for (let s = 0; s < 2; s += 1) {
    const ax = -k * state.rotX - c * state.velRotX;
    const ay = -k * state.rotY - c * state.velRotY;
    const al = -k * state.liftY - c * state.velLiftY;

    state.velRotX += ax * subDt;
    state.velRotY += ay * subDt;
    state.velLiftY += al * subDt;

    state.rotX += state.velRotX * subDt;
    state.rotY += state.velRotY * subDt;
    state.liftY += state.velLiftY * subDt;
  }

  state.sheenAlpha *= Math.exp(-PAPER_TILT_CONFIG.sheenFadeRate * dt);

  const settled =
    Math.abs(state.rotX) < PAPER_TILT_CONFIG.restAngleEpsilon &&
    Math.abs(state.rotY) < PAPER_TILT_CONFIG.restAngleEpsilon &&
    Math.abs(state.velRotX) < PAPER_TILT_CONFIG.restVelocityEpsilon &&
    Math.abs(state.velRotY) < PAPER_TILT_CONFIG.restVelocityEpsilon &&
    Math.abs(state.liftY) < PAPER_TILT_CONFIG.restLiftEpsilon &&
    state.sheenAlpha < 0.008;

  if (settled) {
    state.rotX = 0;
    state.rotY = 0;
    state.velRotX = 0;
    state.velRotY = 0;
    state.liftY = 0;
    state.velLiftY = 0;
    state.sheenAlpha = 0;
    return false;
  }

  return true;
}

const PAPER_CLEANUP_KEY = '__areSetPaperTiltCleanup__';
const PAPER_LISTENER_KEY = '__areSetPaperTiltBound__';
const DEFAULT_PAPER_SELECTOR =
  '[data-paper-card], .note-card[data-tilt], .timeline-card[data-tilt], .about-tilt[data-tilt]';

function isCardEntranceBusy(card: HTMLElement): boolean {
  if (card.classList.contains('is-entering') || card.classList.contains('is-reflowing')) {
    return true;
  }
  if (card.dataset.cardAirborne === 'true') {
    return true;
  }
  const host = card.closest<HTMLElement>('[data-enter="card"]');
  if (host && (host.classList.contains('is-entering') || host.dataset.cardAirborne === 'true')) {
    return true;
  }
  return false;
}

export function initPaperCardPhysics(selector = DEFAULT_PAPER_SELECTOR): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const prev = (window as any)[PAPER_CLEANUP_KEY];
  if (typeof prev === 'function') prev();

  const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches ?? false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  if (!canHover || reducedMotion) {
    return () => {};
  }

  const cards = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (cards.length === 0) {
    return () => {};
  }

  const AbortCtrl = (window as any).AbortController || AbortController;
  const controller = new AbortCtrl();
  const { signal } = controller;
  const states = new Map<HTMLElement, PaperCardSpringState>();
  const activeCards = new Set<HTMLElement>();
  let rafId = 0;
  let lastStamp = 0;
  let paused = false;

  const resetCardStyles = (card: HTMLElement, state?: PaperCardSpringState) => {
    card.classList.remove('is-paper-hovered');
    card.style.transform = '';
    card.style.willChange = '';
    card.style.removeProperty('--paper-sheen-opacity');
    if (state) {
      state.isHovered = false;
      state.rectValid = false;
      state.rotX = 0;
      state.rotY = 0;
      state.velRotX = 0;
      state.velRotY = 0;
      state.liftY = 0;
      state.velLiftY = 0;
      state.sheenAlpha = 0;
    }
  };

  const tick = (now: number) => {
    rafId = 0;
    if (paused || signal.aborted || activeCards.size === 0) {
      lastStamp = 0;
      return;
    }

    const dt = lastStamp > 0 ? (now - lastStamp) / 1000 : 1 / 60;
    lastStamp = now;

    // 阶段 1（只读几何刷新）：仅对 scroll/resize 后失效的悬停卡片集中读取一次缓存，杜绝交错读写重排
    for (const card of activeCards) {
      const state = states.get(card);
      if (state && state.isHovered && !state.rectValid && card.isConnected) {
        const r = card.getBoundingClientRect();
        state.rectLeft = r.left;
        state.rectTop = r.top;
        state.rectWidth = Math.max(1, r.width);
        state.rectHeight = Math.max(1, r.height);
        state.rectValid = true;
      }
    }

    // 阶段 2（纯物理推进 + GPU 合成层批量写入）
    for (const card of Array.from(activeCards)) {
      const state = states.get(card);
      if (!state || !card.isConnected) {
        activeCards.delete(card);
        continue;
      }

      if (isCardEntranceBusy(card)) {
        activeCards.delete(card);
        resetCardStyles(card, state);
        continue;
      }

      const keepAlive = stepPaperCardSpring(state, dt);
      if (!keepAlive) {
        activeCards.delete(card);
        resetCardStyles(card, state);
        continue;
      }

      card.style.transform =
        `perspective(${PAPER_TILT_CONFIG.perspective}px) ` +
        `translate3d(0px, ${state.liftY.toFixed(2)}px, 0px) ` +
        `rotateX(${state.rotX.toFixed(3)}deg) rotateY(${state.rotY.toFixed(3)}deg)`;
      card.style.setProperty('--paper-x', `${state.sheenX.toFixed(1)}%`);
      card.style.setProperty('--paper-y', `${state.sheenY.toFixed(1)}%`);
      card.style.setProperty('--paper-sheen-opacity', state.sheenAlpha.toFixed(3));
    }

    if (activeCards.size > 0 && !signal.aborted && !paused) {
      rafId = requestAnimationFrame(tick);
    } else {
      lastStamp = 0;
    }
  };

  const ensureLoop = () => {
    if (rafId || paused || signal.aborted || activeCards.size === 0) return;
    lastStamp = 0;
    rafId = requestAnimationFrame(tick);
  };

  const invalidateCachedRects = () => {
    for (const card of activeCards) {
      const state = states.get(card);
      if (state) state.rectValid = false;
    }
  };

  window.addEventListener('scroll', invalidateCachedRects, { passive: true, signal });
  window.addEventListener('resize', invalidateCachedRects, { passive: true, signal });

  document.addEventListener(
    'visibilitychange',
    () => {
      paused = document.hidden;
      if (paused && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
        lastStamp = 0;
      } else if (!paused) {
        ensureLoop();
      }
    },
    { signal },
  );

  cards.forEach((card) => {
    // 抢先接管 __tiltActive，避免 BaseLayout 兜底脚本在每次 pointermove 重复创建 gsap.to 补间
    (card as any).__tiltActive = true;
    const state = createPaperCardSpringState();
    states.set(card, state);

    card.addEventListener(
      'pointerenter',
      (e: PointerEvent) => {
        if (isCardEntranceBusy(card)) return;
        if ((card as any)._gsap) gsap.killTweensOf(card);
        const r = card.getBoundingClientRect();
        state.rectLeft = r.left;
        state.rectTop = r.top;
        state.rectWidth = Math.max(1, r.width);
        state.rectHeight = Math.max(1, r.height);
        state.rectValid = true;
        state.pointerX = e.clientX;
        state.pointerY = e.clientY;
        state.isHovered = true;
        card.classList.add('is-paper-hovered');
        card.style.willChange = 'transform';
        activeCards.add(card);
        ensureLoop();
      },
      { signal },
    );

    // pointermove 严禁调用 getBoundingClientRect() 或直接操作样式：仅记录指针坐标，交由单一 rAF 合帧处理
    card.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (isCardEntranceBusy(card)) return;
        state.pointerX = e.clientX;
        state.pointerY = e.clientY;
        if (!state.isHovered) {
          state.isHovered = true;
          state.rectValid = false;
          card.classList.add('is-paper-hovered');
          card.style.willChange = 'transform';
        }
        activeCards.add(card);
        ensureLoop();
      },
      { signal },
    );

    const onLeave = () => {
      if (!state.isHovered && !activeCards.has(card)) return;
      state.isHovered = false;
      card.classList.remove('is-paper-hovered');
      activeCards.add(card);
      ensureLoop();
    };

    card.addEventListener('pointerleave', onLeave, { signal });
    card.addEventListener('pointercancel', onLeave, { signal });
  });

  const cleanup = () => {
    controller.abort();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    for (const [card, state] of states.entries()) {
      resetCardStyles(card, state);
      delete (card as any).__tiltActive;
    }
    activeCards.clear();
    states.clear();
    if ((window as any)[PAPER_CLEANUP_KEY] === cleanup) {
      (window as any)[PAPER_CLEANUP_KEY] = undefined;
    }
  };

  (window as any)[PAPER_CLEANUP_KEY] = cleanup;
  return cleanup;
}

export function bindGlobalPaperCardLifecycle() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  initPaperCardPhysics();
  if (!(window as any)[PAPER_LISTENER_KEY]) {
    document.addEventListener('astro:page-load', () => initPaperCardPhysics());
    document.addEventListener('astro:before-swap', () => {
      const cleanup = (window as any)[PAPER_CLEANUP_KEY];
      if (typeof cleanup === 'function') cleanup();
    });
    (window as any)[PAPER_LISTENER_KEY] = true;
  }
}
