/**
 * shellStore.ts — 全局壳层声明式响应式状态 (Nanostores)
 *
 * 统一托管：
 * - theme: 'light' | 'dark' | 'moss' | 'rice'
 * - mossShade: '004D40' | '00695C' | '00796B' | '00897B' | '4DB6AC' | null
 * - font: 'pixel' | 'kai'
 * - cursorTrail: 'enabled' | 'disabled'
 * - sidebarCollapsed: boolean
 * - activeModal: string | null（追踪活跃模态层并联动 app:modal-enter / app:modal-leave）
 *
 * 与 <html data-*> 属性及 localStorage 双向同步，同时支持纯内存/JSDOM 环境测试。
 */

import { atom, batch, computed } from 'nanostores';

export type SiteTheme = 'light' | 'dark' | 'moss' | 'rice';
export type MossShadeCode = '004D40' | '00695C' | '00796B' | '00897B' | '4DB6AC';
export type MossShade = MossShadeCode | null;
export type SiteFont = 'pixel' | 'kai';
export type CursorTrailState = 'enabled' | 'disabled';

export const SHELL_VALID_THEMES: ReadonlyArray<SiteTheme> = ['light', 'dark', 'moss', 'rice'];
export const SHELL_VALID_MOSS_SHADES: ReadonlyArray<MossShadeCode> = [
  '004D40',
  '00695C',
  '00796B',
  '00897B',
  '4DB6AC',
];

