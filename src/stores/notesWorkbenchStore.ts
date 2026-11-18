/**
 * notesWorkbenchStore.ts — Declarative Reactive State Store for `/notes` (`nanostores`)
 *
 * Centralizes note items, multi-dimensional filters (`kind`, `articleSlug`, `color`, `searchQuery`),
 * derived counts (`$notesStats`, `$filteredNotes`), and active modal/popover choreography state.
 */

import { atom, computed, map } from 'nanostores';
import type { ArticleHighlightRecord } from '../utils/articleHighlightEngine.ts';

export type NoteFilterKind = 'all' | 'free' | 'highlight' | 'ai';
export type NoteFilterColor = 'all' | 'red' | 'blue' | 'green' | 'yellow' | 'gold';
export type NotesActiveModal = 'none' | 'reader' | 'editor' | 'delete-confirm';

export type WorkbenchNoteRecord = ArticleHighlightRecord & {
  storageSlug?: string;
};

export interface NotesFilterState {
  kind: NoteFilterKind;
  articleSlug: string;
  color: NoteFilterColor;
  searchQuery: string;
  articleSearchQuery: string;
}

export interface NotesModalState {
  modal: NotesActiveModal;
  viewingNoteId: string | null;
  editingNoteId: string | null;
  editorTab: 'write' | 'preview';
  popoverOpen: boolean;
}

export interface NotesArticleSummary {
  slug: string;
  title: string;
  count: number;
}

export interface NotesStatsSummary {
  total: number;
  free: number;
  highlight: number;
  ai: number;
  standalone: number;
  articles: NotesArticleSummary[];
}

const SESSION_KIND_KEY = 'notes-subtab-kind';

export function normalizeWorkbenchNoteColor(raw?: string): Exclude<NoteFilterColor, 'all'> {
  if (raw === 'red' || raw === 'blue' || raw === 'green' || raw === 'yellow' || raw === 'gold') {
    return raw;
  }
  return 'blue';
}

function cleanHeadingSection(raw?: string): string {
  return String(raw || '').replace(/^§\s*/, '').replace(/^#+\s*/, '').trim();
}

export const $notesItems = atom<WorkbenchNoteRecord[]>([]);

export const $notesFilter = map<NotesFilterState>({
  kind: 'all',
  articleSlug: 'all',
  color: 'all',
  searchQuery: '',
  articleSearchQuery: '',
});

export const $notesActiveModal = map<NotesModalState>({
  modal: 'none',
  viewingNoteId: null,
  editingNoteId: null,
  editorTab: 'write',
  popoverOpen: false,
});

export const $hasActiveNotesFilters = computed($notesFilter, (filter) => {
  return (
    filter.kind !== 'all' ||
    filter.articleSlug !== 'all' ||
    filter.color !== 'all' ||
    Boolean(filter.searchQuery.trim())
  );
});

export const $notesStats = computed($notesItems, (items): NotesStatsSummary => {
  const articleMap = new Map<string, NotesArticleSummary>();
  let free = 0;
  let highlight = 0;
  let ai = 0;
  let standalone = 0;

  for (const item of items) {
    const kind = item.kind || 'highlight';
    if (kind === 'free') free += 1;
    else if (kind === 'ai') ai += 1;
    else highlight += 1;

    if (!item.postSlug || item.postSlug === '__standalone__' || item.kind === 'free') {
      standalone += 1;
    }
    if (item.postSlug && item.postSlug !== '__standalone__') {
      let bucket = articleMap.get(item.postSlug);
      if (!bucket) {
        bucket = {
          slug: item.postSlug,
          title: item.postTitle || item.postSlug,
          count: 0,
        };
        articleMap.set(item.postSlug, bucket);
      }
      bucket.count += 1;
    }
  }

  return {
    total: items.length,
    free,
    highlight,
    ai,
    standalone,
    articles: Array.from(articleMap.values()),
  };
});

export function filterWorkbenchNotes(
  items: readonly WorkbenchNoteRecord[],
  filter: NotesFilterState
): WorkbenchNoteRecord[] {
  const kw = filter.searchQuery.trim().toLowerCase();
  return items.filter((item) => {
    const itemKind = item.kind || 'highlight';
    if (filter.kind !== 'all' && itemKind !== filter.kind) return false;
    if (filter.articleSlug === 'standalone' && item.postSlug !== '__standalone__' && item.kind !== 'free') {
      return false;
    }
    if (
      filter.articleSlug !== 'all' &&
      filter.articleSlug !== 'standalone' &&
      item.postSlug !== filter.articleSlug
    ) {
      return false;
    }
    if (filter.color !== 'all' && normalizeWorkbenchNoteColor(item.color) !== filter.color) {
      return false;
    }
    if (kw) {
      const matchTitle = (item.title || '').toLowerCase().includes(kw);
      const matchText = (item.text || '').toLowerCase().includes(kw);
      const matchRawText = (item.rawText || '').toLowerCase().includes(kw);
      const matchComment = (item.comment || '').toLowerCase().includes(kw);
      const matchArticle = (item.postTitle || '').toLowerCase().includes(kw);
      const matchHeading = cleanHeadingSection(item.headingText).toLowerCase().includes(kw);
      const matchQuestion = (item.question || '').toLowerCase().includes(kw);
      const matchTags = (item.tags || []).some((t) => t.toLowerCase().includes(kw));
      if (
        !matchTitle &&
        !matchText &&
        !matchRawText &&
        !matchComment &&
        !matchArticle &&
        !matchHeading &&
        !matchQuestion &&
        !matchTags
      ) {
        return false;
      }
    }
    return true;
  });
}

export const $filteredNotes = computed([$notesItems, $notesFilter], (items, filter) =>
  filterWorkbenchNotes(items, filter)
);

export function setNotesItems(items: WorkbenchNoteRecord[]): void {
  $notesItems.set(items);
}

export function setNotesKind(kind: NoteFilterKind, persistSession = true): void {
  const safeKind: NoteFilterKind =
    kind === 'free' || kind === 'highlight' || kind === 'ai' ? kind : 'all';
  $notesFilter.setKey('kind', safeKind);
  if (persistSession && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(SESSION_KIND_KEY, safeKind);
    } catch {}
  }
}

