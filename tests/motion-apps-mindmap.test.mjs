import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addChildNode,
  computeInkBranchStrokeWidth,
  computeInkBranchOpacity,
  buildInkBranchPath,
  buildTopologyPreviewSvg,
  createBlankMindMap,
  upsertMindMap,
} from '../src/utils/mindmapEngine.ts';
import {
  pushMindMapSync,
  pullMindMapSync,
} from '../src/utils/mindmapSync.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

const OWNED_SOURCE_FILES = [
  'src/pages/mindmap.astro',
  'src/utils/mindmapEngine.ts',
  'src/utils/mindmapSync.ts',
  'src/pages/notes.astro',
  'src/pages/gallery.astro',
  'src/pages/life.astro',
  'src/pages/settings.astro',
  'src/pages/account.astro',
];

const OWNED_ASTRO_PAGES = [
  'src/pages/mindmap.astro',
  'src/pages/notes.astro',
  'src/pages/gallery.astro',
  'src/pages/life.astro',
  'src/pages/settings.astro',
  'src/pages/account.astro',
];

test('1. mindmapEngine.ts: hierarchical brush-stroke tapering & asymmetric calligraphic Bezier curves', () => {
  // Stroke width tapers monotonically from trunk (depth 1) to fine twigs (depth 4+)
  const w1 = computeInkBranchStrokeWidth(1);
  const w2 = computeInkBranchStrokeWidth(2);
  const w3 = computeInkBranchStrokeWidth(3);
  const w4 = computeInkBranchStrokeWidth(4);
  assert.ok(w1 > w2 && w2 > w3 && w3 > w4, `expected w1(${w1}) > w2(${w2}) > w3(${w3}) > w4(${w4})`);
  assert.ok(w1 >= 2.5 && w4 >= 1.0, 'brush stroke widths stay within legible calligraphic bounds');

  // Ink concentration opacity tapers gently by depth
  const o1 = computeInkBranchOpacity(1);
  const o2 = computeInkBranchOpacity(2);
  const o3 = computeInkBranchOpacity(3);
  const o4 = computeInkBranchOpacity(4);
  assert.ok(o1 > o2 && o2 > o3 && o3 > o4, 'ink branch opacity tapers smoothly across hierarchy');

  // Calligraphic cubic Bezier path generation for right, left, and down branches
  const parent = { x: 100, y: 120, w: 120, h: 40 };
  const rightChild = { x: 320, y: 190, w: 110, h: 36, side: 'right' };
  const leftChild = { x: -130, y: 80, w: 110, h: 36, side: 'left' };
  const downChild = { x: 150, y: 260, w: 110, h: 36, side: 'down' };

  const rightPath = buildInkBranchPath(parent, rightChild);
  const leftPath = buildInkBranchPath(parent, leftChild);
  const downPath = buildInkBranchPath(parent, downChild);

  for (const [label, d] of [
    ['right', rightPath],
    ['left', leftPath],
    ['down', downPath],
  ]) {
    assert.match(
      d,
      /^M\s*-?\d+(\.\d+)?\s+-?\d+(\.\d+)?\s+C\s*-?\d+(\.\d+)?\s+-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s+-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s+-?\d+(\.\d+)?$/,
      `${label} branch path must be a valid cubic Bezier curve: ${d}`
    );
  }

  // Asymmetric calligraphic lead-in vs settle tangent check (c1x != midpoint == c2x)
  const nums = rightPath.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const [sx, , c1x, , c2x, , ex] = nums;
  const span = ex - sx;
  const leadRatio = (c1x - sx) / span;
  const settleRatio = (ex - c2x) / span;
  assert.notEqual(
    leadRatio.toFixed(2),
    settleRatio.toFixed(2),
    'calligraphic Bezier should use asymmetric brush lead-in vs settle tangents rather than generic 0.5/0.5 SaaS midpoint'
  );

  // Topology preview SVG uses tapered stroke-width attributes
  const doc = createBlankMindMap('架构拆解', '水墨枝蔓预览');
  doc.root = addChildNode(doc.root, doc.root.id, '一级主脉').root;
  const firstChildId = doc.root.children[0].id;
  doc.root = addChildNode(doc.root, firstChildId, '二级细枝').root;
  const svg = buildTopologyPreviewSvg(doc.root, doc.layout);
  assert.ok(svg.includes('<svg') && svg.includes('stroke-linecap="round"'), 'preview SVG uses rounded brush caps');
  const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(widths.length >= 2 && widths[0] > widths[1], 'preview SVG reflects hierarchical stroke-width tapering');
});

