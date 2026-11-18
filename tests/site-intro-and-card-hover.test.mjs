import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

describe('SiteIntro 首页限定与文章冷启动卡死消除 & 宣纸微浮墨晕卡片交互验证', () => {
  const rootDir = process.cwd();
  const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');
  const postCardPath = path.join(rootDir, 'src/components/PostCard.astro');
  const globalCssPath = path.join(rootDir, 'src/styles/global.css');

  const baseLayoutContent = fs.readFileSync(baseLayoutPath, 'utf8');
  const postCardContent = fs.readFileSync(postCardPath, 'utf8');
  const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');

  it('1. BaseLayout.astro 严格限制开场黑幕与等待锁只在首页 (/ 或 BASE_URL) 触发', () => {
    // 验证 define:vars 注入 baseUrl
    assert.match(
      baseLayoutContent,
      /<script\s+is:inline\s+define:vars=\{\{\s*baseUrl:\s*import\.meta\.env\.BASE_URL\s*\?\?\s*'\/'\s*\}\}>/,
      'BaseLayout.astro 必须在 is:inline 脚本通过 define:vars 注入 baseUrl'
    );

    // 验证路径检查逻辑提取
    assert.match(
      baseLayoutContent,
      /var\s+isHome\s*=\s*curPath\s*===\s*rawBase;/,
      'BaseLayout.astro 必须提取当前路径与 rawBase 判定 isHome'
    );
    assert.match(
      baseLayoutContent,
      /if\s*\(!isHome\)\s*return;/,
      '非首页必须立即 return，杜绝给 documentElement 挂载 site-intro-active 和设置 __siteIntroPending'
    );

    // 模拟运行脚本环境：测试各种冷启动路由
    function simulateIntroScript(pathname, baseUrl = '/') {
      const sandbox = {
        window: {
          __siteIntroDecided: false,
          location: { pathname, search: '', hash: '' },
          matchMedia: () => ({ matches: false }),
        },
        location: { pathname, search: '', hash: '' },
        baseUrl,
        sessionStorage: {
          store: {},
          getItem(k) { return this.store[k] || null; },
          setItem(k, v) { this.store[k] = String(v); }
        },
        document: {
          documentElement: {
            classList: {
              classes: new Set(),
              add(c) { this.classes.add(c); },
              contains(c) { return this.classes.has(c); }
            }
          }
        }
      };

      // 提取 BaseLayout 中的内联脚本内容
      const scriptMatch = baseLayoutContent.match(/<script\s+is:inline\s+define:vars=\{[\s\S]*?\}\>([\s\S]*?)<\/script>/);
      assert.ok(scriptMatch, '必须找到内联 script');

      const code = scriptMatch[1];
      vm.createContext(sandbox);
      vm.runInContext(code, sandbox);

      return {
        siteIntroActive: sandbox.document.documentElement.classList.contains('site-intro-active'),
        siteIntroPending: Boolean(sandbox.window.__siteIntroPending),
        seen: sandbox.sessionStorage.getItem('site-intro-seen') === '1',
      };
    }

    // 首页冷启动：触发开场幕 (包含 /index.html 与空路径)
    const homeResult = simulateIntroScript('/');
    assert.strictEqual(homeResult.siteIntroActive, true, '首页首次访问必须挂载 site-intro-active');
    assert.strictEqual(homeResult.siteIntroPending, true, '首页首次访问必须置位 __siteIntroPending');
    assert.strictEqual(homeResult.seen, true, '首页首次访问必须记录 site-intro-seen');

    const homeIndexResult = simulateIntroScript('/index.html');
    assert.strictEqual(homeIndexResult.siteIntroActive, true, '首页 /index.html 访问必须挂载 site-intro-active');
    const homeEmptyResult = simulateIntroScript('');
    assert.strictEqual(homeEmptyResult.siteIntroActive, true, '首页空路径访问必须挂载 site-intro-active');

    // 文章冷启动：杜绝触发开场幕，消除 14 秒空白等待
    const postResult = simulateIntroScript('/posts/cpp-dll-architecture-and-abi-deep-dive/');
    assert.strictEqual(postResult.siteIntroActive, false, '文章页面冷启动绝不能触发 site-intro-active');
    assert.strictEqual(postResult.siteIntroPending, false, '文章页面冷启动绝不能置位 __siteIntroPending');
    assert.strictEqual(postResult.seen, false, '文章页面冷启动不应提前消耗 site-intro-seen');

    const postIndexResult = simulateIntroScript('/posts/cpp-dll-architecture-and-abi-deep-dive/index.html');
    assert.strictEqual(postIndexResult.siteIntroActive, false, '文章 /index.html 冷启动绝不能触发 site-intro-active');

    // 关于页、归档页等冷启动
    const aboutResult = simulateIntroScript('/about');
    assert.strictEqual(aboutResult.siteIntroActive, false, '关于页冷启动绝不能触发 site-intro-active');
    const archiveResult = simulateIntroScript('/archive/');
    assert.strictEqual(archiveResult.siteIntroActive, false, '归档页冷启动绝不能触发 site-intro-active');

    // 支持子路径部署 baseUrl 场景
    const subpathHomeResult = simulateIntroScript('/my-blog/', '/my-blog/');
    assert.strictEqual(subpathHomeResult.siteIntroActive, true, '子路径 baseUrl 首页冷启动必须正确激活');
    const subpathHomeIndexResult = simulateIntroScript('/my-blog/index.html', '/my-blog/');
    assert.strictEqual(subpathHomeIndexResult.siteIntroActive, true, '子路径 baseUrl /index.html 必须正确激活');
    const subpathPostResult = simulateIntroScript('/my-blog/posts/renderdoc_use/', '/my-blog/');
    assert.strictEqual(subpathPostResult.siteIntroActive, false, '子路径 baseUrl 下文章页冷启动绝不能激活');
    const subpathPostIndexResult = simulateIntroScript('/my-blog/posts/renderdoc_use/index.html', '/my-blog/');
    assert.strictEqual(subpathPostIndexResult.siteIntroActive, false, '子路径 baseUrl 下文章 index.html 绝不能激活');
  });

  it('2. PostCard.astro 包含 .arrow-indicator 与 [data-card-arrow] 独立交互标记且无方章角印', () => {
    assert.match(
      postCardContent,
      /<span[^>]*class="[^"]*arrow-indicator[^"]*"[^>]*data-card-arrow/,
      'PostCard.astro 必须为卡片右箭头包裹具备 arrow-indicator 类与 data-card-arrow 属性的独立 span'
    );
    assert.doesNotMatch(
      postCardContent,
      /paper-card-seal/,
      'PostCard.astro 不得包含 .paper-card-seal 角印结构或样式'
    );
  });

  it('3. global.css .note-card 完全移除 border-left 与硬突变，实现「宣纸微浮 · 墨晕漫透」方案', () => {
    // 确认已彻底移除 border-left: 2px solid transparent !important
    assert.ok(
      !globalCssContent.includes('border-left: 2px solid transparent !important'),
      'global.css .note-card 必须彻底移除 border-left: 2px solid transparent !important'
    );

    // 确认已彻底移除 .note-card:hover 的 translateX 水平突进、transform 抢写与 border-color
    const noteCardHoverMatch = globalCssContent.match(/\.note-card:hover[^{]*\{([^}]+)\}/);
    assert.ok(noteCardHoverMatch, '必须找到 .note-card:hover 规则');
    assert.ok(
      !noteCardHoverMatch[1].includes('translateX'),
      '.note-card:hover 必须彻底移除 transform: translateX'
    );
    assert.ok(
      !noteCardHoverMatch[1].includes('transform'),
      '.note-card:hover 不得再写 transform，位移交给统一的 3D tilt 引擎'
    );
    assert.ok(
      !noteCardHoverMatch[1].includes('border-color'),
      '.note-card:hover 必须彻底移除 border-color 边框变色'
    );
    assert.ok(
      !noteCardHoverMatch[1].includes('border-radius'),
      '.note-card:hover 不得再改变圆角，避免 hover 时形状单帧跳变'
    );

    // 验证宣纸底色
    assert.match(
      noteCardHoverMatch[1],
      /background:\s*var\(--bg-soft\)\s*!important;/,
      '.note-card:hover 必须显现宣纸微白底色 var(--bg-soft) !important'
    );

    // 验证多层柔性水墨阴影 rgba(var(--accent-rgb), ...)
    assert.match(
      noteCardHoverMatch[1],
      /box-shadow:[\s\S]*?rgba\(var\(--accent-rgb\)/,
      '.note-card:hover 必须具备包含 rgba(var(--accent-rgb)) 的多层柔墨晕开投影'
    );

    // 验证卡片 surface 过渡使用统一的 --ease-card，并且不再与 transform 抢控制权
    assert.match(
      globalCssContent,
      /\.note-card\s*\{[\s\S]*?transition:[\s\S]*?box-shadow\s+420ms\s+var\(--ease-card\)/,
      '.note-card 必须使用统一的 --ease-card 过渡盒阴影'
    );
    assert.doesNotMatch(
      globalCssContent.match(/\.note-card\s*\{([\s\S]*?)\}/)[1],
      /transition:[^;]*transform/,
      '.note-card 基础过渡不得再声明 transform，避免与 GSAP 入场和 tilt 打架'
    );

    // 验证卡片箭头悬停滑动交互
    assert.match(
      globalCssContent,
      /\.note-card:hover\s+\.arrow-indicator,\s*\.note-card:hover\s+\[data-card-arrow\]\s*\{[\s\S]*?transform:\s*translateX\(3px\);/,
      '卡片悬停时右侧箭头必须平滑右移 transform: translateX(3px)'
    );

    // 验证无障碍 prefers-reduced-motion 支持
    assert.match(
      globalCssContent,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.note-card[\s\S]*?transform:\s*none\s*!important/,
      'prefers-reduced-motion 必须禁用 .note-card 的位移动效'
    );
  });
});
