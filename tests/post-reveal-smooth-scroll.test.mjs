import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const postLayoutPath = path.join(rootDir, 'src/layouts/PostLayout.astro');
const globalCssPath = path.join(rootDir, 'src/styles/global.css');

test('Post Reveal Smooth Scroll, Shared Easing & Guaranteed Replay Suite (Option B Dual-Hysteresis)', async (t) => {
  const postLayoutContent = fs.readFileSync(postLayoutPath, 'utf-8');
  const globalCssContent = fs.readFileSync(globalCssPath, 'utf-8');

  await t.test('1. PostLayout.astro 双阈值迟滞观察器: 视口内绝对禁止中途拔除 is-in (杜绝抽搐)', () => {
    // 验证 revealObserver 进场观察器
    assert.match(
      postLayoutContent,
      /const\s+revealObserver\s*=\s*new\s+IntersectionObserver\(/,
      'PostLayout.astro 必须创建 revealObserver 进场观察器'
    );
    assert.match(
      postLayoutContent,
      /revealObserver[\s\S]*?entry\.isIntersecting[\s\S]*?classList\.add\('is-in'\)/,
      'revealObserver 进场时添加 is-in'
    );
    // 验证 revealObserver 不会在视口内或边缘直接 remove is-in
    const revealObserverMatch = postLayoutContent.match(/const\s+revealObserver\s*=\s*new\s+IntersectionObserver\([\s\S]*?\},\s*\{\s*rootMargin:\s*'0px 0px -4% 0px'/);
    assert.ok(revealObserverMatch, '必须找到 revealObserver 定义');
    assert.doesNotMatch(
      revealObserverMatch[0],
      /classList\.remove\('is-in'\)/,
      'revealObserver 内部绝不能拔除 is-in，防止视口边缘拉扯造成抽搐'
    );
  });

  await t.test('2. PostLayout.astro 单次温润显形观察器: 显现后立即 unobserve，上下回滚零闪烁重播', () => {
    // 验证一旦进入视口显现即调用 unobserve，绝不因回滚剥离 .is-in
    assert.match(
      postLayoutContent,
      /revealObserver\.unobserve\(el\)/,
      'PostLayout.astro 必须在段落显现后立即 unobserve，杜绝上下回滚反复重播闪烁'
    );
    assert.doesNotMatch(
      postLayoutContent,
      /resetObserver/,
      'PostLayout.astro 不得再使用 resetObserver 剥离已读段落的 .is-in 状态'
    );
    assert.doesNotMatch(
      postLayoutContent,
      /resetTitleAndDate\(/,
      'PostLayout.astro 不得在回滚顶部时重置抹除已停靠标题与日期'
    );
    // 验证路由跳转与销毁时正确断开观察器
    assert.match(
      postLayoutContent,
      /revealObserver\.disconnect\(\);/,
      '路由跳转与销毁时必须正确断开观察器'
    );
  });

  await t.test('2b. 从视口上方进入的未进场块静默显形，绝不逆着手势播动画', () => {
    const revealObserverMatch = postLayoutContent.match(/const\s+revealObserver\s*=\s*new\s+IntersectionObserver\([\s\S]*?\},\s*\{\s*rootMargin:\s*'0px 0px -4% 0px'/);
    assert.ok(revealObserverMatch, '必须找到 revealObserver 定义');
    assert.match(
      revealObserverMatch[0],
      /entry\.boundingClientRect\.top\s*<\s*0[\s\S]*?classList\.add\('pr-instant',\s*'is-in'\)/,
      'revealObserver 对从上方进入的块必须附加 pr-instant 抑制过渡'
    );
    assert.match(
      revealObserverMatch[0],
      /requestAnimationFrame\([\s\S]*?classList\.remove\('pr-instant'\)/,
      'pr-instant 必须在渲染一帧后移除'
    );
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\.pr-instant[\s\S]*?transition:\s*none\s*!important;[\s\S]*?animation:\s*none\s*!important;/,
      'global.css 必须提供 .pr-instant 过渡与动画抑制规则'
    );
  });

  await t.test('3. global.css 彻底消除 68px / 36px 滚动方向瞬时突变撕裂', () => {
    assert.doesNotMatch(
      globalCssContent,
      /html\[data-scroll-dir="up"\]\s+\.prose\s+\.pr\[data-pr="block"\]:not\(\.is-in\)/,
      'global.css 必须彻底移除 html[data-scroll-dir="up"] 对段落 -34px 的逆向跳变规则'
    );
    assert.doesNotMatch(
      globalCssContent,
      /html\[data-scroll-dir="up"\]\s+\.prose\s+\.pr\[data-pr="quote"\]:not\(\.is-in\)/,
      'global.css 必须彻底移除 html[data-scroll-dir="up"] 对引用 -18px 的逆向跳变规则'
    );
  });

  await t.test('4. global.css 正文、章节标题与媒体使用温润统一曲线，H2/H3 完成态严格归零', () => {
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\.is-in\s*\{[^}]*transform\s+620ms\s+var\(--article-ease-reveal\)/,
      '正文使用 620ms 轻盈位移与共享宣纸阅读曲线'
    );
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="heading"\]\.is-in\s*\{[^}]*transform:\s*translate3d\(0,\s*0,\s*0\);/,
      'H2 章节标题完成态位移严格归零'
    );
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="subheading"\]\.is-in\s*\{[^}]*transform:\s*translate3d\(0,\s*0,\s*0\);/,
      'H3 章节标题完成态位移严格归零'
    );
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="heading"\]\.is-in::before\s*\{[^}]*transform\s+680ms\s+var\(--article-ease-reveal\)/,
      '标题毛笔分隔线与正文同步舒展'
    );
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="code"\]\.is-in[^}]*transform\s+620ms\s+var\(--article-ease-reveal\)/,
      '代码块入场过渡必须包含 GPU 加速 transform'
    );
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="image"\]\.is-in[^}]*transform\s+620ms\s+var\(--article-ease-reveal\)/,
      '图片和代码块使用相同阅读曲线'
    );
  });
});
