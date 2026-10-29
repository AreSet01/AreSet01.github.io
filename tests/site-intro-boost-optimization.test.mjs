import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const siteIntroPath = path.join(rootDir, 'src/components/SiteIntro.astro');
const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');

test('SiteIntro Boost Performance Optimization Suite', async (t) => {
  const siteIntroContent = fs.readFileSync(siteIntroPath, 'utf-8');
  const baseLayoutContent = fs.readFileSync(baseLayoutPath, 'utf-8');

  await t.test('1. 方案一：Canvas 渲染 Alpha 分桶批处理消除 Draw Call 爆炸', () => {
    // 验证使用 Path2D 分桶
    assert.match(
      siteIntroContent,
      /const p100 = new Path2D\(\);/,
      'SiteIntro 必须包含 1.0 档透明度 Path2D 批处理桶'
    );
    assert.match(
      siteIntroContent,
      /const p70 = new Path2D\(\);/,
      'SiteIntro 必须包含 0.7 档透明度 Path2D 批处理桶'
    );
    assert.match(
      siteIntroContent,
      /const p40 = new Path2D\(\);/,
      'SiteIntro 必须包含 0.4 档透明度 Path2D 批处理桶'
    );
    assert.match(
      siteIntroContent,
      /const p15 = new Path2D\(\);/,
      'SiteIntro 必须包含 0.15 档透明度 Path2D 批处理桶'
    );

    // 验证各档位统一 ctx.fill(path)
    assert.match(
      siteIntroContent,
      /ctx!\.globalAlpha = 1;[\s\S]*?ctx!\.fill\(p100\);/,
      'SiteIntro 必须单次 fill(p100)'
    );
    assert.match(
      siteIntroContent,
      /ctx!\.globalAlpha = 0\.7;[\s\S]*?ctx!\.fill\(p70\);/,
      'SiteIntro 必须单次 fill(p70)'
    );
    assert.match(
      siteIntroContent,
      /ctx!\.globalAlpha = 0\.4;[\s\S]*?ctx!\.fill\(p40\);/,
      'SiteIntro 必须单次 fill(p40)'
    );
    assert.match(
      siteIntroContent,
      /ctx!\.globalAlpha = 0\.15;[\s\S]*?ctx!\.fill\(p15\);/,
      'SiteIntro 必须单次 fill(p15)'
    );

    // 验证杜绝在粒子循环中调用浮点 setA() 导致每帧数千次 flush
    assert.ok(
      !siteIntroContent.includes('setA(Math.max(0, life[i]))'),
      'SiteIntro 绝不能在单粒子内调用连续浮点 setA'
    );
  });

  await t.test('2. 方案二：物理模拟步进封顶与 M_HOME 避免 Math.hypot 开销', () => {
    // 验证追赶步数上限封顶至 n < 2，且超时丢弃
    assert.match(
      siteIntroContent,
      /while \(acc >= STEP && n < 2\)/,
      'SiteIntro 物理追赶步数上限必须压紧至 n < 2'
    );
    assert.match(
      siteIntroContent,
      /if \(acc >= STEP\) \{\s*acc = 0;\s*simT = t;\s*\}/,
      'SiteIntro 超时步数累加必须丢弃重置以防止计算滚雪球'
    );

    // 验证 M_HOME 中使用平方距离/速度限制避免连续 Math.hypot
    assert.match(
      siteIntroContent,
      /const vSq = vx\[i\] \* vx\[i\] \+ vy\[i\] \* vy\[i\];/,
      'SiteIntro 物理模拟必须使用平方速度检验'
    );
    assert.match(
      siteIntroContent,
      /if \(vSq > 9000000\)/,
      'SiteIntro M_HOME 速度上限必须先通过 vSq > 9000000 阈值避免无脑 Math.hypot'
    );
  });

  await t.test('3. 方案三：预先计算 computeHomes 消除 7.9s 重排与回读', () => {
    // 验证存在 cachedHomes 缓存结构与 getHomes 包装函数
    assert.match(
      siteIntroContent,
      /let cachedHomes:/,
      'SiteIntro 必须声明 cachedHomes 变量'
    );
    assert.match(
      siteIntroContent,
      /function getHomes\(\)/,
      'SiteIntro 必须定义 getHomes 缓存访问器'
    );

    // 验证 assignHomes 使用 getHomes 而非在 7.9s 现场同步重复执行 computeHomes
    assert.match(
      siteIntroContent,
      /const homes = getHomes\(\);/,
      'assignHomes 必须通过 getHomes 优先读取缓存'
    );

    // 验证在 6.0~6.2s 静止待机中段预先计算并缓存目标坐标
    assert.match(
      siteIntroContent,
      /tl\.call\(\(\) => \{\s*getHomes\(\);\s*\}, undefined, 6\.2\);/,
      'SiteIntro 时间轴必须在中段静止期 (6.2s) 提前预计算 homes'
    );
  });

  await t.test('4. 方案四：生命周期加速淘汰与 BaseLayout lagSmoothing 恢复', () => {
    // 验证 M_LAND 加快消亡
    assert.match(
      siteIntroContent,
      /life\[i\] -= dt \/ 0\.18;/,
      'M_LAND 衰减必须加速 (dt / 0.18)'
    );

    // 验证存活粒子降至极少阈值提前平滑收尾
    assert.match(
      siteIntroContent,
      /if \(spawned && alive <= 20 && t >= T\.release \+ 0\.35\) \{\s*finish\(\);\s*return;\s*\}/,
      'SiteIntro 存活粒子降至极少时必须在入场后提前平滑收尾'
    );

    // 验证 BaseLayout 恢复 gsap.ticker.lagSmoothing(500, 33)
    assert.match(
      baseLayoutContent,
      /gsap\.ticker\.lagSmoothing\(500,\s*33\);/,
      'BaseLayout.astro 必须恢复 gsap.ticker.lagSmoothing(500, 33)'
    );
  });
});
