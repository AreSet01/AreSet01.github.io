/**
 * localMarkdownRenderer.ts — 本地 Markdown 全功能客户端渲染引擎
 *
 * 与博客构建期管道（astro.config.mjs + PostLayout）保持高度视觉与语义对齐：
 * - YAML Frontmatter 解析（title / description / category / tags / pubDate）
 * - CJK 粗体归一化 + KaTeX 数学公式 ($...$ / $$...$$)
 * - GitHub Alerts 水墨笺注块 ([!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION])
 * - Mermaid 图表块（输出与 remarkMermaid 完全一致的 .mermaid-block 结构）
 * - 懒加载 highlight.js 常用语言子集 + 代码块元数据 (title / 行号 / 高亮行)
 * - 标题稳定锚点 slug 生成（供 TOC、章节直达与思维导图提取复用）
 * - 表格横向滚动容器 (.table-scroll-wrap)
 * - 本地相对路径图片 & Obsidian ![[image.png]] 解析与缺失提示
 */

import { marked } from 'marked';
import {
  strongifyMarkdown,
  renderMath,
  transformAlertCalloutsHtml,
} from './inkAskMarkdown.ts';
import {
  resolveAssetPathForDoc,
  type LocalReaderHeading,
} from './localReaderStorage.ts';

// ---------- 基础工具 ----------

