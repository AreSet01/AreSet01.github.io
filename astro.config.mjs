import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { visit } from 'unist-util-visit';

/**
 * Fence meta we understand, e.g.
 *   ```cpp title="MyActor.h" {3-5,9}
 *   ```cpp no-line-numbers
 */
function parseFenceMeta(raw) {
  const meta = String(raw || '');
  const titleMatch = /(?:title|file|filename)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
  const title = titleMatch ? titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? '' : '';

  const highlights = new Set();
  const rangeMatch = /\{\s*([\d,\s-]+)\s*\}/.exec(meta);
  if (rangeMatch) {
    for (const part of rangeMatch[1].split(',')) {
      const [rawStart, rawEnd] = part.split('-');
      const start = Number.parseInt(String(rawStart).trim(), 10);
      if (!Number.isFinite(start)) continue;
      const end = Number.parseInt(String(rawEnd ?? rawStart).trim(), 10);
      for (let i = start; i <= (Number.isFinite(end) ? end : start); i += 1) highlights.add(i);
    }
  }

  return {
    title,
    highlights,
    noNumbers: /(^|\s)no-line-numbers(\s|$)/.test(meta),
    forceNumbers: /(^|\s)(showLineNumbers|line-numbers)(\s|$)/.test(meta),
  };
}

function addClass(node, className) {
  const current = node.properties.class ?? node.properties.className ?? '';
  const list = Array.isArray(current) ? current : String(current).split(/\s+/).filter(Boolean);
  if (!list.includes(className)) list.push(className);
  node.properties.class = list.join(' ');
  delete node.properties.className;
}

/** Carries the filename, highlighted lines and a line count out to the DOM for CSS + the toolbar. */
const codeMetaTransformer = {
  name: 'areset:code-meta',
  code(node) {
    const store = this.meta ?? (this._store ??= {});
    store.lineCount = node.children.filter((child) => child.type === 'element').length;
  },
  line(node, line) {
    const { highlights } = parseFenceMeta(this.options?.meta?.__raw);
    if (highlights.has(line)) addClass(node, 'highlighted');
  },
  pre(node) {
    const { title, highlights, noNumbers, forceNumbers } = parseFenceMeta(this.options?.meta?.__raw);
    const store = this.meta ?? this._store ?? {};
    const lineCount = store.lineCount ?? 0;

    if (title) node.properties['data-title'] = title;
    if (highlights.size) node.properties['data-has-highlight'] = 'true';
    // Numbers earn their keep once a block is more than a snippet
    if (forceNumbers || (!noNumbers && lineCount >= 5)) {
      node.properties['data-line-numbers'] = 'true';
      node.properties['style'] = `${node.properties['style'] ?? ''};--line-digits:${String(lineCount).length}`;
    }
  },
};

function remarkMermaid() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (!node || node.lang !== 'mermaid') return;

      const { title } = parseFenceMeta(node.meta);
      const rawCode = String(node.value || '').trim();
      const encodedCode = encodeURIComponent(rawCode);
      const escapedCode = rawCode
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const titleAttr = title ? ` data-title="${encodeURIComponent(title)}"` : '';
      const displayTitle = title ? `<span class="mermaid-block-title-text">${title}</span>` : '';

      const html = `<div class="mermaid-block" data-mermaid-code="${encodedCode}"${titleAttr}>
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
  <div class="mermaid-source" hidden>
    <pre class="mermaid-source-pre"><code>${escapedCode}</code></pre>
  </div>
</div>`;

      parent.children.splice(index, 1, {
        type: 'html',
        value: html,
      });
    });
  };
}

export default defineConfig({
  site: 'https://AreSet01.github.io',
  markdown: {
    remarkPlugins: [remarkMermaid],
    shikiConfig: {
      transformers: [codeMetaTransformer],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
