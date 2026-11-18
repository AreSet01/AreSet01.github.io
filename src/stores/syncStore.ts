/**
 * syncStore.ts — Unified Multi-Device Cloud-Ink Sync Store (`nanostores`)
 *
 * Aggregates `notes` + `mindmaps` + `reading` local-first sync engines into a single
 * declarative state graph for `/account` (`#syncInkBridge`, `#syncBadge`, `#accountStatusWrap`,
 * `#accountTabGlider`, and revision telemetry).
 */

import { atom, computed, map } from 'nanostores';

export type SyncFlowMode =
  | 'idle'
  | 'checking'
  | 'pushing'
  | 'pulling'
  | 'bidirectional'
  | 'synced'
  | 'error';

export type CombinedSyncBadgeState =
  | 'checking'
  | 'latest'
  | 'ahead'
  | 'behind'
  | 'diverged'
  | 'need-login'
  | 'error';

export type SyncDomainState = 'latest' | 'ahead' | 'behind' | 'diverged' | 'need-login' | 'error';

export interface DomainSyncSnapshot {
  ok: boolean;
  state: SyncDomainState;
  localRev: number;
  serverRev: number;
  pendingCount: number;
  incomingCount: number;
  lastSyncAt: number;
  reason?: string;
  message?: string;
}

export interface SyncEngineAdapter {
  checkSyncStatus?: () => Promise<Partial<DomainSyncSnapshot> | null>;
  pushSync?: () => Promise<{ ok: boolean; pushedCount?: number; rev?: number; reason?: string; message?: string }>;
  pullSync?: () => Promise<{ ok: boolean; pulledCount?: number; rev?: number; reason?: string; message?: string }>;
  syncNow?: (opts?: { migrate?: boolean }) => Promise<{
    ok: boolean;
    pushedCount?: number;
    pulledCount?: number;
    rev?: number;
    reason?: string;
  }>;
}

export interface SyncAdaptersBundle {
  notes?: SyncEngineAdapter | null;
  mindmaps?: SyncEngineAdapter | null;
  reading?: SyncEngineAdapter | null;
}

export interface SyncSessionState {
  authenticated: boolean;
  username: string;
  statusTitle: string;
  activeAuthTab: 'login' | 'register';
}

export interface UnifiedSyncState {
  ready: boolean;
  badgeState: CombinedSyncBadgeState;
  badgeLabel: string;
  notes: DomainSyncSnapshot;
  mindmaps: DomainSyncSnapshot;
  reading: DomainSyncSnapshot;
  totalPending: number;
  totalIncoming: number;
  lastSyncAt: number;
  statusSummary: string;
  detailSummary: string;
  localMetaText: string;
  cloudMetaText: string;
  feedbackText: string;
  feedbackType: 'ok' | 'error' | 'info';
  busyAction: 'none' | 'check' | 'push' | 'pull' | 'bidirectional';
}

export const SYNC_FLOW_LABELS: Record<SyncFlowMode, string> = {
  idle: '待命',
  checking: '巡验',
  pushing: '呈送 →',
  pulling: '← 采撷',
  bidirectional: '⇄ 流转',
  synced: '已同步',
  error: '阻滞',
};

export const SYNC_BADGE_LABELS: Record<CombinedSyncBadgeState, string> = {
  checking: '校验中…',
  latest: '本地已是最新',
  ahead: '本地有待提交',
  behind: '云端有待拉取',
  diverged: '需双向同步',
  'need-login': '未登录',
  error: '校验异常',
};

function createEmptyDomainSnapshot(): DomainSyncSnapshot {
  return {
    ok: false,
    state: 'latest',
    localRev: 0,
    serverRev: 0,
    pendingCount: 0,
    incomingCount: 0,
    lastSyncAt: 0,
  };
}

function createInitialUnifiedSyncState(): UnifiedSyncState {
  return {
    ready: true,
    badgeState: 'checking',
    badgeLabel: '正在校验…',
    notes: createEmptyDomainSnapshot(),
    mindmaps: createEmptyDomainSnapshot(),
    reading: createEmptyDomainSnapshot(),
    totalPending: 0,
    totalIncoming: 0,
    lastSyncAt: 0,
    statusSummary: '正在检查本地与云端数据…',
    detailSummary: '本地版本: — · 云端版本: — · 待提交: 0 · 待拉取: 0',
    localMetaText: '待提交 0',
    cloudMetaText: '待拉取 0',
    feedbackText: '',
    feedbackType: 'info',
    busyAction: 'none',
  };
}

