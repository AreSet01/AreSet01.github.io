import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

// Route module-level requestAnimationFrame calls from `motion` to active JSDOM/test clock
let activeRafImpl = (cb) => setTimeout(() => cb(performance.now()), 8);
let activeCancelRafImpl = (id) => clearTimeout(id);

globalThis.requestAnimationFrame = (cb) => activeRafImpl(cb);
globalThis.cancelAnimationFrame = (id) => activeCancelRafImpl(id);

const {
  addChildNode,
  createBlankMindMap,
  MINDMAP_STORAGE_KEY,
  MINDMAP_CATEGORIES_KEY,
} = await import('../src/utils/mindmapEngine.ts');

const {
  $mmItems,
  $mmCategories,
  $mmFilter,
  $mmStats,
  $mmActiveState,
  $hasActiveMmFilters,
  $filteredMindMaps,
  setMindMapItems,
  setMindMapCategories,
  setMmCategory,
  setMmColor,
  setMmPostSlug,
  setMmLinkedOnly,
  toggleMmLinkedOnly,
  setMmSearchQuery,
  setMmArticleSearchQuery,
  resetMmFilters,
  openMmWorkbenchState,
  closeMmWorkbenchState,
  setMmViewMode,
  setMmLayoutMode,
  setMmSelectionState,
  setMmDirtyState,
  setMmActiveModal,
  setMmArticlePopoverOpen,
  setMmExportMenuOpen,
  resetMindMapWorkbenchStore,
} = await import('../src/stores/mindmapWorkbenchStore.ts');

const {
  $companionState,
  $isCompanionOverlayActive,
  $activeCompanionPanel,
  hydrateCompanionSplitRatio,
  setCompanionSplitRatio,
  setCompanionResizing,
  setCompanionModeState,
  setCompanionPanelStatus,
  syncCompanionSnapshot,
  resetCompanionStore,
} = await import('../src/stores/companionStore.ts');

const rootDir = process.cwd();
const readRepo = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

