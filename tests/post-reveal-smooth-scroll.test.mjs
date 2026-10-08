import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const postLayoutPath = path.join(rootDir, 'src/layouts/PostLayout.astro');
const globalCssPath = path.join(rootDir, 'src/styles/global.css');

test('Post Reveal Smooth Scroll & Anti-Chatter Suite (Option B)', async (t) => {
  const postLayoutContent = fs.readFileSync(postLayoutPath, 'utf-8');
  const globalCssContent = fs.readFileSync(globalCssPath, 'utf-8');

  await t.test('1. PostLayout.astro 动画播放锁保护: 播放中绝不中途拔除 is-in (杜绝抽搐)', () => {
    // 验证 ANIM_LOCK_MS 状态锁存在
    assert.match(
      postLayoutContent,
      /const\s+ANIM_LOCK_MS\s*=\s*650;/,
      'PostLayout.astro 必须设置 ANIM_LOCK_MS 动画锁定窗口'
    );
    // 验证锁定标记
    assert.match(
      postLayoutContent,
      /el\.dataset\.animLocked\s*=\s*'true';/,
      '进入视口时必须标记 animLocked 锁死状态'
    );
    // 验证离场拦截: 锁定态禁止拔除 is-in
    assert.match(
      postLayoutContent,
      /if\s*\(el\.dataset\.animLocked\s*===\s*'true'\)\s*\{\s*return;\s*\}/,
      '离场时若处于 animLocked 锁定态，必须直接 return 严禁中途拔除 is-in 造成抽搐'
    );
  });

  await t.test('2. 视口外安全重置与往返重播保护 (保持方案 B 进出场回放特性)', () => {
    // 验证仅当元素真正滑出可视视口时，才允许移除 is-in
    assert.match(
      postLayoutContent,
      /rect\.bottom\s*<\s*-40\s*\|\|\s*rect\.top\s*>\s*window\.innerHeight\s*\+\s*40/,
      '必须在确凿离开视口外部安全距离后才允许重置 is-in，防止临界线微抖'
    );
    // 验证 lockTimer 在清理函数中被正确管理
    assert.match(
      postLayoutContent,
      /timers\.push\(lockTimer\);/,
      'lockTimer 必须压入 timers 队列以支持路由切换时的安全清理'
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

  await t.test('4. global.css 动效时长收敛优化: 告别 1.7 秒超长脆弱期', () => {
    // 验证通用段落过渡时长收敛至 500ms~600ms
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\s*\{[\s\S]*?opacity\s+500ms[\s\S]*?transform\s+600ms[\s\S]*?\}/,
      '.prose .pr 通用段落过渡时间必须收敛至 500ms/600ms'
    );
    // 验证初始偏移由过大的 34px 收敛至柔和的 20px
    assert.match(
      globalCssContent,
      /\.prose\s+\.pr\s*\{[\s\S]*?transform:\s*translate3d\(0,\s*20px,\s*0\);/,
      '.prose .pr 初始进场位移必须采用平滑的 20px'
    );
  });
});
