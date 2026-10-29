import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  SPLITTER_WIDTH,
  clampSplitRatio,
  ratioFromPointer,
  nudgeSplitRatio,
  parseStoredRatio,
  splitRatioCssValue,
  splitCapability,
  minSplitRatioForViewport,
  maxSplitRatioForViewport,
  COMPANION_WIDE_BREAKPOINT,
  COMPANION_DESKTOP_BREAKPOINT,
} from '../src/utils/companionSplit.ts';

const rootDir = process.cwd();
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

/* ------------------------------------------------------------------ 1. 数学 */
test('1. 并排比例数学：拖拽换算、区间钳制、比例持久化与视口能力判定', () => {
  assert.equal(clampSplitRatio(-1), 0.26, '比例不得低于 26%，否则一侧无法阅读');
  assert.equal(clampSplitRatio(9), 0.74, '比例不得高于 74%');
  assert.equal(clampSplitRatio(Number.NaN), 0.5, '脏数据必须安全退回 50%');
  assert.equal(clampSplitRatio(0.5), 0.5);

  // 指针落在视口正中（含留白画框边距 framePad）→ 约 50%
  const mid = ratioFromPointer(1725 / 2, 1725);
  assert.ok(Math.abs(mid - 0.5) < 0.005, `正中拖拽应接近 50%，实际 ${mid}`);
  const framedMid = ratioFromPointer(1725 / 2, 1725, 14, 16);
  assert.ok(Math.abs(framedMid - 0.5) < 0.005, `画框边距下正中拖拽同样接近 50%，实际 ${framedMid}`);

  // 贴着左右边缘 → 被钳制在 26% / 74%
  assert.equal(ratioFromPointer(0, 1600), 0.26);
  assert.equal(ratioFromPointer(1600, 1600), 0.74);

  assert.equal(nudgeSplitRatio(0.5, 0.02), 0.52, '方向键微调步长 2%');
  assert.equal(nudgeSplitRatio(0.73, 0.02), 0.74, '微调同样要夹在合法区间');

  assert.equal(parseStoredRatio('0.62'), 0.62);
  assert.equal(parseStoredRatio('5'), 0.74, '越界的存储值要夹回来');
  assert.equal(parseStoredRatio('oops'), null, '脏数据返回 null 由调用方兜底');
  assert.equal(parseStoredRatio(null), null);
  assert.equal(parseStoredRatio(''), null);

  assert.equal(splitRatioCssValue(0.618), '0.618', 'CSS 变量必须是无单位数字');

  assert.deepEqual(splitCapability(1725), { desktop: true, split: true, autoSplitOnRail: false });
  assert.deepEqual(splitCapability(COMPANION_WIDE_BREAKPOINT - 100), {
    desktop: true,
    split: true,
    autoSplitOnRail: true,
  });
  assert.deepEqual(splitCapability(COMPANION_DESKTOP_BREAKPOINT - 1), {
    desktop: false,
    split: false,
    autoSplitOnRail: false,
  });
  assert.equal(SPLITTER_WIDTH, 14, '分隔条宽度需与 CSS 中的 14px 保持一致');

  // 窄屏下限：1024px 时 26% 只有 262px，必须按 320px 反推出更高的比例下限
  assert.ok(minSplitRatioForViewport(1024) > 0.26, '1024px 下最小比例必须高于 26%');
  assert.ok(Math.abs(minSplitRatioForViewport(1024) - 320 / (1024 - 14)) < 1e-9, '下限按 320px 面板宽度反推');
  assert.equal(minSplitRatioForViewport(1920), 0.26, '宽屏回落到 26%');
  assert.equal(maxSplitRatioForViewport(1024), 1 - minSplitRatioForViewport(1024), '上限与下限对称');
  assert.ok(maxSplitRatioForViewport(1024) < 0.74, '窄屏下最大比例也要相应收紧');
  assert.equal(minSplitRatioForViewport(400), 0.26, '极窄视口安全退化，不产生 >50% 的下限');
});

