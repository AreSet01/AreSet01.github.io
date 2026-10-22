import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');
const postLayoutPath = path.join(rootDir, 'src/layouts/PostLayout.astro');
const siteIntroPath = path.join(rootDir, 'src/components/SiteIntro.astro');
const postTransitionPath = path.join(rootDir, 'src/components/PostTransition.astro');

test('Decoupled Article Title Entrance & Cold-Load Blank Screen Prevention Suite', async (t) => {
  const baseLayoutContent = fs.readFileSync(baseLayoutPath, 'utf-8');
  const postLayoutContent = fs.readFileSync(postLayoutPath, 'utf-8');
  const siteIntroContent = fs.readFileSync(siteIntroPath, 'utf-8');
  const postTransitionContent = fs.readFileSync(postTransitionPath, 'utf-8');

  await t.test('1. BaseLayout: 字体非阻塞交换 (media=print onload) 与无脚本降级保证', () => {
    // 验证 Google Fonts 非阻塞加载
    assert.match(
      baseLayoutContent,
      /<link[^>]*href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*"[^>]*media="print"[^>]*onload="this\.media='all'"/,
      'Google Fonts 必须采用 media="print" 与 onload="this.media=\'all\'" 杜绝阻断首屏渲染'
    );
    // 验证霞鹜文楷非阻塞加载
    assert.match(
      baseLayoutContent,
      /<link[^>]*href="https:\/\/cdn\.jsdelivr\.net\/npm\/lxgw-wenkai-webfont@1\.7\.0\/style\.css"[^>]*media="print"[^>]*onload="this\.media='all'"/,
      '霞鹜文楷样式表必须采用 media="print" 与 onload="this.media=\'all\'" 杜绝阻断首屏渲染'
    );
    // 验证 noscript 降级完整存在
    assert.match(
      baseLayoutContent,
      /<noscript>[\s\S]*?fonts\.googleapis\.com[\s\S]*?lxgw-wenkai-webfont[\s\S]*?<\/noscript>/,
      'BaseLayout 必须为非阻塞字体提供完整的 <noscript> 回退标签'
    );
  });

  await t.test('2. BaseLayout: 开场幕与文章标题入场死人开关及 js-enter 多层强力释放保护', () => {
    // 验证 SiteIntro 与 AboutIntro 具备完整的开场幕等待时间 (14000ms)，杜绝开场在 24% 处被意外斩断
    assert.match(
      baseLayoutContent,
      /const maxWait = \(isIntroCurtain \|\| isAboutIntro\) \? 14000 : isPostTitleHold \? 3500 : isPostTransition \? 1200 : 3000;/,
      'BaseLayout 必须为 SiteIntro/AboutIntro 配置 14000ms 保护等待，并为 post title 配置 3500ms 宽松等待'
    );
    // 验证 window.__releasePageEnter 立即拔除 js-enter
    assert.match(
      baseLayoutContent,
      /window\.__releasePageEnter = \(options\) => \{\s*window\.clearTimeout\(holdTimer\);\s*document\.documentElement\.classList\.remove\('js-enter'\);/,
      'window.__releasePageEnter 必须在被调用时立即拔除 js-enter 类名'
    );
    // 验证死人开关超时时强力清理 js-enter
    assert.match(
      baseLayoutContent,
      /document\.documentElement\.classList\.remove\('site-intro-active'\);\s*document\.documentElement\.classList\.remove\('js-enter'\);/,
      '死人开关触发时必须同时移除 site-intro-active 与 js-enter'
    );
    // 验证全局 js-enter 兜底计时器与 maxWait + 500 同步
    assert.match(
      baseLayoutContent,
      /window\.setTimeout\(\(\) => \{\s*document\.documentElement\.classList\.remove\('js-enter'\);\s*\}, maxWait \+ 500\);/,
      'BaseLayout 必须挂载基于 maxWait + 500 的全局防死锁兜底计时器清除 js-enter'
    );
  });

  await t.test('3. SiteIntro: 200ms 字体快竞速、600ms 防卡死看门狗与滚轮/触摸即跳', () => {
    // 验证 200ms 快速字体竞速
    assert.match(
      siteIntroContent,
      /await Promise\.race\(\[document\.fonts\.load\(font, TITLE\), sleep\(200\)\]\);/,
      'SiteIntro 字体竞速超时上限必须收紧至 200ms'
    );
    // 验证 600ms 防卡死看门狗
    assert.match(
      siteIntroContent,
      /readyWatchdog = window\.setTimeout\(\(\) => \{\s*if \(!ready && !finished\) \{\s*console\.warn\('\[SiteIntro\] Ready watchdog timed out, skipping intro'\);\s*skip\(\);\s*\}\s*\}, 600\);/,
      'SiteIntro 必须包含 600ms readyWatchdog 防卡死自动跳过'
    );
    // 验证滚轮与触摸事件跳过
    assert.match(
      siteIntroContent,
      /intro\.addEventListener\('wheel', \(event\) => \{\s*event\.preventDefault\(\);\s*skip\(\);\s*\}, \{ passive: false, signal \}\);/,
      'SiteIntro 滚轮滚动必须直接触发 skip() 消除白屏'
    );
    assert.match(
      siteIntroContent,
      /intro\.addEventListener\('touchstart', \(\) => skip\(\), \{ passive: true, signal \}\);/,
      'SiteIntro 触摸屏滑动必须触发 skip() 消除白屏'
    );
    // 验证 finish 强力移除 js-enter
    assert.match(
      siteIntroContent,
      /document\.documentElement\.classList\.remove\('site-intro-active'\);\s*document\.documentElement\.classList\.remove\('js-enter'\);/,
      'SiteIntro finish() 必须同时清理 site-intro-active 与 js-enter'
    );
  });

  await t.test('4. PostTransition: 时序解耦与安全超时收紧至 800ms', () => {
    // 验证 safetyTimer 收紧至 800ms
    assert.match(
      postTransitionContent,
      /safetyTimer = window\.setTimeout\(\(\) => \{\s*if \(isTransitioning\) \{\s*postTransition\.leave\(\);\s*\}\s*\}, 800\);/,
      'PostTransition safetyTimer 必须收紧至 800ms'
    );
    // 验证 triggerHandover 优先让位给文章标题解耦动画
    assert.match(
      postTransitionContent,
      /if \(!\(window as any\)\.__postTitleHoldPending\) \{\s*\(window as any\)\.__releasePageEnter\?\.\(\);\s*\}/,
      'PostTransition 在 __postTitleHoldPending 为真时不应提前放行页面入场'
    );
  });

  await t.test('5. PostLayout: 文章标题居中入场、文档流 FLIP 平移与组件串行解耦', () => {
    // 验证 article 声明 data-post-title-hold="true"
    assert.match(
      postLayoutContent,
      /<article[^>]*data-post-title-hold="true"/,
      'PostLayout article 必须标记 data-post-title-hold="true"'
    );
    // 验证光学居中 prepareOpticalCenter
    assert.match(
      postLayoutContent,
      /function prepareOpticalCenter\(\)/,
      'PostLayout 必须包含 prepareOpticalCenter 计算视口光学居中'
    );
    assert.match(
      postLayoutContent,
      /targetCenterY = Math\.round\(vpH \* 0\.40 - targetRect\.height \/ 2\);/,
      'prepareOpticalCenter 必须计算视口约 40% 的黄金光学中心'
    );
    // 验证 In-Flow GPU translate3d (保持文档流，零 reflow)
    assert.match(
      postLayoutContent,
      /gsap\.set\(title, \{\s*x: deltaX,\s*y: deltaY,\s*force3D: true,\s*position: 'relative',\s*zIndex: 30,\s*\}\);/,
      'PostLayout 必须使用相对定位与 GPU translate3d 保持在常规文档流中'
    );
    // 验证逐字落墨从容优雅节拍 (~480ms)
    assert.match(
      postLayoutContent,
      /const charDuration = 0\.48;/,
      '标题文字单个下落时长必须优雅从容 (~0.48s)'
    );
    // 验证 FLIP 滑入 Header 停靠位置 (~460ms)
    assert.match(
      postLayoutContent,
      /tl\.to\(title, \{\s*x: 0,\s*y: 0,\s*duration: 0\.46,\s*ease: 'power3\.out',/,
      '标题必须平滑滑行 ~460ms 优雅停靠回 Header 原位'
    );
    // 验证停靠后放行全站组件入场 (__releasePageEnter)
    assert.match(
      postLayoutContent,
      /\(window as any\)\.__releasePageEnter\?\.\(\);\s*startTypewriterDate\(false\);/,
      '标题停靠 Header 后必须触发 __releasePageEnter 并启动日期打字机动画'
    );
  });

  await t.test('6. PostLayout: 读者即时交互中断/快进 (wheel / touch / keydown / resize)', () => {
    // 验证 fastForwardTitle 存在且重置所有补间与状态
    assert.match(
      postLayoutContent,
      /function fastForwardTitle\(\)/,
      'PostLayout 必须提供 fastForwardTitle 快进函数'
    );
    assert.match(
      postLayoutContent,
      /gsap\.set\(title, \{ clearProps: 'transform,position,zIndex' \}\);/,
      'fastForwardTitle 必须清理 title 的平移变换'
    );
    assert.match(
      postLayoutContent,
      /art\?\.removeAttribute\('data-post-title-hold'\);/,
      'fastForwardTitle 必须立即移除 data-post-title-hold 标识'
    );
    // 验证滚轮、触摸、键盘 (Space/Enter/Esc) 监听
    assert.match(
      postLayoutContent,
      /window\.addEventListener\('wheel', onInterrupt/,
      '必须监听 wheel 事件以便读者滑动滚轮时瞬间就绪'
    );
    assert.match(
      postLayoutContent,
      /window\.addEventListener\('touchstart', onInterrupt/,
      '必须监听 touchstart 事件以便移动端读者触摸时瞬间就绪'
    );
    assert.match(
      postLayoutContent,
      /\[' ', 'Enter', 'Escape', 'Spacebar'\]\.includes\(ke\.key\)/,
      '必须监听 Space, Enter, Escape 键以便读者键盘快进'
    );
  });

  await t.test('7. PostLayout: 正文延迟曝光保护与 global.css 样式隔离及防重叠保护', () => {
    const globalCssPath = path.join(rootDir, 'src/styles/global.css');
    const globalCssContent = fs.readFileSync(globalCssPath, 'utf-8');

    // 验证 global.css 包含 data-post-title-hold 隐藏正文、摘要与浮动药丸的规则
    assert.match(
      globalCssContent,
      /article\[data-post-title-hold="true"\]\s+header\s+p/,
      'global.css 必须在标题居中入场期间将 header p 摘要设为隐藏，杜绝标题与摘要碰撞'
    );
    assert.match(
      globalCssContent,
      /article\[data-post-title-hold="true"\]\s+\[data-post-body\]/,
      'global.css 必须在标题居中入场期间将 [data-post-body] 正文设为隐藏'
    );
    assert.match(
      globalCssContent,
      /html\.js-enter\s+#article-floating-actions/,
      'global.css 必须在 js-enter 期间隐藏底部浮动按钮'
    );

    // 验证 PostLayout 中 revealInViewBlocks 阻断未停靠的正文
    assert.match(
      postLayoutContent,
      /if\s*\(!isTitleDocked\s*&&\s*!reduceMotion\)\s*return;/,
      'PostLayout revealInViewBlocks 必须在标题停靠前阻断正文曝光'
    );
  });

  await t.test('8. PostLayout: 移动端视口支持与快进防二次重播幂等性', () => {
    // 验证 prepareOpticalCenter 兼容主流移动端视口 (< 400px，如 360px、375px、390px)
    assert.match(
      postLayoutContent,
      /if\s*\(vpH\s*<\s*300\s*\|\|\s*vpW\s*<\s*300\)\s*return\s*\{\s*deltaX:\s*0,\s*deltaY:\s*0\s*\};/,
      'prepareOpticalCenter 必须允许宽度 300px 以上的移动设备执行光学居中'
    );

    // 验证 startDecoupledTitleEntrance 防重复执行守卫
    assert.match(
      postLayoutContent,
      /if\s*\(signal\.aborted\s*\|\|\s*isTitleDocked\)\s*return;/,
      'startDecoupledTitleEntrance 必须具备 isTitleDocked 幂等防重入守卫'
    );
  });
});
