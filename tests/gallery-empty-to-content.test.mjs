import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const gallery = fs.readFileSync(path.join(rootDir, 'src/pages/gallery.astro'), 'utf-8');

/**
 * gallery「空态 → 有内容」的坑：
 * 空态时网格容器是 min-height:0px、卡片是 is-filtered-out（display:none）。
 * 如果在场景 B 一开头就同步隐藏空面板，这一帧文档会短到「比视口还矮」，
 * 浏览器会把 scrollY 钳到顶部 —— 观感就是点一下直接跳回最顶、毫无过渡。
 * 所以面板的隐藏必须挪到换骨回调里，和「卡片恢复」落在同一帧（同帧只增不减）。
 */
test('gallery 空态 → 有内容：空面板隐藏与卡片恢复必须同一帧', () => {
  const idxSceneB = gallery.indexOf('// 场景 B：正常过滤有结果呈现');
  assert.ok(idxSceneB > -1, '找不到场景 B 的注释锚点，测试需要同步更新');

  const rest = gallery.slice(idxSceneB);

  // 1) 场景 B 开头（钉高之前）不能同步隐藏空面板
  const idxPin = rest.indexOf('// 动画期间将高度锁定');
  assert.ok(idxPin > -1, '找不到「动画期间将高度锁定」注释锚点');
  const preamble = rest.slice(0, idxPin);
  assert.ok(
    !preamble.includes("emptyState.classList.add('hidden')"),
    '场景 B 开头禁止同步隐藏空面板：会多出一帧「文档比视口还矮」，浏览器把滚动位置钳到顶部'
  );

  // 2) 隐藏必须出现在换骨回调里（和卡片恢复同帧）
  const idxAdd = rest.indexOf('tl.add(() => {');
  assert.ok(idxAdd > -1, '找不到换骨回调 tl.add(...)');
  const idxSwitchEnd = rest.indexOf('}, switchTime);', idxAdd);
  assert.ok(idxSwitchEnd > idxAdd, '找不到换骨回调的结束位置');
  const switchBody = rest.slice(idxAdd, idxSwitchEnd);
  assert.ok(
    switchBody.includes("emptyState.classList.add('hidden')"),
    '空面板的隐藏必须写在换骨回调里，与「卡片恢复」同帧执行'
  );
  assert.ok(
    switchBody.includes("card.classList.remove('is-filtered-out')"),
    '换骨回调里必须有卡片恢复，才能和面板隐藏同帧'
  );
});
