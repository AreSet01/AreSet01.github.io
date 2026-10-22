import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { preprocessMarkdown, strongifyMarkdown, renderMarkdown } from '../src/utils/inkAskMarkdown.ts';

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