export const $syncFlowMode = atom<SyncFlowMode>('checking');

export const $syncSession = map<SyncSessionState>({
  authenticated: false,
  username: '',
  statusTitle: '同步就绪',
  activeAuthTab: 'login',
});

export const $syncState = map<UnifiedSyncState>(createInitialUnifiedSyncState());

export const $syncConfluence = computed([$syncFlowMode, $syncState], (flowMode, state) => ({
  flowMode,
  confluenceLabel: SYNC_FLOW_LABELS[flowMode] || '云墨同频',
  totalPending: state.totalPending,
  totalIncoming: state.totalIncoming,
  localMetaText: state.localMetaText,
  cloudMetaText: state.cloudMetaText,
  isSynced: state.badgeState === 'latest' && flowMode === 'synced',
}));

function normalizeDomainSnapshot(raw?: Partial<DomainSyncSnapshot> | null): DomainSyncSnapshot {
  if (!raw) return createEmptyDomainSnapshot();
  const validStates: SyncDomainState[] = ['latest', 'ahead', 'behind', 'diverged', 'need-login', 'error'];
  const state = validStates.includes(raw.state as SyncDomainState) ? (raw.state as SyncDomainState) : 'error';
  return {
    ok: Boolean(raw.ok),
    state,
    localRev: Math.max(0, Number(raw.localRev || 0)),
    serverRev: Math.max(0, Number(raw.serverRev || 0)),
    pendingCount: Math.max(0, Number(raw.pendingCount || 0)),
    incomingCount: Math.max(0, Number(raw.incomingCount || 0)),
    lastSyncAt: Math.max(0, Number(raw.lastSyncAt || 0)),
    reason: raw.reason,
    message: raw.message,
  };
}

function resolveWindowAdapters(injected?: SyncAdaptersBundle): SyncAdaptersBundle {
  if (injected) return injected;
  if (typeof window === 'undefined') return {};
  const w = window as unknown as Record<string, SyncEngineAdapter | undefined>;
  return {
    notes: w.__notesSync ?? null,
    mindmaps: w.__mindmapsSync ?? null,
    reading: w.__readingSync ?? null,
  };
}

export function setSyncFlowMode(mode: SyncFlowMode): void {
  $syncFlowMode.set(mode);
}

export function setSyncSessionUser(user: { username: string } | null, statusTitle = '同步就绪'): void {
  if (user) {
    $syncSession.set({
      authenticated: true,
      username: user.username,
      statusTitle,
      activeAuthTab: $syncSession.get().activeAuthTab,
    });
  } else {
    $syncSession.set({
      authenticated: false,
      username: '',
      statusTitle: '同步就绪',
      activeAuthTab: 'login',
    });
  }
}

export function setActiveAuthTab(tab: 'login' | 'register'): void {
  $syncSession.setKey('activeAuthTab', tab);
}

export function setSyncFeedback(text: string, type: 'ok' | 'error' | 'info' = 'info'): void {
  $syncState.setKey('feedbackText', text);
  $syncState.setKey('feedbackType', type);
}

/**
 * Deterministically folds `notes`, `mindmaps`, and `reading` status payloads into `$syncState` + `$syncFlowMode`.
 */
