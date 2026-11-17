/**
 * mindmapSync.ts — 思维导图与动态分类的跨设备增量同步（Local-First + LWW）
 *
 * - 本地始终以 localStorage 为准，离线完全可读写；
 * - 登录后把 dirty 导图 / 删除墓碑 / 分类配置推到 /api/mindmaps/sync，再合并服务端增量；
 * - 冲突按 updatedAt 做 Last-Write-Wins（同时间戳服务端优先）；
 * - 首次登录（lastRev === 0）自动将本机已有导图全量上行迁移。
 */

import {
  loadAllMindMaps,
  loadMindMapCategoryState,
  normalizeMindMapRecord,
  sanitizeCategoryList,
  saveAllMindMaps,
  saveMindMapCategoryState,
  type MindMapRecord,
} from './mindmapEngine.ts';

const LAST_REV_KEY = 'areSet_mindmaps_last_rev';
const LAST_SYNC_KEY = 'areSet_mindmaps_last_sync_at';
const INIT_KEY = '__areSetMindmapsSyncInit';

let syncing = false;
let timer: number | null = null;

export interface MindMapSyncStatusSummary {
  lastSyncAt: number;
  pending: number;
  rev: number;
}

export interface MindMapDetailedSyncStatus {
  ok: boolean;
  isLatest: boolean;
  state: 'latest' | 'ahead' | 'behind' | 'diverged' | 'need-login' | 'error';
  localRev: number;
  serverRev: number;
  pendingCount: number;
  incomingCount: number;
  lastSyncAt: number;
  lastCheckAt: number;
  reason?: string;
  message?: string;
}

export interface MindMapPushResult {
  ok: boolean;
  pushedCount: number;
  rev?: number;
  reason?: string;
  message?: string;
}

export interface MindMapPullResult {
  ok: boolean;
  pulledCount: number;
  rev?: number;
  reason?: string;
  message?: string;
}

export interface MindMapSyncNowResult {
  ok: boolean;
  pushedCount: number;
  pulledCount: number;
  rev?: number;
  reason?: string;
}

function readNumber(key: string): number {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {}
}

export function pendingMindMapCount(): number {
  const dirtyMaps = loadAllMindMaps().filter((item) => item.dirty || item.deleted).length;
  const catDirty = loadMindMapCategoryState().dirty ? 1 : 0;
  return dirtyMaps + catDirty;
}

export function getMindMapSyncStatus(): MindMapSyncStatusSummary {
  return {
    lastSyncAt: readNumber(LAST_SYNC_KEY),
    pending: pendingMindMapCount(),
    rev: readNumber(LAST_REV_KEY),
  };
}

function stripLocal(record: MindMapRecord): MindMapRecord {
  const { dirty, serverRev, ...rest } = record;
  return rest;
}

const MAX_BATCH = 50;
const MAX_BATCH_BYTES = 1_200_000;