test('1. mindmapWorkbenchStore: reactive multi-dimensional filters, deep node search, stats & active workbench state', () => {
  resetMindMapWorkbenchStore();

  try {
    const mapArch = createBlankMindMap('架构拆解', 'UE5 MassEntity 架构');
    mapArch.color = 'gold';
    mapArch.postSlug = 'ue5-mass';
    mapArch.postTitle = 'UE5 Mass 框架解析';
    mapArch.tags = ['ECS', 'DataOriented'];
    const archAdd = addChildNode(mapArch.root, mapArch.root.id, 'Archetype 内存块');
    mapArch.root = archAdd.root;
    mapArch.root.children[0].note = 'Chunk 连续布局避免 Cache Miss';

    const mapRender = createBlankMindMap('源码研读', 'RenderDoc 帧截取管线');
    mapRender.color = 'red';
    mapRender.postSlug = 'renderdoc_Use';
    mapRender.postTitle = 'RenderDoc 实战指南';
    mapRender.tags = ['Graphics', 'Vulkan'];

    const mapFree = createBlankMindMap('灵感随想', '个人知识体系草图');
    mapFree.color = 'blue';
    mapFree.tags = ['PKM'];

    setMindMapItems([mapArch, mapRender, mapFree], ['架构拆解', '源码研读', '知识体系', '灵感随想']);

    const stats = $mmStats.get();
    assert.equal(stats.totalMaps, 3);
    assert.equal(stats.categoryCount, 4);
    assert.equal(stats.linkedCount, 2);
    assert.equal(stats.standaloneCount, 1);
    assert.equal(stats.articles.length, 2);
    assert.ok(stats.totalNodes >= 7, `expected >= 7 total nodes, got ${stats.totalNodes}`);
    assert.equal($hasActiveMmFilters.get(), false);
    assert.equal($filteredMindMaps.get().length, 3);

    // Category filter + auto-fallback when category is deleted
    setMmCategory('源码研读');
    assert.equal($hasActiveMmFilters.get(), true);
    assert.deepEqual($filteredMindMaps.get().map((m) => m.id), [mapRender.id]);

    setMindMapCategories(['架构拆解', '灵感随想']);
    assert.equal($mmFilter.get().category, 'all', 'removing active category resets filter to all');
    assert.equal($mmStats.get().categoryCount, 2);

    // Linked-only toggle & postSlug filter
    assert.equal(toggleMmLinkedOnly(), true);
    assert.equal($filteredMindMaps.get().length, 2);
    setMmLinkedOnly(false);

    setMmPostSlug('__standalone__');
    assert.deepEqual($filteredMindMaps.get().map((m) => m.id), [mapFree.id]);

    setMmPostSlug('ue5-mass');
    assert.deepEqual($filteredMindMaps.get().map((m) => m.id), [mapArch.id]);

    // Color & deep nested node note search
    resetMmFilters();
    setMmColor('red');
    assert.deepEqual($filteredMindMaps.get().map((m) => m.id), [mapRender.id]);

    setMmColor('all');
    setMmSearchQuery('cache miss');
    assert.deepEqual(
      $filteredMindMaps.get().map((m) => m.id),
      [mapArch.id],
      'deep node note text is matched by $filteredMindMaps'
    );

    setMmArticleSearchQuery('RenderDoc');
    assert.equal($mmFilter.get().articleSearchQuery, 'RenderDoc');

    // Workbench active state transitions
    openMmWorkbenchState(mapArch, 'canvas');
    assert.equal($mmActiveState.get().activeMapId, mapArch.id);
    assert.equal($mmActiveState.get().activeModal, 'workbench');
    assert.equal($mmActiveState.get().viewMode, 'canvas');
    assert.equal($mmActiveState.get().selectedNodeCount, 1);

    setMmViewMode('split');
    setMmLayoutMode('mindmap-both');
    setMmSelectionState(3, archAdd.createdId);
    setMmDirtyState(true);
    setMmExportMenuOpen(true);
    setMmArticlePopoverOpen(true);
    assert.equal($mmActiveState.get().viewMode, 'split');
    assert.equal($mmActiveState.get().layout, 'mindmap-both');
    assert.equal($mmActiveState.get().selectedNodeCount, 3);
    assert.equal($mmActiveState.get().primaryNodeId, archAdd.createdId);
    assert.equal($mmActiveState.get().isDirty, true);
    assert.equal($mmActiveState.get().exportMenuOpen, true);
    assert.equal($mmActiveState.get().articlePopoverOpen, true);

    closeMmWorkbenchState();
    assert.equal($mmActiveState.get().activeMapId, null);
    assert.equal($mmActiveState.get().activeModal, 'none');
    assert.equal($mmActiveState.get().selectedNodeCount, 0);
    assert.equal($mmActiveState.get().isDirty, false);

    setMmActiveModal('categories');
    assert.equal($mmActiveState.get().activeModal, 'categories');
  } finally {
    resetMindMapWorkbenchStore();
    assert.equal($mmItems.get().length, 0);
    assert.equal($mmCategories.get().length, 4);
  }
});

test('2. companionStore: reactive rail/full/split state transitions & viewport-bounded ratio clamping', () => {
  resetCompanionStore();

  try {
    assert.equal($companionState.get().mode, 'rail');
    assert.equal($isCompanionOverlayActive.get(), false);
    assert.equal($activeCompanionPanel.get(), null);

    // Hydrate stored ratio with viewport clamping
    assert.equal(hydrateCompanionSplitRatio('0.64', 1920), 0.64);
    assert.equal(hydrateCompanionSplitRatio('invalid', 1920), 0.5);
    const narrowMin = setCompanionSplitRatio(0.1, 1024);
    assert.ok(narrowMin > 0.26 && narrowMin < 0.35, `narrow 1024px clamps min ratio above 0.26: ${narrowMin}`);

    // Rail open -> full -> split -> resizing
    setCompanionPanelStatus('ask', true, false);
    assert.equal($activeCompanionPanel.get(), 'ask');
    assert.equal($companionState.get().lastActiveKind, 'ask');

    setCompanionModeState('notes-full', 'notes');
    setCompanionPanelStatus('ask', false, false);
    setCompanionPanelStatus('notes', true, true);
    assert.equal($isCompanionOverlayActive.get(), true);
    assert.equal($companionState.get().notesMaximized, true);
    assert.equal($activeCompanionPanel.get(), 'notes');

    syncCompanionSnapshot({
      mode: 'split',
      notesOpen: true,
      askOpen: true,
      notesMaximized: false,
      askMaximized: false,
      splitRatio: 0.5,
    });
    assert.equal($companionState.get().splitActive, true);
    assert.equal($activeCompanionPanel.get(), 'both');

    setCompanionResizing(true);
    assert.equal($companionState.get().resizing, true);
    setCompanionResizing(false);
    assert.equal($companionState.get().resizing, false);
  } finally {
    resetCompanionStore();
  }
});

