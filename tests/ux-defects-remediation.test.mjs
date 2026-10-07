import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const headerPath = path.join(rootDir, 'src/components/Header.astro');
const siteIntroPath = path.join(rootDir, 'src/components/SiteIntro.astro');
const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');
const globalCssPath = path.join(rootDir, 'src/styles/global.css');
const pinWorkbenchPath = path.join(rootDir, 'src/components/PinWorkbench.astro');

test('UX & Visual Defect Remediation Suite', async (t) => {
  const headerContent = fs.readFileSync(headerPath, 'utf-8');
  const siteIntroContent = fs.readFileSync(siteIntroPath, 'utf-8');
  const baseLayoutContent = fs.readFileSync(baseLayoutPath, 'utf-8');
  const globalCssContent = fs.readFileSync(globalCssPath, 'utf-8');
  const pinWorkbenchContent = fs.readFileSync(pinWorkbenchPath, 'utf-8');

  await t.test('1. 指针拖尾悬停按钮卡住问题消除: points 优雅淡出并清空画布', () => {
    // 检查 updateAndDraw 不会因为 brush.isVisible = false 而立即断帧
    assert.match(
      headerContent,
      /const isStationary = points\.length === 0 && \(!brush\.isVisible \|\| speed <= 0\.05\);/,
      'updateAndDraw should only mark stationary when points.length is 0'
    );
    // 检查清空画布逻辑
    assert.match(
      headerContent,
      /if \(points\.length === 0 && !brush\.isVisible\) \{\s*ctx\.clearRect\(0, 0, window\.innerWidth, window\.innerHeight\);\s*\}/,
      'updateAndDraw should clear canvas when points drain and brush is not visible'
    );
    // 检查 onPointerMove 悬停在按钮时仍继续驱动 requestAnimationFrame
    assert.match(
      headerContent,
      /if \(points\.length > 0 && !isDrawing\) \{\s*isDrawing = true;\s*requestAnimationFrame\(updateAndDraw\);\s*\}/,
      'onPointerMove over buttons should continue rendering remaining points until they fade'
    );
  });

  await t.test('2. 首次访问 SiteIntro 点击跳过卡死空白问题消除: 300ms 安全回退与强力页面释放', () => {
    // 检查 skipFallbackTimer 存在
    assert.match(siteIntroContent, /let skipFallbackTimer = 0;/, 'SiteIntro must declare skipFallbackTimer');
    assert.match(
      siteIntroContent,
      /skipFallbackTimer = window\.setTimeout\(finish, 300\);/,
      'SiteIntro skip() must set guaranteed 300ms fallback timeout to invoke finish()'
    );
    // 检查 finish() 彻底清理 site-intro-active 与 __siteIntroPending
    assert.match(
      siteIntroContent,
      /document\.documentElement\.classList\.remove\('site-intro-active'\);/,
      'finish() must remove site-intro-active class from documentElement'
    );
    assert.match(
      siteIntroContent,
      /\(window as any\)\.__siteIntroPending = false;/,
      'finish() must reset __siteIntroPending to false'
    );
    // 检查 BaseLayout 死人开关
    assert.match(
      baseLayoutContent,
      /holdTimer = window\.setTimeout\(\(\) => \{\s*if \(holdRelease\) \{\s*document\.documentElement\.classList\.remove\('site-intro-active'\);/,
      'BaseLayout dead-man timer must remove site-intro-active class if intro ever stalls'
    );
  });

  await t.test('3. 标题焦点外框消除: 页面标题与结构性 landmark 消除 focus outline', () => {
    // 检查 global.css 中抑制 h1:focus / h1:focus-visible / [tabindex="-1"] 外框
    assert.match(
      globalCssContent,
      /h1:focus,\s*h1:focus-visible,\s*h2:focus,\s*h2:focus-visible,[\s\S]*?\[tabindex="-1"\]:focus,\s*\[tabindex="-1"\]:focus-visible\s*\{\s*outline: none !important;\s*box-shadow: none !important;\s*\}/,
      'global.css must suppress focus outline and box-shadow on programmatic headings and tabindex="-1" elements'
    );
  });

  await t.test('4. 消除双黄条嵌套 & 绿粉主题页头按钮区分度增强', () => {
    // 检查 PinWorkbench quote 不再嵌套两层 .pinned-quote-body
    assert.match(
      pinWorkbenchContent,
      /htmlContent: options\.html \|\| escaped,/,
      'PinWorkbench must avoid duplicate .pinned-quote-body wrapper in htmlContent'
    );
    // 检查 global.css 中消除了嵌套引用和 blockquote 的重复 border-left
    assert.match(
      globalCssContent,
      /\.pinned-quote-body \.pinned-quote-body,\s*\.pinned-quote-body blockquote,\s*\.pinned-card-body blockquote\s*\{\s*border-left: none !important;/s,
      'global.css must eliminate nested border-left bars in pinned quotes and blockquotes'
    );
    // 检查页头控制按钮具备圆角与 hover pill 高亮背景
    assert.match(globalCssContent, /\.theme-toggle:hover\s*\{[\s\S]*?background:\s*var\(--bg-soft/, 'theme-toggle must have hover background pill');
    assert.match(globalCssContent, /\.font-toggle:hover\s*\{[\s\S]*?background:\s*var\(--bg-soft/, 'font-toggle must have hover background pill');
    assert.match(globalCssContent, /\.cursor-trail-toggle:hover\s*\{[\s\S]*?background:\s*var\(--bg-soft/, 'cursor-trail-toggle must have hover background pill');
    assert.match(globalCssContent, /\.zen-sound-toggle:hover\s*\{[\s\S]*?background:\s*var\(--bg-soft/, 'zen-sound-toggle must have hover background pill');
    // 检查绿粉主题下的高对比度悬停高亮
    assert.match(
      globalCssContent,
      /\[data-theme="moss"\] \.theme-toggle:hover,[\s\S]*?\[data-theme="moss"\] \.zen-sound-toggle:hover\s*\{\s*color: #FFFFFF !important;\s*background: rgba\(255, 255, 255, 0\.18\) !important;/s,
      'global.css must provide high contrast translucent pills on moss theme toggle button hover'
    );
  });

  await t.test('5. 对照工作台窗口拖动功能全面修复: 跨路由重绑、窗口级追踪与 pointerEvents 重置', () => {
    // 检查 openWindow() 重置 pointerEvents
    assert.match(
      pinWorkbenchContent,
      /floatWindow\.style\.pointerEvents = '';/,
      'openWindow() must reset floatWindow.style.pointerEvents to empty string'
    );
    // 检查 bindDrag() 在每次路由加载时重新绑定且避免重复监听
    assert.match(
      pinWorkbenchContent,
      /if \(\(dragHandle as any\)\.__dragBound\) return;\s*\(dragHandle as any\)\.__dragBound = true;/,
      'bindDrag() must protect handle with element-level __dragBound flag'
    );
    // 检查 window 级 pointermove / pointerup 事件监听
    assert.match(
      pinWorkbenchContent,
      /window\.addEventListener\('pointermove', onPointerMove\);/,
      'bindDrag() must attach pointermove listener to window for zero-drop tracking'
    );
    assert.match(
      pinWorkbenchContent,
      /window\.addEventListener\('pointerup', onPointerUp\);/,
      'bindDrag() must attach pointerup listener to window'
    );
  });
});
