import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { preprocessMarkdown, strongifyMarkdown, renderMarkdown, domRangeToMarkdown } from '../src/utils/inkAskMarkdown.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

marked.setOptions({ gfm: true, breaks: true });

const render = (src) => marked.parse(preprocessMarkdown(src)).trim();

test('1. InkAsk shares the markdown preprocessor and the prompt has a pairing rule', () => {
  const inkAskPath = path.resolve(ROOT, 'src', 'components', 'InkAsk.astro');
  assert.ok(existsSync(inkAskPath), 'src/components/InkAsk.astro must exist');
  const inkAskContent = readFileSync(inkAskPath, 'utf8');
  assert.match(
    inkAskContent,
    /import\s*\{[^}]*\b(?:preprocessMarkdown|renderMarkdown)\b[^}]*\}\s*from\s*['"]\.\.\/utils\/inkAskMarkdown['"]/,
    'InkAsk must import the shared markdown helper',
  );
  assert.doesNotMatch(
    inkAskContent,
    /stars % 2/,
    'InkAsk must not append ** by counting stars per line anymore',
  );

  const askPath = path.resolve(ROOT, 'server', 'ask.mjs');
  assert.ok(existsSync(askPath), 'server/ask.mjs must exist');
  const askContent = readFileSync(askPath, 'utf8');
  assert.match(
    askContent,
    /反引号代码与加粗组合时写为\s*\*\*\\?`Code\\?`\*\*/,
    'server/ask.mjs system prompt must guide model to use **`Code`**',
  );
  assert.match(askContent, /必须成对闭合/, 'server/ask.mjs prompt must forbid unpaired **');
});

test('2. CJK punctuation next to ** no longer leaks raw asterisks', () => {
  const cases = [
    '虚幻引擎走出了一条极富工业哲学的**“第三条道路”**：',
    '任何标记清除算法的第一步，都是确定**“世界树的根（Root Set）”**。如果一个对象在引用链路上，它就是**可达的（Reachable）**。',
    '如果把 Java、C# 那些全托管语言的 GC 比作**“大包大揽的保姆”**，那**虚幻引擎（UE）的 GC 策略就像一个“极其克制且讲究规矩的特种部队保洁”** -- 它只在特定时间干活。',
    '- **UE 的做法：** 不用计数器，改用**“顺藤摸瓜”**。',
  ];

  for (const input of cases) {
    const html = render(input);
    assert.ok(!html.includes('**'), `raw ** left in: ${html}`);
    assert.match(html, /<strong>/, `expected <strong> in: ${html}`);
  }

  assert.strictEqual(
    render('任何标记清除算法的第一步，都是确定**“世界树的根（Root Set）”**。'),
    '<p>任何标记清除算法的第一步，都是确定<strong>“世界树的根（Root Set）”</strong>。</p>',
  );
});

test('3. Stray / unbalanced markers are cleaned instead of leaking', () => {
  // 模型在引号后多写了一个 **（截图里的 GC 段）
  const gc = '**GC 启动时**，先拉出一个“绝对活着的名单” **（比如全局引擎对象、当前打开的世界关卡）。';
  const html = render(gc);
  assert.ok(!html.includes('**'), `raw ** left in: ${html}`);
  assert.match(html, /<strong>GC 启动时<\/strong>/);

  // 只有开头没有结尾
  const odd = '这是**没闭合的粗体，后面还有正常文字。';
  const oddHtml = render(odd);
  assert.ok(!oddHtml.includes('**'), `raw ** left in: ${oddHtml}`);
  assert.match(oddHtml, /这是没闭合的粗体/);
});