/* --------------------------------------------------- 2. 协调器组件契约 */
test('2. CompanionLayout：单浮岛互切、去重纯图标工具栏、协同过渡动效与 window.__companion 契约齐备', () => {
  const src = read('src/components/CompanionLayout.astro');

  assert.match(src, /id="companion-overlay"/, '必须渲染画框底景覆盖层');
  assert.match(src, /id="companion-splitter"/, '必须渲染可拖拽分隔条');
  assert.match(src, /role="separator"/, '分隔条必须具备 separator 语义');
  assert.match(src, /aria-orientation="vertical"/, '分隔条为纵向分割');
  assert.match(src, /tabindex="0"/, '分隔条必须可键盘聚焦');

  assert.match(src, /\(window as any\)\.__companion = \{/, '必须暴露 window.__companion');
  for (const api of ['register', 'openFull', 'switchPanel', 'enterSplit', 'leaveToRail', 'togglePeer', 'mode']) {
    assert.match(src, new RegExp(`${api}[,:]`), `__companion 必须提供 ${api}`);
  }

  assert.match(src, /setAttribute\('data-companion-mode', mode\)/, '模式必须写在 <html data-companion-mode>');
  assert.match(src, /removeAttribute\('data-companion-both'\)/, '阅读态必须严格单浮岛，彻底杜绝双浮岛同开挤压正文');
  assert.match(src, /companion-split-ratio/, '分隔条比例必须持久化');
  assert.match(src, /ratio = clampToViewport\(0\.5\);|ratio = 0\.5;/, '双击分隔条必须复位到 50%');

  // 键盘与生命周期
  assert.match(src, /e\.key !== 'Escape' \|\| mode === 'rail'/, 'Esc 在全屏 / 并排时才退回浮岛');
  assert.match(src, /astro:before-swap/, '换页必须清理协调器监听');
  assert.match(src, /internalDepth/, '协调器自身触发的开合事件必须屏蔽回声，避免状态互相覆盖');

  // 头部左侧分段互切器 + 右侧统一纯图标工具栏（彻底移除重复的「收为浮岛」文字胶囊）
  assert.match(src, /className = 'companion-seg'/, '头部左侧必须注入 [墨问 | 笔记 N] 分段切换器');
  assert.match(src, /data-companion-switch="ask"/, '分段切换器必须包含墨问签');
  assert.match(src, /data-companion-switch="notes"/, '分段切换器必须包含笔记签');
  assert.match(src, /data-companion-act="peer"|dataset\.companionAct = 'peer'/, '需要注入纯图标「并排切换」按钮');
  assert.match(src, /companion-toolbar-sep/, '业务按钮与窗口控制按钮之间必须注入细竖线分隔');
  assert.ok(!src.includes("dataset.companionAct = 'restore'"), '绝不得再注入与还原图标功能重复的「收为浮岛」文字按钮');
  assert.match(src, /notes-drawer-maximize-btn/, '笔记「全屏/还原」按钮交给协调器统一调度');
  assert.match(src, /ink-ask-drawer-maximize/, '墨问「全屏/还原」按钮交给协调器统一调度');

  // WAAPI 弹簧协同过渡动效
  assert.match(src, /function runAnim\(/, '并排、全屏与单栏互切必须提供 WAAPI 协同过渡动画');

  const layout = read('src/layouts/PostLayout.astro');
  assert.match(layout, /import CompanionLayout from '\.\.\/components\/CompanionLayout\.astro'/, 'PostLayout 必须引入协调器');
  assert.match(layout, /<CompanionLayout \/>/, 'PostLayout 必须挂载协调器');
});

/* ------------------------------------------------ 3. 两个抽屉的接入点 */
test('3. 笔记 / 墨问抽屉：注册协调器、汇报开合、解除互斥', () => {
  const dock = read('src/components/ArticleSelectionDock.astro');
  const inkAsk = read('src/components/InkAsk.astro');

  assert.match(dock, /companion\.register\('notes', drawer/, '笔记抽屉必须注册到协调器');
  assert.match(dock, /setFull: setNotesMaximized/, '笔记抽屉必须提供目标态全屏能力');
  assert.match(dock, /new CustomEvent\('companion:panel', \{ detail: \{ kind: 'notes'/, '笔记抽屉必须汇报开合');

  assert.match(inkAsk, /companion\.register\('ask', sidebarDrawer/, '墨问抽屉必须注册到协调器');
  assert.match(inkAsk, /setFull: setDrawerMaximized/, '墨问抽屉必须提供目标态全屏能力');
  assert.match(inkAsk, /new CustomEvent\('companion:panel', \{ detail: \{ kind: 'ask'/, '墨问抽屉必须汇报开合');

  // 互斥监听必须消失，改为同步协调
  assert.ok(
    !dock.includes("window.addEventListener('ink-ask:open', closeNotesDrawer"),
    '笔记抽屉不得再因墨问打开而关闭'
  );
  assert.ok(
    !inkAsk.includes("window.addEventListener('article-notes:open', closeSidebar"),
    '墨问抽屉不得再因笔记打开而关闭'
  );
  assert.match(dock, /window\.addEventListener\('ink-ask:open', \(\) => \{[\s\S]{0,120}__companion\?\.sync/, '笔记抽屉应改为同步协调状态');
  assert.match(inkAsk, /window\.addEventListener\('article-notes:open', \(\) => \{[\s\S]{0,120}__companion\?\.sync/, '墨问抽屉应改为同步协调状态');
});

/* ------------------------------------------------ 4. 选区小窗行为 */
test('4. 选区小窗：只认 × 按钮关闭、压在抽屉之上、不被浮岛遮挡', () => {
  const inkAsk = read('src/components/InkAsk.astro');
  const dock = read('src/components/ArticleSelectionDock.astro');

  // 小窗在「点外部」时不再关闭
  assert.ok(
    !/if \(session\) close\(\)/.test(inkAsk),
    '点外部（含点开笔记）不得关闭选区小窗，否则无法边写边看'
  );
  assert.match(inkAsk, /选区小窗只认自己的 × 按钮/, '应保留明确注释说明该交互决策');
  assert.match(inkAsk, /if \(target\?\.closest\?\.\('\.ink-ask-seal, \.ink-ask-card, \.ink-ask-sidebar-trigger, \.ink-ask-drawer'\)\) return;/, '小窗内部点击必须提前放行');

  // Esc 也不再关闭小窗（只认按钮）
  assert.match(inkAsk, /Esc 不再关闭小窗/, 'Esc 不得关闭小窗，仅标题栏 × 有效');

  // 层级：小窗必须高于笔记抽屉（100031）
  const notebookZ = Number((dock.match(/\.article-notes-drawer \{[^}]*z-index:\s*(\d+)/) || [])[1]);
  const cardZ = Number((inkAsk.match(/\.ink-ask-card \{[^}]*z-index:\s*(\d+)/) || [])[1]);
  assert.ok(Number.isFinite(notebookZ) && Number.isFinite(cardZ), '两个层级都必须可解析');
  assert.ok(cardZ > notebookZ, `小窗 z-index（${cardZ}）必须高于笔记抽屉（${notebookZ}）`);
  assert.match(inkAsk, /\.ink-ask-card\.is-maximized \{[\s\S]{0,1400}?z-index: 100061 !important;/, '最大化后仍须在最上层');

  // 浮岛打开时把小窗让到左边
  assert.match(inkAsk, /function clampCardAwayFromRails\(\)/, '必须有「小窗避开浮岛」的让位逻辑');
  assert.match(inkAsk, /clampCard: clampCardAwayFromRails/, '让位逻辑必须暴露给协调器调用');
  assert.match(dock, /__inkAsk\?\.clampCard\?\.\(\)/, '笔记打开时应触发小窗让位');

  // 焦点陷阱不得抢走另一个面板的键盘
  assert.match(inkAsk, /sidebarDrawer\.contains\(active\)/, '抽屉的 Tab 陷阱仅在焦点位于抽屉内时生效');
  assert.match(inkAsk, /session\.card\.contains\(active\)/, '小窗的 Tab 陷阱仅在焦点位于小窗内时生效');
});

/* ------------------------------------------------ 5. 草稿保护 */
test('5. 笔记抽屉全量重绘时的草稿保护（便签正文 / 备注）', () => {
  const dock = read('src/components/ArticleSelectionDock.astro');

  assert.match(dock, /function captureEditorDrafts\(\)/, '重绘前必须抓取草稿');
  assert.match(dock, /function restoreEditorDrafts\(/, '重绘后必须回填草稿');
  assert.match(dock, /const draftSnapshot = captureEditorDrafts\(\);/, 'renderDrawerNotes 必须在清空 DOM 前抓取');
  assert.match(dock, /restoreEditorDrafts\(draftSnapshot(?:,\s*activeBeforeRender)?\);/, 'renderDrawerNotes 必须在渲染后回填');
  assert.match(dock, /activeBeforeRender/, '重绘不得抢走其它面板的焦点，需要记下重绘前的焦点元素');
  assert.match(dock, /function mountNoteComposer\(prefill = '', focusInput = true\)/, '便签编辑器必须支持回填内容且回填时不得抢焦点');
  assert.match(dock, /notes-composer:not\(\.is-closing\)/, '正在关闭的编辑器不应当被当成草稿');
  assert.match(dock, /notes-item-comment-editor:not\(\.is-closing\)/, '正在关闭的备注框不应当被当成草稿');
  assert.match(dock, /\.notes-btn-edit' : '\.notes-btn-comment'/, '回填时需要区分「便签编辑」与「备注编辑」');

  // 抽屉自身开关不得再无条件重绘掉草稿（开抽屉时同样走 capture/restore）
  const openDrawer = dock.slice(dock.indexOf('function openNotesDrawer'), dock.indexOf('function closeNotesDrawer'));
  assert.match(openDrawer, /renderDrawerNotes\(/, '打开抽屉仍会重绘（依赖草稿保护接回）');
});

/* ------------------------------------------------ 6. 样式与几何 */
test('6. global.css：留白画框容器、恒定左墨问·右笔记并排几何、统一 52px 顶栏与单浮岛不变量', () => {
  const css = read('src/styles/global.css');

  assert.match(css, /--companion-frame-pad:/, '必须定义留白画框呼吸边距令牌');
  assert.match(css, /#companion-overlay \{[\s\S]{0,260}?z-index: 100040/, '画框底景覆盖层层级');
  assert.match(css, /#companion-splitter \{[\s\S]{0,360}?z-index: 100052/, '分隔条必须高于两个面板');
  assert.match(
    css,
    /html\[data-companion-mode="split"\] \.article-notes-drawer,\s*\n\s*html\[data-companion-mode="split"\] \.ink-ask-drawer \{[\s\S]{0,800}?z-index: 100050 !important;/,
    '并排时两块面板都必须抬到覆盖层之上并具备 18px 圆角画框'
  );
  // 恒定左墨问 · 右笔记
  assert.match(
    css,
    /html\[data-companion-mode="split"\] \.ink-ask-drawer \{[\s\S]{0,200}?left: var\(--companion-frame-pad\) !important;[\s\S]{0,160}?width: calc\(var\(--companion-split\) \* var\(--companion-inner-w\)\) !important;/,
    '左卷恒为墨问，宽度由比例变量驱动'
  );
  assert.match(
    css,
    /html\[data-companion-mode="split"\] \.article-notes-drawer \{[\s\S]{0,220}?left: calc\(var\(--companion-frame-pad\) \+ var\(--companion-split\) \* var\(--companion-inner-w\) \+ 14px\) !important;/,
    '右卷恒为高亮笔记，紧贴 14px 分隔缝右侧'
  );
  assert.match(css, /html\[data-companion-mode="split"\] \.site-shell > main \{[\s\S]{0,160}?padding-right: clamp\(1\.5rem, 3vw, 2\.5rem\) !important;/, '并排时正文不再让位');

  // 彻底杜绝双浮岛同开把正文挤成窄条，且不得在并排面板写死 transform: none !important 阻断 WAAPI 过渡
  assert.ok(!css.includes('html[data-companion-both="true"]'), '绝不得保留双浮岛同开挤压正文的旧 CSS 规则');
  const splitRuleSlice = css.slice(
    css.indexOf('html[data-companion-mode="split"] .article-notes-drawer'),
    css.indexOf('html[data-companion-mode="split"] .article-notes-drawer-backdrop')
  );
  assert.ok(!splitRuleSlice.includes('transform: none !important'), '并排面板不得写死 transform: none !important 从而阻断 WAAPI 滑入过渡');

  assert.match(css, /height: 52px !important;/, '墨问与笔记必须共享统一 52px 通透顶栏');
  assert.match(css, /\.companion-seg \{/, '必须提供顶部分段切换器样式');
  assert.match(css, /\.companion-act\[hidden\] \{[\s\S]{0,40}?display: none !important;/, '注入按钮必须能被 hidden 隐藏');
  assert.match(css, /body\.companion-resizing \{[\s\S]{0,80}?cursor: col-resize/, '拖拽时全局光标一致');

  assert.match(css, /@media \(max-width: 1023\.98px\) \{[\s\S]{0,400}?\.companion-actions \{[\s\S]{0,60}?display: none !important;/, '手机端不提供并排入口');
});

/* ------------------------------------------------ 7. 独立审查发现项的回归护栏 */
test('7. 审查发现项：换页重入、Esc 守卫、inert、小窗收起、拖拽中断与注册防脏', () => {
  const companion = read('src/components/CompanionLayout.astro');
  const inkAsk = read('src/components/InkAsk.astro');
  const dock = read('src/components/ArticleSelectionDock.astro');
  const css = read('src/styles/global.css');

  // P0：Astro ClientRouter 对同 URL 的 module 脚本只执行一次，必须在 page-load 重建
  assert.match(companion, /function initCompanion\(\): void/, '协调器初始化必须抽成可重入函数');
  assert.match(companion, /astro:page-load/, '必须监听 astro:page-load 重新初始化');
  assert.match(companion, /__areSetCompanionPageLoadBound__/, 'page-load 绑定必须幂等，避免重复挂载');
  assert.match(companion, /\(window as any\)\[CLEANUP_KEY\]\?\.\(\)/, '重入前必须执行上一次 cleanup');

  // Esc：输入法组词 / 输入框内不得拆掉并排
  assert.match(companion, /e\.isComposing/, 'Esc 必须忽略输入法组词状态');
  assert.match(companion, /closest\?\.\('input, textarea, select, \[contenteditable="true"\]'\)/, 'Esc 在输入框 / 可编辑区内不得拆布局');

  // 正文 inert：覆盖层后面不该还能 Tab 进去
  assert.match(companion, /main\.setAttribute\('inert', ''\)/, '全屏 / 并排时正文必须 inert');

  // 小窗在非 rail 模式下必须收起（它 z-index 高于覆盖层）
  assert.match(
    css,
    /html\[data-companion-mode="notes-full"\] \.ink-ask-card,[\s\S]{0,260}?display: none !important;/,
    '全屏 / 并排时旧的选区小窗必须收起'
  );

  // 让位不能被正文重排冲掉
  assert.match(inkAsk, /浮岛打开时保持让位/, 'place() 结束后必须重新让位一次');

  // 拖拽中断收尾
  assert.match(companion, /pointercancel/, '必须处理 pointercancel');
  assert.match(companion, /lostpointercapture/, '必须处理 lostpointercapture');
  assert.match(companion, /window\.addEventListener\('blur'/, '窗口失焦也要收尾拖拽');

  // 注册防脏：旧页面延迟注册不得进入新协调器
  assert.match(companion, /if \(!el \|\| !el\.isConnected\) return;/, '协调器必须忽略已脱离文档的面板');
  assert.match(inkAsk, /if \(!sidebarDrawer\?\.isConnected\) return;/, '墨问注册重试必须检查节点是否仍在文档中');
  assert.match(dock, /signal\.aborted\) return;/, '笔记注册重试必须能被页面清理中断');

  // 关闭定时器竞态
  assert.match(dock, /if \(drawer\.classList\.contains\('is-open'\)\) return;/, '340ms 关闭回调必须让位于重新打开');

  // 重绘不重置滚动
  assert.match(dock, /if \(prevScrollTop > 0\) \{\s*drawerList\.scrollTop = prevScrollTop;/, '抽屉重绘后必须恢复滚动位置');

  // openFull 不要对已打开面板重复 open（会多一次全量重绘）
  assert.match(companion, /if \(!target\.api\.isOpen\(\)\) \{\s*target\.api\.open\(\{ silent: true \}\);\s*\}/, '已打开的面板不要再 open 一次');
});