export function hydrateNotesKindFromSession(): NoteFilterKind {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const saved = sessionStorage.getItem(SESSION_KIND_KEY);
      if (saved === 'all' || saved === 'free' || saved === 'highlight' || saved === 'ai') {
        $notesFilter.setKey('kind', saved);
        return saved;
      }
    } catch {}
  }
  return $notesFilter.get().kind;
}

export function setNotesArticleSlug(slug: string): void {
  $notesFilter.setKey('articleSlug', slug || 'all');
}

export function setNotesColor(color: string): void {
  const safeColor: NoteFilterColor =
    color === 'red' || color === 'blue' || color === 'green' || color === 'yellow' || color === 'gold'
      ? color
      : 'all';
  $notesFilter.setKey('color', safeColor);
}

export function setNotesSearchQuery(query: string): void {
  $notesFilter.setKey('searchQuery', query.trim());
}

export function setNotesArticleSearchQuery(query: string): void {
  $notesFilter.setKey('articleSearchQuery', query);
}

export function resetNotesFilters(): void {
  $notesFilter.set({
    kind: 'all',
    articleSlug: 'all',
    color: 'all',
    searchQuery: '',
    articleSearchQuery: '',
  });
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(SESSION_KIND_KEY, 'all');
    } catch {}
  }
}

export function openNotesModal(
  modal: Exclude<NotesActiveModal, 'none'>,
  targetId: string | null = null
): void {
  const cur = $notesActiveModal.get();
  $notesActiveModal.set({
    ...cur,
    modal,
    viewingNoteId: modal === 'reader' ? targetId : cur.viewingNoteId,
    editingNoteId: modal === 'editor' ? targetId : cur.editingNoteId,
    popoverOpen: false,
  });
}

export function closeNotesModal(modal?: NotesActiveModal): void {
  const cur = $notesActiveModal.get();
  if (modal && cur.modal !== modal) {
    if (modal === 'reader') $notesActiveModal.setKey('viewingNoteId', null);
    if (modal === 'editor') $notesActiveModal.setKey('editingNoteId', null);
    return;
  }
  $notesActiveModal.set({
    ...cur,
    modal: 'none',
    viewingNoteId: modal === 'reader' || !modal ? null : cur.viewingNoteId,
    editingNoteId: modal === 'editor' || !modal ? null : cur.editingNoteId,
  });
}

export function setNotesEditorTab(tab: 'write' | 'preview'): void {
  $notesActiveModal.setKey('editorTab', tab);
}

export function setNotesPopoverOpen(open: boolean): void {
  $notesActiveModal.setKey('popoverOpen', open);
}

export function resetNotesWorkbenchStore(): void {
  $notesItems.set([]);
  $notesFilter.set({
    kind: 'all',
    articleSlug: 'all',
    color: 'all',
    searchQuery: '',
    articleSearchQuery: '',
  });
  $notesActiveModal.set({
    modal: 'none',
    viewingNoteId: null,
    editingNoteId: null,
    editorTab: 'write',
    popoverOpen: false,
  });
}
