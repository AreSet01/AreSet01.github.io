import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const readPage = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf-8');

/**
 * 三页的「筛到 0 条」必须是同一条柔和时间线：
 *   ① 钉高 → ② 视口回流筛选栏 → ③ 卡片轻微下沉淡出 → ④ 换骨 + 空面板浮现 → ⑤ 高度塌缩收尾
 * 三页共用 src/utils/cardMotion.ts 的进退场参数，禁止任何一页单独回退到横向卷收。
 */
const PAGES = {
  gallery: readPage('src/pages/gallery.astro'),
  notes: readPage('src/pages/notes.astro'),
  life: readPage('src/pages/life.astro'),
};

const SHARED_CONSTANTS = [
  // ① 钉住容器高度
  ['container.style.minHeight', '切换前必须把容器高度钉在当前值'],
  // ② 视口回流到筛选栏
  ['offset: -90', '回滚锚点偏移必须与 gallery 一致'],
  ['duration: 0.65', '回滚时长必须与 gallery 一致'],
  // ③ 卡片离场：共享轻量下沉淡出，不再横向裁切
  ['addCardExit(tl,', '卡片离场必须走共享的 addCardExit'],
  ['cardExitDuration(', '换骨时刻必须由共享的 cardExitDuration 计算'],
  // ④ 空面板浮现：与卡片入场共用同一套姿势
  ['setCardEnterState(', '空面板必须使用共享的 setCardEnterState'],
  ['addCardEnter(', '空面板必须使用共享的 addCardEnter'],
  // ⑤ 高度塌缩
  ['duration: 0.55', '塌缩时长必须与 gallery 一致'],
  ['minHeight: 0,', '塌缩 tween 必须以 minHeight: 0 收尾'],
  ["container.style.minHeight = '0px';", '塌缩结束后必须把钉高落到 0'],
];

test('空状态动效：gallery / notes / life 共用同一套柔和卡片时间线', () => {
  for (const [name, src] of Object.entries(PAGES)) {
    for (const [needle, reason] of SHARED_CONSTANTS) {
      assert.ok(src.includes(needle), `${name}.astro 缺少 "${needle}"：${reason}`);
    }
    assert.ok(
      src.includes('window.scrollY > 80') || src.includes('window.scrollY <= 80'),
      `${name}.astro 必须按 gallery 的 scrollY > 80 阈值决定是否回滚视口`
    );
    assert.ok(!src.includes("clipPath: 'inset(0 100% 0 0)'"), `${name}.astro 不应再使用横向卷收`);
    assert.ok(!src.includes('x: -16'), `${name}.astro 不应再横向飞入`);
  }
});

test('notes / life：塌缩期间禁止强制钳制滚动，且 is-empty 只在高度归零后挂上', () => {
  for (const name of ['notes', 'life']) {
    const src = PAGES[name];

    assert.ok(
      src.includes('{ clamp?: boolean }') && src.includes('options.clamp !== false'),
      `${name}.astro 的 refreshScroll 必须真正识别 { clamp: false }（对象参数曾被当作 truthy）`
    );
    assert.ok(
      src.includes('refreshScroll({ clamp: false })'),
      `${name}.astro 的塌缩阶段必须用 refreshScroll({ clamp: false })`
    );
    assert.ok(
      (src.match(/refreshScroll\(\{ clamp: false \}\)/g) || []).length >= 2,
      `${name}.astro 的换骨帧与逐帧 onUpdate 都应关闭钳制`
    );
    assert.ok(
      src.includes('returnToFilterBar()') && src.includes('function returnToFilterBar()'),
      `${name}.astro 必须在空分支调用 returnToFilterBar()（对齐 gallery 的视口回流）`
    );

    // is-empty 只能出现在塌缩 tween 的 onComplete 里，紧接着把 min-height 落成 0
    assert.match(
      src,
      /container\.style\.minHeight = '0px';\s*\n\s*container\.classList\.add\('is-empty'\);/,
      `${name}.astro 必须先等塌缩到 0，再挂 is-empty（否则 display:none 会把 0.55s 塌缩变成单帧瞬塌）`
    );
  }
});

test('notes / life：空分支把淡出、空面板浮现、塌缩排在同一时间点并挂进 filterTimeline', () => {
  for (const name of ['notes', 'life']) {
    const src = PAGES[name];
    assert.match(
      src,
      /const switchTime = cardExitDuration\(/,
      `${name}.astro 必须用共享的 cardExitDuration 作为换骨时刻`
    );
    assert.match(
      src,
      /minHeight: 0,\s*\n\s*duration: 0\.55,/,
      `${name}.astro 的塌缩 tween 必须以 minHeight: 0 收尾`
    );
    assert.ok(
      src.includes('onUpdate: () => refreshScroll({ clamp: false })'),
      `${name}.astro 的塌缩必须逐帧刷新滚动上限（但不钳制）`
    );
  }
});