test('2. mindmap.astro: single-rAF viewport physics, momentum inertia, focal wheel damping, water-ink branch growth & minimap', () => {
  const page = readRepoFile('src/pages/mindmap.astro');

  // Single-rAF viewport physics loop coalescing pan, momentum inertia, and damped wheel zoom
  assert.ok(page.includes('function tickViewportPhysics(now: number)'), 'single-rAF tickViewportPhysics loop exists');
  assert.ok(page.includes('function requestViewportFrame()'), 'requestViewportFrame coalesces viewport mutations');
  assert.ok(page.includes('Math.exp(-5.6 * dt)'), 'exponential-decay pan momentum inertia is implemented');
  assert.ok(page.includes('1 - Math.exp(-20 * dt)'), 'frame-rate independent focal wheel zoom damping is implemented');
  assert.ok(page.includes('new ResizeObserver') && page.includes('cachedVpRect'), 'viewport rect is cached via ResizeObserver to avoid forced reflows in pointermove/wheel');

  // Ensure wheel handler on canvasPane uses cachedVpRect rather than synchronous getBoundingClientRect()
  const wheelBlockMatch = page.match(/canvasPane\.addEventListener\(\s*'wheel'[\s\S]*?\{\s*passive:\s*false,\s*signal\s*\}\s*\);/);
  assert.ok(wheelBlockMatch, 'wheel listener found on canvasPane');
  assert.ok(
    !wheelBlockMatch[0].includes('getBoundingClientRect'),
    'wheel handler must use cachedVpRect instead of synchronous getBoundingClientRect()'
  );

  // Water-ink branch growth & continuous Bezier morph during FLIP
  assert.ok(page.includes("setAttribute('pathLength', '1')"), 'SVG branch paths normalize pathLength="1" for brush-stroke draw');
  assert.ok(page.includes('strokeDashoffset') && page.includes('findSpawnOrigin'), 'expanded/added branches animate strokeDashoffset while child nodes sprout from ancestor origin');
  assert.ok(page.includes('linkMorphRafId') && page.includes('buildInkBranchPath'), 'FLIP node transitions morph connected Bezier link endpoints continuously per rAF');

  // Monochrome ink breathing selection aura + interactive minimap + lifecycle cleanup
  assert.ok(page.includes('@keyframes mmInkFocusBreathe') && !page.includes('--mm-cinnabar'), 'selected node renders monochrome/node-color breathing aura without hardcoded cinnabar red');
  assert.ok(page.includes('id="mm-minimap"') && page.includes('id="mm-minimap-svg"') && page.includes('id="mm-minimap-vp"'), 'interactive minimap topology & viewport indicator exist');
  assert.ok(page.includes('__areSetMindmapPageCleanup__'), 'standardized MindMap lifecycle cleanup key is registered');
});

test('3. notes.astro: Xuan-paper annotation slip, 3D folded-slip modal unfurl & ink-drying delete exit', () => {
  const page = readRepoFile('src/pages/notes.astro');

  // Composited pseudo-element hover elevation & inset left-spine cinnabar/ink glow
  assert.ok(
    page.includes(':global(.notes-card)::before') && page.includes(':global(.notes-card)::after'),
    'notes-card uses ::before spine aura and ::after composited paper shadow'
  );
  assert.ok(
    page.includes('perspective(1100px)') && page.includes('rotateX(5.5deg)'),
    'editor/reader modal cards unfurl like folded Xuan-paper slips in 3D'
  );
  assert.ok(
    page.includes('@keyframes notesCardInkDry') &&
      page.includes('circle(0% at 12% 16%)') &&
      page.includes(':global(.notes-card.is-deleting)'),
    'deleted notes absorb inward via ink-drying circular clip-path keyframe exit'
  );
  // Ensure resting :global(.notes-card) blocks do NOT carry permanent clip-path (preserves 3D preserve-3d & avoids alpha mask layers)
  const restingNotesCardBlocks = [...page.matchAll(/:global\(\.notes-card\)\s*\{([^}]+)\}/g)];
  assert.ok(restingNotesCardBlocks.length >= 1, 'resting :global(.notes-card) CSS rule exists');
  for (const [, decls] of restingNotesCardBlocks) {
    assert.ok(!/clip-path\s*:/.test(decls), 'resting :global(.notes-card) must not declare permanent clip-path');
  }
  assert.ok(
    page.includes('[data-theme="moss"]') && page.includes('[data-theme="rice"]') && page.includes('[data-theme="dark"]'),
    'notes-card adapts across Light, Dark, Moss, and Rice themes'
  );
  assert.ok(
    page.includes('__areSetNotesPageCleanup__') && page.includes('filterTimeline.kill()'),
    'notes cleanup kills active GSAP filterTimeline and clears timers'
  );
});

