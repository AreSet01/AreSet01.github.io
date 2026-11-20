/**
 * localReaderStorage.ts — 本地 Markdown 阅读器 IndexedDB 书架与资源存储引擎
 *
 * 设计原则：
 * 1. 纯本地持久化：文档正文与关联图片 Blob 存入浏览器 IndexedDB，原文永不上传服务器。
 * 2. 轻量元数据镜像：同步维护 localStorage 轻量索引，供 ⌘K 全局搜索、/notes 与书架首屏零延迟读取。
 * 3. 无 DOM 硬依赖：无 IndexedDB 环境（如 Node 测试）自动降级为内存存储，便于全链路单测。
 */

export interface LocalReaderHeading {
  depth: number;
  slug: string;
  text: string;
}

export interface LocalReaderDocument {
  id: string;
  title: string;
  fileName: string;
  /** 若来自文件夹导入，记录该 .md 文件所在相对目录（例如 "notes/ue5"），用于解析相对路径图片 */
  docDir: string;
  folderName: string;
  category: string;
  tags: string[];
  description: string;
  pubDate: string;
  markdown: string;
  wordCount: number;
  readingMinutes: number;
  headings: LocalReaderHeading[];
  /** 已随本文档一并导入的图片相对路径列表（规范化小写/原路径） */
  assetPaths: string[];
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

export interface LocalReaderIndexEntry {
  id: string;
  title: string;
  fileName: string;
  folderName: string;
  category: string;
  tags: string[];
  description: string;
  pubDate: string;
  wordCount: number;
  readingMinutes: number;
  assetCount: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

export interface LocalReaderAssetInput {
  /** 相对于导入根目录或文档目录的路径（如 "images/arch.png"） */
  path: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
  size: number;
}

export interface LocalReaderAssetRecord extends LocalReaderAssetInput {
  key: string;
  docId: string;
  normalizedPath: string;
}

export const LOCAL_READER_DB_NAME = 'areSet_local_reader_db_v1';
export const LOCAL_READER_DB_VERSION = 1;
export const LOCAL_READER_INDEX_KEY = 'areSet_local_reader_index_v1';
export const LOCAL_READER_CATEGORIES_KEY = 'areSet_local_reader_categories_v1';
export const LOCAL_READER_SLUG_PREFIX = 'reader/';

export const DEFAULT_READER_CATEGORIES = [
  '技术文档',
  '学习笔记',
  '项目资料',
  '随笔杂记',
  '其他',
] as const;

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
const MARKDOWN_EXT_RE = /\.(md|markdown|mdown|mkd|txt)$/i;

// ---------- Slug 与 URL 协议 ----------

export function createLocalDocId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `doc_${ts}_${rand}`;
}

export function buildLocalReaderSlug(docId: string): string {
  const clean = String(docId || '').trim().replace(/[^A-Za-z0-9._-]/g, '');
  return clean ? `${LOCAL_READER_SLUG_PREFIX}${clean}` : '';
}

export function parseLocalReaderSlug(rawSlug?: string | null): string | null {
  if (!rawSlug) return null;
  let clean = String(rawSlug).trim().replace(/[?#].*$/, '');
  clean = clean.replace(/^\/+/, '').replace(/\/+$/, '');
  if (clean.startsWith('posts/')) clean = clean.slice(6);
  if (!clean.startsWith(LOCAL_READER_SLUG_PREFIX)) return null;
  const id = clean.slice(LOCAL_READER_SLUG_PREFIX.length).replace(/\/+$/, '');
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) return null;
  return id;
}

export function isLocalReaderSlug(rawSlug?: string | null): boolean {
  return parseLocalReaderSlug(rawSlug) !== null;
}

export interface ReaderUrlOptions {
  highlightId?: string;
  bookmarkId?: string;
  resume?: boolean;
  basePath?: string;
}

export function buildReaderDocUrl(docId: string, options: ReaderUrlOptions = {}): string {
  const base = (options.basePath || '/').replace(/\/?$/, '/');
  const params = new URLSearchParams();
  params.set('doc', docId);
  if (options.resume) params.set('resume', '1');
  if (options.bookmarkId) params.set('bm', options.bookmarkId);
  const hash = options.highlightId ? `#highlight-${encodeURIComponent(options.highlightId)}` : '';
  return `${base}reader/?${params.toString()}${hash}`;
}

export function isSupportedMarkdownFileName(name: string): boolean {
  return MARKDOWN_EXT_RE.test(String(name || '').trim());
}

export function isSupportedImageFileName(name: string): boolean {
  return IMAGE_EXT_RE.test(String(name || '').trim());
}

// ---------- 相对路径规范化与图片解析 ----------

export function safeDecodeUriComponent(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function normalizeAssetPath(rawPath: string): string {
  const cleaned = safeDecodeUriComponent(String(rawPath || ''))
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\\/g, '/');
  const segments = cleaned.split('/');
  const resolved: string[] = [];
  for (const seg of segments) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (resolved.length > 0) resolved.pop();
      continue;
    }
    resolved.push(seg);
  }
  return resolved.join('/');
}

