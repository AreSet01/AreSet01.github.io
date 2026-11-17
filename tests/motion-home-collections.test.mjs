import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const bootDom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
globalThis.window = bootDom.window;
globalThis.document = bootDom.window.document;
globalThis.Element = bootDom.window.Element;
globalThis.HTMLElement = bootDom.window.HTMLElement;
globalThis.SVGElement = bootDom.window.SVGElement;
globalThis.MutationObserver = bootDom.window.MutationObserver;
globalThis.getComputedStyle = bootDom.window.getComputedStyle;

const {
  PAPER_TILT_CONFIG,
  createPaperCardSpringState,
  stepPaperCardSpring,
  initPaperCardPhysics,
} = await import('../src/utils/cardMotion.ts');

const rootDir = process.cwd();
const readSrc = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

test('1. Paper Card 3D Physics: caches geometry on pointerenter, 0 getBoundingClientRect in pointermove, spring rebound & auto-sleep', () => {
  // 1a. Pure physics spring integrator: smooth tracking -> underdamped paper rebound -> deterministic auto-sleep
  const spring = createPaperCardSpringState();
  spring.rectLeft = 100;
  spring.rectTop = 100;
  spring.rectWidth = 300;
  spring.rectHeight = 200;
  spring.rectValid = true;
  spring.pointerX = 370; // near right edge
  spring.pointerY = 120; // near top edge
  spring.isHovered = true;

  for (let i = 0; i < 30; i += 1) {
    assert.equal(stepPaperCardSpring(spring, 1 / 120), true);
  }
  assert.ok(spring.rotX > 2.5, 'Hovering upper half tilts paper top away (positive rotX)');
  assert.ok(spring.rotY > 2.5, 'Hovering right half tilts paper right edge (positive rotY)');
  assert.ok(spring.liftY < -2.5, 'Card lifts gently off desk while hovered');
  assert.ok(spring.sheenX > 80 && spring.sheenY < 20, 'Diffuse Xuan-paper sheen tracks pointer coordinates');
  assert.ok(spring.sheenAlpha > 0.85, 'Diffuse sheen illuminates smoothly');

  // Release pointer -> verify natural underdamped rebound & eventual rest convergence
  spring.isHovered = false;
  let sawReboundSignFlip = false;
  let stepsToSettle = 0;
  let alive = true;
  while (alive && stepsToSettle < 500) {
    alive = stepPaperCardSpring(spring, 1 / 120);
    if (spring.rotX < -0.02 || spring.rotY < -0.02) {
      sawReboundSignFlip = true;
    }
    stepsToSettle += 1;
  }
  assert.equal(alive, false, 'Spring must converge and return false so rAF auto-sleeps');
  assert.equal(sawReboundSignFlip, true, 'Underdamped Xuan-paper spring produces natural subtle rebound before settling');
  assert.equal(spring.rotX, 0);
  assert.equal(spring.rotY, 0);
  assert.equal(spring.liftY, 0);
  assert.equal(spring.sheenAlpha, 0);
  assert.ok(PAPER_TILT_CONFIG.maxTilt > 4 && PAPER_TILT_CONFIG.maxTilt <= 6.5);

  // 1b. DOM controller verification: ZERO getBoundingClientRect calls during pointermove bursts
  let queuedRaf = null;
  let rafCounter = 1;
  globalThis.requestAnimationFrame = (cb) => {
    queuedRaf = cb;
    return rafCounter++;
  };
  globalThis.cancelAnimationFrame = () => {
    queuedRaf = null;
  };
  window.matchMedia = (q) => ({
    matches: q.includes('(hover: hover)') ? true : false,
  });

  const host = document.createElement('div');
  host.innerHTML = '<div id="test-paper-card" class="note-card paper-card" data-tilt data-paper-card></div>';
  document.body.appendChild(host);

  try {
    const card = document.getElementById('test-paper-card');
    let rectCalls = 0;
    card.getBoundingClientRect = () => {
      rectCalls += 1;
      return {
        left: 50,
        top: 60,
        width: 320,
        height: 220,
        right: 370,
        bottom: 280,
        x: 50,
        y: 60,
        toJSON: () => ({}),
      };
    };

    const cleanup = initPaperCardPhysics('#test-paper-card');
    assert.equal((card).__tiltActive, true, 'Claims __tiltActive so BaseLayout fallback does not double-bind');

    const enterEv = new window.Event('pointerenter');
    Object.assign(enterEv, { clientX: 120, clientY: 100 });
    card.dispatchEvent(enterEv);
    assert.equal(rectCalls, 1, 'pointerenter caches geometry with exactly 1 measurement');

    // Fire 24 high-frequency pointermove events -> must incur ZERO getBoundingClientRect reads!
    for (let i = 0; i < 24; i += 1) {
      const moveEv = new window.Event('pointermove');
      Object.assign(moveEv, { clientX: 120 + i * 5, clientY: 100 + i * 3 });
      card.dispatchEvent(moveEv);
    }
    assert.equal(rectCalls, 1, 'pointermove must NEVER call getBoundingClientRect()');
    assert.ok(typeof queuedRaf === 'function', 'Single shared rAF is scheduled');

    // Passive scroll marks rect dirty without synchronous read inside scroll handler
    window.dispatchEvent(new window.Event('scroll'));
    assert.equal(rectCalls, 1, 'scroll handler only marks dirty flag with 0 synchronous layout reads');

    // Run rAF frame -> refreshes dirty rect once in read pass, then writes GPU transform + sheen vars
    queuedRaf(16.67);
    assert.equal(rectCalls, 2, 'Dirty rect is refreshed once in rAF read pass before writes');
    assert.match(card.style.transform, /perspective\(1000px\) translate3d\(0px, -?\d+\.\d+px, 0px\) rotateX/);
    assert.ok(card.style.getPropertyValue('--paper-x').endsWith('%'));

    cleanup();
    assert.equal(card.style.transform, '', 'Cleanup resets inline transform');
    assert.equal(queuedRaf, null, 'Cleanup cancels active rAF');
  } finally {
    host.remove();
  }
});

