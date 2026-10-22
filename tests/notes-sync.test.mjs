import test from 'node:test';
import assert from 'node:assert/strict';

function installWindow() {
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
  };
  const win = {
    localStorage,
    setTimeout,
    clearTimeout,
    dispatchEvent() {},
    addEventListener() {},
  };
  globalThis.window = win;
  globalThis.document = { addEventListener() {}, hidden: false };
  return { store, localStorage };
}

test('1. syncNow pushes dirty local notes and merges the server winner', async () => {
  const { store, localStorage } = installWindow();
  const timestamp = 1727672000000;
  store.set(
    'areSet_article_highlights_posts_x',
    JSON.stringify([
      {
        id: 'note-1',
        kind: 'highlight',
        text: 'local text',
        prefix: '',
        suffix: '',
        postSlug: '/posts/x/',
        timestamp,
        updatedAt: timestamp,
        dirty: true,
      },
    ])
  );

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/auth/me') {
      return { ok: true, json: async () => ({ ok: true, user: { username: 'alice' } }) };
    }
    if (url === '/api/notes/sync') {
      const body = JSON.parse(options.body);
      assert.equal(body.changes.length, 1);
      assert.equal(body.changes[0].text, 'local text');
      return {
        ok: true,
        json: async () => ({
          ok: true,
          rev: 1,
          changes: [
            {
              id: 'note-1',
              kind: 'highlight',
              text: 'server text',
              prefix: '',
              suffix: '',
              postSlug: '/posts/x/',
              timestamp,
              updatedAt: timestamp + 10,
              serverRev: 1,
              deleted: false,
            },
          ],
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const { syncNow, pendingCount } = await import('../src/utils/notesSync.ts');
  const result = await syncNow({ migrate: true });
  assert.equal(result.ok, true);

  const saved = JSON.parse(localStorage.getItem('areSet_article_highlights_posts_x'));
  assert.equal(saved[0].text, 'server text');
  assert.equal(saved[0].dirty, false);
  assert.equal(localStorage.getItem('areSet_notes_last_rev'), '1');
  assert.equal(pendingCount(), 0);
  assert.equal(calls.filter((call) => call.url === '/api/notes/sync').length, 1);
});

test('2. syncNow bails out when not logged in', async () => {
  installWindow();
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: '未登录' }) });

  const { syncNow } = await import('../src/utils/notesSync.ts');
  const result = await syncNow();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'need-login');
});