const escapeHtml = (value: string): string =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const FENCE_PROTECT_RE = /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g;
const INLINE_CODE_PROTECT_RE = /(`+)([^\n]*?)\1/g;

// ---------- YAML Frontmatter 解析 ----------

export interface ParsedFrontmatter {
  title?: string;
  description?: string;
  category?: string;
  tags: string[];
  pubDate?: string;
  body: string;
}

function unquoteYaml(val: string): string {
  const s = val.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\(["'])/g, '$1').trim();
  }
  return s;
}

export function parseFrontmatter(rawSource: string): ParsedFrontmatter {
  const normalized = String(rawSource || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!match) {
    return { tags: [], body: normalized };
  }

  const yamlText = match[1];
  const body = normalized.slice(match[0].length);
  const result: ParsedFrontmatter = { tags: [], body };

  const lines = yamlText.split('\n');
  let activeListKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (activeListKey && /^\s*-\s+(.+)$/.test(line)) {
      const itemMatch = /^\s*-\s+(.+)$/.exec(line);
      if (itemMatch && activeListKey === 'tags') {
        const tag = unquoteYaml(itemMatch[1]);
        if (tag && !result.tags.includes(tag)) result.tags.push(tag);
      }
      continue;
    }

    const kvMatch = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!kvMatch) {
      activeListKey = null;
      continue;
    }

    const key = kvMatch[1].toLowerCase();
    const rawVal = kvMatch[2].trim();
    activeListKey = null;

    if (key === 'title') {
      result.title = unquoteYaml(rawVal);
    } else if (key === 'description' || key === 'summary' || key === 'excerpt') {
      if (!result.description) result.description = unquoteYaml(rawVal);
    } else if (key === 'category' || key === 'categories') {
      if (!result.category) {
        const clean = unquoteYaml(rawVal.replace(/^\[|\]$/g, '').split(',')[0] || '');
        if (clean) result.category = clean;
      }
    } else if (key === 'pubdate' || key === 'date' || key === 'updated' || key === 'created') {
      if (!result.pubDate) result.pubDate = unquoteYaml(rawVal);
    } else if (key === 'tags' || key === 'tag') {
      if (!rawVal) {
        activeListKey = 'tags';
      } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        const items = rawVal
          .slice(1, -1)
          .split(',')
          .map((s) => unquoteYaml(s))
          .filter(Boolean);
        for (const t of items) {
          if (!result.tags.includes(t)) result.tags.push(t);
        }
      } else {
        const items = rawVal
          .split(/[,，]/)
          .map((s) => unquoteYaml(s))
          .filter(Boolean);
        for (const t of items) {
          if (!result.tags.includes(t)) result.tags.push(t);
        }
      }
    }
  }

  return result;
}

// ---------- 标题 Slug 与大纲提取 ----------

export function stripInlineMarkdown(text: string): string {
  return String(text || '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createHeadingSlugger() {
  const seen = new Map<string, number>();
  return function slugify(rawText: string): string {
    const plain = stripInlineMarkdown(rawText).toLowerCase();
    let base = plain
      .replace(/[^\p{L}\p{N}\s_-]+/gu, '')
      .trim()
      .replace(/\s+/g, '-');
    if (!base) base = 'section';
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

export function countMarkdownWords(markdown: string): number {
  const stripped = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~\-|]/g, ' ');
  const cjkCount = (stripped.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const latinWords = (stripped.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').match(/[A-Za-z0-9_]+/g) || []).length;
  return cjkCount + latinWords;
}

function cleanFileNameToTitle(fileName: string): string {
  const clean = String(fileName || '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.(md|markdown|mdown|mkd|txt)$/i, '')
    .trim();
  return clean || '未命名文稿';
}

function stripLeadingH1IfMatches(body: string): { h1Title: string; bodyWithoutH1: string } {
  const match = /^\s*#[ \t]+([^\n#][^\n]*?)[ \t]*#*[ \t]*(?:\n+|$)/.exec(body);
  if (!match) return { h1Title: '', bodyWithoutH1: body };
  return {
    h1Title: stripInlineMarkdown(match[1]),
    bodyWithoutH1: body.slice(match[0].length),
  };
}

function extractAutoDescription(body: string): string {
  const withoutFences = body.replace(/```[\s\S]*?```/g, '\n');
  const lines = withoutFences.split('\n');
  const paraLines: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (paraLines.length > 0) break;
      continue;
    }
    if (
      trimmed.startsWith('#') ||
      trimmed.startsWith('![') ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('***') ||
      trimmed.startsWith('|') ||
      /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.test(trimmed.replace(/^>\s*/, ''))
    ) {
      if (paraLines.length > 0) break;
      continue;
    }
    paraLines.push(trimmed.replace(/^>\s*/, '').replace(/^[-*+]\s+/, ''));
    if (paraLines.join(' ').length >= 160) break;
  }
  const clean = stripInlineMarkdown(paraLines.join(' '));
  return clean.length > 150 ? `${clean.slice(0, 148).trim()}…` : clean;
}

export function extractMarkdownHeadings(body: string): LocalReaderHeading[] {
  const slugify = createHeadingSlugger();
  const lines = String(body || '').replace(/\r\n?/g, '\n').split('\n');
  const headings: LocalReaderHeading[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fenceMatch) {
      const char = fenceMatch[1][0];
      const len = fenceMatch[1].length;
      if (!inFence) {
        inFence = true;
        fenceChar = char;
        fenceLen = len;
      } else if (char === fenceChar && len >= fenceLen) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    const hMatch = /^(#{1,6})\s+(.+?)\s*#*$/.exec(trimmed);
    if (!hMatch) continue;
    const depth = hMatch[1].length;
    const text = stripInlineMarkdown(hMatch[2]);
    if (!text) continue;
    const slug = slugify(text);
    if (depth >= 2 && depth <= 4) {
      headings.push({ depth, slug, text });
    }
  }
  return headings;
}

export interface ParsedMarkdownDocument {
  title: string;
  description: string;
  category: string;
  tags: string[];
  pubDate: string;
  body: string;
  wordCount: number;
  readingMinutes: number;
  headings: LocalReaderHeading[];
}

export function parseMarkdownDocument(
  rawMarkdown: string,
  fileName = 'untitled.md',
  fallbackCategory = '技术文档',
): ParsedMarkdownDocument {
  const fm = parseFrontmatter(rawMarkdown);
  let body = fm.body;
  let title = fm.title || '';

  if (!title) {
    const { h1Title, bodyWithoutH1 } = stripLeadingH1IfMatches(body);
    if (h1Title) {
      title = h1Title;
      body = bodyWithoutH1;
    } else {
      title = cleanFileNameToTitle(fileName);
    }
  } else {
    // 若 Frontmatter 已有 title 且正文首行是重复 H1，自动去重避免双标题
    const { h1Title, bodyWithoutH1 } = stripLeadingH1IfMatches(body);
    if (h1Title && h1Title.toLowerCase() === title.trim().toLowerCase()) {
      body = bodyWithoutH1;
    }
  }

  const description = fm.description || extractAutoDescription(body);
  const wordCount = countMarkdownWords(body);
  const readingMinutes = Math.max(1, Math.round(wordCount / 360));
  const headings = extractMarkdownHeadings(body);
  const pubDate = fm.pubDate || new Date().toISOString().slice(0, 10);

  return {
    title: title.trim() || cleanFileNameToTitle(fileName),
    description,
    category: fm.category || fallbackCategory,
    tags: fm.tags.slice(0, 12),
    pubDate,
    body,
    wordCount,
    readingMinutes,
    headings,
  };
}

// ---------- 代码块元数据与 highlight.js 懒加载 ----------

export interface CodeFenceMeta {
  lang: string;
  title: string;
  highlights: Set<number>;
  noNumbers: boolean;
  forceNumbers: boolean;
}

export function parseFenceMeta(rawInfo?: string): CodeFenceMeta {
  const info = String(rawInfo || '').trim();
  const firstSpace = info.search(/\s/);
  const lang = (firstSpace === -1 ? info : info.slice(0, firstSpace)).toLowerCase();
  const meta = firstSpace === -1 ? '' : info.slice(firstSpace + 1);

  const titleMatch = /(?:title|file|filename)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
  const title = titleMatch ? titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? '' : '';

  const highlights = new Set<number>();
  const rangeMatch = /\{\s*([\d,\s-]+)\s*\}/.exec(meta);
  if (rangeMatch) {
    for (const part of rangeMatch[1].split(',')) {
      const [rawStart, rawEnd] = part.split('-');
      const start = Number.parseInt(String(rawStart).trim(), 10);
      if (!Number.isFinite(start)) continue;
      const end = Number.parseInt(String(rawEnd ?? rawStart).trim(), 10);
      for (let i = start; i <= (Number.isFinite(end) ? end : start); i += 1) {
        highlights.add(i);
      }
    }
  }

  return {
    lang,
    title,
    highlights,
    noNumbers: /(^|\s)no-line-numbers(\s|$)/.test(meta),
    forceNumbers: /(^|\s)(showLineNumbers|line-numbers)(\s|$)/.test(meta),
  };
}

type HljsCore = {
  registerLanguage: (name: string, lang: any) => void;
  getLanguage: (name: string) => any;
  highlight: (code: string, options: { language: string; ignoreIllegals?: boolean }) => { value: string };
};

let hljsInstance: HljsCore | null = null;

const LANG_ALIAS_MAP: Record<string, string> = {
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  h: 'cpp',
  inl: 'cpp',
  hlsl: 'glsl',
  usf: 'glsl',
  ush: 'glsl',
  shader: 'glsl',
  cs: 'csharp',
  'c#': 'csharp',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  ps1: 'powershell',
  pwsh: 'powershell',
  yml: 'yaml',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  astro: 'xml',
  md: 'markdown',
  toml: 'ini',
  conf: 'ini',
  cfg: 'ini',
  docker: 'dockerfile',
  make: 'makefile',
  mk: 'makefile',
};

const LANGUAGE_LOADERS: Record<string, () => Promise<any>> = {
  cpp: () => import('highlight.js/lib/languages/cpp'),
  c: () => import('highlight.js/lib/languages/c'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  python: () => import('highlight.js/lib/languages/python'),
  rust: () => import('highlight.js/lib/languages/rust'),
  go: () => import('highlight.js/lib/languages/go'),
  java: () => import('highlight.js/lib/languages/java'),
  bash: () => import('highlight.js/lib/languages/bash'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
  json: () => import('highlight.js/lib/languages/json'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  xml: () => import('highlight.js/lib/languages/xml'),
  css: () => import('highlight.js/lib/languages/css'),
  scss: () => import('highlight.js/lib/languages/scss'),
  sql: () => import('highlight.js/lib/languages/sql'),
  glsl: () => import('highlight.js/lib/languages/glsl'),
  lua: () => import('highlight.js/lib/languages/lua'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  diff: () => import('highlight.js/lib/languages/diff'),
  ini: () => import('highlight.js/lib/languages/ini'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  cmake: () => import('highlight.js/lib/languages/cmake'),
};

const registeredLangs = new Set<string>();
let hljsCorePromise: Promise<HljsCore | null> | null = null;

/** 扫描 Markdown 围栏中实际出现的语言列表，避免一次拉取全部 25 个语法包造成主线程阻塞 */
export function detectCodeLanguages(markdown: string): string[] {
  const found = new Set<string>();
  const re = /(?:^|\n)[ \t]*(?:`{3,}|~{3,})[ \t]*([A-Za-z0-9_+#.-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(markdown || ''))) !== null) {
    const raw = match[1].toLowerCase();
    if (!raw || raw === 'mermaid' || raw === 'text' || raw === 'plain') continue;
    const resolved = LANG_ALIAS_MAP[raw] || raw;
    if (LANGUAGE_LOADERS[resolved]) {
      found.add(resolved);
    }
  }
  return Array.from(found);
}

