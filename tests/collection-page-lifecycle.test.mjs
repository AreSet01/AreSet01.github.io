import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodeModule from 'node:module';
import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const stripTs =
  typeof nodeModule.stripTypeScriptTypes === 'function'
    ? (code) => nodeModule.stripTypeScriptTypes(code)
    : (code) => esbuild.transformSync(code, { loader: 'ts' }).code;

for (const kind of ['life', 'gallery']) {
  test(`${kind}: repeated page-load preserves entrance and filters rebind after navigation`, () => {
    const source = fs.readFileSync(`src/pages/${kind}.astro`, 'utf8');
    const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*?;\s*$/gm, '');
    const cardClass = kind === 'life' ? 'life-card' : 'gallery-mat-card';
    const cleanupKey = kind === 'life' ? '__areSetLifePageCleanup__' : '__galleryCleanup';
    const markup = () => `<button data-category-tab="all" class="is-active"></button>
      <button data-category-tab="missing"></button>
      <div id="${kind}-cards-container"><article class="${cardClass} is-entering" data-category="places" data-enter="left"></article></div>
      <div id="${kind}-empty-state" class="hidden"></div>`;
    const dom = new JSDOM(markup(), { url: `http://localhost/${kind}`, runScripts: 'outside-only' });
    const { window } = dom;
    let killed = 0;
    window.matchMedia = () => ({ matches: true });
    window.gsap = { registerPlugin() {}, killTweensOf() { killed++; }, set() {}, timeline() { return { to() { return this; }, add() { return this; } }; } };
    window.ScrollTrigger = { refresh() {} };
    window.CustomEase = { create() {} };
    // The source imports these from utils/cardMotion; when imports are stripped for this
    // lifecycle harness they must exist as globals just like gsap / ScrollTrigger.
    window.clearCardMotion = () => {};
    window.setCardEnterState = () => {};
    window.addCardEnter = () => 0;
    window.addCardExit = () => 0;
    window.cardExitDuration = () => 0;
    try {
      window.eval(stripTs(script));
      const cleanup = window[cleanupKey];
      assert.equal(typeof cleanup, 'function');
      for (let i = 0; i < 3; i++) window.document.dispatchEvent(new window.Event('astro:page-load'));
      assert.equal(window[cleanupKey], cleanup, 'one mount per DOM');
      assert.equal(killed, 0, 'page initialization must not kill the entrance tween');
      assert.ok(window.document.querySelector(`.${cardClass}`).classList.contains('is-entering'));

      window.document.querySelector('[data-category-tab="missing"]').click();
      assert.ok(window.document.querySelector(`.${cardClass}`).classList.contains('is-filtered-out'));
      window.document.querySelector('[data-category-tab="all"]').click();
      assert.ok(!window.document.querySelector(`.${cardClass}`).classList.contains('is-filtered-out'));

      window.document.dispatchEvent(new window.Event('astro:before-swap'));
      window.document.body.innerHTML = markup();
      window.document.dispatchEvent(new window.Event('astro:page-load'));
      assert.notEqual(window[cleanupKey], cleanup, 'new page must get fresh handlers');
      window.document.querySelector('[data-category-tab="missing"]').click();
      assert.ok(window.document.querySelector(`.${cardClass}`).classList.contains('is-filtered-out'));
    } finally {
      window.close();
    }
  });
}
