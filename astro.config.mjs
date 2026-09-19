import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

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

export default defineConfig({
  site: 'https://AreSet01.github.io',
  markdown: {
    shikiConfig: {
      transformers: [codeMetaTransformer],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
