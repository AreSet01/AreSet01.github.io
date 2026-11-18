import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

// Install a live delegating requestAnimationFrame BEFORE importing `motion` so motion-dom's
// module-level render batcher always routes frames to the active JSDOM/test clock.
let activeRafImpl = (cb) => setTimeout(() => cb(performance.now()), 8);
let activeCancelRafImpl = (id) => clearTimeout(id);

globalThis.requestAnimationFrame = (cb) => activeRafImpl(cb);
globalThis.cancelAnimationFrame = (id) => activeCancelRafImpl(id);

const {
  computeInversePillRadius,
  animatePillGlider,
  stopPillGlider,
  animatePaperModal,
  animateInkPopover,
  animateCountValue,
} = await import('../src/utils/workbenchMotion.ts');

const {
  $syncFlowMode,
  $syncSession,
  $syncState,
  $syncConfluence,
  applySyncStatusSnapshots,
  refreshUnifiedSyncStatus,
  runUnifiedPushSync,
  runUnifiedPullSync,
  runUnifiedBidirectionalSync,
  setActiveAuthTab,
  setSyncSessionUser,
  resetSyncStore,
} = await import('../src/stores/syncStore.ts');

const {
  $notesFilter,
  $notesStats,
  $filteredNotes,
  $notesActiveModal,
  $hasActiveNotesFilters,
  setNotesItems,
  setNotesKind,
  hydrateNotesKindFromSession,
  setNotesArticleSlug,
  setNotesColor,
  setNotesSearchQuery,
  resetNotesFilters,
  openNotesModal,
  closeNotesModal,
  setNotesEditorTab,
  setNotesPopoverOpen,
  resetNotesWorkbenchStore,
} = await import('../src/stores/notesWorkbenchStore.ts');

const {
  createCollectionFilterStore,
  getCollectionFilterController,
  matchCollectionDatasetItem,
  resetAllCollectionFilterStores,
} = await import('../src/stores/collectionFilterStore.ts');

const rootDir = process.cwd();
const readRepo = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

function withVisualDom(html, { reducedMotion = false } = {}, fn) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const saved = {};
  const keys = [
    'window',
    'document',
    'Element',
    'HTMLElement',
    'SVGElement',
    'NodeList',
    'HTMLCollection',
    'getComputedStyle',
    'sessionStorage',
  ];

  for (const k of keys) {
    saved[k] = globalThis[k];
  }

  dom.window.matchMedia = (query) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });

  const prevRaf = activeRafImpl;
  const prevCancel = activeCancelRafImpl;
  activeRafImpl = (cb) => dom.window.requestAnimationFrame(cb);
  activeCancelRafImpl = (id) => dom.window.cancelAnimationFrame(id);

  for (const k of keys) {
    globalThis[k] = dom.window[k];
  }

  const finalize = () => {
    activeRafImpl = prevRaf;
    activeCancelRafImpl = prevCancel;
    for (const k of keys) {
      if (typeof saved[k] === 'undefined') delete globalThis[k];
      else globalThis[k] = saved[k];
    }
    dom.window.close();
  };

  try {
    const out = fn(dom.window, dom.window.document);
    if (out && typeof out.then === 'function') {
      return out.finally(finalize);
    }
    finalize();
    return out;
  } catch (err) {
    finalize();
    throw err;
  }
}