async function ensureHljsCore(): Promise<HljsCore | null> {
  if (hljsInstance) return hljsInstance;
  if (!hljsCorePromise) {
    hljsCorePromise = import('highlight.js/lib/core')
      .then((coreMod) => {
        const hljs: HljsCore = (coreMod as any).default || (coreMod as any);
        hljsInstance = hljs;
        return hljs;
      })
      .catch(() => {
        hljsCorePromise = null;
        return null;
      });
  }
  return hljsCorePromise;
}

export async function loadCodeHighlighter(languages?: string[]): Promise<HljsCore | null> {
  const targetLangs = Array.isArray(languages)
    ? Array.from(
        new Set(
          languages
            .map((l) => {
              const raw = String(l || '').toLowerCase();
              return LANG_ALIAS_MAP[raw] || raw;
            })
            .filter((l) => Boolean(LANGUAGE_LOADERS[l])),
        ),
      )
    : Object.keys(LANGUAGE_LOADERS);

  if (targetLangs.length === 0) {
    return hljsInstance;
  }

  const hljs = await ensureHljsCore();
  if (!hljs) return null;

  const missing = targetLangs.filter((l) => !registeredLangs.has(l));
  if (missing.length > 0) {
    const loaded = await Promise.all(
      missing.map(async (name) => {
        try {
          const mod = await LANGUAGE_LOADERS[name]();
          return [name, (mod as any).default || mod] as const;
        } catch {
          return null;
        }
      }),
    );
    for (const entry of loaded) {
      if (!entry) continue;
      const [name, grammar] = entry;
      if (!registeredLangs.has(name)) {
        hljs.registerLanguage(name, grammar);
        registeredLangs.add(name);
      }
    }
  }
  return hljs;
}

