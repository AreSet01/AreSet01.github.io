import test from 'node:test';
import assert from 'node:assert/strict';

import {
  saveStandaloneNote,
  deleteStoredNote,
  getAllNotesAcrossSite,
  saveHighlights,
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
