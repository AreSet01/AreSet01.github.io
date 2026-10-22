import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const homeTickerPath = path.join(rootDir, 'src/components/HomeTicker.astro');
const postTransitionPath = path.join(rootDir, 'src/components/PostTransition.astro');
const zenRainscapePath = path.join(rootDir, 'src/components/ZenRainscape.astro');
const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');

test('Animation Buffering & Concurrency De-confliction Suite', async (t) => {
  const homeTickerContent = fs.readFileSync(homeTickerPath, 'utf-8');
  const postTransitionContent = fs.readFileSync(postTransitionPath, 'utf-8');
  const zenRainscapeContent = fs.readFileSync(zenRainscapePath, 'utf-8');
  const baseLayoutContent = fs.readFileSync(baseLayoutPath, 'utf-8');

  await t.test('1. HomeTicker: 输入端低通 EWMA 速度平滑滤波验证', () => {
    // 验证 EWMA 速度滤波计算
    assert.match(
      homeTickerContent,
      /smoothedVelocity\s*=\s*smoothedVelocity\s*\*\s*0\.35\s*\+\s*rawVelocity\s*\*\s*0\.65/,
      'HomeTicker 必须使用 EWMA 低通滤波平滑输入端速度信号'
    );
    // 验证基于平滑速度更新方向与加速
    assert.match(
      homeTickerContent,
      /state\.dirTarget\s*=\s*smoothedVelocity\s*>\s*0\s*\?\s*-1\s*:\s*1;/,
      'HomeTicker 必须根据平滑后的速度判定运动方向'
    );
  });

  await t.test('2. HomeTicker: gsap.quickTo 补间实例复用与果冻回弹 (settle) 保留', () => {
    // 验证使用 gsap.quickTo 避免高频 new Tween 与 GC
    assert.match(
      homeTickerContent,
      /setSkew\s*=\s*gsap\.quickTo\(state,\s*'skew',\s*\{\s*duration:\s*0\.35,\s*ease:\s*'power3\.out'\s*\}\)/,
      'HomeTicker 必须通过 gsap.quickTo 复用补间实例'
    );
    // 验证 settle 保持 elastic.out(1, 0.45) 果冻物理手感
    assert.match(
      homeTickerContent,
      /ease:\s*'elastic\.out\(1,\s*0\.45\)'/,
      'HomeTicker 停滚结算时必须保留 elastic.out 经典果冻物理过冲'
    );
    // 验证死区速断 (Deadband)
    assert.match(
      homeTickerContent,
      /Math\.abs\(state\.boost\s*-\s*1\)\s*<\s*0\.005\s*&&\s*state\.boostTarget\s*===\s*1/,
      'HomeTicker 必须具备 boost 接近 1 时的死区速断'
    );
    assert.match(
      homeTickerContent,
      /Math\.abs\(state\.skew\)\s*<\s*0\.008\s*&&\s*!gsap\.isTweening\(state\)/,
      'HomeTicker 必须具备 skew 接近 0 时的静默速断'
    );
  });

  await t.test('3. HomeTicker: 离屏休眠联动与 scrollWatcher 禁用', () => {
    assert.match(
      homeTickerContent,
      /if\s*\(entry\.isIntersecting\)\s*\{[\s\S]*?scrollWatcher\.enable\(\);[\s\S]*?\}\s*else\s*\{[\s\S]*?scrollWatcher\.disable\(\);[\s\S]*?\}/,
      'HomeTicker 必须在滑出视口时通过 IntersectionObserver 禁用 scrollWatcher'
    );
  });

  await t.test('4. PostTransition: 文章转场放行推迟至 p >= 0.75 时序串行化', () => {
    assert.match(
      postTransitionContent,
      /if\s*\(state\.p\s*>=\s*0\.75\s*&&\s*!released\)\s*\{\s*triggerHandover\(\);\s*\}/,
      'PostTransition 必须将交割放行点推迟至 state.p >= 0.75，使水墨渲染与正文排版彻底串行解耦'
    );
    // 确保不再包含过早的 0.20 放行
    assert.doesNotMatch(
      postTransitionContent,
      /state\.p\s*>=\s*0\.20/,
      'PostTransition 严禁在 p >= 0.20 提前放行导致 GPU 与 DOM 重排并发抢占'
    );
  });

  await t.test('5. BaseLayout & ZenRainscape: 模态框展开 (app:modal-enter) 下背景 rAF 挂起', () => {
    // 验证 BaseLayout 广播 app:modal-enter 与 app:modal-leave
    assert.match(
      baseLayoutContent,
      /window\.dispatchEvent\(new\s+CustomEvent\('app:modal-enter'\)\)/,
      'BaseLayout 必须在模态浮层激活时广播 app:modal-enter'
    );
    assert.match(
      baseLayoutContent,
      /window\.dispatchEvent\(new\s+CustomEvent\('app:modal-leave'\)\)/,
      'BaseLayout 必须在模态浮层全部关闭时广播 app:modal-leave'
    );

    // 验证 ZenRainscape 监听并挂起 rAF
    assert.match(
      zenRainscapeContent,
      /window\.addEventListener\('app:modal-enter',/,
      'ZenRainscape 必须监听 app:modal-enter'
    );
    assert.match(
      zenRainscapeContent,
      /window\.addEventListener\('app:modal-leave',/,
      'ZenRainscape 必须监听 app:modal-leave'
    );
    assert.match(
      zenRainscapeContent,
      /if\s*\(!ctx\s*\|\|\s*!canvas\s*\|\|\s*isModalActive\)\s*return;/,
      'ZenRainscape 循环中检测到 isModalActive 时必须暂停渲染'
    );
  });

  await t.test('6. BaseLayout: 环境粒子画布 (ambientCanvas) 280ms 停滚防抖唤醒与 SiteIntro 互斥', () => {
    // 验证 280ms 停滚防抖
    assert.match(
      baseLayoutContent,
      /scrollWakeTimer\s*=\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]*?wakeAmbient\(\);[\s\S]*?\},\s*280\);/,
      'BaseLayout 必须对滚动唤醒设置 280ms 防抖，高速滚动中保持静默'
    );
    // 验证 site-intro-active 期间环境粒子不竞争算力
    assert.match(
      baseLayoutContent,
      /function\s+isIntroActive\(\)\s*\{[\s\S]*?site-intro-active[\s\S]*?\}/,
      'BaseLayout 必须判定 site-intro-active 进场幕状态以避免开场 7000 粒子运算时背景微粒抢占'
    );
  });
});
