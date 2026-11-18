/**
 * readingStore.ts — 「夹签续读」阅读进度与一文多签响应式状态库 (Nanostores)
 *
 * 封装 `readingBookmarkEngine.ts`：
 * - currentSlug / currentTitle: 当前所在文章标识与标题
 * - currentProgress: 当前文章持久化的自动阅读进度记录 (ReadingProgressRecord | null)
 * - livePosition: 当前滚动视口实时采样位置
 * - resumeSlip: 「竹签续读」轻浮条显隐与锚定快照
 * - bookmarks: 当前文章手动夹签列表 (按正文进度升序)
 * - allBookmarks: 全站手动夹签列表 (供跨库检索与同步面板读取)
 * - recentReading: 最近未读完文章列表
 * - isPopoverOpen: 「本文夹签」浮笺开闭态
 * - toast: 轻量微提示状态
 */

import { atom, batch, computed } from 'nanostores';
import {
  addManualBookmark,
  dismissReadingResume,
  formatProgressPercent,
  getAllBookmarks,
  getArticleBookmarks,
  getArticleReadingProgress,
  getRecentReadingProgress,
  normalizeReadingSlug,
  removeManualBookmark,
  shouldPromptResume,
  upsertReadingProgress,
  type ManualBookmarkRecord,
  type ReadingProgressRecord,
} from '../utils/readingBookmarkEngine.ts';

export interface ResumeSlipState {
  visible: boolean;
  record: ReadingProgressRecord | null;
  percent: number;
  label: string;
}

export interface LiveReadingPosition {
  progress: number;
  headingId: string;
  headingText: string;
}

export interface ReadingToastState {
  visible: boolean;
  message: string;
  seq: number;
}

const INITIAL_RESUME_SLIP: ResumeSlipState = {
  visible: false,
  record: null,
  percent: 0,
  label: '上次阅读位置',
};

const INITIAL_LIVE_POSITION: LiveReadingPosition = {
  progress: 0,
  headingId: '',
  headingText: '',
};

const INITIAL_TOAST: ReadingToastState = {
  visible: false,
  message: '',
  seq: 0,
};

export const currentSlug = atom<string>('');
export const currentTitle = atom<string>('');
export const currentProgress = atom<ReadingProgressRecord | null>(null);
export const livePosition = atom<LiveReadingPosition>(INITIAL_LIVE_POSITION);
export const resumeSlip = atom<ResumeSlipState>(INITIAL_RESUME_SLIP);
export const bookmarks = atom<ManualBookmarkRecord[]>([]);
export const allBookmarks = atom<ManualBookmarkRecord[]>([]);
export const recentReading = atom<ReadingProgressRecord[]>([]);
export const isPopoverOpen = atom<boolean>(false);
export const toast = atom<ReadingToastState>(INITIAL_TOAST);

export const bookmarkCount = computed(bookmarks, (list) => list.length);

export const readingStore = {
  currentSlug,
  currentTitle,
  currentProgress,
  livePosition,
  resumeSlip,
  bookmarks,
  allBookmarks,
  recentReading,
  isPopoverOpen,
  toast,
  bookmarkCount,
} as const;

export function buildResumeSlipState(
  record: ReadingProgressRecord | null,
  visible: boolean
): ResumeSlipState {
  if (!record) {
    return INITIAL_RESUME_SLIP;
  }
  const pct = formatProgressPercent(record.progress);
  const label = record.headingText
    ? `上次读至《${record.headingText}》`
    : `上次读至全文 ${pct}% 处`;
  return {
    visible,
    record,
    percent: pct,
    label,
  };
}

export function hydrateReadingStoreForPost(
  rawSlug: string,
  postTitle?: string,
  customStorage?: Storage | null
): {
  slug: string;
  savedProgress: ReadingProgressRecord | null;
  postBookmarks: ManualBookmarkRecord[];
} {
  const slug = normalizeReadingSlug(rawSlug);
  const savedProgress = slug ? getArticleReadingProgress(slug, customStorage) : null;
  const postBookmarks = slug ? getArticleBookmarks(slug, customStorage) : [];
  const globalBookmarks = getAllBookmarks(customStorage);
  const recent = getRecentReadingProgress(3, customStorage);

  batch(() => {
    currentSlug.set(slug);
    currentTitle.set((postTitle || '').trim() || savedProgress?.postTitle || slug);
    currentProgress.set(savedProgress);
    livePosition.set({
      progress: savedProgress?.progress ?? 0,
      headingId: savedProgress?.headingId ?? '',
      headingText: savedProgress?.headingText ?? '',
    });
    resumeSlip.set(buildResumeSlipState(savedProgress, false));
    bookmarks.set(postBookmarks);
    allBookmarks.set(globalBookmarks);
    recentReading.set(recent);
    isPopoverOpen.set(false);
  });

  return { slug, savedProgress, postBookmarks };
}

export function refreshReadingStoreFromStorage(customStorage?: Storage | null): void {
  const slug = currentSlug.get();
  const savedProgress = slug ? getArticleReadingProgress(slug, customStorage) : null;
  const postBookmarks = slug ? getArticleBookmarks(slug, customStorage) : [];
  const globalBookmarks = getAllBookmarks(customStorage);
  const recent = getRecentReadingProgress(3, customStorage);

  batch(() => {
    currentProgress.set(savedProgress);
    bookmarks.set(postBookmarks);
    allBookmarks.set(globalBookmarks);
    recentReading.set(recent);
  });
}

