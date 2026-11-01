import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('墨问 AI 问答大容量字数限制与温和计数提示验证 (InkAsk Capacity & Word Limits Suite)', () => {
  const rootDir = process.cwd();
  const inkAskPath = path.join(rootDir, 'src/components/InkAsk.astro');
  const serverAskPath = path.join(rootDir, 'server/ask.mjs');

  it('1. 服务端配置: 选区上限 1200 字，提问上限 2000 字，请求体 128KB 防爆仓', () => {
    assert.ok(fs.existsSync(serverAskPath), 'server/ask.mjs 必须存在');
    const content = fs.readFileSync(serverAskPath, 'utf8');

    assert.match(
      content,
      /const LIMITS = \{ selection: 1200, question: 2000, anchor: 64, body: 128 \* 1024 \};/,
      '服务端 LIMITS 必须放宽至 1200 字选区、2000 字提问、128KB 请求体'
    );
    assert.match(
      content,
      /maxTokens:\s*positive\('AI_MAX_TOKENS',\s*8192\)/,
      'AI 回复 maxTokens 必须默认放宽至 8192 tokens，支持超长深度输出'
    );
    assert.match(
      content,
      /Math\.max\(2000,\s*config\.questionLimit \|\| 2000\)/,
      '提问长度硬校验下限必须提升到 2000 字'
    );
    assert.match(
      content,
      /tidy\(h\.content\)\.slice\(0,\s*3000\)/,
      '历史上下文单条保留长度必须放宽至 3000 字'
    );
  });

  it('2. 前端规范: 选区上限 1200 字，卡片与抽屉输入框统一放宽至 2000 字', () => {
    assert.ok(fs.existsSync(inkAskPath), 'InkAsk.astro 必须存在');
    const content = fs.readFileSync(inkAskPath, 'utf8');

    assert.match(
      content,
      /const MAX_SELECTION = 1200;/,
      '前端选区最大字符数必须为 1200'
    );
    assert.match(
      content,
      /<textarea class="ink-ask-input"[^>]*?maxlength="2000"/,
      '划词浮动卡片输入框 maxlength 必须为 2000'
    );
    assert.match(
      content,
      /<textarea class="ink-ask-drawer-input"[^>]*?maxlength="2000"/,
      '抽屉侧边栏输入框 maxlength 必须为 2000'
    );
  });

  it('3. 字数提示交互: 平时极简隐藏，超过 80% (1600 字) 时温和显示剩余字数', () => {
    const content = fs.readFileSync(inkAskPath, 'utf8');

    assert.ok(content.includes('function updateCharCount'), '必须实现 updateCharCount 温和提示逻辑');
    assert.ok(content.includes('len >= 1600'), '必须在输入字符达到 1600 字（80%）以上才唤醒提示');
    assert.ok(content.includes('还可输入') && content.includes('已达 2000 字上限'), '必须具备人性化剩余字数与触顶提示');
    assert.ok(content.includes('ink-ask-char-count'), '必须挂载 ink-ask-char-count 元素');

    // 样式断言
    assert.match(
      content,
      /\.ink-ask-char-count\s*\{[\s\S]*?display:\s*none;/,
      '平时字数提示器必须 display: none 保持纯粹书斋美学'
    );
    assert.match(
      content,
      /\.ink-ask-char-count\.is-visible\s*\{[\s\S]*?display:\s*inline-flex;/,
      '唤醒状态必须 inline-flex 显示'
    );
    assert.match(
      content,
      /\.ink-ask-char-count\.is-limit\s*\{[\s\S]*?color:\s*var\(--vermilion\);/,
      '超限必须采用朱砂红醒目提示'
    );
  });
});
