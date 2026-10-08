import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const postLayoutPath = path.join(rootDir, 'src/layouts/PostLayout.astro');
const globalCssPath = path.join(rootDir, 'src/styles/global.css');

test('Post Reveal Smooth Scroll, 900ms Transition & Guaranteed Replay Suite (Option B Dual-Hysteresis)', async (t) => {
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
      /revealObserver[\s\S]*?entry\.isIntersecting[\s\S]*?entry\.target\.classList\.add\('is-in'\)/,
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

  await t.test('2. PostLayout.astro 120px+ 离屏静默重置: 确保往返滚动 100% 完整重播 (解决重放缺失)', () => {
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
    // 验证生命周期清理
    assert.match(
      postLayoutContent,
      /revealObserver\.disconnect\(\);[\s\S]*?resetObserver\.disconnect\(\);/,
      '路由跳转与销毁时必须正确断开双观察器'
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

  await t.test('4. global.css 动效时长设定为 900ms 且仅在 is-in 进场生效 (离屏静默就绪)', () => {
    // 验证通用段落过渡时长设定为 900ms
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\.is-in\s*\{[\s\S]*?transform\s+900ms[\s\S]*?\}/,
      '.prose .pr.is-in 通用段落过渡时间必须设为 900ms'
    );
    // 验证标题下划线设定为 900ms
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="heading"\]\.is-in::before\s*\{[\s\S]*?transform\s+900ms[\s\S]*?\}/,
      '标题划线入场过渡时间必须设为 900ms'
    );
    // 验证代码块扫描动画与裁切设定为 900ms
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="code"\]\.is-in\s*>\s*pre\s*\{[\s\S]*?clip-path\s+900ms[\s\S]*?\}/,
      '代码块入场裁切必须设为 900ms'
    );
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="code"\]\.is-in\s*>\s*pre::after\s*\{[\s\S]*?codeScan\s+900ms[\s\S]*?\}/,
      '代码块光标扫描动画必须设为 900ms'
    );
    // 验证图片展开与缩放设定为 900ms
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="image"\]\.is-in\s*>\s*\*\s*\{[\s\S]*?clip-path\s+900ms[\s\S]*?\}/,
      '图片扩散展开必须设为 900ms'
    );
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\[data-pr="image"\]\.is-in\s+img\s*\{[\s\S]*?transform\s+900ms[\s\S]*?\}/,
      '图片缓动缩放必须设为 900ms'
    );
  });
});