/**
 * 按换行符切分带 <span class="..."> 的高亮 HTML，自动在每行末尾闭合跨行标签并在下一行重开，
 * 彻底杜绝多行注释 / 多行字符串被拆分后产生非法嵌套 DOM。
 */
export function splitHighlightedHtmlIntoLines(highlightedHtml: string): string[] {
  const rawLines = highlightedHtml.replace(/\n$/, '').split('\n');
  const openStack: string[] = [];
  const out: string[] = [];

  for (const line of rawLines) {
    const prefix = openStack.join('');
    const tagRe = /<(\/?)span\b([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(line)) !== null) {
      if (m[1] === '/') {
        if (openStack.length > 0) openStack.pop();
      } else {
        openStack.push(`<span${m[2]}>`);
      }
    }
    const suffix = '</span>'.repeat(openStack.length);
    out.push(`${prefix}${line}${suffix}`);
  }
  return out;
}

function highlightCodeToLines(code: string, lang: string, hljs: HljsCore | null): string[] {
  const cleanCode = String(code || '').replace(/\r\n?/g, '\n');
  const resolvedLang = LANG_ALIAS_MAP[lang] || lang;
  if (hljs && resolvedLang && hljs.getLanguage(resolvedLang)) {
    try {
      const highlighted = hljs.highlight(cleanCode, { language: resolvedLang, ignoreIllegals: true }).value;
      return splitHighlightedHtmlIntoLines(highlighted);
    } catch {}
  }
  return cleanCode.replace(/\n$/, '').split('\n').map((line) => escapeHtml(line));
}

