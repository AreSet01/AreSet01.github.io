import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('笔记与备注 Markdown 代码块与富文本渲染验证 (Notes Comment Markdown Suite)', () => {
  const rootDir = process.cwd();
  const dockPath = path.join(rootDir, 'src/components/ArticleSelectionDock.astro');
  const notesPagePath = path.join(rootDir, 'src/pages/notes.astro');

  it('1. ArticleSelectionDock: paintComment 采用 renderMarkdown 渲染包含代码块的备注', () => {
    assert.ok(fs.existsSync(dockPath), 'ArticleSelectionDock.astro 必须存在');
    const content = fs.readFileSync(dockPath, 'utf8');

    assert.ok(content.includes('body.innerHTML = renderMarkdown(md)'), 'paintComment 必须通过 renderMarkdown 渲染备注富文本');
    assert.ok(content.includes('notes-item-comment-body'), '必须挂载 notes-item-comment-body 容器');
    assert.ok(content.includes('.notes-item-comment-body pre'), '必须支持代码块 pre/code 专属样式');
  });

  it('2. notes.astro: 笔记管理页中的备注/想法全面支持 renderNoteMarkdown', () => {
    assert.ok(fs.existsSync(notesPagePath), 'notes.astro 必须存在');
    const content = fs.readFileSync(notesPagePath, 'utf8');

    assert.ok(content.includes('renderNoteMarkdown(note.comment)'), 'notes.astro 必须使用 renderNoteMarkdown 渲染评论');
  });
});
