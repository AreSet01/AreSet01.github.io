import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('侧边栏磁吸健壮性、全主题选中态与笔记动效迭代验证', () => {
  const rootDir = process.cwd();

  it('1. BaseLayout: 侧边栏搜索栏与磁吸控件具备多次交互不失效与零漂移物理坐标', () => {
    const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');
    assert.ok(fs.existsSync(baseLayoutPath), 'BaseLayout.astro 必须存在');
    const content = fs.readFileSync(baseLayoutPath, 'utf8');

    assert.ok(content.includes('initMagneticButtons()'), '首屏必须主动执行 initMagneticButtons 初始化');
    assert.ok(content.includes('__magneticBound'), '磁吸绑定必须具备 __magneticBound 幂等保护，杜绝事件重复堆叠');
    assert.ok(content.includes('pointerenter') && content.includes('pointermove') && content.includes('pointerleave'),
      '磁吸微动必须监听 pointer 事件族群，确保桌面微距指针稳定');
    assert.ok(content.includes('pointercancel'), '磁吸必须监听 pointercancel，防止指针拖拽中断后卡死');
    assert.ok(content.includes('updateRestCenter'), '必须具备动态更新基准静止中心的机制，彻底解决多次拖动/悬停后失效的问题');
    assert.ok(content.includes("gsap.getProperty(el, 'x')"), '必须通过当前位移实时反解原点，避免回弹中二次交互发生位置累积漂移');
    assert.ok(content.includes('.nav-search-trigger'), '磁吸元素选择器必须覆盖侧边栏搜索触发按钮');
  });

  it('2. global.css: 文本选中态全配色覆盖与代码块高对比度高亮适配', () => {
    const cssPath = path.join(rootDir, 'src/styles/global.css');
    assert.ok(fs.existsSync(cssPath), 'global.css 必须存在');
    const css = fs.readFileSync(cssPath, 'utf8');

    // 基础主题覆盖
    assert.ok(css.includes('::selection'), '必须包含默认（浅色/宣纸）::selection 规则');
    assert.ok(css.includes('[data-theme="dark"] ::selection'), '必须包含深色模式 ::selection 规则');
    assert.ok(css.includes('[data-theme="moss"] ::selection'), '必须包含绿粉模式 ::selection 规则');
    assert.ok(css.includes('[data-theme="rice"] ::selection'), '必须包含暖宣纸模式 ::selection 规则');

    // 代码块高辨识度适配（无论何种主题，代码块深色背景均不可变黑模糊）
    assert.ok(css.includes('pre ::selection') && css.includes('code::selection'), '必须为代码块单独定义高辨识度选中态');
    assert.ok(css.includes('[data-theme="dark"] pre ::selection'), '深色模式代码块选中态必须特异化适配');
    assert.ok(css.includes('[data-theme="moss"] pre ::selection'), '绿粉模式代码块选中态必须特异化适配');
    assert.ok(css.includes('[data-theme="rice"] pre ::selection'), '宣纸模式代码块选中态必须特异化适配');

    // 表单输入框适配
    assert.ok(css.includes('input::selection') && css.includes('textarea::selection'), '必须覆盖输入框与文本域选中态');
  });

  it('3. global.css: 全站搜索弹窗（Command Palette）黄金分割顶部对齐与防偏下优化', () => {
    const cssPath = path.join(rootDir, 'src/styles/global.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(!css.includes('padding: 5.5rem 1.5rem 1.5rem;'), 'search-overlay 不应使用过大的 5.5rem 顶部间距导致弹窗偏下');
    assert.ok(css.includes('padding: clamp(1.8rem, 4.5vh, 2.6rem) 1.5rem 1.5rem;'), 'search-overlay 必须使用黄金比例居上吸顶间距');
    assert.ok(css.includes('max-height: calc(100vh - 4.2rem)'), 'search-modal 视口最大高度应相应舒展');
  });

  it('4. ArticleSelectionDock: 备注框呼吸感间距与平滑折叠进退场动效', () => {
    const dockPath = path.join(rootDir, 'src/components/ArticleSelectionDock.astro');
    assert.ok(fs.existsSync(dockPath), 'ArticleSelectionDock.astro 必须存在');
    const content = fs.readFileSync(dockPath, 'utf8');

    // DOM 结构与生命周期
    assert.ok(content.includes('notes-item-comment-editor-inner'), '备注编辑框必须包含 inner 容器以实现平滑高度推拉');
    assert.ok(content.includes('editor.classList.add(\'is-open\')') || content.includes('editor.classList.add("is-open")'),
      '备注框挂载后必须触发 is-open 播放展开动效');
    assert.ok(content.includes('editor.classList.add(\'is-closing\')') || content.includes('editor.classList.add("is-closing")'),
      '备注框关闭时必须播放 is-closing 退出动效再从 DOM 移除');

    // CSS 样式与间距规范
    assert.ok(content.includes('grid-template-rows: 0fr') && content.includes('grid-template-rows: 1fr'),
      '备注编辑框必须基于 grid-template-rows 实现平滑折叠伸缩');
    assert.ok(content.includes('margin: 0.75rem 0 0.65rem 0') || content.includes('margin: 0.75rem'),
      '备注编辑框展开态必须具备 0.75rem 顶部呼吸感间距，消除贴紧拥挤');
  });

  it('5. ArticleSelectionDock: 新建笔记框优雅折叠迭代与边框光晕交互', () => {
    const dockPath = path.join(rootDir, 'src/components/ArticleSelectionDock.astro');
    const content = fs.readFileSync(dockPath, 'utf8');

    // DOM 结构与退出动效
    assert.ok(content.includes('notes-composer-inner'), '新建笔记框必须包含 inner 容器');
    assert.ok(content.includes('composer.classList.add(\'is-open\')') || content.includes('composer.classList.add("is-open")'),
      '新建笔记框挂载后必须触发 is-open 展开动画');
    assert.ok(content.includes('composer.classList.add(\'is-closing\')') || content.includes('composer.classList.add("is-closing")'),
      '新建笔记框取消或保存时必须播放 is-closing 退出动画再从 DOM 移除');

    // CSS 样式与微交互
    assert.ok(content.includes('.notes-composer:focus-within'), '新建笔记框在聚焦输入时必须呈现边框微光');
    assert.ok(content.includes('prefers-reduced-motion: reduce'), '动效必须具备系统减弱动态无障碍降级');
  });

  it('6. 无遮罩并排推挤双卷对照阅读架构与面板互斥验证 (Dual-Pane Push Reading Mode)', () => {
    const dockPath = path.join(rootDir, 'src/components/ArticleSelectionDock.astro');
    const dockContent = fs.readFileSync(dockPath, 'utf8');
    const inkAskPath = path.join(rootDir, 'src/components/InkAsk.astro');
    const inkAskContent = fs.readFileSync(inkAskPath, 'utf8');
    const globalCssPath = path.join(rootDir, 'src/styles/global.css');
    const globalCss = fs.readFileSync(globalCssPath, 'utf8');

    // 1. 桌面端消除全屏生硬遮罩
    assert.ok(dockContent.includes('@media (min-width: 1024px)') && dockContent.includes('.article-notes-drawer-backdrop') && dockContent.includes('display: none !important;'),
      '高亮笔记在桌面端必须彻底禁用全屏遮罩');
    assert.ok(inkAskContent.includes('@media (min-width: 1024px)') && inkAskContent.includes('.ink-ask-drawer-overlay') && inkAskContent.includes('display: none !important;'),
      '墨问伴读在桌面端必须彻底禁用全屏遮罩');

    // 2. 悬浮独立画卷卡片外形
    assert.ok(dockContent.includes('border-radius: 16px;') && dockContent.includes('top: clamp(1rem, 2.5vh, 1.8rem);'),
      '高亮笔记面板必须具备悬浮画卷圆角卡片外形');
    assert.ok(inkAskContent.includes('border-radius: 16px;') && inkAskContent.includes('top: clamp(1rem, 2.5vh, 1.8rem);'),
      '墨问伴读面板必须具备悬浮画卷圆角卡片外形');

    // 3. 桌面端并排推挤正文让位
    assert.ok(globalCss.includes('body.notes-drawer-open .site-shell > main') && globalCss.includes('padding-right: clamp(420px, 30vw, 480px) !important;'),
      'global.css 必须为打开伴读/笔记提供正文推挤让位规则，保障左文右注对照阅读');

    // 4. 移动端自适应底部手卷
    assert.ok(dockContent.includes('border-radius: 20px 20px 0 0;') && dockContent.includes('drawer-drag-handle'),
      '高亮笔记在移动端必须自适应为底部手卷抽屉并包含下拉拉手');
    assert.ok(inkAskContent.includes('border-radius: 20px 20px 0 0;') && inkAskContent.includes('drawer-drag-handle'),
      '墨问伴读在移动端必须自适应为底部手卷抽屉并包含下拉拉手');

    // 5. 双面板单焦点互斥机制
    assert.ok(dockContent.includes("window.dispatchEvent(new CustomEvent('article-notes:open'))"), '高亮笔记打开必须广播事件');
    assert.ok(dockContent.includes("window.addEventListener('ink-ask:open', closeNotesDrawer"), '高亮笔记必须监听墨问打开并自动收拢');
    assert.ok(inkAskContent.includes("window.dispatchEvent(new CustomEvent('ink-ask:open'))"), '墨问伴读打开必须广播事件');
    assert.ok(inkAskContent.includes("window.addEventListener('article-notes:open', closeSidebar"), '墨问伴读必须监听笔记打开并自动收拢');
  });
});