test('3. CompanionLayout.astro bundled JSDOM runtime: companionStore sync, animatePillGlider syncSegGlider & split drag', async () => {
  const companionSrc = readRepo('src/components/CompanionLayout.astro');
  const htmlMarkup = companionSrc.slice(0, companionSrc.indexOf('<style>')).replace(/^---[\s\S]*?---/, '');
  const scriptBody = companionSrc.match(/<script>([\s\S]*?)<\/script>/)[1];

  const bundled = esbuild.buildSync({
    stdin: {
      contents: scriptBody,
      resolveDir: path.join(rootDir, 'src/components'),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
  }).outputFiles[0].text;

  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div class="site-shell"><main>Article body</main></div>
      ${htmlMarkup}
      <aside class="ink-ask-drawer" id="mock-ask">
        <div class="ink-ask-drawer-head">
          <div class="ink-ask-drawer-head-inner">
            <div class="ink-ask-drawer-title-area">墨问</div>
            <div class="ink-ask-drawer-actions"><button class="ink-ask-drawer-maximize" type="button"></button></div>
          </div>
        </div>
        <div class="ink-ask-drawer-body"></div>
      </aside>
      <aside class="article-notes-drawer" id="mock-notes">
        <div class="notes-drawer-header">
          <div class="notes-drawer-header-inner">
            <div class="notes-drawer-title-area">笔记 <span data-notes-count>5</span></div>
            <div class="notes-drawer-actions"><button class="notes-drawer-maximize-btn" type="button"></button></div>
          </div>
        </div>
        <div class="notes-drawer-body"></div>
      </aside>
    </body></html>`,
    { url: 'http://localhost/posts/test-companion/', runScripts: 'outside-only', pretendToBeVisual: true }
  );

  try {
    const win = dom.window;
    const doc = win.document;
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1600 });
    win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    win.HTMLElement.prototype.getAnimations = () => [];
    win.HTMLElement.prototype.animate = () => ({
      playState: 'finished',
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
      onfinish: null,
      oncancel: null,
    });

    const savedGlobals = {
      window: globalThis.window,
      document: globalThis.document,
      HTMLElement: globalThis.HTMLElement,
      getComputedStyle: globalThis.getComputedStyle,
    };
    globalThis.window = win;
    globalThis.document = doc;
    globalThis.HTMLElement = win.HTMLElement;
    globalThis.getComputedStyle = win.getComputedStyle.bind(win);

    const prevRaf = activeRafImpl;
    const prevCancel = activeCancelRafImpl;
    activeRafImpl = (cb) => win.requestAnimationFrame(cb);
    activeCancelRafImpl = (id) => win.cancelAnimationFrame(id);

    try {
      win.eval(bundled);
      assert.ok(win.__companion?.ready, 'window.__companion is mounted');

      const askEl = doc.getElementById('mock-ask');
      const notesEl = doc.getElementById('mock-notes');
      const state = {
        ask: { open: true, full: false },
        notes: { open: false, full: false },
      };

      const makeApi = (kind) => ({
        open: ({ silent } = {}) => {
          state[kind].open = true;
          if (!silent) win.dispatchEvent(new win.CustomEvent('companion:panel', { detail: { kind, open: true } }));
        },
        close: () => {
          state[kind].open = false;
          state[kind].full = false;
        },
        isOpen: () => state[kind].open,
        isFull: () => state[kind].full,
        setFull: (want) => {
          state[kind].full = Boolean(want);
        },
      });

      win.__companion.register('ask', askEl, makeApi('ask'));
      win.__companion.register('notes', notesEl, makeApi('notes'));

      // Give mock dimensions to injected segmented buttons so syncSegGlider computes scaleX
      for (const panelEl of [askEl, notesEl]) {
        const btns = panelEl.querySelectorAll('.companion-seg-btn');
        const glider = panelEl.querySelector('.companion-seg-glider');
        Object.defineProperty(glider, 'offsetHeight', { configurable: true, value: 30 });
        Object.defineProperty(btns[0], 'offsetLeft', { configurable: true, value: 3 });
        Object.defineProperty(btns[0], 'offsetWidth', { configurable: true, value: 68 });
        Object.defineProperty(btns[0], 'offsetHeight', { configurable: true, value: 30 });
        Object.defineProperty(btns[1], 'offsetLeft', { configurable: true, value: 74 });
        Object.defineProperty(btns[1], 'offsetWidth', { configurable: true, value: 86 });
        Object.defineProperty(btns[1], 'offsetHeight', { configurable: true, value: 30 });
      }

      await new Promise((r) => setTimeout(r, 30));

      const askGlider = askEl.querySelector('.companion-seg-glider');
      assert.equal(askGlider.style.width, '', 'syncSegGlider must never mutate layout style.width');
      assert.match(askGlider.style.transform, /translate3d\(3\.0px, 0\.0px, 0\) scaleX\(0\.6800\)/);
      assert.ok(askGlider.style.getPropertyValue('--pill-rx').endsWith('px'));

      // Switch rail from ask -> notes
      win.__companion.switchPanel('notes');
      await new Promise((r) => setTimeout(r, 60));
      const snapAfterSwitch = win.__companion.state();
      assert.equal(snapAfterSwitch.mode, 'rail');
      assert.equal(snapAfterSwitch.notesOpen, true);
      assert.equal(snapAfterSwitch.askOpen, false);
      const notesGlider = notesEl.querySelector('.companion-seg-glider');
      assert.equal(notesGlider.style.width, '', 'notes glider also uses pure compositor scaleX');
      assert.ok(notesGlider.style.transform.includes('scaleX('));

      // Enter split mode & drag splitter
      win.__companion.enterSplit('notes');
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(win.__companion.state().mode, 'split');
      assert.equal(win.__companion.state().splitActive, true);
      assert.equal(win.__companion.state().notesOpen, true);
      assert.equal(win.__companion.state().askOpen, true);

      const splitter = doc.getElementById('companion-splitter');
      splitter.dispatchEvent(new win.MouseEvent('pointerdown', { clientX: 800, bubbles: true, cancelable: true }));
      assert.equal(win.__companion.state().resizing, true);
      win.dispatchEvent(new win.MouseEvent('pointermove', { clientX: 960, bubbles: true }));
      win.dispatchEvent(new win.MouseEvent('pointerup', { clientX: 960, bubbles: true }));
      assert.equal(win.__companion.state().resizing, false);
      assert.ok(win.__companion.state().splitRatio > 0.55, 'dragging splitter right updates $companionState.splitRatio');

      // Cleanup tears down cleanly
      assert.equal(typeof win.__areSetCompanionCleanup__, 'function');
      win.__areSetCompanionCleanup__();
      assert.equal(win.__companion, undefined);
      assert.equal(win.__areSetCompanionCleanup__, undefined);
    } finally {
      activeRafImpl = prevRaf;
      activeCancelRafImpl = prevCancel;
      for (const [k, v] of Object.entries(savedGlobals)) {
        if (typeof v === 'undefined') delete globalThis[k];
        else globalThis[k] = v;
      }
    }
  } finally {
    dom.window.close();
  }
});

test('4. mindmap.astro bundled JSDOM runtime: mindmapWorkbenchStore bindings, gliders, popovers & workbench view modes', async () => {
  const mindmapSrc = readRepo('src/pages/mindmap.astro');
  const postsJson = JSON.stringify([
    { slug: 'renderdoc_Use', title: 'RenderDoc 实战指南', url: '/posts/renderdoc_Use', category: '图形学', headings: [] },
  ]);
  const markup = mindmapSrc
    .slice(0, mindmapSrc.indexOf('<style>'))
    .replace(/^---[\s\S]*?---/, '')
    .replace(/<script id="mindmap-posts-data"[^>]*\/>/, `<script id="mindmap-posts-data" type="application/json">${postsJson}</script>`)
    .replace(/<\/?BaseLayout[^>]*>/g, '')
    .replace(/<Header\s*\/>/g, '');
  const scriptBody = mindmapSrc.match(/<script>([\s\S]*?)<\/script>/)[1];

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
    url: 'http://localhost/mindmap',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  try {
    const win = dom.window;
    const doc = win.document;
    win.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    win.__areSetMindmapsSyncInit = true;

    const seededA = createBlankMindMap('架构拆解', 'ECS 核心脉络');
    seededA.color = 'gold';
    seededA.postSlug = 'renderdoc_Use';
    seededA.postTitle = 'RenderDoc 实战指南';
    const seededB = createBlankMindMap('灵感随想', '独立草稿');
    seededB.color = 'blue';

    win.localStorage.setItem(MINDMAP_STORAGE_KEY, JSON.stringify([seededA, seededB]));
    win.localStorage.setItem(
      MINDMAP_CATEGORIES_KEY,
      JSON.stringify({ categories: ['架构拆解', '源码研读', '知识体系', '灵感随想'], updatedAt: 1000 })
    );

    // Mock glider & button dimensions
    const statsGlider = doc.getElementById('mm-stats-glider');
    const statItems = doc.querySelectorAll('[data-mm-stat]');
    Object.defineProperty(statsGlider, 'offsetHeight', { configurable: true, value: 36 });
    statItems.forEach((el, idx) => {
      Object.defineProperty(el, 'offsetLeft', { configurable: true, value: idx * 96 + 6 });
      Object.defineProperty(el, 'offsetWidth', { configurable: true, value: 88 });
      Object.defineProperty(el, 'offsetHeight', { configurable: true, value: 36 });
    });

    const subtabsGlider = doc.getElementById('mm-subtabs-glider');
    Object.defineProperty(subtabsGlider, 'offsetHeight', { configurable: true, value: 34 });
    doc.querySelectorAll('#mm-subtabs-cluster .sub-tab-btn').forEach((btn, idx) => {
      Object.defineProperty(btn, 'offsetLeft', { configurable: true, value: idx * 84 + 4 });
      Object.defineProperty(btn, 'offsetWidth', { configurable: true, value: 78 });
      Object.defineProperty(btn, 'offsetHeight', { configurable: true, value: 34 });
    });

    for (const segId of ['mm-view-mode-switch', 'mm-layout-switch']) {
      const seg = doc.getElementById(segId);
      const g = seg.querySelector('.mm-seg-glider');
      Object.defineProperty(g, 'offsetHeight', { configurable: true, value: 28 });
      seg.querySelectorAll('.mm-seg-btn').forEach((btn, idx) => {
        Object.defineProperty(btn, 'offsetLeft', { configurable: true, value: idx * 72 + 2 });
        Object.defineProperty(btn, 'offsetWidth', { configurable: true, value: 68 });
        Object.defineProperty(btn, 'offsetHeight', { configurable: true, value: 28 });
      });
    }

    win.eval(bundled);
    await new Promise((r) => setTimeout(r, 25));

    const store = win.__mindmapWorkbenchStore;
    assert.ok(store, 'window.__mindmapWorkbenchStore exposed');
    assert.equal(doc.getElementById('mm-stat-total').textContent, '2');
    assert.equal(doc.getElementById('mm-stat-linked').textContent, '1');
    assert.equal(store.$mmStats.get().totalMaps, 2);

    // Stats glider moves via animatePillGlider without mutating style.width
    statItems[3].dispatchEvent(new win.Event('focus'));
    assert.equal(statsGlider.style.width, '');
    assert.match(statsGlider.style.transform, /scaleX\(0\.8800\)/);

    // Subtab click updates $mmFilter.category and moves #mm-subtabs-glider
    const archTab = doc.querySelector('#mm-subtabs-cluster [data-mm-cat="架构拆解"]');
    archTab.click();
    assert.equal(store.$mmFilter.get().category, '架构拆解');
    assert.equal(store.$filteredMindMaps.get().length, 1);
    assert.match(subtabsGlider.style.transform, /translate3d\(88\.0px, 0\.0px, 0\) scaleX\(0\.7800\)/);

    // Article popover opens & syncs store
    doc.getElementById('mm-article-popover-trigger').click();
    assert.equal(store.$mmActiveState.get().articlePopoverOpen, true);
    doc.getElementById('mm-article-popover-trigger').click();
    assert.equal(store.$mmActiveState.get().articlePopoverOpen, false);

    // Click card to open workbench -> syncs $mmActiveState, view mode glider & export popover
    const firstCard = doc.getElementById(`mm-card-${seededA.id}`);
    assert.ok(firstCard, 'rendered mindmap card exists');
    firstCard.click();
    await new Promise((r) => setTimeout(r, 25));

    assert.equal(store.$mmActiveState.get().activeMapId, seededA.id);
    assert.equal(store.$mmActiveState.get().activeModal, 'workbench');
    assert.equal(store.$mmActiveState.get().viewMode, 'canvas');

    doc.querySelector('[data-wb-mode="split"]').click();
    assert.equal(store.$mmActiveState.get().viewMode, 'split');
    const viewGlider = doc.querySelector('#mm-view-mode-switch .mm-seg-glider');
    assert.equal(viewGlider.style.width, '');
    assert.match(viewGlider.style.transform, /translate3d\(74\.0px, 0\.0px, 0\) scaleX\(0\.6800\)/);

    doc.getElementById('mm-export-trigger').click();
    assert.equal(store.$mmActiveState.get().exportMenuOpen, true);

    assert.equal(typeof win.__areSetMindmapPageCleanup__, 'function');
    win.__areSetMindmapPageCleanup__();
    assert.equal(win.__areSetMindmapPageCleanup__, undefined);
  } finally {
    dom.window.close();
  }
});

test('5. Static invariants & architecture docs sync (No-Seal, zero blur, compositor gliders & Astro 6 + React 19 + Motion + Three.js + Nanostores)', () => {
  const mindmapAstro = readRepo('src/pages/mindmap.astro');
  const companionAstro = readRepo('src/components/CompanionLayout.astro');
  const mmStore = readRepo('src/stores/mindmapWorkbenchStore.ts');
  const compStore = readRepo('src/stores/companionStore.ts');
  const animDocs = readRepo('docs/animations-and-pages.md');
  const readme = readRepo('README.md');

  // mindmap.astro & CompanionLayout.astro wire stores + workbenchMotion while preserving core contracts
  assert.ok(mindmapAstro.includes("from '../stores/mindmapWorkbenchStore'"));
  assert.ok(mindmapAstro.includes("from '../utils/workbenchMotion'"));
  assert.ok(mindmapAstro.includes('function tickViewportPhysics(now: number)'));
  assert.ok(mindmapAstro.includes('buildInkBranchPath'));

  assert.ok(companionAstro.includes("from '../stores/companionStore'"));
  assert.ok(companionAstro.includes("from '../utils/workbenchMotion'"));
  assert.ok(companionAstro.includes('function syncSegGlider('));
  assert.ok(!companionAstro.includes('glider.style.width ='));

  // Zero forbidden seal tokens / cinnabar hex / dynamic filter:blur in stores & components
  for (const [name, code] of [
    ['mindmapWorkbenchStore.ts', mmStore],
    ['companionStore.ts', compStore],
    ['mindmap.astro', mindmapAstro],
    ['CompanionLayout.astro', companionAstro],
  ]) {
    assert.doesNotMatch(code, /#b83b28|#d9533f|#c23f2c|194,\s*63,\s*44|钤印|朱砂印|印信|印合/i, `${name} must stay desealed`);
    assert.doesNotMatch(code, /(?<![a-z-])filter\s*:\s*[^;]*blur\(/i, `${name} must not use dynamic filter: blur`);
  }

  // Docs & README document upgraded stack, 2D/3D WebGL Nebula, ThreeDemoStage & src/stores/* while staying desealed
  for (const [name, doc] of [
    ['docs/animations-and-pages.md', animDocs],
    ['README.md', readme],
  ]) {
    assert.match(doc, /Astro\s*v?6/i, `${name} documents Astro 6`);
    assert.match(doc, /React 19/i, `${name} documents React 19 Islands`);
    assert.match(doc, /Motion/i, `${name} documents Motion`);
    assert.match(doc, /Three\.js/i, `${name} documents Three.js`);
    assert.match(doc, /Nanostores/i, `${name} documents Nanostores`);
    assert.match(doc, /三维星云/, `${name} documents /tags 2D/3D WebGL Nebula`);
    assert.match(doc, /ThreeDemoStage/, `${name} documents ThreeDemoStage RenderDoc 3D Pass Inspector`);
    assert.match(doc, /src\/stores/, `${name} documents src/stores/* layer`);
    assert.doesNotMatch(doc, /钤印|朱砂印|朱砂石章|问字印|开场印章|谢谢来访|印信|朱砂印章/, `${name} has zero seal terminology`);
  }
});