test('1. workbenchMotion: computeInversePillRadius & animatePillGlider spring interpolation, mid-flight stop & reduced-motion', async () => {
  // 1a. Pure math verification across narrow & wide tabs (zero CSS corner clamping)
  for (const width of [40, 68, 96, 144, 212]) {
    for (const height of [26, 34, 38]) {
      const m = computeInversePillRadius(width, height, 18, 0);
      assert.ok(2 * m.rx <= 100.05, `2*rx (${2 * m.rx}) <= 100 for w=${width}, h=${height}`);
      assert.ok(2 * m.ry <= height + 0.05, `2*ry (${2 * m.ry}) <= h for w=${width}, h=${height}`);
      assert.match(m.transform, /^translate3d\(18\.0px, 0\.0px, 0\) scaleX\(/);
    }
  }

  const fixed = computeInversePillRadius(160, 32, 12, 0, { fixedRadius: 7 });
  assert.ok(Math.abs(fixed.rx * fixed.sx - 7) < 0.05, 'fixedRadius=7 compensates scaleX accurately');
  assert.equal(fixed.ry, 7);

  // 1b. Visual JSDOM spring glider progression & mid-flight stop
  await withVisualDom(
    `<div id="tabs"><span id="glider"></span><button id="t1"></button><button id="t2"></button></div>`,
    { reducedMotion: false },
    async (_win, doc) => {
      const glider = doc.getElementById('glider');

      // Initial placement snaps immediately without waiting for spring frames
      const h0 = animatePillGlider(
        glider,
        { x: 4, y: 0, width: 80, height: 32 },
        { readyClass: 'is-ready' }
      );
      await h0.finished;
      assert.ok(glider.classList.contains('is-ready'));
      assert.equal(glider.style.width, '', 'animatePillGlider must never write layout style.width');
      assert.match(glider.style.transform, /translate3d\(4\.0px, 0\.0px, 0\) scaleX\(0\.8000\)/);

      // Second move animates smoothly with Motion spring
      const observedRx = new Set();
      const origSetProp = glider.style.setProperty.bind(glider.style);
      glider.style.setProperty = (prop, val) => {
        if (prop === '--pill-rx') observedRx.add(val);
        return origSetProp(prop, val);
      };

      const h1 = animatePillGlider(glider, { x: 112, y: 0, width: 140, height: 32 });
      await h1.finished;
      assert.ok(observedRx.size >= 2, 'Motion spring updates inverse --pill-rx across intermediate frames');
      assert.match(glider.style.transform, /translate3d\(112\.0px, 0\.0px, 0\) scaleX\(1\.4000\)/);

      // Mid-flight interruption via stopPillGlider settles deterministically without throwing
      const h2 = animatePillGlider(glider, { x: 24, y: 0, width: 64, height: 32 });
      stopPillGlider(glider);
      await h2.finished;
    }
  );

  // 1c. prefers-reduced-motion: reduce snaps glider immediately without spring frames
  await withVisualDom(
    `<div id="tabs"><span id="glider"></span></div>`,
    { reducedMotion: true },
    async (_win, doc) => {
      const glider = doc.getElementById('glider');
      animatePillGlider(glider, { x: 0, width: 70, height: 30 });
      animatePillGlider(glider, { x: 96, width: 120, height: 30 });
      assert.match(glider.style.transform, /translate3d\(96\.0px, 0\.0px, 0\) scaleX\(1\.2000\)/);
    }
  );
});

test('2. workbenchMotion: animatePaperModal, animateInkPopover & animateCountValue choreography', async () => {
  await withVisualDom(
    `<div id="overlay"><div id="card"></div></div><div id="popover"></div><strong id="counter">0</strong>`,
    { reducedMotion: false },
    async (_win, doc) => {
      const overlay = doc.getElementById('overlay');
      const card = doc.getElementById('card');
      const popover = doc.getElementById('popover');
      const counter = doc.getElementById('counter');

      let opened = false;
      const openModalHandle = animatePaperModal(overlay, card, 'open', {
        variant: 'slip',
        onComplete: () => {
          opened = true;
        },
      });
      await openModalHandle.finished;
      assert.equal(opened, true, 'animatePaperModal open fires onComplete');
      assert.equal(card.style.transform, '', 'clears inline transform after modal settle');

      let closed = false;
      const closeModalHandle = animatePaperModal(overlay, card, 'close', {
        variant: 'folio',
        closeDurationSec: 0.08,
        onComplete: () => {
          closed = true;
        },
      });
      await closeModalHandle.finished;
      assert.equal(closed, true, 'animatePaperModal folio close fires onComplete');

      const popOpen = animateInkPopover(popover, 'open', { radiusPx: 14, offsetY: -6 });
      await popOpen.finished;
      assert.equal(popover.style.clipPath, '', 'transient clipPath is cleared at rest');

      const countHandle = animateCountValue(counter, 64, {
        from: 0,
        durationSec: 0.08,
      });
      await countHandle.finished;
      assert.equal(counter.textContent, '64');
    }
  );
});

test('3. syncStore: multi-domain status folding (notes + mindmaps + reading) & push/pull/bidirectional flows', async () => {
  resetSyncStore();

  const observedConfluence = [];
  const unsub = $syncConfluence.subscribe((c) => {
    observedConfluence.push({
      flow: c.flowMode,
      label: c.confluenceLabel,
      pending: c.totalPending,
      incoming: c.totalIncoming,
    });
  });

  try {
    setSyncSessionUser({ username: 'areset' }, '云端就绪');
    setActiveAuthTab('register');
    assert.equal($syncSession.get().authenticated, true);
    assert.equal($syncSession.get().username, 'areset');
    assert.equal($syncSession.get().activeAuthTab, 'register');

    // Diverged snapshot across notes (ahead), mindmaps (behind), reading (ahead)
    const diverged = applySyncStatusSnapshots(
      { ok: true, state: 'ahead', localRev: 12, serverRev: 12, pendingCount: 3, incomingCount: 0, lastSyncAt: 1000 },
      { ok: true, state: 'behind', localRev: 4, serverRev: 6, pendingCount: 0, incomingCount: 2, lastSyncAt: 2000 },
      { ok: true, state: 'ahead', localRev: 8, serverRev: 8, pendingCount: 1, incomingCount: 0, lastSyncAt: 1500 }
    );
    assert.equal(diverged.badgeState, 'diverged');
    assert.equal(diverged.totalPending, 4);
    assert.equal(diverged.totalIncoming, 2);
    assert.equal($syncFlowMode.get(), 'idle');
    assert.ok(diverged.detailSummary.includes('导图: r4/r6') && diverged.detailSummary.includes('夹签: r8/r8'));

    // Mock 3-domain adapters for push, pull, and bidirectional sync
    let localPending = 4;
    let cloudIncoming = 2;
    const mockAdapters = {
      notes: {
        checkSyncStatus: async () => ({
          ok: true,
          state: localPending > 0 ? 'ahead' : cloudIncoming > 0 ? 'behind' : 'latest',
          localRev: 13,
          serverRev: 13,
          pendingCount: localPending,
          incomingCount: cloudIncoming,
          lastSyncAt: 3000,
        }),
        pushSync: async () => {
          localPending = 0;
          return { ok: true, pushedCount: 3, rev: 13 };
        },
        pullSync: async () => {
          cloudIncoming = 0;
          return { ok: true, pulledCount: 2, rev: 13 };
        },
        syncNow: async () => {
          localPending = 0;
          cloudIncoming = 0;
          return { ok: true, pushedCount: 1, pulledCount: 1, rev: 14 };
        },
      },
      mindmaps: {
        checkSyncStatus: async () => ({
          ok: true,
          state: 'latest',
          localRev: 6,
          serverRev: 6,
          pendingCount: 0,
          incomingCount: 0,
          lastSyncAt: 3000,
        }),
        pushSync: async () => ({ ok: true, pushedCount: 1, rev: 6 }),
        pullSync: async () => ({ ok: true, pulledCount: 1, rev: 6 }),
        syncNow: async () => ({ ok: true, pushedCount: 2, pulledCount: 0, rev: 7 }),
      },
      reading: {
        checkSyncStatus: async () => ({
          ok: true,
          state: 'latest',
          localRev: 9,
          serverRev: 9,
          pendingCount: 0,
          incomingCount: 0,
          lastSyncAt: 3000,
        }),
        pushSync: async () => ({ ok: true, pushedCount: 2, rev: 9 }),
        pullSync: async () => ({ ok: true, pulledCount: 0, rev: 9 }),
        syncNow: async () => ({ ok: true, pushedCount: 0, pulledCount: 3, rev: 10 }),
      },
    };

    const pushRes = await runUnifiedPushSync(mockAdapters);
    assert.equal(pushRes.ok, true);
    assert.equal(pushRes.totalPushed, 6);
    assert.equal($syncState.get().badgeState, 'behind');

    const pullRes = await runUnifiedPullSync(mockAdapters);
    assert.equal(pullRes.ok, true);
    assert.equal(pullRes.totalPulled, 3);
    assert.equal($syncState.get().badgeState, 'latest');
    assert.equal($syncFlowMode.get(), 'synced');
    assert.equal($syncConfluence.get().isSynced, true);

    const biRes = await runUnifiedBidirectionalSync({ migrate: true }, mockAdapters);
    assert.equal(biRes.ok, true);
    assert.equal(biRes.notesPushed + biRes.mindmapsPushed + biRes.readingPushed, 3);
    assert.equal(biRes.notesPulled + biRes.mindmapsPulled + biRes.readingPulled, 4);
    assert.ok(observedConfluence.some((e) => e.flow === 'pushing' && e.label === '呈送 →'));
    assert.ok(observedConfluence.some((e) => e.flow === 'pulling' && e.label === '← 采撷'));
    assert.ok(observedConfluence.some((e) => e.flow === 'bidirectional' && e.label === '⇄ 流转'));

    // Refresh when unauthenticated
    await refreshUnifiedSyncStatus({
      notes: {
        checkSyncStatus: async () => ({ ok: false, state: 'need-login', message: '请先登录' }),
      },
    });
    assert.equal($syncState.get().badgeState, 'need-login');
    assert.equal($syncFlowMode.get(), 'error');
  } finally {
    unsub();
    resetSyncStore();
  }
});

test('4. notesWorkbenchStore: reactive multi-dimensional filtering, stats aggregation & modal state', () => {
  resetNotesWorkbenchStore();

  withVisualDom('', {}, () => {
    setNotesItems([
      {
        id: 'n-free-1',
        kind: 'free',
        title: 'FastArray 网络同步备忘',
        text: '避免全量复制，善用 MarkItemDirty。',
        color: 'blue',
        tags: ['UE5', '网络'],
        postSlug: '__standalone__',
        postTitle: '独立便签',
        timestamp: 1000,
      },
      {
        id: 'n-hl-1',
        kind: 'highlight',
        text: 'GC 可达性分析采用并行标记。',
        comment: '注意簇引用回收时机',
        headingText: '§ 2. 垃圾回收',
        color: 'gold',
        tags: ['GC'],
        postSlug: 'ue5-gc',
        postTitle: 'UE5 GC 深度解析',
        timestamp: 2000,
      },
      {
        id: 'n-ai-1',
        kind: 'ai',
        question: 'RenderDoc 如何抓取单帧？',
        text: '注入 Vulkan/DX12 层并按 F12 截获命令队列。',
        color: 'red',
        tags: ['RenderDoc'],
        postSlug: 'renderdoc_Use',
        postTitle: 'RenderDoc 实战指南',
        timestamp: 3000,
      },
    ]);

    const stats = $notesStats.get();
    assert.equal(stats.total, 3);
    assert.equal(stats.free, 1);
    assert.equal(stats.highlight, 1);
    assert.equal(stats.ai, 1);
    assert.equal(stats.standalone, 1);
    assert.equal(stats.articles.length, 2);
    assert.equal($hasActiveNotesFilters.get(), false);

    // Kind filter + sessionStorage roundtrip
    setNotesKind('ai');
    assert.equal($filteredNotes.get().length, 1);
    assert.equal($filteredNotes.get()[0].id, 'n-ai-1');
    assert.equal($hasActiveNotesFilters.get(), true);
    $notesFilter.setKey('kind', 'all');
    assert.equal(hydrateNotesKindFromSession(), 'ai');

    // Reset, then filter by articleSlug, color, and keyword
    resetNotesFilters();
    assert.equal($filteredNotes.get().length, 3);

    setNotesArticleSlug('standalone');
    assert.deepEqual($filteredNotes.get().map((n) => n.id), ['n-free-1']);

    setNotesArticleSlug('ue5-gc');
    assert.deepEqual($filteredNotes.get().map((n) => n.id), ['n-hl-1']);

    setNotesArticleSlug('all');
    setNotesColor('red');
    assert.deepEqual($filteredNotes.get().map((n) => n.id), ['n-ai-1']);

    setNotesColor('all');
    setNotesSearchQuery('簇引用');
    assert.deepEqual($filteredNotes.get().map((n) => n.id), ['n-hl-1']);

    // Modal & popover state choreography
    setNotesPopoverOpen(true);
    assert.equal($notesActiveModal.get().popoverOpen, true);
    openNotesModal('reader', 'n-hl-1');
    assert.equal($notesActiveModal.get().modal, 'reader');
    assert.equal($notesActiveModal.get().viewingNoteId, 'n-hl-1');
    assert.equal($notesActiveModal.get().popoverOpen, false);
    setNotesEditorTab('preview');
    assert.equal($notesActiveModal.get().editorTab, 'preview');
    closeNotesModal('reader');
    assert.equal($notesActiveModal.get().modal, 'none');
    assert.equal($notesActiveModal.get().viewingNoteId, null);
  });

  resetNotesWorkbenchStore();
});

test('5. collectionFilterStore & workbenches static invariants (single-line imports, typeof guards, No-Seal & compositor rules)', () => {
  resetAllCollectionFilterStores();

  const lifeStore = getCollectionFilterController('life');
  const galleryStore = getCollectionFilterController('gallery');
  const isolated = createCollectionFilterStore('life', 'places');

  assert.equal(isolated.$state.get().category, 'places');
  assert.equal(isolated.$hasActiveFilter.get(), true);

  lifeStore.setCounts(5, 5);
  assert.equal(lifeStore.$state.get().isEmpty, false);
  lifeStore.setCategory('activities');
  lifeStore.setCounts(5, 0);
  assert.equal(lifeStore.$state.get().isEmpty, true);

  galleryStore.setCategory('nature');
  galleryStore.selectTag('日落', { resetCategoryToAll: true });
  assert.equal(galleryStore.$state.get().category, 'all');
  assert.equal(galleryStore.$state.get().searchQuery, '日落');
  assert.equal(galleryStore.$state.get().activeTag, '日落');
  assert.equal(
    matchCollectionDatasetItem(
      { category: 'urban', searchText: '深圳湾日落晚霞 sony a7m4' },
      galleryStore.$state.get()
    ),
    true
  );

  galleryStore.setActiveModal('photo-01');
  assert.equal(galleryStore.$state.get().activeModalId, 'photo-01');
  galleryStore.resetFilters();
  assert.equal(galleryStore.$state.get().searchQuery, '');
  resetAllCollectionFilterStores();

  // Verify life.astro & gallery.astro first <script> uses strictly single-line imports & typeof guards
  for (const kind of ['life', 'gallery']) {
    const src = readRepo(`src/pages/${kind}.astro`);
    const firstScript = src.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
    assert.ok(firstScript.length > 100, `${kind}.astro has <script>`);
    const stripped = firstScript.replace(/^\s*import .*?;\s*$/gm, '');
    assert.ok(!/\bimport\s+/.test(stripped), `${kind}.astro <script> must only contain single-line imports`);
    assert.ok(
      firstScript.includes("typeof getCollectionFilterController === 'function'"),
      `${kind}.astro guards getCollectionFilterController with typeof for stripped-import JSDOM harness`
    );
  }

  // Verify notes.astro #notes-stats-glider uses compositor scaleX without style.width writes
  const notesSrc = readRepo('src/pages/notes.astro');
  assert.ok(!notesSrc.includes('glider.style.width ='), 'notes.astro must not mutate layout glider.style.width');
  assert.ok(notesSrc.includes('animatePillGlider(') && notesSrc.includes('animatePaperModal('), 'notes.astro integrates workbenchMotion');

  // Verify account.astro & settings.astro integrate stores / workbenchMotion cleanly
  const accountSrc = readRepo('src/pages/account.astro');
  const settingsSrc = readRepo('src/pages/settings.astro');
  assert.ok(accountSrc.includes("from '../stores/syncStore'") && accountSrc.includes('animatePillGlider('));
  assert.ok(settingsSrc.includes("from '../utils/workbenchMotion'") && settingsSrc.includes('__settingsWorkbenchMotion'));

  // Scan all 4 new TS modules for forbidden seal/cinnabar tokens & filter:blur
  for (const rel of [
    'src/utils/workbenchMotion.ts',
    'src/stores/syncStore.ts',
    'src/stores/notesWorkbenchStore.ts',
    'src/stores/collectionFilterStore.ts',
  ]) {
    const code = readRepo(rel);
    assert.doesNotMatch(code, /#b83b28|#d9533f|#c23f2c|194,\s*63,\s*44|钤印|朱砂钤印|印信|印合/i);
    assert.doesNotMatch(code, /filter\s*:\s*[^;]*blur\(/i);
  }
});

test('6. account.astro bundled JSDOM runtime: declarative syncStore bindings, tab glider & cleanup', async () => {
  const accountSrc = readRepo('src/pages/account.astro');
  const markup = accountSrc
    .slice(0, accountSrc.indexOf('<script>'))
    .replace(/^---[\s\S]*?---/, '')
    .replace(/<\/?BaseLayout[^>]*>/g, '')
    .replace(/<Header\s*\/>/g, '');
  const scriptBody = accountSrc.match(/<script>([\s\S]*?)<\/script>/)[1];

  const bundled = esbuild.buildSync({
    stdin: {
      contents: scriptBody,
      resolveDir: path.join(rootDir, 'src/pages'),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
  }).outputFiles[0].text;

  const dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`, {
    url: 'http://localhost/account',
    runScripts: 'outside-only',
  });

  try {
    const win = dom.window;
    const doc = win.document;
    win.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    win.requestAnimationFrame = (cb) => {
      cb(0);
      return 1;
    };
    win.cancelAnimationFrame = () => {};

    const tabLogin = doc.getElementById('tabLogin');
    const tabRegister = doc.getElementById('tabRegister');
    const glider = doc.getElementById('accountTabGlider');
    Object.defineProperty(tabLogin, 'offsetLeft', { value: 4 });
    Object.defineProperty(tabLogin, 'offsetWidth', { value: 140 });
    Object.defineProperty(tabLogin, 'offsetHeight', { value: 36 });
    Object.defineProperty(tabRegister, 'offsetLeft', { value: 150 });
    Object.defineProperty(tabRegister, 'offsetWidth', { value: 160 });
    Object.defineProperty(tabRegister, 'offsetHeight', { value: 36 });
    Object.defineProperty(glider, 'offsetHeight', { value: 36 });

    // Pre-wire mock sync engines so initNotesSync/initMindmapSync/initReadingSync don't schedule background timers
    win.__areSetNotesSyncInit = true;
    win.__areSetMindmapsSyncInit = true;
    win.__areSetReadingSyncInit = true;
    win.__notesSync = {
      checkSyncStatus: async () => ({
        ok: true,
        state: 'ahead',
        localRev: 5,
        serverRev: 5,
        pendingCount: 2,
        incomingCount: 0,
        lastSyncAt: 1000,
      }),
      pushSync: async () => ({ ok: true, pushedCount: 2, rev: 6 }),
      pullSync: async () => ({ ok: true, pulledCount: 0, rev: 6 }),
      syncNow: async () => ({ ok: true, pushedCount: 2, pulledCount: 1, rev: 7 }),
    };
    win.__mindmapsSync = {
      checkSyncStatus: async () => ({
        ok: true,
        state: 'behind',
        localRev: 2,
        serverRev: 3,
        pendingCount: 0,
        incomingCount: 1,
        lastSyncAt: 1000,
      }),
      pushSync: async () => ({ ok: true, pushedCount: 0, rev: 2 }),
      pullSync: async () => ({ ok: true, pulledCount: 1, rev: 3 }),
      syncNow: async () => ({ ok: true, pushedCount: 0, pulledCount: 1, rev: 3 }),
    };
    win.__readingSync = {
      checkSyncStatus: async () => ({
        ok: true,
        state: 'latest',
        localRev: 4,
        serverRev: 4,
        pendingCount: 1,
        incomingCount: 0,
        lastSyncAt: 1000,
      }),
      pushSync: async () => ({ ok: true, pushedCount: 1, rev: 5 }),
      pullSync: async () => ({ ok: true, pulledCount: 0, rev: 5 }),
      syncNow: async () => ({ ok: true, pushedCount: 1, pulledCount: 0, rev: 5 }),
    };

    win.fetch = async (url) => {
      if (String(url).includes('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, user: { id: 'u1', username: 'mo_ink' } }),
        };
      }
      return { ok: true, status: 200, text: async () => '{}' };
    };

    win.eval(bundled);
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(doc.getElementById('profileUsername').textContent, 'mo_ink');
    assert.equal(doc.getElementById('syncBadge').getAttribute('data-state'), 'diverged');
    assert.equal(doc.getElementById('pushPendingTag').textContent, '3 项待提交');
    assert.equal(doc.getElementById('pullIncomingTag').textContent, '1 项新内容');
    assert.equal(doc.getElementById('bridgeLocalMeta').textContent, '待提交 3');
    assert.equal(doc.getElementById('bridgeCloudMeta').textContent, '待拉取 1');

    // Emit mindmaps:sync-phase -> updates #syncInkBridge declaratively via syncStore
    win.dispatchEvent(new win.CustomEvent('mindmaps:sync-phase', { detail: { phase: 'start', mode: 'push' } }));
    assert.equal(doc.getElementById('syncInkBridge').getAttribute('data-flow'), 'pushing');
    assert.equal(doc.getElementById('bridgeConfluenceLabel').textContent, '呈送 →');

    // Switch auth tabs -> glider translates via pure compositor scaleX
    tabRegister.click();
    assert.match(glider.style.transform, /translate3d\(150\.0px, 0\.0px, 0\) scaleX\(1\.6000\)/);
    assert.equal(glider.style.width, '');

    assert.equal(typeof win.__areSetAccountCleanup__, 'function');
    win.__areSetAccountCleanup__();
    assert.equal(win.__areSetAccountCleanup__, undefined);
  } finally {
    dom.window.close();
  }
});
