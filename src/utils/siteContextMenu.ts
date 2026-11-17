export type ContextMenuAction = 'back' | 'copy' | 'reload' | 'paste' | 'cut';

export interface ContextMenuItemDef {
  action: ContextMenuAction;
  label: string;
  hint: string;
}

export interface ContextMenuSnapshot {
  canBack: boolean;
  canCopy: boolean;
  canReload: boolean;
  canPaste: boolean;
  canCut: boolean;
  copyText: string;
  editableEl: HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
  inputStart: number | null;
  inputEnd: number | null;
  editableRange: Range | null;
}

export interface MenuPosition {
  left: number;
  top: number;
  origin: string;
}

export const SITE_CONTEXT_MENU_ITEMS: readonly ContextMenuItemDef[] = [
  { action: 'back', label: '返回', hint: 'Alt+←' },
  { action: 'copy', label: '复制', hint: 'Ctrl+C' },
  { action: 'reload', label: '刷新', hint: 'F5' },
  { action: 'paste', label: '粘贴', hint: 'Ctrl+V' },
  { action: 'cut', label: '剪切', hint: 'Ctrl+X' },
];

const EDITABLE_INPUT_TYPES = new Set([
  '',
  'text',
  'search',
  'url',
  'email',
  'password',
  'tel',
  'number',
]);

const ACTION_ICONS: Record<ContextMenuAction, string> = {
  back: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.75 3.5L5.25 8l4.5 4.5"/><path d="M5.75 8h6.75"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.25" y="5.25" width="7.5" height="8" rx="1.5"/><path d="M3.25 10.75V3.75a1.5 1.5 0 0 1 1.5-1.5h6"/></svg>',
  reload: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 6.25A5.25 5.25 0 1 0 12.65 11"/><path d="M13.25 2.75v3.5h-3.5"/></svg>',
  paste: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="10.25" rx="1.5"/><path d="M6 2.25h4a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-.75.75H6a.75.75 0 0 1-.75-.75V3a.75.75 0 0 1 .75-.75Z"/></svg>',
  cut: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4.5" cy="11.75" r="1.75"/><circle cx="11.5" cy="11.75" r="1.75"/><path d="M5.75 10.35L11.75 2.75"/><path d="M10.25 10.35L4.25 2.75"/></svg>',
};

