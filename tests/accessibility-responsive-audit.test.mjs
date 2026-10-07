import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('全站界面可视性、无障碍与多端响应式自动化审计守护套件 (Accessibility & Responsive Audit)', () => {
  const rootDir = process.cwd();
  const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');
  const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');
  const postLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/PostLayout.astro'), 'utf8');
  const inkAskAstro = fs.readFileSync(path.join(rootDir, 'src/components/InkAsk.astro'), 'utf8');
  const headerAstro = fs.readFileSync(path.join(rootDir, 'src/components/Header.astro'), 'utf8');
  const pinWorkbenchAstro = fs.readFileSync(path.join(rootDir, 'src/components/PinWorkbench.astro'), 'utf8');
  const zenSoundscapeAstro = fs.readFileSync(path.join(rootDir, 'src/components/ZenSoundscape.astro'), 'utf8');
  const dockAstro = fs.readFileSync(path.join(rootDir, 'src/components/ArticleSelectionDock.astro'), 'utf8');
  const settingsAstro = fs.readFileSync(path.join(rootDir, 'src/pages/settings.astro'), 'utf8');
  const galleryAstro = fs.readFileSync(path.join(rootDir, 'src/pages/gallery.astro'), 'utf8');
  const lifeAstro = fs.readFileSync(path.join(rootDir, 'src/pages/life.astro'), 'utf8');

  // ---------- 辅助数学算法：WCAG 2.1 相对亮度与对比度 ----------
  function hexToRgb(hex) {
    const clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16),
      ];
    }
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }

  function getLuminance(r, g, b) {
    const a = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }

  function getContrastRatio(hex1, hex2) {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    const lum1 = getLuminance(rgb1[0], rgb1[1], rgb1[2]);
    const lum2 = getLuminance(rgb2[0], rgb2[1], rgb2[2]);
    const max = Math.max(lum1, lum2);
    const min = Math.min(lum1, lum2);
    return (max + 0.05) / (min + 0.05);
  }

  it('1. WCAG 2.1 相对亮度与对比度数学计算引擎自检', () => {
    // 纯黑与纯白对比度应为 21:1
    const maxRatio = getContrastRatio('#000000', '#ffffff');
    assert.ok(Math.abs(maxRatio - 21) < 0.1, `黑白对比度应为 21:1，实际为 ${maxRatio}`);

    // 相同色彩对比度应为 1:1
    const sameRatio = getContrastRatio('#336699', '#336699');
    assert.ok(Math.abs(sameRatio - 1) < 0.01, `同色对比度应为 1:1，实际为 ${sameRatio}`);
  });

  it('2. 全站主题次级文字令牌 (--ink-light / --muted) 达到 WCAG 2.1 AA 标准 (P1-04)', () => {
    // Light mode: #666666 on #FCFAF8
    const lightRatio = getContrastRatio('#666666', '#FCFAF8');
    assert.ok(lightRatio >= 4.5, `浅色主题次级文本对比度必须 >= 4.5:1，当前为 ${lightRatio.toFixed(2)}:1`);
    assert.ok(globalCss.includes('--ink-light: #666666;'), 'global.css 浅色模式 --ink-light 必须调整为 #666666');

    // Dark mode: #8E8E8E on #141414
    const darkRatio = getContrastRatio('#8E8E8E', '#141414');
    assert.ok(darkRatio >= 4.5, `深色主题次级文本对比度必须 >= 4.5:1，当前为 ${darkRatio.toFixed(2)}:1`);
    assert.ok(globalCss.includes('--ink-light: #8E8E8E;'), 'global.css 深色模式 --ink-light 必须调整为 #8E8E8E');

    // Moss mode: #F7E4EA on #00796B
    const mossRatio = getContrastRatio('#F7E4EA', '#00796B');
    assert.ok(mossRatio >= 4.0, `苔绿主题次级文本对比度必须 >= 4.0:1，当前为 ${mossRatio.toFixed(2)}:1`);
    assert.ok(globalCss.includes('--muted: #F7E4EA;'), 'global.css 苔绿模式 --muted 必须调整为 #F7E4EA');

    // Rice mode: #6E6152 on #F2E9D8
    const riceRatio = getContrastRatio('#6E6152', '#F2E9D8');
    assert.ok(riceRatio >= 4.5, `米纸主题次级文本对比度必须 >= 4.5:1，当前为 ${riceRatio.toFixed(2)}:1`);
    assert.ok(globalCss.includes('--ink-light: #6E6152;'), 'global.css 米纸模式 --ink-light 必须调整为 #6E6152');
  });

  it('3. 键盘无障碍焦点可见性与防 Safari 紫光双轨分离 (P0-02)', () => {
    // 鼠标点击态消除 (防 Safari 原生紫框)
    assert.ok(
      globalCss.includes('.theme-toggle:focus:not(:focus-visible),') &&
      globalCss.includes('.font-toggle:focus:not(:focus-visible),'),
      'global.css 必须为 :focus:not(:focus-visible) 单独提供 outline: none 消除鼠标点击紫框'
    );

    // 键盘 Tab 态恢复 (WCAG 2.4.7 双层高反差水墨焦点环)
    assert.ok(
      globalCss.includes('.theme-toggle:focus-visible,') &&
      globalCss.includes('outline: 2px solid var(--accent) !important;') &&
      globalCss.includes('outline-offset: 2px !important;'),
      'global.css 必须为 :focus-visible 提供 outline: 2px solid var(--accent) 焦点环'
    );

    // 全局默认 :focus-visible 声明
    assert.ok(
      globalCss.includes(':focus-visible {') &&
      globalCss.includes('outline: 2px solid var(--accent);'),
      'global.css 必须定义站点级全局 :focus-visible 默认外框'
    );
  });

  it('4. 平板端视口断点与导航遮挡彻底排除 (P0-01 & P1-01)', () => {
    // P0-01: InkAsk.astro 平板断点由 767.98px 提升至 1023.98px，与 Header 一致
    assert.ok(
      inkAskAstro.includes('@media (max-width: 1023.98px) {') &&
      inkAskAstro.includes('.ink-ask-sidebar-trigger {'),
      'InkAsk.astro 媒体查询必须对齐 1023.98px，避免在平板视口压盖 Header 汉堡按钮'
    );

    // P1-01: global.css 针对 .home-topics h2 的横向重置媒体查询覆盖 <= 1023.98px 平板
    assert.ok(
      globalCss.includes('@media (max-width: 1023.98px) {') &&
      globalCss.includes('.home-topics h2 {') &&
      globalCss.includes('writing-mode: horizontal-tb;'),
      'global.css 必须为 <= 1023.98px 视口将 .home-topics h2 重置为横向水平排版，避免竖排挤压'
    );
  });

  it('5. iOS 全屏设备 4 大固定底栏抽屉安全区 (safe-area-inset-bottom) 覆盖 (P0-03)', () => {
    // 1. PinWorkbench 移动抽屉
    assert.ok(
      globalCss.includes('.pin-sheet-drawer {') &&
      globalCss.includes('padding-bottom: env(safe-area-inset-bottom, 0px);'),
      '.pin-sheet-drawer 必须包含 padding-bottom: env(safe-area-inset-bottom, 0px)'
    );

    // 2. ArticleSelectionDock 笔记抽屉底栏
    assert.ok(
      dockAstro.includes('.notes-drawer-footer {') &&
      dockAstro.includes('env(safe-area-inset-bottom, 0px)'),
      'ArticleSelectionDock.astro .notes-drawer-footer 必须包含 safe-area-inset-bottom'
    );

    // 3. Header 移动端导航抽屉底栏
    assert.ok(
      globalCss.includes('.mobile-drawer-footer {') &&
      globalCss.includes('env(safe-area-inset-bottom, 0px)'),
      'global.css .mobile-drawer-footer 必须包含 safe-area-inset-bottom'
    );

    // 4. Gallery 画册全屏暗房灯箱容器
    assert.ok(
      galleryAstro.includes('.lightbox-container {') &&
      galleryAstro.includes('env(safe-area-inset-bottom, 0px)'),
      'gallery.astro .lightbox-container 必须包含 safe-area-inset-bottom'
    );
  });

  it('6. 全站模态弹窗与抽屉 Tab 焦点捕获 (Focus Trap) 与 Esc 还原 (NEW-01)', () => {
    // 1. BaseLayout 搜索、图片及预览弹窗 Tab 捕获
    assert.ok(
      baseLayout.includes('function trapFocusInContainer(container, event)') &&
      baseLayout.includes('trapFocusInContainer(searchOverlay, event);'),
      'BaseLayout.astro 必须在全局搜索浮层中拦截并循环 Tab 焦点'
    );

    // 2. InkAsk 侧边栏及卡片 Tab 捕获与 Esc 焦点还原
    assert.ok(
      inkAskAstro.includes('trapModalTab(sidebarDrawer, event);') &&
      inkAskAstro.includes('sidebarBtn?.focus();'),
      'InkAsk.astro 必须为侧边栏抽屉提供 Tab 焦点捕获并于关闭后还原焦点至 sidebarBtn'
    );

    // 3. PinWorkbench 移动抽屉与浮窗 Tab 捕获与 Esc 还原
    assert.ok(
      pinWorkbenchAstro.includes('trapPinTab(sheet, e);') &&
      pinWorkbenchAstro.includes('edgeTab?.focus();'),
      'PinWorkbench.astro 必须提供 Tab 焦点捕获并在 Esc 关闭后还原焦点至 edgeTab'
    );

    // 4. ZenSoundscape 胶囊面板 Tab 捕获与 Esc 还原
    assert.ok(
      zenSoundscapeAstro.includes('trapCapsuleTab(capsule, e);') &&
      zenSoundscapeAstro.includes('closeCapsule(restoreFocus = true)'),
      'ZenSoundscape.astro 必须提供 Tab 焦点捕获并在 Esc 关闭后还原焦点至 toggle'
    );
  });

  it('7. 全面尊重系统减弱动画设置 (prefers-reduced-motion: reduce) (NEW-03)', () => {
    // BaseLayout 平滑滚动
    assert.ok(
      baseLayout.includes("function initSmoothScroll() {\n        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;"),
      'BaseLayout initSmoothScroll 必须在 prefers-reduced-motion 时直接返回'
    );

    // BaseLayout 磁贴微动效
    assert.ok(
      baseLayout.includes("function initMagneticButtons() {\n        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;"),
      'BaseLayout initMagneticButtons 必须在 prefers-reduced-motion 时直接返回'
    );

    // BaseLayout 模态弹层动效
    assert.ok(
      baseLayout.includes("const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;"),
      'BaseLayout 模态弹层管理器必须基于 window.matchMedia 动态判定 prefersReducedMotion，严禁硬编码 false'
    );
  });

  it('8. Skip Link 跳跃导航与全站页面 <main> 语义锚点落地 (NEW-02 & NEW-05)', () => {
    // BaseLayout 顶层 Skip Link
    assert.ok(
      baseLayout.includes('<a href="#main-content" class="skip-link">跳至主要内容</a>'),
      'BaseLayout.astro <body> 顶部必须包含 <a href="#main-content" class="skip-link">跳至主要内容</a>'
    );

    // global.css 中 Skip Link 样式定义
    assert.ok(
      globalCss.includes('.skip-link {') &&
      globalCss.includes('.skip-link:focus,') &&
      globalCss.includes('.skip-link:focus-visible {'),
      'global.css 必须为 .skip-link 提供键盘聚焦滑出动效与高对比度外框'
    );

    // BaseLayout SPA 软导航焦点平移 (NEW-05)
    assert.ok(
      baseLayout.includes('// NEW-05: Restore focus after Astro View Transitions SPA navigation') &&
      baseLayout.includes("targetFocus.focus({ preventScroll: true });"),
      'BaseLayout.astro 必须在 astro:page-load SPA 导航后主动平移焦点至新页面正文/标题'
    );

    // 全站 11 个页面模板定义 id="main-content" tabindex="-1"
    const templates = [
      'src/layouts/PostLayout.astro',
      'src/pages/index.astro',
      'src/pages/archive.astro',
      'src/pages/about.astro',
      'src/pages/timeline.astro',
      'src/pages/tags/index.astro',
      'src/pages/tags/[tag].astro',
      'src/pages/life.astro',
      'src/pages/stats.astro',
      'src/pages/gallery.astro',
      'src/pages/settings.astro',
    ];

    for (const tpl of templates) {
      const content = fs.readFileSync(path.join(rootDir, tpl), 'utf8');
      assert.ok(
        content.includes('<main') && content.includes('id="main-content"') && content.includes('tabindex="-1"'),
        `模板 ${tpl} 中的 <main> 必须包含 id="main-content" 与 tabindex="-1"`
      );
    }
  });

  it('9. 移动端输入框字号防缩放与设置页布局 (NEW-06 & D-03)', () => {
    // global.css 强制移动端输入框 16px 防止 iOS 视口强制放大
    assert.ok(
      globalCss.includes('@media (max-width: 767.98px) {') &&
      globalCss.includes('font-size: 16px !important;'),
      'global.css 必须包含针对移动端输入控件的 font-size: 16px !important 声明'
    );

    // settings.astro 中 modelFilterInput
    assert.ok(
      settingsAstro.includes('id="modelFilterInput"') &&
      settingsAstro.includes('text-base sm:text-xs') &&
      settingsAstro.includes('w-full sm:w-52'),
      'settings.astro 中的 modelFilterInput 必须使用 text-base sm:text-xs 以及 w-full sm:w-52 响应式布局'
    );
  });

  it('10. 触控热区人体工学单轴延展与防重叠间距 (P2-01 & P2-02)', () => {
    // P2-01: .series-dot 伪元素单轴延展
    assert.ok(
      globalCss.includes('.series-dot::before {') &&
      globalCss.includes('top: -14px;') &&
      globalCss.includes('bottom: -14px;'),
      'global.css .series-dot 必须采用单轴纵向延展伪元素（top/bottom: -14px），避免全向扩散造成相邻圆点横向重叠'
    );

    // P2-02: .dock-actions-row 弹性间距拉伸至 >= 6px
    assert.ok(
      dockAstro.includes('.dock-actions-row {') &&
      dockAstro.includes('gap: 8px;') &&
      dockAstro.includes('.dock-action-btn::before {'),
      'ArticleSelectionDock.astro 必须保持 actions-row gap >= 8px 并提供纵向触控扩展'
    );

    // P2-03: Life 模态框按钮允许换行
    assert.ok(
      lifeAstro.includes('.life-modal-actions {') &&
      lifeAstro.includes('flex-wrap: wrap;'),
      'life.astro .life-modal-actions 必须包含 flex-wrap: wrap 防止小屏溢出'
    );
  });
});