// ---------- Mermaid 块 HTML（与 astro.config.mjs 完全对齐） ----------

export function buildMermaidBlockHtml(rawCode: string, title = ''): string {
  const cleanCode = String(rawCode || '').trim();
  const encodedCode = encodeURIComponent(cleanCode);
  const escapedCode = escapeHtml(cleanCode);
  const titleAttr = title ? ` data-title="${encodeURIComponent(title)}"` : '';
  const displayTitle = title ? `<span class="mermaid-block-title-text">${escapeHtml(title)}</span>` : '';

  return `<div class="mermaid-block" data-mermaid-code="${encodedCode}"${titleAttr}>
  <div class="mermaid-block-header">
    <div class="mermaid-block-title">
      <span class="mermaid-badge">
        <svg class="mermaid-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="6" height="6" rx="1"></rect>
          <rect x="15" y="15" width="6" height="6" rx="1"></rect>
          <path d="M6 9v3a3 3 0 0 0 3 3h6"></path>
        </svg>
        <span>MERMAID</span>
      </span>
      ${displayTitle}
    </div>
    <div class="mermaid-block-actions">
      <div class="mermaid-zoom-group">
        <button type="button" class="mermaid-action-btn mermaid-btn-zoom-out" aria-label="缩小图表" title="缩小 (−)">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button type="button" class="mermaid-action-btn mermaid-btn-zoom-reset" aria-label="重置缩放" title="重置缩放 (100%)">
          <span class="mermaid-zoom-val">100%</span>
        </button>
        <button type="button" class="mermaid-action-btn mermaid-btn-zoom-in" aria-label="放大图表" title="放大 (+)">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
      <button type="button" class="mermaid-action-btn mermaid-btn-copy" aria-label="复制 Mermaid 代码" title="复制代码">
        <span>Copy</span>
      </button>
      <button type="button" class="mermaid-action-btn mermaid-btn-source" aria-label="切换源码/图表视图" title="查看源码">
        <span>Code</span>
      </button>
      <button type="button" class="mermaid-action-btn mermaid-btn-pin" data-pin-btn="true" aria-label="钉住图表对照" title="钉到分屏对照工作台">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="12" y1="17" x2="12" y2="22"></line>
          <path d="M5 17h14v-2l-2-2V5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v8l-2 2v2z"></path>
        </svg>
        <span>Pin</span>
      </button>
      <button type="button" class="mermaid-action-btn mermaid-btn-expand" aria-label="全屏查看图表" title="全屏查看">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
        <span>Expand</span>
      </button>
    </div>
  </div>
  <div class="mermaid-stage">
    <div class="mermaid-render" data-rendered="false">
      <div class="mermaid-loading">
        <span class="mermaid-spinner"></span>
        <span>图表渲染中...</span>
      </div>
    </div>
  </div>
  <div class="mermaid-source" hidden data-no-search style="display: none;">
    <pre class="mermaid-source-pre"><code>${escapedCode}</code></pre>
  </div>
</div>`;
}

// ---------- Obsidian 图片嵌入预处理 ----------

