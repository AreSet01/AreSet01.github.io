/**
 * collectionFilterStore.ts — Reactive Collection Filter Store (`nanostores`) for `/life` & `/gallery`
 *
 * Provides clean reactive category/search/tag/modal state management for collection workbenches
 * while keeping synchronous dataset matching and zero-coupling lifecycle resets.
 */

import { computed, map, type MapStore, type ReadableAtom } from 'nanostores';

export type CollectionScope = 'life' | 'gallery';

export interface CollectionFilterState {
  category: string;
  searchQuery: string;
  activeTag: string;
  totalCount: number;
  visibleCount: number;
  isEmpty: boolean;
  activeModalId: string | null;
}

export interface CollectionDatasetCandidate {
  category?: string | null;
  searchText?: string | null;
}

export interface CollectionFilterController {
  scope: CollectionScope;
  $state: MapStore<CollectionFilterState>;
  $hasActiveFilter: ReadableAtom<boolean>;
  setCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  selectTag: (tag: string, options?: { resetCategoryToAll?: boolean }) => void;
  resetFilters: () => void;
  setCounts: (totalCount: number, visibleCount: number) => void;
  setActiveModal: (modalId: string | null) => void;
  matchesItem: (candidate: CollectionDatasetCandidate) => boolean;
}

export function matchCollectionDatasetItem(
  candidate: CollectionDatasetCandidate,
  filter: Pick<CollectionFilterState, 'category' | 'searchQuery'>
): boolean {
  const cat = candidate.category || '';
  const text = (candidate.searchText || '').toLowerCase();
  const q = filter.searchQuery.toLowerCase().trim();
  const matchesCat = !filter.category || filter.category === 'all' || cat === filter.category;
  const matchesQuery = !q || text.includes(q);
  return matchesCat && matchesQuery;
}

export function createCollectionFilterStore(
  scope: CollectionScope,
  initialCategory = 'all'
): CollectionFilterController {
  const $state = map<CollectionFilterState>({
    category: initialCategory,
    searchQuery: '',
    activeTag: '',
    totalCount: 0,
    visibleCount: 0,
    isEmpty: false,
    activeModalId: null,
  });

  const $hasActiveFilter = computed($state, (st) => {
    return st.category !== 'all' || Boolean(st.searchQuery.trim());
  });

  function setCategory(category: string): void {
    $state.setKey('category', category || 'all');
  }

  function setSearchQuery(query: string): void {
    const cur = $state.get();
    $state.set({
      ...cur,
      searchQuery: query,
      activeTag: cur.activeTag && cur.activeTag !== query ? '' : cur.activeTag,
    });
  }

  function selectTag(tag: string, options: { resetCategoryToAll?: boolean } = {}): void {
    const cur = $state.get();
    $state.set({
      ...cur,
      category: options.resetCategoryToAll ? 'all' : cur.category,
      searchQuery: tag,
      activeTag: tag,
    });
  }

  function resetFilters(): void {
    const cur = $state.get();
    $state.set({
      ...cur,
      category: 'all',
      searchQuery: '',
      activeTag: '',
      visibleCount: cur.totalCount,
      isEmpty: cur.totalCount === 0,
    });
  }

  function setCounts(totalCount: number, visibleCount: number): void {
    const cur = $state.get();
    $state.set({
      ...cur,
      totalCount: Math.max(0, totalCount),
      visibleCount: Math.max(0, visibleCount),
      isEmpty: visibleCount <= 0,
    });
  }

  function setActiveModal(modalId: string | null): void {
    $state.setKey('activeModalId', modalId);
  }

  function matchesItem(candidate: CollectionDatasetCandidate): boolean {
    return matchCollectionDatasetItem(candidate, $state.get());
  }

  return {
    scope,
    $state,
    $hasActiveFilter,
    setCategory,
    setSearchQuery,
    selectTag,
    resetFilters,
    setCounts,
    setActiveModal,
    matchesItem,
  };
}

export const lifeFilterStore = createCollectionFilterStore('life');
export const galleryFilterStore = createCollectionFilterStore('gallery');

export function getCollectionFilterController(scope: CollectionScope): CollectionFilterController {
  return scope === 'life' ? lifeFilterStore : galleryFilterStore;
}

export function resetAllCollectionFilterStores(): void {
  lifeFilterStore.$state.set({
    category: 'all',
    searchQuery: '',
    activeTag: '',
    totalCount: 0,
    visibleCount: 0,
    isEmpty: false,
    activeModalId: null,
  });
  galleryFilterStore.$state.set({
    category: 'all',
    searchQuery: '',
    activeTag: '',
    totalCount: 0,
    visibleCount: 0,
    isEmpty: false,
    activeModalId: null,
  });
}
