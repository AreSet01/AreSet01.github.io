import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf-8');
const PAGES = { notes: read('src/pages/notes.astro'), life: read('src/pages/life.astro') };

test('普通筛选：换骨前先量落点，用 0.26s 预滚动代替「一帧钳到新上限」', () => {
  for (const [name, src] of Object.entries(PAGES)) {
    assert.ok(src.includes('function captureViewportAnchor('), `${name}: 必须有「视口顶部那张卡」的锚点函数`);
    assert.ok(src.includes('predictedMax'), `${name}: 必须量出筛完后的滚动上限`);
    assert.ok(src.includes('duration: 0.26'), `${name}: 预滚动时长必须是 0.26s（卷收窗口内）`);
    assert.ok(
      src.includes('refreshScroll({ clamp: false })'),
      `${name}: 换骨帧必须关闭硬钳制，否则会打断预滚动`
    );
    // 落点兜底顺序：锚点 → 最近卡片 → 新的滚动上限
    assert.match(src, /Math\.min\(anchorScroll \?\? predictedMax, predictedMax\)/, `${name}: 落点必须夹在 [0, 新上限] 内`);
  }

  // notes 的不可见测量：暂时挂新布局、量完还原旧列
  assert.ok(PAGES.notes.includes('const oldCols = Array.from(container.children)'), 'notes: 测量前必须暂存旧列');
  assert.ok(PAGES.notes.includes('oldCols.forEach((col) => container.appendChild(col))'), 'notes: 测量后必须还原旧列');
  // life 的不可见测量：临时切换 is-filtered-out 再按快照还原
  assert.ok(PAGES.life.includes('const prevHidden = cards.map('), 'life: 测量前必须记录可见性快照');
  assert.ok(PAGES.life.includes("cards.forEach((c, i) => c.classList.toggle('is-filtered-out', prevHidden[i]))"), 'life: 测量后必须还原可见性');
});

test('普通筛选：不引入高度锁（上一版方案已被否，防止回潮）', () => {
  for (const [name, src] of Object.entries(PAGES)) {
    assert.ok(!src.includes('lockBoardHeight'), `${name}: 不应再出现高度锁 lockBoardHeight`);
    assert.ok(!src.includes('lockGridHeight'), `${name}: 不应再出现高度锁 lockGridHeight`);
    assert.ok(!src.includes('releaseBoardHeight'), `${name}: 不应再出现高度锁 releaseBoardHeight`);
    assert.ok(!src.includes('releaseGridHeight'), `${name}: 不应再出现高度锁 releaseGridHeight`);
  }
});
