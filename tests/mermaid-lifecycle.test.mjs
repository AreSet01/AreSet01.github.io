import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as nodeModule from 'node:module';
import { JSDOM } from 'jsdom';

let fallbackTransformSync = null;
async function loadStripTypes() {
  if (typeof nodeModule.stripTypeScriptTypes === 'function') {
    return nodeModule.stripTypeScriptTypes;
  }
  if (!fallbackTransformSync) {
    const esbuild = await import('esbuild');
    fallbackTransformSync = esbuild.transformSync;
  }
  return (code) => fallbackTransformSync(code, { loader: 'ts', format: 'esm' }).code;
}
const stripTypeScriptTypes = await loadStripTypes();

const source = fs.readFileSync('src/components/MermaidRenderer.astro', 'utf8');
const markup = source.slice(source.indexOf('<div class="mermaid-modal-overlay"'), source.indexOf('<script>'));
const block = `<div class="mermaid-block"><button class="mermaid-btn-expand"></button>
  <div class="mermaid-render"><svg></svg></div></div>`;

test('diagram modal controls rebind on article swaps and repeated initialization stays idempotent', () => {
  const dom = new JSDOM(markup + block, { url: 'http://localhost/posts/test', runScripts: 'outside-only' });
  const { window } = dom;
  const { document } = window;
  // Keep rendering deferred: these controls must also work before a render completes.
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/import \{ waitForPostEntrance \} from .*?;/, 'const waitForPostEntrance = () => new Promise(() => {});');
  const click = selector => document.querySelector(selector).click();
  const zoom = () => document.querySelector('#mermaid-modal-zoom-val').textContent;
  const modal = () => document.querySelector('#mermaid-modal');
  const firePointer = (target, type, x, y) => target.dispatchEvent(new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  try {
    window.eval(stripTypeScriptTypes(script));
    for (let article = 0; article < 3; article++) {
      for (let i = 0; i < 3; i++) document.dispatchEvent(new window.Event('astro:page-load'));
      click('.mermaid-btn-expand');
      assert.equal(modal().hidden, false);
      click('#mermaid-modal-zoom-in');
      assert.equal(zoom(), '125%', 'each click must apply exactly once');
      click('#mermaid-modal-zoom-out');
      assert.equal(zoom(), '100%');
      const content = document.querySelector('#mermaid-modal-content');
      const canvas = document.querySelector('#mermaid-modal-canvas');
      content.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
      assert.equal(zoom(), '112%');
      firePointer(content, 'pointerdown', 10, 20);
      firePointer(window, 'pointermove', 50, 80);
      firePointer(window, 'pointerup', 50, 80);
      assert.equal(canvas.style.transform, 'translate(40px, 60px) scale(1.12)');
      click('#mermaid-modal-zoom-reset');
      assert.equal(canvas.style.transform, 'translate(0px, 0px) scale(1)');
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
      assert.equal(modal().hidden, true);
      assert.equal(document.body.classList.contains('mermaid-modal-open'), false);
      click('.mermaid-btn-expand');
      click('.mermaid-modal-close');
      assert.equal(modal().hidden, true);
      click('.mermaid-btn-expand');
      click('.mermaid-modal-backdrop');
      assert.equal(modal().hidden, true);

      // Leave during a drag; detached buttons and old window listeners must be inert.
      click('.mermaid-btn-expand');
      firePointer(content, 'pointerdown', 10, 20);
      const oldPlus = document.querySelector('#mermaid-modal-zoom-in');
      document.dispatchEvent(new window.Event('astro:before-swap'));
      assert.equal(document.body.classList.contains('mermaid-modal-open'), false);
      document.body.innerHTML = markup + block;
      // Delegated open must bind the new DOM even before page-load arrives.
      click('.mermaid-btn-expand');
      oldPlus.click();
      firePointer(window, 'pointermove', 90, 100);
      assert.equal(zoom(), '100%');
      assert.equal(document.querySelector('#mermaid-modal-canvas').style.transform, 'translate(0px, 0px) scale(1)');
    }
  } finally {
    window.close();
  }
});

function entranceHarness({ reduce = false, hash = '' } = {}) {
  const dom = new JSDOM('<article data-post-title-hold="true"></article>', {
    url: `http://localhost/posts/test${hash}`, runScripts: 'outside-only',
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: reduce });
  let nextId = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; };
  window.clearTimeout = id => timers.delete(id);
  const gate = fs.readFileSync('src/utils/postEntranceGate.ts', 'utf8').replace('export function', 'function');
  window.eval(stripTypeScriptTypes(gate) + '\nwindow.waitForPostEntrance = waitForPostEntrance;');
  return {
    window, timers,
    controller: new window.AbortController(),
    flush() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); } },
    release() {
      window.__postTitleHoldPending = false;
      window.document.querySelector('article').removeAttribute('data-post-title-hold');
      window.dispatchEvent(new window.Event('post-title-release'));
    },
  };
}

test('diagram work waits through the curtain, title docking and body fade', async () => {
  const h = entranceHarness();
  try {
    h.window.__postTransitionPending = true;
    h.window.__postTitleHoldPending = true;
    let resolved = false;
    const ready = h.window.waitForPostEntrance(h.controller.signal).then(result => { resolved = true; return result; });
    h.window.__postTransitionPending = false;
    h.window.dispatchEvent(new h.window.Event('post-transition-release'));
    h.flush();
    await Promise.resolve();
    assert.equal(resolved, false, 'curtain handover must not start diagram work');
    assert.equal(h.timers.size, 0, 'no deadline may bypass the title');
    h.release();
    assert.deepEqual([...h.timers.values()].map(t => t.delay), [760]);
    await Promise.resolve();
    assert.equal(resolved, false, 'body fade also gets an uninterrupted interval');
    h.flush();
    assert.equal(await ready, true);
    h.window.dispatchEvent(new h.window.Event('post-title-release'));
    assert.equal(h.timers.size, 0, 'listeners are removed after release');
  } finally { h.window.close(); }
});

for (const duringFade of [false, true]) {
  test(`navigation cancels pending diagram work ${duringFade ? 'during the body fade' : 'during the title'}`, async () => {
    const h = entranceHarness();
    try {
      const ready = h.window.waitForPostEntrance(h.controller.signal);
      if (duringFade) h.release();
      h.controller.abort();
      assert.equal(await ready, false);
      h.release();
      await Promise.resolve();
      assert.equal(h.timers.size, 0, 'old observers, events and timers must be gone');
      assert.equal(await h.window.waitForPostEntrance(h.controller.signal), false);
    } finally { h.window.close(); }
  });
}

test('fallback removal of title hold also releases diagram work', async () => {
  const h = entranceHarness();
  try {
    const ready = h.window.waitForPostEntrance(h.controller.signal);
    h.window.document.querySelector('article').removeAttribute('data-post-title-hold');
    await Promise.resolve();
    assert.equal(h.timers.size, 1);
    h.flush();
    assert.equal(await ready, true);
  } finally { h.window.close(); }
});

for (const options of [{ reduce: true }, { hash: '#diagram' }]) {
  test(`direct access bypasses animation waiting: ${JSON.stringify(options)}`, async () => {
    const h = entranceHarness(options);
    try {
      assert.equal(await h.window.waitForPostEntrance(h.controller.signal), true);
      assert.equal(h.timers.size, 0);
    } finally { h.window.close(); }
  });
}
