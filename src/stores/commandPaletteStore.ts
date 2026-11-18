/**
 * commandPaletteStore.ts — ⌘K 全局命令面板声明式状态机与动作流 (Nanostores)
 *
 * 核心原子状态：
 * - isOpen: 面板开闭态
 * - query: 原始输入文本
 * - selectedCategory: 用户选中的标签分类 ('all' | 'posts' | 'notes' | 'mindmaps' | 'commands')
 * - effectiveCategory: 解析 `>` 指令前缀后的实际生效分类
 * - isCommandPrefix: 当前是否处于 `>` / `＞` 前缀指令模式
 * - activeIndex: 键盘/指针当前高亮的结果项下标
 * - items: 当前匹配结果列表 (PaletteResultItem[])
 * - statusText: 状态栏说明文案
 * - indexState: 静态文章索引加载状态 ('idle' | 'loading' | 'ready' | 'error')
 */

import { atom, batch, computed } from 'nanostores';
import {
  parsePaletteQuery,
  queryCommandPalette,
  stepPaletteCategory,
  type PaletteCategory,
  type PaletteDataSources,
  type PaletteQueryOutput,
  type PaletteResultItem,
  type RawPostSearchEntry,
} from '../utils/commandPaletteEngine.ts';

export type PaletteIndexState = 'idle' | 'loading' | 'ready' | 'error';

export const DEFAULT_PALETTE_STATUS = '输入关键词跨库检索，或输入 > 唤出快捷指令。';

export const isOpen = atom<boolean>(false);
export const query = atom<string>('');
export const selectedCategory = atom<PaletteCategory>('all');
export const effectiveCategory = atom<PaletteCategory>('all');
export const isCommandPrefix = atom<boolean>(false);
export const activeIndex = atom<number>(-1);
export const items = atom<PaletteResultItem[]>([]);
export const statusText = atom<string>(DEFAULT_PALETTE_STATUS);
export const indexState = atom<PaletteIndexState>('idle');
export const postEntries = atom<RawPostSearchEntry[]>([]);

export const activeItem = computed([items, activeIndex], (list, idx) =>
  idx >= 0 && idx < list.length ? list[idx] : null
);

export const commandPaletteStore = {
  isOpen,
  query,
  selectedCategory,
  effectiveCategory,
  isCommandPrefix,
  activeIndex,
  items,
  statusText,
  indexState,
  postEntries,
  activeItem,
} as const;

export type PaletteQueryRunner = (
  rawInput: string,
  category: PaletteCategory,
  posts: RawPostSearchEntry[]
) => PaletteQueryOutput;

function clampActiveIndex(currentIndex: number, total: number, resetActive: boolean): number {
  if (total <= 0) return -1;
  if (resetActive) return 0;
  if (currentIndex < 0) return 0;
  if (currentIndex >= total) return total - 1;
  return currentIndex;
}

export function openCommandPalette(): void {
  isOpen.set(true);
}

export function closeCommandPalette(): void {
  isOpen.set(false);
}

export function setPaletteIndexState(nextState: PaletteIndexState, customStatus?: string): void {
  batch(() => {
    indexState.set(nextState);
    if (customStatus !== undefined) {
      statusText.set(customStatus);
    } else if (nextState === 'loading' && items.get().length === 0) {
      statusText.set('正在整理搜索索引...');
    } else if (nextState === 'error' && items.get().length === 0) {
      statusText.set('搜索索引加载失败。');
    }
  });
}

export function setPalettePostEntries(entries: RawPostSearchEntry[]): void {
  postEntries.set(Array.isArray(entries) ? entries : []);
}

export function applyPaletteQueryOutput(
  output: PaletteQueryOutput,
  opts?: { resetActive?: boolean; rawInput?: string; selected?: PaletteCategory }
): PaletteQueryOutput {
  const resetActive = opts?.resetActive ?? true;
  batch(() => {
    if (opts?.rawInput !== undefined) {
      query.set(opts.rawInput);
    }
    if (opts?.selected !== undefined) {
      selectedCategory.set(opts.selected);
    }
    effectiveCategory.set(output.effectiveCategory);
    isCommandPrefix.set(output.isCommandPrefix);
    items.set(output.items);
    statusText.set(output.statusText);
    activeIndex.set(clampActiveIndex(activeIndex.get(), output.items.length, resetActive));
    if (indexState.get() !== 'loading' || output.items.length > 0) {
      if (indexState.get() !== 'error' || output.items.length > 0) {
        indexState.set('ready');
      }
    }
  });
  return output;
}

