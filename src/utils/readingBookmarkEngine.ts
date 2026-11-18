/**
 * readingBookmarkEngine.ts — 「夹签续读」阅读进度记忆与一文多签数据引擎
 *
 * 设计原则：
 * 1. 纯 TypeScript 模块（无硬性 DOM 依赖，Node 单元测试与浏览器端共用）
 * 2. Local-First 存储：未登录存 localStorage，登录后通过 readingSync.ts 按 updatedAt 执行 LWW 增量同步
 * 3. 双粒度模型：
 *    - ReadingProgressRecord (`kind: 'progress'`，每篇唯一 `prog:<slug>`)：自动记录阅读百分比、小节与读完状态
 *    - ManualBookmarkRecord  (`kind: 'bookmark'`，支持一文多签 `bm_<ts>_<rand>`)：记录手动夹签段落摘录、小节与位置
 */

export type ReadingEntryKind = 'progress' | 'bookmark';

export interface ReadingProgressRecord {
  id: string; // 固定格式: prog:<postSlug>
  kind: 'progress';
  postSlug: string;
  postTitle: string;
  /** 0 ~ 1 归一化正文阅读进度 */
  progress: number;
  /** 当前停留小节锚点 slug */
  headingId: string;
  /** 当前停留小节标题 */
  headingText: string;
  /** 是否已读至文末 (>= 0.95) */
  completed: boolean;
  /** 用户主动关闭本篇「续读竹签」时的进度快照，除非产生新进度否则不再重复打扰 */
  dismissedProgress?: number;
  updatedAt: number;
  deleted?: boolean;
  dirty?: boolean;
  serverRev?: number;
}

export interface ManualBookmarkRecord {
  id: string; // 格式: bm_<ts36>_<rand>
  kind: 'bookmark';
  postSlug: string;
  postTitle: string;
  /** 0 ~ 1 归一化正文位置 */
  progress: number;
  headingId: string;
  headingText: string;
  /** 夹签锚定摘录（划词文本或当前视口段落摘要） */
  excerpt: string;
  prefix?: string;
  suffix?: string;
  /** 可选批注短笺 */
  note?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
  dirty?: boolean;
  serverRev?: number;
}

export type ReadingEntry = ReadingProgressRecord | ManualBookmarkRecord;

export const READING_STORAGE_KEY = 'areSet_reading_state_v1';

/** 视为「有效在读（可触发续读提示）」的区间：[4%, 95%) */
export const MIN_RESUME_PROGRESS = 0.04;
export const COMPLETE_PROGRESS_THRESHOLD = 0.95;

export const READING_LIMITS = {
  maxEntries: 600,
  maxBookmarksPerPost: 40,
  maxSlug: 160,
  maxTitle: 200,
  maxHeadingId: 160,
  maxHeadingText: 180,
  maxExcerpt: 360,
  maxContext: 80,
  maxNote: 280,
} as const;

export function normalizeReadingSlug(rawSlug?: string): string {
  if (!rawSlug) return '';
  let s = String(rawSlug).trim().replace(/[?#].*$/, '');
  if (s.startsWith('/posts/')) s = s.slice(7);
  if (s.startsWith('posts/')) s = s.slice(6);
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  return s.slice(0, READING_LIMITS.maxSlug);
}

export function clampProgress(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, Math.round(num * 1000) / 1000));
}

export function formatProgressPercent(progress: number): number {
  return Math.max(1, Math.min(100, Math.round(clampProgress(progress) * 100)));
}

export function progressEntryId(postSlug: string): string {
  return `prog:${normalizeReadingSlug(postSlug)}`;
}

export function createBookmarkId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `bm_${Date.now().toString(36)}_${rand}`;
}

function cleanStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

