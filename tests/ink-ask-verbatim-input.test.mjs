import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const inkAskPath = path.join(rootDir, 'src/components/InkAsk.astro');
const serverAskPath = path.join(rootDir, 'server/ask.mjs');

test('InkAsk Verbatim Input & Complete Text Display Suite', async (t) => {
  const inkAskContent = fs.readFileSync(inkAskPath, 'utf8');
  const serverAskContent = fs.readFileSync(serverAskPath, 'utf8');

  await t.test('1. InkAsk: 引用框完整显示文字，彻底移除 -webkit-line-clamp: 3 与截断', () => {
    // 确认已彻底移除 -webkit-line-clamp: 3
    assert.ok(
      !inkAskContent.includes('-webkit-line-clamp: 3'),
      'InkAsk 必须彻底移除 -webkit-line-clamp: 3，杜绝字符被下切截断'
    );
    // 确认拥有 white-space: pre-wrap 与 max-height / overflow-y 滚动支持
    assert.match(
      inkAskContent,
      /\.ink-ask-quote\s*\{[\s\S]*?white-space:\s*pre-wrap;[\s\S]*?overflow-y:\s*auto;/,
      'InkAsk 引用块必须支持 pre-wrap 换行与 auto 滚动'
    );
  });

  await t.test('2. InkAsk: 卡片打开时禁止直接发起自动提问 (不再自动调用 ask(s))', () => {
    // 确认 open(range, root) 结尾不再调用 card.focus() + ask(s)
    assert.ok(
      !inkAskContent.includes('card.focus({ preventScroll: true });\n    ask(s);') &&
      !inkAskContent.includes('card.focus({ preventScroll: true });\r\n    ask(s);'),
      'InkAsk 打开时不得自动触发 ask(s)'
    );
  });

  await t.test('3. InkAsk: 选中文本原封不动填入输入聊天框，并自动聚焦与定位光标于末尾', () => {
    // 验证原封不动填充 value
    assert.match(
      inkAskContent,
      /s\.input\.value\s*=\s*textToPaste;/,
      'InkAsk 必须将选中文本原封不动填入输入框'
    );
    // 验证光标定位至末尾供用户无缝追加
    assert.match(
      inkAskContent,
      /s\.input\.setSelectionRange\(s\.input\.value\.length,\s*s\.input\.value\.length\);/,
      'InkAsk 必须将光标定位至文本末尾，方便用户直接添加提问'
    );
  });

  await t.test('4. InkAsk: 聊天框升级为支持多行与按键智能响应的 textarea', () => {
    // 验证 textarea 结构
    assert.match(
      inkAskContent,
      /<textarea class="ink-ask-input"/,
      'InkAsk 输入框必须为 textarea 控件以便展示多行选文'
    );
    // 验证 Enter 发送与 Shift+Enter 换行逻辑
    assert.match(
      inkAskContent,
      /if\s*\(e\.key === 'Enter' && !e\.shiftKey && !e\.isComposing\)\s*\{[\s\S]*?s\.form\.requestSubmit\(\);/,
      'InkAsk 必须实现回车发送、Shift+回车换行与输入法合成防误触'
    );
  });

  await t.test('5. server/ask.mjs: 原封不动发送选文时平滑兼容且字数上限支持大段选区', () => {
    assert.match(
      serverAskContent,
      /const isDefault = !question \|\| \(selection && question\.trim\(\) === selection\.trim\(\)\);/,
      'server/ask.mjs 必须兼容原封不动发送选文时触发默认优质通俗解读'
    );
  });
});