export function evaluatePaletteStore(
  sourcesOrRunner?: PaletteDataSources | PaletteQueryRunner,
  opts?: { resetActive?: boolean }
): PaletteQueryOutput {
  const raw = query.get();
  const cat = selectedCategory.get();
  const out =
    typeof sourcesOrRunner === 'function'
      ? sourcesOrRunner(raw, cat, postEntries.get())
      : queryCommandPalette(raw, cat, {
          posts: postEntries.get(),
          ...(sourcesOrRunner ?? {}),
        });
  return applyPaletteQueryOutput(out, { resetActive: opts?.resetActive ?? true });
}

export function setPaletteQuery(
  nextQuery: string,
  sourcesOrRunner?: PaletteDataSources | PaletteQueryRunner,
  opts?: { resetActive?: boolean }
): PaletteQueryOutput | null {
  const safeQuery = String(nextQuery ?? '');
  const parsed = parsePaletteQuery(safeQuery, selectedCategory.get());
  batch(() => {
    query.set(safeQuery);
    effectiveCategory.set(parsed.effectiveCategory);
    isCommandPrefix.set(parsed.isCommandPrefix);
  });
  if (sourcesOrRunner !== undefined) {
    return evaluatePaletteStore(sourcesOrRunner, opts);
  }
  return null;
}

export function setPaletteCategory(
  nextCategory: PaletteCategory,
  sourcesOrRunner?: PaletteDataSources | PaletteQueryRunner,
  opts?: { resetActive?: boolean }
): { strippedQuery: string; output: PaletteQueryOutput | null } {
  const safeCategory: PaletteCategory = nextCategory || 'all';
  let nextRaw = query.get();
  const trimmed = nextRaw.trimStart();
  if (safeCategory !== 'commands' && (trimmed.startsWith('>') || trimmed.startsWith('＞'))) {
    nextRaw = trimmed.slice(1).trimStart();
  }
  const parsed = parsePaletteQuery(nextRaw, safeCategory);
  batch(() => {
    selectedCategory.set(safeCategory);
    query.set(nextRaw);
    effectiveCategory.set(parsed.effectiveCategory);
    isCommandPrefix.set(parsed.isCommandPrefix);
  });
  const output =
    sourcesOrRunner !== undefined
      ? evaluatePaletteStore(sourcesOrRunner, { resetActive: opts?.resetActive ?? true })
      : null;
  return { strippedQuery: nextRaw, output };
}

export function stepPaletteCategoryInStore(
  delta: 1 | -1,
  sourcesOrRunner?: PaletteDataSources | PaletteQueryRunner
): PaletteCategory {
  const nextCat = stepPaletteCategory(selectedCategory.get(), delta);
  setPaletteCategory(nextCat, sourcesOrRunner, { resetActive: true });
  return nextCat;
}

export function togglePaletteCommandPrefix(
  sourcesOrRunner?: PaletteDataSources | PaletteQueryRunner
): string {
  const cur = query.get().trimStart();
  const nextRaw =
    !cur.startsWith('>') && !cur.startsWith('＞') ? `> ${cur}` : cur.slice(1).trimStart();
  setPaletteQuery(nextRaw, sourcesOrRunner, { resetActive: true });
  return nextRaw;
}

export function setActivePaletteIndex(nextIndex: number): number {
  const list = items.get();
  if (!list.length) {
    activeIndex.set(-1);
    return -1;
  }
  const wrapped = ((nextIndex % list.length) + list.length) % list.length;
  activeIndex.set(wrapped);
  return wrapped;
}

export function stepActivePaletteIndex(delta: number): number {
  const cur = activeIndex.get();
  return setActivePaletteIndex((cur < 0 ? 0 : cur) + delta);
}

export function resetCommandPaletteStore(): void {
  batch(() => {
    isOpen.set(false);
    query.set('');
    selectedCategory.set('all');
    effectiveCategory.set('all');
    isCommandPrefix.set(false);
    activeIndex.set(-1);
    items.set([]);
    statusText.set(DEFAULT_PALETTE_STATUS);
    indexState.set('idle');
    postEntries.set([]);
  });
}
