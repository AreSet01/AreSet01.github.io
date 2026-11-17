export interface AutoReloadCheckParams {
  currentVersion: string;
  targetVersion: string;
  now: number;
  storage: Storage | null | undefined;
}

export interface AutoReloadDecision {
  allowed: boolean;
  reason: 'ok' | 'invalid' | 'same-version' | 'loop-guard';
}

export interface BusyStateResult {
  busy: boolean;
  reason: string;
}

export interface RestoreReloadState {
  path: string;
  scrollY: number;
  reopenMindMapId: string;
  ts: number;
}

export interface MountAutoUpdateOptions {
  baseUrl?: string;
  pollIntervalMs?: number;
  minCheckGapMs?: number;
  settleDelayMs?: number;
  win?: Window;
  doc?: Document;
  fetchImpl?: typeof fetch;
  navigateImpl?: (url: string) => void;
}

export interface AppAutoUpdateApi {
  checkNow: (force?: boolean) => Promise<boolean>;
  getCurrentVersion: () => string;
  getPendingVersion: () => string | null;
  applyPendingUpdateNow: () => boolean;
}

export const CACHE_BUST_PARAM = '_rv';
export const RELOAD_GUARD_KEY = 'areSet_auto_reload_guard';
export const RESTORE_STATE_KEY = 'areSet_auto_reload_restore';
export const REOPEN_MINDMAP_KEY = 'areSet_reopen_mindmap_id';

const BOUND_KEY = '__areSetAppAutoUpdateBound__';
const CLEANUP_KEY = '__areSetAppAutoUpdateCleanup__';
const AUTO_UPDATE_STYLE_ID = 'app-update-motion-styles';

const APP_UPDATE_MOTION_CSS = `
/* 飞鸽传书 · 朱砂小笺滑入与墨迹进度反馈（零 filter:blur、零逐帧 box-shadow 动画） */
.app-update-pill {
  overflow: hidden;
  border-radius: 10px !important;
  padding: 8px 10px 10px 12px !important;
  gap: 9px !important;
  opacity: 0;
  transform: translate3d(-50%, -18px, 0) rotate(-1.2deg) scale(0.95);
  will-change: transform, opacity;
  transition:
    opacity 320ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 420ms cubic-bezier(0.22, 1, 0.36, 1) !important;
}

.app-update-pill.is-visible {
  opacity: 1;
  transform: translate3d(-50%, 0, 0) rotate(0deg) scale(1);
}

.app-update-pill.is-applying {
  transform: translate3d(-50%, -2px, 0) scale(0.985);
}

/* 朱砂钤印小章与飞鸽意象 */
.app-update-seal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: #b83b28;
  color: #fcfaf7;
  font-family: var(--font-hand-title, serif);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
  transform: scale(1.28) rotate(-10deg);
  opacity: 0;
  transition:
    transform 380ms cubic-bezier(0.22, 1, 0.36, 1) 80ms,
    opacity 240ms ease 60ms;
}

.app-update-pill.is-visible .app-update-seal {
  transform: scale(1) rotate(-2deg);
  opacity: 1;
}

[data-theme="dark"] .app-update-seal {
  background: #cf4a36;
  color: #faf8f5;
}

[data-theme="moss"] .app-update-seal {
  background: #ffc2d1;
  color: #004d40;
}

.app-update-dove {
  display: inline-flex;
  align-items: center;
  color: #b83b28;
  opacity: 0.85;
  flex-shrink: 0;
}

[data-theme="dark"] .app-update-dove {
  color: #e06350;
}

[data-theme="moss"] .app-update-dove {
  color: #ffc2d1;
}

/* 底缘水墨进度线（待命微息 / 结算满墨） */
.app-update-ink-track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgba(0, 0, 0, 0.06);
  pointer-events: none;
  overflow: hidden;
}

[data-theme="dark"] .app-update-ink-track {
  background: rgba(255, 255, 255, 0.08);
}

[data-theme="moss"] .app-update-ink-track {
  background: rgba(255, 241, 244, 0.14);
}

.app-update-ink-bar {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #b83b28 0%, var(--ink-strong, #18181b) 100%);
  transform: scaleX(0.18);
  transform-origin: left center;
  opacity: 0.68;
  will-change: transform, opacity;
  transition:
    transform var(--update-ink-ms, 360ms) cubic-bezier(0.22, 1, 0.36, 1),
    opacity 240ms ease;
}

[data-theme="dark"] .app-update-ink-bar {
  background: linear-gradient(90deg, #e06350 0%, #f3f4f6 100%);
}

[data-theme="moss"] .app-update-ink-bar {
  background: linear-gradient(90deg, #ffc2d1 0%, #fff1f4 100%);
}

.app-update-pill.is-settling .app-update-ink-bar,
.app-update-pill.is-applying .app-update-ink-bar {
  transform: scaleX(1);
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .app-update-pill,
  .app-update-seal,
  .app-update-ink-bar {
    transition: none !important;
  }
}
`;