export function convertObsidianImageEmbeds(src: string): string {
  if (!src || !src.includes('![[')) return src;
  const protectedBlocks: string[] = [];
  const hold = (match: string) => {
    protectedBlocks.push(match);
    return `\u0000OBP${protectedBlocks.length - 1}\u0000`;
  };

  let text = src.replace(FENCE_PROTECT_RE, hold).replace(INLINE_CODE_PROTECT_RE, hold);
  text = text.replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_m, target: string, altOrSize?: string) => {
    const cleanTarget = String(target || '').trim();
    const cleanAlt = String(altOrSize || '').trim();
    const alt = /^\d+(?:x\d+)?$/.test(cleanAlt) ? '' : cleanAlt;
    const encodedTarget = cleanTarget.replace(/ /g, '%20');
    return `![${alt || cleanTarget}](${encodedTarget})`;
  });

  return text.replace(/\u0000OBP(\d+)\u0000/g, (_m, idx) => protectedBlocks[Number(idx)] ?? '');
}

// ---------- HTML 安全清洗 ----------

const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM']);

function cleanNodeTree(parent: ParentNode) {
  for (const child of Array.from(parent.children || [])) {
    if (BLOCKED_TAGS.has(child.tagName)) {
      child.remove();
      continue;
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        child.removeAttribute(attr.name);
      } else if (name === 'href' && /^(?:javascript:|vbscript:|data:text\/html)/i.test(val)) {
        child.removeAttribute(attr.name);
      } else if (
        name === 'src' &&
        !/^(?:https?:|blob:|data:image\/|\/|\.)/i.test(val) &&
        /^[a-z][a-z0-9+.-]*:/i.test(val)
      ) {
        child.removeAttribute(attr.name);
      }
    }
    cleanNodeTree(child);
  }
}

export function sanitizeReaderHtml(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined') {
    return html
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  }
  try {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    cleanNodeTree(tpl.content);
    return tpl.innerHTML;
  } catch {
    return html;
  }
}

// ---------- 核心文档渲染入口 ----------

export interface RenderLocalMarkdownOptions {
  docDir?: string;
  /** normalizedAssetPath -> ObjectURL (blob:...) 或 data: URL */
  assetUrlMap?: Map<string, string>;
  highlighter?: HljsCore | null;
}

export interface RenderedLocalMarkdown {
  html: string;
  headings: LocalReaderHeading[];
  missingAssets: string[];
}

