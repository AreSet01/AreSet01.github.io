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
      baseAt > 0.02 && elements.some((el) => el.classList.contains('is-filtered-out'));
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
          }
          if ((el as any)._gsap) {
            gsap.set(el, {
              clearProps:
                'clipPath,opacity,transform,scale,x,y,rotation,rotateX,rotateY,transformPerspective,filter,transformOrigin',
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
          if (el instanceof HTMLElement) delete el.dataset.cardAirborne;
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
    }
    if ((el as any)._gsap) {
      hasGsapCache = true;
      if (kill) gsap.killTweensOf(el);
    }
  });
  if (hasGsapCache) {
    gsap.set(elements, {
      clearProps:
        'clipPath,opacity,transform,scale,x,y,rotation,rotateX,rotateY,transformPerspective,filter,transformOrigin',
    });
  }
}