interface GuardRecord {
  fromVersion: string;
  toVersion: string;
  count: number;
  ts: number;
}

/**
 * Compare current document build version against remote/target build version.
 */
export function isBuildVersionMismatch(currentVersion: string, remoteVersion: string): boolean {
  const cur = String(currentVersion || '').trim();
  const rem = String(remoteVersion || '').trim();
  return Boolean(cur && rem && cur !== rem);
}

/**
 * Append cache-busting query param so fresh HTML bypasses browser/proxy caches.
 */
export function buildCacheBustingUrl(href: string, targetVersion: string): string {
  const url = new URL(href);
  url.searchParams.set(CACHE_BUST_PARAM, targetVersion);
  return url.toString();
}

/**
 * Remove cache-busting param cleanly from address bar after reload completes.
 */
export function cleanCacheBustingParam(win: Window = window): boolean {
  try {
    const url = new URL(win.location.href);
    if (!url.searchParams.has(CACHE_BUST_PARAM)) return false;
    url.searchParams.delete(CACHE_BUST_PARAM);
    const clean = `${url.pathname}${url.search}${url.hash}`;
    win.history.replaceState(win.history.state, '', clean);
    return true;
  } catch {
    return false;
  }
}

function readGuard(storage: Storage | null | undefined): GuardRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RELOAD_GUARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuardRecord>;
    if (
      typeof parsed?.toVersion === 'string' &&
      typeof parsed?.count === 'number' &&
      typeof parsed?.ts === 'number'
    ) {
      return {
        fromVersion: String(parsed.fromVersion || ''),
        toVersion: parsed.toVersion,
        count: parsed.count,
        ts: parsed.ts,
      };
    }
  } catch {}
  return null;
}

/**
 * Circuit-breaker check preventing infinite reload loops if a CDN or proxy serves stale HTML.
 */
export function canTriggerAutoReload(params: AutoReloadCheckParams): AutoReloadDecision {
  const cur = String(params.currentVersion || '').trim();
  const target = String(params.targetVersion || '').trim();
  if (!cur || !target) {
    return { allowed: false, reason: 'invalid' };
  }
  if (cur === target) {
    return { allowed: false, reason: 'same-version' };
  }

  const guard = readGuard(params.storage);
  if (guard && guard.toVersion === target) {
    const elapsed = Math.max(0, params.now - guard.ts);
    if (elapsed < 15_000 || (elapsed < 120_000 && guard.count >= 2)) {
      return { allowed: false, reason: 'loop-guard' };
    }
  }

  return { allowed: true, reason: 'ok' };
}

/**
 * Persist reload attempt metadata before triggering page navigation.
 */
