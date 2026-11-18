import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const rootDir = process.cwd();
const readSrc = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

test('1. ArticleSelectionDock: keyboard shortcuts declare all button refs, skip modifiers & fire in JSDOM without ReferenceError', async () => {
  const dockSrc = readSrc('src/components/ArticleSelectionDock.astro');
  const scriptBody = dockSrc.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.ok(scriptBody, 'ArticleSelectionDock <script> exists');

  for (const sym of [
    'const btnHighlight =',
    'const btnPin =',
    'const btnSearch =',
    'const btnAsk =',
    'const btnCopy =',
    'const btnManageDelete =',
    'const btnManagePin =',
    'const btnManageCopy =',
    'const btnManageSearch:',
    'const btnManageAsk:',
  ]) {
    assert.ok(scriptBody.includes(sym), `ArticleSelectionDock declares ${sym}`);
  }
  assert.match(scriptBody, /isDockVisible\s*&&\s*!e\.ctrlKey\s*&&\s*!e\.metaKey\s*&&\s*!e\.altKey/, 'Dock shortcuts ignore Ctrl/Cmd/Alt combos');

  // Bundle with esbuild and run in JSDOM to verify H/P/F/A/C and Delete keys fire without throwing
  const markup = dockSrc.slice(0, dockSrc.indexOf('<script>')).replace(/---[\s\S]*?---/, '');
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
      <h1 data-post-title>Test Article</h1>
      <article data-post-prose><p id="p1">Hello world selection shortcut test paragraph</p></article>
      ${markup}
    </body></html>`,
    { url: 'http://localhost/posts/test-shortcuts', runScripts: 'outside-only' }
  );

  const errors = [];
  let pinCalls = 0;
  let searchCalls = 0;
  let askEvents = 0;
  let copiedText = '';

  try {
    const win = dom.window;
    const doc = win.document;
    win.matchMedia = () => ({ matches: false });
    win.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.CSS = { escape: (s) => String(s) };
    win.HTMLElement.prototype.animate = function () {
      return { onfinish: null, oncancel: null, finished: Promise.resolve(), cancel() {} };
    };
    win.Range.prototype.getClientRects = () => [{ left: 10, top: 20, right: 90, bottom: 40, width: 80, height: 20 }];
    win.Range.prototype.getBoundingClientRect = () => ({ left: 10, top: 20, right: 90, bottom: 40, width: 80, height: 20 });
    win.addEventListener('error', (ev) => errors.push(ev.error || ev.message));
    win.__pinWorkbench = { pinExcerpt: () => { pinCalls += 1; } };
    win.__articleSearch = { open: () => {}, search: () => { searchCalls += 1; } };
    win.addEventListener('inkask:open-with-context', () => { askEvents += 1; });
    Object.defineProperty(win.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (txt) => { copiedText = txt; } },
    });

    win.eval(bundled);

    const textNode = doc.getElementById('p1').firstChild;
    const selectRange = (start, end) => {
      const range = doc.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const sel = win.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      doc.dispatchEvent(new win.Event('selectionchange'));
    };

    selectRange(0, 11);
    await new Promise((r) => setTimeout(r, 150));

    // Ctrl+C must NOT trigger dock citation copy
    win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(copiedText, '', 'Ctrl+C must not trigger dock copy');

    // Plain 'p' triggers pin (with 95ms key pulse)
    win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 130));
    assert.equal(pinCalls, 1, 'Pressing P triggers pin');

    // Re-select and test 'f' (search)
    selectRange(0, 11);
    await new Promise((r) => setTimeout(r, 150));
    win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 130));
    assert.equal(searchCalls, 1, 'Pressing F triggers in-article search');

    // Re-select and test 'a' (InkAsk)
    selectRange(0, 11);
    await new Promise((r) => setTimeout(r, 150));
    win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 130));
    assert.equal(askEvents, 1, 'Pressing A triggers InkAsk');

    // Re-select and test 'c' (copy citation)
    selectRange(0, 11);
    await new Promise((r) => setTimeout(r, 150));
    win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 130));
    assert.ok(copiedText.includes('Hello world'), 'Pressing C copies formatted citation');

    // Re-select and test 'h' (highlight), then click mark and test Delete
    selectRange(12, 21);
    await new Promise((r) => setTimeout(r, 150));
    win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 130));
    const mark = doc.querySelector('mark.article-highlight-mark');
    assert.ok(mark, 'Pressing H creates highlight mark');

    mark.click();
    win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 550));
    assert.equal(doc.querySelectorAll('mark.article-highlight-mark').length, 0, 'Pressing Delete removes active highlight');
    assert.deepEqual(errors, [], 'Zero runtime ReferenceError or uncaught errors during shortcut execution');
  } finally {
    dom.window.close();
  }
});

test('2. Header.astro: sidebar nav-link removes gray hover/active box while keeping magnetic glider', () => {
  const header = readSrc('src/components/Header.astro');
  assert.match(header, /\.glass-nav \.nav-link::before,\s*\.glass-nav \.nav-link::after\s*\{\s*display:\s*none\s*!important;\s*\}/);
  assert.doesNotMatch(header, /\.glass-nav \.nav-link\.is-active::before/);
  assert.ok(header.includes('.glass-nav .nav-magnetic-glider'), 'Magnetic glider remains active');
});

test('3. PostCard.astro: paper-card-inkframe hugs 12px border-box curve smoothly', () => {
  const postCard = readSrc('src/components/PostCard.astro');
  assert.match(postCard, /\.paper-card-inkframe\s*\{[\s\S]*?inset:\s*-1px;[\s\S]*?border-radius:\s*12px;/);
  assert.match(postCard, /\.paper-card-inkframe::before\s*\{[\s\S]*?border-radius:\s*inherit;[\s\S]*?border:\s*1\.5px solid var\(--vermilion\);[\s\S]*?mask-image:\s*radial-gradient\(/);
  assert.match(postCard, /clip-path:\s*inset\(0 84% 84% 0 round 12px\)/);
});

test('4. notes.astro & mindmap.astro: pill gliders use bounded --pill-rx / --pill-ry without CSS clamping', () => {
  const notes = readSrc('src/pages/notes.astro');
  const mindmap = readSrc('src/pages/mindmap.astro');

  for (const [name, src] of [['notes.astro', notes], ['mindmap.astro', mindmap]]) {
    assert.doesNotMatch(src, /border-radius:\s*var\(--pill-rx,\s*9999px\)\s*\/\s*9999px;/, `${name} must not hardcode / 9999px which clamps rx to ~0px`);
    assert.match(src, /border-radius:\s*var\(--pill-rx,\s*9999px\)\s*\/\s*var\(--pill-ry,\s*9999px\);/, `${name} glider uses --pill-rx / --pill-ry`);
    assert.ok(src.includes("style.setProperty('--pill-ry'"), `${name} computes --pill-ry dynamically`);
  }

  // Verify zero CSS corner clamping math across typical button sizes
  for (const w of [42, 68, 88, 128, 168]) {
    for (const h of [28, 34, 38]) {
      const sx = Math.max(0.05, w / 100);
      const halfR = Math.min(w, h) * 0.5;
      const rx = Number((halfR / sx).toFixed(2));
      const ry = Number(halfR.toFixed(2));
      assert.ok(2 * rx <= 100.05, `2*rx (${2 * rx}) <= 100 for w=${w}, h=${h}`);
      assert.ok(2 * ry <= h + 0.05, `2*ry (${2 * ry}) <= h (${h}) for w=${w}, h=${h}`);
    }
  }
});

test('5. notes.astro & mindmap.astro: article filter hover & active rows use fading ink line instead of rounded background boxes', () => {
  const notes = readSrc('src/pages/notes.astro');
  const mindmap = readSrc('src/pages/mindmap.astro');

  // notes.astro article-item-row
  assert.doesNotMatch(notes, /\.article-item-row[^>]*rounded-lg/, 'notes article-item-row removes rounded-lg box class');
  assert.doesNotMatch(notes, /:global\(\.article-item-row\)(?::hover|\.active)\s*\{\s*background-color:\s*var\(--accent-soft\)/, 'notes article-item-row removes background fill box');
  assert.match(notes, /:global\(\.article-item-row\)::after\s*\{[\s\S]*?linear-gradient\(90deg,\s*var\(--vermilion\).*?transparent 100%\)/, 'notes article-item-row renders fading ink line');
  assert.match(notes, /id="article-search-input"[\s\S]*?focus-visible:outline-none/, 'notes article search input prevents double focus outline');

  // mindmap.astro mm-article-item-row
  assert.match(mindmap, /:global\(\.mm-article-item-row\)::after\s*\{[\s\S]*?linear-gradient\(90deg,\s*var\(--vermilion\).*?transparent 100%\)/, 'mindmap article filter row renders fading ink line');
  assert.match(mindmap, /class="mm-article-item-row/, 'mindmap article filter list uses mm-article-item-row');
});

test('6. cardMotion.ts: addCardEnter defers WAAPI launch until after tl.add setCardEnterState (Gallery card entrance fix)', async () => {
  const bundled = esbuild.buildSync({
    stdin: {
      contents: `
        import gsap from 'gsap';
        import { setCardEnterState, addCardEnter } from './src/utils/cardMotion.ts';
        (window as any).__runTest = (switchTime: number) => {
          const card = document.getElementById('gal-card')!;
          const events: string[] = [];
          (card as any).animate = () => {
            let cancelled = false;
            events.push('animate-start');
            return {
              onfinish: null,
              oncancel: null,
              cancel() {
                if (!cancelled) {
                  cancelled = true;
                  events.push('animate-cancel');
                }
              },
            };
          };
          const tl = gsap.timeline();
          tl.add(() => {
            card.classList.remove('is-filtered-out');
            events.push('set-enter-state');
            setCardEnterState([card]);
          }, switchTime);
          addCardEnter(tl, [card], switchTime);
          tl.progress(1);
          return events;
        };
      `,
      resolveDir: rootDir,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
  }).outputFiles[0].text;

  const dom = new JSDOM(
    '<!doctype html><html><body><article id="gal-card" class="gallery-mat-card is-filtered-out"></article></body></html>',
    { url: 'http://localhost/gallery', runScripts: 'outside-only' }
  );
  try {
    dom.window.matchMedia = () => ({ matches: false });
    dom.window.eval(bundled);

    for (const st of [0, 0.22]) {
      const card = dom.window.document.getElementById('gal-card');
      card.classList.add('is-filtered-out');
      const events = dom.window.__runTest(st);
      assert.equal(events[0], 'set-enter-state', `At switchTime=${st}, setCardEnterState must run BEFORE WAAPI animate starts`);
      assert.ok(events.includes('animate-start'), `At switchTime=${st}, WAAPI entrance animation must start`);
      assert.ok(!events.includes('animate-cancel'), `At switchTime=${st}, setCardEnterState must NEVER cancel the newly launched WAAPI entrance`);
    }
  } finally {
    dom.window.close();
  }
});

test('7. life.astro: modal outer frame is locked (overflow: hidden) and header removes verbose subtitle prose', () => {
  const life = readSrc('src/pages/life.astro');
  const dialogCss = life.match(/\.life-modal-dialog\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(dialogCss, /display:\s*flex;/, '.life-modal-dialog uses flex column layout');
  assert.match(dialogCss, /flex-direction:\s*column;/, '.life-modal-dialog stacks header/body/actions');
  assert.match(dialogCss, /overflow:\s*hidden;/, '.life-modal-dialog locks outer scrolling');
  assert.doesNotMatch(dialogCss, /overflow-y:\s*auto/, '.life-modal-dialog must not vertically scroll outer frame');

  assert.doesNotMatch(life, /<p class="modal-subtitle">/, 'Removes verbose .modal-subtitle HTML');
  assert.doesNotMatch(life, /展卷细读一处好风光/, 'Removes verbose folio subtitle copy');
  assert.ok(life.includes('class="modal-pill"') && life.includes('id="modal-life-title"'), 'Preserves compact inline pill and title');
});

test('8. BaseLayout.astro & mindmap.astro: single flash-free entrance, in-place subtabs, sync fingerprint guard & card exit/delete animations', () => {
  const baseLayout = readSrc('src/layouts/BaseLayout.astro');
  const mindmap = readSrc('src/pages/mindmap.astro');

  assert.match(
    baseLayout,
    /releasedEarly = true;\s*\n\s*if \(enteredThisDocument\) \{\s*\n\s*document\.documentElement\.classList\.remove\('js-enter'\);/,
    'BaseLayout preserves html.js-enter on early release before runPageEnter runs during client-side navigation'
  );
  assert.ok(mindmap.includes('const sameKeys ='), 'mindmap renderSubtabs reuses buttons in place instead of detaching on every click');
  assert.ok(mindmap.includes('function getMindmapsFingerprint('), 'mindmap guards mindmaps:synced with visual fingerprint to avoid killing entrance animations');
  assert.ok(mindmap.includes('@keyframes mmCardInkDry'), 'mindmap card deletion plays smooth circular ink-drying exit');
  assert.ok(mindmap.includes('cardEl.style.maxHeight = `${initialHeight}px`'), 'mindmap pins initial maxHeight before .is-deleting so collapse transitions smoothly');
});
