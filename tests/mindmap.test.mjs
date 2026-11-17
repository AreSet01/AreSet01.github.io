import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  addChildNode,
  addMindMapCategory,
  addSiblingNode,
  buildMindMapFromArticle,
  buildTopologyPreviewSvg,
  countNodes,
  createBlankMindMap,
  deleteMindMap,
  deleteMindMapCategory,
  loadActiveMindMaps,
  loadAllMindMaps,
  loadMindMapCategoryState,
  markdownToMindmap,
  mindmapToMarkdown,
  moveSiblingNode,
  removeNode,
  removeNodesBatch,
  renameMindMapCategory,
  reparentOrReorderNode,
  updateNodeProps,
  updateNodesColorBatch,
  upsertMindMap,
} from '../src/utils/mindmapEngine.ts';
import {
  checkMindMapSyncStatus,
  pullMindMapSync,
  pushMindMapSync,
  syncMindMapsNow,
  pendingMindMapCount,
} from '../src/utils/mindmapSync.ts';

function installMockBrowser() {
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
  globalThis.document = {
    addEventListener() {},
    dispatchEvent() {},
    hidden: false,
  };
  return { store, localStorage };
}

test('1. Tree operations: addChild, addSibling, reparent, reorder, remove & cycle protection', () => {
  installMockBrowser();
  const blank = createBlankMindMap('架构拆解', '核心架构');
  let root = blank.root;
  assert.equal(root.text, '核心架构');
  assert.equal(root.children.length, 2);

  const firstId = root.children[0].id;
  const secondId = root.children[1].id;

  const addedChild = addChildNode(root, secondId, '子节点 A');
  assert.ok(addedChild);
  root = addedChild.root;
  const childAId = addedChild.createdId;

  const addedSibling = addSiblingNode(root, childAId, '子节点 B');
  assert.ok(addedSibling);
  root = addedSibling.root;
  const childBId = addedSibling.createdId;

  // Move B up before A
  root = moveSiblingNode(root, childBId, -1);
  assert.equal(root.children[1].children[0].id, childBId);
  assert.equal(root.children[1].children[1].id, childAId);

  // Cycle protection: cannot drop parent onto descendant
  assert.equal(reparentOrReorderNode(root, secondId, childAId, 'inside'), null);

  // Reparent childB onto firstId ('inside')
  const reparented = reparentOrReorderNode(root, childBId, firstId, 'inside');
  assert.ok(reparented);
  root = reparented;
  assert.ok(root.children[0].children.some((c) => c.id === childBId));
  assert.ok(!root.children[1].children.some((c) => c.id === childBId));

  // Reorder firstId 'after' secondId at root children level
  const reordered = reparentOrReorderNode(root, firstId, secondId, 'after');
  assert.ok(reordered);
  root = reordered;
  assert.equal(root.children[0].id, secondId);
  assert.equal(root.children[1].id, firstId);

  // Cannot remove root
  assert.equal(removeNode(root, root.id), null);

  // Remove childBId
  const removed = removeNode(root, childBId);
  assert.ok(removed);
  assert.equal(countNodes(removed.root).total, countNodes(root).total - 1);
});

