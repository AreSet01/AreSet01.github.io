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

test('3. pushSync pushes dirty notes only and marks them clean', async () => {
  const { store, localStorage } = installWindow();
  const timestamp = 1727672000000;
  localStorage.setItem('areSet_notes_last_rev', '5');
  store.set(
    'areSet_article_highlights_posts_y',
    JSON.stringify([
      {
        id: 'note-dirty',
        kind: 'highlight',
        text: 'dirty note',
        prefix: '',
        suffix: '',
        postSlug: '/posts/y/',
        timestamp,
        updatedAt: timestamp,
        dirty: true,
      },
      {
        id: 'note-clean',
        kind: 'highlight',
        text: 'clean note',
        prefix: '',
        suffix: '',
        postSlug: '/posts/y/',
        timestamp,
        updatedAt: timestamp,
        dirty: false,
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
      assert.equal(body.changes[0].id, 'note-dirty');
      return {
        ok: true,
        json: async () => ({
          ok: true,
          rev: 6,
          changes: [],
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const { pushSync, pendingCount } = await import('../src/utils/notesSync.ts');
  assert.equal(pendingCount(), 1);

  const res = await pushSync();
  assert.equal(res.ok, true);
  assert.equal(res.pushedCount, 1);
  assert.equal(res.rev, 6);
  assert.equal(localStorage.getItem('areSet_notes_last_rev'), '6');
  assert.equal(pendingCount(), 0);

  const saved = JSON.parse(localStorage.getItem('areSet_article_highlights_posts_y'));
  assert.equal(saved.find((r) => r.id === 'note-dirty').dirty, false);
});

test('4. pushSync returns nothing-to-push when no notes are dirty', async () => {
  installWindow();
  let syncCalled = false;
  globalThis.fetch = async (url) => {
    if (url === '/api/auth/me') return { ok: true, json: async () => ({ ok: true, user: { username: 'alice' } }) };
    if (url === '/api/notes/sync') syncCalled = true;
    return { ok: true, json: async () => ({}) };
  };

  const { pushSync } = await import('../src/utils/notesSync.ts');
  const res = await pushSync();
  assert.equal(res.ok, true);
  assert.equal(res.pushedCount, 0);
  assert.equal(res.reason, 'nothing-to-push');
  assert.equal(syncCalled, false);
});

test('5. pullSync sends empty changes and merges server notes into local storage', async () => {
  const { store, localStorage } = installWindow();
  localStorage.setItem('areSet_notes_last_rev', '3');

  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/auth/me') return { ok: true, json: async () => ({ ok: true, user: { username: 'alice' } }) };
    if (url === '/api/notes/sync') {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.changes, []); // Pull must never push local changes
      assert.equal(body.since, 3);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          rev: 7,
          changes: [
            {
              id: 'server-note-1',
              kind: 'highlight',
              text: 'hello from server',
              prefix: '',
              suffix: '',
              postSlug: '/posts/z/',
              timestamp: 1727673000000,
              updatedAt: 1727673000000,
              serverRev: 7,
              deleted: false,
            },
          ],
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const { pullSync } = await import('../src/utils/notesSync.ts');
  const res = await pullSync();
  assert.equal(res.ok, true);
  assert.equal(res.pulledCount, 1);
  assert.equal(res.rev, 7);
  assert.equal(localStorage.getItem('areSet_notes_last_rev'), '7');

  const saved = JSON.parse(localStorage.getItem('areSet_article_highlights_posts_z'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'server-note-1');
  assert.equal(saved[0].dirty, false);
});

test('6. checkSyncStatus accurately determines latest / ahead / behind states', async () => {
  const { store, localStorage } = installWindow();
  localStorage.setItem('areSet_notes_last_rev', '10');

  // Case A: Latest (rev 10 matches, 0 pending, 0 incoming)
  globalThis.fetch = async (url) => {
    if (url === '/api/auth/me') return { ok: true, json: async () => ({ ok: true, user: { username: 'alice' } }) };
    if (url.startsWith('/api/notes/status')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          rev: 10,
          totalCount: 5,
          incomingCount: 0,
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const { checkSyncStatus } = await import('../src/utils/notesSync.ts');
  let status = await checkSyncStatus();
  assert.equal(status.ok, true);
  assert.equal(status.isLatest, true);
  assert.equal(status.state, 'latest');
  assert.equal(status.pendingCount, 0);
  assert.equal(status.incomingCount, 0);

  // Case B: Behind (server has incomingCount 2, rev 12 > 10)
  globalThis.fetch = async (url) => {
    if (url === '/api/auth/me') return { ok: true, json: async () => ({ ok: true, user: { username: 'alice' } }) };
    if (url.startsWith('/api/notes/status')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          rev: 12,
          totalCount: 7,
          incomingCount: 2,
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  status = await checkSyncStatus();
  assert.equal(status.ok, true);
  assert.equal(status.isLatest, false);
  assert.equal(status.state, 'behind');
  assert.equal(status.incomingCount, 2);

  // Case C: Ahead (local has 1 dirty note)
  store.set(
    'areSet_article_highlights_posts_ahead',
    JSON.stringify([
      {
        id: 'ahead-note',
        kind: 'highlight',
        text: 'ahead note',
        prefix: '',
        suffix: '',
        postSlug: '/posts/ahead/',
        timestamp: Date.now(),
        updatedAt: Date.now(),
        dirty: true,
      },
    ])
  );

  globalThis.fetch = async (url) => {
    if (url === '/api/auth/me') return { ok: true, json: async () => ({ ok: true, user: { username: 'alice' } }) };
    if (url.startsWith('/api/notes/status')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          rev: 10,
          totalCount: 5,
          incomingCount: 0,
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  status = await checkSyncStatus();
  assert.equal(status.ok, true);
  assert.equal(status.isLatest, false);
  assert.equal(status.state, 'ahead');
  assert.equal(status.pendingCount, 1);
});

test('7. pull keeps local notes when the incoming postSlug form differs (slash alias)', async () => {
  const { store, localStorage } = installWindow();
  localStorage.setItem('areSet_notes_last_rev', '1');
  store.set(
    'areSet_article_highlights_posts_x',
    JSON.stringify([
      { id: 'x1', kind: 'highlight', text: 'one', prefix: '', suffix: '', postSlug: '/posts/x/', updatedAt: 1 },
      { id: 'x2', kind: 'highlight', text: 'two', prefix: '', suffix: '', postSlug: '/posts/x/', updatedAt: 2 },
      { id: 'x3', kind: 'highlight', text: 'three', prefix: '', suffix: '', postSlug: '/posts/x/', updatedAt: 3 },
    ])
  );

  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/auth/me') return { ok: true, json: async () => ({ ok: true, user: { username: 'alice' } }) };
    if (url === '/api/notes/sync') {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.changes, []);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          rev: 2,
          hasMore: false,
          changes: [
            {
              id: 'x2',
              kind: 'highlight',
              text: 'two (server edit)',
              prefix: '',
              suffix: '',
              // 故意不带尾斜杠：旧实现会把它和 /posts/x/ 拆成两个 Map 桶，最后互相覆盖
              postSlug: '/posts/x',
              updatedAt: 10,
              serverRev: 2,
              deleted: false,
            },
          ],
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const { syncNow } = await import('../src/utils/notesSync.ts');
  const res = await syncNow();
  assert.equal(res.ok, true);
  const saved = JSON.parse(localStorage.getItem('areSet_article_highlights_posts_x'));
  assert.equal(saved.length, 3, 'local-only notes must survive a pull');
  assert.ok(saved.some((n) => n.id === 'x1'));
  assert.ok(saved.some((n) => n.id === 'x3'));
  assert.equal(saved.find((n) => n.id === 'x2').text, 'two (server edit)');
});

test('8. a record edited while the push is in flight is not marked clean', async () => {
  const { store, localStorage } = installWindow();
  localStorage.setItem('areSet_notes_last_rev', '5');
  const note = {
    id: 'race-1',
    kind: 'highlight',
    text: 'old',
    prefix: '',
    suffix: '',
    postSlug: '/posts/race/',
    updatedAt: 100,
    timestamp: 100,
    dirty: true,
  };
  store.set('areSet_article_highlights_posts_race', JSON.stringify([note]));

  let pushed = false;
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/auth/me') return { ok: true, json: async () => ({ ok: true, user: { username: 'alice' } }) };
    if (url === '/api/notes/sync') {
      const body = JSON.parse(options.body);
      if (body.changes.length > 0) {
        pushed = true;
        // 请求飞行期间用户又编辑了同一条笔记
        store.set(
          'areSet_article_highlights_posts_race',
          JSON.stringify([{ ...note, text: 'newer', updatedAt: 200, dirty: true }])
        );
      }
      return { ok: true, json: async () => ({ ok: true, rev: 6, hasMore: false, changes: [] }) };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const { syncNow } = await import('../src/utils/notesSync.ts');
  const res = await syncNow();
  assert.equal(res.ok, true);
  assert.ok(pushed, 'the dirty record should have been pushed');
  const saved = JSON.parse(localStorage.getItem('areSet_article_highlights_posts_race'))[0];
  assert.equal(saved.text, 'newer');
  assert.equal(saved.dirty, true, 'in-flight edits must stay dirty for the next round');
});