export function updateLiveReadingPosition(pos: LiveReadingPosition): void {
  livePosition.set(pos);
}

export function recordArticleProgress(
  input: {
    postSlug?: string;
    postTitle?: string;
    progress: number;
    headingId?: string;
    headingText?: string;
    now?: number;
  },
  customStorage?: Storage | null
): ReadingProgressRecord | null {
  const slug = normalizeReadingSlug(input.postSlug || currentSlug.get());
  if (!slug) return null;

  const title = (input.postTitle || currentTitle.get() || slug).trim();
  const slipSnap = resumeSlip.get();
  if (
    slipSnap.visible &&
    slipSnap.record &&
    input.progress > slipSnap.record.progress + 0.06
  ) {
    hideResumeSlipState();
  }

  const updated = upsertReadingProgress(
    {
      postSlug: slug,
      postTitle: title,
      progress: input.progress,
      headingId: input.headingId,
      headingText: input.headingText,
      now: input.now,
    },
    customStorage
  );

  batch(() => {
    livePosition.set({
      progress: input.progress,
      headingId: input.headingId || '',
      headingText: input.headingText || '',
    });
    if (slug === currentSlug.get()) {
      currentProgress.set(updated ?? getArticleReadingProgress(slug, customStorage));
    }
    recentReading.set(getRecentReadingProgress(3, customStorage));
  });

  return updated;
}

export function promptResumeSlipIfEligible(
  opts?: {
    record?: ReadingProgressRecord | null;
    hasDeepLink?: boolean;
    isLocked?: boolean;
  },
  customStorage?: Storage | null
): boolean {
  if (opts?.isLocked || opts?.hasDeepLink) return false;
  const slug = currentSlug.get();
  const candidate =
    opts?.record !== undefined
      ? opts.record
      : slug
      ? getArticleReadingProgress(slug, customStorage)
      : currentProgress.get();

  if (!shouldPromptResume(candidate) || !candidate) {
    return false;
  }

  resumeSlip.set(buildResumeSlipState(candidate, true));
  return true;
}

export function showResumeSlipState(record: ReadingProgressRecord): void {
  resumeSlip.set(buildResumeSlipState(record, true));
}

export function hideResumeSlipState(): void {
  const cur = resumeSlip.get();
  if (!cur.visible) return;
  resumeSlip.set({ ...cur, visible: false });
}

export function dismissArticleResumeSlip(
  postSlug?: string,
  customStorage?: Storage | null
): void {
  const slug = normalizeReadingSlug(postSlug || currentSlug.get());
  if (slug) {
    dismissReadingResume(slug, customStorage);
  }
  batch(() => {
    hideResumeSlipState();
    if (slug && slug === currentSlug.get()) {
      currentProgress.set(getArticleReadingProgress(slug, customStorage));
    }
    recentReading.set(getRecentReadingProgress(3, customStorage));
  });
}

export function addArticleBookmark(
  input: {
    postSlug?: string;
    postTitle?: string;
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
  const slug = normalizeReadingSlug(input.postSlug || currentSlug.get());
  if (!slug) return null;
  const title = (input.postTitle || currentTitle.get() || slug).trim();

  const record = addManualBookmark(
    {
      postSlug: slug,
      postTitle: title,
      progress: input.progress,
      headingId: input.headingId,
      headingText: input.headingText,
      excerpt: input.excerpt,
      prefix: input.prefix,
      suffix: input.suffix,
      note: input.note,
      now: input.now,
    },
    customStorage
  );

  if (record) {
    batch(() => {
      if (slug === currentSlug.get() || !currentSlug.get()) {
        currentSlug.set(slug);
        bookmarks.set(getArticleBookmarks(slug, customStorage));
      }
      allBookmarks.set(getAllBookmarks(customStorage));
    });
  }

  return record;
}

export function removeArticleBookmark(
  bookmarkId: string,
  customStorage?: Storage | null
): boolean {
  const removed = removeManualBookmark(bookmarkId, customStorage);
  if (removed) {
    const slug = currentSlug.get();
    batch(() => {
      if (slug) {
        bookmarks.set(getArticleBookmarks(slug, customStorage));
      } else {
        bookmarks.set(bookmarks.get().filter((b) => b.id !== bookmarkId));
      }
      allBookmarks.set(getAllBookmarks(customStorage));
    });
  }
  return removed;
}

export function setBookmarkPopoverOpen(open: boolean): void {
  isPopoverOpen.set(Boolean(open));
}

export function toggleBookmarkPopoverOpen(): boolean {
  const next = !isPopoverOpen.get();
  isPopoverOpen.set(next);
  return next;
}

export function triggerReadingToast(message: string): void {
  const prev = toast.get();
  toast.set({
    visible: true,
    message,
    seq: prev.seq + 1,
  });
}

export function clearReadingToast(): void {
  const prev = toast.get();
  if (!prev.visible) return;
  toast.set({ ...prev, visible: false });
}

export function resetReadingStore(): void {
  batch(() => {
    currentSlug.set('');
    currentTitle.set('');
    currentProgress.set(null);
    livePosition.set(INITIAL_LIVE_POSITION);
    resumeSlip.set(INITIAL_RESUME_SLIP);
    bookmarks.set([]);
    allBookmarks.set([]);
    recentReading.set([]);
    isPopoverOpen.set(false);
    toast.set(INITIAL_TOAST);
  });
}