test('2. Bidirectional Markdown <-> Tree preserves node metadata and handles nested lists + quotes', () => {
  const mdInput = [
    '# Render Pipeline',
    '',
    '## Scene Graph',
    '- Culling Pass',
    '  - Frustum `AABox`',
    '  > Fast rejection',
    '  - HZB Occlusion',
    '',
    '## RDG Compilation',
    '### Barrier Synthesis',
    '- Transition Merging',
  ].join('\n');

  const parsed = markdownToMindmap(mdInput);
  assert.equal(parsed.text, 'Render Pipeline');
  assert.equal(parsed.children.length, 2);
  assert.equal(parsed.children[0].children[0].children[0].text, 'Frustum `AABox`');
  assert.equal(parsed.children[0].children[0].children[0].note, 'Fast rejection');
  assert.equal(parsed.children[1].children[0].text, 'Barrier Synthesis');
  assert.equal(parsed.children[1].children[0].children[0].text, 'Transition Merging');

  // Assign custom color & collapsed state, then re-parse slightly edited Markdown -> metadata preserved!
  let withMeta = updateNodeProps(parsed, parsed.children[0].id, { color: 'red', collapsed: true });
  const roundtripMd = mindmapToMarkdown(withMeta);
  assert.ok(roundtripMd.includes('# Render Pipeline'));
  assert.ok(roundtripMd.includes('## Scene Graph'));
  assert.ok(roundtripMd.includes('  - Frustum `AABox`'));

  const reParsed = markdownToMindmap(roundtripMd.replace('Render Pipeline', 'Render Pipeline v2'), withMeta);
  assert.equal(reParsed.text, 'Render Pipeline v2');
  assert.equal(reParsed.children[0].id, parsed.children[0].id);
  assert.equal(reParsed.children[0].color, 'red');
  assert.equal(reParsed.children[0].collapsed, true);
});

test('3. Dynamic category CRUD migrates cards, blocks deleting last category, and marks dirty for sync', () => {
  installMockBrowser();
  const initialCats = loadMindMapCategoryState();
  assert.equal(initialCats.categories.length, 4);

  const afterAdd = addMindMapCategory('图形渲染');
  assert.ok(afterAdd.categories.includes('图形渲染'));
  assert.equal(afterAdd.dirty, true);

  const map = upsertMindMap(createBlankMindMap('图形渲染', 'Shader 体系'));
  assert.equal(map.category, '图形渲染');

  const afterRename = renameMindMapCategory('图形渲染', 'Shader 图形学');
  assert.ok(afterRename.categories.includes('Shader 图形学'));
  assert.ok(!afterRename.categories.includes('图形渲染'));
  const reloadedMap = loadActiveMindMaps().find((m) => m.id === map.id);
  assert.equal(reloadedMap?.category, 'Shader 图形学');
  assert.equal(reloadedMap?.dirty, true);

  // Delete renamed category -> card migrates to first category
  deleteMindMapCategory('Shader 图形学');
  const migratedMap = loadActiveMindMaps().find((m) => m.id === map.id);
  assert.equal(migratedMap?.category, loadMindMapCategoryState().categories[0]);

  // Cannot delete when only 1 category remains
  while (loadMindMapCategoryState().categories.length > 1) {
    const first = loadMindMapCategoryState().categories[0];
    deleteMindMapCategory(first);
  }
  assert.equal(loadMindMapCategoryState().categories.length, 1);
  deleteMindMapCategory(loadMindMapCategoryState().categories[0]);
  assert.equal(loadMindMapCategoryState().categories.length, 1);
});

test('4. Article-to-MindMap skeleton builder integrates headings + highlights + SVG preview', () => {
  const built = buildMindMapFromArticle(
    {
      slug: '/posts/ue5-nanite-deep-dive/',
      title: 'UE5 Nanite 深入解析',
      headings: [
        { depth: 2, slug: 'cluster', text: 'Cluster 构建' },
        { depth: 3, slug: 'dag', text: 'DAG LOD 裁剪' },
        { depth: 2, slug: 'raster', text: '软硬光栅化分发' },
      ],
      notes: [
        { kind: 'highlight', text: '小三角形走 VisBuffer 计算着色器软光栅', headingText: '软硬光栅化分发', color: 'gold' },
        { kind: 'ai', text: '保证跨 LOD 边界不裂缝', question: '为什么要锁定边缘边界？', headingText: '未命中段落' },
      ],
    },
    { category: '源码研读', includeNotes: true }
  );

  assert.equal(built.postSlug, 'ue5-nanite-deep-dive');
  assert.equal(built.category, '源码研读');
  assert.equal(built.root.children[0].text, 'Cluster 构建');
  assert.equal(built.root.children[0].children[0].text, 'DAG LOD 裁剪');
  assert.ok(built.root.children[1].children[0].text.startsWith('划线：'));
  assert.equal(built.root.children[2].text, '阅读划线与墨问摘要');

  const svg = buildTopologyPreviewSvg(built.root, 'mindmap-both');
  assert.ok(svg.startsWith('<svg ') && svg.includes('mm-card-topo-svg'));
});

