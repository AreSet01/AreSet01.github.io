/**
 * companionSplit.ts — 笔记 × 墨问 并排布局的纯数学与状态换算
 *
 * 抽出来的原因：分隔条拖拽、键盘微调、比例持久化这三处都在做同一套
 * 「视口 → 比例 → 合法区间」的换算，单独成模块后可以被 Node 直接单测，
 * 不必把整段 DOM 逻辑塞进测试环境。
 */

/** 与 global.css 中 #companion-splitter 的宽度保持一致 */
export const SPLITTER_WIDTH = 14;

/** 任一侧都不允许被挤到看不清 */
export const SPLIT_RATIO_MIN = 0.26;
export const SPLIT_RATIO_MAX = 0.74;

/** 最宽的布局模式 */
export const COMPANION_WIDE_BREAKPOINT = 1500;
export const COMPANION_DESKTOP_BREAKPOINT = 1024;

export function clampSplitRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, value));
}

/** 指针横坐标 → 左侧面板（墨问）占可用宽度的比例；支持外侧留白画框边距 framePad */
export function ratioFromPointer(
  clientX: number,
  viewportWidth: number,
  splitterWidth: number = SPLITTER_WIDTH,
  framePad: number = 0
): number {
  const usable = Math.max(1, viewportWidth - framePad * 2 - splitterWidth);
  return clampSplitRatio((clientX - framePad - splitterWidth / 2) / usable);
}

/** 键盘方向键微调，步长默认 2% */
export function nudgeSplitRatio(current: number, delta: number): number {
  return clampSplitRatio(current + delta);
}

/** 单侧面板可用的最小像素宽度（头部按钮 + 正文至少要放得下） */
export const SPLIT_MIN_PANEL_PX = 320;

/**
 * 按视口宽度换算出「不允许再窄」的比例下限。
 * 纯百分比下限在 1024px 宽时只有 262px，两个头部都会挤成一条缝，
 * 所以宽屏用 26%，窄屏按 320px 反推。
 */
export function minSplitRatioForViewport(
  viewportWidth: number,
  minPanelPx: number = SPLIT_MIN_PANEL_PX
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= minPanelPx * 2) return SPLIT_RATIO_MIN;
  const usable = Math.max(1, viewportWidth - SPLITTER_WIDTH);
  return Math.min(0.5, Math.max(SPLIT_RATIO_MIN, minPanelPx / usable));
}

/** 按视口宽度换算出比例上限（与下限对称） */
export function maxSplitRatioForViewport(
  viewportWidth: number,
  minPanelPx: number = SPLIT_MIN_PANEL_PX
): number {
  return 1 - minSplitRatioForViewport(viewportWidth, minPanelPx);
}

/** 从 localStorage 读回上次的比例，脏数据要能安全退化 */
export function parseStoredRatio(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null;
  return clampSplitRatio(parsed);
}

/** 写进 CSS 变量 --companion-split 的值（必须是无单位数字） */
export function splitRatioCssValue(ratio: number): string {
  return String(clampSplitRatio(ratio));
}

/** 视口宽度 → 并排是否可用（桌面才有并排，窄桌面 / 手机退化为单面板） */
export function splitCapability(viewportWidth: number): {
  desktop: boolean;
  split: boolean;
  autoSplitOnRail: boolean;
} {
  const desktop = viewportWidth >= COMPANION_DESKTOP_BREAKPOINT;
  return {
    desktop,
    split: desktop,
    // 浮岛并排放不下两份宽度时，自动升级成并排全屏
    autoSplitOnRail: desktop && viewportWidth < COMPANION_WIDE_BREAKPOINT,
  };
}