const CONTEXT_MENU_MOTION_CSS = `
/* 竹简 · 宣纸笺条展开动效（零 filter:blur、零逐帧 box-shadow 动画） */
.site-ctx-menu {
  overflow: hidden;
  border-radius: 10px;
  padding: 6px 5px 5px;
  opacity: 0;
  transform: translate3d(0, -4px, 0) scaleY(0.92);
  clip-path: inset(0 0 100% 0 round 10px);
  will-change: transform, opacity, clip-path;
  transition:
    opacity 190ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 230ms cubic-bezier(0.22, 1, 0.36, 1),
    clip-path 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.site-ctx-menu[data-flip-y="true"] {
  transform: translate3d(0, 4px, 0) scaleY(0.92);
  clip-path: inset(100% 0 0 0 round 10px);
}

.site-ctx-menu.is-open {
  opacity: 1;
  transform: translate3d(0, 0, 0) scaleY(1);
  clip-path: inset(0 0 0 0 round 10px);
}

.site-ctx-menu.is-closing {
  opacity: 0;
  transform: translate3d(0, -3px, 0) scaleY(0.96);
  clip-path: inset(0 0 35% 0 round 10px);
  pointer-events: none;
  transition:
    opacity 140ms cubic-bezier(0.32, 0, 0.2, 1),
    transform 150ms cubic-bezier(0.32, 0, 0.2, 1),
    clip-path 150ms cubic-bezier(0.32, 0, 0.2, 1);
}

/* 顶缘起笔墨线（起笔锋芒 + 朱砂钤点） */
.site-ctx-brush-head {
  position: absolute;
  top: 0;
  left: 8px;
  right: 8px;
  height: 1.5px;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    #b83b28 0%,
    var(--ink-strong, #18181b) 22%,
    transparent 100%
  );
  transform: scaleX(0);
  transform-origin: left center;
  opacity: 0.82;
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1) 35ms;
}

.site-ctx-menu[data-flip-x="true"] .site-ctx-brush-head {
  transform-origin: right center;
  background: linear-gradient(
    270deg,
    #b83b28 0%,
    var(--ink-strong, #18181b) 22%,
    transparent 100%
  );
}

.site-ctx-menu.is-open .site-ctx-brush-head {
  transform: scaleX(1);
}

[data-theme="dark"] .site-ctx-brush-head {
  background: linear-gradient(90deg, #d9533f 0%, rgba(255, 255, 255, 0.72) 26%, transparent 100%);
}

[data-theme="moss"] .site-ctx-brush-head {
  background: linear-gradient(90deg, #ffc2d1 0%, rgba(255, 241, 244, 0.65) 28%, transparent 100%);
}

.site-ctx-list {
  position: relative;
}

/* 悬停游走墨色底衬 Pill（纯合成器 translate3d + opacity，零回流） */
.site-ctx-hover-pill {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  border-radius: 7px;
  background: rgba(24, 22, 18, 0.065);
  pointer-events: none;
  opacity: 0;
  transform: translate3d(0, 0, 0) scaleX(0.97);
  will-change: transform, opacity;
  transition:
    transform 190ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 150ms cubic-bezier(0.22, 1, 0.36, 1);
}

.site-ctx-hover-pill::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 7px;
  bottom: 7px;
  width: 2px;
  border-radius: 999px;
  background: #b83b28;
}

.site-ctx-hover-pill.is-active {
  opacity: 1;
  transform: translate3d(0, var(--ctx-pill-y, 0px), 0) scaleX(1);
}

[data-theme="dark"] .site-ctx-hover-pill {
  background: rgba(255, 255, 255, 0.085);
}

[data-theme="dark"] .site-ctx-hover-pill::before {
  background: #e06350;
}

[data-theme="moss"] .site-ctx-hover-pill {
  background: rgba(255, 194, 209, 0.16);
}

[data-theme="moss"] .site-ctx-hover-pill::before {
  background: #ffc2d1;
}

[data-theme="rice"] .site-ctx-hover-pill {
  background: rgba(107, 91, 69, 0.11);
}

/* 子项错峰舒展与点击微缩回弹 */
.site-ctx-menu .site-ctx-item {
  position: relative;
  z-index: 1;
  background: transparent !important;
  opacity: 0;
  transform: translate3d(-5px, 0, 0);
  transition:
    opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    color 150ms ease;
  transition-delay: calc(var(--ctx-idx, 0) * 22ms);
}

.site-ctx-menu.is-open .site-ctx-item {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.site-ctx-menu.is-open .site-ctx-item.is-disabled,
.site-ctx-menu.is-open .site-ctx-item:disabled {
  opacity: 0.44;
}

.site-ctx-menu.is-open .site-ctx-item:not(:disabled):hover,
.site-ctx-menu.is-open .site-ctx-item:not(:disabled):focus-visible {
  transform: translate3d(2px, 0, 0);
  transition-delay: 0ms;
}

.site-ctx-menu.is-open .site-ctx-item:not(:disabled):active,
.site-ctx-menu.is-open .site-ctx-item.is-pressing {
  transform: translate3d(1px, 0, 0) scale(0.965);
  transition-duration: 90ms;
  transition-delay: 0ms;
}

.site-ctx-toast {
  border: 1px solid rgba(184, 59, 40, 0.35);
  transition:
    opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .site-ctx-menu,
  .site-ctx-brush-head,
  .site-ctx-hover-pill,
  .site-ctx-menu .site-ctx-item,
  .site-ctx-toast {
    transition: none !important;
    clip-path: none !important;
  }
  .site-ctx-menu .site-ctx-item {
    opacity: 1;
    transform: none;
  }
}
`;

function isTextEditableInput(el: Element): el is HTMLInputElement {
  if (el.tagName !== 'INPUT') return false;
  const input = el as HTMLInputElement;
  const type = (input.type || 'text').toLowerCase();
  return EDITABLE_INPUT_TYPES.has(type) && !input.readOnly && !input.disabled;
}

/**
 * Resolve the nearest editable field (input, textarea, or contenteditable) for a pointer target.
 */
