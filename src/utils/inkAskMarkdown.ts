// 墨问回答 / 笔记的 Markdown 渲染。
//
// 背景：CommonMark 里 ** 是否生效取决于它左右字符的 flanking 类别。汉字算 letter、
// 全角标点算 punctuation，所以 `的**“引用”**` 这种写法在纯 CommonMark 下不会变成粗体；
// 失效后残留的 ** 还会跟后面的 ** 错配，把粗体挪到别的字上。
//
// 这里不再让 marked 去猜：先屏蔽代码，再按出现顺序把 **…** 直接转成 <strong>…</strong>，
// 完全绕开 flanking 规则；落单的 ** 做兜底，避免任何位置漏出星号。

import { marked } from 'marked';

const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /(`+)([^\n]*?)\1/g;
const PLACEHOLDER_RE = /\u0000([FC])(\d+)\u0000/g;

function placeholder(kind: 'F' | 'C', index: number): string {
  return `\u0000${kind}${index}\u0000`;
}

/**
 * 把 **…** 直接转成 <strong>…</strong>（代码块 / 行内代码原样保留）。
 * 落单的 **：如果紧跟在 ASCII 单词字符后面（int**、char** 这类），保留为普通文本；
 * 其余（中文、标点、空格旁的多余定界符）直接去掉，保证回答里不出现裸星号。
 */
export function strongifyMarkdown(src: string): string {
  if (!src) return '';

  const fences: string[] = [];
  const codes: string[] = [];

  let text = src.replace(FENCE_RE, (match) => {
    fences.push(match);
    return placeholder('F', fences.length - 1);
  });

  text = text.replace(INLINE_CODE_RE, (match) => {
    codes.push(match);
    return placeholder('C', codes.length - 1);
  });

  text = text.replace(/\*\*([^\n]+?)\*\*/g, (_match: string, inner: string) => {
    const content = inner.trim();
    return content ? `<strong>${content}</strong>` : '';
  });

  text = text.replace(/\*\*/g, (match: string, offset: number, whole: string) => {
    const before = whole[offset - 1] ?? '';
    // C/C++ 指针写法（int**、char**）保留原样；其余落单定界符清掉
    return /[A-Za-z0-9_>\]]/.test(before) ? match : '';
  });

  return text.replace(PLACEHOLDER_RE, (_match: string, kind: string, index: string) => {
    return kind === 'F' ? fences[Number(index)] : codes[Number(index)];
  });
}

/** 回答渲染前的统一入口：中文圆点列表 → 标准列表，再把粗体归一化。 */
export function preprocessMarkdown(src: string): string {
  if (!src) return '';
  let text = src.replace(/\r\n?/g, '\n');
  text = text.replace(/^[ \t]*[•·][ \t]+/gm, '- ');
  return strongifyMarkdown(text);
}

// ---------- HTML 清洗 ----------

const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM']);

function cleanElementTree(parent: ParentNode) {
  for (const child of Array.from(parent.children || [])) {
    if (BLOCKED_TAGS.has(child.tagName)) {
      child.remove();
      continue;
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) child.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) child.removeAttribute(attr.name);
    }
    cleanElementTree(child);
  }
}

/** 轻量清洗 marked 产出的 HTML，去掉脚本 / 事件属性 / javascript: 链接 */
export function sanitizeHtml(html: string): string {
  if (typeof document === 'undefined' || !html) return html;
  try {
    const template = document.createElement('template');
    template.innerHTML = html;
    cleanElementTree(template.content);
    return template.innerHTML;
  } catch {
    return html;
  }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- marked 渲染器 ----------

const renderer = new marked.Renderer();
renderer.link = ({ href, text }) => `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
renderer.heading = ({ text }) => `<p class="ink-ask-h md-heading">${text}</p>`;

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer,
});

/** 墨问回答 / AI 笔记共用：预处理 + marked + 清洗，返回 HTML 字符串 */
export function renderMarkdown(src: string): string {
  try {
    const parsed = marked.parse(preprocessMarkdown(src));
    return typeof parsed === 'string' ? sanitizeHtml(parsed) : '';
  } catch {
    return escapeHtml(src).replace(/\n/g, '<br>');
  }
}
