import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('全站「烟雨濛濛」音画微气象系统与首页视觉纯净化验证', () => {
  const rootDir = process.cwd();

  it('1. ZenRainscape: 组件存在且具备全屏画布与音频事件总线同步', () => {
    const rainscapePath = path.join(rootDir, 'src/components/ZenRainscape.astro');
    assert.ok(fs.existsSync(rainscapePath), 'ZenRainscape.astro 应存在');
    const content = fs.readFileSync(rainscapePath, 'utf8');

    assert.ok(content.includes('id="zenRainCanvas"'), '应包含 id="zenRainCanvas" 画布元素');
    assert.ok(content.includes('getZenAudioEngine'), '应引入并订阅 getZenAudioEngine 状态');
    assert.ok(content.includes('data-zen-rain'), '应支持 data-zen-rain 属性检测与开关控制');
    assert.ok(content.includes('prefers-reduced-motion'), '应包含无障碍 prefers-reduced-motion 降级检测');
  });

  it('2. BaseLayout: 挂载 ZenRainscape 组件并配置 transition:persist 持久化', () => {
    const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');
    const content = fs.readFileSync(baseLayoutPath, 'utf8');

    assert.ok(content.includes('import ZenRainscape from'), 'BaseLayout 应导入 ZenRainscape');
    assert.ok(content.includes('<ZenRainscape transition:persist />'), 'BaseLayout 应挂载 ZenRainscape 并保持页面切换连续性');
  });

  it('3. ZenSoundscape: 包含烟雨画境开关控制与状态同步', () => {
    const soundscapePath = path.join(rootDir, 'src/components/ZenSoundscape.astro');
    const content = fs.readFileSync(soundscapePath, 'utf8');

    assert.ok(content.includes('data-zen-rain-toggle'), '应包含 data-zen-rain-toggle 开关元素');
    assert.ok(content.includes('zen-rain-toggle-pill'), '应包含 zen-rain-toggle-pill 药丸按钮样式与标记');
    assert.ok(content.includes('zen-rain-disabled'), '应支持本地偏好记忆或状态持久化');
  });

  it('4. index.astro & 架构纯净性: 已完全移除 XingChuiYeHero 点阵组件与冗余包', () => {
    const xingchuiyePath = path.join(rootDir, 'src/components/XingChuiYeHero.astro');
    assert.ok(!fs.existsSync(xingchuiyePath), 'XingChuiYeHero.astro 文件应已被彻底移除');

    const indexPath = path.join(rootDir, 'src/pages/index.astro');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    assert.ok(!indexContent.includes('XingChuiYeHero'), 'index.astro 中不应包含任何 XingChuiYeHero 痕迹');

    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    assert.ok(!packageJson.dependencies?.three, 'package.json dependencies 中不应再包含 three');
  });

  it('5. home-stats-strip: 水墨渐隐长卷胶囊具备磁吸滑块、淡化边缘与快捷导航链接', () => {
    const indexPath = path.join(rootDir, 'src/pages/index.astro');
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    assert.ok(indexContent.includes('home-stats-strip'), '应包含 home-stats-strip 胶囊容器');
    assert.ok(indexContent.includes('stats-glider'), '应包含 stats-glider 磁吸滑块');
    assert.ok(indexContent.includes('href="/archive"'), 'Posts 应链接至 /archive 归档');
    assert.ok(indexContent.includes('href="/tags"'), 'Tags 应链接至 /tags 标签');
    assert.ok(indexContent.includes('href="/timeline"'), 'Year 应链接至 /timeline 时间轴');

    const globalCssPath = path.join(rootDir, 'src/styles/global.css');
    const globalCss = fs.readFileSync(globalCssPath, 'utf8');
    assert.ok(globalCss.includes('.home-stats-strip'), 'global.css 应定义 .home-stats-strip');
    assert.ok(globalCss.includes('.stats-glider'), 'global.css 应定义 .stats-glider');
  });

  it('6. 首页标题防折断与右侧间距优化: 语义词组块与自适应宽度', () => {
    const indexPath = path.join(rootDir, 'src/pages/index.astro');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    assert.ok(indexContent.includes('hero-title-phrase inline-block whitespace-nowrap'), '首页标题应采用 hero-title-phrase 避免折断');
    assert.ok(indexContent.includes('欢迎光临'), '应包含“欢迎光临”词组');
    assert.ok(indexContent.includes('AreSet の Blog'), '应包含“AreSet の Blog”词组');

    const globalCssPath = path.join(rootDir, 'src/styles/global.css');
    const globalCss = fs.readFileSync(globalCssPath, 'utf8');
    assert.ok(globalCss.includes('.hero-title-phrase'), 'global.css 应包含 .hero-title-phrase 样式');
  });

  it('7. 归档页胶囊升级与「落墨生花」(bloom)入场动效', () => {
    const archivePath = path.join(rootDir, 'src/pages/archive.astro');
    const archiveContent = fs.readFileSync(archivePath, 'utf8');
    assert.ok(archiveContent.includes('archive-stats-strip'), '归档页应采用 archive-stats-strip 胶囊');
    assert.ok(archiveContent.includes('data-enter="bloom"'), '归档页统计条应启用落墨生花 bloom 动效');
    assert.ok(!archiveContent.includes('stat-card archive-metric-card'), '归档页应已彻底淘汰旧方块印章卡片');

    const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');
    const baseLayoutContent = fs.readFileSync(baseLayoutPath, 'utf8');
    assert.ok(baseLayoutContent.includes("kind === 'bloom'"), 'BaseLayout 应支持 kind === bloom 动效');
    assert.ok(baseLayoutContent.includes('ENTER_ORDER = { left: 0, right: 0, top: 1, bottom: 1, scale: 2, stamp: 2, bloom: 2, ink: 3 }'), 'ENTER_ORDER 应包含 bloom');
  });

  it('8. ZenRainscape: 彻底杜绝底部积水与雾斑积块，纯净自然湖面微澜荡漾', () => {
    const rainscapePath = path.join(rootDir, 'src/components/ZenRainscape.astro');
    const content = fs.readFileSync(rainscapePath, 'utf8');
    assert.ok(!content.includes('splashes'), '不应存在屏幕底部积水飞溅逻辑');
    assert.ok(!content.includes('mists'), '不应存在大片渐变灰色水渍/云斑 (mists) 产生积水感');
    assert.ok(content.includes('spawnLakeRipple'), '应包含周期性随机微澜波纹生成系统');
    assert.ok(content.includes('lakeRipples'), '应包含 lakeRipples 波纹阵列');
  });

  it('9. 首页与归档页数据条入场动效统一: 均采用 bloom 墨韵生花', () => {
    const indexPath = path.join(rootDir, 'src/pages/index.astro');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    assert.ok(indexContent.includes('class="home-stats-strip" data-enter="bloom"'), '首页 home-stats-strip 应统一使用 data-enter="bloom"');

    const archivePath = path.join(rootDir, 'src/pages/archive.astro');
    const archiveContent = fs.readFileSync(archivePath, 'utf8');
    assert.ok(archiveContent.includes('class="archive-stats-wrap" data-enter="bloom"'), '归档页统计条应使用 data-enter="bloom"');
  });

  it('10. 烟雨微气象跨路由持久化: canvas 具备 transition:persist 且监听 astro:page-load', () => {
    const rainscapePath = path.join(rootDir, 'src/components/ZenRainscape.astro');
    const content = fs.readFileSync(rainscapePath, 'utf8');
    assert.ok(content.includes('transition:persist="zen-rain-canvas"'), 'zenRainCanvas 应声明 transition:persist');
    assert.ok(content.includes('astro:page-load'), '应监听 astro:page-load 重新校验状态并保持动画运行');
    assert.ok(content.includes('syncWithAudio'), '页面切换时应自动同步当前音频状态');
  });
});
