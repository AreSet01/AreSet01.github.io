import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const globalCssPath = path.join(rootDir, 'src/styles/global.css');
const postLayoutPath = path.join(rootDir, 'src/layouts/PostLayout.astro');
const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');
const postTransitionPath = path.join(rootDir, 'src/components/PostTransition.astro');

test('Post Title Fullscreen Centering, Scale Docking & Component Isolation Suite', async (t) => {
  const globalCssContent = fs.readFileSync(globalCssPath, 'utf-8');
  const postLayoutContent = fs.readFileSync(postLayoutPath, 'utf-8');
  const baseLayoutContent = fs.readFileSync(baseLayoutPath, 'utf-8');
  const postTransitionContent = fs.readFileSync(postTransitionPath, 'utf-8');

  await t.test('1. global.css: 侧边栏与全部正文下层组件在 data-post-title-hold 下彻底隐藏', () => {
    // 侧边栏彻底隐藏
    assert.match(
      globalCssContent,
      /html\[data-post-title-hold="true"\]\s+\.glass-nav/,
      'global.css 必须在 html[data-post-title-hold="true"] 下隐藏侧边栏 .glass-nav'
    );
    assert.match(
      globalCssContent,
      /body:has\(article\[data-post-title-hold="true"\]\)\s+\.glass-nav/,
      'global.css 必须在 body:has(article[data-post-title-hold="true"]) 下隐藏侧边栏 .glass-nav'
    );

    // 目录 TOC 与锁区/正文下部组件隐藏
    assert.match(
      globalCssContent,
      /article\[data-post-title-hold="true"\]\s+\.post-toc/,
      'global.css 必须隐藏 .post-toc，杜绝目录在标题阶段露出'
    );
    assert.match(
      globalCssContent,
      /article\[data-post-title-hold="true"\]\s+\[data-locked-content\]/,
      'global.css 必须隐藏 [data-locked-content]'
    );
    assert.match(
      globalCssContent,
      /article\[data-post-title-hold="true"\]\s+>\s+\*:not\(header\)/,
      'global.css 必须隐藏 article 下非 header 的所有直接子元素'
    );

    // 页面滚动完全锁定
    assert.match(
      globalCssContent,
      /html\[data-post-title-hold="true"\][\s\S]*?overflow:\s*hidden\s*!important/,
      'global.css 必须在标题居中入场期间强制锁定 overflow: hidden'
    );

    // post-title 具备 fit-content 用于光学居中计算
    assert.match(
      globalCssContent,
      /\.post-title\s*\{[\s\S]*?width:\s*fit-content;/,
      'global.css 中的 .post-title 必须声明 width: fit-content 以便精确计算文字光学居中'
    );
  });

  await t.test('2. PostLayout: 滚轮与手势锁死及快进唤醒逻辑', () => {
    // lockScroll 和 unlockScroll
    assert.match(
      postLayoutContent,
      /function lockScroll\(\)/,
      'PostLayout 必须包含 lockScroll 函数'
    );
    assert.match(
      postLayoutContent,
      /document\.documentElement\.style\.overflow\s*=\s*'hidden';/,
      'lockScroll 必须锁定 documentElement overflow'
    );
    assert.match(
      postLayoutContent,
      /\(window as any\)\.lenis\?\.stop\(\);/,
      'lockScroll 必须暂停 Lenis 平滑滚动'
    );
    assert.match(
      postLayoutContent,
      /function unlockScroll\(\)/,
      'PostLayout 必须包含 unlockScroll 函数'
    );
    assert.match(
      postLayoutContent,
      /\(window as any\)\.lenis\?\.start\(\);/,
      'unlockScroll 必须恢复 Lenis 平滑滚动'
    );

    // fastForwardTitle 解除滚动锁定
    assert.match(
      postLayoutContent,
      /function fastForwardTitle\(\)\s*\{[\s\S]*?unlockScroll\(\);/,
      'fastForwardTitle 必须在快进时立即解锁页面滚动'
    );

    // cleanupKey 解除滚动锁定
    assert.match(
      postLayoutContent,
      /\[CLEANUP_KEY\]\s*=\s*\(\)\s*=>\s*\{[\s\S]*?unlockScroll\(\);/,
      '组件销毁或路由离开时必须保证 unlockScroll'
    );
  });

  await t.test('3. PostLayout: 全屏居中放大 (scale: 1.25) 与位移停靠同时缩放回 1.0', () => {
    // startDecoupledTitleEntrance 设置放大比例
    assert.match(
      postLayoutContent,
      /const titleScale = window\.innerWidth\s*<\s*640\s*\?\s*Math\.min\(1\.08[\s\S]*?:\s*1\.25;/,
      'PostLayout 必须对移动端和桌面端分别配置动态防溢出与 1.25 的英雄放大比例'
    );
    assert.match(
      postLayoutContent,
      /gsap\.set\(title,\s*\{\s*scale:\s*titleScale,\s*transformOrigin:\s*'center center',\s*\}\);/,
      'PostLayout 必须设置 transformOrigin: center center 并放大标题'
    );

    // FLIP 滑入 Header 停靠时同步缩放回 1.0
    assert.match(
      postLayoutContent,
      /tl\.to\(title,\s*\{\s*x:\s*0,\s*y:\s*0,\s*duration:\s*0\.46,\s*ease:\s*'power3\.out',\s*scale:\s*1,\s*\}, '\+=0\.20'\);/,
      '标题滑行停靠时必须同时将 scale 还原至 1'
    );

    // 停靠完成时清理属性与解锁滚动
    assert.match(
      postLayoutContent,
      /onComplete:\s*\(\)\s*=>\s*\{[\s\S]*?unlockScroll\(\);[\s\S]*?gsap\.set\(title,\s*\{\s*clearProps:\s*'transform,position,zIndex'\s*\}\);/,
      '停靠完成后必须解锁滚动并清理 transform,position,zIndex'
    );
  });

  await t.test('4. BaseLayout & PostTransition: 跨路由导航与死人开关一致性保护', () => {
    // astro:after-swap 重新设置 post title hold 与 overflow: hidden
    assert.match(
      baseLayoutContent,
      /document\.documentElement\.setAttribute\('data-post-title-hold',\s*'true'\);\s*document\.documentElement\.style\.overflow\s*=\s*'hidden';/,
      'BaseLayout astro:after-swap 必须在新页面插入后立即加固 data-post-title-hold 与 overflow:hidden'
    );

    // BaseLayout __releasePageEnter 确保清除 data-post-title-hold 与 overflow
    assert.match(
      baseLayoutContent,
      /window\.__releasePageEnter\s*=\s*\(options\)\s*=>\s*\{[\s\S]*?document\.documentElement\.removeAttribute\('data-post-title-hold'\);[\s\S]*?document\.documentElement\.style\.overflow\s*=\s*'';/,
      'BaseLayout __releasePageEnter 必须清除 data-post-title-hold 并恢复 overflow'
    );

    // PostTransition triggerHandover 不在 postTitleHoldPending 时提前启动 Lenis
    assert.match(
      postTransitionContent,
      /if\s*\(!\(window as any\)\.__postTitleHoldPending\)\s*\{\s*\(window as any\)\.lenis\?\.start\(\);\s*\}/,
      'PostTransition 在文章标题保持中不可提前启动 Lenis'
    );
  });

  await t.test('5. 移动端视口与跨路由清理防护: targetRect 在 prepareOpticalCenter 内声明杜绝 ReferenceError，路由离开时彻底销毁', () => {
    // 验证 prepareOpticalCenter 内部计算 titleScale 且 targetRect 处于有效作用域内
    assert.match(
      postLayoutContent,
      /function prepareOpticalCenter\(\)\s*\{[\s\S]*?const targetRect\s*=\s*title\.getBoundingClientRect\(\);[\s\S]*?const titleScale\s*=\s*window\.innerWidth\s*<\s*640[\s\S]*?return\s*\{[\s\S]*?titleScale[\s\S]*?\};/,
      'prepareOpticalCenter 必须在其内部声明 targetRect 并计算 titleScale 导出，杜绝移动端 ReferenceError'
    );

    // 验证 BaseLayout astro:before-swap 触发 __areSetPostRevealCleanup__
    assert.match(
      baseLayoutContent,
      /document\.addEventListener\('astro:before-swap',\s*\(\)\s*=>\s*\{[\s\S]*?__areSetPostRevealCleanup__/,
      'BaseLayout 必须在离开文章路由时执行 __areSetPostRevealCleanup__ 解锁页面并重置定时器'
    );

    // 验证 BaseLayout astro:after-swap 对非文章页清除 data-post-title-hold
    assert.match(
      baseLayoutContent,
      /document\.documentElement\.removeAttribute\('data-post-title-hold'\);\s*document\.body\.removeAttribute\('data-post-title-hold'\);/,
      'BaseLayout 必须在非文章页面彻底清理 documentElement 与 body 的 data-post-title-hold'
    );
  });
});