export function renderLocalMarkdownBody(
  markdownBody: string,
  options: RenderLocalMarkdownOptions = {},
): RenderedLocalMarkdown {
  const docDir = options.docDir || '';
  const assetUrlMap = options.assetUrlMap || new Map<string, string>();
  const availableAssetPaths = Array.from(assetUrlMap.keys());
  const missingAssets: string[] = [];
  const headings: LocalReaderHeading[] = [];
  const slugify = createHeadingSlugger();

  const preprocessed = renderMath(
    strongifyMarkdown(
      convertObsidianImageEmbeds(String(markdownBody || '').replace(/\r\n?/g, '\n')),
    ),
  );

  const renderer = new marked.Renderer();

  renderer.heading = function ({ tokens, depth }) {
    const innerHtml = this.parser.parseInline(tokens);
    const plainText = stripInlineMarkdown(innerHtml);
    const slug = slugify(plainText);
    if (depth >= 2 && depth <= 4 && plainText) {
      headings.push({ depth, slug, text: plainText });
    }
    return `<h${depth} id="${escapeHtml(slug)}">${innerHtml}</h${depth}>\n`;
  };

  renderer.code = function ({ text, lang: rawInfo }) {
    const meta = parseFenceMeta(rawInfo);
    if (meta.lang === 'mermaid') {
      return `${buildMermaidBlockHtml(text, meta.title)}\n`;
    }

    const lines = highlightCodeToLines(text, meta.lang, options.highlighter ?? hljsInstance);
    const lineCount = lines.length;
    const showLineNumbers = meta.forceNumbers || (!meta.noNumbers && lineCount >= 5);
    const attrs: string[] = [
      'class="astro-code reader-code"',
      `data-language="${escapeHtml(meta.lang || 'text')}"`,
    ];
    if (meta.title) attrs.push(`data-title="${escapeHtml(meta.title)}"`);
    if (meta.highlights.size > 0) attrs.push('data-has-highlight="true"');
    if (showLineNumbers) {
      attrs.push('data-line-numbers="true"');
      attrs.push(`style="--line-digits:${String(lineCount).length}"`);
    }

    const lineHtml = lines
      .map((content, idx) => {
        const lineNum = idx + 1;
        const cls = meta.highlights.has(lineNum) ? 'line highlighted' : 'line';
        return `<span class="${cls}">${content}</span>`;
      })
      .join('\n');

    const langClass = meta.lang ? `language-${escapeHtml(meta.lang)}` : 'language-text';
    return `<pre ${attrs.join(' ')}><code class="${langClass}">${lineHtml}</code></pre>\n`;
  };

  renderer.table = function (token) {
    let headerCells = '';
    for (const cell of token.header) {
      const alignAttr = cell.align ? ` style="text-align:${cell.align}"` : '';
      headerCells += `<th${alignAttr}>${this.parser.parseInline(cell.tokens)}</th>`;
    }
    let bodyRows = '';
    for (const row of token.rows) {
      let rowCells = '';
      for (const cell of row) {
        const alignAttr = cell.align ? ` style="text-align:${cell.align}"` : '';
        rowCells += `<td${alignAttr}>${this.parser.parseInline(cell.tokens)}</td>`;
      }
      bodyRows += `<tr>${rowCells}</tr>`;
    }
    return `<div class="table-scroll-wrap"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>\n`;
  };

  renderer.link = function ({ href, title, tokens }) {
    const inner = this.parser.parseInline(tokens);
    const cleanHref = String(href || '').trim();
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    if (cleanHref.startsWith('#')) {
      return `<a href="${escapeHtml(cleanHref)}"${titleAttr}>${inner}</a>`;
    }
    return `<a href="${escapeHtml(cleanHref)}"${titleAttr} target="_blank" rel="noopener noreferrer nofollow">${inner}</a>`;
  };

  renderer.image = function ({ href, title, text }) {
    const rawHref = String(href || '').trim();
    const alt = escapeHtml(text || '');
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';

    if (/^(?:https?:|data:image\/|blob:)/i.test(rawHref)) {
      return `<img src="${escapeHtml(rawHref)}" alt="${alt}"${titleAttr} loading="lazy" decoding="async" />`;
    }

    const matchedPath = resolveAssetPathForDoc(docDir, rawHref, availableAssetPaths);
    if (matchedPath && assetUrlMap.has(matchedPath)) {
      const objectUrl = assetUrlMap.get(matchedPath)!;
      return `<img src="${escapeHtml(objectUrl)}" alt="${alt}"${titleAttr} data-local-asset="${escapeHtml(matchedPath)}" loading="lazy" decoding="async" />`;
    }

    if (rawHref && !missingAssets.includes(rawHref)) {
      missingAssets.push(rawHref);
    }
    return `<span class="reader-missing-asset" data-missing-asset="true" data-asset-src="${escapeHtml(rawHref)}">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
      <span>本地图片未加载：<code>${escapeHtml(rawHref || alt || 'unknown')}</code>（可通过「导入文件夹」或补充图片文件自动关联）</span>
    </span>`;
  };

  const parsedHtml = marked.parse(preprocessed, {
    renderer,
    gfm: true,
    breaks: false,
  });
  const htmlStr = typeof parsedHtml === 'string' ? parsedHtml : '';
  const withAlerts = transformAlertCalloutsHtml(htmlStr);
  return {
    html: sanitizeReaderHtml(withAlerts),
    headings,
    missingAssets,
  };
}