export function applySyncStatusSnapshots(
  notesRaw?: Partial<DomainSyncSnapshot> | null,
  mindmapsRaw?: Partial<DomainSyncSnapshot> | null,
  readingRaw?: Partial<DomainSyncSnapshot> | null
): UnifiedSyncState {
  const notesSt = normalizeDomainSnapshot(notesRaw);
  const mmSt = normalizeDomainSnapshot(mindmapsRaw);
  const rdSt = normalizeDomainSnapshot(readingRaw);
  const prev = $syncState.get();

  if (!notesSt.ok) {
    const errBadge: CombinedSyncBadgeState = notesSt.state === 'need-login' ? 'need-login' : 'error';
    const nextErr: UnifiedSyncState = {
      ...prev,
      ready: true,
      badgeState: errBadge,
      badgeLabel: errBadge === 'need-login' ? '未登录' : '校验异常',
      notes: notesSt,
      mindmaps: mmSt,
      reading: rdSt,
      statusSummary: notesSt.message || '无法获取同步状态',
      busyAction: 'none',
    };
    $syncState.set(nextErr);
    $syncFlowMode.set('error');
    return nextErr;
  }

  const totalPending =
    notesSt.pendingCount +
    (mmSt.ok ? mmSt.pendingCount : Number(mindmapsRaw?.pendingCount || 0)) +
    (rdSt.ok ? rdSt.pendingCount : Number(readingRaw?.pendingCount || 0));
  const totalIncoming =
    notesSt.incomingCount +
    (mmSt.ok ? mmSt.incomingCount : Number(mindmapsRaw?.incomingCount || 0)) +
    (rdSt.ok ? rdSt.incomingCount : Number(readingRaw?.incomingCount || 0));

  const ahead = totalPending > 0;
  const behind =
    totalIncoming > 0 ||
    notesSt.state === 'behind' ||
    notesSt.state === 'diverged' ||
    mmSt.state === 'behind' ||
    mmSt.state === 'diverged' ||
    rdSt.state === 'behind' ||
    rdSt.state === 'diverged';

  const combinedState: CombinedSyncBadgeState =
    ahead && behind ? 'diverged' : ahead ? 'ahead' : behind ? 'behind' : 'latest';

  const localMetaText = totalPending > 0 ? `待提交 ${totalPending}` : `r${notesSt.localRev} 已净`;
  const cloudMetaText = totalIncoming > 0 ? `待拉取 ${totalIncoming}` : `r${notesSt.serverRev} 齐平`;

  const statusSummary =
    combinedState === 'latest'
      ? '笔记、思维导图与夹签进度均已是最新，与云端完全同步'
      : `待提交 ${totalPending} 项（笔记 ${notesSt.pendingCount} / 导图 ${mmSt.pendingCount} / 夹签 ${rdSt.pendingCount}）· 待拉取 ${totalIncoming} 项`;

  const lastSyncAt = Math.max(notesSt.lastSyncAt, mmSt.lastSyncAt, rdSt.lastSyncAt);
  const lastTime = lastSyncAt ? new Date(lastSyncAt).toLocaleString('zh-CN') : '从未同步';
  const mmRev = mmSt.ok ? ` · 导图: r${mmSt.localRev}/r${mmSt.serverRev}` : '';
  const rdRev = rdSt.ok ? ` · 夹签: r${rdSt.localRev}/r${rdSt.serverRev}` : '';
  const detailSummary = `笔记: r${notesSt.localRev}/r${notesSt.serverRev}${mmRev}${rdRev} · 待提交: ${totalPending} · 待拉取: ${totalIncoming} · 上次同步: ${lastTime}`;

  const nextState: UnifiedSyncState = {
    ...prev,
    ready: true,
    badgeState: combinedState,
    badgeLabel: SYNC_BADGE_LABELS[combinedState] || '已校验',
    notes: notesSt,
    mindmaps: mmSt,
    reading: rdSt,
    totalPending,
    totalIncoming,
    lastSyncAt,
    statusSummary,
    detailSummary,
    localMetaText,
    cloudMetaText,
    busyAction: 'none',
  };

  $syncState.set(nextState);
  $syncFlowMode.set(combinedState === 'latest' ? 'synced' : 'idle');
  return nextState;
}

export async function refreshUnifiedSyncStatus(adapters?: SyncAdaptersBundle): Promise<UnifiedSyncState> {
  const { notes, mindmaps, reading } = resolveWindowAdapters(adapters);
  if (!notes || typeof notes.checkSyncStatus !== 'function') {
    const prev = $syncState.get();
    const unready: UnifiedSyncState = {
      ...prev,
      ready: false,
      statusSummary: '同步模块尚未就绪',
      busyAction: 'none',
    };
    $syncState.set(unready);
    return unready;
  }

  $syncState.setKey('badgeState', 'checking');
  $syncState.setKey('badgeLabel', '校验中…');
  $syncState.setKey('busyAction', 'check');
  if ($syncFlowMode.get() === 'idle') {
    $syncFlowMode.set('checking');
  }

  try {
    const [notesSt, mmSt, rdSt] = await Promise.all([
      notes.checkSyncStatus(),
      mindmaps?.checkSyncStatus ? mindmaps.checkSyncStatus() : Promise.resolve(null),
      reading?.checkSyncStatus ? reading.checkSyncStatus() : Promise.resolve(null),
    ]);
    return applySyncStatusSnapshots(notesSt, mmSt, rdSt);
  } catch {
    const prev = $syncState.get();
    const failed: UnifiedSyncState = {
      ...prev,
      ready: true,
      badgeState: 'error',
      badgeLabel: '校验失败',
      statusSummary: '网络异常，无法校验最新状态',
      busyAction: 'none',
    };
    $syncState.set(failed);
    $syncFlowMode.set('error');
    return failed;
  }
}

