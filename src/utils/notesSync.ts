// 笔记跨设备同步（local-first）
//
// - 本地仍然以 localStorage 为准，离线也能读写；
// - 登录后把 dirty / 删除墓碑推到 /api/notes/sync，再合并服务端返回的增量；
// - 冲突按 updatedAt 做 LWW，服务端同时间优先；
// - 首次登录（lastRev = 0）会自动把本机已有笔记全量推上去，完成迁移。

import {
  getStorageKey,
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

export interface DetailedSyncStatus {
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

export interface PushSyncResult {
  ok: boolean;
  pushedCount: number;
  rev?: number;
  reason?: string;
  message?: string;
}

export interface PullSyncResult {
  ok: boolean;
  pulledCount: number;
  rev?: number;
  reason?: string;
  message?: string;
}

export interface SyncNowResult {
  ok: boolean;
  pushedCount: number;
  pulledCount: number;
  rev?: number;
  reason?: string;
}

function stripLocal(record: ArticleHighlightRecord): ArticleHighlightRecord {
  const { dirty, serverRev, ...rest } = record;
  return rest;
}

const MAX_BATCH = 200;
const MAX_BATCH_BYTES = 1_200_000;

/**
 * 服务端单次最多接受 200 条、请求体上限 2MB；超出部分会被静默截断。
 * 这里按条数和序列化体积双重切块，避免“本地标成已同步、云端其实没收到”。
 */
function chunkForSync(records: ArticleHighlightRecord[]): ArticleHighlightRecord[][] {
  const chunks: ArticleHighlightRecord[][] = [];
  let current: ArticleHighlightRecord[] = [];
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

/**
 * 只清理“推送时快照与本地当前 updatedAt 一致”的记录。
 * 请求飞行期间又被编辑的记录必须继续保留 dirty，否则下一次 pull 会拿旧版本覆盖它。
 */
function markPushedNotesClean(pushed: Map<string, number>): void {
  for (const bucket of loadAllStoredNotes()) {
    let changed = false;
    const remaining: ArticleHighlightRecord[] = [];
    for (const record of bucket.records) {
      const pushedAt = pushed.get(record.id);
      if (pushedAt !== undefined) {
        const currentAt = Number(record.updatedAt || record.timestamp || 0);
        if (currentAt > pushedAt) {
          // 推送后本地又改过：保留 dirty，下一轮继续推
          remaining.push(record);
          continue;
        }
        if (record.deleted) {
          changed = true;
          // 已成功推送到服务端的墓碑，本地彻底移除
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
      saveHighlights(bucket.postSlug, remaining);
    }
  }
}

function mergeServerNotes(serverNotes: ArticleHighlightRecord[]): void {
  if (!serverNotes.length) return;

  // 关键：以 getStorageKey 作为唯一桶键。
  // `/posts/foo` 与 `/posts/foo/`、以及带下划线的 slug 会映射到同一个 localStorage key，
  // 如果按原始 postSlug 分 Map，最后写盘时就会互相覆盖，把本地笔记删掉。
  const buckets = new Map<string, { slug: string; map: Map<string, ArticleHighlightRecord> }>();
  const ensureBucket = (slug: string) => {
    const key = getStorageKey(slug);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { slug, map: new Map() };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const bucket of loadAllStoredNotes()) {
    const target = ensureBucket(bucket.postSlug);
    for (const record of bucket.records) target.map.set(record.id, record);
  }

  for (const incoming of serverNotes) {
    const bucket = ensureBucket(incoming.postSlug || '');
    const map = bucket.map;

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

  for (const { slug, map } of buckets.values()) {
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

/**
 * 校验本地是否为最新的同步状态
 * 不修改任何本地或云端数据，只进行比对
 */
export async function checkSyncStatus(): Promise<DetailedSyncStatus> {
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
  const pending = pendingCount();
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
      message: '未登录，无法校验云端状态',
    };
  }

  try {
    let serverRev = localRev;
    let incomingCount = 0;

    // 优先尝试轻量级 status 接口
    const statusRes = await fetch(`/api/notes/status?since=${localRev}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).catch(() => null);

    if (statusRes && statusRes.ok) {
      const data = await statusRes.json().catch(() => ({}));
      serverRev = Number(data.rev) || 0;
      incomingCount = Number(data.incomingCount) || 0;
    } else {
      // 兼容旧版服务端回退探测：POST /api/notes/sync with empty changes
      const syncRes = await fetch('/api/notes/sync', {
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

    let state: DetailedSyncStatus['state'] = 'latest';
    let message = '本地已是最新，与云端完全同步';

    if (ahead && behind) {
      state = 'diverged';
      message = `本地有 ${pending} 条待提交，云端有 ${incomingCount} 条待拉取`;
    } else if (ahead) {
      state = 'ahead';
      message = `本地有 ${pending} 条改动待提交同步`;
    } else if (behind) {
      state = 'behind';
      message = `云端有 ${incomingCount || (serverRev - localRev)} 条新更新待拉取`;
    } else {
      state = 'latest';
      message = '本地已是最新，与云端完全同步';
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
    console.warn('[notesSync] checkSyncStatus failed:', err);
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
      message: '网络连接异常，无法获取云端状态',
    };
  }
}

/**
 * 步骤一：提交同步 (Push)
 * 将本地改动（新增、修改、删除墓碑）提交至云端
 */
export async function pushSync(options: { migrate?: boolean; forceAll?: boolean } = {}): Promise<PushSyncResult> {
  if (syncing) return { ok: false, pushedCount: 0, reason: 'busy' };
  if (typeof window === 'undefined') return { ok: false, pushedCount: 0, reason: 'no-window' };

  syncing = true;
  try {
    if (!(await fetchCurrentUser())) return { ok: false, pushedCount: 0, reason: 'need-login' };

    const buckets = loadAllStoredNotes();
    const all = buckets.flatMap((bucket) =>
      bucket.records.map((record) => ({ ...record, postSlug: record.postSlug || bucket.postSlug }))
    );

    const since = readNumber(LAST_REV_KEY);
    const migrate = Boolean(options.migrate) || Boolean(options.forceAll) || since === 0;
    const candidates = migrate ? all : all.filter((record) => record.dirty || record.deleted);

    if (candidates.length === 0) {
      return { ok: true, pushedCount: 0, reason: 'nothing-to-push', message: '本地暂无待提交的更改' };
    }

    const pendingChunks = chunkForSync(candidates);
    let cursor = since;
    let pushedCount = 0;

    for (const chunk of pendingChunks) {
      const res = await fetch('/api/notes/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: cursor, changes: chunk.map(stripLocal) }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, pushedCount, reason: data?.error || `http-${res.status}` };
      }

      cursor = Number(data.rev) || cursor;
      pushedCount += chunk.length;
      markPushedNotesClean(new Map(chunk.map((c) => [c.id, Number(c.updatedAt || c.timestamp || 0)])));
    }

    const nextRev = cursor;
    if (nextRev > since) {
      writeNumber(LAST_REV_KEY, nextRev);
    }
    writeNumber(LAST_SYNC_KEY, Date.now());
    window.dispatchEvent(new CustomEvent('article-notes:synced'));

    return {
      ok: true,
      pushedCount,
      rev: nextRev,
      message: `成功提交 ${pushedCount} 条本地笔记到云端`,
    };
  } catch (err) {
    console.warn('[notesSync] pushSync failed:', err);
    return { ok: false, pushedCount: 0, reason: 'network' };
  } finally {
    syncing = false;
  }
}

/**
 * 步骤二：拉取同步 (Pull)
 * 从云端拉取多设备最新笔记并合并到本地（不提交本地草稿）
 */
export async function pullSync(options: { forceFull?: boolean } = {}): Promise<PullSyncResult> {
  if (syncing) return { ok: false, pulledCount: 0, reason: 'busy' };
  if (typeof window === 'undefined') return { ok: false, pulledCount: 0, reason: 'no-window' };

  syncing = true;
  try {
    if (!(await fetchCurrentUser())) return { ok: false, pulledCount: 0, reason: 'need-login' };

    const since = options.forceFull ? 0 : readNumber(LAST_REV_KEY);
    let cursor = since;
    let totalPulled = 0;

    for (let page = 0; page < 10; page += 1) {
      const res = await fetch('/api/notes/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: cursor, changes: [] }), // 关键：空 changes，不覆盖云端
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, pulledCount: totalPulled, reason: data?.error || `http-${res.status}` };

      const incoming = Array.isArray(data.changes) ? data.changes : [];
      if (incoming.length > 0) {
        mergeServerNotes(incoming);
        totalPulled += incoming.length;
      }
      cursor = Number(data.rev) || cursor;
      if (!data.hasMore) break;
    }

    writeNumber(LAST_REV_KEY, cursor);
    writeNumber(LAST_SYNC_KEY, Date.now());
    window.dispatchEvent(new CustomEvent('article-notes:synced'));

    return {
      ok: true,
      pulledCount: totalPulled,
      rev: cursor,
      message: totalPulled > 0 ? `成功从云端拉取 ${totalPulled} 条最新笔记` : '云端暂无新内容，本地已是最新',
    };
  } catch (err) {
    console.warn('[notesSync] pullSync failed:', err);
    return { ok: false, pulledCount: 0, reason: 'network' };
  } finally {
    syncing = false;
  }
}

/**
 * 完整同步（单次往返同时提交本地修改并拉取合并云端新数据）
 * 保持向后兼容与最小请求数
 */
export async function syncNow(options: { migrate?: boolean } = {}): Promise<SyncNowResult> {
  if (syncing) return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'busy' };
  if (typeof window === 'undefined') return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'no-window' };

  syncing = true;
  try {
    if (!(await fetchCurrentUser())) return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'need-login' };

    const buckets = loadAllStoredNotes();
    const all = buckets.flatMap((bucket) =>
      bucket.records.map((record) => ({ ...record, postSlug: record.postSlug || bucket.postSlug }))
    );

    const since = readNumber(LAST_REV_KEY);
    const migrate = Boolean(options.migrate) || since === 0;
    const candidates = migrate ? all : all.filter((record) => record.dirty || record.deleted);

    let cursor = since;
    let totalPulled = 0;
    let pushedCount = 0;
    const chunks = chunkForSync(candidates);
    let hasMorePull = chunks.length === 0;

    // 先分块提交本地改动；服务端单次只接收 200 条，必须分批，否则剩余条目会被静默丢掉
    for (const chunk of chunks) {
      const res = await fetch('/api/notes/sync', {
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
        mergeServerNotes(incoming);
        totalPulled += incoming.length;
      }
      cursor = Number(data.rev) || cursor;
      pushedCount += chunk.length;
      hasMorePull = Boolean(data.hasMore);
      markPushedNotesClean(new Map(chunk.map((c) => [c.id, Number(c.updatedAt || c.timestamp || 0)])));
    }

    // 推送响应本身已经带回 since 之后的所有变更；只有服务端明确 hasMore 时才继续拉
    if (hasMorePull) {
      for (let page = 0; page < 10; page += 1) {
        const res = await fetch('/api/notes/sync', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ since: cursor, changes: [] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, pushedCount, pulledCount: totalPulled, reason: data?.error || `http-${res.status}` };

        const incoming = Array.isArray(data.changes) ? data.changes : [];
        if (incoming.length > 0) {
          mergeServerNotes(incoming);
          totalPulled += incoming.length;
        }
        cursor = Number(data.rev) || cursor;
        if (!data.hasMore) break;
      }
    }

    writeNumber(LAST_REV_KEY, cursor);
    writeNumber(LAST_SYNC_KEY, Date.now());
    window.dispatchEvent(new CustomEvent('article-notes:synced'));

    return {
      ok: true,
      pushedCount,
      pulledCount: totalPulled,
      rev: cursor,
    };
  } catch (err) {
    console.warn('[notesSync] sync failed:', err);
    return { ok: false, pushedCount: 0, pulledCount: 0, reason: 'network' };
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
    pushSync,
    pullSync,
    checkSyncStatus,
    status: getSyncStatus,
    pendingCount,
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
