/**
 * localReaderStore.ts — 本地 Markdown 阅读器与个人书架 Nanostores 响应式状态核心
 *
 * 与 refactor/motion-three 架构保持一致：
 * - 纯 TypeScript + `nanostores`（零 DOM 硬依赖，Node 单元测试与 React 19 / Motion Island 共用）
 * - 统一托管书架文档列表、分类、筛选、搜索、排序、当前打开文稿 ID 以及批量进度/笔记计数快照
 */

import { atom, computed } from 'nanostores';
import {
  buildLocalReaderSlug,
  DEFAULT_READER_CATEGORIES,
  loadReaderCategories,
  saveReaderCategories,
  type LocalReaderDocument,
} from '../utils/localReaderStorage.ts';
import { loadAllStoredNotes } from '../utils/articleHighlightEngine.ts';
import {
  loadAllReadingEntries,
  normalizeReadingSlug,
  type ReadingProgressRecord,
} from '../utils/readingBookmarkEngine.ts';

export type ReaderStatFilter = 'all' | 'reading';
export type ReaderSortMode = 'recent' | 'updated' | 'title' | 'words';

export interface ReaderShelfStats {
  totalDocs: number;
  readingDocs: number;
  totalWords: number;
}

export const $readerDocs = atom<LocalReaderDocument[]>([]);
export const $readerCategories = atom<string[]>([...DEFAULT_READER_CATEGORIES]);
export const $readerActiveCategory = atom<string>('all');
export const $readerStatFilter = atom<ReaderStatFilter>('all');
export const $readerSearchKeyword = atom<string>('');
export const $readerSortMode = atom<ReaderSortMode>('recent');
export const $readerActiveDocId = atom<string | null>(null);
export const $readerProgressMap = atom<Record<string, ReadingProgressRecord>>({});
export const $readerNotesCountMap = atom<Record<string, number>>({});
export const $readerShelfReady = atom<boolean>(false);

export const $readerAllCategories = computed(
  [$readerCategories, $readerDocs],
  (cats, docs) => {
    const set = new Set<string>(cats);
    for (const doc of docs) {
      if (doc.category) set.add(doc.category);
    }
    return ['all', ...Array.from(set)];
  },
);