export async function runUnifiedPushSync(adapters?: SyncAdaptersBundle): Promise<{
  ok: boolean;
  ready: boolean;
  totalPushed: number;
  notesPushed: number;
  mindmapsPushed: number;
  readingPushed: number;
  reason?: string;
}> {
  const { notes, mindmaps, reading } = resolveWindowAdapters(adapters);
  if (!notes || typeof notes.pushSync !== 'function') {
    return {
      ok: false,
      ready: false,
      totalPushed: 0,
      notesPushed: 0,
      mindmapsPushed: 0,
      readingPushed: 0,
      reason: 'not-ready',
    };
  }

  $syncState.setKey('busyAction', 'push');
  $syncFlowMode.set('pushing');

  try {
    const [nRes, mRes, rRes] = await Promise.all([
      notes.pushSync(),
      mindmaps?.pushSync ? mindmaps.pushSync() : Promise.resolve({ ok: true, pushedCount: 0 }),
      reading?.pushSync ? reading.pushSync() : Promise.resolve({ ok: true, pushedCount: 0 }),
    ]);
    const notesPushed = Number(nRes.pushedCount || 0);
    const mindmapsPushed = Number(mRes.pushedCount || 0);
    const readingPushed = Number(rRes.pushedCount || 0);
    const totalPushed = notesPushed + mindmapsPushed + readingPushed;

    if (nRes.ok && mRes.ok && rRes.ok) {
      await refreshUnifiedSyncStatus(adapters);
      return {
        ok: true,
        ready: true,
        totalPushed,
        notesPushed,
        mindmapsPushed,
        readingPushed,
      };
    }

    const reason = (!nRes.ok ? nRes.reason : !mRes.ok ? mRes.reason : rRes.reason) || '网络错误';
    $syncState.setKey('busyAction', 'none');
    $syncFlowMode.set('error');
    return {
      ok: false,
      ready: true,
      totalPushed,
      notesPushed,
      mindmapsPushed,
      readingPushed,
      reason,
    };
  } catch (err: unknown) {
    $syncState.setKey('busyAction', 'none');
    $syncFlowMode.set('error');
    return {
      ok: false,
      ready: true,
      totalPushed: 0,
      notesPushed: 0,
      mindmapsPushed: 0,
      readingPushed: 0,
      reason: err instanceof Error ? err.message : '未知错误',
    };
  }
}

export async function runUnifiedPullSync(adapters?: SyncAdaptersBundle): Promise<{
  ok: boolean;
  ready: boolean;
  totalPulled: number;
  notesPulled: number;
  mindmapsPulled: number;
  readingPulled: number;
  reason?: string;
}> {
  const { notes, mindmaps, reading } = resolveWindowAdapters(adapters);
  if (!notes || typeof notes.pullSync !== 'function') {
    return {
      ok: false,
      ready: false,
      totalPulled: 0,
      notesPulled: 0,
      mindmapsPulled: 0,
      readingPulled: 0,
      reason: 'not-ready',
    };
  }

  $syncState.setKey('busyAction', 'pull');
  $syncFlowMode.set('pulling');

  try {
    const [nRes, mRes, rRes] = await Promise.all([
      notes.pullSync(),
      mindmaps?.pullSync ? mindmaps.pullSync() : Promise.resolve({ ok: true, pulledCount: 0 }),
      reading?.pullSync ? reading.pullSync() : Promise.resolve({ ok: true, pulledCount: 0 }),
    ]);
    const notesPulled = Number(nRes.pulledCount || 0);
    const mindmapsPulled = Number(mRes.pulledCount || 0);
    const readingPulled = Number(rRes.pulledCount || 0);
    const totalPulled = notesPulled + mindmapsPulled + readingPulled;

    if (nRes.ok && mRes.ok && rRes.ok) {
      await refreshUnifiedSyncStatus(adapters);
      return {
        ok: true,
        ready: true,
        totalPulled,
        notesPulled,
        mindmapsPulled,
        readingPulled,
      };
    }

    const reason = (!nRes.ok ? nRes.reason : !mRes.ok ? mRes.reason : rRes.reason) || '网络错误';
    $syncState.setKey('busyAction', 'none');
    $syncFlowMode.set('error');
    return {
      ok: false,
      ready: true,
      totalPulled,
      notesPulled,
      mindmapsPulled,
      readingPulled,
      reason,
    };
  } catch (err: unknown) {
    $syncState.setKey('busyAction', 'none');
    $syncFlowMode.set('error');
    return {
      ok: false,
      ready: true,
      totalPulled: 0,
      notesPulled: 0,
      mindmapsPulled: 0,
      readingPulled: 0,
      reason: err instanceof Error ? err.message : '未知错误',
    };
  }
}