test('4. Code fences and inline code are never rewritten', () => {
  const fence = '```cpp\nint** p = nullptr;\n**not bold**\n```';
  const fenceHtml = render(fence);
  assert.ok(fenceHtml.includes('int** p = nullptr;'));
  assert.ok(fenceHtml.includes('**not bold**'));

  const inline = '为什么必须用**`CreateDefaultSubobject`**？另外 `int**` 是二级指针。';
  const inlineHtml = render(inline);
  assert.ok(!inlineHtml.replace(/<code>[\s\S]*?<\/code>/g, '').includes('**'), `raw ** left in: ${inlineHtml}`);
  assert.match(inlineHtml, /<strong><code>CreateDefaultSubobject<\/code><\/strong>/);
  assert.ok(inlineHtml.includes('<code>int**</code>'));

  // 正文里裸露的 C++ 指针不当作定界符吃掉
  assert.ok(strongifyMarkdown('这里直接写 int** 指针。').includes('int**'));
});

test('5. renderMarkdown renders bold / inline code for notes and answers', () => {
  const html = renderMarkdown('这是 **加粗结论** 和 `inline code`。');
  assert.match(html, /<strong>加粗结论<\/strong>/);
  assert.match(html, /<code>inline code<\/code>/);
  assert.ok(!html.includes('**'));

  const list = renderMarkdown('- 一\n- 二');
  assert.match(list, /<li>一<\/li>/);
  assert.match(list, /<li>二<\/li>/);
});

test('5b. renderMarkdown can emit real heading tags for the notes reader', () => {
  const html = renderMarkdown('# 一级标题\n\n## 二级标题', { heading: 'h' });
  assert.match(html, /<h1 class="ink-ask-h md-heading">一级标题<\/h1>/);
  assert.match(html, /<h2 class="ink-ask-h md-heading">二级标题<\/h2>/);

  // InkAsk 仍然使用压平的段落标题，保持原有视觉
  const answer = renderMarkdown('# 一级标题');
  assert.match(answer, /<p class="ink-ask-h md-heading">一级标题<\/p>/);
});

test('6. domRangeToMarkdown converts DOM elements and ranges to clean Markdown', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(`
    <div id="container">
      <h2>核心架构解析</h2>
      <p>虚幻引擎中，<strong>UObject</strong> 是基类，使用 <code>CreateDefaultSubobject</code> 创建。</p>
      <blockquote><p>这是一段引用内容</p></blockquote>
      <ul>
        <li>特性 A</li>
        <li>特性 B 包含 <a href="https://example.com">链接</a></li>
      </ul>
      <pre class="astro-code cpp"><div class="code-block-toolbar"><button>Copy</button></div><code><span>int x = 42;</span></code></pre>
      <span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">x^2 + y^2 = r^2</annotation></semantics></math></span></span>
    </div>
  `);

  const container = dom.window.document.getElementById('container');
  const md = domRangeToMarkdown(container);

  assert.match(md, /## 核心架构解析/);
  assert.match(md, /\*\*UObject\*\*/);
  assert.match(md, /`CreateDefaultSubobject`/);
  assert.match(md, /> 这是一段引用内容/);
  assert.match(md, /- 特性 A/);
  assert.match(md, /\[链接\]\(https:\/\/example\.com\)/);
  assert.match(md, /```cpp\nint x = 42;\n```/);
  assert.match(md, /\$x\^2 \+ y\^2 = r\^2\$/);
  assert.doesNotMatch(md, /Copy/); // Toolbars must be stripped
});

test('7. InkAsk and ArticleSelectionDock preserve markdown formatting when saving notes', () => {
  const dockContent = readFileSync(path.resolve(ROOT, 'src', 'components', 'ArticleSelectionDock.astro'), 'utf8');
  const inkAskContent = readFileSync(path.resolve(ROOT, 'src', 'components', 'InkAsk.astro'), 'utf8');

  // Verify InkAsk uses domRangeToMarkdown instead of plain selection.toString()
  assert.match(inkAskContent, /domRangeToMarkdown/);
  assert.match(inkAskContent, /selectedTextInside\(el:\s*HTMLElement\s*\|\s*null\)/);

  // Verify ArticleSelectionDock uses info?.text from serializeHighlight in copy/pin/ask
  assert.match(dockContent, /info\?\.text\s*\|\|\s*currentSelectedRange\.toString\(\)/);
});