export function getEditableTarget(
  target: EventTarget | null,
): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
  if (!target || typeof target !== 'object') return null;
  const maybeNode = target as Node;
  const el =
    maybeNode.nodeType === 3
      ? (maybeNode.parentElement as Element | null)
      : (typeof (target as Element).closest === 'function' ? (target as Element) : null);
  if (!el) return null;

  const textarea = el.closest('textarea');
  if (textarea && !textarea.readOnly && !textarea.disabled) {
    return textarea;
  }

  const input = el.closest('input');
  if (input && isTextEditableInput(input)) {
    return input;
  }

  const editable = el.closest('[contenteditable]') as HTMLElement | null;
  if (editable && editable.isContentEditable) {
    return editable;
  }

  return null;
}

function readCanGoBack(win: Window): boolean {
  const nav = (win as Window & { navigation?: { canGoBack?: boolean } }).navigation;
  if (nav && typeof nav.canGoBack === 'boolean') {
    return nav.canGoBack;
  }
  return win.history.length > 1;
}

/**
 * Snapshot contextual capabilities (Back, Copy, Reload, Paste, Cut) when contextmenu opens.
 */
export function inspectContextMenuState(
  target: EventTarget | null,
  win: Window = window,
  doc: Document = document,
): ContextMenuSnapshot {
  const editableEl = getEditableTarget(target);
  const isTextControl =
    editableEl !== null && (editableEl.tagName === 'INPUT' || editableEl.tagName === 'TEXTAREA');
  const isPassword =
    editableEl !== null &&
    editableEl.tagName === 'INPUT' &&
    (editableEl as HTMLInputElement).type.toLowerCase() === 'password';

  let inputStart: number | null = null;
  let inputEnd: number | null = null;
  if (isTextControl) {
    const control = editableEl as HTMLInputElement | HTMLTextAreaElement;
    try {
      if (typeof control.selectionStart === 'number' && typeof control.selectionEnd === 'number') {
        inputStart = control.selectionStart;
        inputEnd = control.selectionEnd;
      }
    } catch {
      // Certain input types (e.g. number) disallow selectionStart/selectionEnd access
    }
  }

  const selection = win.getSelection ? win.getSelection() : doc.getSelection();
  const docSelectedText = selection ? selection.toString() : '';

  let editableRange: Range | null = null;
  if (editableEl && !isTextControl && selection && selection.rangeCount > 0) {
    try {
      const candidate = selection.getRangeAt(0);
      if (editableEl.contains(candidate.commonAncestorContainer)) {
        editableRange = candidate.cloneRange();
      }
    } catch {
      editableRange = null;
    }
  }

  let copyText = '';
  let hasEditableSelection = false;

  if (isTextControl && !isPassword && inputStart !== null && inputEnd !== null && inputEnd > inputStart) {
    const control = editableEl as HTMLInputElement | HTMLTextAreaElement;
    copyText = control.value.slice(inputStart, inputEnd);
    hasEditableSelection = copyText.length > 0;
  } else if (!isPassword && docSelectedText.length > 0) {
    copyText = docSelectedText;
    hasEditableSelection = Boolean(editableRange && !editableRange.collapsed);
  }

  return {
    canBack: readCanGoBack(win),
    canCopy: copyText.length > 0,
    canReload: true,
    canPaste: editableEl !== null,
    canCut: Boolean(editableEl && !isPassword && hasEditableSelection),
    copyText,
    editableEl,
    inputStart,
    inputEnd,
    editableRange,
  };
}

/**
 * Compute viewport-clamped floating menu coordinates anchored near the cursor.
 */
export function computeContextMenuPosition(
  clientX: number,
  clientY: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 10,
): MenuPosition {
  const gap = 2;
  const flipX = clientX + gap + menuWidth + margin > viewportWidth;
  const flipY = clientY + gap + menuHeight + margin > viewportHeight;

  const rawLeft = flipX ? clientX - menuWidth - gap : clientX + gap;
  const rawTop = flipY ? clientY - menuHeight - gap : clientY + gap;

  const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
  const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);

  return {
    left: Math.round(Math.min(maxLeft, Math.max(margin, rawLeft))),
    top: Math.round(Math.min(maxTop, Math.max(margin, rawTop))),
    origin: `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}`,
  };
}

function dispatchElementEvent(el: Element, type: string): void {
  const WinEvent = el.ownerDocument?.defaultView?.Event || Event;
  el.dispatchEvent(new WinEvent(type, { bubbles: true }));
}

/**
 * Replace or insert text at a saved selection slice inside an input/textarea.
 */
