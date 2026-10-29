import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const dockCode = fs.readFileSync(path.join(rootDir, 'src/components/ArticleSelectionDock.astro'), 'utf-8');
const notesCode = fs.readFileSync(path.join(rootDir, 'src/pages/notes.astro'), 'utf-8');

test('ArticleSelectionDock: 便签输入框与备注框永不截断按钮，展开时 overflow 为 visible 且 actions 不允许被压缩', () => {
  // 必须保证展开态为 overflow: visible，避免输入多行文字时保存/取消按钮被裁切掉
  assert.match(
    dockCode,
    /\.notes-composer\.is-open\s*\{[^}]*overflow:\s*visible;/,
    'notes-composer 展开时必须有 overflow: visible'
  );
  assert.match(
    dockCode,
    /\.notes-item-comment-editor\.is-open\s*\{[^}]*overflow:\s*visible;/,
    'notes-item-comment-editor 展开时必须有 overflow: visible'
  );
  assert.ok(
    dockCode.includes('flex-shrink: 0'),
    '操作按钮栏必须设置 flex-shrink: 0 杜绝被压缩消失'
  );
});

test('ArticleSelectionDock: 独立便签保存为 __standalone__ 并在抽屉中可随时通过「随笔」页签找到', () => {
  assert.ok(
    dockCode.includes("data-notes-filter=\"free\">随笔</button>"),
    '抽屉头部必须包含随笔（free）分类页签'
  );
  assert.ok(
    dockCode.includes("targetFilter === 'free'"),
    'switchNotesFilter 必须支持 free 随笔分类筛选'
  );
  assert.ok(
    dockCode.includes("postSlug: '__standalone__'"),
    '新建独立便签必须保存至 __standalone__ 桶，保证全站独立随笔便签真正独立且不随文章切换而丢失'
  );
  assert.ok(
    dockCode.includes("notifyNotesChanged()"),
    '必须同时向 document 和 window 派发 article-notes:changed 事件'
  );
});

test('ArticleSelectionDock & notes.astro: 集成 Markdown 快捷键与快速格式化工具条', () => {
  // 1. ArticleSelectionDock
  assert.ok(
    dockCode.includes("createMarkdownToolbar(textarea)"),
    '抽屉输入框必须包含 Markdown 快捷格式化工具条'
  );
  assert.ok(
    dockCode.includes("handleMarkdownKeydown("),
    '抽屉输入框必须绑定 Markdown 键盘快捷键 (Ctrl+B/I/E/K 等)'
  );

  // 2. notes.astro
  assert.ok(
    notesCode.includes("createMarkdownToolbar("),
    'notes 页面便签编辑大窗必须包含 Markdown 快捷格式化工具条'
  );
  assert.ok(
    notesCode.includes("handleMarkdownKeydown("),
    'notes 页面便签编辑大窗必须绑定 Markdown 键盘快捷键 (Ctrl+B/I/E/K 等)'
  );
});

test('ArticleSelectionDock: 自由笔记卡片底栏提供「编辑」按钮并就地展开修改便签正文', () => {
  assert.ok(
    dockCode.includes("item.kind === 'free'"),
    '卡片底栏必须区分 free 自由笔记类型'
  );
  assert.ok(
    dockCode.includes("notes-btn-edit"),
    '自由笔记卡片底栏必须包含 notes-btn-edit 编辑按钮'
  );
  assert.ok(
    dockCode.includes("item.text = value;") && dockCode.includes("body.innerHTML = renderMarkdown(value);"),
    '就地编辑必须直接更新自由笔记 text 正文与 DOM 渲染'
  );
  assert.ok(
    dockCode.includes("showStamp('已更新便签')"),
    '保存就地修改后必须提示「已更新便签」'
  );
});

test('ArticleSelectionDock: 一体化单层卡片设计，移除多余提示文本，工具栏置于底部左侧，禁用原生拖拽 resize: none', () => {
  // 1. 移除冗余提示文本，placeholder 保持精简纯净
  assert.ok(
    !dockCode.includes("notes-composer-hint"),
    '必须彻底移除底部的快捷键说明文本元素'
  );
  assert.ok(
    dockCode.includes("textarea.placeholder = '写一条独立便签…';"),
    '新建便签占位符必须精简为「写一条独立便签…」'
  );

  // 2. 布局：工具栏与按钮组在 actions 容器中并排（左侧工具栏、右侧按钮组）
  assert.ok(
    dockCode.includes("actions.append(toolbar, btnGroup);"),
    '底部操作栏左侧必须放置 Markdown 工具栏，右侧放置按钮组'
  );

  // 3. 样式：一体化卡片、消除内外框嵌套，无边框透明 textarea，resize: none 防溢出
  assert.ok(
    dockCode.includes("resize: none;"),
    '输入框必须设置 resize: none 防止原生把手溢出与光标异常'
  );
  assert.match(
    dockCode,
    /\.notes-composer-input\s*\{[^}]*border:\s*none/s,
    '输入框正文区必须无边框融入卡片背景'
  );
});
