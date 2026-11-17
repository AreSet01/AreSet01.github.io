import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import remarkCjkFriendly from 'remark-cjk-friendly';
import { rehypeAlertCallouts } from '../src/utils/rehypeAlertCallouts.ts';
import { domRangeToMarkdown, renderMarkdown } from '../src/utils/inkAskMarkdown.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const POSTS = path.resolve(ROOT, 'src', 'content', 'posts');

const processor = await createMarkdownProcessor({
  remarkPlugins: [remarkCjkFriendly],
  rehypePlugins: [rehypeAlertCallouts],
  syntaxHighlight: false,
});

test('1. astro.config registers rehypeAlertCallouts', () => {
  const config = readFileSync(path.resolve(ROOT, 'astro.config.mjs'), 'utf8');
  assert.match(config, /import\s*\{\s*rehypeAlertCallouts\s*\}\s*from\s*['"]\.\/src\/utils\/rehypeAlertCallouts\.ts['"]/);
  assert.match(config, /rehypePlugins:\s*\[[\s\S]*?rehypeAlertCallouts[\s\S]*?\]/);
});

test('2. Alert callouts transform correctly with custom titles', async () => {
  const md = `> [!IMPORTANT] 委托形参排布黄金法则（Dynamic Params vs Payload）
> 虚幻引擎委托在调用目标函数时，形参排布严格遵循：\`TargetFunction(...)\`。
> 1. **动态参数在前**：委托宏定义的形参排在最前；
> 2. **预置 Payload 在后**：按传递顺序紧随其后。`;

  const { code } = await processor.render(md);

  // 必须不再出现裸露的 [!IMPORTANT]
  assert.ok(!code.includes('[!IMPORTANT]'), `code should not contain raw [!IMPORTANT]: ${code}`);
  // 必须渲染为 aside.callout-card.callout-important
  assert.match(code, /<aside class="callout-card callout-important"[^>]*data-callout="important"[^>]*role="note"/);
  // 必须提取出自定义标题
  assert.match(code, /<span class="callout-title">委托形参排布黄金法则（Dynamic Params vs Payload）<\/span>/);
  // 图标存在
  assert.match(code, /<span class="callout-icon"/);
  // 剩余正文完整保留
  assert.match(code, /<code>TargetFunction\(\.\.\.\)<\/code>/);
  assert.match(code, /<ol>/);
  assert.match(code, /<strong>动态参数在前<\/strong>/);
});

test('3. Alert callouts transform correctly with default title when title is omitted', async () => {
  const md = `> [!TIP]
> 这是一个没有自定义标题的小技巧提示。`;

  const { code } = await processor.render(md);

  assert.ok(!code.includes('[!TIP]'), `raw [!TIP] must not leak: ${code}`);
  assert.match(code, /<aside class="callout-card callout-tip"[^>]*data-callout="tip"/);
  assert.match(code, /<span class="callout-title">技巧<\/span>/);
  assert.match(code, /<p>这是一个没有自定义标题的小技巧提示。<\/p>/);
});

test('4. All 5 alert types (NOTE, TIP, IMPORTANT, WARNING, CAUTION) are supported', async () => {
  const types = [
    { key: 'NOTE', title: '提示' },
    { key: 'TIP', title: '技巧' },
    { key: 'IMPORTANT', title: '重要' },
    { key: 'WARNING', title: '注意' },
    { key: 'CAUTION', title: '警告' },
  ];

  for (const { key, title } of types) {
    const md = `> [!${key}]
> 内容段落`;
    const { code } = await processor.render(md);
    assert.match(code, new RegExp(`callout-${key.toLowerCase()}`));
    assert.match(code, new RegExp(`<span class="callout-title">${title}</span>`));
  }
});

test('5. Ordinary blockquotes remain unaffected', async () => {
  const md = `> 一日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？
> 论语学而篇`;

  const { code } = await processor.render(md);

  assert.match(code, /^<blockquote>/);
  assert.ok(!code.includes('callout-card'), 'ordinary quote should not become a callout');
});

test('6. Real post ue5-delegates-architecture-deep-dive renders without raw alert markers', async () => {
  const postPath = path.join(POSTS, 'ue5-delegates-architecture-deep-dive.md');
  const markdown = readFileSync(postPath, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

  const { code } = await processor.render(markdown);

  assert.ok(!code.includes('[!NOTE]'), 'raw [!NOTE] must not be rendered');
  assert.ok(!code.includes('[!IMPORTANT]'), 'raw [!IMPORTANT] must not be rendered');
  assert.match(code, /callout-note/);
  assert.match(code, /callout-important/);
});

test('7. renderMarkdown & domRangeToMarkdown handle callout cards round-trip', () => {
  const input = '> [!NOTE] 核心语法与设计差异\n> 1. 形参名必填\n> 2. 绑定方式';
  const rendered = renderMarkdown(input);

  assert.match(rendered, /class="callout-card callout-note"/);
  assert.match(rendered, /<span class="callout-title">核心语法与设计差异<\/span>/);
  assert.ok(!rendered.includes('[!NOTE]'), 'no raw alert tag in rendered HTML');
});
