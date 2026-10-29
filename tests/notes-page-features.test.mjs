import test from 'node:test';
import assert from 'node:assert/strict';

import {
  saveStandaloneNote,
  deleteStoredNote,
  getAllNotesAcrossSite,
  saveHighlights,
  exportHighlightsAsMarkdown,
} from '../src/utils/articleHighlightEngine.ts';

function setupMockWindow() {
  const store = new Map();
  const localStorage = {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };

  const dispatched = [];
  globalThis.window = {
    localStorage,
    dispatchEvent: (evt) => dispatched.push(evt.type),
    addEventListener: () => {},
  };
  globalThis.document = {
    dispatchEvent: (evt) => dispatched.push(evt.type),
    addEventListener: () => {},
  };

  return { store, dispatched };
}

test('saveStandaloneNote saves a note under __standalone__ and dispatches article-notes:changed', () => {
  const { store, dispatched } = setupMockWindow();
  const note = {
    id: 'note-standalone-1',
    text: '# Standalone Note\nContent here',
    title: 'Standalone Note Title',
    tags: ['架构', '随想'],
    color: 'blue',
  };

  saveStandaloneNote(note);

  const raw = store.get('areSet_article_highlights___standalone__');
  assert.ok(raw, 'Storage key must exist');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'note-standalone-1');
  assert.equal(parsed[0].kind, 'free');
  assert.equal(parsed[0].postSlug, '__standalone__');
  assert.equal(parsed[0].title, 'Standalone Note Title');
  assert.deepEqual(parsed[0].tags, ['架构', '随想']);
  assert.equal(parsed[0].dirty, true);
  assert.ok(dispatched.includes('article-notes:changed'));
});

test('deleteStoredNote marks deleted: true and dirty: true with tombstone', () => {
  const { store, dispatched } = setupMockWindow();
  const note = {
    id: 'note-del-1',
    text: 'Note to be deleted',
    title: 'Del Title',
  };
  saveStandaloneNote(note);

  const deleted = deleteStoredNote('note-del-1', '__standalone__');
  assert.equal(deleted, true);

  const parsed = JSON.parse(store.get('areSet_article_highlights___standalone__'));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'note-del-1');
  assert.equal(parsed[0].deleted, true);
  assert.equal(parsed[0].dirty, true);
  assert.ok(dispatched.includes('article-notes:changed'));
});

test('getAllNotesAcrossSite combines highlights from articles and standalone notes', () => {
  const { store } = setupMockWindow();

  // 1. Article highlight
  saveHighlights('/posts/ue5-gc/', [
    {
      id: 'hl-1',
      kind: 'highlight',
      text: 'UE5 GC reachability analysis',
      postSlug: '/posts/ue5-gc/',
      postTitle: 'UE5 GC 机制',
      timestamp: 1000,
      updatedAt: 1000,
    },
  ]);

  // 2. Standalone note
  saveStandaloneNote({
    id: 'free-1',
    text: 'My independent thinking note',
    title: 'Weekly Memo',
    timestamp: 2000,
    updatedAt: 2000,
  });

  const all = getAllNotesAcrossSite();
  assert.equal(all.length, 2);
  assert.equal(all[0].id, 'free-1', 'Most recent note should be first');
  assert.equal(all[1].id, 'hl-1');
  assert.equal(all[1].kind, 'highlight');
  assert.equal(all[0].kind, 'free');
});

test('exportHighlightsAsMarkdown in multi-article mode groups by article and preserves true article URLs', () => {
  const records = [
    {
      id: 'hl-art-1',
      kind: 'highlight',
      text: '这是文章一的一句关键论述。',
      headingText: '§ 1. 核心架构',
      postSlug: 'ue5-arch',
      postTitle: 'UE5 架构深度解析',
      timestamp: 1727672000000,
    },
    {
      id: 'ai-art-1',
      kind: 'ai',
      question: '问：为什么使用智能指针？',
      text: '因为避免裸指针导致的野指针和跨模块生命周期泄露。',
      postSlug: 'ue5-arch',
      postTitle: 'UE5 架构深度解析',
      timestamp: 1727672100000,
    },
    {
      id: 'hl-art-2',
      kind: 'highlight',
      text: '这是文章二中关于 GC 回收的说明。',
      headingText: '§ 1. 核心架构',
      postSlug: 'ue5-gc',
      postTitle: 'UE5 GC 运行机制',
      timestamp: 1727672200000,
    },
    {
      id: 'free-standalone',
      kind: 'free',
      title: '关于架构设计的独立灵感',
      text: '组件化优先于庞大的单体基类继承。',
      postSlug: '__standalone__',
      tags: ['架构', '灵感'],
      timestamp: 1727672300000,
    },
  ];

  const md = exportHighlightsAsMarkdown(
    '全站笔记与批注归档',
    'https://areset.me/notes',
    records
  );

  assert.ok(md.includes('# 《全站笔记与批注归档》'));
  assert.ok(md.includes('## 独立随笔便签'));
  assert.ok(md.includes('### 关于架构设计的独立灵感'));
  assert.ok(md.includes('组件化优先于庞大的单体基类继承。'));
  assert.ok(md.includes('## 《UE5 架构深度解析》'));
  assert.ok(md.includes('原文链接：https://areset.me/posts/ue5-arch'));
  assert.ok(md.includes('[定位原文](https://areset.me/posts/ue5-arch#highlight-hl-art-1)'));
  assert.ok(md.includes('## 《UE5 GC 运行机制》'));
  assert.ok(md.includes('原文链接：https://areset.me/posts/ue5-gc'));
  assert.ok(md.includes('[定位原文](https://areset.me/posts/ue5-gc#highlight-hl-art-2)'));
  assert.ok(md.includes('#### 问：为什么使用智能指针？'));
  assert.ok(!md.includes('https://areset.me/notes#'));
});