export function dirnameOfPath(rawPath: string): string {
  const norm = normalizeAssetPath(rawPath);
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? '' : norm.slice(0, idx);
}

export function basenameOfPath(rawPath: string): string {
  const norm = normalizeAssetPath(rawPath);
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? norm : norm.slice(idx + 1);
}

/**
 * 为文档内的相对图片引用匹配已存储的本地资源路径。
 * 优先级：
 * 1. 基于文档所在目录 docDir 拼接后的精确路径匹配（忽略大小写兜底）
 * 2. 以导入根目录为基准的精确路径匹配
 * 3. 后缀路径匹配（适配部分 Markdown 省略外层目录名）
 * 4. 仅按文件名匹配（适配 Obsidian ![[image.png]] 或多选平铺上传）
 */
export function resolveAssetPathForDoc(
  docDir: string,
  rawImgSrc: string,
  availableAssetPaths: string[],
): string | null {
  if (!rawImgSrc || !availableAssetPaths.length) return null;
  const trimmed = String(rawImgSrc).trim();
  if (/^(?:https?:|data:|blob:|mailto:|#)/i.test(trimmed)) return null;

  const cleanSrc = safeDecodeUriComponent(trimmed).replace(/[?#].*$/, '').replace(/\\/g, '/');
  const joinedCandidate = normalizeAssetPath(docDir ? `${docDir}/${cleanSrc}` : cleanSrc);
  const directCandidate = normalizeAssetPath(cleanSrc);
  const srcBase = basenameOfPath(directCandidate).toLowerCase();

  const byExact = new Map<string, string>();
  const byLower = new Map<string, string>();
  for (const p of availableAssetPaths) {
    const norm = normalizeAssetPath(p);
    if (!norm) continue;
    byExact.set(norm, norm);
    byLower.set(norm.toLowerCase(), norm);
  }

  if (joinedCandidate) {
    if (byExact.has(joinedCandidate)) return byExact.get(joinedCandidate)!;
    if (byLower.has(joinedCandidate.toLowerCase())) return byLower.get(joinedCandidate.toLowerCase())!;
  }

  if (directCandidate) {
    if (byExact.has(directCandidate)) return byExact.get(directCandidate)!;
    if (byLower.has(directCandidate.toLowerCase())) return byLower.get(directCandidate.toLowerCase())!;
  }

  // 后缀路径匹配（例如文档里写 images/a.png，而文件夹导入后为 my-folder/images/a.png）
  if (directCandidate) {
    const suffixNeedle = `/${directCandidate.toLowerCase()}`;
    for (const [lower, original] of byLower.entries()) {
      if (lower.endsWith(suffixNeedle)) return original;
    }
  }

  // 文件名兜底（Obsidian ![[foo.png]] 或平铺多文件上传）
  if (srcBase) {
    for (const [lower, original] of byLower.entries()) {
      if (basenameOfPath(lower) === srcBase) return original;
    }
  }

  return null;
}

// ---------- 同步索引（localStorage 镜像） ----------

export function toIndexEntry(doc: LocalReaderDocument): LocalReaderIndexEntry {
  return {
    id: doc.id,
    title: doc.title,
    fileName: doc.fileName,
    folderName: doc.folderName || '',
    category: doc.category || '技术文档',
    tags: Array.isArray(doc.tags) ? [...doc.tags] : [],
    description: doc.description || '',
    pubDate: doc.pubDate || '',
    wordCount: Number(doc.wordCount) || 0,
    readingMinutes: Number(doc.readingMinutes) || 1,
    assetCount: Array.isArray(doc.assetPaths) ? doc.assetPaths.length : 0,
    createdAt: Number(doc.createdAt) || Date.now(),
    updatedAt: Number(doc.updatedAt) || Date.now(),
    lastOpenedAt: Number(doc.lastOpenedAt) || 0,
  };
}

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage as Storage;
    }
  } catch {}
  return null;
}

function dispatchLocalReaderChanged() {
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('local-reader:changed'));
      document?.dispatchEvent?.(new CustomEvent('local-reader:changed'));
    }
  } catch {}
}