export function recordAutoReloadAttempt(params: AutoReloadCheckParams): void {
  if (!params.storage) return;
  try {
    const prev = readGuard(params.storage);
    const sameTarget = prev && prev.toVersion === params.targetVersion && params.now - prev.ts < 120_000;
    const next: GuardRecord = {
      fromVersion: params.currentVersion,
      toVersion: params.targetVersion,
      count: sameTarget ? prev.count + 1 : 1,
      ts: params.now,
    };
    params.storage.setItem(RELOAD_GUARD_KEY, JSON.stringify(next));
  } catch {}
}

/**
 * Detect active user editing, MindMap workbench usage, open drawers, or AI streaming.
 */
export function detectBusyEditingState(doc: Document): BusyStateResult {
  const active = doc.activeElement as HTMLElement | null;
  if (active) {
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) {
      return { busy: true, reason: 'input-focus' };
    }
  }

  if (doc.querySelector('.mm-node-edit-input')) {
    return { busy: true, reason: 'mindmap-inline-edit' };
  }

  const wbModal = doc.getElementById('mm-workbench-modal');
  if (wbModal && !wbModal.classList.contains('hidden')) {
    return { busy: true, reason: 'mindmap-workbench-open' };
  }

  if (doc.querySelector('.ink-turn.is-streaming')) {
    return { busy: true, reason: 'ink-streaming' };
  }

  const inkPanel = doc.getElementById('ink-ask-panel');
  if (inkPanel && inkPanel.classList.contains('is-open')) {
    return { busy: true, reason: 'ink-panel-open' };
  }

  const notesDrawer = doc.getElementById('article-notes-drawer');
  if (notesDrawer && notesDrawer.classList.contains('is-open')) {
    return { busy: true, reason: 'notes-drawer-open' };
  }

  const searchOverlay = doc.getElementById('site-search');
  if (searchOverlay && searchOverlay.classList.contains('is-open')) {
    return { busy: true, reason: 'search-open' };
  }

  const catModal = doc.getElementById('mm-cat-modal');
  const genModal = doc.getElementById('mm-gen-modal');
  if (
    (catModal && !catModal.classList.contains('hidden')) ||
    (genModal && !genModal.classList.contains('hidden'))
  ) {
    return { busy: true, reason: 'mindmap-modal-open' };
  }

  return { busy: false, reason: 'idle' };
}

/**
 * Save scroll coordinate & open MindMap context right before reload.
 */
export function saveReloadRestoreState(
  win: Window,
  doc: Document,
  storage: Storage | null | undefined,
  preserveMindMap = false,
): void {
  if (!storage) return;
  try {
    const wbModal = doc.getElementById('mm-workbench-modal');
    const openMapId =
      preserveMindMap && wbModal && !wbModal.classList.contains('hidden')
        ? wbModal.dataset.activeMapId || ''
        : '';
    if (openMapId) {
      storage.setItem(REOPEN_MINDMAP_KEY, openMapId);
    }
    const payload: RestoreReloadState = {
      path: win.location.pathname,
      scrollY: Math.max(0, Math.round(win.scrollY || win.pageYOffset || 0)),
      reopenMindMapId: openMapId,
      ts: Date.now(),
    };
    storage.setItem(RESTORE_STATE_KEY, JSON.stringify(payload));
  } catch {}
}

/**
 * Read & consume pending scroll restoration state if fresh and on same route.
 */
export function consumePendingRestoreState(
  win: Window,
  storage: Storage | null | undefined,
  now = Date.now(),
): RestoreReloadState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RESTORE_STATE_KEY);
    if (!raw) return null;
    storage.removeItem(RESTORE_STATE_KEY);
    const parsed = JSON.parse(raw) as Partial<RestoreReloadState>;
    if (
      typeof parsed?.path === 'string' &&
      parsed.path === win.location.pathname &&
      typeof parsed?.scrollY === 'number' &&
      typeof parsed?.ts === 'number' &&
      now - parsed.ts < 20_000
    ) {
      return {
        path: parsed.path,
        scrollY: Math.max(0, parsed.scrollY),
        reopenMindMapId: String(parsed.reopenMindMapId || ''),
        ts: parsed.ts,
      };
    }
  } catch {}
  return null;
}

