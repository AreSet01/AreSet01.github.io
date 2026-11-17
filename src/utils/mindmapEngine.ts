/**
 * mindmapEngine.ts — 思维导图数据模型、树操作、Markdown 双向解析、文章骨架生成与 SVG 拓扑绘制。
 *
 * 设计为纯 TypeScript 模块（零 DOM 强依赖，仅在显式读写 localStorage / Canvas 测量时判空），
 * 方便在浏览器客户端与 Node `--experimental-strip-types` 单元测试中直接导入。
 */

export type MindMapLayout = 'logic-right' | 'mindmap-both' | 'tree-down';
export type MindMapColor = 'ink' | 'red' | 'blue' | 'green' | 'yellow' | 'gold';
export type MindMapCardColor = 'red' | 'blue' | 'green' | 'yellow' | 'gold';

export interface MindMapNode {
  id: string;
  text: string;
  children: MindMapNode[];
  collapsed?: boolean;
  color?: MindMapColor;
  note?: string;
  side?: 'left' | 'right';
}

export interface MindMapRecord {
  id: string;
  title: string;
  category: string;
  tags: string[];
  color?: MindMapCardColor;
  layout: MindMapLayout;
  postSlug?: string;
  postTitle?: string;
  root: MindMapNode;
  createdAt: number;
  updatedAt: number;
  serverRev?: number;
  dirty?: boolean;
  deleted?: boolean;
}

export interface MindMapCategoryState {
  categories: string[];
  updatedAt: number;
  dirty?: boolean;
}

export interface PostHeadingItem {
  depth: number;
  slug: string;
  text: string;
}

export interface ArticleNoteSnippet {
  kind?: string;
  text: string;
  comment?: string;
  headingText?: string;
  question?: string;
  color?: string;
}

export interface ArticleSourceInput {
  slug: string;
  title: string;
  headings: PostHeadingItem[];
  notes?: ArticleNoteSnippet[];
}

export const MINDMAP_STORAGE_KEY = 'areSet_mindmaps_v1';
export const MINDMAP_CATEGORIES_KEY = 'areSet_mindmap_categories_v1';
export const DEFAULT_MINDMAP_CATEGORIES = ['架构拆解', '源码研读', '知识体系', '灵感随想'];

export const MINDMAP_LIMITS = {
  maxTitle: 140,
  maxCategory: 32,
  maxCategories: 24,
  maxTag: 32,
  maxTags: 12,
  maxNodeText: 400,
  maxNodeNote: 4_000,
  maxNodesPerMap: 800,
  maxDepth: 12,
  maxMaps: 500,
} as const;

export const COLOR_PALETTE: Record<
  MindMapColor,
  { hex: string; label: string }
> = {
  ink: { hex: '#141517', label: '玄墨' },
  red: { hex: '#ef5350', label: '朱红' },
  blue: { hex: '#42a5f5', label: '靛青' },
  green: { hex: '#66bb6a', label: '竹青' },
  yellow: { hex: '#ffa726', label: '雄黄' },
  gold: { hex: '#c9922e', label: '赭金' },
};

const CARD_COLORS = new Set<MindMapCardColor>(['red', 'blue', 'green', 'yellow', 'gold']);
const NODE_COLORS = new Set<MindMapColor>(['ink', 'red', 'blue', 'green', 'yellow', 'gold']);
const VALID_LAYOUTS = new Set<MindMapLayout>(['logic-right', 'mindmap-both', 'tree-down']);