/**
 * 提取适合发送给 /api/ask（墨问 AI）的精简纯文本上下文（受限于 24,000 字符，确保快速且不超请求体上限）
 */
export function extractLocalReaderAskContext(markdown: string, maxChars = 24000): string {
  const { body } = parseFrontmatter(markdown);
  const cleaned = String(body || '')
    .replace(/\r\n?/g, '\n')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_m, alt) => (alt ? `[图片: ${alt}]` : ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned.length > maxChars ? cleaned.slice(0, maxChars) : cleaned;
}

// ---------- 内置示例文稿（方便零门槛体验阅读器全套能力） ----------

export const SAMPLE_READER_MARKDOWN = `---
title: 本地阅读器快速上手：水墨书斋排版与伴读指南
description: 这是一份内置示例文稿，展示本地 Markdown 书架对代码高亮、公式、Mermaid 图表、笺注提示框、划线批注与墨问伴读的完整支持。
category: 技术文档
tags: [Markdown, 阅读器, 示例指南]
pubDate: 2026-11-19
---

## 一、快速导入与本地书架

你可以直接**拖拽单个或多个 \`.md\` 文件**，或点击「导入文件夹」把整套 Markdown 笔记与本地相对路径图片（如 \`./images/arch.png\`、Obsidian \`![[diagram.png]]\`）一起装进书架。

> [!TIP] 隐私与持久化
> 所有本地文稿与图片均保存在浏览器本地 **IndexedDB**，原文永不上传服务器；再次导入同名文件时，可选择「覆盖更新正文并保留原划线与书签」。

## 二、代码块、行号与高亮行

支持博客文章同款围栏元数据（\`title="..."\`、\`{3-5}\` 行高亮、超长代码折叠、一键复制与钉入分屏对照台）：

\`\`\`cpp title="FMemoryArena.h" showLineNumbers {4-6}
#pragma once
#include <cstddef>

struct FLinearArena {
    std::byte* Base = nullptr;
    std::size_t Offset = 0;
    std::size_t Capacity = 0;

    void* Allocate(std::size_t Bytes, std::size_t Align = 16) noexcept {
        const std::size_t Mask = Align - 1;
        const std::size_t Aligned = (Offset + Mask) & ~Mask;
        if (Aligned + Bytes > Capacity) return nullptr;
        Offset = Aligned + Bytes;
        return Base + Aligned;
    }
};
\`\`\`

## 三、公式、流程图与表格

行内公式如时间复杂度 $O(n \\log n)$，块级公式同样由 KaTeX 即时渲染：

$$
\\text{Latency}_{\\text{frame}} = \\frac{1000\\,\\text{ms}}{\\text{FPS}} \\le 8.33\\,\\text{ms} \\quad (\\text{at } 120\\,\\text{Hz})
$$

\`\`\`mermaid title="本地阅读器数据流"
flowchart LR
  A["拖拽 .md / 文件夹"] --> B["Frontmatter & 图片解析"]
  B --> C[("IndexedDB 书架")]
  C --> D["沉浸阅读舞台"]
  D --> E["划线批注 → /notes"]
  D --> F["章节大纲 → /mindmap"]
  D --> G["墨问 AI 伴读"]
\`\`\`

| 功能模块 | 快捷键 / 入口 | 联动去向 |
| :--- | :--- | :--- |
| 文内搜索 | \`⌘F\` 或 \`/\` | 高亮定位全部命中段落 |
| 划线批注 | 拖动选中任意正文 | 同步汇总至 \`/notes\` 并支持跳回 |
| 夹签续读 | 按 \`B\` 键或顶部「夹签」 | 记录阅读进度并在 \`⌘K\` 置顶续读 |
| 一键导图 | 阅读页顶部「生成导图」 | 载入标题大纲与高亮至 \`/mindmap\` |

> [!NOTE] 试试划词互动
> 现在就可以直接用鼠标选中上面的任意一段话，体验**连续划线高亮、写批注、夹签**，或者点击右侧**墨问**展开 AI 伴读！
`;