test('4. gallery.astro: zero-blur darkroom ink-mist development, Xuan-paper sheen/colophon & directional lightbox', () => {
  const page = readRepoFile('src/pages/gallery.astro');

  // Lazy-load darkroom ink-mist development without filter: blur
  assert.ok(
    page.includes('data-developed="0"') && page.includes("win.dataset.developed = '1'"),
    'gallery image windows track darkroom ink development state on lazy-load completion'
  );
  assert.ok(
    page.includes('.mat-image-window::before') && page.includes('.mat-image-window::after') && page.includes('.mat-plaque::before'),
    'gallery mat frames provide Xuan-paper sheen, darkroom mist veil, and colophon hairline reveal'
  );
  assert.ok(
    page.includes('renderLightboxPhoto(index: number, isInitialOpen = false, direction: -1 | 0 | 1 = 0)'),
    'lightbox supports directional film-plate glide transitions on prev/next navigation'
  );
  assert.ok(
    page.includes('.gallery-lightbox.is-animating') && page.includes('__areSetGalleryPageCleanup__') && page.includes('__galleryCleanup'),
    'gallery scopes will-change to .is-animating and exposes synchronous cleanup hooks'
  );
});

test('5. life.astro: GPU brush-stroke category glider, temporal ink-vein cascade & 3D thread-bound folio flip', () => {
  const page = readRepoFile('src/pages/life.astro');

  assert.ok(
    page.includes('id="life-tab-brush-glider"') && page.includes('function syncLifeTabBrushGlider'),
    'life category tabs include GPU brush-stroke glider with cinnabar tip'
  );
  assert.ok(
    page.includes('--pill-rx') && page.includes('--pill-ry'),
    'life brush glider compensates border-radius inversely under non-uniform scale(sx, sy)'
  );
  assert.ok(
    page.includes('.life-card-tips-list::before') && page.includes('--tip-idx'),
    'life cards render vertical ink-vein rule and staggered tip cascade'
  );
  assert.ok(
    page.includes('data-open-life-folio') && page.includes('rotateY(-14deg)') && page.includes('modal-pill') && !page.includes('modal-seal'),
    'life cards and lottery modal open with 3D thread-bound book-page flip and rounded monochrome capsule pill'
  );
  assert.ok(page.includes('__areSetLifePageCleanup__'), 'life page registers standardized cleanup');
});