export async function runUnifiedBidirectionalSync(
  options: { migrate?: boolean } = { migrate: true },
  adapters?: SyncAdaptersBundle
): Promise<{
  ok: boolean;
  ready: boolean;
  notesPushed: number;
  mindmapsPushed: number;
  readingPushed: number;
  notesPulled: number;
  mindmapsPulled: number;
  readingPulled: number;
  reason?: string;
}> {
  const { notes, mindmaps, reading } = resolveWindowAdapters(adapters);
  if (!notes || typeof notes.syncNow !== 'function') {
    return {
      ok: false,
      ready: false,
      notesPushed: 0,
      mindmapsPushed: 0,
      readingPushed: 0,
      notesPulled: 0,
      mindmapsPulled: 0,
      readingPulled: 0,
      reason: 'not-ready',
    };
  }

  $syncState.setKey('busyAction', 'bidirectional');
  $syncFlowMode.set('bidirectional');

  try {
    const [nRes, mRes, rRes] = await Promise.all([
      notes.syncNow(options),
      mindmaps?.syncNow ? mindmaps.syncNow(options) : Promise.resolve({ ok: true, pushedCount: 0, pulledCount: 0 }),
      reading?.syncNow ? reading.syncNow(options) : Promise.resolve({ ok: true, pushedCount: 0, pulledCount: 0 }),
    ]);

    const notesPushed = Number(nRes.pushedCount || 0);
    const mindmapsPushed = Number(mRes.pushedCount || 0);
    const readingPushed = Number(rRes.pushedCount || 0);
    const notesPulled = Number(nRes.pulledCount || 0);
    const mindmapsPulled = Number(mRes.pulledCount || 0);
    const readingPulled = Number(rRes.pulledCount || 0);

    if (nRes.ok && mRes.ok && rRes.ok) {
      await refreshUnifiedSyncStatus(adapters);
      return {
        ok: true,
        ready: true,
        notesPushed,
        mindmapsPushed,
        readingPushed,
        notesPulled,
        mindmapsPulled,
        readingPulled,
      };
    }

    const reason = (!nRes.ok ? nRes.reason : !mRes.ok ? mRes.reason : rRes.reason) || '网络错误';
    $syncState.setKey('busyAction', 'none');
    $syncFlowMode.set('error');
    return {
      ok: false,
      ready: true,
      notesPushed,
      mindmapsPushed,
      readingPushed,
      notesPulled,
      mindmapsPulled,
      readingPulled,
      reason,
    };
  } catch (err: unknown) {
    $syncState.setKey('busyAction', 'none');
    $syncFlowMode.set('error');
    return {
      ok: false,
      ready: true,
      notesPushed: 0,
      mindmapsPushed: 0,
      readingPushed: 0,
      notesPulled: 0,
      mindmapsPulled: 0,
      readingPulled: 0,
      reason: err instanceof Error ? err.message : '未知错误',
    };
  }
}

export function resetSyncStore(): void {
  $syncFlowMode.set('checking');
  $syncSession.set({
    authenticated: false,
    username: '',
    statusTitle: '同步就绪',
    activeAuthTab: 'login',
  });
  $syncState.set(createInitialUnifiedSyncState());
}