export function normalizeReadingEntry(raw: unknown): ReadingEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const postSlug = normalizeReadingSlug(typeof obj.postSlug === 'string' ? obj.postSlug : '');
  if (!postSlug) return null;

  const kind: ReadingEntryKind = obj.kind === 'bookmark' ? 'bookmark' : 'progress';
  const progress = clampProgress(obj.progress);
  const postTitle = cleanStr(obj.postTitle, READING_LIMITS.maxTitle) || postSlug;
  const headingId = cleanStr(obj.headingId, READING_LIMITS.maxHeadingId);
  const headingText = cleanStr(obj.headingText, READING_LIMITS.maxHeadingText);
  const updatedAt = Number.isFinite(Number(obj.updatedAt)) && Number(obj.updatedAt) > 0
    ? Math.floor(Number(obj.updatedAt))
    : Date.now();
  const deleted = Boolean(obj.deleted);
  const dirty = Boolean(obj.dirty);
  const serverRev = Number.isFinite(Number(obj.serverRev)) && Number(obj.serverRev) > 0
    ? Math.floor(Number(obj.serverRev))
    : undefined;

  if (kind === 'progress') {
    const id = progressEntryId(postSlug);
    const completed = Boolean(obj.completed) || progress >= COMPLETE_PROGRESS_THRESHOLD;
    const dismissedRaw = Number(obj.dismissedProgress);
    const dismissedProgress = Number.isFinite(dismissedRaw)
      ? clampProgress(dismissedRaw)
      : undefined;

    return {
      id,
      kind: 'progress',
      postSlug,
      postTitle,
      progress,
      headingId,
      headingText,
      completed,
      ...(dismissedProgress !== undefined ? { dismissedProgress } : {}),
      updatedAt,
      ...(deleted ? { deleted: true } : {}),
      ...(dirty ? { dirty: true } : {}),
      ...(serverRev !== undefined ? { serverRev } : {}),
    };
  }

  const rawId = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!rawId || rawId.length > 80) return null;
  const createdAt = Number.isFinite(Number(obj.createdAt)) && Number(obj.createdAt) > 0
    ? Math.floor(Number(obj.createdAt))
    : updatedAt;
  const excerpt = cleanStr(obj.excerpt, READING_LIMITS.maxExcerpt);
  const prefix = cleanStr(obj.prefix, READING_LIMITS.maxContext);
  const suffix = cleanStr(obj.suffix, READING_LIMITS.maxContext);
  const note = cleanStr(obj.note, READING_LIMITS.maxNote);

  return {
    id: rawId,
    kind: 'bookmark',
    postSlug,
    postTitle,
    progress,
    headingId,
    headingText,
    excerpt,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
    ...(note ? { note } : {}),
    createdAt,
    updatedAt,
    ...(deleted ? { deleted: true } : {}),
    ...(dirty ? { dirty: true } : {}),
    ...(serverRev !== undefined ? { serverRev } : {}),
  };
}

function getStorage(customStorage?: Storage | null): Storage | null {
  if (customStorage !== undefined) return customStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

function dispatchReadingChange(detail?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('reading:changed', { detail }));
  } catch {}
}

export function loadAllReadingEntries(customStorage?: Storage | null): ReadingEntry[] {
  const storage = getStorage(customStorage);
  if (!storage) return [];
  try {
    const raw = storage.getItem(READING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const byId = new Map<string, ReadingEntry>();
    for (const item of parsed) {
      const clean = normalizeReadingEntry(item);
      if (!clean) continue;
      const existing = byId.get(clean.id);
      if (!existing || clean.updatedAt >= existing.updatedAt) {
        byId.set(clean.id, clean);
      }
    }
    return [...byId.values()];
  } catch {
    return [];
  }
}

export function saveAllReadingEntries(
  entries: ReadingEntry[],
  emitEvent = true,
  customStorage?: Storage | null
): void {
  const storage = getStorage(customStorage);
  if (!storage) return;
  try {
    const normalized = entries
      .map((e) => normalizeReadingEntry(e))
      .filter((e): e is ReadingEntry => Boolean(e))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, READING_LIMITS.maxEntries);

    if (normalized.length === 0) {
      storage.removeItem(READING_STORAGE_KEY);
    } else {
      storage.setItem(READING_STORAGE_KEY, JSON.stringify(normalized));
    }
    if (emitEvent) dispatchReadingChange({ count: normalized.length });
  } catch {}
}

/**
 * 更新文章自动阅读进度：
 * - 若之前已经读完 (`completed: true`)，再次回看前半部分时，只要停留在 [MIN_RESUME_PROGRESS, COMPLETE_PROGRESS_THRESHOLD) 也会更新进度
 * - 达到 >= 0.95 自动标记 completed = true，不再弹出未读完提醒
 */