export function applyInputTextEdit(
  control: HTMLInputElement | HTMLTextAreaElement,
  replacement: string,
  start: number | null,
  end: number | null,
): void {
  const valueLen = control.value.length;
  const safeStart = typeof start === 'number' ? Math.max(0, Math.min(valueLen, start)) : valueLen;
  const safeEnd = typeof end === 'number' ? Math.max(safeStart, Math.min(valueLen, end)) : safeStart;

  if (typeof control.setRangeText === 'function') {
    control.setRangeText(replacement, safeStart, safeEnd, 'end');
  } else {
    control.value = control.value.slice(0, safeStart) + replacement + control.value.slice(safeEnd);
    const caret = safeStart + replacement.length;
    try {
      control.setSelectionRange(caret, caret);
    } catch {}
  }

  dispatchElementEvent(control, 'input');
  dispatchElementEvent(control, 'change');
}

function legacyCopyText(doc: Document, text: string): boolean {
  const helper = doc.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  helper.style.pointerEvents = 'none';
  helper.style.left = '-9999px';
  doc.body.appendChild(helper);
  const sel = doc.getSelection();
  const prevRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
  helper.select();
  let ok = false;
  try {
    ok = doc.execCommand('copy');
  } catch {
    ok = false;
  }
  helper.remove();
  if (sel && prevRange) {
    try {
      sel.removeAllRanges();
      sel.addRange(prevRange);
    } catch {}
  }
  return ok;
}