function getSafeStorage(win: Window): Storage | null {
  try {
    return win.sessionStorage || null;
  } catch {
    return null;
  }
}

function getDocumentBuildVersion(doc: Document): string {
  return doc.querySelector('meta[name="app-build-version"]')?.getAttribute('content')?.trim() || '';
}

function dispatchFlushDrafts(doc: Document, win: Window): void {
  const WinEvent = (win as Window & { Event?: typeof Event }).Event || Event;
  try {
    win.dispatchEvent(new WinEvent('app:flush-drafts'));
    doc.dispatchEvent(new WinEvent('app:flush-drafts'));
  } catch {}
}

/**
 * Mount build-version update watcher, ViewTransition guard, and cinnabar messenger note pill.
 */
export function mountAppAutoUpdate(options: MountAutoUpdateOptions = {}): AppAutoUpdateApi {
  const win = options.win || window;
  const doc = options.doc || document;
  const winRecord = win as unknown as Record<string, unknown>;

  if (winRecord[BOUND_KEY] && winRecord.__appAutoUpdate) {
    return winRecord.__appAutoUpdate as AppAutoUpdateApi;
  }

  const baseUrl = options.baseUrl ?? '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const versionUrl = `${normalizedBase}version.json`;
  const pollIntervalMs = options.pollIntervalMs ?? 60_000;
  const minCheckGapMs = options.minCheckGapMs ?? 10_000;
  const settleDelayMs = options.settleDelayMs ?? 1_200;
  const fetchFn = options.fetchImpl || win.fetch?.bind(win);
  const navigateFn = options.navigateImpl || ((nextUrl: string) => win.location.replace(nextUrl));
  const storage = getSafeStorage(win);

  const scheduleFrame = (fn: () => void) => {
    if (typeof win.requestAnimationFrame === 'function') {
      win.requestAnimationFrame(fn);
    } else {
      win.setTimeout(fn, 16);
    }
  };

  cleanCacheBustingParam(win);

  // Restore scroll position seamlessly after an auto-reload completes
  const pendingRestore = consumePendingRestoreState(win, storage);
  if (pendingRestore && pendingRestore.scrollY > 0) {
    winRecord.__autoUpdateRestoring = true;
    winRecord.__postTitleHoldPending = false;
    doc.documentElement.removeAttribute('data-post-title-hold');
    doc.body.removeAttribute('data-post-title-hold');
    doc.querySelectorAll('article[data-post-title-hold]').forEach((a) => a.removeAttribute('data-post-title-hold'));
    const restoreScroll = () => {
      try {
        win.scrollTo({ top: pendingRestore.scrollY, behavior: 'instant' as ScrollBehavior });
      } catch {
        win.scrollTo(0, pendingRestore.scrollY);
      }
    };
    scheduleFrame(() => {
      restoreScroll();
      win.setTimeout(restoreScroll, 180);
    });
    win.addEventListener(
      'load',
      () => {
        restoreScroll();
        win.setTimeout(() => {
          delete winRecord.__autoUpdateRestoring;
        }, 400);
      },
      { once: true },
    );
  }

  let currentVersion = getDocumentBuildVersion(doc);
  let pendingVersion: string | null = null;
  let pendingNavHref: string | null = null;
  let userDismissed = false;
  let isChecking = false;
  let lastCheckedAt = 0;
  let pollTimer = 0;
  let settleTimer = 0;
  let pillEl: HTMLElement | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let busyObserver: MutationObserver | null = null;

  const AbortCtrl =
    (win as Window & { AbortController?: typeof AbortController }).AbortController || AbortController;
  const controller = new AbortCtrl();
  const { signal } = controller;

  function ensureUpdateStyles(): void {
    if (styleEl && styleEl.isConnected) return;
    const found = doc.getElementById(AUTO_UPDATE_STYLE_ID) as HTMLStyleElement | null;
    if (found) {
      styleEl = found;
      return;
    }
    const s = doc.createElement('style');
    s.id = AUTO_UPDATE_STYLE_ID;
    s.setAttribute('data-app-update-motion', 'true');
    s.textContent = APP_UPDATE_MOTION_CSS;
    (doc.head || doc.documentElement).appendChild(s);
    styleEl = s;
  }

  function removePill(): void {
    pillEl?.classList.remove('is-visible', 'is-settling', 'is-applying');
    const ref = pillEl;
    pillEl = null;
    if (ref) {
      win.setTimeout(() => ref.remove(), 260);
    }
  }

  function executeReload(targetVer: string, targetHref = win.location.href, preserveMindMap = true): void {
    if (pillEl) {
      pillEl.style.setProperty('--update-ink-ms', '180ms');
      pillEl.classList.add('is-applying');
    }
    dispatchFlushDrafts(doc, win);
    saveReloadRestoreState(win, doc, storage, preserveMindMap);
    recordAutoReloadAttempt({
      currentVersion,
      targetVersion: targetVer,
      now: Date.now(),
      storage,
    });
    const nextUrl = buildCacheBustingUrl(targetHref, targetVer);
    navigateFn(nextUrl);
  }

  function showUpdatePill(manualOnly: boolean, reasonLabel: string): void {
    if (userDismissed && !manualOnly) return;
    ensureUpdateStyles();
    if (!pillEl || !pillEl.isConnected) {
      const stale = doc.getElementById('app-update-pill');
      stale?.remove();
      pillEl = doc.createElement('div');
      pillEl.id = 'app-update-pill';
      pillEl.className = 'app-update-pill';
      pillEl.setAttribute('role', 'status');
      pillEl.setAttribute('aria-live', 'polite');

      const seal = doc.createElement('span');
      seal.className = 'app-update-seal';
      seal.dataset.updateSeal = 'true';
      seal.setAttribute('aria-hidden', 'true');
      seal.textContent = '新';

      const dove = doc.createElement('span');
      dove.className = 'app-update-dove';
      dove.setAttribute('aria-hidden', 'true');
      dove.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2L7.5 8.5"/><path d="M14 2l-4.2 11.5-2.3-5-5-2.3L14 2z"/></svg>';

      const msg = doc.createElement('span');
      msg.className = 'app-update-pill-text';

      const applyBtn = doc.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'app-update-pill-btn is-primary';
      applyBtn.dataset.updateAct = 'apply';
      applyBtn.textContent = '立即更新';
      applyBtn.addEventListener('click', () => {
        if (!pendingVersion) return;
        executeReload(pendingVersion, win.location.href, true);
      });

      const dismissBtn = doc.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.className = 'app-update-pill-btn';
      dismissBtn.dataset.updateAct = 'dismiss';
      dismissBtn.setAttribute('aria-label', '稍后提醒');
      dismissBtn.textContent = '×';
      dismissBtn.addEventListener('click', () => {
        userDismissed = true;
        win.clearTimeout(settleTimer);
        removePill();
      });

      const inkTrack = doc.createElement('span');
      inkTrack.className = 'app-update-ink-track';
      inkTrack.setAttribute('aria-hidden', 'true');
      const inkBar = doc.createElement('i');
      inkBar.className = 'app-update-ink-bar';
      inkBar.dataset.updateInkBar = 'true';
      inkTrack.appendChild(inkBar);

      pillEl.append(seal, dove, msg, applyBtn, dismissBtn, inkTrack);
      doc.body.appendChild(pillEl);
    }

    const msgEl = pillEl.querySelector('.app-update-pill-text');
    if (msgEl) {
      msgEl.textContent = manualOnly ? '飞鸿新笺已至，轻点展卷更新' : reasonLabel;
    }
    pillEl.classList.remove('is-settling');
    scheduleFrame(() => pillEl?.classList.add('is-visible'));
  }

  function scheduleSettleCheck(): void {
    if (!pendingVersion || userDismissed) return;
    win.clearTimeout(settleTimer);
    if (pillEl && !detectBusyEditingState(doc).busy) {
      pillEl.style.setProperty('--update-ink-ms', `${Math.max(180, settleDelayMs)}ms`);
      pillEl.classList.add('is-settling');
    } else if (pillEl) {
      pillEl.classList.remove('is-settling');
    }
    settleTimer = win.setTimeout(() => {
      if (!pendingVersion || userDismissed) return;
      if (detectBusyEditingState(doc).busy) {
        pillEl?.classList.remove('is-settling');
        return;
      }
      const decision = canTriggerAutoReload({
        currentVersion,
        targetVersion: pendingVersion,
        now: Date.now(),
        storage,
      });
      if (decision.allowed) {
        executeReload(pendingVersion, win.location.href, false);
      } else if (decision.reason === 'loop-guard') {
        showUpdatePill(true, '已发布新版本');
      }
    }, settleDelayMs);
  }

  function ensureBusyWatchers(): void {
    const MutObs =
      (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver ||
      (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (busyObserver || !MutObs) return;
    busyObserver = new MutObs(() => {
      if (!pendingVersion) return;
      if (!detectBusyEditingState(doc).busy) {
        scheduleSettleCheck();
      } else {
        pillEl?.classList.remove('is-settling');
      }
    });
    const observedIds = ['mm-workbench-modal', 'ink-ask-panel', 'article-notes-drawer', 'site-search', 'mm-cat-modal', 'mm-gen-modal'];
    for (const id of observedIds) {
      const target = doc.getElementById(id);
      if (target) {
        busyObserver.observe(target, {
          attributes: true,
          attributeFilter: ['class', 'hidden'],
          subtree: id === 'ink-ask-panel',
        });
      }
    }
  }

  function handleNewVersionDetected(remoteVersion: string): void {
    if (!currentVersion || !isBuildVersionMismatch(currentVersion, remoteVersion)) return;
    pendingVersion = remoteVersion;

    const guardDecision = canTriggerAutoReload({
      currentVersion,
      targetVersion: remoteVersion,
      now: Date.now(),
      storage,
    });

    if (!guardDecision.allowed) {
      if (guardDecision.reason === 'loop-guard') {
        showUpdatePill(true, '已发布新版本');
      }
      return;
    }

    const busyState = detectBusyEditingState(doc);
    if (!busyState.busy) {
      executeReload(remoteVersion, win.location.href, false);
      return;
    }

    const label =
      busyState.reason.startsWith('mindmap')
        ? '新卷已至 · 退出导图后墨迹自动更替'
        : '新卷已至 · 搁笔后自动无感更替';
    ensureBusyWatchers();
    showUpdatePill(false, label);
  }

  async function checkNow(force = false): Promise<boolean> {
    if (!fetchFn || !currentVersion) return false;
    if (doc.hidden && !force) return false;
    if (win.navigator && win.navigator.onLine === false) return false;

    const now = Date.now();
    if (!force && isChecking) return false;
    if (!force && now - lastCheckedAt < minCheckGapMs) return false;

    isChecking = true;
    lastCheckedAt = now;
    let remoteVersion = '';
    try {
      const res = await fetchFn(`${versionUrl}?t=${now}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store',
          Pragma: 'no-cache',
        },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { version?: unknown };
      remoteVersion = typeof data?.version === 'string' ? data.version.trim() : '';
    } catch {
      return false;
    } finally {
      isChecking = false;
    }

    if (isBuildVersionMismatch(currentVersion, remoteVersion)) {
      handleNewVersionDetected(remoteVersion);
      return true;
    }
    return false;
  }

  function startPollTimer(): void {
    win.clearInterval(pollTimer);
    if (pollIntervalMs <= 0 || doc.hidden) return;
    pollTimer = win.setInterval(() => {
      if (!doc.hidden) void checkNow(false);
    }, pollIntervalMs);
  }

  // 1. Triggers: tab resume, focus, reconnect, and gentle 60s active polling
  doc.addEventListener(
    'visibilitychange',
    () => {
      if (doc.hidden) {
        win.clearInterval(pollTimer);
        pollTimer = 0;
      } else {
        startPollTimer();
        void checkNow(false);
      }
    },
    { signal },
  );
  win.addEventListener('focus', () => void checkNow(false), { signal });
  win.addEventListener('online', () => void checkNow(true), { signal });

  // Clear focus / drawer closure listeners for deferred update resumption
  doc.addEventListener(
    'focusout',
    () => {
      if (pendingVersion) scheduleSettleCheck();
    },
    { signal },
  );
  doc.addEventListener(
    'click',
    () => {
      if (pendingVersion) scheduleSettleCheck();
    },
    { signal },
  );
  win.addEventListener(
    'ink-ask:stream-end',
    () => {
      if (pendingVersion) scheduleSettleCheck();
    },
    { signal },
  );

  // 2. ClientRouter SPA navigation interception
  doc.addEventListener(
    'astro:before-preparation',
    (event: Event & { to?: URL | string }) => {
      try {
        const dest = event.to instanceof URL ? event.to.href : String(event.to || win.location.href);
        pendingNavHref = dest;
        if (pendingVersion && isBuildVersionMismatch(currentVersion, pendingVersion)) {
          const guard = canTriggerAutoReload({
            currentVersion,
            targetVersion: pendingVersion,
            now: Date.now(),
            storage,
          });
          if (guard.allowed) {
            event.preventDefault();
            executeReload(pendingVersion, dest, false);
          }
        }
      } catch {}
    },
    { signal },
  );

  doc.addEventListener(
    'astro:before-swap',
    (event: Event & { newDocument?: Document; to?: URL | string }) => {
      try {
        const nextVer = event.newDocument ? getDocumentBuildVersion(event.newDocument) : '';
        if (nextVer && isBuildVersionMismatch(currentVersion, nextVer)) {
          const dest =
            event.to instanceof URL
              ? event.to.href
              : pendingNavHref || event.newDocument?.baseURI || win.location.href;
          const guard = canTriggerAutoReload({
            currentVersion,
            targetVersion: nextVer,
            now: Date.now(),
            storage,
          });
          if (guard.allowed) {
            event.preventDefault();
            executeReload(nextVer, dest, false);
          }
        }
      } catch {}
    },
    { signal },
  );

  doc.addEventListener(
    'astro:page-load',
    () => {
      pendingNavHref = null;
      const latest = getDocumentBuildVersion(doc);
      if (latest) currentVersion = latest;
      if (busyObserver) {
        busyObserver.disconnect();
        busyObserver = null;
      }
      if (pendingVersion) ensureBusyWatchers();
    },
    { signal },
  );

  startPollTimer();

  const api: AppAutoUpdateApi = {
    checkNow,
    getCurrentVersion: () => currentVersion,
    getPendingVersion: () => pendingVersion,
    applyPendingUpdateNow: () => {
      if (!pendingVersion) return false;
      executeReload(pendingVersion, win.location.href, true);
      return true;
    },
  };

  const cleanup = () => {
    controller.abort();
    win.clearInterval(pollTimer);
    win.clearTimeout(settleTimer);
    busyObserver?.disconnect();
    busyObserver = null;
    pillEl?.remove();
    styleEl?.remove();
    pillEl = null;
    styleEl = null;
    delete winRecord[BOUND_KEY];
    delete winRecord[CLEANUP_KEY];
    delete winRecord.__appAutoUpdate;
  };

  winRecord[BOUND_KEY] = true;
  winRecord[CLEANUP_KEY] = cleanup;
  winRecord.__appAutoUpdate = api;
  return api;
}