export const $readerCategoryCounts = computed(
  [$readerAllCategories, $readerDocs],
  (allCats, docs) => {
    const counts: Record<string, number> = { all: docs.length };
    for (const cat of allCats) {
      if (cat !== 'all') counts[cat] = 0;
    }
    for (const doc of docs) {
      const c = doc.category || '技术文档';
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  },
);

export const $readerShelfStats = computed(
  [$readerDocs, $readerProgressMap],
  (docs, progressMap): ReaderShelfStats => {
    let readingDocs = 0;
    let totalWords = 0;
    for (const doc of docs) {
      totalWords += doc.wordCount || 0;
      const slug = normalizeReadingSlug(buildLocalReaderSlug(doc.id));
      const prog = progressMap[slug];
      if (prog && !prog.completed && prog.progress >= 0.04) {
        readingDocs += 1;
      }
    }
    return {
      totalDocs: docs.length,
      readingDocs,
      totalWords,
    };
  },
);

export const $readerFilteredDocs = computed(
  [
    $readerDocs,
    $readerActiveCategory,
    $readerStatFilter,
    $readerSearchKeyword,
    $readerSortMode,
    $readerProgressMap,
  ],
  (docs, activeCategory, statFilter, searchKeyword, sortMode, progressMap) => {
    const kw = searchKeyword.trim().toLowerCase();
    const filtered = docs.filter((doc) => {
      if (activeCategory !== 'all' && doc.category !== activeCategory) return false;
      if (statFilter === 'reading') {
        const slug = normalizeReadingSlug(buildLocalReaderSlug(doc.id));
        const prog = progressMap[slug];
        if (!prog || prog.completed || prog.progress < 0.04) return false;
      }
      if (kw) {
        const hay = [doc.title, doc.fileName, doc.description, doc.category, ...(doc.tags || [])]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'title') return a.title.localeCompare(b.title, 'zh-CN');
      if (sortMode === 'words') return (b.wordCount || 0) - (a.wordCount || 0);
      if (sortMode === 'updated') return (b.updatedAt || 0) - (a.updatedAt || 0);
      return (b.lastOpenedAt || b.updatedAt || 0) - (a.lastOpenedAt || a.updatedAt || 0);
    });
  },
);

/** 单次批量读取本地阅读进度与笔记条数，避免渲染每张卡片时重复 JSON.parse(localStorage) */
export function refreshReaderTelemetryMaps(customStorage?: Storage | null): void {
  const progressMap: Record<string, ReadingProgressRecord> = {};
  for (const entry of loadAllReadingEntries(customStorage)) {
    if (entry && !entry.deleted && entry.kind === 'progress') {
      progressMap[normalizeReadingSlug(entry.postSlug)] = entry;
    }
  }
  const notesCountMap: Record<string, number> = {};
  for (const bucket of loadAllStoredNotes()) {
    const slug = normalizeReadingSlug(bucket.postSlug);
    const count = (bucket.records || []).filter((r) => r && !r.deleted).length;
    if (slug && count > 0) {
      notesCountMap[slug] = (notesCountMap[slug] || 0) + count;
    }
  }
  $readerProgressMap.set(progressMap);
  $readerNotesCountMap.set(notesCountMap);
}

export function hydrateReaderShelf(
  docs: LocalReaderDocument[],
  customCategories?: string[],
  customStorage?: Storage | null,
): void {
  const cats = customCategories ? [...customCategories] : loadReaderCategories();
  const merged = new Set<string>(cats);
  for (const doc of docs) {
    if (doc.category) merged.add(doc.category);
  }
  $readerCategories.set(Array.from(merged));
  $readerDocs.set([...docs]);
  refreshReaderTelemetryMaps(customStorage);
  $readerShelfReady.set(true);
}

export function addReaderCategoryToStore(name: string): string {
  const clean = String(name || '').trim().slice(0, 12);
  if (!clean) return '';
  const next = saveReaderCategories([...$readerCategories.get(), clean]);
  $readerCategories.set(next);
  $readerActiveCategory.set(clean);
  return clean;
}

export function setReaderActiveCategory(category: string): void {
  $readerActiveCategory.set(category || 'all');
}

export function setReaderStatFilter(filter: ReaderStatFilter): void {
  $readerStatFilter.set(filter);
}

export function setReaderSearchKeyword(keyword: string): void {
  $readerSearchKeyword.set(String(keyword ?? ''));
}

export function setReaderSortMode(mode: ReaderSortMode): void {
  $readerSortMode.set(mode);
}

export function setReaderActiveDocId(docId: string | null): void {
  $readerActiveDocId.set(docId || null);
}

export function resetLocalReaderStore(): void {
  $readerDocs.set([]);
  $readerCategories.set([...DEFAULT_READER_CATEGORIES]);
  $readerActiveCategory.set('all');
  $readerStatFilter.set('all');
  $readerSearchKeyword.set('');
  $readerSortMode.set('recent');
  $readerActiveDocId.set(null);
  $readerProgressMap.set({});
  $readerNotesCountMap.set({});
  $readerShelfReady.set(false);
}

export const localReaderStore = {
  docs: $readerDocs,
  categories: $readerCategories,
  allCategories: $readerAllCategories,
  categoryCounts: $readerCategoryCounts,
  activeCategory: $readerActiveCategory,
  statFilter: $readerStatFilter,
  searchKeyword: $readerSearchKeyword,
  sortMode: $readerSortMode,
  activeDocId: $readerActiveDocId,
  progressMap: $readerProgressMap,
  notesCountMap: $readerNotesCountMap,
  shelfReady: $readerShelfReady,
  shelfStats: $readerShelfStats,
  filteredDocs: $readerFilteredDocs,
};
