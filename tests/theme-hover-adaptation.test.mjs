import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('主题颜色适配与交互悬停辨识度验证', () => {
  const rootDir = process.cwd();

  it('1. 绿粉主题 (Moss) 基准配色与 5 档候选色阶定义完整', () => {
    const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');

    // 默认推荐底色为翡翠青玉 #00796B
    assert.ok(globalCss.includes('--moss-bg: #00796B;'), 'global.css 中默认 moss 底色应为 #00796B');
    assert.ok(globalCss.includes('--accent: #FFC2D1;'), 'global.css 中 moss 主题 accent 应为柔和浅粉 #FFC2D1');

    // 5 档微调色号变体
    const shades = ['004D40', '00695C', '00796B', '00897B', '4DB6AC'];
    for (const shade of shades) {
      assert.ok(
        globalCss.includes(`[data-theme="moss"][data-moss-shade="${shade}"]`),
        `global.css 应定义 [data-moss-shade="${shade}"] 变体样式`
      );
    }
  });

  it('2. 黑色主题与绿粉主题悬停状态文字辨识度保护', () => {
    const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');

    // 归档页标签筛选器悬停与激活态
    assert.ok(globalCss.includes('.archive-filter:not(.is-active):hover'), '应区分非激活项与激活项悬停');
    assert.ok(globalCss.includes('.archive-filter.is-active:hover'), '应保障 .archive-filter 激活项悬停文字辨识度');

    // 白噪音计时器药丸按钮在 dark 与 moss 下的悬停
    assert.ok(globalCss.includes('.zen-timer-pill:not(.is-active):hover'), '药丸按钮应隔离未激活悬停');
    assert.ok(globalCss.includes('[data-theme="dark"] .zen-timer-pill.is-active:hover'), 'dark 主题药丸激活悬停应有高对比度');
    assert.ok(globalCss.includes('[data-theme="moss"] .zen-timer-pill.is-active:hover'), 'moss 主题药丸激活悬停应有高对比度');

    // 弹窗与控制栏按钮悬停
    assert.ok(globalCss.includes('[data-theme="moss"] .mermaid-action-btn:not(.is-active):hover'), 'Mermaid 按钮未激活悬停');
    assert.ok(globalCss.includes('[data-theme="moss"] .mermaid-action-btn.is-active:hover'), 'Mermaid 按钮激活悬停');
    assert.ok(globalCss.includes('[data-theme="moss"] .code-pin-button.is-pinned'), '代码图钉高亮状态对比度适配');
  });

  it('3. 文章搜索与划词问答深色/绿粉悬停文字辨识度保护', () => {
    const searchAstro = fs.readFileSync(path.join(rootDir, 'src/components/ArticleSearch.astro'), 'utf8');
    assert.ok(searchAstro.includes('.article-search-toggle-btn:not(.is-active):hover'), '搜索范围切换按钮未激活悬停');
    assert.ok(searchAstro.includes('[data-theme="dark"] .article-search-toggle-btn.is-active:hover'), 'dark 搜索切换按钮激活悬停');
    assert.ok(searchAstro.includes('[data-theme="moss"] .article-search-toggle-btn.is-active:hover'), 'moss 搜索切换按钮激活悬停');

    const inkAskAstro = fs.readFileSync(path.join(rootDir, 'src/components/InkAsk.astro'), 'utf8');
    assert.ok(inkAskAstro.includes('[data-theme="dark"] .ink-ask-send:hover'), 'dark 问答发送按钮悬停');
    assert.ok(inkAskAstro.includes('[data-theme="moss"] .ink-ask-send:hover'), 'moss 问答发送按钮悬停');
    assert.ok(inkAskAstro.includes('[data-theme="dark"] .ink-ask-drawer-send:hover'), 'dark 抽屉发送按钮悬停');
    assert.ok(inkAskAstro.includes('[data-theme="moss"] .ink-ask-drawer-send:hover'), 'moss 抽屉发送按钮悬停');
  });

  it('4. 画册与生活分类 Tab 标签激活悬停状态防护', () => {
    const galleryAstro = fs.readFileSync(path.join(rootDir, 'src/pages/gallery.astro'), 'utf8');
    assert.ok(galleryAstro.includes('.gallery-cat-tab:not(.is-active):hover'), 'gallery-cat-tab 未激活悬停');
    assert.ok(galleryAstro.includes('.gallery-cat-tab.is-active:hover'), 'gallery-cat-tab 激活悬停');

    const lifeAstro = fs.readFileSync(path.join(rootDir, 'src/pages/life.astro'), 'utf8');
    assert.ok(lifeAstro.includes('.life-cat-tab:not(.is-active):hover'), 'life-cat-tab 未激活悬停');
    assert.ok(lifeAstro.includes('.life-cat-tab.is-active:hover'), 'life-cat-tab 激活悬停');
  });

  it('5. BaseLayout 支持 URL 参数与本地缓存动态切换绿粉色阶及同步 theme-color', () => {
    const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');
    assert.ok(baseLayout.includes("VALID_MOSS_SHADES = ['004D40', '00695C', '00796B', '00897B', '4DB6AC']"), '应定义 VALID_MOSS_SHADES 候选');
    assert.ok(baseLayout.includes("getStoredMossShade"), '应支持从 URL 或 localStorage 获取 moss-shade');
    assert.ok(baseLayout.includes("data-moss-shade"), '应在 documentElement 上设置 data-moss-shade');
    assert.ok(baseLayout.includes("mossShade ? '#' + mossShade : '#00796B'"), 'meta theme-color 应与选定色号保持一致');
  });

  it('6. 星垂野 (XingChuiYe) 废弃需求遗留彻底清理与仓库纯净度检验', () => {
    const scanDirs = ['src', 'tests'];
    for (const dir of scanDirs) {
      const fullDirPath = path.join(rootDir, dir);
      const walk = (d) => {
        const files = fs.readdirSync(d, { withFileTypes: true });
        for (const f of files) {
          const p = path.join(d, f.name);
          if (f.isDirectory()) {
            walk(p);
          } else if (
            f.isFile() &&
            f.name !== 'theme-hover-adaptation.test.mjs' &&
            (f.name.endsWith('.astro') || f.name.endsWith('.ts') || f.name.endsWith('.js') || f.name.endsWith('.mjs') || f.name.endsWith('.css'))
          ) {
            const content = fs.readFileSync(p, 'utf8');
            assert.ok(!content.includes('XingChuiYe'), `${p} 中不应包含 XingChuiYe`);
            assert.ok(!content.includes('xingchuiye'), `${p} 中不应包含 xingchuiye`);
            assert.ok(!content.includes('星垂野'), `${p} 中不应包含 星垂野`);
          }
        }
      };
      walk(fullDirPath);
    }
  });
});