export function listLocalReaderIndex(): LocalReaderIndexEntry[] {
  const storage = getSafeLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOCAL_READER_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string');
  } catch {
    return [];
  }
}

export function writeLocalReaderIndex(entries: LocalReaderIndexEntry[]) {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(LOCAL_READER_INDEX_KEY, JSON.stringify(entries));
  } catch {}
  dispatchLocalReaderChanged();
}

export function loadReaderCategories(): string[] {
  const storage = getSafeLocalStorage();
  const base = [...DEFAULT_READER_CATEGORIES];
  if (!storage) return base;
  try {
    const raw = storage.getItem(LOCAL_READER_CATEGORIES_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return base;
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of [...parsed, ...base]) {
      const clean = String(item || '').trim().slice(0, 24);
      if (!clean || clean === 'all' || seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
    }
    return out.length > 0 ? out : base;
  } catch {
    return base;
  }
}

export function saveReaderCategories(categories: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of categories) {
    const clean = String(item || '').trim().slice(0, 24);
    if (!clean || clean === 'all' || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  const finalList = out.length > 0 ? out : [...DEFAULT_READER_CATEGORIES];
  const storage = getSafeLocalStorage();
  if (storage) {
    try {
      storage.setItem(LOCAL_READER_CATEGORIES_KEY, JSON.stringify(finalList));
    } catch {}
  }
  return finalList;
}

export function findDuplicateDocByFileName(
  docs: Array<Pick<LocalReaderDocument, 'id' | 'fileName' | 'title'>>,
  fileName: string,
): Pick<LocalReaderDocument, 'id' | 'fileName' | 'title'> | null {
  const needle = String(fileName || '').trim().toLowerCase();
  if (!needle) return null;
  return docs.find((d) => String(d.fileName || '').trim().toLowerCase() === needle) || null;
}

// ---------- IndexedDB + 内存降级存储 ----------

const memDocs = new Map<string, LocalReaderDocument>();
const memAssets = new Map<string, LocalReaderAssetRecord>();

export function resetLocalReaderMemoryStoreForTest() {
  memDocs.clear();
  memAssets.clear();
}

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && Boolean(indexedDB?.open);
  } catch {
    return false;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openReaderDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(LOCAL_READER_DB_NAME, LOCAL_READER_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('assets')) {
        const assetStore = db.createObjectStore('assets', { keyPath: 'key' });
        assetStore.createIndex('byDocId', 'docId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('Failed to open local reader IndexedDB'));
    };
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

function reqDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}

async function syncIndexFromStore(): Promise<LocalReaderDocument[]> {
  const docs = await listLocalDocsInternal();
  const sorted = docs.sort((a, b) => (b.lastOpenedAt || b.updatedAt) - (a.lastOpenedAt || a.updatedAt));
  writeLocalReaderIndex(sorted.map(toIndexEntry));
  return sorted;
}

async function listLocalDocsInternal(): Promise<LocalReaderDocument[]> {
  if (!hasIndexedDb()) {
    return Array.from(memDocs.values()).map((d) => ({ ...d, tags: [...d.tags], headings: [...d.headings], assetPaths: [...d.assetPaths] }));
  }
  const db = await openReaderDb();
  const tx = db.transaction('documents', 'readonly');
  const all = await reqDone(tx.objectStore('documents').getAll());
  return Array.isArray(all) ? (all as LocalReaderDocument[]) : [];
}

export async function listLocalDocs(): Promise<LocalReaderDocument[]> {
  return syncIndexFromStore();
}

export async function getLocalDoc(id: string): Promise<LocalReaderDocument | null> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;
  if (!hasIndexedDb()) {
    const doc = memDocs.get(cleanId);
    return doc ? { ...doc, tags: [...doc.tags], headings: [...doc.headings], assetPaths: [...doc.assetPaths] } : null;
  }
  const db = await openReaderDb();
  const tx = db.transaction('documents', 'readonly');
  const doc = await reqDone(tx.objectStore('documents').get(cleanId));
  return (doc as LocalReaderDocument | undefined) || null;
}

export async function getDocAssets(docId: string): Promise<LocalReaderAssetRecord[]> {
  const cleanId = String(docId || '').trim();
  if (!cleanId) return [];
  if (!hasIndexedDb()) {
    return Array.from(memAssets.values()).filter((a) => a.docId === cleanId);
  }
  const db = await openReaderDb();
  const tx = db.transaction('assets', 'readonly');
  const index = tx.objectStore('assets').index('byDocId');
  const all = await reqDone(index.getAll(cleanId));
  return Array.isArray(all) ? (all as LocalReaderAssetRecord[]) : [];
}

async function deleteDocAssetsInTx(assetStore: IDBObjectStore, docId: string): Promise<void> {
  const index = assetStore.index('byDocId');
  const keys = await reqDone(index.getAllKeys(docId));
  for (const key of keys) {
    assetStore.delete(key);
  }
}

export async function saveLocalDoc(
  doc: LocalReaderDocument,
  assets?: LocalReaderAssetInput[],
  options: { replaceAssets?: boolean } = {},
): Promise<LocalReaderDocument> {
  const existingAssets = options.replaceAssets ? [] : await getDocAssets(doc.id);
  const incomingAssets: LocalReaderAssetRecord[] = (assets || []).map((a) => {
    const normalizedPath = normalizeAssetPath(a.path || a.fileName);
    return {
      ...a,
      path: normalizedPath,
      normalizedPath,
      docId: doc.id,
      key: `${doc.id}::${normalizedPath}`,
    };
  });

  const mergedAssetPathSet = new Set<string>(
    options.replaceAssets ? [] : existingAssets.map((a) => a.normalizedPath),
  );
  for (const a of incomingAssets) {
    if (a.normalizedPath) mergedAssetPathSet.add(a.normalizedPath);
  }

  const finalDoc: LocalReaderDocument = {
    ...doc,
    tags: Array.isArray(doc.tags) ? [...doc.tags] : [],
    headings: Array.isArray(doc.headings) ? [...doc.headings] : [],
    assetPaths: Array.from(mergedAssetPathSet),
    updatedAt: doc.updatedAt || Date.now(),
    createdAt: doc.createdAt || Date.now(),
  };

  if (!hasIndexedDb()) {
    memDocs.set(finalDoc.id, finalDoc);
    if (options.replaceAssets) {
      for (const [k, v] of memAssets.entries()) {
        if (v.docId === finalDoc.id) memAssets.delete(k);
      }
    }
    for (const a of incomingAssets) {
      memAssets.set(a.key, a);
    }
    await syncIndexFromStore();
    return finalDoc;
  }

  const db = await openReaderDb();
  const tx = db.transaction(['documents', 'assets'], 'readwrite');
  const docStore = tx.objectStore('documents');
  const assetStore = tx.objectStore('assets');

  if (options.replaceAssets) {
    await deleteDocAssetsInTx(assetStore, finalDoc.id);
  }
  docStore.put(finalDoc);
  for (const a of incomingAssets) {
    assetStore.put(a);
  }
  await txDone(tx);
  await syncIndexFromStore();
  return finalDoc;
}

export async function updateLocalDocMeta(
  docId: string,
  patch: Partial<Pick<LocalReaderDocument, 'title' | 'category' | 'tags' | 'description' | 'lastOpenedAt'>>,
): Promise<LocalReaderDocument | null> {
  const existing = await getLocalDoc(docId);
  if (!existing) return null;
  const next: LocalReaderDocument = {
    ...existing,
    ...patch,
    updatedAt: patch.lastOpenedAt && Object.keys(patch).length === 1 ? existing.updatedAt : Date.now(),
  };
  return saveLocalDoc(next, undefined, { replaceAssets: false });
}

export async function deleteLocalDoc(docId: string): Promise<boolean> {
  const cleanId = String(docId || '').trim();
  if (!cleanId) return false;

  if (!hasIndexedDb()) {
    const existed = memDocs.delete(cleanId);
    for (const [k, v] of memAssets.entries()) {
      if (v.docId === cleanId) memAssets.delete(k);
    }
    await syncIndexFromStore();
    return existed;
  }

  const db = await openReaderDb();
  const tx = db.transaction(['documents', 'assets'], 'readwrite');
  tx.objectStore('documents').delete(cleanId);
  await deleteDocAssetsInTx(tx.objectStore('assets'), cleanId);
  await txDone(tx);
  await syncIndexFromStore();
  return true;
}
