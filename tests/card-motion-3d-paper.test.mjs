import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const bootDom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = bootDom.window;
globalThis.document = bootDom.window.document;
globalThis.Element = bootDom.window.Element;
globalThis.HTMLElement = bootDom.window.HTMLElement;
globalThis.SVGElement = bootDom.window.SVGElement;
globalThis.getComputedStyle = bootDom.window.getComputedStyle;

const {
  CARD_MOTION,
  cardEnterDelay,
  clearCardMotion,
  resolveDiagonalCardOrder,
  setCardEnterState,
} = await import('../src/utils/cardMotion.ts');

const rootDir = process.cwd();

test('1. cardEnterDelay implements smooth diagonal wave pacing without flat 6-card cutoff', () => {
  assert.equal(cardEnterDelay(0), 0);
  assert.ok(Math.abs(cardEnterDelay(1) - CARD_MOTION.enterStagger) < 1e-6);
  assert.ok(Math.abs(cardEnterDelay(6) - 6 * CARD_MOTION.enterStagger) < 1e-6);
  assert.ok(cardEnterDelay(7) > cardEnterDelay(6) + 0.02);
  assert.ok(cardEnterDelay(10) > cardEnterDelay(9) + 0.02);
  assert.ok(cardEnterDelay(11) > cardEnterDelay(10));
  assert.ok(cardEnterDelay(50) <= CARD_MOTION.enterStaggerCap);
});

test('2. resolveDiagonalCardOrder reorders column-major Masonry DOM into visual top-left -> bottom-right diagonal wave', () => {
  const board = document.createElement('div');
  document.body.appendChild(board);

  try {
    // Simulate 4-card Masonry board from user screenshot:
    // DOM order in 3 .masonry-col columns: Col0=[Card0(0,0), Card3(1,0)], Col1=[Card1(0,1)], Col2=[Card2(0,2)]
    const specs = [
      { id: 'c-row0-col0', left: 40, top: 220 },
      { id: 'c-row1-col0', left: 40, top: 510 },
      { id: 'c-row0-col1', left: 470, top: 220 },
      { id: 'c-row0-col2', left: 900, top: 220 },
    ];
    const els = specs.map((s) => {
      const el = document.createElement('div');
      el.id = s.id;
      el.className = 'notes-card';
      el.getBoundingClientRect = () => ({
        left: s.left,
        top: s.top,
        width: 400,
        height: 250,
        right: s.left + 400,
        bottom: s.top + 250,
        x: s.left,
        y: s.top,
        toJSON: () => ({}),
      });
      board.appendChild(el);
      return el;
    });

    const ordered = resolveDiagonalCardOrder(els, 0).map((e) => e.id);
    assert.equal(ordered[0], 'c-row0-col0');
    assert.equal(ordered[1], 'c-row0-col1');
    assert.deepEqual(ordered.slice(2), ['c-row1-col0', 'c-row0-col2']);
  } finally {
    board.remove();
  }
});

test('3. setCardEnterState applies 3D paper-landing pose on entity cards, 55% directional replay, and zero yaw on wide stats panels', () => {
  const host = document.createElement('div');
  host.innerHTML =
    '<div id="card-a" class="notes-card"></div><section id="stats-a" class="chart-card"></section>';
  document.body.appendChild(host);

  try {
    const cardEl = document.getElementById('card-a');
    const chartEl = document.getElementById('stats-a');

    // Full initial / filter enter on entity card
    setCardEnterState(cardEl, { replay: false, direction: 0, indexOffset: 1 });
    assert.equal(cardEl.dataset.cardAirborne, 'true', 'Full card entrance marks airborne floating shadow');
    assert.equal(parseFloat(cardEl._gsap.y), 44, 'Full card entrance starts at y=44');
    assert.ok(Math.abs(parseFloat(cardEl._gsap.scaleX) - 0.918) < 1e-3, 'Full card entrance starts at scale=0.918');
    assert.equal(parseFloat(cardEl._gsap.rotationX), 16, 'Full card entrance pitches rotateX=16deg');
    assert.notEqual(parseFloat(cardEl._gsap.rotation), 0, 'Entity card gets natural hand-held paper yaw');

    // Wide stats chart panel: no airborne tilt yaw
    setCardEnterState(chartEl, { replay: false, direction: 0, indexOffset: 1 });
    assert.equal(chartEl.dataset.cardAirborne, undefined, 'Wide chart panel omits airborne card shadow');
    assert.equal(parseFloat(chartEl._gsap.rotation), 0, 'Wide chart panel must have 0deg yaw rotation');
    assert.equal(parseFloat(chartEl._gsap.rotationX), 7, 'Wide chart panel uses gentler 7deg pitch');

    // Scroll-back replay (55% amplitude, upward direction = -1)
    clearCardMotion(cardEl);
    assert.equal(cardEl.dataset.cardAirborne, undefined, 'clearCardMotion clears airborne shadow attribute');
    setCardEnterState(cardEl, { replay: true, direction: -1, indexOffset: 1 });
    assert.equal(cardEl.dataset.cardAirborne, undefined, 'Scroll-back replay keeps shadow subtle');
    assert.equal(parseFloat(cardEl._gsap.y), -24, 'Scrolling up (-1) enters from y=-24 (~55% amplitude)');
    assert.equal(parseFloat(cardEl._gsap.rotationX), -9, 'Scrolling up (-1) pitches rotateX=-9deg');
  } finally {
    host.remove();
  }
});

test('4. BaseLayout, global.css, and MindMap wire spatial diagonal sorting, airborne shadow settle, and filter transitions', () => {
  const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');
  const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');
  const mindmapSrc = fs.readFileSync(path.join(rootDir, 'src/pages/mindmap.astro'), 'utf8');

  assert.ok(
    baseLayout.includes('ra.top + ra.left * 0.48'),
    'BaseLayout planPageEnter must sort immediate [data-enter="card"] elements by diagonal spatial score'
  );
  assert.ok(
    baseLayout.includes('flushPendingScrollReplays'),
    'BaseLayout must batch same-frame scroll triggers into diagonal wave order'
  );
  assert.ok(
    globalCss.includes('[data-card-airborne="true"].notes-card::before'),
    'global.css must define compositor-only airborne shadow pseudo-layer for entering cards'
  );
  assert.ok(
    mindmapSrc.includes('addCardExit(tl, existingCards, 0)'),
    'mindmap.astro must animate card filter transitions via shared addCardExit + animateCardEnter'
  );
});