test('5. mindmapSync client syncNow, categories LWW, and tombstone handling', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  const { localStorage } = installMockBrowser();
  const created = upsertMindMap(createBlankMindMap('架构拆解', '本地新导图'));
  addMindMapCategory('工程化');
  assert.equal(pendingMindMapCount(), 2); // 1 dirty map + 1 dirty categories state

  const remoteMap = createBlankMindMap('工程化', '云端同步导图');
  remoteMap.id = 'mm_remote_99';
  remoteMap.updatedAt = created.updatedAt + 500;

  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/auth/me') {
      return { ok: true, json: async () => ({ ok: true, user: { username: 'tester' } }) };
    }
    if (String(url).startsWith('/api/mindmaps/status')) {
      return { ok: true, json: async () => ({ ok: true, rev: 3, incomingCount: 1 }) };
    }
    if (url === '/api/mindmaps/sync') {
      const body = JSON.parse(options.body);
      assert.equal(body.changes.length, 1);
      assert.equal(body.changes[0].id, created.id);
      assert.ok(body.categories.includes('工程化'));
      return {
        ok: true,
        json: async () => ({
          ok: true,
          rev: 4,
          changes: [{ ...remoteMap, serverRev: 4, deleted: false }],
          hasMore: false,
          categories: body.categories,
          categoriesUpdatedAt: body.categoriesUpdatedAt,
        }),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const stBefore = await checkMindMapSyncStatus();
  assert.equal(stBefore.ok, true);
  assert.equal(stBefore.state, 'diverged');

  const res = await syncMindMapsNow({ migrate: true });
  assert.equal(res.ok, true);
  assert.equal(res.pushedCount, 1);
  assert.equal(res.pulledCount, 1);
  assert.equal(pendingMindMapCount(), 0);
  assert.equal(localStorage.getItem('areSet_mindmaps_last_rev'), '4');

  const active = loadActiveMindMaps();
  assert.equal(active.length, 2);
  assert.ok(active.some((m) => m.id === 'mm_remote_99'));

  // Test pushSync + tombstone removal
  deleteMindMap(created.id);
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/auth/me') {
      return { ok: true, json: async () => ({ ok: true, user: { username: 'tester' } }) };
    }
    if (url === '/api/mindmaps/sync') {
      const body = JSON.parse(options.body);
      assert.equal(body.changes.length, 1);
      assert.equal(body.changes[0].deleted, true);
      return { ok: true, json: async () => ({ ok: true, rev: 5, changes: [] }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  const pushedDel = await pushMindMapSync();
  assert.equal(pushedDel.ok, true);
  assert.equal(pushedDel.pushedCount, 1);
  assert.equal(loadAllMindMaps().some((m) => m.id === created.id), false);

  // Pull empty
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/auth/me') {
      return { ok: true, json: async () => ({ ok: true, user: { username: 'tester' } }) };
    }
    if (url === '/api/mindmaps/sync') {
      const body = JSON.parse(options.body);
      assert.equal(body.changes.length, 0);
      return { ok: true, json: async () => ({ ok: true, rev: 5, changes: [], hasMore: false }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  const pulled = await pullMindMapSync();
  assert.equal(pulled.ok, true);
});

test('6. Server /api/mindmaps/* endpoints enforce auth, same-origin, LWW, categories sync & export', async () => {
  const ROOT = process.cwd();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mm-srv-'));
  const adminPass = 'test-admin-pass-123';
  const adminHash = createHash('sha256').update(adminPass, 'utf8').digest('hex');
  const testPort = 8799;

  const child = spawn(process.execPath, [path.resolve(ROOT, 'server', 'ask.mjs')], {
    env: {
      ...process.env,
      ASK_PORT: String(testPort),
      ASK_HOST: '127.0.0.1',
      ASK_DATA_DIR: tmpDir,
      ASK_CONFIG_FILE: path.join(tmpDir, 'config.json'),
      ADMIN_PASSWORD_HASH: adminHash,
      AUTH_SECRET: 'test-auth-secret-mindmap',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    let out = '';
    const t = setTimeout(() => reject(new Error(`Server startup timeout: ${out}`)), 6000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (out.includes('listening on')) {
        clearTimeout(t);
        resolve();
      }
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
    });
  });

  const baseUrl = `http://127.0.0.1:${testPort}`;
  try {
    // 1. Unauthenticated access rejected
    const unauth = await fetch(`${baseUrl}/api/mindmaps/status`);
    assert.equal(unauth.status, 401);

    // 2. Admin login + invite generation
    const adminLogin = await fetch(`${baseUrl}/api/settings/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPass }),
    }).then((r) => r.json());
    assert.equal(adminLogin.ok, true);

    const inviteRes = await fetch(`${baseUrl}/api/settings/invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminLogin.token}`,
      },
      body: JSON.stringify({ count: 1 }),
    }).then((r) => r.json());
    const inviteCode = inviteRes.invite.code;

    // 3. Register user with same-origin header
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: baseUrl,
      },
      body: JSON.stringify({
        username: 'mmtester',
        password: 'password1234',
        inviteCode,
      }),
    });
    assert.equal(regRes.status, 200);
    const cookie = regRes.headers.get('set-cookie').split(';')[0];

    // 4. Cross-origin POST blocked with 403
    const badOrigin = await fetch(`${baseUrl}/api/mindmaps/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ since: 0, changes: [] }),
    });
    assert.equal(badOrigin.status, 403);

    // 5. Sync map + categories from client A
    const sample = createBlankMindMap('图形架构', 'Server LWW 导图');
    const syncRes = await fetch(`${baseUrl}/api/mindmaps/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: baseUrl },
      body: JSON.stringify({
        since: 0,
        changes: [sample],
        categories: ['图形架构', '知识体系'],
        categoriesUpdatedAt: Date.now(),
      }),
    }).then((r) => r.json());
    assert.equal(syncRes.ok, true);
    assert.equal(syncRes.changes.length, 1);
    assert.deepEqual(syncRes.categories, ['图形架构', '知识体系']);

    // 6. Status & Export endpoints
    const status = await fetch(`${baseUrl}/api/mindmaps/status?since=0`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json());
    assert.equal(status.totalCount, 1);

    const exported = await fetch(`${baseUrl}/api/mindmaps/export`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json());
    assert.equal(exported.ok, true);
    assert.equal(exported.mindmaps.length, 1);
    assert.equal(exported.mindmaps[0].title, 'Server LWW 导图');
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('7. Sidebar navigation includes MindMap below Notes & nginx config proxies /api/mindmaps', () => {
  const header = fs.readFileSync(path.join(process.cwd(), 'src/components/Header.astro'), 'utf8');
  const notesIdx = header.indexOf("href: '/notes'");
  const mmIdx = header.indexOf("href: '/mindmap'");
  const lifeIdx = header.indexOf("href: '/life'");
  assert.ok(notesIdx > 0 && mmIdx > notesIdx && lifeIdx > mmIdx, 'MindMap tab must be directly below Notes');

  const nginx = fs.readFileSync(path.join(process.cwd(), 'server/nginx.conf.example'), 'utf8');
  assert.ok(nginx.includes('mindmaps'), 'nginx config example must include mindmaps API path');
});

test('8. MindMap workbench enforces crisp CSS zoom, unhidden 1:1 measure sandbox, custom frosted selects, and segmented gliders', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/mindmap.astro'), 'utf8');

  // No native <select> dropdowns remain in the MindMap UI
  assert.equal(/<select[\s>]/i.test(page), false, 'all selects should be replaced by frosted .mm-cselect popovers');
  assert.ok(page.includes('id="mm-wb-color-wrap"'), 'workbench color picker should use custom frosted popover');
  assert.ok(page.includes('id="mm-wb-post-search"'), 'workbench post selector should support inline search');
  assert.ok(page.includes('id="mm-gen-category-wrap"'), 'article generator modal should use custom frosted category popover');

  // Crisp zoom & unhidden measurement architecture
  assert.ok(page.includes('id="mm-canvas-pan"'), 'outer translation wrapper keeps pan crisp');
  assert.ok(page.includes('id="mm-measure-box"'), 'dedicated 1:1 measure sandbox prevents outline-mode collapse');
  assert.ok(page.includes('.zoom = zoom.toFixed(4)'), 'canvas stage zooms crisply via CSS zoom rather than scale bitmap');
  assert.equal(/canvasStage\.style\.transform\s*=.*scale\(/.test(page), false, 'canvasStage must not apply transform scale bitmap blur');

  // Tactile gliders & reduced-motion guard
  const gliderMatches = page.match(/class="mm-seg-glider"/g) || [];
  assert.equal(gliderMatches.length, 2, 'both view-mode and layout segmented switches should include a sliding glider');
  assert.ok(page.includes('@media (prefers-reduced-motion: reduce)'), 'respects reduced motion preferences');
});

test('9. MindMap drag ghost geometry, outline full width, Tab focus trap, FLIP animations & global cursor isolation', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/mindmap.astro'), 'utf8');
  const globalCss = fs.readFileSync(path.join(process.cwd(), 'src/styles/global.css'), 'utf8');
  const headerAstro = fs.readFileSync(path.join(process.cwd(), 'src/components/Header.astro'), 'utf8');

  // 1. Drag ghost sits outside transformed #mm-workbench-dialog (#mm-fit-btn is inside dialog footer)
  const fitIdx = page.indexOf('id="mm-fit-btn"');
  const ghostIdx = page.indexOf('id="mm-drag-ghost"');
  assert.ok(fitIdx > 0 && ghostIdx > fitIdx, '#mm-drag-ghost must live outside transformed #mm-workbench-dialog');
  assert.ok(page.includes('dragGhostEl.style.width = `${dragState.width}px`'), 'drag ghost matches dragged node width');

  // 2. Single outline view expands to 100% width instead of clamping at 75%
  assert.ok(
    /\.mm-wb-body\[data-view-mode="outline"\]\s*\.mm-outline-pane\s*\{[^}]*max-width:\s*100%\s*!important/.test(page),
    'outline mode must override .mm-outline-pane max-width: 75% to 100% !important',
  );

  // 3. Inline editing intercepts Tab so focus creates child node instead of escaping to #mm-fit-btn
  assert.ok(
    /function startInlineNodeEdit[\s\S]*?e\.key === 'Tab'[\s\S]*?e\.preventDefault\(\)/.test(page),
    'startInlineNodeEdit must intercept Tab with preventDefault()',
  );
  assert.ok(page.includes('id="mm-canvas-viewport"'), 'canvas viewport element present');
  assert.ok(/id="mm-canvas-viewport"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="mm-canvas-viewport"/.test(page), 'canvas viewport should be programmatically focusable');

  // 4. Layout switcher passes FLIP snapshot into renderCanvasAndOutline
  assert.ok(
    /\[data-wb-layout\][\s\S]{0,600}captureNodeRects\(\)/.test(page),
    'layout toggle handler must capture node rects for FLIP transitions',
  );

  // 5. Global custom cursor completely suppresses OS cursor outside editable/splitter/settings exceptions
  assert.ok(globalCss.includes('html:not(:has(.settings-viewport))'), 'global.css suppresses OS cursor universally when custom cursor is active');
  assert.ok(globalCss.includes('.mm-split-resizer'), 'global.css exempts .mm-split-resizer for col-resize cursor');
  assert.ok(headerAstro.includes('.mm-node') && headerAstro.includes('.mm-split-resizer'), 'Header custom cursor tracks .mm-node interactive state and hides on splitters');
});

test('10. Two-pass Outline reconciliation, batch selection ops, drop pill layering, exit clones, GPU zoom & live typing reflow', () => {
  const initialTree = markdownToMindmap(['# Root', '## Branch A', '- Item 1', '- Item 2'].join('\n'));
  const branchA = initialTree.children[0];
  const item1Id = branchA.children[0].id;
  const item2Id = branchA.children[1].id;

  // Inserting a new bullet at index 0 must NOT steal Item 1 or Item 2's IDs
  const withPrepend = updateNodeProps(initialTree, item1Id, { color: 'red', note: 'keep me' });
  const afterInsert = markdownToMindmap(
    ['# Root', '## Branch A', '- New First', '- Item 1', '- Item 2'].join('\n'),
    withPrepend
  );
  const newKids = afterInsert.children[0].children;
  assert.equal(newKids.length, 3);
  assert.notEqual(newKids[0].id, item1Id, 'prepended node must get a fresh node id');
  assert.equal(newKids[1].id, item1Id, 'existing Item 1 preserves its id after prepend');
  assert.equal(newKids[1].color, 'red');
  assert.equal(newKids[1].note, 'keep me');
  assert.equal(newKids[2].id, item2Id, 'existing Item 2 preserves its id after prepend');

  // Batch color update & batch deletion (root is always protected)
  const recolored = updateNodesColorBatch(afterInsert, new Set([afterInsert.id, item1Id, item2Id]), 'green');
  assert.equal(recolored.children[0].children[1].color, 'green');
  assert.equal(recolored.children[0].children[2].color, 'green');

  const deletedBatch = removeNodesBatch(recolored, new Set([recolored.id, item1Id, item2Id]));
  assert.ok(deletedBatch);
  assert.equal(deletedBatch.removedCount, 2, 'batch delete removes selected leaves while skipping root');
  assert.equal(deletedBatch.root.children[0].children.length, 1);
  assert.equal(deletedBatch.root.children[0].children[0].text, 'New First');

  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/mindmap.astro'), 'utf8');
  assert.ok(page.indexOf('id="mm-drop-pill"') > page.indexOf('id="mm-drag-ghost"'), '#mm-drop-pill renders above #mm-drag-ghost');
  assert.ok(/\.mm-drop-pill\s*\{[^}]*z-index:\s*126/.test(page), 'drop pill sits at higher z-index than ghost (120)');
  assert.ok(page.includes('id="mm-exit-layer"') && page.includes('spawnExitAnimations'), 'unified exit layer animates hidden & deleted nodes');
  assert.ok(page.includes('id="mm-marquee-box"') && page.includes('triggerMarqueeMode'), 'long-press left marquee multi-select implemented');
  assert.ok(page.includes('measureCache') && page.includes('animateViewportTo'), 'cached measurement & single-step GPU viewport transform');
  assert.ok(page.includes('is-live-typing') && page.includes('compositionend'), 'live typing resize/reflow respects IME composition');
  assert.ok(/outlineTextarea\.addEventListener\('input'[\s\S]*enteredIds/.test(page), 'outline edits pass enteredIds diff for synced canvas animations');
});

test('11. Spacebar enters inline edit at end of text and HUD advertises Space/双击 edit', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/mindmap.astro'), 'utf8');
  assert.ok(
    /runNodeAction\('edit',\s*\{\s*placeCaretAtEnd:\s*true\s*\}\)/.test(page),
    'Spacebar keybinding invokes edit action with placeCaretAtEnd: true',
  );
  assert.ok(
    page.includes('<span><kbd>Space</kbd>/<kbd>双击</kbd> 编辑</span>'),
    'bottom HUD displays Space/双击 edit hint',
  );
  assert.ok(
    /DEFAULT_NODE_PLACEHOLDERS[\s\S]*setSelectionRange/.test(page),
    'startInlineNodeEdit places caret at end for non-placeholder nodes',
  );
});