async function writeClipboard(doc: Document, win: Window, text: string): Promise<boolean> {
  try {
    if (win.navigator?.clipboard?.writeText) {
      await win.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below when Clipboard API rejects (e.g. non-secure context)
  }
  return legacyCopyText(doc, text);
}

const CONTEXT_MENU_BOUND_KEY = '__areSetSiteContextMenuBound__';
const CONTEXT_MENU_STYLE_ID = 'site-ctx-motion-styles';

/**
 * Mount the site-wide 5-item custom right-click menu cleanly across View Transitions.
 */
export function mountSiteContextMenu(win: Window = window, doc: Document = document): () => void {
  const existing = (win as unknown as Record<string, (() => void) | undefined>)[CONTEXT_MENU_BOUND_KEY];
  if (typeof existing === 'function') {
    return existing;
  }

  let menuEl: HTMLElement | null = null;
  let hoverPillEl: HTMLElement | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let toastEl: HTMLElement | null = null;
  let toastTimer = 0;
  let closeTimer = 0;
  let activeSnapshot: ContextMenuSnapshot | null = null;
  const buttonMap = new Map<ContextMenuAction, HTMLButtonElement>();
  const cachedRowMetrics = new Map<ContextMenuAction, { top: number; height: number }>();

  function ensureMotionStyles() {
    if (styleEl && styleEl.isConnected) return;
    const found = doc.getElementById(CONTEXT_MENU_STYLE_ID) as HTMLStyleElement | null;
    if (found) {
      styleEl = found;
      return;
    }
    const s = doc.createElement('style');
    s.id = CONTEXT_MENU_STYLE_ID;
    s.setAttribute('data-site-ctx-motion', 'true');
    s.textContent = CONTEXT_MENU_MOTION_CSS;
    (doc.head || doc.documentElement).appendChild(s);
    styleEl = s;
  }

  function moveHoverPill(action: ContextMenuAction | null) {
    if (!hoverPillEl) return;
    if (!action) {
      hoverPillEl.classList.remove('is-active');
      return;
    }
    const btn = buttonMap.get(action);
    if (!btn || btn.disabled) {
      hoverPillEl.classList.remove('is-active');
      return;
    }
    const metric = cachedRowMetrics.get(action);
    const y = metric ? metric.top : 0;
    if (metric && metric.height > 0) {
      hoverPillEl.style.height = `${metric.height}px`;
    }
    hoverPillEl.style.setProperty('--ctx-pill-y', `${y}px`);
    hoverPillEl.style.transform = `translate3d(0, ${y}px, 0) scaleX(1)`;
    hoverPillEl.classList.add('is-active');
  }

  function cacheMenuRowMetrics() {
    cachedRowMetrics.clear();
    let fallbackTop = 0;
    for (const def of SITE_CONTEXT_MENU_ITEMS) {
      const btn = buttonMap.get(def.action);
      if (!btn) continue;
      const h = btn.offsetHeight || 30;
      const top = btn.offsetTop || fallbackTop;
      cachedRowMetrics.set(def.action, { top, height: h });
      fallbackTop += h + 2;
    }
  }

  function showMenuToast(message: string) {
    if (!toastEl || !toastEl.isConnected) {
      toastEl = doc.getElementById('site-context-toast');
      if (!toastEl) {
        toastEl = doc.createElement('div');
        toastEl.id = 'site-context-toast';
        toastEl.className = 'site-ctx-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        doc.body.appendChild(toastEl);
      }
    }
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(() => {
      toastEl?.classList.remove('is-visible');
    }, 1700);
  }

  function ensureMenuElement(): HTMLElement {
    ensureMotionStyles();
    if (menuEl && menuEl.isConnected) return menuEl;

    const stale = doc.getElementById('site-context-menu');
    if (stale) stale.remove();

    const el = doc.createElement('div');
    el.id = 'site-context-menu';
    el.className = 'site-ctx-menu';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', '快捷操作菜单');
    el.setAttribute('aria-hidden', 'true');
    el.hidden = true;

    const brushHead = doc.createElement('span');
    brushHead.className = 'site-ctx-brush-head';
    brushHead.dataset.ctxBrushHead = 'true';
    brushHead.setAttribute('aria-hidden', 'true');
    el.appendChild(brushHead);

    const list = doc.createElement('div');
    list.className = 'site-ctx-list';

    const pill = doc.createElement('span');
    pill.className = 'site-ctx-hover-pill';
    pill.dataset.ctxHoverPill = 'true';
    pill.setAttribute('aria-hidden', 'true');
    list.appendChild(pill);
    hoverPillEl = pill;

    list.addEventListener('pointerleave', () => {
      moveHoverPill(null);
    });

    buttonMap.clear();
    SITE_CONTEXT_MENU_ITEMS.forEach((def, idx) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'site-ctx-item';
      btn.style.setProperty('--ctx-idx', String(idx));
      btn.setAttribute('role', 'menuitem');
      btn.dataset.ctxAction = def.action;
      btn.innerHTML = `<span class="site-ctx-icon">${ACTION_ICONS[def.action]}</span><span class="site-ctx-label">${def.label}</span><span class="site-ctx-hint">${def.hint}</span>`;

      // Preserve existing text selection & input focus when clicking a menu item
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!btn.disabled) btn.classList.add('is-pressing');
      });

      btn.addEventListener('pointerup', () => btn.classList.remove('is-pressing'));
      btn.addEventListener('pointercancel', () => btn.classList.remove('is-pressing'));

      btn.addEventListener('pointerenter', () => {
        if (!btn.disabled) moveHoverPill(def.action);
        else moveHoverPill(null);
      });

      btn.addEventListener('focus', () => {
        if (!btn.disabled) moveHoverPill(def.action);
      });

      btn.addEventListener('blur', () => {
        btn.classList.remove('is-pressing');
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('is-pressing');
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
        void runAction(def.action);
      });

      list.appendChild(btn);
      buttonMap.set(def.action, btn);
    });

    el.appendChild(list);
    doc.body.appendChild(el);
    menuEl = el;
    return el;
  }

  function setItemEnabled(action: ContextMenuAction, enabled: boolean) {
    const btn = buttonMap.get(action);
    if (!btn) return;
    btn.disabled = !enabled;
    btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    btn.classList.toggle('is-disabled', !enabled);
  }

  function hideMenu(immediate = false) {
    if (!menuEl || menuEl.hidden) return;
    win.clearTimeout(closeTimer);
    moveHoverPill(null);
    menuEl.classList.remove('is-open');
    menuEl.setAttribute('aria-hidden', 'true');
    activeSnapshot = null;

    if (immediate || win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      menuEl.classList.remove('is-closing');
      menuEl.hidden = true;
      return;
    }

    menuEl.classList.add('is-closing');
    closeTimer = win.setTimeout(() => {
      if (!menuEl) return;
      menuEl.classList.remove('is-closing');
      menuEl.hidden = true;
    }, 155);
  }

  function restoreEditableSelection(snap: ContextMenuSnapshot) {
    const el = snap.editableEl;
    if (!el || !el.isConnected) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const ctrl = el as HTMLInputElement | HTMLTextAreaElement;
      if (snap.inputStart !== null && snap.inputEnd !== null) {
        try {
          ctrl.setSelectionRange(snap.inputStart, snap.inputEnd);
        } catch {}
      }
      return;
    }
    if (snap.editableRange) {
      const sel = win.getSelection();
      if (sel) {
        try {
          sel.removeAllRanges();
          sel.addRange(snap.editableRange);
        } catch {}
      }
    }
  }

  function insertIntoContentEditable(editableEl: HTMLElement, range: Range | null, text: string) {
    const sel = win.getSelection();
    const targetRange =
      range ||
      (sel && sel.rangeCount > 0 && editableEl.contains(sel.getRangeAt(0).commonAncestorContainer)
        ? sel.getRangeAt(0).cloneRange()
        : null);
    if (!targetRange) return;

    targetRange.deleteContents();
    const textNode = doc.createTextNode(text);
    targetRange.insertNode(textNode);
    targetRange.setStartAfter(textNode);
    targetRange.collapse(true);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(targetRange);
    }
    dispatchElementEvent(editableEl, 'input');
  }

  async function runAction(action: ContextMenuAction) {
    const snap = activeSnapshot;
    hideMenu(true);

    switch (action) {
      case 'back': {
        if (snap?.canBack) {
          win.history.back();
        }
        return;
      }
      case 'reload': {
        win.location.reload();
        return;
      }
      case 'copy': {
        if (!snap?.canCopy || !snap.copyText) return;
        const ok = await writeClipboard(doc, win, snap.copyText);
        if (ok) {
          showMenuToast('已复制选中内容');
        } else {
          showMenuToast('复制失败，请使用 Ctrl+C');
        }
        return;
      }
      case 'paste': {
        if (!snap?.canPaste || !snap.editableEl) return;
        restoreEditableSelection(snap);
        try {
          if (win.navigator?.clipboard?.readText) {
            const clipText = await win.navigator.clipboard.readText();
            if (snap.editableEl.tagName === 'INPUT' || snap.editableEl.tagName === 'TEXTAREA') {
              applyInputTextEdit(
                snap.editableEl as HTMLInputElement | HTMLTextAreaElement,
                clipText,
                snap.inputStart,
                snap.inputEnd,
              );
            } else {
              insertIntoContentEditable(snap.editableEl, snap.editableRange, clipText);
            }
            return;
          }
        } catch {
          // Clipboard read requires permission in some browsers
        }
        let legacyOk = false;
        try {
          legacyOk = doc.execCommand('paste');
        } catch {
          legacyOk = false;
        }
        if (!legacyOk) {
          showMenuToast('请允许剪贴板读取，或按 Ctrl+V 粘贴');
        }
        return;
      }
      case 'cut': {
        if (!snap?.canCut || !snap.editableEl || !snap.copyText) return;
        restoreEditableSelection(snap);
        const copied = await writeClipboard(doc, win, snap.copyText);
        if (snap.editableEl.tagName === 'INPUT' || snap.editableEl.tagName === 'TEXTAREA') {
          applyInputTextEdit(
            snap.editableEl as HTMLInputElement | HTMLTextAreaElement,
            '',
            snap.inputStart,
            snap.inputEnd,
          );
        } else if (snap.editableRange) {
          snap.editableRange.deleteContents();
          snap.editableRange.collapse(true);
          dispatchElementEvent(snap.editableEl, 'input');
        }
        if (copied) {
          showMenuToast('已剪切');
        }
        return;
      }
    }
  }

  function openMenuAt(clientX: number, clientY: number, snap: ContextMenuSnapshot) {
    const el = ensureMenuElement();
    win.clearTimeout(closeTimer);
    activeSnapshot = snap;

    setItemEnabled('back', snap.canBack);
    setItemEnabled('copy', snap.canCopy);
    setItemEnabled('reload', snap.canReload);
    setItemEnabled('paste', snap.canPaste);
    setItemEnabled('cut', snap.canCut);
    moveHoverPill(null);

    el.hidden = false;
    el.classList.remove('is-closing');
    el.setAttribute('aria-hidden', 'false');

    const rect = el.getBoundingClientRect();
    const pos = computeContextMenuPosition(
      clientX,
      clientY,
      rect.width || 168,
      rect.height || 184,
      win.innerWidth,
      win.innerHeight,
    );
    cacheMenuRowMetrics();

    el.dataset.flipY = pos.origin.startsWith('bottom') ? 'true' : 'false';
    el.dataset.flipX = pos.origin.endsWith('right') ? 'true' : 'false';
    el.style.left = `${pos.left}px`;
    el.style.top = `${pos.top}px`;
    el.style.transformOrigin = pos.origin;
    el.classList.remove('is-open');
    void el.offsetWidth;
    el.classList.add('is-open');
  }

  const AbortCtrl =
    (win as Window & { AbortController?: typeof AbortController }).AbortController || AbortController;
  const controller = new AbortCtrl();
  const { signal } = controller;

  let pendingRightClick: {
    snap: ContextMenuSnapshot;
    docRange: Range | null;
    target: EventTarget | null;
    ts: number;
  } | null = null;

  doc.addEventListener(
    'mousedown',
    (e) => {
      if (e.button !== 2) {
        pendingRightClick = null;
        return;
      }
      const preSnap = inspectContextMenuState(e.target, win, doc);
      const sel = win.getSelection ? win.getSelection() : doc.getSelection();
      const docRange =
        sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null;

      pendingRightClick = {
        snap: preSnap,
        docRange,
        target: e.target,
        ts: Date.now(),
      };

      const shouldHoldEditableSel = Boolean(preSnap.editableEl && preSnap.canCut);
      const shouldHoldPageSel = Boolean(!preSnap.editableEl && preSnap.canCopy && docRange);
      if (shouldHoldEditableSel || shouldHoldPageSel) {
        e.preventDefault();
      }
    },
    { capture: true, signal },
  );

  doc.addEventListener(
    'contextmenu',
    (e) => {
      e.preventDefault();
      let snap = inspectContextMenuState(e.target, win, doc);
      const pending = pendingRightClick;
      pendingRightClick = null;

      if (pending && Date.now() - pending.ts < 500 && !snap.canCopy && pending.snap.canCopy) {
        if (snap.editableEl && snap.editableEl === pending.snap.editableEl) {
          snap = pending.snap;
          restoreEditableSelection(snap);
        } else if (!snap.editableEl && pending.docRange) {
          const sel = win.getSelection ? win.getSelection() : doc.getSelection();
          if (sel) {
            try {
              sel.removeAllRanges();
              sel.addRange(pending.docRange);
            } catch {}
          }
          snap = {
            ...snap,
            canCopy: true,
            copyText: pending.snap.copyText,
          };
        }
      }

      openMenuAt(e.clientX, e.clientY, snap);
    },
    { capture: true, signal },
  );

  doc.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button === 2) return;
      const target = e.target as Node | null;
      if (menuEl && !menuEl.hidden && (!target || !menuEl.contains(target))) {
        hideMenu();
      }
    },
    { capture: true, signal },
  );

  doc.addEventListener(
    'keydown',
    (e) => {
      if (!menuEl || menuEl.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        hideMenu();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const enabled = Array.from(buttonMap.values()).filter((b) => !b.disabled);
        if (enabled.length === 0) return;
        e.preventDefault();
        const curIdx = enabled.indexOf(doc.activeElement as HTMLButtonElement);
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const next = enabled[(curIdx + delta + enabled.length) % enabled.length];
        next?.focus();
      }
    },
    { capture: true, signal },
  );

  win.addEventListener('blur', () => hideMenu(true), { signal });
  win.addEventListener('resize', () => hideMenu(true), { passive: true, signal });
  win.addEventListener('wheel', () => hideMenu(), { passive: true, signal });
  doc.addEventListener('astro:before-swap', () => hideMenu(true), { signal });
  doc.addEventListener('astro:page-load', () => {
    hideMenu(true);
    ensureMenuElement();
  }, { signal });

  ensureMenuElement();

  const cleanup = () => {
    controller.abort();
    win.clearTimeout(closeTimer);
    win.clearTimeout(toastTimer);
    menuEl?.remove();
    toastEl?.remove();
    styleEl?.remove();
    menuEl = null;
    hoverPillEl = null;
    styleEl = null;
    toastEl = null;
    cachedRowMetrics.clear();
    delete (win as unknown as Record<string, unknown>)[CONTEXT_MENU_BOUND_KEY];
  };

  (win as unknown as Record<string, unknown>)[CONTEXT_MENU_BOUND_KEY] = cleanup;
  return cleanup;
}