test('2. PostCard.astro & TagList.astro: pre-rendered opacity shadow, diffuse paper sheen, brush inkframe, vermilion seal & a11y', () => {
  const postCard = readSrc('src/components/PostCard.astro');
  const tagList = readSrc('src/components/TagList.astro');

  assert.ok(postCard.includes('class="paper-card-elevation"'), 'PostCard uses pre-rendered elevation shadow layer');
  assert.ok(postCard.includes('class="paper-card-sheen"'), 'PostCard includes diffuse Xuan-paper fiber sheen');
  assert.ok(postCard.includes('class="paper-card-inkframe"'), 'PostCard includes calligraphy edge ink lines');
  assert.ok(postCard.includes('class="paper-card-seal"'), 'PostCard includes vermilion corner seal');
  assert.ok(postCard.includes('data-card-arrow'), 'Preserves [data-card-arrow] contract');
  // Ensure PostCard transition never animates box-shadow
  const transitionBlock = postCard.match(/\.note-card\.paper-card\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.doesNotMatch(transitionBlock, /transition:[\s\S]*?box-shadow/, 'PostCard must not transition box-shadow');
  assert.ok(postCard.includes('prefers-reduced-motion: reduce'), 'PostCard supports prefers-reduced-motion');
  assert.ok(postCard.includes('[data-theme="dark"]') && postCard.includes('[data-theme="moss"]') && postCard.includes('[data-theme="rice"]'), 'PostCard adapts across themes');
  assert.ok(tagList.includes('tag-chip-ink'), 'TagList provides brush underline sweep micro-interaction');
});

test('3. HomeTicker.astro & index.astro: pure GPU translate3d ticker, 2D glyph collision physics, seal resonance & Konami CRT ritual', () => {
  const ticker = readSrc('src/components/HomeTicker.astro');
  const home = readSrc('src/pages/index.astro');

  // HomeTicker GPU & sleep checks
  assert.match(ticker, /track!\.style\.transform\s*=\s*`translate3d\(/, 'HomeTicker writes pure GPU translate3d directly');
  assert.ok(ticker.includes("document.addEventListener('visibilitychange'"), 'HomeTicker sleeps when tab is hidden');
  assert.ok(ticker.includes("window.addEventListener('app:modal-enter'"), 'HomeTicker sleeps when modal opens');
  assert.ok(ticker.includes('__tickerImpact') && ticker.includes('__tickerGetFlow'), 'HomeTicker exposes impact ripple & conveyor flow hooks');

  // index.astro checks
  assert.ok(home.includes('__areSetHomeGliderCleanup__'), 'Home stats glider registers idempotent cleanup');
  assert.doesNotMatch(home, /glider\.style\.width\s*=/, 'Home stats glider must use GPU scaleX instead of layout width');
  assert.ok(home.includes('const STEP = 1 / 120;'), 'Title glyph drop uses fixed 120Hz physics step');
  assert.ok(home.includes('b.restitution'), 'Title glyphs bounce with restitution & squash-stretch on ticker rail');
  assert.ok(home.includes('seal-resonance-ring'), 'Triple-tap seal emits escalating vermilion resonance rings');
  assert.ok(home.includes('crt-ritual-veil'), 'Konami code triggers pure-compositor CRT scanline ritual');
  assert.match(home, /\.home-feature\.home-feature-scroll::after\s*\{[\s\S]*?filter:\s*none\s*!important/, 'Eliminates filter:blur on .home-feature::after');
});

test('4. CollectionFilters.astro & archive.astro: sliding ink pill runtime behavior, mid-flight snapshot & sub-pixel precision', () => {
  const filtersSrc = readSrc('src/components/CollectionFilters.astro');
  const archiveSrc = readSrc('src/pages/archive.astro');

  // Runtime JSDOM test of CollectionFilters sliding ink pill
  const scriptBody = filtersSrc.match(/<script>([\s\S]*?)<\/script>/)[1];
  const jsCode = esbuild.transformSync(scriptBody, { loader: 'ts' }).code;
  const dom = new JSDOM(
    `<div class="collection-filters" data-collection-filters>
      <div class="collection-filter-row">
        <div class="collection-category-tabs">
          <button type="button" data-category-tab="all" class="is-active">All</button>
          <button type="button" data-category-tab="tech">Tech</button>
        </div>
      </div>
    </div>`,
    { url: 'http://localhost/gallery', runScripts: 'outside-only' },
  );

  try {
    dom.window.matchMedia = () => ({ matches: false });
    dom.window.requestAnimationFrame = (cb) => { cb(0); return 1; };
    const buttons = dom.window.document.querySelectorAll('[data-category-tab]');
    Object.defineProperty(buttons[0], 'offsetLeft', { value: 0 });
    Object.defineProperty(buttons[0], 'offsetTop', { value: 2 });
    Object.defineProperty(buttons[0], 'offsetWidth', { value: 72 });
    Object.defineProperty(buttons[0], 'offsetHeight', { value: 34 });
    Object.defineProperty(buttons[1], 'offsetLeft', { value: 84 });
    Object.defineProperty(buttons[1], 'offsetTop', { value: 2 });
    Object.defineProperty(buttons[1], 'offsetWidth', { value: 96 });
    Object.defineProperty(buttons[1], 'offsetHeight', { value: 34 });

    dom.window.eval(jsCode);
    const pill = dom.window.document.querySelector('[data-collection-ink-pill]');
    const whisper = dom.window.document.querySelector('[data-collection-ink-whisper]');
    assert.ok(pill && whisper, 'Injects sliding ink pill and hover whisper layers');
    assert.match(pill.style.transform, /translate3d\(0\.0px,\s*2\.0px,\s*0px\)/, 'Initializes pill on active tab');

    // Verify inverse border-radius compensation keeps circular semi-capsule endcaps at sx=0.72, sy=34/36
    const rx0 = parseFloat(pill.style.getPropertyValue('--pill-rx'));
    const ry0 = parseFloat(pill.style.getPropertyValue('--pill-ry'));
    assert.ok(Math.abs(rx0 * 0.72 - 17) < 0.05, 'Rendered horizontal radius after scaleX(0.72) equals 17px (half height)');
    assert.ok(Math.abs(ry0 * (34 / 36) - 17) < 0.05, 'Rendered vertical radius after scaleY(34/36) equals 17px (half height)');

    // Re-trigger astro:page-load 3 times -> must remain idempotent with single pill
    for (let i = 0; i < 3; i += 1) {
      dom.window.document.dispatchEvent(new dom.window.Event('astro:page-load'));
    }
    assert.equal(dom.window.document.querySelectorAll('[data-collection-ink-pill]').length, 1, 'Idempotent across page-load');
    assert.equal(typeof dom.window.__areSetCollectionFiltersCleanup__, 'function');
  } finally {
    dom.window.close();
  }

  // archive.astro checks
  assert.ok(archiveSrc.includes('data-archive-ink-pill'), 'Archive filter bar includes sliding ink pill');
  assert.ok(archiveSrc.includes('killActiveTimelineAndCommitSnapshot'), 'Archive filter snapshots mid-flight visibility to prevent rapid-click ghosting');
  assert.ok(archiveSrc.includes('__areSetArchiveGliderCleanup__'), 'Archive stats glider registers cleanup');
  assert.doesNotMatch(archiveSrc, /el\.offsetHeight/, 'Archive row height uses sub-pixel getBoundingClientRect instead of integer offsetHeight');
});

test('7. Reduced-motion slider & pseudo-element safety + inverse border-radius compensation & clean code audit', () => {
  const filesWithoutTransformClobber = [
    'src/pages/index.astro',
    'src/pages/archive.astro',
    'src/components/CollectionFilters.astro',
    'src/components/PostCard.astro',
    'src/components/TagList.astro',
    'src/pages/tags/[tag].astro',
    'src/pages/tags/index.astro',
    'src/pages/about.astro',
    'src/pages/stats.astro',
  ];

  for (const rel of filesWithoutTransformClobber) {
    const src = readSrc(rel);
    const rmMatch = src.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n  \}/);
    assert.ok(rmMatch, `${rel} must include @media (prefers-reduced-motion: reduce)`);
    assert.doesNotMatch(
      rmMatch[1],
      /transform:\s*none\s*!important/,
      `${rel} must NOT set transform: none !important in prefers-reduced-motion (preserves JS glider positioning & 45deg diamond seals)`,
    );
  }

  // Resting opacity: 0 on hover scaleX(0) pseudo-elements
  const postCard = readSrc('src/components/PostCard.astro');
  const tagList = readSrc('src/components/TagList.astro');
  const archive = readSrc('src/pages/archive.astro');
  const tagDetail = readSrc('src/pages/tags/[tag].astro');
  const about = readSrc('src/pages/about.astro');
  const index = readSrc('src/pages/index.astro');
  const filters = readSrc('src/components/CollectionFilters.astro');

  assert.match(postCard, /\.paper-tag-chip::after\s*\{[\s\S]*?opacity:\s*0;/);
  assert.match(tagList, /\.tag-chip-ink::after\s*\{[\s\S]*?opacity:\s*0;/);
  assert.match(archive, /\.archive-ink-row::after\s*\{[\s\S]*?opacity:\s*0;/);
  assert.match(tagDetail, /\.tag-sibling-ink::before\s*\{[\s\S]*?opacity:\s*0;/);
  assert.match(tagDetail, /\.tag-cascade-link::after\s*\{[\s\S]*?opacity:\s*0;/);
  assert.match(about, /\.about-stack-row::after\s*\{[\s\S]*?opacity:\s*0;/);

  // Inverse border-radius compensation & borderless gliders
  assert.match(filters, /border-radius:\s*var\(--pill-rx,\s*9999px\)\s*\/\s*var\(--pill-ry,\s*9999px\)/);
  assert.match(archive, /\[data-archive-stats-strip\]\s*\[data-archive-stats-glider\]\s*\{[\s\S]*?border:\s*none\s*!important;[\s\S]*?--pill-rx/);
  assert.match(archive, /border-radius:\s*var\(--pill-rx,\s*4px\)\s*\/\s*var\(--pill-ry,\s*4px\)/);
  assert.match(index, /\[data-home-stats-strip\]\s*\[data-stats-glider\]\s*\{[\s\S]*?border:\s*none\s*!important;[\s\S]*?--pill-rx/);

  // Clean code check: no non-standard Math.clamp expression
  assert.ok(!index.includes('Math.clamp'), 'index.astro must not contain non-standard Math.clamp');
});

test('5. timeline.astro & tags/*: handscroll brush spine, ripples, bookmark fold, EWMA drag, and constellation auto-sleep & pulse', () => {
  const timelineSrc = readSrc('src/pages/timeline.astro');
  const tagSkySrc = readSrc('src/pages/tags/index.astro');
  const tagDetailSrc = readSrc('src/pages/tags/[tag].astro');

  // timeline.astro
  assert.ok(timelineSrc.includes('data-timeline-mountains'), 'Timeline includes GPU parallax distant ink mountains');
  assert.ok(timelineSrc.includes('data-timeline-nib'), 'Timeline includes brush nib riding the baseline');
  assert.ok(timelineSrc.includes('timeline-dot-ripple'), 'Timeline ink dots radiate ripples when near');
  assert.ok(timelineSrc.includes('data-timeline-bookmark') && timelineSrc.includes('timeline-card-elevation'), 'Timeline cards unfurl as 3D bookmarks with pre-rendered elevation shadow');
  assert.match(timelineSrc, /addEventListener\('resize',\s*cachePositions,\s*\{\s*passive:\s*true,\s*signal\s*\}\)/, 'Timeline resize listener is bound to AbortController signal (no leak)');
  assert.ok(timelineSrc.includes('velocity = velocity * 0.35 + instVel * 0.65'), 'Timeline drag uses EWMA velocity smoothing');

  // tags/index.astro & tags/[tag].astro
  assert.ok(tagSkySrc.includes('const STEP = 1 / 60;'), 'Tag constellation uses fixed 60Hz physics timestep');
  assert.ok(tagSkySrc.includes('alpha <= 0.02 || (alpha < 0.36 && maxDisp < 0.04)'), 'Tag constellation auto-sleeps rAF on kinetic convergence');
  assert.ok(tagSkySrc.includes('tag-link-pulse') && tagSkySrc.includes('constellationInkFlow'), 'Hovered tag lights outward-flowing constellation ink pulses');
  assert.ok(tagSkySrc.includes('tag-node-halo'), 'Tag nodes render vermilion starburst halo');
  assert.ok(tagDetailSrc.includes('tag-cascade-list') && tagDetailSrc.includes('tag-sibling-ink'), 'Tag detail page upgrades ink cascade list and sibling ink chips');
});

test('6. stats.astro, about.astro & AboutIntro.astro: brush charts, paper note glide, zero-reflow details, interactive seal & batched canvas', () => {
  const statsSrc = readSrc('src/pages/stats.astro');
  const aboutSrc = readSrc('src/pages/about.astro');
  const aboutIntroSrc = readSrc('src/components/AboutIntro.astro');

  // stats.astro
  assert.ok(statsSrc.includes('stats-mountain-wash') && statsSrc.includes('chart-line-feibai'), 'Cumulative chart renders mountain ink-wash gradient and feibai companion stroke');
  assert.ok(statsSrc.includes('stats-paper-note') && statsSrc.includes('gsap.quickTo(tipPos'), 'Stats tooltip is a Xuan-paper note gliding via GPU quickTo');
  assert.ok(statsSrc.includes('contain: layout style paint'), 'Stats <details> table clip isolates layout during open/close');
  // Verify lenis.resize() is NOT called inside onUpdate of table collapse
  const tableCollapseBlock = statsSrc.match(/height:\s*0,\s*duration:\s*0\.52,[\s\S]*?onComplete:/)?.[0] || '';
  assert.doesNotMatch(tableCollapseBlock, /lenis\?\.resize\(\)/, 'Stats table collapse must not call lenis.resize() on every frame');

  // about.astro & AboutIntro.astro
  assert.ok(aboutSrc.includes('SEAL_INSCRIPTIONS') && aboutSrc.includes('about-interactive-seal'), 'About stamp supports interactive seal pressing and inscription cycling');
  assert.ok(aboutSrc.includes('about-letter-scroll') && aboutSrc.includes('is-echoed'), 'About page unfurls self-intro letter scroll and echoes stack badges');
  assert.ok(aboutSrc.includes('scrub: 0.42'), 'About timeline spine uses scrub instead of per-scroll gsap.to allocation');
  assert.ok(aboutIntroSrc.includes('__areSetAboutIntroCleanup__') && aboutIntroSrc.includes('__areSetAboutIntroBound__'), 'AboutIntro registers idempotent cleanup and listener guard');
  assert.match(aboutIntroSrc, /ctx!\.beginPath\(\);\s*for\s*\(let\s+i\s*=\s*0;\s*i\s*<\s*N;\s*i\+\+\)[\s\S]*?ctx!\.rect\([\s\S]*?ctx!\.fill\(\);/, 'AboutIntro batches all 1,600+ particles into a single Canvas path fill');
});
