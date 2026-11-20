/**
 * commandPaletteEngine.ts — 全局 ⌘K 命令面板跨库混合检索引擎与指令路由
 *
 * 覆盖五大维度：
 * 1. 最近在读（夹签续读 ReadingProgressRecord）—— 空态置顶 & 检索直达
 * 2. 博客文章（静态索引，支持加密文章正文脱敏标识）
 * 3. 笔记与夹签（文章湿墨划线、Markdown 随记、墨问 AI 摘录、手动段落夹签）
 * 4. 思维导图（导图标题/分类/标签 + 深度遍历节点文本与节点备注，直达具体节点）
 * 5. 快捷指令（支持分类胶囊切换或 `>` / `＞` 前缀直达）
 */

import type { ArticleHighlightRecord } from './articleHighlightEngine.ts';
import type { MindMapNode, MindMapRecord } from './mindmapEngine.ts';
import {
  formatProgressPercent,
  normalizeReadingSlug,
  type ManualBookmarkRecord,
  type ReadingProgressRecord,
} from './readingBookmarkEngine.ts';
import {
  buildLocalReaderSlug,
  buildReaderDocUrl,
  parseLocalReaderSlug,
  type LocalReaderIndexEntry,
} from './localReaderStorage.ts';
import { formatDate } from './date.ts';

