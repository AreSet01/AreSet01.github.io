import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('墨问伴读气泡输入重排与取消划线连贯 0.4x FLIP 动效验证', () => {
  const rootDir = process.cwd();

  it('1. ArticleSelectionDock: 卡片右上角展开按钮纯箭头微按钮无冗余汉字', () => {
    const dockPath = path.join(rootDir, 'src/components/ArticleSelectionDock.astro');
    assert.ok(fs.existsSync(dockPath), 'ArticleSelectionDock.astro 必须存在');
    const content = fs.readFileSync(dockPath, 'utf8');

    // 确保 expandIndicator 仅包含箭头 SVG，不带冗余文字
    assert.ok(content.includes("notes-card-expand-indicator"), '必须包含纯微按钮类名');
    assert.ok(!content.includes('notes-expand-text'), '右上角微按钮中绝不可出现 notes-expand-text 展开/收起冗余汉字');
    assert.ok(content.includes('.notes-card-expand-indicator svg'), '必须具备箭头旋转动画规则');
    assert.ok(content.includes('.notes-item-card.is-expanded .notes-card-expand-indicator svg'), '展开态必须平滑旋转 180°');
  });

  it('2. ArticleSelectionDock: 取消划线正文平滑褪色淡出与 0.4x 优雅慢调节奏', () => {
    const dockPath = path.join(rootDir, 'src/components/ArticleSelectionDock.astro');
    const content = fs.readFileSync(dockPath, 'utf8');

    // 正文高亮渐隐
    assert.ok(content.includes('function fadeOutAndRemoveHighlight(id: string)'), '必须包含正文高亮渐隐淡出函数');
    assert.ok(content.includes('duration: 550'), '正文高亮褪色必须使用 0.4x 呼吸感节奏 (约 550ms)');
    assert.ok(content.includes('removeHighlightFromDOM(id, prose)'), '淡出完成后解包恢复纯文本节点');
  });

  it('3. ArticleSelectionDock: 目标卡片纯视觉滑出淡出不提前折叠高度，杜绝多次重复重排', () => {
    const dockPath = path.join(rootDir, 'src/components/ArticleSelectionDock.astro');
    const content = fs.readFileSync(dockPath, 'utf8');

    // 验证 smoothRemoveNoteCard 中不改变 maxHeight / padding / margin
    const smoothRemoveFnMatch = content.match(/function smoothRemoveNoteCard[\s\S]*?^    \}/m);
    assert.ok(smoothRemoveFnMatch, '必须找到 smoothRemoveNoteCard 函数');
    const fnBody = smoothRemoveFnMatch[0];

    assert.ok(!fnBody.includes("maxHeight: '0px'"), '退场动画绝不能提前折叠 maxHeight 为 0px 导致其余卡片提前塌陷');
    assert.ok(!fnBody.includes("paddingTop: '0px'"), '退场动画绝不能提前压缩 paddingTop 产生抖动');
    assert.ok(fnBody.includes('duration: 450'), '卡片淡出时长应为 450ms');

    // 验证在淡出完成之后才获取其余卡片的物理坐标
    assert.ok(content.includes('targetCard.remove();') && content.includes('renderDrawerNotes({ retainedFirstRects });'),
      '必须在淡出完成并捕获坐标后才移除并重排');
    assert.ok(content.includes('transform 650ms cubic-bezier(0.16, 1, 0.3, 1)'),
      'FLIP 补位动画过渡时长应设为 650ms 优雅节奏');
  });

  it('4. InkAsk: 彻底移除贯穿死板底栏背景与边框，通透沉底', () => {
    const inkAskPath = path.join(rootDir, 'src/components/InkAsk.astro');
    assert.ok(fs.existsSync(inkAskPath), 'InkAsk.astro 必须存在');
    const content = fs.readFileSync(inkAskPath, 'utf8');

    // 表单容器透明沉底
    assert.ok(content.includes('.ink-ask-drawer-form {') && content.includes('background: transparent;'),
      '抽屉底部表单必须使用透明背景沉底，彻底移除死板底栏底板');
    assert.ok(content.includes('border-top: none;'), '抽屉底部表单必须移除 border-top 贯穿分割线');
    assert.ok(content.includes('.ink-ask-drawer.is-maximized .ink-ask-drawer-form') &&
              content.includes('background: transparent !important;'),
      '全屏模式下同样移除死板底栏背景');
  });

  it('5. InkAsk: 东方书斋空状态 2×2 典雅题签 + 对话态输入框上方单色细线追问胶囊，零彩色 Emoji', () => {
    const inkAskPath = path.join(rootDir, 'src/components/InkAsk.astro');
    const content = fs.readFileSync(inkAskPath, 'utf8');

    // DOM 结构：chips-row 在 form-inner 内部且在 input-wrap 上方，空状态隐藏防重复，对话开启后浮现
    assert.ok(content.includes('ink-ask-drawer-chips-row'), '表单内必须包含追问小胶囊行容器');
    assert.ok(content.includes('ink-ask-mini-chip'), '小胶囊类名必须为 ink-ask-mini-chip');
    assert.ok(content.includes('.ink-ask-drawer:not(.has-turns) .ink-ask-drawer-chips-row'),
      '空状态已有 2×2 典雅题签时自动收起底部同质胶囊');

    const formHtmlIndex = content.indexOf('<form class="ink-ask-drawer-form"');
    const chipsRowIndex = content.indexOf('ink-ask-drawer-chips-row', formHtmlIndex);
    const inputWrapIndex = content.indexOf('ink-ask-drawer-input-wrap', chipsRowIndex);
    assert.ok(chipsRowIndex !== -1 && inputWrapIndex !== -1 && chipsRowIndex < inputWrapIndex,
      '小胶囊行必须排布在输入框的正上方紧邻处');

    // 东方书斋空状态双框朱印与 2×2 题签卡片，且全组件彻底清除彩色 Emoji
    assert.ok(content.includes('ink-ask-welcome-seal') && content.includes('ink-ask-prompt-card'),
      '空状态必须包含书斋朱印与 2×2 典雅导读题签卡片');
    for (const emoji of ['💡', '🔍', '🛠️', '🎯', '✏️', '💬']) {
      assert.ok(!content.includes(emoji), `InkAsk 中不得再残留彩色系统 Emoji (${emoji})，统一使用单色细线 SVG`);
    }
  });

  it('6. InkAsk: 输入框采用居中对称悬浮宣纸输入台，彻底告别偏右歪斜气泡与底角碰撞', () => {
    const inkAskPath = path.join(rootDir, 'src/components/InkAsk.astro');
    const content = fs.readFileSync(inkAskPath, 'utf8');

    assert.match(
      content,
      /\.ink-ask-drawer-form-inner \{[\s\S]{0,240}?max-width: 720px;[\s\S]{0,120}?margin: 0 auto;/,
      '表单内层必须采用 720px 居中阅读中轴'
    );
    assert.match(
      content,
      /\.ink-ask-drawer-input-wrap \{[\s\S]{0,260}?margin: 0 auto;[\s\S]{0,200}?border-radius: 14px;/,
      '输入框必须采用四边对称 14px 圆角的居中悬浮宣纸输入台'
    );
  });

  it('7. InkAsk: 回复输出彻底移除 blur/opacity 动画，杜绝普通情况闪一下与缓存情况闪两下', () => {
    const inkAskPath = path.join(rootDir, 'src/components/InkAsk.astro');
    const content = fs.readFileSync(inkAskPath, 'utf8');

    // 验证 is-answering 绝不使用导致首字模糊闪烁的 inkAnswerIn 动画
    assert.ok(!content.includes('animation: inkAnswerIn'), '绝不能再使用带有 opacity:0 与 blur 的 inkAnswerIn 动画');
    assert.ok(content.includes('.ink-ask-turn.is-answering .ink-ask-answer {\n    /* 彻底移除 inkAnswerIn 的 opacity 0 与 filter blur') ||
              content.includes('.ink-ask-turn.is-answering .ink-ask-answer'), 'is-answering answer 容器应静止稳定');

    // 验证 is-cached 绝不再次触发导致二次闪烁的 ink-ask-surface
    assert.ok(!content.includes('.ink-ask-turn.is-cached .ink-ask-answer {\n    animation: ink-ask-surface'),
      '缓存状态下绝不能对文字内容重演 ink-ask-surface (opacity 0) 动画导致二次闪烁');
  });

  it('8. ArticleSelectionDock: 正文划线水墨笔意 (Ink-Sweep) 与抽屉新卡片 FLIP 让位杜绝旧卡闪屏', () => {
    const dockPath = path.join(rootDir, 'src/components/ArticleSelectionDock.astro');
    const content = fs.readFileSync(dockPath, 'utf8');

    // 正文划线水墨笔刷入场规则
    assert.ok(content.includes('mark.article-highlight-mark.is-drawing'), '正文划线必须具备 is-drawing 水墨笔触类');
    assert.ok(content.includes('animation: inkSweepDraw 450ms'), '划线笔刷必须具备 450ms 优雅水墨舒展关键帧');
    assert.ok(content.includes('@keyframes inkSweepDraw'), '必须定义 inkSweepDraw 水墨笔刷下笔展开关键帧');
    assert.ok(content.includes('--mark-sweep-line') && content.includes('--mark-sweep-bg'), '必须支持多主题自适应水墨颜色令牌');

    // 抽屉卡片防闪烁与 FLIP 让位
    assert.ok(content.includes('captureDrawerCardRects'), '必须包含捕获抽屉卡片初始物理矩形的函数');
    assert.ok(content.includes('renderDrawerNotes({ retainedFirstRects, newNoteId: newRecord.id })'),
      '新增划线时若抽屉打开必须带入 retainedFirstRects 与 newNoteId');
    assert.ok(content.includes('isNewSingleCard'), '新增单张卡片入场与旧卡片 FLIP 下移让位分流处理');
  });
});