export interface ShellDomEnv {
  win?: Window | null;
  doc?: Document | null;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

function resolveEnv(env?: ShellDomEnv): {
  win: Window | null;
  doc: Document | null;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
} {
  const win = env?.win !== undefined ? env.win : typeof window !== 'undefined' ? window : null;
  const doc = env?.doc !== undefined ? env.doc : typeof document !== 'undefined' ? document : null;
  let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = null;
  if (env?.storage !== undefined) {
    storage = env.storage;
  } else if (win) {
    try {
      storage = win.localStorage ?? null;
    } catch {
      storage = null;
    }
  }
  return { win, doc, storage };
}

export function isShellTheme(val: unknown): val is SiteTheme {
  return typeof val === 'string' && (SHELL_VALID_THEMES as ReadonlyArray<string>).includes(val);
}

export function normalizeMossShade(val: unknown): MossShade {
  if (typeof val !== 'string') return null;
  const clean = val.trim().replace(/^#/, '').toUpperCase();
  return (SHELL_VALID_MOSS_SHADES as ReadonlyArray<string>).includes(clean)
    ? (clean as MossShadeCode)
    : null;
}

export function normalizeShellFont(val: unknown): SiteFont {
  return val === 'kai' ? 'kai' : 'pixel';
}

// ── Reactive Nanostores Atoms ───────────────────────────────────────────────

export const theme = atom<SiteTheme>('light');
export const mossShade = atom<MossShade>(null);
export const font = atom<SiteFont>('pixel');
export const cursorTrail = atom<CursorTrailState>('enabled');
export const sidebarCollapsed = atom<boolean>(false);
export const activeModal = atom<string | null>(null);
export const openModals = atom<ReadonlyArray<string>>([]);

export const isModalOpen = computed(activeModal, (current) => current !== null);
export const isDarkSurface = computed(theme, (t) => t === 'dark' || t === 'moss');

export const shellStore = {
  theme,
  mossShade,
  font,
  cursorTrail,
  sidebarCollapsed,
  activeModal,
  openModals,
  isModalOpen,
  isDarkSurface,
} as const;

// ── State Reading & Synchronization ─────────────────────────────────────────

export function readShellStateSnapshot(env?: ShellDomEnv): {
  theme: SiteTheme;
  mossShade: MossShade;
  font: SiteFont;
  cursorTrail: CursorTrailState;
  sidebarCollapsed: boolean;
} {
  const { win, doc, storage } = resolveEnv(env);
  const root = doc?.documentElement ?? null;

  const attrTheme = root?.getAttribute('data-theme');
  let storedTheme: string | null = null;
  try {
    storedTheme = storage?.getItem('theme') ?? null;
  } catch {}
  const prefersDark = Boolean(win?.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
  const nextTheme: SiteTheme = isShellTheme(attrTheme)
    ? attrTheme
    : isShellTheme(storedTheme)
    ? storedTheme
    : prefersDark
    ? 'dark'
    : 'light';

  const attrShade = normalizeMossShade(root?.getAttribute('data-moss-shade'));
  let storedShade: MossShade = null;
  try {
    storedShade = normalizeMossShade(storage?.getItem('moss-shade'));
  } catch {}
  const nextShade = attrShade ?? storedShade;

  const attrFont = root?.getAttribute('data-font');
  let storedFont: string | null = null;
  try {
    storedFont = storage?.getItem('site-font') ?? null;
  } catch {}
  const nextFont: SiteFont =
    attrFont === 'kai' || (!attrFont && storedFont === 'kai') ? 'kai' : 'pixel';

  const attrTrail = root?.getAttribute('data-cursor-trail');
  let storedTrail: string | null = null;
  try {
    storedTrail = storage?.getItem('cursor-trail') ?? null;
  } catch {}
  const nextTrail: CursorTrailState =
    attrTrail === 'disabled' || (!attrTrail && storedTrail === 'disabled') ? 'disabled' : 'enabled';

  const attrCollapsed = root?.getAttribute('data-sidebar-collapsed');
  let storedCollapsed: string | null = null;
  try {
    storedCollapsed = storage?.getItem('sidebar-collapsed') ?? null;
  } catch {}
  const nextCollapsed =
    attrCollapsed === 'true' || (attrCollapsed === null && storedCollapsed === 'true');

  return {
    theme: nextTheme,
    mossShade: nextShade,
    font: nextFont,
    cursorTrail: nextTrail,
    sidebarCollapsed: nextCollapsed,
  };
}

export function hydrateShellStore(env?: ShellDomEnv): void {
  const snap = readShellStateSnapshot(env);
  batch(() => {
    if (theme.get() !== snap.theme) theme.set(snap.theme);
    if (mossShade.get() !== snap.mossShade) mossShade.set(snap.mossShade);
    if (font.get() !== snap.font) font.set(snap.font);
    if (cursorTrail.get() !== snap.cursorTrail) cursorTrail.set(snap.cursorTrail);
    if (sidebarCollapsed.get() !== snap.sidebarCollapsed) sidebarCollapsed.set(snap.sidebarCollapsed);
  });
}

let isApplyingFromStore = false;

export function setShellTheme(nextTheme: SiteTheme, env?: ShellDomEnv): SiteTheme {
  const safeTheme: SiteTheme = isShellTheme(nextTheme) ? nextTheme : 'light';
  const { win, doc, storage } = resolveEnv(env);
  isApplyingFromStore = true;
  try {
    try {
      storage?.setItem('theme', safeTheme);
    } catch {}
    if (win && typeof (win as any).__applyTheme === 'function') {
      (win as any).__applyTheme(safeTheme);
    } else if (doc?.documentElement) {
      doc.documentElement.setAttribute('data-theme', safeTheme);
      const shade = mossShade.get();
      if (safeTheme === 'moss' && shade) {
        doc.documentElement.setAttribute('data-moss-shade', shade);
      } else {
        doc.documentElement.removeAttribute('data-moss-shade');
      }
    }
    theme.set(safeTheme);
  } finally {
    isApplyingFromStore = false;
  }
  return safeTheme;
}

export function cycleShellTheme(env?: ShellDomEnv): SiteTheme {
  const cur = theme.get();
  const idx = SHELL_VALID_THEMES.indexOf(cur);
  const next = SHELL_VALID_THEMES[(idx + 1) % SHELL_VALID_THEMES.length];
  return setShellTheme(next, env);
}

export function setShellMossShade(rawShade: string | null, env?: ShellDomEnv): MossShade {
  const normalized = normalizeMossShade(rawShade);
  const { win, doc, storage } = resolveEnv(env);
  isApplyingFromStore = true;
  try {
    try {
      if (normalized) {
        storage?.setItem('moss-shade', normalized);
      } else {
        storage?.removeItem('moss-shade');
      }
    } catch {}
    if (win && typeof (win as any).__setMossShade === 'function') {
      (win as any).__setMossShade(normalized);
    } else if (doc?.documentElement) {
      doc.documentElement.setAttribute('data-theme', 'moss');
      if (normalized) {
        doc.documentElement.setAttribute('data-moss-shade', normalized);
      } else {
        doc.documentElement.removeAttribute('data-moss-shade');
      }
    }
    batch(() => {
      mossShade.set(normalized);
      theme.set('moss');
    });
  } finally {
    isApplyingFromStore = false;
  }
  return normalized;
}

export function setShellFont(nextFont: SiteFont, env?: ShellDomEnv): SiteFont {
  const safeFont = normalizeShellFont(nextFont);
  const { win, doc, storage } = resolveEnv(env);
  isApplyingFromStore = true;
  try {
    try {
      storage?.setItem('site-font', safeFont);
    } catch {}
    if (win && typeof (win as any).__applyFont === 'function') {
      (win as any).__applyFont(safeFont);
    } else if (doc?.documentElement) {
      if (safeFont === 'kai') {
        doc.documentElement.setAttribute('data-font', 'kai');
      } else {
        doc.documentElement.removeAttribute('data-font');
      }
    }
    font.set(safeFont);
  } finally {
    isApplyingFromStore = false;
  }
  return safeFont;
}

export function toggleShellFont(env?: ShellDomEnv): SiteFont {
  return setShellFont(font.get() === 'kai' ? 'pixel' : 'kai', env);
}

export function setShellCursorTrail(nextState: CursorTrailState, env?: ShellDomEnv): CursorTrailState {
  const safeState: CursorTrailState = nextState === 'disabled' ? 'disabled' : 'enabled';
  const { doc, storage } = resolveEnv(env);
  isApplyingFromStore = true;
  try {
    try {
      if (safeState === 'disabled') {
        storage?.setItem('cursor-trail', 'disabled');
      } else {
        storage?.removeItem('cursor-trail');
      }
    } catch {}
    if (doc?.documentElement) {
      if (safeState === 'disabled') {
        doc.documentElement.setAttribute('data-cursor-trail', 'disabled');
      } else {
        doc.documentElement.removeAttribute('data-cursor-trail');
      }
    }
    cursorTrail.set(safeState);
  } finally {
    isApplyingFromStore = false;
  }
  return safeState;
}

export function toggleShellCursorTrail(env?: ShellDomEnv): CursorTrailState {
  return setShellCursorTrail(cursorTrail.get() === 'disabled' ? 'enabled' : 'disabled', env);
}

export function setShellSidebarCollapsed(collapsed: boolean, env?: ShellDomEnv): boolean {
  const next = Boolean(collapsed);
  const { doc, storage } = resolveEnv(env);
  isApplyingFromStore = true;
  try {
    try {
      if (next) {
        storage?.setItem('sidebar-collapsed', 'true');
      } else {
        storage?.removeItem('sidebar-collapsed');
      }
    } catch {}
    if (doc?.documentElement) {
      if (next) {
        doc.documentElement.setAttribute('data-sidebar-collapsed', 'true');
      } else {
        doc.documentElement.removeAttribute('data-sidebar-collapsed');
      }
    }
    sidebarCollapsed.set(next);
  } finally {
    isApplyingFromStore = false;
  }
  return next;
}

export function setActiveModal(modalId: string | null): void {
  batch(() => {
    activeModal.set(modalId);
    openModals.set(modalId ? [modalId] : []);
  });
}

export function setModalOpenState(
  modalId: string,
  isOpen: boolean,
  opts?: { emitDomEvent?: boolean; win?: Window | null }
): void {
  if (!modalId) return;
  const prevList = openModals.get();
  const wasAnyOpen = prevList.length > 0;
  const filtered = prevList.filter((id) => id !== modalId);
  const nextList = isOpen ? [...filtered, modalId] : filtered;
  const nextTop = nextList.length > 0 ? nextList[nextList.length - 1] : null;

  batch(() => {
    openModals.set(nextList);
    activeModal.set(nextTop);
  });

  if (opts?.emitDomEvent) {
    const targetWin = opts.win !== undefined ? opts.win : typeof window !== 'undefined' ? window : null;
    const nowAnyOpen = nextList.length > 0;
    if (!wasAnyOpen && nowAnyOpen && targetWin && typeof targetWin.dispatchEvent === 'function') {
      try {
        targetWin.dispatchEvent(new targetWin.CustomEvent('app:modal-enter'));
      } catch {}
    } else if (wasAnyOpen && !nowAnyOpen && targetWin && typeof targetWin.dispatchEvent === 'function') {
      try {
        targetWin.dispatchEvent(new targetWin.CustomEvent('app:modal-leave'));
      } catch {}
    }
  }
}

export function clearAllModals(): void {
  batch(() => {
    openModals.set([]);
    activeModal.set(null);
  });
}

export function resetShellStore(): void {
  batch(() => {
    theme.set('light');
    mossShade.set(null);
    font.set('pixel');
    cursorTrail.set('enabled');
    sidebarCollapsed.set(false);
    activeModal.set(null);
    openModals.set([]);
  });
}

/**
 * 建立 <html data-*> 属性与全局事件到 shellStore 的响应式桥接，返回幂等卸载函数
 */
export function connectShellStoreDom(env?: ShellDomEnv): () => void {
  const { win, doc } = resolveEnv(env);
  hydrateShellStore(env);

  if (!doc?.documentElement || !win) {
    return () => {};
  }

  const syncFromDom = () => {
    if (isApplyingFromStore) return;
    const root = doc.documentElement;
    const domTheme = root.getAttribute('data-theme');
    const domShade = normalizeMossShade(root.getAttribute('data-moss-shade'));
    const domFont: SiteFont = root.getAttribute('data-font') === 'kai' ? 'kai' : 'pixel';
    const domTrail: CursorTrailState =
      root.getAttribute('data-cursor-trail') === 'disabled' ? 'disabled' : 'enabled';
    const domCollapsed = root.getAttribute('data-sidebar-collapsed') === 'true';

    batch(() => {
      if (isShellTheme(domTheme) && theme.get() !== domTheme) {
        theme.set(domTheme);
      }
      if (mossShade.get() !== domShade) {
        mossShade.set(domShade);
      }
      if (font.get() !== domFont) {
        font.set(domFont);
      }
      if (cursorTrail.get() !== domTrail) {
        cursorTrail.set(domTrail);
      }
      if (sidebarCollapsed.get() !== domCollapsed) {
        sidebarCollapsed.set(domCollapsed);
      }
    });
  };

  const ObserverCtor =
    (win as any).MutationObserver ??
    (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  const observer: MutationObserver | null = ObserverCtor
    ? new ObserverCtor(() => syncFromDom())
    : null;

  observer?.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: [
      'data-theme',
      'data-moss-shade',
      'data-font',
      'data-cursor-trail',
      'data-sidebar-collapsed',
    ],
  });

  const onThemeChange = () => syncFromDom();
  const onFontChange = () => syncFromDom();
  const onPageLoad = () => hydrateShellStore(env);

  win.addEventListener('theme-change', onThemeChange as EventListener);
  win.addEventListener('font-change', onFontChange as EventListener);
  doc.addEventListener('astro:page-load', onPageLoad as EventListener);

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    observer?.disconnect();
    win.removeEventListener('theme-change', onThemeChange as EventListener);
    win.removeEventListener('font-change', onFontChange as EventListener);
    doc.removeEventListener('astro:page-load', onPageLoad as EventListener);
  };
}
