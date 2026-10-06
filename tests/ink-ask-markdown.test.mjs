import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('1. InkAsk preprocessMarkdown and system prompt alignment', () => {
  const inkAskPath = path.resolve(ROOT, 'src', 'components', 'InkAsk.astro');
  assert.ok(existsSync(inkAskPath), 'src/components/InkAsk.astro must exist');
  const inkAskContent = readFileSync(inkAskPath, 'utf8');

  // Verify regex transformation converts bold inline code directly to strong tag
  assert.ok(
    inkAskContent.includes('text.replace(/\\*\\*\\s*(`[^`\\n]+`)\\s*\\*\\*/g, \'<strong>$1</strong>\')') ||
    inkAskContent.includes('text = text.replace(/\\*\\*\\s*(`[^`\\n]+`)\\s*\\*\\*/g, \'<strong>$1</strong>\')'),
    'InkAsk must replace bold inline code with <strong>$1</strong>'
  );

  // Verify ask.mjs system prompt aligns
  const askPath = path.resolve(ROOT, 'server', 'ask.mjs');
  assert.ok(existsSync(askPath), 'server/ask.mjs must exist');
  const askContent = readFileSync(askPath, 'utf8');
  assert.match(
    askContent,
    /反引号代码与加粗组合时写为\s*\*\*\\?`Code\\?`\*\*/,
    'server/ask.mjs system prompt must guide model to use **`Code`**'
  );
});

test('2. Markdown rendering: Bold inline code inside Chinese text parses cleanly without raw asterisks', () => {
  // Replicate preprocessMarkdown from InkAsk.astro
  function preprocessMarkdown(src) {
    if (!src) return '';
    let text = src.replace(/\r\n?/g, '\n');

    // 1. 中文圆点列表符
    text = text.replace(/^[ \t]*[•·][ \t]+/gm, '- ');

    // 2. 补齐孤立未闭合粗体
    const lines = text.split('\n');
    let inCodeFence = false;
    text = lines.map((line) => {
      if (/^\s*```/.test(line)) {
        inCodeFence = !inCodeFence;
        return line;
      }
      if (inCodeFence) return line;
      const stars = (line.match(/\*\*/g) || []).length;
      if (stars % 2 === 1) {
        return line + '**';
      }
      return line;
    }).join('\n');

    // 3. 粗体代码转换
    text = text.replace(/\*\*\s*(`[^`\n]+`)\s*\*\*/g, '<strong>$1</strong>');

    // 4. 清理粗体内部多余空格（不注入外侧空格）
    text = text.replace(/\*\*([^\n]+?)\*\*/g, (match, inner) => {
      const trimmed = inner.trim();
      return trimmed ? `**${trimmed}**` : match;
    });

    // 5. 清理连续水平空格
    text = text.replace(/[ \t]{2,}/g, ' ');

    return text;
  }

  // Case A: Bold inline code in Chinese text (the reported bug)
  const inputA = '为什么必须用**`CreateDefaultSubobject`**？';
  const htmlA = marked.parse(preprocessMarkdown(inputA)).trim();
  assert.ok(!htmlA.includes('**'), 'Must not leave raw asterisks in rendered output');
  assert.ok(htmlA.includes('<strong><code>CreateDefaultSubobject</code></strong>'), 'Must render as <strong><code>...</code></strong>');
  assert.strictEqual(htmlA, '<p>为什么必须用<strong><code>CreateDefaultSubobject</code></strong>？</p>');

  // Case B: Bold inline code with internal spaces
  const inputB = '为什么必须用** `CreateDefaultSubobject` **？';
  const htmlB = marked.parse(preprocessMarkdown(inputB)).trim();
  assert.ok(!htmlB.includes('**'));
  assert.strictEqual(htmlB, '<p>为什么必须用<strong><code>CreateDefaultSubobject</code></strong>？</p>');

  // Case C: Standard Chinese bold text (should NOT inject extra spaces around Chinese text)
  const inputC = '这是**关键结论**部分。';
  const htmlC = marked.parse(preprocessMarkdown(inputC)).trim();
  assert.strictEqual(htmlC, '<p>这是<strong>关键结论</strong>部分。</p>');

  // Case D: Bold text with leading/trailing spaces inside asterisks
  const inputD = '这是 ** 内部带空格 ** 测试。';
  const htmlD = marked.parse(preprocessMarkdown(inputD)).trim();
  assert.ok(htmlD.includes('<strong>内部带空格</strong>'));

  // Case E: Multiple bold code occurrences in one line
  const inputE = '请对比**`UObject`**和**`AActor`**的生命周期。';
  const htmlE = marked.parse(preprocessMarkdown(inputE)).trim();
  assert.strictEqual(htmlE, '<p>请对比<strong><code>UObject</code></strong>和<strong><code>AActor</code></strong>的生命周期。</p>');
});
