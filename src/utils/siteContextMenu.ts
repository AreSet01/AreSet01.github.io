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

/**
 * Mount the site-wide 5-item custom right-click menu cleanly across View Transitions.
 */
export function mountSiteContextMenu(win: Window = window, doc: Document = document): () => void {
  const existing = (win as unknown as Record<string, (() => void) | undefined>)[CONTEXT_MENU_BOUND_KEY];
  if (typeof existing === 'function') {
    return existing;
  }

  let menuEl: HTMLElement | null = null;
  let toastEl: HTMLElement | null = null;
  let toastTimer = 0;
  let closeTimer = 0;
  let activeSnapshot: ContextMenuSnapshot | null = null;
  const buttonMap = new Map<ContextMenuAction, HTMLButtonElement>();

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

    const list = doc.createElement('div');
    list.className = 'site-ctx-list';

    buttonMap.clear();
    for (const def of SITE_CONTEXT_MENU_ITEMS) {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'site-ctx-item';
      btn.setAttribute('role', 'menuitem');
      btn.dataset.ctxAction = def.action;
      btn.innerHTML = `<span class="site-ctx-icon">${ACTION_ICONS[def.action]}</span><span class="site-ctx-label">${def.label}</span><span class="site-ctx-hint">${def.hint}</span>`;

      // Preserve existing text selection & input focus when clicking a menu item
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
        void runAction(def.action);
      });

      list.appendChild(btn);
      buttonMap.set(def.action, btn);
    }

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
    menuEl.classList.remove('is-open');
    menuEl.setAttribute('aria-hidden', 'true');
    activeSnapshot = null;

    if (immediate || win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      menuEl.hidden = true;
      return;
    }

    menuEl.classList.add('is-closing');
    closeTimer = win.setTimeout(() => {
      if (!menuEl) return;
      menuEl.classList.remove('is-closing');
      menuEl.hidden = true;
    }, 130);
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
    menuEl = null;
    toastEl = null;
    delete (win as unknown as Record<string, unknown>)[CONTEXT_MENU_BOUND_KEY];
  };

  (win as unknown as Record<string, unknown>)[CONTEXT_MENU_BOUND_KEY] = cleanup;
  return cleanup;
}
