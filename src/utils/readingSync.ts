/**
 * readingSync.ts — 「夹签续读」阅读进度与手动夹签跨设备增量同步（Local-First + LWW）
 *
 * - 本地始终以 localStorage 为准，离线与纯静态部署（如 GitHub Pages）完全可用；
 * - 走 /api/notes/reading/* 路由，兼容现有线上 Nginx `^/api/(...|notes(/.*)?|...)$` 反代规则，零运维改动；
 * - 登录后自动将本地进度与夹签按 updatedAt 双向合并（同时间戳服务端优先），首次登录自动全量迁移。
 */

import {
  loadAllReadingEntries,
  normalizeReadingEntry,
  pendingReadingCount,
  saveAllReadingEntries,
  type ReadingEntry,
} from './readingBookmarkEngine.ts';

const LAST_REV_KEY = 'areSet_reading_last_rev';
const LAST_SYNC_KEY = 'areSet_reading_last_sync_at';
const INIT_KEY = '__areSetReadingSyncInit';
const API_BASE = '/api/notes/reading';

let syncing = false;
let syncTimer: number | null = null;

export interface ReadingSyncStatusSummary {
  lastSyncAt: number;
  pending: number;
  rev: number;
}

export interface ReadingDetailedSyncStatus {
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

export interface ReadingPushResult {
  ok: boolean;
  pushedCount: number;
  rev?: number;
  reason?: string;
}

export interface ReadingPullResult {
  ok: boolean;
  pulledCount: number;
  rev?: number;
  reason?: string;
}

export interface ReadingSyncNowResult {
  ok: boolean;
  pushedCount: number;
  pulledCount: number;
  rev?: number;
  reason?: string;
}

function readNumber(key: string): number {
  try {
    const val = Number(window.localStorage.getItem(key));
    return Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {}
}

export function getReadingSyncStatus(): ReadingSyncStatusSummary {
  return {
    lastSyncAt: readNumber(LAST_SYNC_KEY),
    pending: pendingReadingCount(),
    rev: readNumber(LAST_REV_KEY),
  };
}

function stripLocal(entry: ReadingEntry): ReadingEntry {
  const { dirty, serverRev, ...rest } = entry;
  return rest as ReadingEntry;
}

const MAX_BATCH = 180;
const MAX_BATCH_BYTES = 700_000;

function chunkEntries(entries: ReadingEntry[]): ReadingEntry[][] {
  const chunks: ReadingEntry[][] = [];
  let current: ReadingEntry[] = [];
  let bytes = 0;
  for (const item of entries) {
    const size = JSON.stringify(stripLocal(item)).length + 1;
    if (current.length && (current.length >= MAX_BATCH || bytes + size > MAX_BATCH_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function fetchLoggedIn(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Boolean(data?.user?.id);
  } catch {
    return false;
  }
}

/**
 * 合并服务端返回的阅读进度与夹签记录（LWW：服务端同时间戳优先）
 */
export function mergeServerReadingEntries(
  incomingRaw: unknown[],
  customStorage?: Storage | null
): number {
  if (!Array.isArray(incomingRaw) || incomingRaw.length === 0) return 0;
  const local = loadAllReadingEntries(customStorage);
  const byId = new Map<string, ReadingEntry>(local.map((e) => [e.id, e]));
  let applied = 0;

  for (const raw of incomingRaw) {
    const serverEntry = normalizeReadingEntry(raw);
    if (!serverEntry) continue;
    const cur = byId.get(serverEntry.id);
    if (cur && cur.dirty && cur.updatedAt > serverEntry.updatedAt) {
      // 本地尚未推送的新修改更新：保留本地版本
      continue;
    }
    if (serverEntry.deleted) {
      if (byId.has(serverEntry.id)) {
        byId.delete(serverEntry.id);
        applied += 1;
      }
      continue;
    }
    byId.set(serverEntry.id, { ...serverEntry, dirty: false });
    applied += 1;
  }

  if (applied > 0) {
    saveAllReadingEntries([...byId.values()], false, customStorage);
  }
  return applied;
}

function markPushedReadingClean(pushed: Map<string, number>): void {
  const all = loadAllReadingEntries();
  let changed = false;
  const remaining: ReadingEntry[] = [];

  for (const item of all) {
    const pushedAt = pushed.get(item.id);
    if (pushedAt !== undefined) {
      if (item.updatedAt > pushedAt) {
        remaining.push(item);
        continue;
      }
      if (item.deleted) {
        changed = true;
        continue;
      }
      if (item.dirty) {
        remaining.push({ ...item, dirty: false });
        changed = true;
        continue;
      }
    }
    remaining.push(item);
  }

  if (changed) {
    saveAllReadingEntries(remaining, false);
  }
}

export async function checkReadingSyncStatus(): Promise<ReadingDetailedSyncStatus> {
  const localRev = readNumber(LAST_REV_KEY);
  const pendingCount = pendingReadingCount();
  const lastSyncAt = readNumber(LAST_SYNC_KEY);
  const lastCheckAt = Date.now();

  try {
    const res = await fetch(`${API_BASE}/status?since=${localRev}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (res.status === 401) {
      return {
        ok: false,
        isLatest: false,
        state: 'need-login',
        localRev,
        serverRev: 0,
        pendingCount,
        incomingCount: 0,
        lastSyncAt,
        lastCheckAt,
        reason: 'need-login',
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        isLatest: false,
        state: 'error',
        localRev,
        serverRev: 0,
        pendingCount,
        incomingCount: 0,
        lastSyncAt,
        lastCheckAt,
        reason: `http-${res.status}`,
      };
    }
    const data = await res.json().catch(() => ({}));
    const serverRev = Number(data.rev) || 0;
    const incomingCount = Number(data.incomingCount) || 0;
    const ahead = pendingCount > 0;
    const behind = incomingCount > 0 || serverRev > localRev;
    const state = ahead && behind ? 'diverged' : ahead ? 'ahead' : behind ? 'behind' : 'latest';

    return {
      ok: true,
      isLatest: state === 'latest',
      state,
      localRev,
      serverRev,
      pendingCount,
      incomingCount,
      lastSyncAt,
      lastCheckAt,
    };
  } catch {
    return {
      ok: false,
      isLatest: false,
      state: 'error',
      localRev,
      serverRev: 0,
      pendingCount,
      incomingCount: 0,
      lastSyncAt,
      lastCheckAt,
      reason: 'network',
    };
  }
}

export async function pushReadingSync(): Promise<ReadingPushResult> {
  if (syncing) return { ok: false, pushedCount: 0, reason: 'busy' };
  syncing = true;
  try {
    if (!(await fetchLoggedIn())) return { ok: false, pushedCount: 0, reason: 'need-login' };
    const since = readNumber(LAST_REV_KEY);
    const all = loadAllReadingEntries();
    const candidates = since === 0 ? all : all.filter((e) => e.dirty || e.deleted);
    if (candidates.length === 0) {
      return { ok: true, pushedCount: 0, rev: since };
    }

    let cursor = since;
    let pushedCount = 0;
    for (const chunk of chunkEntries(candidates)) {
      const res = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: cursor, changes: chunk.map(stripLocal) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, pushedCount, reason: data?.error || `http-${res.status}` };
      }
      const incoming = Array.isArray(data.changes) ? data.changes : [];
      if (incoming.length > 0) mergeServerReadingEntries(incoming);
      cursor = Number(data.rev) || cursor;
      pushedCount += chunk.length;
      markPushedReadingClean(new Map(chunk.map((c) => [c.id, c.updatedAt])));
    }

    writeNumber(LAST_REV_KEY, cursor);
    writeNumber(LAST_SYNC_KEY, Date.now());
    window.dispatchEvent(new CustomEvent('reading:synced'));
    return { ok: true, pushedCount, rev: cursor };
  } catch {
    return { ok: false, pushedCount: 0, reason: 'network' };
  } finally {
    syncing = false;
  }
}

export async function pullReadingSync(): Promise<ReadingPullResult> {
  if (syncing) return { ok: false, pulledCount: 0, reason: 'busy' };
  syncing = true;
  try {
    if (!(await fetchLoggedIn())) return { ok: false, pulledCount: 0, reason: 'need-login' };
    let cursor = readNumber(LAST_REV_KEY);
    let pulledCount = 0;

    for (let page = 0; page < 5; page += 1) {
      const res = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: cursor, changes: [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, pulledCount, reason: data?.error || `http-${res.status}` };
      }
      const incoming = Array.isArray(data.changes) ? data.changes : [];
      if (incoming.length > 0) {
        pulledCount += mergeServerReadingEntries(incoming);
      }
      cursor = Number(data.rev) || cursor;
      if (!data.hasMore) break;
    }

    writeNumber(LAST_REV_KEY, cursor);
    writeNumber(LAST_SYNC_KEY, Date.now());
    if (pulledCount > 0) {
      window.dispatchEvent(new CustomEvent('reading:synced'));
    }
    return { ok: true, pulledCount, rev: cursor };
  } catch {
    return { ok: false, pulledCount: 0, reason: 'network' };
  } finally {
    syncing = false;
  }
}

export async function syncReadingNow(options: { migrate?: boolean } = {}): Promise<ReadingSyncNowResult> {
  if (syncing) return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'busy' };
  if (typeof window === 'undefined') return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'no-window' };

  syncing = true;
  try {
    if (!(await fetchLoggedIn())) {
      return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'need-login' };
    }

    const all = loadAllReadingEntries();
    const since = readNumber(LAST_REV_KEY);
    const migrate = Boolean(options.migrate) || since === 0;
    const candidates = migrate ? all : all.filter((e) => e.dirty || e.deleted);

    let cursor = since;
    let totalPulled = 0;
    let pushedCount = 0;
    const chunks = chunkEntries(candidates);
    let hasMorePull = chunks.length === 0;

    for (const chunk of chunks) {
      const res = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: cursor, changes: chunk.map(stripLocal) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, pushedCount, pulledCount: totalPulled, reason: data?.error || `http-${res.status}` };
      }
      const incoming = Array.isArray(data.changes) ? data.changes : [];
      if (incoming.length > 0) {
        totalPulled += mergeServerReadingEntries(incoming);
      }
      cursor = Number(data.rev) || cursor;
      pushedCount += chunk.length;
      hasMorePull = Boolean(data.hasMore);
      markPushedReadingClean(new Map(chunk.map((c) => [c.id, c.updatedAt])));
    }

    if (hasMorePull) {
      for (let page = 0; page < 5; page += 1) {
        const res = await fetch(`${API_BASE}/sync`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ since: cursor, changes: [] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { ok: false, pushedCount, pulledCount: totalPulled, reason: data?.error || `http-${res.status}` };
        }
        const incoming = Array.isArray(data.changes) ? data.changes : [];
        if (incoming.length > 0) {
          totalPulled += mergeServerReadingEntries(incoming);
        }
        cursor = Number(data.rev) || cursor;
        if (!data.hasMore) break;
      }
    }

    writeNumber(LAST_REV_KEY, cursor);
    writeNumber(LAST_SYNC_KEY, Date.now());
    window.dispatchEvent(new CustomEvent('reading:synced'));

    return {
      ok: true,
      pushedCount,
      pulledCount: totalPulled,
      rev: cursor,
    };
  } catch {
    return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'network' };
  } finally {
    syncing = false;
  }
}

function scheduleReadingSync(delayMs = 2800): void {
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void syncReadingNow();
  }, delayMs);
}

export function initReadingSync(): void {
  if (typeof window === 'undefined') return;
  if ((window as any)[INIT_KEY]) return;
  (window as any)[INIT_KEY] = true;

  (window as any).__readingSync = {
    syncNow: syncReadingNow,
    pushSync: pushReadingSync,
    pullSync: pullReadingSync,
    checkSyncStatus: checkReadingSyncStatus,
    status: getReadingSyncStatus,
    pendingCount: pendingReadingCount,
  };

  window.addEventListener('reading:changed', () => scheduleReadingSync(2800));
  window.addEventListener('online', () => void syncReadingNow());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void syncReadingNow();
  });

  window.setTimeout(() => {
    void fetchLoggedIn().then((ok) => {
      if (ok) void syncReadingNow();
    });
  }, 1100);
}
