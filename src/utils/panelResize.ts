// 可缩放浮动面板的通用逻辑：Pin 对照工作台、墨问快速问卡片共用。
//
// 只做三件事：
// 1. 右下角手柄拖拽改 width / height；
// 2. 尺寸持久化到 localStorage（每台设备独立）；
// 3. 视口变化时重新 clamp，避免面板被拖出屏幕。

export interface PanelSize {
  width: number;
  height: number;
}

export interface ResizableOptions {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number | (() => number);
  maxHeight?: number | (() => number);
  storageKey?: string;
  fallback?: Partial<PanelSize>;
  fitContentHeight?: boolean;
  onChange?: (size: PanelSize) => void;
}

const readNumber = (value: number | (() => number) | undefined, fallback: number): number => {
  if (typeof value === 'function') return value();
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

export function clampPanelSize(size: PanelSize, options: ResizableOptions = {}): PanelSize {
  const minW = options.minWidth ?? 350;
  const minH = options.minHeight ?? 220;
  const maxW = Math.max(minW, readNumber(options.maxWidth, window.innerWidth - 24));
  const maxH = Math.max(minH, readNumber(options.maxHeight, window.innerHeight - 24));
  return {
    width: Math.round(Math.min(Math.max(size.width, minW), maxW)),
    height: Math.round(Math.min(Math.max(size.height, minH), maxH)),
  };
}

export function loadPanelSize(storageKey?: string): PanelSize | null {
  if (!storageKey || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed?.width) && Number.isFinite(parsed?.height)) {
      return { width: Number(parsed.width), height: Number(parsed.height) };
    }
  } catch {}
  return null;
}

export function savePanelSize(storageKey: string | undefined, size: PanelSize): void {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(size));
  } catch {}
}

export function applyPanelSize(el: HTMLElement, size: PanelSize, fitContentHeight: boolean = false): void {
  el.style.width = `${size.width}px`;
  if (fitContentHeight) {
    el.style.maxHeight = `${size.height}px`;
    el.style.height = 'auto';
  } else {
    el.style.height = `${size.height}px`;
  }
}

export interface ResizableHandle {
  getSize: () => PanelSize;
  reset: () => void;
  destroy: () => void;
}

export function makeResizable(
  el: HTMLElement,
  handle: HTMLElement,
  options: ResizableOptions = {}
): ResizableHandle {
  const storageKey = options.storageKey;
  const stored = loadPanelSize(storageKey);
  if (stored) {
    const size = clampPanelSize(stored, options);
    applyPanelSize(el, size, options.fitContentHeight);
    options.onChange?.(size);
  } else if (options.fallback) {
    const fallbackSize = clampPanelSize({
      width: options.fallback.width ?? 480,
      height: options.fallback.height ?? 540,
    }, options);
    applyPanelSize(el, fallbackSize, options.fitContentHeight);
  }

  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;
  let dragging = false;
  let pending: PanelSize | null = null;

  const currentSize = (): PanelSize => {
    const rect = el.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  };

  const apply = (size: PanelSize) => {
    const clamped = clampPanelSize(size, options);
    if (dragging) {
      el.style.width = `${clamped.width}px`;
      el.style.height = `${clamped.height}px`;
    } else {
      applyPanelSize(el, clamped, options.fitContentHeight);
    }
    options.onChange?.(clamped);
    return clamped;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    const size = currentSize();
    startW = size.width;
    startH = size.height;
    el.classList.add('is-resizing');
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {}
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    event.preventDefault();
    pending = apply({
      width: startW + (event.clientX - startX),
      height: startH + (event.clientY - startY),
    });
  };

  const finish = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-resizing');
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {}
    const size = pending ?? currentSize();
    savePanelSize(storageKey, size);
    if (options.fitContentHeight) {
      applyPanelSize(el, size, true);
    }
    pending = null;
  };

  const onDoubleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = el.getBoundingClientRect();
    const fallback = {
      width: options.fallback?.width ?? Math.min(560, window.innerWidth - 32),
      height: options.fallback?.height ?? Math.min(520, window.innerHeight - 32),
    };
    // 只在高度/宽度都恢复时清掉存储，避免用户下次打开又变回拖拽尺寸
    if (rect.width && rect.height) {
      const clamped = clampPanelSize(fallback, options);
      apply(clamped);
      savePanelSize(storageKey, clamped);
      if (options.fitContentHeight) {
        applyPanelSize(el, clamped, true);
      }
    }
  };

  const onViewportResize = () => {
    if (!el.isConnected) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    apply({ width: rect.width, height: rect.height });
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('resize', onViewportResize);

  return {
    getSize: currentSize,
    reset: () => onDoubleClick(new MouseEvent('dblclick')),
    destroy: () => {
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      handle.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('resize', onViewportResize);
    },
  };
}