export function upsertReadingProgress(
  input: {
    postSlug: string;
    postTitle: string;
    progress: number;
    headingId?: string;
    headingText?: string;
    now?: number;
  },
  customStorage?: Storage | null
): ReadingProgressRecord | null {
  const postSlug = normalizeReadingSlug(input.postSlug);
  if (!postSlug) return null;

  const progress = clampProgress(input.progress);
  const now = input.now ?? Date.now();
  const entries = loadAllReadingEntries(customStorage);
  const id = progressEntryId(postSlug);
  const idx = entries.findIndex((e) => e.id === id);
  const existing = idx >= 0 && entries[idx].kind === 'progress'
    ? (entries[idx] as ReadingProgressRecord)
    : null;

  // 尚未产生有效阅读深度且此前无记录时，不落盘垃圾 0% 数据
  if (!existing && progress < MIN_RESUME_PROGRESS) {
    return null;
  }

  // 若位移极微小 (< 0.8%) 且小节未变，避免无意义写盘与覆盖时间戳
  const nextHeadingId = cleanStr(input.headingId, READING_LIMITS.maxHeadingId);
  const nextHeadingText = cleanStr(input.headingText, READING_LIMITS.maxHeadingText);
  if (
    existing &&
    !existing.deleted &&
    Math.abs(existing.progress - progress) < 0.008 &&
    existing.headingId === nextHeadingId
  ) {
    return existing;
  }

  const completed = progress >= COMPLETE_PROGRESS_THRESHOLD;
  // 只有当读者明显推进了新进度（偏离上次关闭点 >= 3%），才自动解除 dismissedProgress
  let dismissedProgress = existing?.dismissedProgress;
  if (dismissedProgress !== undefined && Math.abs(progress - dismissedProgress) >= 0.03) {
    dismissedProgress = undefined;
  }

  const nextRecord: ReadingProgressRecord = {
    id,
    kind: 'progress',
    postSlug,
    postTitle: cleanStr(input.postTitle, READING_LIMITS.maxTitle) || existing?.postTitle || postSlug,
    progress,
    headingId: nextHeadingId,
    headingText: nextHeadingText,
    completed,
    ...(dismissedProgress !== undefined ? { dismissedProgress } : {}),
    updatedAt: now,
    dirty: true,
    ...(existing?.serverRev !== undefined ? { serverRev: existing.serverRev } : {}),
  };

  if (idx >= 0) {
    entries[idx] = nextRecord;
  } else {
    entries.unshift(nextRecord);
  }
  saveAllReadingEntries(entries, true, customStorage);
  return nextRecord;
}

/**
 * 用户点 × 收起本篇自动续读提示时记录当前进度快照，同位置不再反复弹出
 */
export function dismissReadingResume(
  postSlug: string,
  customStorage?: Storage | null
): void {
  const slug = normalizeReadingSlug(postSlug);
  if (!slug) return;
  const entries = loadAllReadingEntries(customStorage);
  const id = progressEntryId(slug);
  const idx = entries.findIndex((e) => e.id === id && e.kind === 'progress');
  if (idx < 0) return;
  const cur = entries[idx] as ReadingProgressRecord;
  entries[idx] = {
    ...cur,
    dismissedProgress: cur.progress,
    updatedAt: Date.now(),
    dirty: true,
  };
  saveAllReadingEntries(entries, true, customStorage);
}

export function getArticleReadingProgress(
  postSlug: string,
  customStorage?: Storage | null
): ReadingProgressRecord | null {
  const slug = normalizeReadingSlug(postSlug);
  if (!slug) return null;
  const id = progressEntryId(slug);
  const found = loadAllReadingEntries(customStorage).find(
    (e): e is ReadingProgressRecord => e.id === id && e.kind === 'progress' && !e.deleted
  );
  return found ?? null;
}

/**
 * 判断某篇文章当前是否应当弹出「上次读至 · 继续展卷」浮签
 */
export function shouldPromptResume(record: ReadingProgressRecord | null | undefined): boolean {
  if (!record || record.deleted || record.completed) return false;
  if (record.progress < MIN_RESUME_PROGRESS || record.progress >= COMPLETE_PROGRESS_THRESHOLD) {
    return false;
  }
  if (
    record.dismissedProgress !== undefined &&
    Math.abs(record.progress - record.dismissedProgress) < 0.03
  ) {
    return false;
  }
  return true;
}

/**
 * 获取全站最近未读完的文章列表（供 ⌘K 空态置顶「最近在读」使用）
 */
export function getRecentReadingProgress(
  limit = 3,
  customStorage?: Storage | null
): ReadingProgressRecord[] {
  return loadAllReadingEntries(customStorage)
    .filter(
      (e): e is ReadingProgressRecord =>
        e.kind === 'progress' &&
        !e.deleted &&
        !e.completed &&
        e.progress >= MIN_RESUME_PROGRESS &&
        e.progress < COMPLETE_PROGRESS_THRESHOLD
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, limit));
}

/**
 * 添加手动夹签（支持一文多签；若同一篇在极相近位置 & 相同摘录已存在夹签，则更新它而不重复堆叠）
 */
