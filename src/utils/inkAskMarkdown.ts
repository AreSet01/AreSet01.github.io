// 墨问回答 / 笔记的 Markdown 渲染。
//
// 背景：CommonMark 里 ** 是否生效取决于它左右字符的 flanking 类别。汉字算 letter、
// 全角标点算 punctuation，所以 `的**“引用”**` 这种写法在纯 CommonMark 下不会变成粗体；
// 失效后残留的 ** 还会跟后面的 ** 错配，把粗体挪到别的字上。
//
// 这里不再让 marked 去猜：先屏蔽代码，再按出现顺序把 **…** 直接转成 <strong>…</strong>，
// 完全绕开 flanking 规则；落单的 ** 做兜底，避免任何位置漏出星号。

import { marked } from 'marked';
import katex from 'katex';

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

/**
 * 提取并渲染 LaTeX 数学公式（支持行内 $...$ 与块级 $$...$$，严格保护代码块与行内代码）。
 */
export function renderMath(src: string): string {
  if (!src || !src.includes('$')) return src;

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

  // 1. 块级数学公式 $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, expr) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return _match;
    }
  });

  // 2. 行内数学公式 $...$
  text = text.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_match, expr) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return _match;
    }
  });

  return text.replace(PLACEHOLDER_RE, (_match: string, kind: string, index: string) => {
    return kind === 'F' ? fences[Number(index)] : codes[Number(index)];
  });
}

