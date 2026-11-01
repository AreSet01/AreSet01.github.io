import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('墨问 AI 问答提问撤回与防误触机制验证 (InkAsk Recall & Accidental Send Protection)', () => {
  const rootDir = process.cwd();
  const inkAskPath = path.join(rootDir, 'src/components/InkAsk.astro');

  it('1. DOM 结构: 抽屉与选区卡片输入区均内嵌专属「撤回」按钮', () => {
    assert.ok(fs.existsSync(inkAskPath), 'InkAsk.astro 必须存在');
    const content = fs.readFileSync(inkAskPath, 'utf8');

    assert.ok(content.includes('ink-ask-drawer-recall'), '抽屉输入框右侧必须包含撤回按钮');
    assert.ok(content.includes('ink-ask-recall'), '选区卡片输入框右侧必须包含撤回按钮');
    assert.ok(content.includes('ICON_RECALL'), '必须定义专属撤回 (Undo) 矢量图标');
  });

  it('2. 气泡交互: 用户提问气泡具备轻量淡雅的撤回操作按钮与独立头栏防文字挤压', () => {
    const content = fs.readFileSync(inkAskPath, 'utf8');

    assert.ok(content.includes('ink-ask-q-recall'), '提问气泡内必须包含撤回按钮');
    assert.ok(content.includes('ink-ask-q-head'), '提问气泡必须具备独立的顶部头栏容器避免挤压文字');
    assert.ok(content.includes('dataset.question') || content.includes('data-question'), '每一轮 turn 必须挂载原问题文本以便精准撤回回填');
  });

  it('3. 撤回逻辑: 终止推演流、移除会话轮次、回填输入框并聚焦定位光标', () => {
    const content = fs.readFileSync(inkAskPath, 'utf8');

    // 抽屉撤回函数
    assert.ok(content.includes('function recallDrawerTurn'), '必须实现 recallDrawerTurn 撤回逻辑');
    assert.ok(content.includes('sidebarController.abort()'), '撤回时必须立即终止正在进行的网络请求');
    assert.ok(content.includes('targetTurn.classList.add(\'is-recalling\')'), '撤回必须具备平滑过渡动画');
    assert.ok(content.includes('textarea.value = textToRestore'), '撤回必须将问题文本原封不动填回输入框');
    assert.ok(content.includes('textarea.focus('), '撤回后必须重新聚焦输入框');

    // 选区卡片撤回函数
    assert.ok(content.includes('function recallSessionTurn'), '必须实现 recallSessionTurn 撤回逻辑');
  });

  it('4. 防误触机制: IME 中文输入法 Enter 键选词竞态时间戳保护', () => {
    const content = fs.readFileSync(inkAskPath, 'utf8');

    assert.ok(
      content.includes('lastCompositionEndTime') && content.includes('Date.now() - lastCompositionEndTime < 60'),
      '抽屉输入框必须具备输入法合成结束时间戳防误触保护'
    );
    assert.ok(
      content.includes('sessionCompositionEndTime') && content.includes('Date.now() - sessionCompositionEndTime < 60'),
      '选区小卡片输入框必须具备输入法合成结束时间戳防误触保护'
    );
  });

  it('5. 快捷键支持: 生成态按下 Escape 键拦截并执行撤回', () => {
    const content = fs.readFileSync(inkAskPath, 'utf8');

    assert.match(
      content,
      /if\s*\(sidebarController\)\s*\{[\s\S]*?recallActiveDrawerTurn\?\.\(\);[\s\S]*?return;[\s\S]*?\}/,
      '抽屉生成态按 Esc 键必须优先执行撤回而不是关闭侧栏'
    );
    assert.match(
      content,
      /if\s*\(session\.controller\)\s*\{[\s\S]*?recallSessionTurn\(session\);[\s\S]*?return;[\s\S]*?\}/,
      '选区小卡片生成态按 Esc 键必须优先执行撤回'
    );
  });

  it('6. 视觉规范: 提问中自动替换发送按钮为呼吸撤回胶囊，淡雅不刺眼', () => {
    const content = fs.readFileSync(inkAskPath, 'utf8');

    assert.ok(
      content.includes('.ink-ask-drawer-form.is-busy .ink-ask-drawer-send') &&
      content.includes('display: none !important;'),
      '生成态必须隐藏默认问字发送按钮'
    );
    assert.ok(
      content.includes('.ink-ask-drawer-form.is-busy .ink-ask-drawer-recall') &&
      content.includes('display: inline-flex;'),
      '生成态必须显式展开撤回按钮'
    );
    assert.ok(
      content.includes('.ink-ask-turn.is-recalling'),
      '必须具备 is-recalling 撤回退场动画样式'
    );
  });
});
