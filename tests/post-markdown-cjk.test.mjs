import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import remarkCjkFriendly from 'remark-cjk-friendly';
import { rehypeTableScroll } from '../src/utils/rehypeTableScroll.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const POSTS = path.resolve(ROOT, 'src', 'content', 'posts');

const processor = await createMarkdownProcessor({
  remarkPlugins: [remarkCjkFriendly],
  syntaxHighlight: false,
});

const plainProse = (html) =>
  html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code[\s\S]*?<\/code>/g, '');

test('1. astro.config registers remark-cjk-friendly before the mermaid transformer', () => {
  const config = readFileSync(path.resolve(ROOT, 'astro.config.mjs'), 'utf8');
  assert.match(config, /import\s+remarkCjkFriendly\s+from\s+['"]remark-cjk-friendly['"]/);
  assert.match(config, /remarkPlugins:\s*\[[^\]]*remarkCjkFriendly/);
  assert.match(config, /rehypePlugins:\s*\[rehypeTableScroll\]/);
});

test('2. quoted / parenthesised bold inside CJK text renders as <strong>', async () => {
  const cases = [
    '虚幻引擎走出了一条极富工业哲学的**“第三条道路”**：',
    '任何标记清除算法的第一步，都是确定**“世界树的根（Root Set）”**。它就是**可达的（Reachable）**。',
    '我们常常希望在**不启动游戏（非 PIE）**的前提下直接选中 Actor。',
    '推出了这套**《UE5 C++ Meta 元数据完全技术指南》**。',
    '归功于其底层精密的**代理多态包装器（Delegate Instance）**设计。',
  ];

  for (const markdown of cases) {
    const { code } = await processor.render(markdown);
    assert.ok(!plainProse(code).includes('**'), `raw ** left in: ${code}`);
    assert.match(code, /<strong>[^<]+<\/strong>/, `expected <strong> in: ${code}`);
  }
});

test('3. no article body leaks literal bold markers', async () => {
  const files = readdirSync(POSTS).filter((name) => name.endsWith('.md'));
  assert.ok(files.length >= 10, 'expected the post collection to be present');

  const offenders = [];
  for (const file of files) {
    const markdown = readFileSync(path.join(POSTS, file), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const { code } = await processor.render(markdown);
    if (plainProse(code).includes('**')) offenders.push(file);
  }

  assert.deepEqual(offenders, [], `literal ** found in article bodies: ${offenders.join(', ')}`);
});

test('4. tables get a dedicated horizontal scroll container', async () => {
  const tableProcessor = await createMarkdownProcessor({
    remarkPlugins: [remarkCjkFriendly],
    rehypePlugins: [rehypeTableScroll],
    syntaxHighlight: false,
  });

  const markdown = [
    '| 架构维度 | GC 策略 | 设计意图 |',
    '| :--- | :--- | :--- |',
    '| **基础算法** | **追踪式标记-清除** | 天然解决 A → B → A 循环引用。 |',
  ].join('\n');

  const { code } = await tableProcessor.render(markdown);
  assert.match(code, /<div class="table-scroll" tabindex="0">\s*<table>/, 'table must be wrapped for horizontal scrolling');
  assert.match(code, /<strong>追踪式标记-清除<\/strong>/);
});