/** 回答渲染前的统一入口：中文圆点列表 → 标准列表，粗体归一化，LaTeX 公式预渲染。 */
export function preprocessMarkdown(src: string): string {
  if (!src) return '';
  let text = src.replace(/\r\n?/g, '\n');
  text = text.replace(/^[ \t]*[•·][ \t]+/gm, '- ');
  return renderMath(strongifyMarkdown(text));
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

export interface RenderMarkdownOptions {
  /**
   * `p`（默认，墨问回答）把标题压成带类名的段落；
   * `h`（笔记阅读器）输出真正的 h1~h6，让笔记页恢复标题层级。
   */
  heading?: 'p' | 'h';
}

function createRenderer(headingTag: 'p' | 'h') {
  const renderer = new marked.Renderer();
  renderer.link = ({ href, text }) => `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
  renderer.heading = ({ text, depth }) =>
    headingTag === 'h'
      ? `<h${depth} class="ink-ask-h md-heading">${text}</h${depth}>`
      : `<p class="ink-ask-h md-heading">${text}</p>`;
  return renderer;
}

const defaultRenderer = createRenderer('p');
const noteRenderer = createRenderer('h');

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer: defaultRenderer,
});

/** 墨问回答 / AI 笔记共用：预处理 + marked + 清洗，返回 HTML 字符串 */
export function renderMarkdown(src: string, options: RenderMarkdownOptions = {}): string {
  try {
    const renderer = options.heading === 'h' ? noteRenderer : defaultRenderer;
    const parsed = marked.parse(preprocessMarkdown(src), { renderer });
    return typeof parsed === 'string' ? sanitizeHtml(parsed) : '';
  } catch {
    return escapeHtml(src).replace(/\n/g, '<br>');
  }
}

const SKIP_MD_SELECTOR = '.code-block-toolbar, .mermaid-block-header, .mermaid-block-actions, button, svg, script, style, [data-no-search], [data-no-highlight]';

/**
 * 将 DOM 选区 (Range) 或元素节点转换为纯净规范的 Markdown。
 * 兼容文章正文 (Astro/Shiki/KaTeX) 与 墨问 AI 回答的富文本节点。
 */
export function domRangeToMarkdown(rangeOrNode: Range | Node | string | null | undefined): string {
  if (!rangeOrNode) return '';
  if (typeof rangeOrNode === 'string') return rangeOrNode.trim();

  let fragment: DocumentFragment | Node;
  if ('cloneContents' in (rangeOrNode as any) && typeof (rangeOrNode as Range).cloneContents === 'function') {
    try {
      fragment = (rangeOrNode as Range).cloneContents();
    } catch {
      fragment = rangeOrNode as Node;
    }
  } else {
    fragment = rangeOrNode as Node;
  }

  function nodeToMd(node: Node): string {
    if (!node) return '';
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      return node.nodeValue || '';
    }
    if (node.nodeType !== 1 /* Node.ELEMENT_NODE */ && node.nodeType !== 11 /* Node.DOCUMENT_FRAGMENT_NODE */) {
      return '';
    }

    const el = node as HTMLElement;
    if (typeof el.matches === 'function' && el.matches(SKIP_MD_SELECTOR)) return '';
    const tag = (el.tagName || '').toUpperCase();

    // 1. KaTeX 数学公式支持：提取原始 TeX 代码
    if (el.classList && el.classList.contains('katex')) {
      const ann = el.querySelector('annotation[encoding="application/x-tex"]') || el.querySelector('annotation');
      const tex = ann?.textContent?.trim() || '';
      if (tex) {
        const isDisplay = el.classList.contains('katex-display') || Boolean(el.closest?.('.katex-display'));
        return isDisplay ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;
      }
    }

    // 2. Mermaid 图表块支持：提取源码与标题
    if (el.classList && el.classList.contains('mermaid-block')) {
      const rawCode = el.getAttribute('data-mermaid-code');
      const code = rawCode ? decodeURIComponent(rawCode) : (el.querySelector('.mermaid-source-pre code')?.textContent || '');
      const rawTitle = el.getAttribute('data-title');
      const title = rawTitle ? decodeURIComponent(rawTitle) : (el.querySelector('.mermaid-block-title-text')?.textContent?.trim() || '');
      if (code) {
        return `\n\n\`\`\`mermaid${title ? ` title="${title}"` : ''}\n${code.trim()}\n\`\`\`\n\n`;
      }
    }

    // 3. 代码块 <pre>（支持 Shiki 与通用 pre/code）
    if (tag === 'PRE') {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(SKIP_MD_SELECTOR).forEach((s) => s.remove());
      const codeEl = clone.querySelector('code') || clone;
      const codeText = codeEl.textContent || '';
      const cls = `${el.className || ''} ${el.querySelector('code')?.className || ''}`;
      const m = cls.match(/(?:language-|astro-code\s+)([a-z0-9_-]+)/i);
      const lang = m ? m[1] : '';
      return `\n\n\`\`\`${lang}\n${codeText.replace(/^\n+|\n+$/g, '')}\n\`\`\`\n\n`;
    }

    // 4. 行内代码 <code>
    if (tag === 'CODE') {
      const code = el.textContent || '';
      if (code.includes('`')) return ` \`\` ${code} \`\` `;
      return `\`${code}\``;
    }

    // 5. 粗体 <strong> / <b>
    if (tag === 'STRONG' || tag === 'B') {
      const inner = Array.from(el.childNodes).map(nodeToMd).join('');
      const trimmed = inner.trim();
      if (!trimmed) return inner;
      const leading = inner.match(/^\s*/)?.[0] || '';
      const trailing = inner.match(/\s*$/)?.[0] || '';
      return `${leading}**${trimmed}**${trailing}`;
    }

    // 6. 斜体 <em> / <i>
    if (tag === 'EM' || tag === 'I') {
      const inner = Array.from(el.childNodes).map(nodeToMd).join('');
      const trimmed = inner.trim();
      if (!trimmed) return inner;
      const leading = inner.match(/^\s*/)?.[0] || '';
      const trailing = inner.match(/\s*$/)?.[0] || '';
      return `${leading}*${trimmed}*${trailing}`;
    }

    // 7. 删除线 <del> / <s> / <strike>
    if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') {
      const inner = Array.from(el.childNodes).map(nodeToMd).join('');
      const trimmed = inner.trim();
      if (!trimmed) return inner;
      const leading = inner.match(/^\s*/)?.[0] || '';
      const trailing = inner.match(/\s*$/)?.[0] || '';
      return `${leading}~~${trimmed}~~${trailing}`;
    }

    // 8. 引用块 <blockquote>
    if (tag === 'BLOCKQUOTE') {
      const inner = Array.from(el.childNodes).map(nodeToMd).join('').trim();
      const quoted = inner
        .split('\n')
        .map((l) => (l.trim() ? `> ${l}` : '>'))
        .join('\n');
      return `\n\n${quoted}\n\n`;
    }

    // 9. 标题 <h1> - <h6>
    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      const inner = Array.from(el.childNodes).map(nodeToMd).join('').trim();
      return `\n\n${'#'.repeat(level)} ${inner}\n\n`;
    }

    // 10. 无序列表 <ul>
    if (tag === 'UL') {
      const items = Array.from(el.children).filter((c) => c.tagName === 'LI');
      const listMd = items
        .map((li) => `- ${Array.from(li.childNodes).map(nodeToMd).join('').trim()}`)
        .join('\n');
      return `\n\n${listMd}\n\n`;
    }

    // 11. 有序列表 <ol>
    if (tag === 'OL') {
      const items = Array.from(el.children).filter((c) => c.tagName === 'LI');
      const listMd = items
        .map((li, i) => `${i + 1}. ${Array.from(li.childNodes).map(nodeToMd).join('').trim()}`)
        .join('\n');
      return `\n\n${listMd}\n\n`;
    }

    // 12. 段落 <p>
    if (tag === 'P') {
      const inner = Array.from(el.childNodes).map(nodeToMd).join('').trim();
      return `\n\n${inner}\n\n`;
    }

    // 13. 表格 <table>
    if (tag === 'TABLE') {
      const rows = Array.from(el.querySelectorAll('tr'));
      if (!rows.length) return '';
      const matrix = rows.map((r) =>
        Array.from(r.children).map((cell) =>
          Array.from(cell.childNodes).map(nodeToMd).join('').replace(/\|/g, '\\|').trim()
        )
      );
      const colCount = Math.max(...matrix.map((r) => r.length), 0);
      if (colCount === 0) return '';
      let tableMd = '\n\n';
      const header = matrix[0] || [];
      while (header.length < colCount) header.push('');
      tableMd += `| ${header.join(' | ')} |\n`;
      tableMd += `| ${header.map(() => '---').join(' | ')} |\n`;
      for (let i = 1; i < matrix.length; i++) {
        const row = matrix[i];
        while (row.length < colCount) row.push('');
        tableMd += `| ${row.join(' | ')} |\n`;
      }
      return `${tableMd}\n\n`;
    }

    // 14. 链接 <a>
    if (tag === 'A') {
      const inner = Array.from(el.childNodes).map(nodeToMd).join('').trim();
      const href = el.getAttribute('href') || '';
      if (href && !href.startsWith('javascript:')) return `[${inner}](${href})`;
      return inner;
    }

    // 15. 图片 <img>
    if (tag === 'IMG') {
      const alt = el.getAttribute('alt') || '';
      const src = el.getAttribute('src') || '';
      if (src) return `![${alt}](${src})`;
      return '';
    }

    // 16. 分割线 <hr>
    if (tag === 'HR') return '\n\n---\n\n';

    // 17. 换行 <br>
    if (tag === 'BR') return '\n';

    // 默认：递归拼接子节点
    return Array.from(el.childNodes).map(nodeToMd).join('');
  }

  try {
    return nodeToMd(fragment)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return (rangeOrNode.toString?.() || '').trim();
  }
}