test('6. settings.astro, account.astro & mindmapSync.ts: ink-jade switches, theme ripples, rounded status capsule & cloud-ink conduit', async () => {
  const settings = readRepoFile('src/pages/settings.astro');
  const account = readRepoFile('src/pages/account.astro');

  // Settings: Paper Studio, theme ink ripples, elastic ink-jade switches, live font specimen
  assert.ok(
    settings.includes('id="paperStudioSection"') &&
      settings.includes('data-theme-preview-card') &&
      settings.includes('__spawnSettingsInkRipple') &&
      settings.includes('settings-ink-ripple'),
    'settings workbench provides theme preview cards that spawn theme-colored water-ink ripples'
  );
  assert.ok(
    settings.includes('ink-jade-switch') && settings.includes('cubic-bezier(0.34, 1.52, 0.64, 1)'),
    'settings toggles use elastic damped ink-jade switches'
  );
  assert.ok(
    settings.includes('id="settingsFontSeg"') &&
      settings.includes('id="fontScaleRange"') &&
      settings.includes('id="fontLiveSpecimen"') &&
      settings.includes('specimen-shimmer'),
    'settings typography controls provide live Xuan-paper specimen scaling and ink shimmer feedback'
  );
  // Protocol parity with BaseLayout.astro & Header.astro ('cursor-trail': 'disabled', 'site-font': 'pixel' | 'kai', __applyTheme)
  assert.ok(
    settings.includes("__setCursorTrailDisabled") &&
      settings.includes("setItem('cursor-trail', 'disabled')") &&
      settings.includes("removeItem('cursor-trail')") &&
      settings.includes("removeAttribute('data-cursor-trail')") &&
      !settings.includes("on ? 'on' : 'off'"),
    'settings cursor-trail switch strictly matches Header/BaseLayout disabled/removed protocol'
  );
  assert.ok(
    settings.includes('data-font-choice="kai"') &&
      settings.includes('[data-specimen-font="kai"]') &&
      settings.includes("localStorage.getItem('site-font')") &&
      settings.includes("localStorage.setItem('site-font'") &&
      settings.includes('window.__applyFont') &&
      !settings.includes('font-style') &&
      !settings.includes('calligraphy'),
    'settings font switch strictly matches BaseLayout site-font pixel/kai protocol'
  );
  assert.ok(
    settings.includes('window.__applyTheme') && settings.includes("removeAttribute('data-moss-shade')"),
    'settings theme preview cards delegate to window.__applyTheme and clean up data-moss-shade on non-moss fallback'
  );
  assert.ok(
    settings.includes('if (!lockSection && !workbenchSection) return;') && settings.includes('__areSetSettingsCleanup__'),
    'settings guards non-settings routes and registers AbortController cleanup'
  );
  // Balanced-parentheses check: 100% of addEventListener calls in settings.astro pass { signal } or { once: true }
  const listenerStarts = [...settings.matchAll(/\.addEventListener\s*\(/g)].map((m) => m.index);
  assert.ok(listenerStarts.length >= 18, 'settings.astro binds interactive listeners');
  for (const start of listenerStarts) {
    let depth = 0;
    let idx = settings.indexOf('(', start);
    for (; idx < settings.length; idx++) {
      if (settings[idx] === '(') depth++;
      else if (settings[idx] === ')' && --depth === 0) break;
    }
    const callText = settings.slice(start, idx + 1);
    assert.ok(
      /\{\s*(signal\b|once\s*:\s*true)/.test(callText),
      `every addEventListener in settings.astro must pass { signal }: ${callText.slice(0, 90)}`
    );
  }

  assert.ok(
    settings.includes('swatch-dot') &&
      settings.includes('specimen-pill') &&
      settings.includes('验证密钥并启卷') &&
      !settings.includes('swatch-seal') &&
      !settings.includes('specimen-seal') &&
      !settings.includes('钤印'),
    'settings workbench replaces square seals and seal copy with rounded monochrome capsules and clean key-verification copy'
  );

  // Account: Rounded monochrome cloud-ready capsule + dual water-ink ripples, pure scaleX glider & Cloud-Ink conduit
  assert.ok(
    !account.includes('accountTabGlider.style.width') &&
      account.includes('--pill-rx') &&
      account.includes('.account-card:not([hidden])'),
    'account tab glider uses pure compositor scaleX (--pill-rx) and reduced-motion keeps visible account-card opaque'
  );
  assert.ok(
    account.includes('id="accountStatusBadge"') &&
      account.includes('@keyframes accountInkRippleRing') &&
      account.includes('account-ink-ripple') &&
      account.includes('已登录 · 云端就绪') &&
      account.includes('同步就绪') &&
      account.includes('云墨同频') &&
      !account.includes('id="accountSealStamp"') &&
      !account.includes('朱砂钤印') &&
      !account.includes('印信'),
    'account page renders rounded monochrome cloud-ready capsule with dual water-ink ripple rings and zero square seal concepts'
  );
  assert.ok(
    account.includes('id="syncInkBridge"') &&
      account.includes('stream-push') &&
      account.includes('stream-pull') &&
      account.includes("window.addEventListener('mindmaps:sync-phase'"),
    'account page renders directional cloud-ink conduit synchronized with notes & mindmap sync phases'
  );
  assert.ok(account.includes('__areSetAccountCleanup__'), 'account page registers standardized cleanup');

  // Runtime check: mindmapSync.ts emits mindmaps:sync-phase events during push/pull sync
  const prevWindow = globalThis.window;
  const prevLocalStorage = globalThis.localStorage;
  const prevFetch = globalThis.fetch;
  const capturedPhases = [];
  const mem = new Map();
  const fakeStorage = {
    get length() {
      return mem.size;
    },
    key: (i) => Array.from(mem.keys())[i] ?? null,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };
  const fakeTarget = new EventTarget();
  globalThis.localStorage = fakeStorage;
  globalThis.window = Object.assign(fakeTarget, {
    localStorage: fakeStorage,
    dispatchEvent: fakeTarget.dispatchEvent.bind(fakeTarget),
    addEventListener: fakeTarget.addEventListener.bind(fakeTarget),
    removeEventListener: fakeTarget.removeEventListener.bind(fakeTarget),
    setTimeout,
    clearTimeout,
  });

  fakeTarget.addEventListener('mindmaps:sync-phase', (ev) => {
    capturedPhases.push({ mode: ev.detail.mode, phase: ev.detail.phase });
  });

  try {
    upsertMindMap(createBlankMindMap('架构拆解', '云墨流转测试'));
    globalThis.fetch = async (url) => {
      if (String(url).includes('/api/auth/me')) {
        return { ok: true, json: async () => ({ ok: true, user: { id: 'u1', username: 'ink' } }) };
      }
      return { ok: true, json: async () => ({ ok: true, rev: 1, changes: [], hasMore: false }) };
    };
    await pushMindMapSync();
    await pullMindMapSync();
    assert.deepEqual(
      capturedPhases,
      [
        { mode: 'push', phase: 'start' },
        { mode: 'push', phase: 'done' },
        { mode: 'pull', phase: 'start' },
        { mode: 'pull', phase: 'done' },
      ],
      'mindmapSync dispatches start/done phase events for push and pull flows'
    );
  } finally {
    globalThis.window = prevWindow;
    globalThis.localStorage = prevLocalStorage;
    globalThis.fetch = prevFetch;
  }
});

test('7. Cross-page compositor performance & prefers-reduced-motion safety guard', () => {
  // Verify inverse pill radius math preserves true circular caps under scaleX
  for (const width of [56, 92, 148, 210]) {
    const height = 34;
    const sx = width / 100;
    const halfH = height * 0.5;
    const pillRx = Number((halfH / sx).toFixed(2));
    assert.ok(
      Math.abs(pillRx * sx - halfH) < 0.05,
      `inverse border-radius (${pillRx}px * ${sx}) must equal half-height (${halfH}px)`
    );
  }

  // Zero forbidden layout/paint CSS transitions or animated blur across all 8 owned source files
  for (const rel of OWNED_SOURCE_FILES) {
    const content = readRepoFile(rel);
    const transitionMatches = [...content.matchAll(/transition\s*:\s*([^;{}]+);/gi)];
    for (const m of transitionMatches) {
      const val = m[1].replace(/\s+/g, ' ').trim();
      assert.ok(
        !/(^|[\s,])(all|width|height|top|left|right|bottom|box-shadow|filter)\b/i.test(val),
        `${rel} must not transition layout/paint property in "transition: ${val}"`
      );
    }
    assert.ok(!/\btransition-all\b/.test(content), `${rel} must not use Tailwind transition-all`);
    assert.ok(!/(^|[\s;])filter\s*:\s*blur\s*\(/i.test(content), `${rel} must not use expensive filter: blur()`);
  }

  // Every owned .astro page must declare @media (prefers-reduced-motion: reduce) without breaking positioned gliders
  const positionedGliders = [
    '.mm-seg-glider',
    '.subtabs-glider',
    '.stats-glider',
    '.life-tab-brush-glider',
    '.ink-jade-thumb',
    '.settings-font-glider',
    '.account-tab-glider',
  ];

  for (const rel of OWNED_ASTRO_PAGES) {
    const content = readRepoFile(rel);
    assert.ok(
      content.includes('@media (prefers-reduced-motion: reduce)'),
      `${rel} must support @media (prefers-reduced-motion: reduce)`
    );
    assert.ok(
      content.includes('astro:before-swap'),
      `${rel} must tear down page listeners/timers on astro:before-swap`
    );

    // Ensure zero synchronous layout reads inside pointermove handlers
    const pmMatches = [...content.matchAll(/addEventListener\(\s*['"]pointermove['"][\s\S]*?\{\s*signal\s*\}\s*\)/g)];
    for (const pm of pmMatches) {
      assert.ok(
        !/getBoundingClientRect|offsetWidth|offsetHeight/.test(pm[0]),
        `${rel} pointermove handler must not perform synchronous layout reads`
      );
    }

    // Parse each rule inside @media (prefers-reduced-motion: reduce) blocks and ensure positioned gliders never get transform: none !important
    const rmBlocks = [...content.matchAll(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?)\n\s*\}\s*(?:\n|$)/g)];
    for (const block of rmBlocks) {
      const innerRules = [...block[1].matchAll(/([^{}]+)\{([^{}]+)\}/g)];
      for (const [, selRaw, declRaw] of innerRules) {
        if (/transform\s*:\s*none\s*!important/i.test(declRaw)) {
          for (const g of positionedGliders) {
            assert.ok(
              !selRaw.includes(g),
              `${rel} prefers-reduced-motion must not set transform: none !important on positioned glider ${g}`
            );
          }
        }
      }
    }
  }
});