export function addManualBookmark(
  input: {
    postSlug: string;
    postTitle: string;
    progress: number;
    headingId?: string;
    headingText?: string;
    excerpt: string;
    prefix?: string;
    suffix?: string;
    note?: string;
    now?: number;
  },
  customStorage?: Storage | null
): ManualBookmarkRecord | null {
  const postSlug = normalizeReadingSlug(input.postSlug);
  if (!postSlug) return null;

  const now = input.now ?? Date.now();
  const progress = clampProgress(input.progress);
  const excerpt = cleanStr(input.excerpt, READING_LIMITS.maxExcerpt) || cleanStr(input.headingText, READING_LIMITS.maxHeadingText) || '此处夹签';
  const headingId = cleanStr(input.headingId, READING_LIMITS.maxHeadingId);
  const headingText = cleanStr(input.headingText, READING_LIMITS.maxHeadingText);
  const prefix = cleanStr(input.prefix, READING_LIMITS.maxContext);
  const suffix = cleanStr(input.suffix, READING_LIMITS.maxContext);
  const note = cleanStr(input.note, READING_LIMITS.maxNote);

  const entries = loadAllReadingEntries(customStorage);

  // 去重防抖：同一篇文章、相同摘录（或距离 < 1.2% 且同小节无摘录差异）直接复用更新
  const dupIdx = entries.findIndex(
    (e) =>
      e.kind === 'bookmark' &&
      !e.deleted &&
      e.postSlug === postSlug &&
      (e.excerpt === excerpt || (Math.abs(e.progress - progress) < 0.012 && e.headingId === headingId && e.excerpt === excerpt))
  );

  if (dupIdx >= 0) {
    const prev = entries[dupIdx] as ManualBookmarkRecord;
    const updated: ManualBookmarkRecord = {
      ...prev,
      postTitle: cleanStr(input.postTitle, READING_LIMITS.maxTitle) || prev.postTitle,
      progress,
      headingId: headingId || prev.headingId,
      headingText: headingText || prev.headingText,
      excerpt,
      ...(prefix ? { prefix } : {}),
      ...(suffix ? { suffix } : {}),
      ...(note ? { note } : prev.note ? { note: prev.note } : {}),
      updatedAt: now,
      dirty: true,
    };
    entries[dupIdx] = updated;
    saveAllReadingEntries(entries, true, customStorage);
    return updated;
  }

  // 控制单篇未删除夹签上限，超出时淘汰最旧的一枚
  const activePostBookmarks = entries
    .filter((e): e is ManualBookmarkRecord => e.kind === 'bookmark' && !e.deleted && e.postSlug === postSlug)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (activePostBookmarks.length >= READING_LIMITS.maxBookmarksPerPost) {
    const oldest = activePostBookmarks[0];
    const oldIdx = entries.findIndex((e) => e.id === oldest.id);
    if (oldIdx >= 0) {
      entries[oldIdx] = { ...entries[oldIdx], deleted: true, updatedAt: now, dirty: true };
    }
  }

  const created: ManualBookmarkRecord = {
    id: createBookmarkId(),
    kind: 'bookmark',
    postSlug,
    postTitle: cleanStr(input.postTitle, READING_LIMITS.maxTitle) || postSlug,
    progress,
    headingId,
    headingText,
    excerpt,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
    ...(note ? { note } : {}),
    createdAt: now,
    updatedAt: now,
    dirty: true,
  };

  entries.unshift(created);
  saveAllReadingEntries(entries, true, customStorage);
  return created;
}

export function removeManualBookmark(
  bookmarkId: string,
  customStorage?: Storage | null
): boolean {
  if (!bookmarkId) return false;
  const entries = loadAllReadingEntries(customStorage);
  const idx = entries.findIndex((e) => e.id === bookmarkId && e.kind === 'bookmark' && !e.deleted);
  if (idx < 0) return false;

  const target = entries[idx] as ManualBookmarkRecord;
  if (target.serverRev) {
    // 曾同步上云：保留删除墓碑供下次 Push 同步
    entries[idx] = {
      ...target,
      deleted: true,
      updatedAt: Date.now(),
      dirty: true,
    };
  } else {
    entries.splice(idx, 1);
  }
  saveAllReadingEntries(entries, true, customStorage);
  return true;
}

export function getArticleBookmarks(
  postSlug: string,
  customStorage?: Storage | null
): ManualBookmarkRecord[] {
  const slug = normalizeReadingSlug(postSlug);
  if (!slug) return [];
  return loadAllReadingEntries(customStorage)
    .filter(
      (e): e is ManualBookmarkRecord =>
        e.kind === 'bookmark' && !e.deleted && e.postSlug === slug
    )
    .sort((a, b) => a.progress - b.progress || b.createdAt - a.createdAt);
}

export function getAllBookmarks(customStorage?: Storage | null): ManualBookmarkRecord[] {
  return loadAllReadingEntries(customStorage)
    .filter((e): e is ManualBookmarkRecord => e.kind === 'bookmark' && !e.deleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function pendingReadingCount(customStorage?: Storage | null): number {
  return loadAllReadingEntries(customStorage).filter((e) => e.dirty || e.deleted).length;
}