function chunkForSync(records: MindMapRecord[]): MindMapRecord[][] {
  const chunks: MindMapRecord[][] = [];
  let current: MindMapRecord[] = [];
  let bytes = 0;
  for (const record of records) {
    const size = JSON.stringify(stripLocal(record)).length + 1;
    if (current.length && (current.length >= MAX_BATCH || bytes + size > MAX_BATCH_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(record);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function markPushedMapsClean(pushed: Map<string, number>, pushedCatAt?: number): void {
  const all = loadAllMindMaps();
  let changed = false;
  const remaining: MindMapRecord[] = [];

  for (const record of all) {
    const pushedAt = pushed.get(record.id);
    if (pushedAt !== undefined) {
      const currentAt = Number(record.updatedAt || record.createdAt || 0);
      if (currentAt > pushedAt) {
        remaining.push(record);
        continue;
      }
      if (record.deleted) {
        changed = true;
        continue;
      }
      if (record.dirty) {
        remaining.push({ ...record, dirty: false });
        changed = true;
        continue;
      }
    }
    remaining.push(record);
  }
  if (changed) {
    saveAllMindMaps(remaining, false);
  }

  if (pushedCatAt !== undefined) {
    const cat = loadMindMapCategoryState();
    if (cat.dirty && cat.updatedAt <= pushedCatAt) {
      saveMindMapCategoryState({ ...cat, dirty: false }, false);
    }
  }
}

function mergeServerMaps(
  serverMaps: MindMapRecord[],
  serverCategories?: string[],
  serverCatUpdatedAt?: number
): void {
  if (serverMaps.length > 0) {
    const map = new Map<string, MindMapRecord>();
    for (const item of loadAllMindMaps()) {
      map.set(item.id, item);
    }
    for (const incomingRaw of serverMaps) {
      const incoming = normalizeMindMapRecord(incomingRaw);
      if (!incoming) continue;
      if (incoming.deleted) {
        const local = map.get(incoming.id);
        if (local && local.dirty && Number(local.updatedAt || 0) > Number(incoming.updatedAt || 0)) {
          continue;
        }
        map.delete(incoming.id);
        continue;
      }
      const local = map.get(incoming.id);
      if (local && local.dirty && Number(local.updatedAt || local.createdAt) > Number(incoming.updatedAt || 0)) {
        continue;
      }
      map.set(incoming.id, { ...incoming, dirty: false, deleted: false });
    }
    const cleaned: MindMapRecord[] = [];
    for (const item of map.values()) {
      if (item.deleted && !item.dirty) continue;
      cleaned.push(item);
    }
    saveAllMindMaps(cleaned, false);
  }

  if (Array.isArray(serverCategories) && serverCategories.length > 0 && Number(serverCatUpdatedAt) > 0) {
    const localCat = loadMindMapCategoryState();
    if (!localCat.dirty || Number(serverCatUpdatedAt) >= Number(localCat.updatedAt || 0)) {
      saveMindMapCategoryState(
        {
          categories: sanitizeCategoryList(serverCategories),
          updatedAt: Number(serverCatUpdatedAt),
          dirty: false,
        },
        false
      );
    }
  }
}

async function fetchCurrentUser(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkMindMapSyncStatus(): Promise<MindMapDetailedSyncStatus> {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      isLatest: false,
      state: 'error',
      localRev: 0,
      serverRev: 0,
      pendingCount: 0,
      incomingCount: 0,
      lastSyncAt: 0,
      lastCheckAt: Date.now(),
      reason: 'no-window',
    };
  }

  const localRev = readNumber(LAST_REV_KEY);
  const pending = pendingMindMapCount();
  const lastSyncAt = readNumber(LAST_SYNC_KEY);

  const loggedIn = await fetchCurrentUser();
  if (!loggedIn) {
    return {
      ok: false,
      isLatest: false,
      state: 'need-login',
      localRev,
      serverRev: 0,
      pendingCount: pending,
      incomingCount: 0,
      lastSyncAt,
      lastCheckAt: Date.now(),
      reason: 'need-login',
      message: '未登录，导图仅保存在本机',
    };
  }

  try {
    let serverRev = localRev;
    let incomingCount = 0;

    const statusRes = await fetch(`/api/mindmaps/status?since=${localRev}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).catch(() => null);

    if (statusRes && statusRes.ok) {
      const data = await statusRes.json().catch(() => ({}));
      serverRev = Number(data.rev) || 0;
      incomingCount = Number(data.incomingCount) || 0;
    } else {
      const syncRes = await fetch('/api/mindmaps/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: localRev, changes: [] }),
      });
      if (syncRes.ok) {
        const data = await syncRes.json().catch(() => ({}));
        serverRev = Number(data.rev) || localRev;
        incomingCount = Array.isArray(data.changes) ? data.changes.length : 0;
      }
    }

    const ahead = pending > 0;
    const behind = incomingCount > 0 || serverRev > localRev;

    let state: MindMapDetailedSyncStatus['state'] = 'latest';
    let message = '导图已是最新，与云端完全同步';

    if (ahead && behind) {
      state = 'diverged';
      message = `本地有 ${pending} 项导图待提交，云端有 ${incomingCount} 项待拉取`;
    } else if (ahead) {
      state = 'ahead';
      message = `本地有 ${pending} 项导图改动待提交`;
    } else if (behind) {
      state = 'behind';
      message = `云端有 ${incomingCount || (serverRev - localRev)} 项导图更新待拉取`;
    }

    return {
      ok: true,
      isLatest: state === 'latest',
      state,
      localRev,
      serverRev,
      pendingCount: pending,
      incomingCount,
      lastSyncAt,
      lastCheckAt: Date.now(),
      message,
    };
  } catch (err) {
    console.warn('[mindmapSync] checkSyncStatus failed:', err);
    return {
      ok: false,
      isLatest: false,
      state: 'error',
      localRev,
      serverRev: 0,
      pendingCount: pending,
      incomingCount: 0,
      lastSyncAt,
      lastCheckAt: Date.now(),
      reason: 'network',
      message: '网络异常，无法校验云端导图状态',
    };
  }
}

function emitMindMapSyncPhase(
  mode: 'push' | 'pull' | 'bidirectional',
  phase: 'start' | 'done' | 'error',
  extra: Record<string, unknown> = {}
): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('mindmaps:sync-phase', {
          detail: { mode, phase, timestamp: Date.now(), ...extra },
        })
      );
    }
  } catch {}
}

export async function pushMindMapSync(
  options: { migrate?: boolean; forceAll?: boolean } = {}
): Promise<MindMapPushResult> {
  if (syncing) return { ok: false, pushedCount: 0, reason: 'busy' };
  if (typeof window === 'undefined') return { ok: false, pushedCount: 0, reason: 'no-window' };

  syncing = true;
  emitMindMapSyncPhase('push', 'start');
  try {
    if (!(await fetchCurrentUser())) {
      emitMindMapSyncPhase('push', 'error', { reason: 'need-login' });
      return { ok: false, pushedCount: 0, reason: 'need-login' };
    }

    const all = loadAllMindMaps();
    const catState = loadMindMapCategoryState();
    const since = readNumber(LAST_REV_KEY);
    const migrate = Boolean(options.migrate) || Boolean(options.forceAll) || since === 0;
    const candidates = migrate ? all : all.filter((item) => item.dirty || item.deleted);
    const shouldPushCategories = migrate || Boolean(catState.dirty);

    if (candidates.length === 0 && !shouldPushCategories) {
      return { ok: true, pushedCount: 0, reason: 'nothing-to-push', message: '本地暂无待提交的导图更改' };
    }

    const chunks = chunkForSync(candidates);
    const batches = chunks.length > 0 ? chunks : [[]];
    let cursor = since;
    let pushedCount = 0;

    for (let i = 0; i < batches.length; i += 1) {
      const chunk = batches[i];
      const payload: Record<string, unknown> = {
        since: cursor,
        changes: chunk.map(stripLocal),
      };
      if (i === 0 && shouldPushCategories) {
        payload.categories = catState.categories;
        payload.categoriesUpdatedAt = catState.updatedAt || Date.now();
      }
      const res = await fetch('/api/mindmaps/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, pushedCount, reason: data?.error || `http-${res.status}` };
      }
      cursor = Number(data.rev) || cursor;
      pushedCount += chunk.length;
      markPushedMapsClean(
        new Map(chunk.map((c) => [c.id, Number(c.updatedAt || c.createdAt || 0)])),
        i === 0 && shouldPushCategories ? (catState.updatedAt || Date.now()) : undefined
      );
    }

    if (cursor > since) writeNumber(LAST_REV_KEY, cursor);
    writeNumber(LAST_SYNC_KEY, Date.now());
    window.dispatchEvent(new CustomEvent('mindmaps:synced'));
    emitMindMapSyncPhase('push', 'done', { pushedCount, rev: cursor });

    return {
      ok: true,
      pushedCount,
      rev: cursor,
      message: pushedCount > 0 ? `成功提交 ${pushedCount} 张导图到云端` : '导图分类已同步至云端',
    };
  } catch (err) {
    console.warn('[mindmapSync] pushSync failed:', err);
    emitMindMapSyncPhase('push', 'error', { reason: 'network' });
    return { ok: false, pushedCount: 0, reason: 'network' };
  } finally {
    syncing = false;
  }
}

export async function pullMindMapSync(
  options: { forceFull?: boolean } = {}
): Promise<MindMapPullResult> {
  if (syncing) return { ok: false, pulledCount: 0, reason: 'busy' };
  if (typeof window === 'undefined') return { ok: false, pulledCount: 0, reason: 'no-window' };

  syncing = true;
  emitMindMapSyncPhase('pull', 'start');
  try {
    if (!(await fetchCurrentUser())) {
      emitMindMapSyncPhase('pull', 'error', { reason: 'need-login' });
      return { ok: false, pulledCount: 0, reason: 'need-login' };
    }

    const since = options.forceFull ? 0 : readNumber(LAST_REV_KEY);
    let cursor = since;
    let totalPulled = 0;

    for (let page = 0; page < 10; page += 1) {
      const res = await fetch('/api/mindmaps/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: cursor, changes: [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, pulledCount: totalPulled, reason: data?.error || `http-${res.status}` };
      }
      const incoming = Array.isArray(data.changes) ? data.changes : [];
      mergeServerMaps(incoming, data.categories, data.categoriesUpdatedAt);
      if (incoming.length > 0) totalPulled += incoming.length;
      cursor = Number(data.rev) || cursor;
      if (!data.hasMore) break;
    }

    writeNumber(LAST_REV_KEY, cursor);
    writeNumber(LAST_SYNC_KEY, Date.now());
    window.dispatchEvent(new CustomEvent('mindmaps:synced'));
    emitMindMapSyncPhase('pull', 'done', { pulledCount: totalPulled, rev: cursor });

    return {
      ok: true,
      pulledCount: totalPulled,
      rev: cursor,
      message: totalPulled > 0 ? `成功从云端拉取 ${totalPulled} 张最新导图` : '云端暂无新导图，本地已是最新',
    };
  } catch (err) {
    console.warn('[mindmapSync] pullSync failed:', err);
    emitMindMapSyncPhase('pull', 'error', { reason: 'network' });
    return { ok: false, pulledCount: 0, reason: 'network' };
  } finally {
    syncing = false;
  }
}

export async function syncMindMapsNow(
  options: { migrate?: boolean } = {}
): Promise<MindMapSyncNowResult> {
  if (syncing) return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'busy' };
  if (typeof window === 'undefined') return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'no-window' };

  syncing = true;
  emitMindMapSyncPhase('bidirectional', 'start');
  try {
    if (!(await fetchCurrentUser())) {
      emitMindMapSyncPhase('bidirectional', 'error', { reason: 'need-login' });
      return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'need-login' };
    }

    const all = loadAllMindMaps();
    const catState = loadMindMapCategoryState();
    const since = readNumber(LAST_REV_KEY);
    const migrate = Boolean(options.migrate) || since === 0;
    const candidates = migrate ? all : all.filter((item) => item.dirty || item.deleted);
    const shouldPushCategories = migrate || Boolean(catState.dirty);

    let cursor = since;
    let totalPulled = 0;
    let pushedCount = 0;
    const chunks = chunkForSync(candidates);
    const batches = chunks.length > 0 ? chunks : [[]];
    let hasMorePull = false;

    for (let i = 0; i < batches.length; i += 1) {
      const chunk = batches[i];
      const payload: Record<string, unknown> = {
        since: cursor,
        changes: chunk.map(stripLocal),
      };
      if (i === 0 && shouldPushCategories) {
        payload.categories = catState.categories;
        payload.categoriesUpdatedAt = catState.updatedAt || Date.now();
      }
      const res = await fetch('/api/mindmaps/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          pushedCount,
          pulledCount: totalPulled,
          reason: data?.error || `http-${res.status}`,
        };
      }
      const incoming = Array.isArray(data.changes) ? data.changes : [];
      mergeServerMaps(incoming, data.categories, data.categoriesUpdatedAt);
      if (incoming.length > 0) totalPulled += incoming.length;
      cursor = Number(data.rev) || cursor;
      pushedCount += chunk.length;
      hasMorePull = Boolean(data.hasMore);
      markPushedMapsClean(
        new Map(chunk.map((c) => [c.id, Number(c.updatedAt || c.createdAt || 0)])),
        i === 0 && shouldPushCategories ? (catState.updatedAt || Date.now()) : undefined
      );
    }

    if (hasMorePull) {
      for (let page = 0; page < 10; page += 1) {
        const res = await fetch('/api/mindmaps/sync', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ since: cursor, changes: [] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            ok: false,
            pushedCount,
            pulledCount: totalPulled,
            reason: data?.error || `http-${res.status}`,
          };
        }
        const incoming = Array.isArray(data.changes) ? data.changes : [];
        mergeServerMaps(incoming, data.categories, data.categoriesUpdatedAt);
        if (incoming.length > 0) totalPulled += incoming.length;
        cursor = Number(data.rev) || cursor;
        if (!data.hasMore) break;
      }
    }

    writeNumber(LAST_REV_KEY, cursor);
    writeNumber(LAST_SYNC_KEY, Date.now());
    window.dispatchEvent(new CustomEvent('mindmaps:synced'));
    emitMindMapSyncPhase('bidirectional', 'done', { pushedCount, pulledCount: totalPulled, rev: cursor });

    return {
      ok: true,
      pushedCount,
      pulledCount: totalPulled,
      rev: cursor,
    };
  } catch (err) {
    console.warn('[mindmapSync] syncNow failed:', err);
    emitMindMapSyncPhase('bidirectional', 'error', { reason: 'network' });
    return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'network' };
  } finally {
    syncing = false;
  }
}

function scheduleSync(): void {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void syncMindMapsNow();
  }, 1200);
}

export function initMindmapSync(): void {
  if (typeof window === 'undefined') return;
  if ((window as any)[INIT_KEY]) return;
  (window as any)[INIT_KEY] = true;

  (window as any).__mindmapsSync = {
    syncNow: syncMindMapsNow,
    pushSync: pushMindMapSync,
    pullSync: pullMindMapSync,
    checkSyncStatus: checkMindMapSyncStatus,
    status: getMindMapSyncStatus,
    pendingCount: pendingMindMapCount,
  };

  document.addEventListener('mindmaps:changed', scheduleSync);
  window.addEventListener('online', () => void syncMindMapsNow());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void syncMindMapsNow();
  });

  window.setTimeout(() => {
    void fetchCurrentUser().then((loggedIn) => {
      if (loggedIn) void syncMindMapsNow();
    });
  }, 1050);
}
