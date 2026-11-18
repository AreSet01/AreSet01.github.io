/**
 * mindmapWorkbenchStore.ts — Declarative Reactive State Store for `/mindmap` (`nanostores`)
 *
 * Centralizes mindmap collection records, dynamic categories, multi-dimensional filters
 * (`category`, `color`, `postSlug`, `linkedOnly`, `searchQuery`, `articleSearchQuery`),
 * aggregate telemetry (`$mmStats`), and active workbench state (`$mmActiveState` for
 * `activeMapId`, `viewMode`, `layout`, `selectedNodeCount`, `isDirty`, popovers & modals).
 */

import { atom, computed, map } from 'nanostores';
import {
  countNodes,
  DEFAULT_MINDMAP_CATEGORIES,
  normalizeCardColor,
  normalizeLayout,
  normalizePostSlug,
  type MindMapCardColor,
  type MindMapLayout,
  type MindMapNode,
  type MindMapRecord,
} from '../utils/mindmapEngine.ts';

export type MindMapFilterColor = 'all' | MindMapCardColor;
export type MindMapViewMode = 'canvas' | 'split' | 'outline';
export type MindMapModalKind = 'none' | 'workbench' | 'categories' | 'generator' | 'confirm';

export interface MindMapFilterState {
  category: string;
  color: MindMapFilterColor;
  postSlug: string;
  linkedOnly: boolean;
  searchQuery: string;
  articleSearchQuery: string;
}

export interface MindMapArticleSummary {
  slug: string;
  title: string;
  count: number;
}

export interface MindMapStatsSummary {
  totalMaps: number;
  totalNodes: number;
  categoryCount: number;
  linkedCount: number;
  standaloneCount: number;
  articles: MindMapArticleSummary[];
}

export interface MindMapActiveState {
  activeMapId: string | null;
  viewMode: MindMapViewMode;
  layout: MindMapLayout;
  selectedNodeCount: number;
  primaryNodeId: string | null;
  isDirty: boolean;
  activeModal: MindMapModalKind;
  articlePopoverOpen: boolean;
  exportMenuOpen: boolean;
}

const INITIAL_FILTER: MindMapFilterState = {
  category: 'all',
  color: 'all',
  postSlug: 'all',
  linkedOnly: false,
  searchQuery: '',
  articleSearchQuery: '',
};

const INITIAL_ACTIVE_STATE: MindMapActiveState = {
  activeMapId: null,
  viewMode: 'canvas',
  layout: 'logic-right',
  selectedNodeCount: 0,
  primaryNodeId: null,
  isDirty: false,
  activeModal: 'none',
  articlePopoverOpen: false,
  exportMenuOpen: false,
};

export const $mmItems = atom<MindMapRecord[]>([]);
export const $mmCategories = atom<string[]>([...DEFAULT_MINDMAP_CATEGORIES]);
export const $mmFilter = map<MindMapFilterState>({ ...INITIAL_FILTER });
export const $mmActiveState = map<MindMapActiveState>({ ...INITIAL_ACTIVE_STATE });

export function normalizeMmFilterColor(raw?: string): MindMapFilterColor {
  if (raw === 'red' || raw === 'blue' || raw === 'green' || raw === 'yellow' || raw === 'gold') {
    return raw;
  }
  return 'all';
}

export function normalizeMmViewMode(raw?: string): MindMapViewMode {
  if (raw === 'split' || raw === 'outline') return raw;
  return 'canvas';
}

export function nodeTreeMatchesQuery(node: MindMapNode | null | undefined, kw: string): boolean {
  if (!node || !kw) return false;
  if (
    (node.text || '').toLowerCase().includes(kw) ||
    (node.note && node.note.toLowerCase().includes(kw))
  ) {
    return true;
  }
  return (node.children || []).some((child) => nodeTreeMatchesQuery(child, kw));
}

export function filterMindMapRecords(
  items: readonly MindMapRecord[],
  filter: MindMapFilterState
): MindMapRecord[] {
  const q = filter.searchQuery.trim().toLowerCase();
  return items.filter((m) => {
    if (filter.category !== 'all' && m.category !== filter.category) return false;
    if (filter.color !== 'all' && normalizeCardColor(m.color) !== filter.color) return false;
    const normSlug = normalizePostSlug(m.postSlug);
    if (filter.linkedOnly && !normSlug) return false;
    if (filter.postSlug === '__standalone__' && normSlug) return false;
    if (
      filter.postSlug !== 'all' &&
      filter.postSlug !== '__standalone__' &&
      normSlug !== filter.postSlug
    ) {
      return false;
    }
    if (q) {
      const hitMeta =
        (m.title || '').toLowerCase().includes(q) ||
        (m.category || '').toLowerCase().includes(q) ||
        (m.postTitle || '').toLowerCase().includes(q) ||
        (m.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!hitMeta && !nodeTreeMatchesQuery(m.root, q)) return false;
    }
    return true;
  });
}

export const $hasActiveMmFilters = computed($mmFilter, (filter) => {
  return (
    filter.category !== 'all' ||
    filter.color !== 'all' ||
    filter.postSlug !== 'all' ||
    filter.linkedOnly ||
    Boolean(filter.searchQuery.trim())
  );
});

