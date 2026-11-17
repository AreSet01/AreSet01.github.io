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

  await t.test('2. PostLayout.astro 120px+ 离屏静默重置: 仅重置视口下方的块，向上滚动零逆向位移', () => {
    // 验证 resetObserver 离屏观察器
    assert.match(
      postLayoutContent,
      /const\s+resetObserver\s*=\s*new\s+IntersectionObserver\(/,
      'PostLayout.astro 必须创建 resetObserver 离屏观察器'
    );
    // 验证 120px 缓冲区迟滞死区
    assert.match(
      postLayoutContent,
      /resetObserver[\s\S]*?rootMargin:\s*'120px 0px 120px 0px'/,
      'resetObserver 必须具备 120px 扩展缓冲区作为迟滞死区'
    );
    // 验证仅在超出 120px 时才重置 is-in
    assert.match(
      postLayoutContent,
      /resetObserver[\s\S]*?!entry\.isIntersecting[\s\S]*?entry\.target\.classList\.remove\('is-in'\)/,
      'resetObserver 仅在元素彻底移出屏幕 120px 以外时才安全移除 is-in 供下次重播'
    );
    // 方向守卫：留在视口上方的块必须保持进场态，否则向上滚动时内容会逆着手势重新位移
    assert.match(
      postLayoutContent,
      /resetObserver[\s\S]*?!entry\.isIntersecting[\s\S]*?if\s*\(entry\.boundingClientRect\.top\s*<=\s*0\)\s*return;[\s\S]*?entry\.target\.classList\.remove\('is-in'\)/,
      'resetObserver 必须跳过视口上方的块，只给落到下方的块重新上膛'
    );
    // 验证生命周期清理
    assert.match(
      postLayoutContent,
      /revealObserver\.disconnect\(\);[\s\S]*?resetObserver\.disconnect\(\);/,
      '路由跳转与销毁时必须正确断开双观察器'
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
      'pr-instant 必须在渲染一帧后移除，不得污染后续重播'
    );
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\.pr-instant[\s\S]*?transition:\s*none\s*!important;[\s\S]*?animation:\s*none\s*!important;/,
      'global.css 必须提供 .pr-instant 过渡与动画抑制规则'
    );
  });

  await t.test('3. global.css 彻底消除 68px / 36px 滚动方向瞬时突变撕裂', () => {
    // 验证不再包含依据 data-scroll-dir="up" 逆向扭转未入场位移的规则
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

  await t.test('4. global.css 正文和媒体使用统一曲线，过渡仅在 is-in 时生效', () => {
    // 限定到当前 CSS 规则，避免跨越后面的选择器而误匹配。
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\.is-in\s*\{[^}]*transform\s+1100ms\s+var\(--article-ease-reveal\)/,
      '正文使用 1100ms 位移与共享阅读曲线'
    );
    // 分隔线与正文使用相同节拍。
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="heading"\]\.is-in::before\s*\{[^}]*transform\s+1100ms\s+var\(--article-ease-reveal\)/,
      '标题分隔线与正文同步舒展'
    );
    // 验证代码块 GPU 纯合成入场动画 (transform + opacity)
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="code"\]\.is-in[^}]*transform\s+1000ms\s+var\(--article-ease-reveal\)/,
      '代码块入场过渡必须包含 GPU 加速 transform'
    );
    // 图片沿用原有缩放，节奏与代码块一致。
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="image"\]\.is-in[^}]*transform\s+1000ms\s+var\(--article-ease-reveal\)/,
      '图片和代码块使用相同阅读曲线'
    );
  });
});