export function createMindMapId(prefix = 'mm'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function createNodeId(): string {
  return `n_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeCardColor(raw?: unknown): MindMapCardColor {
  return CARD_COLORS.has(raw as MindMapCardColor) ? (raw as MindMapCardColor) : 'blue';
}

export function normalizeNodeColor(raw?: unknown): MindMapColor {
  return NODE_COLORS.has(raw as MindMapColor) ? (raw as MindMapColor) : 'ink';
}

export function normalizeLayout(raw?: unknown): MindMapLayout {
  return VALID_LAYOUTS.has(raw as MindMapLayout) ? (raw as MindMapLayout) : 'logic-right';
}

export function colorHex(color?: MindMapColor | MindMapCardColor): string {
  return COLOR_PALETTE[normalizeNodeColor(color)].hex;
}

export function colorLabel(color?: MindMapColor | MindMapCardColor): string {
  return COLOR_PALETTE[normalizeNodeColor(color)].label;
}

export function normalizePostSlug(rawSlug?: string): string {
  if (!rawSlug || rawSlug === '__standalone__' || rawSlug === '/__standalone__/') {
    return '';
  }
  let s = rawSlug.trim();
  if (s.startsWith('/posts/')) s = s.slice(7);
  if (s.startsWith('/')) s = s.slice(1);
  if (s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

export function cloneNode(node: MindMapNode): MindMapNode {
  return {
    id: node.id,
    text: node.text,
    ...(node.collapsed ? { collapsed: true } : {}),
    ...(node.color && node.color !== 'ink' ? { color: node.color } : {}),
    ...(node.note ? { note: node.note } : {}),
    ...(node.side === 'left' || node.side === 'right' ? { side: node.side } : {}),
    children: Array.isArray(node.children) ? node.children.map(cloneNode) : [],
  };
}

export function normalizeNode(
  raw: unknown,
  depth = 0,
  counter = { count: 0 }
): MindMapNode | null {
  if (!raw || typeof raw !== 'object') return null;
  if (depth > MINDMAP_LIMITS.maxDepth || counter.count >= MINDMAP_LIMITS.maxNodesPerMap) return null;
  counter.count += 1;

  const obj = raw as Record<string, unknown>;
  const rawId = typeof obj.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(obj.id.trim())
    ? obj.id.trim()
    : createNodeId();
  const rawText = typeof obj.text === 'string'
    ? obj.text.replace(/\r?\n/g, ' ').trim().slice(0, MINDMAP_LIMITS.maxNodeText)
    : '';
  const text = rawText || (depth === 0 ? '核心主题' : '新节点');

  const node: MindMapNode = {
    id: rawId,
    text,
    children: [],
  };

  if (obj.collapsed === true && depth >= 1) node.collapsed = true;
  if (NODE_COLORS.has(obj.color as MindMapColor) && obj.color !== 'ink') {
    node.color = obj.color as MindMapColor;
  }
  if (typeof obj.note === 'string' && obj.note.trim()) {
    node.note = obj.note.trim().slice(0, MINDMAP_LIMITS.maxNodeNote);
  }
  if (obj.side === 'left' || obj.side === 'right') {
    node.side = obj.side;
  }

  if (Array.isArray(obj.children) && depth < MINDMAP_LIMITS.maxDepth) {
    for (const child of obj.children) {
      if (counter.count >= MINDMAP_LIMITS.maxNodesPerMap) break;
      const normalized = normalizeNode(child, depth + 1, counter);
      if (normalized) node.children.push(normalized);
    }
  }

  return node;
}

export function normalizeMindMapRecord(raw: unknown): MindMapRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!id || id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) return null;

  const root = normalizeNode(obj.root, 0, { count: 0 }) || {
    id: createNodeId(),
    text: '核心主题',
    children: [],
  };

  const titleRaw = typeof obj.title === 'string' ? obj.title.trim() : '';
  const title = (titleRaw || root.text || '未命名导图').slice(0, MINDMAP_LIMITS.maxTitle);

  const categoryRaw = typeof obj.category === 'string' ? obj.category.trim() : '';
  const category = (categoryRaw || DEFAULT_MINDMAP_CATEGORIES[0]).slice(0, MINDMAP_LIMITS.maxCategory);

  const tags = Array.isArray(obj.tags)
    ? Array.from(
        new Set(
          obj.tags
            .map((t) => String(t ?? '').trim().slice(0, MINDMAP_LIMITS.maxTag))
            .filter(Boolean)
        )
      ).slice(0, MINDMAP_LIMITS.maxTags)
    : [];

  const createdAt = Number.isFinite(Number(obj.createdAt)) && Number(obj.createdAt) > 0
    ? Number(obj.createdAt)
    : Date.now();
  const updatedAt = Number.isFinite(Number(obj.updatedAt)) && Number(obj.updatedAt) > 0
    ? Number(obj.updatedAt)
    : createdAt;

  const postSlug = typeof obj.postSlug === 'string' ? normalizePostSlug(obj.postSlug) : '';
  const postTitle = typeof obj.postTitle === 'string' ? obj.postTitle.trim().slice(0, 200) : '';

  const rec: MindMapRecord = {
    id,
    title,
    category,
    tags,
    color: normalizeCardColor(obj.color),
    layout: normalizeLayout(obj.layout),
    ...(postSlug ? { postSlug } : {}),
    ...(postTitle ? { postTitle } : {}),
    root,
    createdAt,
    updatedAt,
  };

  if (Number.isFinite(Number(obj.serverRev))) rec.serverRev = Number(obj.serverRev);
  if (typeof obj.dirty === 'boolean') rec.dirty = obj.dirty;
  if (typeof obj.deleted === 'boolean') rec.deleted = obj.deleted;

  return rec;
}

// ---------- LocalStorage Persistence ----------

function emitChanged(): void {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('mindmaps:changed'));
  }
}

export function loadAllMindMaps(): MindMapRecord[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(MINDMAP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: MindMapRecord[] = [];
    for (const item of parsed) {
      const normalized = normalizeMindMapRecord(item);
      if (normalized) result.push(normalized);
    }
    return result;
  } catch (err) {
    console.warn('[mindmapEngine] Failed to load mindmaps:', err);
    return [];
  }
}

export function loadActiveMindMaps(): MindMapRecord[] {
  return loadAllMindMaps()
    .filter((item) => !item.deleted)
    .sort((a, b) => Number(b.updatedAt || b.createdAt) - Number(a.updatedAt || a.createdAt));
}

export function saveAllMindMaps(records: MindMapRecord[], emitEvent = true): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const cleaned = records
      .map((item) => normalizeMindMapRecord(item))
      .filter((item): item is MindMapRecord => Boolean(item))
      .slice(0, MINDMAP_LIMITS.maxMaps);
    window.localStorage.setItem(MINDMAP_STORAGE_KEY, JSON.stringify(cleaned));
    if (emitEvent) emitChanged();
  } catch (err) {
    console.warn('[mindmapEngine] Failed to save mindmaps:', err);
  }
}

export function upsertMindMap(
  draft: Partial<MindMapRecord> & { id?: string },
  markDirty = true
): MindMapRecord {
  const all = loadAllMindMaps();
  const now = Date.now();
  const id = draft.id && /^[A-Za-z0-9_-]+$/.test(draft.id) ? draft.id : createMindMapId();
  const index = all.findIndex((item) => item.id === id);
  const existing = index >= 0 ? all[index] : null;

  const merged = normalizeMindMapRecord({
    ...existing,
    ...draft,
    id,
    createdAt: existing?.createdAt || draft.createdAt || now,
    updatedAt: now,
    deleted: false,
    dirty: markDirty ? true : draft.dirty ?? false,
  })!;

  const next = index >= 0 ? [...all.slice(0, index), merged, ...all.slice(index + 1)] : [merged, ...all];
  saveAllMindMaps(next, markDirty);
  return merged;
}

export function deleteMindMap(id: string): boolean {
  const all = loadAllMindMaps();
  const index = all.findIndex((item) => item.id === id);
  if (index === -1) return false;
  const next = [...all];
  next[index] = {
    ...next[index],
    deleted: true,
    dirty: true,
    updatedAt: Date.now(),
  };
  saveAllMindMaps(next, true);
  return true;
}

export function createBlankMindMap(category?: string, title = '新建思维导图'): MindMapRecord {
  const cats = loadMindMapCategoryState().categories;
  const resolvedCategory = category && category !== 'all' ? category : cats[0] || DEFAULT_MINDMAP_CATEGORIES[0];
  const rootText = title.trim() || '核心主题';
  return {
    id: createMindMapId(),
    title: rootText,
    category: resolvedCategory,
    tags: [],
    color: 'blue',
    layout: 'logic-right',
    root: {
      id: createNodeId(),
      text: rootText,
      children: [
        {
          id: createNodeId(),
          text: '主分支 1',
          color: 'blue',
          children: [
            { id: createNodeId(), text: '关键要点', children: [] },
          ],
        },
        {
          id: createNodeId(),
          text: '主分支 2',
          color: 'green',
          children: [],
        },
      ],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    dirty: true,
  };
}

// ---------- Dynamic Categories Management ----------

export function sanitizeCategoryList(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : DEFAULT_MINDMAP_CATEGORIES;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const clean = String(item ?? '').trim().slice(0, MINDMAP_LIMITS.maxCategory);
    if (!clean || clean === 'all' || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= MINDMAP_LIMITS.maxCategories) break;
  }
  return out.length > 0 ? out : [...DEFAULT_MINDMAP_CATEGORIES];
}

export function loadMindMapCategoryState(): MindMapCategoryState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { categories: [...DEFAULT_MINDMAP_CATEGORIES], updatedAt: 0, dirty: false };
  }
  try {
    const raw = window.localStorage.getItem(MINDMAP_CATEGORIES_KEY);
    if (!raw) {
      return { categories: [...DEFAULT_MINDMAP_CATEGORIES], updatedAt: 0, dirty: false };
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { categories: sanitizeCategoryList(parsed), updatedAt: Date.now(), dirty: false };
    }
    return {
      categories: sanitizeCategoryList(parsed?.categories),
      updatedAt: Number(parsed?.updatedAt) || 0,
      dirty: Boolean(parsed?.dirty),
    };
  } catch {
    return { categories: [...DEFAULT_MINDMAP_CATEGORIES], updatedAt: 0, dirty: false };
  }
}

export function saveMindMapCategoryState(state: MindMapCategoryState, emitEvent = true): MindMapCategoryState {
  const normalized: MindMapCategoryState = {
    categories: sanitizeCategoryList(state.categories),
    updatedAt: Number(state.updatedAt) || Date.now(),
    dirty: Boolean(state.dirty),
  };
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(MINDMAP_CATEGORIES_KEY, JSON.stringify(normalized));
      if (emitEvent) emitChanged();
    } catch (err) {
      console.warn('[mindmapEngine] Failed to save categories:', err);
    }
  }
  return normalized;
}

export function addMindMapCategory(name: string): MindMapCategoryState {
  const clean = name.trim().slice(0, MINDMAP_LIMITS.maxCategory);
  const current = loadMindMapCategoryState();
  if (!clean || clean === 'all' || current.categories.includes(clean)) return current;
  return saveMindMapCategoryState({
    categories: [...current.categories, clean],
    updatedAt: Date.now(),
    dirty: true,
  });
}

export function renameMindMapCategory(oldName: string, newName: string): MindMapCategoryState {
  const from = oldName.trim();
  const to = newName.trim().slice(0, MINDMAP_LIMITS.maxCategory);
  const current = loadMindMapCategoryState();
  if (!from || !to || to === 'all' || from === to || current.categories.includes(to)) return current;
  const idx = current.categories.indexOf(from);
  if (idx === -1) return current;

  const nextList = [...current.categories];
  nextList[idx] = to;

  // Migrate matching active mindmaps to renamed category
  const all = loadAllMindMaps();
  let changed = false;
  const now = Date.now();
  const updatedMaps = all.map((m) => {
    if (!m.deleted && m.category === from) {
      changed = true;
      return { ...m, category: to, updatedAt: now, dirty: true };
    }
    return m;
  });
  if (changed) saveAllMindMaps(updatedMaps, false);

  return saveMindMapCategoryState({
    categories: nextList,
    updatedAt: now,
    dirty: true,
  });
}

export function deleteMindMapCategory(name: string, fallbackCategory?: string): MindMapCategoryState {
  const current = loadMindMapCategoryState();
  if (current.categories.length <= 1) return current;
  const remaining = current.categories.filter((c) => c !== name);
  if (remaining.length === current.categories.length) return current;

  const targetFallback = fallbackCategory && remaining.includes(fallbackCategory)
    ? fallbackCategory
    : remaining[0];

  const all = loadAllMindMaps();
  let changed = false;
  const now = Date.now();
  const updatedMaps = all.map((m) => {
    if (!m.deleted && m.category === name) {
      changed = true;
      return { ...m, category: targetFallback, updatedAt: now, dirty: true };
    }
    return m;
  });
  if (changed) saveAllMindMaps(updatedMaps, false);

  return saveMindMapCategoryState({
    categories: remaining,
    updatedAt: now,
    dirty: true,
  });
}

export function reorderMindMapCategories(nextList: string[]): MindMapCategoryState {
  return saveMindMapCategoryState({
    categories: nextList,
    updatedAt: Date.now(),
    dirty: true,
  });
}

// ---------- Tree Operations (Immutable Cloning) ----------

export function countNodes(root: MindMapNode): { total: number; hidden: number; maxDepth: number } {
  let total = 0;
  let hidden = 0;
  let maxDepth = 0;

  function walk(node: MindMapNode, depth: number, isAncestorCollapsed: boolean) {
    total += 1;
    if (isAncestorCollapsed) hidden += 1;
    if (depth > maxDepth) maxDepth = depth;
    const hideKids = isAncestorCollapsed || Boolean(node.collapsed);
    for (const child of node.children || []) {
      walk(child, depth + 1, hideKids);
    }
  }
  walk(root, 0, false);
  return { total, hidden, maxDepth };
}

export function countSubtreeDescendants(node: MindMapNode): number {
  let count = 0;
  for (const child of node.children || []) {
    count += 1 + countSubtreeDescendants(child);
  }
  return count;
}

export function findNodePath(root: MindMapNode, targetId: string): MindMapNode[] | null {
  if (root.id === targetId) return [root];
  for (const child of root.children || []) {
    const sub = findNodePath(child, targetId);
    if (sub) return [root, ...sub];
  }
  return null;
}

export function findNodeById(root: MindMapNode, targetId: string): MindMapNode | null {
  const path = findNodePath(root, targetId);
  return path ? path[path.length - 1] : null;
}

export function isDescendant(node: MindMapNode, maybeChildId: string): boolean {
  for (const child of node.children || []) {
    if (child.id === maybeChildId || isDescendant(child, maybeChildId)) return true;
  }
  return false;
}

export function addChildNode(
  root: MindMapNode,
  parentId: string,
  text = '新分支节点'
): { root: MindMapNode; createdId: string } | null {
  const path = findNodePath(root, parentId);
  if (!path || path.length - 1 >= MINDMAP_LIMITS.maxDepth) return null;
  if (countNodes(root).total >= MINDMAP_LIMITS.maxNodesPerMap) return null;

  const cloned = cloneNode(root);
  const target = findNodeById(cloned, parentId);
  if (!target) return null;
  target.collapsed = false;

  const isRootParent = cloned.id === parentId;
  const branchColors: MindMapColor[] = ['blue', 'green', 'yellow', 'gold', 'red'];
  const created: MindMapNode = {
    id: createNodeId(),
    text: text.trim().slice(0, MINDMAP_LIMITS.maxNodeText) || '新分支节点',
    children: [],
    ...(isRootParent ? { color: branchColors[target.children.length % branchColors.length] } : {}),
  };
  target.children.push(created);
  return { root: cloned, createdId: created.id };
}

export function addSiblingNode(
  root: MindMapNode,
  nodeId: string,
  text = '同级节点'
): { root: MindMapNode; createdId: string } | null {
  if (root.id === nodeId) {
    return addChildNode(root, root.id, text);
  }
  if (countNodes(root).total >= MINDMAP_LIMITS.maxNodesPerMap) return null;

  const cloned = cloneNode(root);
  const path = findNodePath(cloned, nodeId);
  if (!path || path.length < 2) return null;
  const parent = path[path.length - 2];
  const idx = parent.children.findIndex((c) => c.id === nodeId);
  const current = parent.children[idx];

  const isRootChild = parent.id === cloned.id;
  const branchColors: MindMapColor[] = ['blue', 'green', 'yellow', 'gold', 'red'];
  const created: MindMapNode = {
    id: createNodeId(),
    text: text.trim().slice(0, MINDMAP_LIMITS.maxNodeText) || '同级节点',
    children: [],
    ...(isRootChild ? { color: branchColors[(idx + 1) % branchColors.length] } : {}),
    ...(isRootChild && current?.side ? { side: current.side } : {}),
  };
  parent.children.splice(idx + 1, 0, created);
  return { root: cloned, createdId: created.id };
}

export function updateNodeProps(
  root: MindMapNode,
  nodeId: string,
  patch: Partial<Pick<MindMapNode, 'text' | 'color' | 'note' | 'collapsed' | 'side'>>
): MindMapNode {
  const cloned = cloneNode(root);
  const node = findNodeById(cloned, nodeId);
  if (!node) return cloned;

  if (typeof patch.text === 'string') {
    const cleaned = patch.text.replace(/\r?\n/g, ' ').trim().slice(0, MINDMAP_LIMITS.maxNodeText);
    node.text = cleaned || (cloned.id === nodeId ? '核心主题' : '节点');
  }
  if (patch.color !== undefined) {
    if (patch.color === 'ink') delete node.color;
    else node.color = normalizeNodeColor(patch.color);
  }
  if (patch.note !== undefined) {
    const trimmedNote = patch.note.trim().slice(0, MINDMAP_LIMITS.maxNodeNote);
    if (trimmedNote) node.note = trimmedNote;
    else delete node.note;
  }
  if (patch.collapsed !== undefined && cloned.id !== nodeId) {
    if (patch.collapsed) node.collapsed = true;
    else delete node.collapsed;
  }
  if (patch.side !== undefined) {
    node.side = patch.side;
  }
  return cloned;
}

export function removeNode(
  root: MindMapNode,
  nodeId: string
): { root: MindMapNode; nextFocusId: string } | null {
  if (root.id === nodeId) return null;
  const cloned = cloneNode(root);
  const path = findNodePath(cloned, nodeId);
  if (!path || path.length < 2) return null;
  const parent = path[path.length - 2];
  const idx = parent.children.findIndex((c) => c.id === nodeId);
  if (idx === -1) return null;
  parent.children.splice(idx, 1);
  const nextFocus =
    parent.children[Math.max(0, idx - 1)]?.id ||
    parent.children[0]?.id ||
    parent.id;
  return { root: cloned, nextFocusId: nextFocus };
}

/**
 * 批量删除指定节点集合（自动跳过根节点，避免重复删除父子节点）。
 */
export function removeNodesBatch(
  root: MindMapNode,
  nodeIds: Set<string>
): { root: MindMapNode; removedCount: number; nextFocusId: string } | null {
  const deleteIds = new Set([...nodeIds].filter((id) => id && id !== root.id));
  if (deleteIds.size === 0) return null;

  const cloned = cloneNode(root);
  let removedCount = 0;
  let fallbackParentId = cloned.id;

  const prune = (node: MindMapNode) => {
    if (!node.children?.length) return;
    const nextKids: MindMapNode[] = [];
    for (const child of node.children) {
      if (deleteIds.has(child.id)) {
        removedCount += 1;
        fallbackParentId = node.id;
      } else {
        prune(child);
        nextKids.push(child);
      }
    }
    node.children = nextKids;
  };

  prune(cloned);
  if (removedCount === 0) return null;
  const focusNode = findNodeById(cloned, fallbackParentId);
  const nextFocusId = focusNode ? focusNode.id : cloned.id;
  return { root: cloned, removedCount, nextFocusId };
}

/**
 * 批量更新选中节点颜色。
 */
export function updateNodesColorBatch(
  root: MindMapNode,
  nodeIds: Set<string>,
  color: MindMapColor
): MindMapNode {
  const cloned = cloneNode(root);
  const walk = (node: MindMapNode) => {
    if (nodeIds.has(node.id)) {
      if (color === 'ink') delete node.color;
      else node.color = normalizeNodeColor(color);
    }
    for (const c of node.children || []) walk(c);
  };
  walk(cloned);
  return cloned;
}

export function moveSiblingNode(root: MindMapNode, nodeId: string, direction: -1 | 1): MindMapNode {
  if (root.id === nodeId) return cloneNode(root);
  const cloned = cloneNode(root);
  const path = findNodePath(cloned, nodeId);
  if (!path || path.length < 2) return cloned;
  const parent = path[path.length - 2];
  const idx = parent.children.findIndex((c) => c.id === nodeId);
  const nextIdx = idx + direction;
  if (idx === -1 || nextIdx < 0 || nextIdx >= parent.children.length) return cloned;
  const [moved] = parent.children.splice(idx, 1);
  parent.children.splice(nextIdx, 0, moved);
  return cloned;
}

export function reparentOrReorderNode(
  root: MindMapNode,
  dragId: string,
  targetId: string,
  mode: 'inside' | 'before' | 'after' = 'inside'
): MindMapNode | null {
  if (!dragId || !targetId || dragId === targetId || dragId === root.id) return null;
  if (mode !== 'inside' && targetId === root.id) mode = 'inside';

  const cloned = cloneNode(root);
  const dragNode = findNodeById(cloned, dragId);
  const targetNode = findNodeById(cloned, targetId);
  if (!dragNode || !targetNode) return null;
  if (isDescendant(dragNode, targetId)) return null;

  const dragPath = findNodePath(cloned, dragId);
  if (!dragPath || dragPath.length < 2) return null;
  const dragParent = dragPath[dragPath.length - 2];
  const dragIdx = dragParent.children.findIndex((c) => c.id === dragId);
  if (dragIdx === -1) return null;

  // Remove dragged node cleanly first
  const [detached] = dragParent.children.splice(dragIdx, 1);

  if (mode === 'inside') {
    const newTarget = findNodeById(cloned, targetId);
    if (!newTarget) return null;
    newTarget.collapsed = false;
    if (newTarget.id !== cloned.id) delete detached.side;
    newTarget.children.push(detached);
    return cloned;
  }

  const targetPath = findNodePath(cloned, targetId);
  if (!targetPath || targetPath.length < 2) return null;
  const targetParent = targetPath[targetPath.length - 2];
  const tIdx = targetParent.children.findIndex((c) => c.id === targetId);
  if (tIdx === -1) return null;

  if (targetParent.id === cloned.id && targetNode.side) {
    detached.side = targetNode.side;
  } else if (targetParent.id !== cloned.id) {
    delete detached.side;
  }

  const insertAt = mode === 'before' ? tIdx : tIdx + 1;
  targetParent.children.splice(insertAt, 0, detached);
  return cloned;
}

export function setAllCollapsed(root: MindMapNode, collapsed: boolean): MindMapNode {
  const cloned = cloneNode(root);
  function walk(node: MindMapNode, depth: number) {
    if (depth >= 1) {
      if (collapsed && node.children.length > 0) node.collapsed = true;
      else delete node.collapsed;
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(cloned, 0);
  return cloned;
}

// ---------- Markdown <-> Tree Bidirectional Sync ----------

/**
 * 将思维导图树序列化为整洁可读的 Markdown 大纲。
 * 根节点 -> `# 标题`；一级分支 -> `## 分支`；二级及以下 -> 缩进 `- 列表`。
 */
export function mindmapToMarkdown(root: MindMapNode, includeNotes = false): string {
  const lines: string[] = [`# ${root.text}`];
  if (includeNotes && root.note) {
    for (const nLine of root.note.split('\n')) lines.push(`> ${nLine}`);
  }

  for (const branch of root.children || []) {
    lines.push('');
    lines.push(`## ${branch.text}`);
    if (includeNotes && branch.note) {
      for (const nLine of branch.note.split('\n')) lines.push(`> ${nLine}`);
    }
    const writeItems = (children: MindMapNode[], indentLevel: number) => {
      const pad = '  '.repeat(indentLevel);
      for (const child of children) {
        lines.push(`${pad}- ${child.text}`);
        if (includeNotes && child.note) {
          for (const nLine of child.note.split('\n')) lines.push(`${pad}  > ${nLine}`);
        }
        if (child.children?.length) writeItems(child.children, indentLevel + 1);
      }
    };
    if (branch.children?.length) writeItems(branch.children, 0);
  }

  return lines.join('\n').trim();
}

export function exportMindMapMarkdown(record: MindMapRecord): string {
  const metaHeader = [
    `<!-- mindmap: ${record.title} | category: ${record.category}${record.postSlug ? ` | post: /posts/${record.postSlug}/` : ''} -->`,
    '',
  ].join('\n');
  return `${metaHeader}${mindmapToMarkdown(record.root, true)}\n`;
}

function reconcileMetadata(nextRoot: MindMapNode, prevRoot?: MindMapNode): MindMapNode {
  if (!prevRoot) return nextRoot;

  // Build unique-text lookup fallback from previous tree
  const textBuckets = new Map<string, MindMapNode[]>();
  const collect = (node: MindMapNode) => {
    const key = node.text.trim();
    const list = textBuckets.get(key) || [];
    list.push(node);
    textBuckets.set(key, list);
    for (const c of node.children) collect(c);
  };
  collect(prevRoot);

  const usedIds = new Set<string>();
  const claim = (candidate: MindMapNode | undefined, target: MindMapNode): boolean => {
    if (!candidate || usedIds.has(candidate.id)) return false;
    usedIds.add(candidate.id);
    target.id = candidate.id;
    if (candidate.color) target.color = candidate.color;
    if (!target.note && candidate.note) target.note = candidate.note;
    if (candidate.collapsed && target.children.length > 0) target.collapsed = true;
    if (candidate.side) target.side = candidate.side;
    return true;
  };

  const matchChildren = (nextNode: MindMapNode, prevSiblingPool: MindMapNode[]) => {
    const kids = nextNode.children || [];
    const matchedPrevList: Array<MindMapNode | undefined> = new Array(kids.length);

    // Pass 1: Claim all exact text matches within the same parent BEFORE positional fallback
    // so inserting/deleting a sibling at any index never steals neighboring node IDs.
    for (let i = 0; i < kids.length; i += 1) {
      const nc = kids[i];
      const exact = prevSiblingPool.find((p) => p.text === nc.text && !usedIds.has(p.id));
      if (exact && claim(exact, nc)) {
        matchedPrevList[i] = exact;
      }
    }

    // Pass 2: Remaining unmatched nodes (renamed in-place or moved across parents in Markdown)
    for (let i = 0; i < kids.length; i += 1) {
      if (matchedPrevList[i]) continue;
      const nc = kids[i];
      let matchedPrev: MindMapNode | undefined;
      if (i < prevSiblingPool.length && !usedIds.has(prevSiblingPool[i].id)) {
        matchedPrev = prevSiblingPool[i];
      }
      if (!matchedPrev) {
        const candidates = textBuckets.get(nc.text.trim()) || [];
        matchedPrev = candidates.find((c) => !usedIds.has(c.id));
      }
      if (matchedPrev && claim(matchedPrev, nc)) {
        matchedPrevList[i] = matchedPrev;
      }
    }

    // Recurse down each matched subtree
    for (let i = 0; i < kids.length; i += 1) {
      matchChildren(kids[i], matchedPrevList[i]?.children || []);
    }
  };

  claim(prevRoot, nextRoot);
  matchChildren(nextRoot, prevRoot.children || []);
  return nextRoot;
}

/**
 * 将 Markdown 文本反向解析为思维导图节点树，支持 `# ~ ######` 标题与缩进列表 `- / * / 1.`，
 * 若传入先前的 `prevRoot`，会自动尽量保留原节点 ID、颜色、备注与折叠状态。
 */
export function markdownToMindmap(md: string, prevRoot?: MindMapNode): MindMapNode {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  let root: MindMapNode | null = null;
  let headingStack: Array<{ depth: number; node: MindMapNode }> = [];
  let listStack: Array<{ indent: number; node: MindMapNode }> = [];
  let lastCreatedNode: MindMapNode | null = null;

  const ensureRoot = (text = prevRoot?.text || '核心主题'): MindMapNode => {
    if (!root) {
      root = { id: prevRoot?.id || createNodeId(), text, children: [] };
      headingStack = [{ depth: 1, node: root }];
      lastCreatedNode = root;
    }
    return root;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) continue;

    // Note blockquote line attached to last node (`> note` or `  > note`)
    const quoteMatch = /^\s*>\s?(.*)$/.exec(rawLine);
    if (quoteMatch && lastCreatedNode) {
      const piece = quoteMatch[1].trim();
      if (piece) {
        lastCreatedNode.note = lastCreatedNode.note
          ? `${lastCreatedNode.note}\n${piece}`
          : piece;
      }
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim().slice(0, MINDMAP_LIMITS.maxNodeText);
      if (level === 1 && !root) {
        ensureRoot(text || '核心主题');
        continue;
      }
      const r = ensureRoot();
      const effectiveDepth = level === 1 ? 2 : level;
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].depth >= effectiveDepth) {
        headingStack.pop();
      }
      const parent = headingStack.length > 0 ? headingStack[headingStack.length - 1].node : r;
      const node: MindMapNode = { id: createNodeId(), text: text || '分支', children: [] };
      parent.children.push(node);
      headingStack.push({ depth: effectiveDepth, node });
      listStack = [];
      lastCreatedNode = node;
      continue;
    }

    const listMatch = /^(\s*)(?:[-*+]|\d+\.)\s+(.+)$/.exec(rawLine);
    if (listMatch) {
      const indent = listMatch[1].replace(/\t/g, '  ').length;
      const text = listMatch[2].trim().slice(0, MINDMAP_LIMITS.maxNodeText);
      const r = ensureRoot();
      while (listStack.length > 0 && listStack[listStack.length - 1].indent >= indent) {
        listStack.pop();
      }
      const baseParent = headingStack.length > 0 ? headingStack[headingStack.length - 1].node : r;
      const parent = listStack.length > 0 ? listStack[listStack.length - 1].node : baseParent;
      const node: MindMapNode = { id: createNodeId(), text: text || '要点', children: [] };
      parent.children.push(node);
      listStack.push({ indent, node });
      lastCreatedNode = node;
      continue;
    }

    // Fallback plain text line when user types lines without markers: attach as level-1 child
    if (!root) {
      ensureRoot(trimmed.slice(0, MINDMAP_LIMITS.maxNodeText));
    } else {
      const parent = headingStack.length > 0 ? headingStack[headingStack.length - 1].node : root;
      const node: MindMapNode = {
        id: createNodeId(),
        text: trimmed.slice(0, MINDMAP_LIMITS.maxNodeText),
        children: [],
      };
      parent.children.push(node);
      lastCreatedNode = node;
    }
  }

  const built = ensureRoot();
  const normalized = normalizeNode(built, 0, { count: 0 }) || built;
  return reconcileMetadata(normalized, prevRoot);
}

