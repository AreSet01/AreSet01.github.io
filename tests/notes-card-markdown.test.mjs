import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const notes = fs.readFileSync(path.join(rootDir, 'src/pages/notes.astro'), 'utf-8');

test('笔记卡片：墨问 AI 摘录用 question + markdown 渲染答复，不再使用不存在的 prompt 字段', () => {
  // 数据模型（ArticleHighlightRecord）只有 question，没有 prompt；
  // 误用 prompt 会让整段答复被 escapeHtml 后塞进「问：」一行，** 与 ` 全裸。
  assert.ok(!notes.includes('note.prompt'), 'note.prompt 字段不存在于 ArticleHighlightRecord，必须改用 note.question');

  assert.ok(
    notes.includes("const cleanQuestion = String(note.question || '')"),
    'ai 卡片必须从 note.question 取提问'
  );
  assert.ok(
    notes.includes("${renderNoteMarkdown(note.text || '')}"),
    'ai 卡片必须用 renderNoteMarkdown 渲染答复正文（note.text），而不是 escapeHtml'
  );
  assert.ok(
    !notes.includes("renderNoteMarkdown(note.comment || '')"),
    'ai 卡片不能拿 note.comment 当答复正文（墨问记录没有 comment，会渲染成空框）'
  );
});
