import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const notes = fs.readFileSync(path.join(rootDir, 'src/pages/notes.astro'), 'utf-8');

test('笔记卡片：移除贴边直角色条，颜色改由「徽标色点 + 引文块书脊」承载', () => {
  assert.ok(!notes.includes('card-accent-strip'), '不能再使用 absolute 贴边色条：直角会压在卡片圆角上');
  assert.ok(!notes.includes('accentStrip'), '模板里不应再拼接色条节点');

  // 颜色通过 CSS 变量下发，供色点光晕与引文块书脊共用
  assert.ok(
    notes.includes("card.style.setProperty('--note-accent', accentColor)"),
    '卡片必须把笔记色写成 --note-accent，色点/书脊才能取到同一份颜色'
  );
  assert.ok(notes.includes('class="note-color-dot"'), '顶栏必须提供笔记色圆点');
  assert.ok(notes.includes("title=\"笔记颜色：${colorLabel(note.color)}\""), '色点必须带颜色名称提示');

  // 引文块书脊：真 border-left 会跟随圆角，不再出现直角压圆角
  assert.ok(
    notes.includes('border-left: 3px solid var(--note-accent, var(--ink-strong));'),
    '划线引文块左边框必须使用笔记色 3px 书脊'
  );
  assert.ok(notes.includes('color-mix(in srgb, var(--note-accent'), '引文块需要一层同色淡晕，替代原先的高饱和粗色条');
  assert.match(
    notes,
    /:global\(\.note-card-quote\) \{[\s\S]*?border-radius: 10px;/,
    '引文块圆角需与书脊一致（10px），圆角层级更统一'
  );
  assert.match(
    notes,
    /:global\(\.notes-card\) \{[\s\S]*?border-radius: 14px;/,
    '卡片外圆角应提升到 14px，与内层 10px 形成统一层级'
  );
});

test('笔记卡片：色点提供完整颜色名称映射', () => {
  for (const label of ['朱红', '靛青', '竹青', '雄黄', '赭金']) {
    assert.ok(notes.includes(`'${label}'`), `缺少颜色名称：${label}`);
  }
});
