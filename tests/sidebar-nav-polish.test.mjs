import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('侧边栏极简无边框排版光学居中与搜索栏同款物理磁吸游标验证', () => {
  const rootDir = process.cwd();

  it('1. Header.astro: 包含 nav-magnetic-glider 元素与 data-nav 标识', () => {
    const headerPath = path.join(rootDir, 'src/components/Header.astro');
    assert.ok(fs.existsSync(headerPath), 'Header.astro 应存在');
    const content = fs.readFileSync(headerPath, 'utf8');

    assert.ok(content.includes('class="nav-magnetic-glider"'), '应包含 nav-magnetic-glider 磁吸游标元素');
    assert.ok(content.includes('data-nav-glider'), '应包含 data-nav-glider 属性');
    assert.ok(content.includes('data-nav-links'), '应包含 data-nav-links 容器标识');
    assert.ok(content.includes('data-nav-link'), '各菜单项应包含 data-nav-link 标识');
  });

  it('2. 样式规范: 导航块光学居中、间距宽裕舒展、纯文本无边框与水墨游标', () => {
    const headerPath = path.join(rootDir, 'src/components/Header.astro');
    const headerContent = fs.readFileSync(headerPath, 'utf8');
    assert.ok(headerContent.includes('padding-left: clamp(1.4rem, 2.4vw, 2.8rem)'), 'nav-links 应设置光学居中左内边距');
    assert.ok(headerContent.includes('gap: clamp(1.05rem, 2.5vh, 1.7rem)'), 'nav-links 应扩大纵向间距避免拥挤');
    assert.ok(headerContent.includes('letter-spacing: 0.2em'), 'nav-link 应具备 0.2em 舒展呼吸感字距');

    const globalCssPath = path.join(rootDir, 'src/styles/global.css');
    const globalCss = fs.readFileSync(globalCssPath, 'utf8');
    assert.ok(globalCss.includes('.nav-magnetic-glider'), 'global.css 应定义 .nav-magnetic-glider');
  });

  it('3. 搜索栏同款 GSAP 物理磁吸交互规范: 基础右移展开、物理微浮跟随与果冻回弹', () => {
    const headerPath = path.join(rootDir, 'src/components/Header.astro');
    const content = fs.readFileSync(headerPath, 'utf8');

    assert.ok(content.includes('setupNavMagneticGliderController'), '应包含 setupNavMagneticGliderController 控制器');
    assert.ok(content.includes("import gsap from 'gsap'"), '控制器应引入 GSAP 物理动效引擎');
    assert.ok(content.includes('pointermove'), '应监听 pointermove 进行鼠标微距物理牵引');
    assert.ok(content.includes('elastic.out(1, 0.45)'), '移出时应采用搜索栏同款 elastic.out 果冻弹性回弹');
    assert.ok(content.includes('x: 8'), '悬停时应向右基础展开 8px');
    assert.ok(content.includes('x: isActive ? 4 : 0') || content.includes('x: 4'), '活跃项静止时应轻微前突 4px 保持辨识度');
    assert.ok(content.includes('resetToActive'), '应包含 resetToActive 归位机制');
    assert.ok(content.includes("document.addEventListener('astro:page-load'"), '应监听 astro:page-load 确保切页后准确定位');
    assert.ok(content.includes('prefers-reduced-motion'), '必须具备减弱动态降级保护');

    // 验证 BaseLayout 解除泛型绑定冲突
    const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');
    const baseLayoutContent = fs.readFileSync(baseLayoutPath, 'utf8');
    assert.ok(
      !baseLayoutContent.includes("'.btn-primary, .btn-secondary, .nav-link, .tag-chip, .nav-search-trigger'"),
      'BaseLayout 不应对 .nav-link 叠加重复泛型监听，防止冲突'
    );
  });
});