export const $mmStats = computed(
  [$mmItems, $mmCategories],
  (items, categories): MindMapStatsSummary => {
    let totalNodes = 0;
    let linkedCount = 0;
    let standaloneCount = 0;
    const articleMap = new Map<string, MindMapArticleSummary>();

    for (const m of items) {
      totalNodes += countNodes(m.root).total;
      const slug = normalizePostSlug(m.postSlug);
      if (slug) {
        linkedCount += 1;
        let bucket = articleMap.get(slug);
        if (!bucket) {
          bucket = {
            slug,
            title: m.postTitle || slug,
            count: 0,
          };
          articleMap.set(slug, bucket);
        }
        bucket.count += 1;
      } else {
        standaloneCount += 1;
      }
    }

    return {
      totalMaps: items.length,
      totalNodes,
      categoryCount: categories.length,
      linkedCount,
      standaloneCount,
      articles: Array.from(articleMap.values()),
    };
  }
);

export const $filteredMindMaps = computed([$mmItems, $mmFilter], (items, filter) =>
  filterMindMapRecords(items, filter)
);

export function setMindMapCategories(categories: readonly string[]): void {
  const next = categories.length > 0 ? [...categories] : [...DEFAULT_MINDMAP_CATEGORIES];
  $mmCategories.set(next);
  const curCat = $mmFilter.get().category;
  if (curCat !== 'all' && !next.includes(curCat)) {
    $mmFilter.setKey('category', 'all');
  }
}

export function setMindMapItems(
  items: readonly MindMapRecord[],
  categories?: readonly string[]
): void {
  if (categories) {
    setMindMapCategories(categories);
  }
  $mmItems.set([...items]);
}

export function setMmCategory(category: string): void {
  const safe = category ? category.trim() || 'all' : 'all';
  const cats = $mmCategories.get();
  if (safe !== 'all' && cats.length > 0 && !cats.includes(safe)) {
    $mmFilter.setKey('category', 'all');
    return;
  }
  $mmFilter.setKey('category', safe);
}

export function setMmColor(color: string): void {
  $mmFilter.setKey('color', normalizeMmFilterColor(color));
}

export function setMmPostSlug(postSlug: string): void {
  $mmFilter.setKey('postSlug', postSlug || 'all');
}

export function setMmLinkedOnly(linkedOnly: boolean): void {
  $mmFilter.setKey('linkedOnly', Boolean(linkedOnly));
}

export function toggleMmLinkedOnly(): boolean {
  const next = !$mmFilter.get().linkedOnly;
  $mmFilter.setKey('linkedOnly', next);
  return next;
}

export function setMmSearchQuery(query: string): void {
  $mmFilter.setKey('searchQuery', query.trim());
}

export function setMmArticleSearchQuery(query: string): void {
  $mmFilter.setKey('articleSearchQuery', query);
}

export function resetMmFilters(): void {
  $mmFilter.set({ ...INITIAL_FILTER });
}

export function openMmWorkbenchState(
  record: Pick<MindMapRecord, 'id' | 'layout' | 'root'>,
  viewMode: MindMapViewMode = 'canvas'
): void {
  const cur = $mmActiveState.get();
  $mmActiveState.set({
    ...cur,
    activeMapId: record.id,
    viewMode: normalizeMmViewMode(viewMode),
    layout: normalizeLayout(record.layout),
    selectedNodeCount: 1,
    primaryNodeId: record.root.id,
    isDirty: false,
    activeModal: 'workbench',
    articlePopoverOpen: false,
    exportMenuOpen: false,
  });
}

export function closeMmWorkbenchState(): void {
  const cur = $mmActiveState.get();
  $mmActiveState.set({
    ...cur,
    activeMapId: null,
    selectedNodeCount: 0,
    primaryNodeId: null,
    isDirty: false,
    activeModal: cur.activeModal === 'workbench' ? 'none' : cur.activeModal,
    exportMenuOpen: false,
  });
}

export function setMmViewMode(mode: string): MindMapViewMode {
  const safe = normalizeMmViewMode(mode);
  $mmActiveState.setKey('viewMode', safe);
  return safe;
}

export function setMmLayoutMode(layout: string): MindMapLayout {
  const safe = normalizeLayout(layout);
  $mmActiveState.setKey('layout', safe);
  return safe;
}

export function setMmSelectionState(
  selectedNodeCount: number,
  primaryNodeId: string | null = null
): void {
  const cur = $mmActiveState.get();
  $mmActiveState.set({
    ...cur,
    selectedNodeCount: Math.max(0, Math.floor(selectedNodeCount)),
    primaryNodeId,
  });
}

export function setMmDirtyState(isDirty: boolean): void {
  $mmActiveState.setKey('isDirty', Boolean(isDirty));
}

export function setMmActiveModal(modal: MindMapModalKind): void {
  $mmActiveState.setKey('activeModal', modal);
}

export function setMmArticlePopoverOpen(open: boolean): void {
  $mmActiveState.setKey('articlePopoverOpen', Boolean(open));
}

export function setMmExportMenuOpen(open: boolean): void {
  $mmActiveState.setKey('exportMenuOpen', Boolean(open));
}

export function resetMindMapWorkbenchStore(): void {
  $mmItems.set([]);
  $mmCategories.set([...DEFAULT_MINDMAP_CATEGORIES]);
  $mmFilter.set({ ...INITIAL_FILTER });
  $mmActiveState.set({ ...INITIAL_ACTIVE_STATE });
}
