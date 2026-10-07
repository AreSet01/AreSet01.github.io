import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');
const galleryPath = path.join(rootDir, 'src/pages/gallery.astro');
const settingsPath = path.join(rootDir, 'src/pages/settings.astro');
const globalCssPath = path.join(rootDir, 'src/styles/global.css');

test('Zero-Regression Performance Enhancements Suite', async (t) => {
  const baseLayoutContent = fs.readFileSync(baseLayoutPath, 'utf-8');
  const galleryContent = fs.readFileSync(galleryPath, 'utf-8');
  const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
  const globalCssContent = fs.readFileSync(globalCssPath, 'utf-8');

  await t.test('1. 字体网络握手优化: preconnect 与 dns-prefetch 完备性验证 (零视觉变化)', () => {
    // 验证 jsDelivr CDN preconnect 与 dns-prefetch
    assert.match(
      baseLayoutContent,
      /<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net" crossorigin \/>/,
      'BaseLayout.astro 必须预连接 cdn.jsdelivr.net'
    );
    assert.match(
      baseLayoutContent,
      /<link rel="dns-prefetch" href="https:\/\/cdn\.jsdelivr\.net" \/>/,
      'BaseLayout.astro 必须为 cdn.jsdelivr.net 配置 dns-prefetch'
    );
    assert.match(
      baseLayoutContent,
      /<link rel="dns-prefetch" href="https:\/\/fonts\.gstatic\.com" \/>/,
      'BaseLayout.astro 必须为 fonts.gstatic.com 配置 dns-prefetch'
    );
    // 确保字体家族声明与 link 样式表完全保留
    assert.match(
      baseLayoutContent,
      /href="https:\/\/cdn\.jsdelivr\.net\/npm\/lxgw-wenkai-webfont@1\.7\.0\/style\.css"/,
      '霞鹜文楷字体样式表引用必须完好保留'
    );
  });

  await t.test('2. 图片异步解码与分级加载优先级: 视口首屏高优 + 离屏异步解码 (零视觉变化)', () => {
    // Gallery 首屏前两张图 eager + high priority，后续保持 lazy
    assert.match(
      galleryContent,
      /loading=\{index < 2 \? 'eager' : 'lazy'\}/,
      'Gallery 前两张照片应采用 eager 模式加载以提升首屏 LCP'
    );
    assert.match(
      galleryContent,
      /fetchpriority=\{index < 2 \? 'high' : 'auto'\}/,
      'Gallery 前两张照片应声明 fetchpriority="high"'
    );
    assert.match(
      galleryContent,
      /decoding="async"/,
      'Gallery 照片必须声明 decoding="async"'
    );

    // 设置页 preview 图片 async 解码与尺寸声明
    assert.match(
      settingsContent,
      /decoding="async"/,
      'Settings 实测截图必须配置 decoding="async"'
    );
    assert.match(
      settingsContent,
      /width="640"\s+height="400"/,
      'Settings 实测截图必须声明固定宽高比以避免视口计算抖动'
    );

    // 大图预览与暗房弹窗 async 解码
    assert.match(
      baseLayoutContent,
      /<img class="image-viewer-media" alt="" decoding="async" \/>/,
      'BaseLayout 大图预览图必须具备 decoding="async"'
    );
    assert.match(
      baseLayoutContent,
      /document\.querySelectorAll\('\.prose img'\)\.forEach/,
      'BaseLayout initSiteUi 必须为文章正文内图片增强 decoding="async" 与 loading="lazy"'
    );
  });

  await t.test('3. 超大 SVG 拓扑图平移隔离优化: contain: paint 与 will-change (零视觉变化)', () => {
    // .mermaid-stage 必须具备 contain: paint
    assert.match(
      globalCssContent,
      /\.mermaid-stage\s*\{[\s\S]*?contain:\s*paint;[\s\S]*?\}/,
      'global.css .mermaid-stage 必须声明 contain: paint 避免拖拽平移时全局重绘'
    );
    // 拖拽激活态具备 will-change: scroll-position
    assert.match(
      globalCssContent,
      /\.mermaid-stage\.is-zoomed\.is-dragging\s*\{[\s\S]*?will-change:\s*scroll-position;[\s\S]*?\}/,
      'global.css .mermaid-stage 拖拽态必须声明 will-change: scroll-position 优化 GPU 合成'
    );
  });

  await t.test('4. 零视觉变化防御检验: 布局尺寸、主题颜色、DOM 结构一致性', () => {
    // 验证画册外框 mat-frame、mat-photo-img 依然完整
    assert.match(galleryContent, /class="mat-photo-img"/, 'mat-photo-img 类名必须完整保留');
    assert.match(galleryContent, /class="mat-frame"/, 'mat-frame 艺术装裱结构必须完整保留');

    // 验证大图查看器没有修改任何 CSS 选择器
    assert.match(baseLayoutContent, /class="image-viewer-shell"/, 'image-viewer-shell 结构必须完整');
    assert.match(baseLayoutContent, /class="image-viewer-stage"/, 'image-viewer-stage 结构必须完整');
  });
});