export const stripMarkdownForSearch = (source: string = '') =>
  source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, ' ')
    .replace(/[*_~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const createSearchExcerpt = (body: string = '', fallback: string = '') => {
  const plain = stripMarkdownForSearch(body || fallback);
  if (plain.length <= 140) return plain;
  return `${plain.slice(0, 137).trim()}...`;
};

export interface PostSearchIndexItem {
  title: string;
  description: string;
  excerpt: string;
  content: string;
  tags: string[];
  category: string;
  locked: boolean;
  slug: string;
  href: string;
  dateLabel: string;
  publishedAt: number;
}

/**
 * 构建单篇文章的静态搜索索引项：
 * 对 locked 加密文章严格脱敏，绝不将正文写入公开静态 JSON。
 */
export function buildPostSearchIndexEntry(
  entry: {
    id: string;
    body?: string;
    data: {
      title: string;
      description?: string;
      pubDate: Date | string;
      tags?: string[];
      category?: string;
      locked?: boolean;
      passwordHint?: string;
    };
  },
  basePath = '/'
): PostSearchIndexItem {
  const isLocked = Boolean(entry.data.locked);
  const cleanBody = isLocked ? '' : stripMarkdownForSearch(entry.body || '');
  const safeDescription = isLocked
    ? (entry.data.description?.trim() || '')
    : (entry.data.description ?? '');
  const safeExcerpt = isLocked
    ? (entry.data.passwordHint
        ? `加密卷轴 · 提示：${entry.data.passwordHint}`
        : (safeDescription || '加密卷轴，输入密码后可启封阅览。'))
    : (entry.data.description?.trim() || createSearchExcerpt(entry.body, '') || '打开这篇文章继续阅读。');

  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;

  return {
    title: entry.data.title,
    description: safeDescription,
    excerpt: safeExcerpt,
    content: isLocked ? '' : cleanBody.slice(0, 4000),
    tags: entry.data.tags ?? [],
    category: entry.data.category ?? '',
    locked: isLocked,
    slug: entry.id,
    href: `${normalizedBase}posts/${entry.id}/`,
    dateLabel: formatDate(new Date(entry.data.pubDate)),
    publishedAt: new Date(entry.data.pubDate).getTime(),
  };
}

export type PaletteCategory = 'all' | 'posts' | 'notes' | 'mindmaps' | 'commands';

export type PaletteItemKind =
  | 'resume'
  | 'post'
  | 'note'
  | 'bookmark'
  | 'mindmap'
  | 'command';

export const PALETTE_CATEGORIES: ReadonlyArray<{ id: PaletteCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'posts', label: '文章' },
  { id: 'notes', label: '笔记' },
  { id: 'mindmaps', label: '导图' },
  { id: 'commands', label: '指令' },
];

export interface RawPostSearchEntry {
  title: string;
  description?: string;
  excerpt?: string;
  content?: string;
  tags?: string[];
  category?: string;
  locked?: boolean;
  slug: string;
  href: string;
  dateLabel?: string;
  publishedAt?: number;
}

export interface PaletteCommandDef {
  id: string;
  title: string;
  summary: string;
  keywords: string;
  badge?: string;
  shortcut?: string;
  section?: string;
  href?: string;
  actionId?: string;
  priority?: number;
}

export interface PaletteResultItem {
  uid: string;
  kind: PaletteItemKind;
  category: Exclude<PaletteCategory, 'all'>;
  sectionLabel?: string;
  title: string;
  summary: string;
  badge: string;
  badgeTone: 'vermilion' | 'ink' | 'muted';
  metaRight: string;
  chips: string[];
  href?: string;
  actionId?: string;
  progressRatio?: number;
  locked?: boolean;
  score: number;
  timestamp: number;
}

export interface ParsedPaletteQuery {
  isCommandPrefix: boolean;
  effectiveCategory: PaletteCategory;
  cleanQuery: string;
  tokens: string[];
}

export function normalizePaletteText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePaletteQuery(
  rawInput: string,
  selectedCategory: PaletteCategory = 'all'
): ParsedPaletteQuery {
  const trimmedStart = String(rawInput ?? '').trimStart();
  const isCommandPrefix = trimmedStart.startsWith('>') || trimmedStart.startsWith('＞');
  const body = isCommandPrefix ? trimmedStart.slice(1) : trimmedStart;
  const cleanQuery = normalizePaletteText(body);
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  return {
    isCommandPrefix,
    effectiveCategory: isCommandPrefix ? 'commands' : selectedCategory,
    cleanQuery,
    tokens,
  };
}

export function stepPaletteCategory(
  current: PaletteCategory,
  delta: 1 | -1
): PaletteCategory {
  const idx = PALETTE_CATEGORIES.findIndex((c) => c.id === current);
  const base = idx >= 0 ? idx : 0;
  const next = (base + delta + PALETTE_CATEGORIES.length) % PALETTE_CATEGORIES.length;
  return PALETTE_CATEGORIES[next].id;
}

/**
 * 反向圆角几何补偿计算（对齐全站 60–120fps 水墨胶囊游标规范，避免非等比 scale 圆角畸变与 CSS 钳制）
 */
export function computePaletteGliderGeometry(
  left: number,
  width: number,
  height: number,
  baseWidth = 100,
  baseHeight = 30,
  top = 0
): { sx: number; sy: number; rx: number; ry: number; transform: string } {
  const w = Math.max(12, width);
  const h = Math.max(12, height);
  const sx = Math.max(0.05, w / baseWidth);
  const sy = Math.max(0.05, h / baseHeight);
  const halfR = Math.min(w, h) * 0.5;
  const rx = Number((halfR / sx).toFixed(2));
  const ry = Number((halfR / sy).toFixed(2));
  const x = Math.round(left * 100) / 100;
  const y = Math.round(top * 100) / 100;
  const transform = `translate3d(${x}px, ${y}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  return { sx, sy, rx, ry, transform };
}

function truncateText(text: string, maxLen = 110): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trim()}…`;
}

function formatShortDate(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  try {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

function scoreFields(
  fields: Array<{ text: string; exactBoost: number; tokenBoost: number }>,
  cleanQuery: string,
  tokens: string[]
): number {
  if (!cleanQuery) return 1;
  let score = 0;

  for (const field of fields) {
    if (!field.text) continue;
    const pos = field.text.indexOf(cleanQuery);
    if (pos !== -1) {
      score += field.exactBoost - Math.min(pos, Math.floor(field.exactBoost * 0.35));
    }
  }

  let matchedTokens = 0;
  for (const token of tokens) {
    if (!token) continue;
    let tokenHit = false;
    for (const field of fields) {
      if (field.text && field.text.includes(token)) {
        score += field.tokenBoost;
        tokenHit = true;
      }
    }
    if (tokenHit) matchedTokens += 1;
  }

  // 多词查询要求全部关键词至少在任一字段命中，大幅提升跨库精准度
  if (tokens.length > 1 && matchedTokens < tokens.length) {
    return 0;
  }

  return score;
}

export function buildDefaultCommands(ctx: {
  isArticlePage?: boolean;
  currentTheme?: string;
  currentFont?: string;
  hasRecentResume?: boolean;
  recentResumeTitle?: string;
  recentResumeHref?: string;
  basePath?: string;
} = {}): PaletteCommandDef[] {
  const base = (ctx.basePath || '/').replace(/\/?$/, '/');
  const cmds: PaletteCommandDef[] = [];

  if (ctx.isArticlePage) {
    cmds.push(
      {
        id: 'cmd:bookmark-here',
        title: '在此处夹入书签（竹签留痕）',
        summary: '记录当前视口段落与阅读百分比，支持一文多签与云同步',
        keywords: 'bookmark 书签 夹签 标记 续读 b',
        badge: '阅读',
        shortcut: 'B',
        section: '当前阅读操作',
        actionId: 'article:bookmark',
        priority: 98,
      },
      {
        id: 'cmd:open-bookmarks',
        title: '查看本文全部夹签列表',
        summary: '展开本文已保存的多处手动书签并快速跳转',
        keywords: 'bookmarks 夹签列表 书签管理 跳转',
        badge: '阅读',
        section: '当前阅读操作',
        actionId: 'article:open-bookmarks',
        priority: 94,
      },
      {
        id: 'cmd:article-search',
        title: '在当前文章内检索正文',
        summary: '唤起文内查找浮条并定位高亮匹配词',
        keywords: 'find search 搜本文 文内搜索 查找',
        badge: '阅读',
        shortcut: '⌘F',
        section: '当前阅读操作',
        actionId: 'article:search',
        priority: 92,
      },
      {
        id: 'cmd:article-notes',
        title: '开关本文高亮笔记抽屉',
        summary: '在右侧伴读区展开或收起划线与随笔面板',
        keywords: 'notes drawer 笔记抽屉 伴读 批注',
        badge: '伴读',
        section: '当前阅读操作',
        actionId: 'article:notes-drawer',
        priority: 90,
      }
    );
  }

  if (ctx.hasRecentResume && ctx.recentResumeHref) {
    cmds.push({
      id: 'cmd:resume-latest',
      title: `继续展卷：《${truncateText(ctx.recentResumeTitle || '最近在读文章', 28)}》`,
      summary: '直达上次停留章节并平滑续读',
      keywords: 'resume continue 续读 继续展卷 上次阅读 进度',
      badge: '续读',
      section: '书斋快捷操作',
      href: ctx.recentResumeHref,
      priority: 96,
    });
  }

  cmds.push(
    {
      id: 'cmd:new-note',
      title: '新建 Markdown 随记便签',
      summary: '打开案头便签中心并直接唤起 Markdown 编辑器',
      keywords: 'new note markdown 新建笔记 新建便签 随笔 写作',
      badge: '创作',
      section: '创作与音景',
      href: `${base}notes/?new=1`,
      priority: 88,
    },
    {
      id: 'cmd:new-mindmap',
      title: '新建水墨思维导图',
      summary: '前往思维导图工作台并立即创建一张新导图画布',
      keywords: 'new mindmap 新建导图 思维导图 脑图 大纲',
      badge: '创作',
      section: '创作与音景',
      href: `${base}mindmap/?new=1`,
      priority: 86,
    },
    {
      id: 'cmd:toggle-zen-sound',
      title: '墨池听雨 · 开关伴读白噪音面板',
      summary: '展开或收起烟雨白噪音音景控制器',
      keywords: 'rain sound audio zen 听雨 白噪音 音景 雨声 伴读',
      badge: '音景',
      section: '创作与音景',
      actionId: 'shell:toggle-sound',
      priority: 84,
    },
    {
      id: 'cmd:theme-light',
      title: '切换主题：浅色宣纸 (Light)',
      summary: '清浅素宣底色，纯粹浓淡水墨',
      keywords: 'theme light 主题 浅色 宣纸 日间 亮色',
      badge: ctx.currentTheme === 'light' ? '当前主题' : '主题',
      section: '外观与排印',
      actionId: 'theme:light',
      priority: 78,
    },
    {
      id: 'cmd:theme-dark',
      title: '切换主题：深色徽墨 (Dark)',
      summary: '沉静玄墨夜读模式，低眩光高对比',
      keywords: 'theme dark night 主题 深色 徽墨 夜间 暗色',
      badge: ctx.currentTheme === 'dark' ? '当前主题' : '主题',
      section: '外观与排印',
      actionId: 'theme:dark',
      priority: 77,
    },
    {
      id: 'cmd:theme-rice',
      title: '切换主题：古籍米笺 (Rice)',
      summary: '暖调护眼旧书笺纸，适合长篇源码研读',
      keywords: 'theme rice paper sepia 主题 米笺 古籍 护眼 暖色',
      badge: ctx.currentTheme === 'rice' ? '当前主题' : '主题',
      section: '外观与排印',
      actionId: 'theme:rice',
      priority: 76,
    },
    {
      id: 'cmd:theme-moss',
      title: '切换主题：绿粉青苔 (Moss)',
      summary: '幽林青苔底韵配樱粉微芒',
      keywords: 'theme moss green 主题 青苔 绿粉',
      badge: ctx.currentTheme === 'moss' ? '当前主题' : '主题',
      section: '外观与排印',
      actionId: 'theme:moss',
      priority: 75,
    },
    {
      id: 'cmd:toggle-font',
      title: `切换全站字形（当前：${ctx.currentFont === 'kai' ? '行云手楷' : '复古像素'}）`,
      summary: '在 Zpix 像素点阵体与霞鹜文楷手书体之间切换',
      keywords: 'font pixel kai 字体 像素 行楷 文楷 楷体',
      badge: '排印',
      section: '外观与排印',
      actionId: 'shell:toggle-font',
      priority: 74,
    },
    {
      id: 'cmd:toggle-trail',
      title: '开关水墨指针拖尾',
      summary: '开启或关闭鼠标移动时的毛笔中锋水墨轨迹',
      keywords: 'cursor trail 指针 鼠标 拖尾 水墨',
      badge: '动效',
      section: '外观与排印',
      actionId: 'shell:toggle-trail',
      priority: 70,
    },
    {
      id: 'cmd:replay-intro',
      title: '重播「墨化为像素」开屏卷',
      summary: '在当前页面重新演绎 10 秒水墨凝落化格开屏仪式',
      keywords: 'intro animation 开屏 动画 墨化为像素 重播',
      badge: '仪式',
      section: '外观与排印',
      actionId: 'shell:replay-intro',
      priority: 66,
    },
    {
      id: 'cmd:nav-archive',
      title: '前往：全部分类归档 (/archive)',
      summary: '按年份与技术专题浏览全部文章目录',
      keywords: 'archive posts 归档 目录 全部文章',
      badge: '导航',
      section: '页面直达',
      href: `${base}archive/`,
      priority: 60,
    },
    {
      id: 'cmd:nav-notes',
      title: '前往：案头便签中心 (/notes)',
      summary: '集中检索、筛选与导出全部划线批注、随记和墨问摘录',
      keywords: 'notes highlights 笔记 便签 批注 中心',
      badge: '导航',
      section: '页面直达',
      href: `${base}notes/`,
      priority: 59,
    },
    {
      id: 'cmd:nav-mindmap',
      title: '前往：思维导图工作台 (/mindmap)',
      summary: '可视化水墨枝蔓思维导图与 Markdown 双向大纲',
      keywords: 'mindmap 思维导图 工作台 知识脉络',
      badge: '导航',
      section: '页面直达',
      href: `${base}mindmap/`,
      priority: 58,
    },
    {
      id: 'cmd:nav-reader',
      title: '前往：本地 Markdown 阅读器 (/reader)',
      summary: '导入本地 .md 文稿与图片文件夹，享全套划线批注、夹签与墨问伴读',
      keywords: 'reader local markdown md 阅读器 本地 文档 书架 上传',
      badge: '导航',
      section: '页面直达',
      href: `${base}reader/`,
      priority: 57,
    },
    {
      id: 'cmd:nav-timeline',
      title: '前往：年轮横向手卷 (/timeline)',
      summary: '展开横向宣纸手卷按时间脉络漫游',
      keywords: 'timeline 时间轴 年轮 手卷',
      badge: '导航',
      section: '页面直达',
      href: `${base}timeline/`,
      priority: 56,
    },
    {
      id: 'cmd:nav-tags',
      title: '前往：标签共现星图 (/tags)',
      summary: '力导向星座可视化探索主题关联',
      keywords: 'tags graph 标签 星图 星座',
      badge: '导航',
      section: '页面直达',
      href: `${base}tags/`,
      priority: 55,
    },
    {
      id: 'cmd:nav-life',
      title: '前往：线装生活志 (/life)',
      summary: '翻阅日常手账与 3D 线装册页详笺',
      keywords: 'life 生活志 手账 册页',
      badge: '导航',
      section: '页面直达',
      href: `${base}life/`,
      priority: 54,
    },
    {
      id: 'cmd:nav-gallery',
      title: '前往：暗房画廊 (/gallery)',
      summary: '水墨底片显影与光影收藏',
      keywords: 'gallery photos 画廊 暗房 摄影 图片',
      badge: '导航',
      section: '页面直达',
      href: `${base}gallery/`,
      priority: 53,
    },
    {
      id: 'cmd:nav-stats',
      title: '前往：写作统计 (/stats)',
      summary: '全站字数、创作频率与分类分布图表',
      keywords: 'stats statistics 统计 字数 图表',
      badge: '导航',
      section: '页面直达',
      href: `${base}stats/`,
      priority: 52,
    },
    {
      id: 'cmd:nav-account',
      title: '前往：账号与云墨同步 (/account)',
      summary: '登录账号或执行多设备笔记、导图、夹签双向同步',
      keywords: 'account sync login 账号 登录 云同步 备份',
      badge: '同步',
      section: '页面直达',
      href: `${base}account/`,
      priority: 51,
    }
  );

  return cmds;
}

interface FlattenedNodeMatch {
  nodeId: string;
  nodeText: string;
  nodeNote: string;
  breadcrumb: string;
}

function flattenMindMapNodes(
  node: MindMapNode,
  trail: string[] = [],
  out: FlattenedNodeMatch[] = []
): FlattenedNodeMatch[] {
  if (!node || typeof node !== 'object') return out;
  const text = String(node.text || '').trim();
  const nextTrail = text ? [...trail, text] : trail;
  out.push({
    nodeId: node.id,
    nodeText: text,
    nodeNote: String(node.note || '').trim(),
    breadcrumb: nextTrail.join(' › '),
  });
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      flattenMindMapNodes(child, nextTrail, out);
    }
  }
  return out;
}

export interface PaletteDataSources {
  posts?: RawPostSearchEntry[];
  localDocs?: LocalReaderIndexEntry[];
  noteBuckets?: Array<{ postSlug: string; records: ArticleHighlightRecord[] }>;
  bookmarks?: ManualBookmarkRecord[];
  recentReading?: ReadingProgressRecord[];
  mindmaps?: MindMapRecord[];
  commands?: PaletteCommandDef[];
  basePath?: string;
}

export interface PaletteQueryOutput {
  effectiveCategory: PaletteCategory;
  isCommandPrefix: boolean;
  cleanQuery: string;
  statusText: string;
  items: PaletteResultItem[];
}

export function queryCommandPalette(
  rawInput: string,
  selectedCategory: PaletteCategory,
  sources: PaletteDataSources
): PaletteQueryOutput {
  const parsed = parsePaletteQuery(rawInput, selectedCategory);
  const { effectiveCategory, isCommandPrefix, cleanQuery, tokens } = parsed;
  const base = (sources.basePath || '/').replace(/\/?$/, '/');

  const posts = sources.posts ?? [];
  const localDocs = sources.localDocs ?? [];
  const postTitleBySlug = new Map<string, string>();
  for (const p of posts) {
    postTitleBySlug.set(normalizeReadingSlug(p.slug), p.title);
  }
  for (const d of localDocs) {
    const slug = buildLocalReaderSlug(d.id);
    if (slug) postTitleBySlug.set(slug, d.title);
  }

  const resolveDocHref = (
    slug: string,
    opts: { resume?: boolean; bookmarkId?: string; highlightId?: string; noteId?: string } = {},
  ): string => {
    const localDocId = parseLocalReaderSlug(slug);
    if (localDocId) {
      return buildReaderDocUrl(localDocId, {
        resume: opts.resume,
        bookmarkId: opts.bookmarkId,
        highlightId: opts.highlightId || opts.noteId,
        basePath: base,
      });
    }
    if (opts.resume) return `${base}posts/${slug}/?resume=1`;
    if (opts.bookmarkId) return `${base}posts/${slug}/?bm=${encodeURIComponent(opts.bookmarkId)}`;
    if (opts.noteId) return `${base}posts/${slug}/?noteId=${encodeURIComponent(opts.noteId)}`;
    return `${base}posts/${slug}/`;
  };

  // 1. 构建「最近在读」条目
  const resumeCandidates: PaletteResultItem[] = (sources.recentReading ?? []).map((prog) => {
    const pct = formatProgressPercent(prog.progress);
    const title = postTitleBySlug.get(prog.postSlug) || prog.postTitle || prog.postSlug;
    const summary = prog.headingText
      ? `上次读至《${prog.headingText}》· 已阅 ${pct}%，点击继续展卷`
      : `上次读至全文 ${pct}% 处，点击继续展卷`;
    const score = cleanQuery
      ? scoreFields(
          [
            { text: normalizePaletteText(title), exactBoost: 135, tokenBoost: 38 },
            { text: normalizePaletteText(prog.headingText), exactBoost: 95, tokenBoost: 28 },
            { text: '续读 继续展卷 在读 resume', exactBoost: 70, tokenBoost: 24 },
          ],
          cleanQuery,
          tokens
        )
      : 1000;

    return {
      uid: `resume:${prog.id}`,
      kind: 'resume',
      category: 'posts',
      sectionLabel: '最近在读 · 继续展卷',
      title,
      summary,
      badge: `续读 ${pct}%`,
      badgeTone: 'vermilion',
      metaRight: formatShortDate(prog.updatedAt) || `/${prog.postSlug}`,
      chips: prog.headingText ? [truncateText(prog.headingText, 24)] : [],
      href: resolveDocHref(prog.postSlug, { resume: true }),
      progressRatio: prog.progress,
      score,
      timestamp: prog.updatedAt,
    };
  });

  // 2. 构建「文章 + 本地书架文稿」条目
  const localDocCandidates: PaletteResultItem[] = localDocs.map((doc) => {
    const slug = buildLocalReaderSlug(doc.id);
    const score = cleanQuery
      ? scoreFields(
          [
            { text: normalizePaletteText(doc.title), exactBoost: 126, tokenBoost: 36 },
            { text: normalizePaletteText(doc.fileName), exactBoost: 90, tokenBoost: 26 },
            { text: normalizePaletteText((doc.tags ?? []).join(' ')), exactBoost: 76, tokenBoost: 22 },
            { text: normalizePaletteText(doc.category), exactBoost: 62, tokenBoost: 18 },
            { text: normalizePaletteText(doc.description), exactBoost: 48, tokenBoost: 14 },
            { text: '本地 文稿 阅读器 reader markdown md', exactBoost: 38, tokenBoost: 12 },
          ],
          cleanQuery,
          tokens
        )
      : 420;

    return {
      uid: `post:${slug}`,
      kind: 'post',
      category: 'posts',
      sectionLabel: '本地阅读器书架',
      title: doc.title,
      summary: doc.description || `${doc.fileName} · 约 ${doc.wordCount} 字（本地 IndexedDB 留存）`,
      badge: '本地文稿',
      badgeTone: 'ink',
      metaRight: formatShortDate(doc.lastOpenedAt || doc.updatedAt) || doc.category,
      chips: (doc.tags ?? []).slice(0, 3),
      href: buildReaderDocUrl(doc.id, { basePath: base }),
      score,
      timestamp: Number(doc.lastOpenedAt || doc.updatedAt || 0),
    };
  });

  const postCandidates: PaletteResultItem[] = [
    ...localDocCandidates,
    ...posts.map((post) => {
    const isLocked = Boolean(post.locked);
    const safeContent = isLocked ? '' : (post.content || '');
    const titleNorm = normalizePaletteText(post.title);
    const tagsNorm = normalizePaletteText((post.tags ?? []).join(' '));
    const catNorm = normalizePaletteText(post.category);
    const descNorm = normalizePaletteText(post.description);
    const excerptNorm = normalizePaletteText(post.excerpt);
    const contentNorm = normalizePaletteText(safeContent);
    const slugNorm = normalizePaletteText(post.slug);

    const score = cleanQuery
      ? scoreFields(
          [
            { text: titleNorm, exactBoost: 125, tokenBoost: 36 },
            { text: tagsNorm, exactBoost: 78, tokenBoost: 22 },
            { text: catNorm, exactBoost: 64, tokenBoost: 18 },
            { text: descNorm, exactBoost: 48, tokenBoost: 14 },
            { text: excerptNorm, exactBoost: 28, tokenBoost: 10 },
            { text: contentNorm, exactBoost: 30, tokenBoost: 9 },
            { text: slugNorm, exactBoost: 20, tokenBoost: 7 },
          ],
          cleanQuery,
          tokens
        )
      : 500;

    return {
      uid: `post:${post.slug}`,
      kind: 'post',
      category: 'posts',
      sectionLabel: '博客文章',
      title: post.title,
      summary: post.description || post.excerpt || '打开这篇文章继续阅读。',
      badge: isLocked ? '加密卷' : (post.category || '文章'),
      badgeTone: isLocked ? 'vermilion' : 'muted',
      metaRight: post.dateLabel || `/${post.slug}`,
      chips: (post.tags ?? []).slice(0, 3),
      href: post.href,
      locked: isLocked,
      score,
      timestamp: Number(post.publishedAt) || 0,
    };
  }),
  ];

  // 3. 构建「笔记 + 手动夹签」条目
  const noteCandidates: PaletteResultItem[] = [];
  for (const bucket of sources.noteBuckets ?? []) {
    const cleanBucketSlug = normalizeReadingSlug(bucket.postSlug);
    const isStandaloneBucket = !cleanBucketSlug || bucket.postSlug === '__standalone__';
    for (const rec of bucket.records) {
      if (!rec || rec.deleted) continue;
      const kind = rec.kind === 'free' || isStandaloneBucket ? 'free' : rec.kind === 'ai' ? 'ai' : 'highlight';
      const recSlug = normalizeReadingSlug(rec.postSlug || cleanBucketSlug);
      const postTitle = postTitleBySlug.get(recSlug) || rec.postTitle || recSlug;

      const displayTitle =
        kind === 'free'
          ? (rec.title?.trim() || truncateText(rec.text, 42) || '未命名 Markdown 随记')
          : kind === 'ai'
          ? (rec.question?.trim() ? `墨问：${truncateText(rec.question, 38)}` : `AI 摘录 · ${truncateText(postTitle || '文章', 28)}`)
          : truncateText(rec.text, 46);

      const summaryParts = [
        rec.comment?.trim() ? `批注：${rec.comment.trim()}` : '',
        kind !== 'highlight' || rec.comment?.trim() ? rec.text : (rec.headingText ? `位于《${rec.headingText}》` : ''),
      ].filter(Boolean);
      const summary = truncateText(summaryParts.join(' · ') || rec.text, 115);

      const href =
        kind === 'free' || !recSlug
          ? `${base}notes/?noteId=${encodeURIComponent(rec.id)}`
          : resolveDocHref(recSlug, { noteId: rec.id });

      const badge = kind === 'free' ? '随记' : kind === 'ai' ? '墨问摘录' : '划线批注';
      const score = cleanQuery
        ? scoreFields(
            [
              { text: normalizePaletteText(rec.title), exactBoost: 118, tokenBoost: 34 },
              { text: normalizePaletteText(rec.comment), exactBoost: 105, tokenBoost: 30 },
              { text: normalizePaletteText(rec.question), exactBoost: 98, tokenBoost: 28 },
              { text: normalizePaletteText(rec.text), exactBoost: 92, tokenBoost: 26 },
              { text: normalizePaletteText((rec.tags ?? []).join(' ')), exactBoost: 72, tokenBoost: 20 },
              { text: normalizePaletteText(postTitle), exactBoost: 45, tokenBoost: 14 },
              { text: normalizePaletteText(rec.headingText), exactBoost: 40, tokenBoost: 12 },
            ],
            cleanQuery,
            tokens
          )
        : 400;

      const ts = Number(rec.updatedAt || rec.timestamp || 0);
      noteCandidates.push({
        uid: `note:${rec.id}`,
        kind: 'note',
        category: 'notes',
        sectionLabel: '笔记与夹签',
        title: displayTitle,
        summary,
        badge,
        badgeTone: kind === 'ai' ? 'vermilion' : 'ink',
        metaRight: postTitle && kind !== 'free' ? truncateText(postTitle, 20) : formatShortDate(ts),
        chips: (rec.tags ?? []).slice(0, 3),
        href,
        score,
        timestamp: ts,
      });
    }
  }

  for (const bm of sources.bookmarks ?? []) {
    if (!bm || bm.deleted) continue;
    const postTitle = postTitleBySlug.get(bm.postSlug) || bm.postTitle || bm.postSlug;
    const pct = formatProgressPercent(bm.progress);
    const title = truncateText(bm.excerpt || bm.headingText || postTitle, 46);
    const summary = bm.headingText
      ? `《${postTitle}》· § ${bm.headingText} (${pct}%)`
      : `《${postTitle}》· 正文 ${pct}% 处夹签`;

    const score = cleanQuery
      ? scoreFields(
          [
            { text: normalizePaletteText(bm.excerpt), exactBoost: 112, tokenBoost: 32 },
            { text: normalizePaletteText(bm.note), exactBoost: 98, tokenBoost: 28 },
            { text: normalizePaletteText(bm.headingText), exactBoost: 76, tokenBoost: 22 },
            { text: normalizePaletteText(postTitle), exactBoost: 60, tokenBoost: 18 },
            { text: '夹签 书签 bookmark', exactBoost: 55, tokenBoost: 18 },
          ],
          cleanQuery,
          tokens
        )
      : 420;

    noteCandidates.push({
      uid: `bm:${bm.id}`,
      kind: 'bookmark',
      category: 'notes',
      sectionLabel: '笔记与夹签',
      title,
      summary,
      badge: `夹签 ${pct}%`,
      badgeTone: 'vermilion',
      metaRight: truncateText(postTitle, 20),
      chips: bm.headingText ? [truncateText(bm.headingText, 22)] : [],
      href: resolveDocHref(bm.postSlug, { bookmarkId: bm.id }),
      progressRatio: bm.progress,
      score,
      timestamp: bm.updatedAt,
    });
  }

  // 4. 构建「思维导图 + 深度节点」条目
  const mindmapCandidates: PaletteResultItem[] = [];
  for (const map of sources.mindmaps ?? []) {
    if (!map || map.deleted) continue;
    const flatNodes = flattenMindMapNodes(map.root);
    const nodeCount = flatNodes.length;
    const mapTitleNorm = normalizePaletteText(map.title);
    const mapCatNorm = normalizePaletteText(map.category);
    const mapTagsNorm = normalizePaletteText((map.tags ?? []).join(' '));
    const ts = Number(map.updatedAt || map.createdAt || 0);

    if (!cleanQuery) {
      mindmapCandidates.push({
        uid: `mm:${map.id}`,
        kind: 'mindmap',
        category: 'mindmaps',
        sectionLabel: '思维导图',
        title: map.title,
        summary: `${map.category || '未分类'} · 共 ${nodeCount} 个知识节点${map.postTitle ? ` · 关联《${truncateText(map.postTitle, 24)}》` : ''}`,
        badge: '导图',
        badgeTone: 'ink',
        metaRight: formatShortDate(ts),
        chips: (map.tags ?? []).slice(0, 3),
        href: `${base}mindmap/?map=${encodeURIComponent(map.id)}`,
        score: 450,
        timestamp: ts,
      });
      continue;
    }

    const mapLevelScore = scoreFields(
      [
        { text: mapTitleNorm, exactBoost: 124, tokenBoost: 36 },
        { text: mapTagsNorm, exactBoost: 78, tokenBoost: 22 },
        { text: mapCatNorm, exactBoost: 62, tokenBoost: 18 },
        { text: normalizePaletteText(map.postTitle), exactBoost: 48, tokenBoost: 14 },
      ],
      cleanQuery,
      tokens
    );

    let bestNode: { node: FlattenedNodeMatch; score: number } | null = null;
    for (const fn of flatNodes) {
      const ns = scoreFields(
        [
          { text: normalizePaletteText(fn.nodeText), exactBoost: 112, tokenBoost: 32 },
          { text: normalizePaletteText(fn.nodeNote), exactBoost: 84, tokenBoost: 24 },
          { text: mapTitleNorm, exactBoost: 30, tokenBoost: 10 },
        ],
        cleanQuery,
        tokens
      );
      if (ns > 0 && (!bestNode || ns > bestNode.score)) {
        bestNode = { node: fn, score: ns };
      }
    }

    if (bestNode && bestNode.score > mapLevelScore && bestNode.node.nodeId !== map.root.id) {
      mindmapCandidates.push({
        uid: `mm:${map.id}:${bestNode.node.nodeId}`,
        kind: 'mindmap',
        category: 'mindmaps',
        sectionLabel: '思维导图',
        title: bestNode.node.nodeText || map.title,
        summary: truncateText(
          bestNode.node.nodeNote
            ? `${bestNode.node.breadcrumb} · 备注：${bestNode.node.nodeNote}`
            : `脉络：${bestNode.node.breadcrumb}`,
          115
        ),
        badge: '导图节点',
        badgeTone: 'ink',
        metaRight: truncateText(map.title, 20),
        chips: [map.category, ...(map.tags ?? []).slice(0, 2)].filter(Boolean),
        href: `${base}mindmap/?map=${encodeURIComponent(map.id)}&node=${encodeURIComponent(bestNode.node.nodeId)}`,
        score: bestNode.score,
        timestamp: ts,
      });
    } else if (mapLevelScore > 0 || bestNode) {
      const finalScore = Math.max(mapLevelScore, bestNode?.score ?? 0);
      mindmapCandidates.push({
        uid: `mm:${map.id}`,
        kind: 'mindmap',
        category: 'mindmaps',
        sectionLabel: '思维导图',
        title: map.title,
        summary: `${map.category || '未分类'} · 共 ${nodeCount} 个知识节点${map.postTitle ? ` · 关联《${truncateText(map.postTitle, 24)}》` : ''}`,
        badge: '导图',
        badgeTone: 'ink',
        metaRight: formatShortDate(ts),
        chips: (map.tags ?? []).slice(0, 3),
        href: `${base}mindmap/?map=${encodeURIComponent(map.id)}`,
        score: finalScore,
        timestamp: ts,
      });
    }
  }

  // 5. 构建「快捷指令」条目
  const commandDefs = sources.commands ?? buildDefaultCommands({ basePath: base });
  const commandCandidates: PaletteResultItem[] = commandDefs.map((cmd) => {
    const score = cleanQuery
      ? scoreFields(
          [
            { text: normalizePaletteText(cmd.title), exactBoost: 122, tokenBoost: 36 },
            { text: normalizePaletteText(cmd.keywords), exactBoost: 92, tokenBoost: 28 },
            { text: normalizePaletteText(cmd.summary), exactBoost: 45, tokenBoost: 14 },
          ],
          cleanQuery,
          tokens
        )
      : (cmd.priority ?? 50);

    return {
      uid: cmd.id,
      kind: 'command',
      category: 'commands',
      sectionLabel: cmd.section || '书斋指令',
      title: cmd.title,
      summary: cmd.summary,
      badge: cmd.badge || '指令',
      badgeTone: cmd.badge === '续读' || cmd.badge === '当前主题' ? 'vermilion' : 'muted',
      metaRight: cmd.shortcut || 'Enter 执行',
      chips: [],
      href: cmd.href,
      actionId: cmd.actionId,
      score,
      timestamp: cmd.priority ?? 50,
    };
  });

  // ---------- 空查询编排 ----------
  if (!cleanQuery) {
    if (effectiveCategory === 'commands') {
      return {
        effectiveCategory,
        isCommandPrefix,
        cleanQuery,
        statusText: isCommandPrefix
          ? `指令模式 · 共 ${commandCandidates.length} 项可执行动作`
          : `书斋快捷指令 · 共 ${commandCandidates.length} 项`,
        items: commandCandidates,
      };
    }

    if (effectiveCategory === 'posts') {
      const topResumes = resumeCandidates.slice(0, 2);
      const resumeSlugs = new Set(
        (sources.recentReading ?? []).slice(0, 2).map((r) => r.postSlug)
      );
      const topPosts = postCandidates
        .filter((p) => !resumeSlugs.has(p.uid.slice(5)))
        .slice(0, 8);
      const combined = [...topResumes, ...topPosts];
      return {
        effectiveCategory,
        isCommandPrefix,
        cleanQuery,
        statusText: topResumes.length ? '最近在读与最新文章' : '最近更新文章',
        items: combined,
      };
    }

    if (effectiveCategory === 'notes') {
      const sorted = [...noteCandidates].sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);
      return {
        effectiveCategory,
        isCommandPrefix,
        cleanQuery,
        statusText: sorted.length ? `本机与云端笔记 / 夹签 · 最近 ${sorted.length} 条` : '暂无笔记或夹签',
        items: sorted,
      };
    }

    if (effectiveCategory === 'mindmaps') {
      const sorted = [...mindmapCandidates].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
      return {
        effectiveCategory,
        isCommandPrefix,
        cleanQuery,
        statusText: sorted.length ? `思维导图 · 最近 ${sorted.length} 张` : '暂无思维导图',
        items: sorted,
      };
    }

    // effectiveCategory === 'all'：空态置顶「最近在读」+ 最近更新文章 + 最近批注/导图 + 常用指令
    const out: PaletteResultItem[] = [];
    const topResumes = resumeCandidates.slice(0, 2);
    out.push(...topResumes);

    const recentNotes = [...noteCandidates].sort((a, b) => b.timestamp - a.timestamp).slice(0, 2);
    const recentMaps = [...mindmapCandidates].sort((a, b) => b.timestamp - a.timestamp).slice(0, 2);
    const resumeSlugs = new Set(
      (sources.recentReading ?? []).slice(0, 2).map((r) => r.postSlug)
    );
    const recentPosts = postCandidates
      .filter((p) => !resumeSlugs.has(p.uid.slice(5)))
      .slice(0, topResumes.length > 0 ? 4 : 5);
    const quickCmds = commandCandidates.slice(0, 3).map((c) => ({
      ...c,
      sectionLabel: '快捷指令 · 输入 > 浏览全部',
    }));

    out.push(...recentPosts, ...recentNotes, ...recentMaps, ...quickCmds);

    return {
      effectiveCategory,
      isCommandPrefix,
      cleanQuery,
      statusText: topResumes.length
        ? '继续展卷 · 跨库检索文章、笔记、导图或输入 > 执行指令'
        : '输入关键词跨库检索，或输入 > 唤出快捷指令',
      items: out,
    };
  }

  // ---------- 关键词检索编排 ----------
  let pool: PaletteResultItem[] = [];
  if (effectiveCategory === 'posts') {
    pool = [...resumeCandidates, ...postCandidates];
  } else if (effectiveCategory === 'notes') {
    pool = noteCandidates;
  } else if (effectiveCategory === 'mindmaps') {
    pool = mindmapCandidates;
  } else if (effectiveCategory === 'commands') {
    pool = commandCandidates;
  } else {
    // 全部：去重同篇续读与普通文章（若续读命中更高则保留续读）
    pool = [
      ...resumeCandidates,
      ...postCandidates,
      ...noteCandidates,
      ...mindmapCandidates,
      ...commandCandidates,
    ];
  }

  const matched = pool
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp)
    .slice(0, 14);

  const labelMap: Record<PaletteCategory, string> = {
    all: '项跨库结果',
    posts: '篇相关文章',
    notes: '条笔记与夹签',
    mindmaps: '项导图与节点',
    commands: '条匹配指令',
  };

  return {
    effectiveCategory,
    isCommandPrefix,
    cleanQuery,
    statusText: matched.length
      ? `找到 ${matched.length} ${labelMap[effectiveCategory]}`
      : '未找到匹配项',
    items: matched,
  };
}
