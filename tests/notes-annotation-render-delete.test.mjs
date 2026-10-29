import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const rootDir = path.resolve(import.meta.dirname, '..');
const notes = fs.readFileSync(path.join(rootDir, 'src/pages/notes.astro'), 'utf-8');

// renderMarkdown 的 sanitize 依赖浏览器 DOM，node 环境下用 jsdom 顶替
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;

test('划线批注：卡片与阅读大窗都按保存的 Markdown 渲染原文，而不是 escapeHtml 压平 rawText', () => {
  const readerRender = /<div class="reader-quote-body prose-preview">\$\{renderNoteMarkdown\(highlightMarkdown\(note\)\)\}/;
  const cardRender = /<div class="note-card-quote-body prose-preview">\$\{renderNoteMarkdown\(highlightMarkdown\(note\)\)\}/;

  assert.match(notes, readerRender, '阅读大窗必须用 renderNoteMarkdown(highlightMarkdown(note)) 渲染划线原文');
  assert.match(notes, cardRender, '笔记卡片必须用 renderNoteMarkdown(highlightMarkdown(note)) 渲染划线原文');
  assert.ok(
    !notes.includes('“${escapeHtml(quoteText(note))}”'),
    '划线原文不能再 escapeHtml 成一段斜体长句：代码块、行内代码与换行会全部塌成一行'
  );
  assert.ok(
    notes.includes("const markdown = String(item.markdown || item.text || '').trim() || quoteText(item);"),
    'highlightMarkdown 必须优先取 note.markdown / note.text，再回退 quoteText'
  );
  assert.ok(
    notes.includes('const lead = /^#{1,6}[ \\t]+([^\\n]+)\\n?/.exec(markdown);'),
    '选区从标题开始时，必须去掉与大窗标题重复的首行标题，避免正文开头重复一遍'
  );
});

test('划线原文渲染：加粗、行内代码、围栏代码块与标题层级都完整保留', async () => {
  const { renderMarkdown } = await import('../src/utils/inkAskMarkdown.ts');

  const source = [
    '## 1. 原生单播委托 (Native Single-cast Delegate)',
    '',
    '**核心宏：** `DECLARE_DELEGATE(...)`、`DECLARE_DELEGATE_RetVal(...)`；',
    '',
    '```cpp',
    'DECLARE_DELEGATE_RetVal_OneParam(bool, FCheckCanAttackDelegate, float /* AttackRange */);',
    '```',
  ].join('\n');

  const html = renderMarkdown(source, { heading: 'h' });
  assert.match(html, /<h2 class="ink-ask-h md-heading">1\. 原生单播委托/);
  assert.match(html, /<strong>核心宏：<\/strong>/);
  assert.match(html, /<code>DECLARE_DELEGATE\(\.\.\.\)<\/code>/);
  assert.match(html, /<pre><code class="language-cpp">/);
  assert.match(html, /FCheckCanAttackDelegate/);
  assert.ok(!html.includes('```'), '围栏标记必须被消费成代码块，不能以裸文本漏出');
});

test('删除：统一自绘确认弹层，不再使用浏览器原生 confirm / 失效的两次点击确认', () => {
  assert.ok(notes.includes('id="delete-confirm-modal"'), '缺少统一确认弹层 DOM');
  assert.ok(notes.includes('function requestDeleteConfirm'), '缺少 requestDeleteConfirm 确认入口');
  assert.ok(!notes.includes('is-confirming'), '卡片删除不能依赖会被 className 覆盖的 is-confirming 二次确认');
  assert.ok(
    !notes.includes("window.confirm('确定要删除这条笔记吗"),
    '删除确认不能再用浏览器原生 window.confirm（卡片与阅读大窗都必须走自绘弹层）'
  );

  // 卡片删除与阅读大窗删除都必须先 await 确认结果，再执行删除
  assert.match(notes, /requestDeleteConfirm\(target\)\.then\(\(ok\) => \{[\s\S]*?performDeleteCard\(id\);/, '卡片删除必须在确认后执行');
  assert.match(notes, /requestDeleteConfirm\(target\)\.then\(\(ok\) => \{[\s\S]*?closeReaderModal\(\);[\s\S]*?performDeleteCard\(id\);/, '阅读大窗删除必须在确认后关闭弹层并删除卡片');
});
