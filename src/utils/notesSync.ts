// 笔记跨设备同步（local-first）
//
// - 本地仍然以 localStorage 为准，离线也能读写；
// - 登录后把 dirty / 删除墓碑推到 /api/notes/sync，再合并服务端返回的增量；
// - 冲突按 updatedAt 做 LWW，服务端同时间优先；
// - 首次登录（lastRev = 0）会自动把本机已有笔记全量推上去，完成迁移。

import {
  loadAllStoredNotes,
  saveHighlights,
  type ArticleHighlightRecord,
} from './articleHighlightEngine.ts';

const LAST_REV_KEY = 'areSet_notes_last_rev';
const LAST_SYNC_KEY = 'areSet_notes_last_sync_at';
const INIT_KEY = '__areSetNotesSyncInit';

let syncing = false;
let timer: number | null = null;

interface SyncStatus {
  lastSyncAt: number;
  pending: number;
  rev: number;
}

function readNumber(key: string): number {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {}
}

export function pendingCount(): number {
  return loadAllStoredNotes()
    .flatMap((bucket) => bucket.records)
    .filter((record) => record.dirty || record.deleted).length;
}

export function getSyncStatus(): SyncStatus {
  return {
    lastSyncAt: readNumber(LAST_SYNC_KEY),
    pending: pendingCount(),
    rev: readNumber(LAST_REV_KEY),
  };
}

function stripLocal(record: ArticleHighlightRecord): ArticleHighlightRecord {
  const { dirty, serverRev, ...rest } = record;
  return rest;
}

function mergeServerNotes(serverNotes: ArticleHighlightRecord[]): void {
  if (!serverNotes.length) return;

  const buckets = new Map<string, Map<string, ArticleHighlightRecord>>();
  for (const bucket of loadAllStoredNotes()) {
    const map = new Map<string, ArticleHighlightRecord>();
    for (const record of bucket.records) map.set(record.id, record);
    buckets.set(bucket.postSlug, map);
  }

  for (const incoming of serverNotes) {
    const slug = incoming.postSlug || '';
    if (!buckets.has(slug)) buckets.set(slug, new Map());
    const map = buckets.get(slug)!;

    if (incoming.deleted) {
      map.delete(incoming.id);
      continue;
    }

    const local = map.get(incoming.id);
    if (local && Number(local.updatedAt || local.timestamp) > Number(incoming.updatedAt || 0) && local.dirty) {
      // 本地还有未推送的更新，保留本地，下一轮继续推
      continue;
    }
    map.set(incoming.id, { ...incoming, dirty: false, deleted: false });
  }

  for (const [slug, map] of buckets.entries()) {
    // 已被服务端确认的墓碑可以真正删掉
    for (const [id, record] of map.entries()) {
      if (record.deleted && !record.dirty) map.delete(id);
    }
    saveHighlights(slug, Array.from(map.values()));
  }
}

async function fetchCurrentUser(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncNow(options: { migrate?: boolean } = {}): Promise<{ ok: boolean; reason?: string }> {
  if (syncing) return { ok: false, reason: 'busy' };
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };

  syncing = true;
  try {
    if (!(await fetchCurrentUser())) return { ok: false, reason: 'need-login' };

    const buckets = loadAllStoredNotes();
    const all = buckets.flatMap((bucket) =>
      bucket.records.map((record) => ({ ...record, postSlug: record.postSlug || bucket.postSlug }))
    );

    const since = readNumber(LAST_REV_KEY);
    const migrate = Boolean(options.migrate) || since === 0;
    const candidates = migrate ? all : all.filter((record) => record.dirty || record.deleted);

    let cursor = since;
    let pendingChanges = candidates.map(stripLocal);

    // 服务端单次最多回 2000 条；多于这个数时按 serverRev 分页拉完
    for (let page = 0; page < 10; page += 1) {
      const res = await fetch('/api/notes/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: cursor, changes: pendingChanges }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, reason: data?.error || `http-${res.status}` };

      mergeServerNotes(Array.isArray(data.changes) ? data.changes : []);
      cursor = Number(data.rev) || cursor;
      pendingChanges = [];
      if (!data.hasMore) break;
    }

    writeNumber(LAST_REV_KEY, cursor);
    writeNumber(LAST_SYNC_KEY, Date.now());
    window.dispatchEvent(new CustomEvent('article-notes:synced'));
    return { ok: true };
  } catch (err) {
    console.warn('[notesSync] sync failed:', err);
    return { ok: false, reason: 'network' };
  } finally {
    syncing = false;
  }
}

function scheduleSync() {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void syncNow();
  }, 1200);
}

/** 安装全局同步器；在文章页与账号页调用一次即可。 */
export function initNotesSync(): void {
  if (typeof window === 'undefined') return;
  if ((window as any)[INIT_KEY]) return;
  (window as any)[INIT_KEY] = true;

  (window as any).__notesSync = {
    syncNow,
    status: getSyncStatus,
  };

  document.addEventListener('article-notes:changed', scheduleSync);
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void syncNow();
  });

  window.setTimeout(() => {
    void fetchCurrentUser().then((loggedIn) => {
      if (loggedIn) void syncNow();
    });
  }, 900);
}