// ---------- Article Skeleton & Existing Notes Integration ----------

function shortenSnippet(raw: string, maxLen = 46): string {
  const clean = String(raw || '')
    .replace(/```[\s\S]*?```/g, '[代码片段]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '摘录';
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

/**
 * 根据博客文章的标题大纲（H2/H3/H4）以及已有划线批注/墨问问答笔记，自动生成结构化思维导图骨架。
 */
export function buildMindMapFromArticle(
  input: ArticleSourceInput,
  options: { category?: string; includeNotes?: boolean } = {}
): MindMapRecord {
  const palette: MindMapColor[] = ['blue', 'green', 'yellow', 'gold', 'red'];
  const cleanSlug = normalizePostSlug(input.slug);
  const root: MindMapNode = {
    id: createNodeId(),
    text: input.title.trim().slice(0, MINDMAP_LIMITS.maxNodeText) || '文章脉络',
    children: [],
  };

  const stack: Array<{ depth: number; node: MindMapNode }> = [{ depth: 1, node: root }];
  const headingNodesByText = new Map<string, MindMapNode>();
  let branchColorIdx = 0;

  for (const h of input.headings || []) {
    const cleanText = String(h.text || '').replace(/^§\s*/, '').trim();
    if (!cleanText) continue;
    const depth = Math.max(2, Math.min(4, Number(h.depth) || 2));
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    const parent = stack.length > 0 ? stack[stack.length - 1].node : root;
    const isTopBranch = parent.id === root.id;
    const node: MindMapNode = {
      id: createNodeId(),
      text: cleanText.slice(0, MINDMAP_LIMITS.maxNodeText),
      children: [],
      ...(isTopBranch ? { color: palette[branchColorIdx++ % palette.length] } : {}),
    };
    parent.children.push(node);
    stack.push({ depth, node });
    headingNodesByText.set(cleanText.toLowerCase(), node);
  }

  // Merge user highlights / InkAsk notes if enabled
  if (options.includeNotes !== false && Array.isArray(input.notes) && input.notes.length > 0) {
    let fallbackBranch: MindMapNode | null = null;
    for (const note of input.notes) {
      const headingKey = String(note.headingText || '')
        .replace(/^§\s*/, '')
        .replace(/^#+\s*/, '')
        .trim()
        .toLowerCase();
      const targetParent = headingKey ? headingNodesByText.get(headingKey) : undefined;

      const labelPrefix = note.kind === 'ai' ? 'AI 问：' : note.kind === 'highlight' ? '划线：' : '笔记：';
      const coreText = note.question?.trim() || note.text || note.comment || '';
      const nodeText = `${labelPrefix}${shortenSnippet(coreText, 40)}`;
      const fullNote = [
        note.question ? `**问题**：${note.question}` : '',
        note.text ? note.text : '',
        note.comment ? `**批注**：${note.comment}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, MINDMAP_LIMITS.maxNodeNote);

      const noteColor = NODE_COLORS.has(note.color as MindMapColor)
        ? (note.color as MindMapColor)
        : undefined;

      const noteNode: MindMapNode = {
        id: createNodeId(),
        text: nodeText,
        ...(noteColor && noteColor !== 'ink' ? { color: noteColor } : {}),
        ...(fullNote ? { note: fullNote } : {}),
        children: [],
      };

      if (targetParent) {
        targetParent.children.push(noteNode);
      } else {
        if (!fallbackBranch) {
          fallbackBranch = {
            id: createNodeId(),
            text: '阅读划线与墨问摘要',
            color: 'gold',
            children: [],
          };
          root.children.push(fallbackBranch);
        }
        fallbackBranch.children.push(noteNode);
      }
    }
  }

  // Ensure at least two branches even for minimalist posts
  if (root.children.length === 0) {
    root.children.push(
      { id: createNodeId(), text: '核心论点', color: 'blue', children: [] },
      { id: createNodeId(), text: '延伸思考', color: 'green', children: [] }
    );
  }

  const now = Date.now();
  return normalizeMindMapRecord({
    id: createMindMapId(),
    title: `${input.title.trim()} · 导图`,
    category: options.category || '源码研读',
    tags: cleanSlug ? ['文章精读'] : [],
    color: 'blue',
    layout: root.children.length >= 4 ? 'mindmap-both' : 'logic-right',
    postSlug: cleanSlug,
    postTitle: input.title.trim(),
    root,
    createdAt: now,
    updatedAt: now,
    dirty: true,
  })!;
}

// ---------- Inline Node Formatting & Card Topology Preview SVG ----------

function escapeXml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 将节点标题内的 `` `行内代码` `` 和 `**加粗**` 安全转为简洁 HTML，便于节点内直接显示代码标识 */
export function renderNodeInlineHtml(text: string): string {
  const escaped = escapeXml(text);
  return escaped
    .replace(/`([^`]+)`/g, '<code class="mm-inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export interface InkBranchBoxGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  side?: 'left' | 'right' | 'root' | 'down';
}

/**
 * 水墨枝蔓笔触粗细随树层级自然渐变（起笔主干浑厚 -> 分梢细枝挺拔 -> 末梢游丝劲健）。
 */
export function computeInkBranchStrokeWidth(depth: number): number {
  if (depth <= 1) return 2.75;
  if (depth === 2) return 2.05;
  if (depth === 3) return 1.58;
  return Math.max(1.15, Number((1.58 - (depth - 3) * 0.16).toFixed(2)));
}

/**
 * 水墨浓淡层次：近根浓墨，远梢清润。
 */
export function computeInkBranchOpacity(depth: number): number {
  if (depth <= 1) return 0.84;
  if (depth === 2) return 0.74;
  if (depth === 3) return 0.65;
  return 0.56;
}

/**
 * 生成带毛笔起收笔张力的非对称三次贝塞尔枝蔓路径。
 */
export function buildInkBranchPath(parent: InkBranchBoxGeom, child: InkBranchBoxGeom): string {
  if (child.side === 'down') {
    const x1 = parent.x + parent.w / 2;
    const y1 = parent.y + parent.h;
    const x2 = child.x + child.w / 2;
    const y2 = child.y;
    const dy = Math.max(16, y2 - y1);
    const c1y = y1 + dy * 0.44;
    const c2y = y2 - dy * 0.52;
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${c1y.toFixed(1)}, ${x2.toFixed(1)} ${c2y.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  const dir = child.side === 'left' ? -1 : 1;
  const x1 = dir === 1 ? parent.x + parent.w : parent.x;
  const y1 = parent.y + parent.h / 2;
  const x2 = dir === 1 ? child.x : child.x + child.w;
  const y2 = child.y + child.h / 2;
  const span = Math.max(20, Math.abs(x2 - x1));
  const c1 = span * 0.44;
  const c2 = span * 0.54;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dir * c1).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dir * c2).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/**
 * 为 Layer 1 导图卡片生成实时矢量拓扑缩略图 SVG，忠实反映分支数、层级与水墨枝蔓笔触渐变。
 */
export function buildTopologyPreviewSvg(
  root: MindMapNode,
  layout: MindMapLayout
): string {
  const W = 280;
  const H = 104;
  const branches = (root.children || []).slice(0, 6);
  const paths: string[] = [];
  const rects: string[] = [];

  if (layout === 'tree-down') {
    const rx = W / 2;
    const ry = 18;
    const n = Math.max(branches.length, 1);
    const span = Math.min(220, n * 44);
    const startX = rx - span / 2;
    branches.forEach((b, idx) => {
      const bx = n === 1 ? rx : startX + (idx * span) / (n - 1);
      const by = 54;
      const stroke = b.color && b.color !== 'ink' ? colorHex(b.color) : 'currentColor';
      paths.push(
        `<path d="M ${rx} ${ry + 7} C ${rx} 35, ${bx} 37, ${bx} ${by - 5}" fill="none" stroke="${stroke}" stroke-opacity="0.68" stroke-width="1.65" stroke-linecap="round"/>`
      );
      rects.push(
        `<rect x="${bx - 13}" y="${by - 5}" width="26" height="10" rx="4" fill="var(--bg-elev)" stroke="${stroke}" stroke-opacity="0.72" stroke-width="1.05"/>`
      );
      const kids = (b.children || []).slice(0, 2);
      kids.forEach((_k, kIdx) => {
        const kx = bx + (kids.length === 1 ? 0 : kIdx === 0 ? -9 : 9);
        const ky = 84;
        paths.push(
          `<path d="M ${bx} ${by + 5} C ${bx} ${by + 16}, ${kx} ${ky - 14}, ${kx} ${ky - 4}" fill="none" stroke="${stroke}" stroke-opacity="0.4" stroke-width="1.05" stroke-linecap="round"/>`
        );
        rects.push(`<circle cx="${kx}" cy="${ky}" r="2.5" fill="${stroke}" fill-opacity="0.64"/>`);
      });
    });
    rects.push(`<rect x="${rx - 22}" y="${ry - 7}" width="44" height="14" rx="5" fill="var(--ink-strong)"/>`);
  } else if (layout === 'mindmap-both') {
    const rx = W / 2;
    const ry = H / 2;
    const leftBranches: MindMapNode[] = [];
    const rightBranches: MindMapNode[] = [];
    branches.forEach((b, i) => {
      if (b.side === 'left' || (!b.side && i % 2 === 1)) leftBranches.push(b);
      else rightBranches.push(b);
    });
    const drawSide = (list: MindMapNode[], dir: -1 | 1) => {
      const step = H / (list.length + 1);
      list.forEach((b, idx) => {
        const by = step * (idx + 1);
        const bx = rx + dir * 74;
        const c1x = rx + dir * 34;
        const c2x = bx - dir * 32;
        const stroke = b.color && b.color !== 'ink' ? colorHex(b.color) : 'currentColor';
        paths.push(
          `<path d="M ${rx + dir * 20} ${ry} C ${c1x} ${ry}, ${c2x} ${by}, ${bx - dir * 14} ${by}" fill="none" stroke="${stroke}" stroke-opacity="0.68" stroke-width="1.65" stroke-linecap="round"/>`
        );
        rects.push(
          `<rect x="${bx - 14}" y="${by - 5}" width="28" height="10" rx="4" fill="var(--bg-elev)" stroke="${stroke}" stroke-opacity="0.72" stroke-width="1.05"/>`
        );
        (b.children || []).slice(0, 2).forEach((_k, kIdx) => {
          const ky = by + (kIdx === 0 ? -5 : 5);
          const kx = bx + dir * 32;
          paths.push(
            `<path d="M ${bx + dir * 14} ${by} Q ${bx + dir * 22} ${ky}, ${kx - dir * 4} ${ky}" fill="none" stroke="${stroke}" stroke-opacity="0.4" stroke-width="1.05" stroke-linecap="round"/>`
          );
          rects.push(`<circle cx="${kx}" cy="${ky}" r="2.2" fill="${stroke}" fill-opacity="0.62"/>`);
        });
      });
    };
    drawSide(leftBranches, -1);
    drawSide(rightBranches, 1);
    rects.push(`<rect x="${rx - 22}" y="${ry - 8}" width="44" height="16" rx="5" fill="var(--ink-strong)"/>`);
  } else {
    const rx = 44;
    const ry = H / 2;
    const step = H / (Math.max(branches.length, 1) + 1);
    branches.forEach((b, idx) => {
      const by = step * (idx + 1);
      const bx = 138;
      const stroke = b.color && b.color !== 'ink' ? colorHex(b.color) : 'currentColor';
      paths.push(
        `<path d="M ${rx + 22} ${ry} C 82 ${ry}, 94 ${by}, ${bx - 16} ${by}" fill="none" stroke="${stroke}" stroke-opacity="0.68" stroke-width="1.7" stroke-linecap="round"/>`
      );
      rects.push(
        `<rect x="${bx - 16}" y="${by - 5.5}" width="34" height="11" rx="4.5" fill="var(--bg-elev)" stroke="${stroke}" stroke-opacity="0.72" stroke-width="1.05"/>`
      );
      const kids = (b.children || []).slice(0, 2);
      kids.forEach((_k, kIdx) => {
        const ky = by + (kids.length === 1 ? 0 : kIdx === 0 ? -5 : 5);
        const kx = 224;
        paths.push(
          `<path d="M ${bx + 18} ${by} C 180 ${by}, 192 ${ky}, ${kx - 14} ${ky}" fill="none" stroke="${stroke}" stroke-opacity="0.42" stroke-width="1.05" stroke-linecap="round"/>`
        );
        rects.push(`<rect x="${kx - 14}" y="${ky - 3.5}" width="26" height="7" rx="3" fill="var(--ink)" fill-opacity="0.18"/>`);
      });
    });
    rects.push(`<rect x="${rx - 22}" y="${ry - 8}" width="44" height="16" rx="5" fill="var(--ink-strong)"/>`);
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" class="mm-card-topo-svg">${paths.join('')}${rects.join('')}</svg>`;
}
