import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createCompanionLayoutMotion } from '../src/utils/companionLayoutMotion.ts';

test('fullscreen motion survives reversal, cancellation and reduced motion', async () => {
  const dom = new JSDOM('<aside style="opacity:0.9"><textarea>unsent draft</textarea></aside>');
  const { window } = dom;
  const keys = ['window', 'document', 'HTMLElement', 'getComputedStyle'];
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : key === 'getComputedStyle' ? window.getComputedStyle.bind(window) : window[key] });
  let reduced = false;
  window.matchMedia = () => ({ matches: reduced });
  const animations = [];
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 900, top: 20, width: 400, height: 800 });
  window.HTMLElement.prototype.getAnimations = function () { return animations.filter(a => a.element === this && a.playState === 'running'); };
  window.HTMLElement.prototype.animate = function (keyframes) {
    let resolve, reject;
    const finished = new Promise((a, b) => { resolve = a; reject = b; });
    const animation = {
      element: this, playState: 'running', finished, keyframes,
      cancel() { this.playState = 'idle'; reject(new Error('cancelled')); },
      finish() { if (this.playState === 'running') { this.playState = 'finished'; resolve(); } },
    };
    animations.push(animation);
    return animation;
  };
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const panel = window.document.querySelector('aside');
  const editor = panel.querySelector('textarea');
  const motion = createCompanionLayoutMotion();
  try {
    const commits = [];
    motion.transition(panel, () => commits.push('full'));
    assert.deepEqual(commits, [], 'text fades before changing layout');
    motion.transition(panel, () => commits.push('rail'));
    assert.deepEqual(commits, ['rail'], 'reversal discards the pending fullscreen mutation');
    assert.equal(window.document.querySelectorAll('.companion-layout-frame').length, 1);
    await flush();
    assert.equal(window.document.querySelectorAll('.companion-layout-frame').length, 1, 'cancelled completion cannot remove the new frame');
    animations.forEach(animation => animation.finish());
    await flush();
    assert.equal(window.document.querySelectorAll('.companion-layout-frame').length, 0);
    assert.equal(panel.hasAttribute('data-companion-layout-motion'), false);
    assert.equal(panel.style.opacity, '0.9');
    assert.equal(panel.querySelector('textarea'), editor);
    assert.equal(editor.value, 'unsent draft');

    motion.transition(panel, () => commits.push('cancelled'));
    motion.cancel();
    animations.forEach(animation => animation.finish());
    await flush();
    assert.deepEqual(commits, ['rail'], 'close/navigation cannot be followed by a stale layout mutation');

    motion.transition(panel, () => commits.push('resize'));
    motion.finish();
    motion.finish();
    await flush();
    assert.deepEqual(commits, ['rail', 'resize'], 'resize settles the pending state exactly once');

    const peer = window.document.createElement('aside');
    peer.id = 'peer';
    peer.innerHTML = '<p>Second panel</p>';
    window.document.body.appendChild(peer);
    motion.transitionMany([{ panel }, { panel: peer, entering: true }], () => commits.push('split'));
    assert.equal(commits.includes('split'), false);
    animations.forEach(animation => animation.finish());
    await flush();
    assert.equal(commits.filter(value => value === 'split').length, 1, 'both panel layouts commit together once');
    assert.equal(window.document.querySelectorAll('.companion-layout-frame').length, 2);
    const peerFrame = window.document.querySelector('[data-companion-panel="peer"]');
    peerFrame.getBoundingClientRect = () => ({ left: 700, top: 20, width: 600, height: 800 });
    // Reverse panel order while one exits: continuity must follow the panel,
    // not the first frame in the group or the previously active tab.
    motion.transitionMany([{ panel: peer }, { panel, leaving: true }], () => commits.push('peer-rail'));
    const peerFrameAnimation = animations.findLast(a => a.element.dataset.companionPanel === 'peer' && a.playState === 'running');
    assert.equal(peerFrameAnimation.keyframes[0].transform, 'translate3d(-200px, 0px, 0) scale(1.5, 1)');
    assert.equal(window.document.querySelectorAll('.companion-layout-frame').length, 2, 'outgoing peer fades instead of disappearing');
    await flush();
    assert.equal(window.document.querySelectorAll('.companion-layout-frame').length, 2, 'previous group cannot remove the replacement frames');
    animations.forEach(animation => animation.finish());
    await flush();
    assert.equal(window.document.querySelectorAll('.companion-layout-frame,[data-companion-layout-motion]').length, 0);
    assert.equal(editor.value, 'unsent draft');

    reduced = true;
    motion.transition(panel, () => commits.push('reduced'));
    assert.deepEqual(commits, ['rail', 'resize', 'split', 'peer-rail', 'reduced']);
    assert.equal(window.document.querySelectorAll('.companion-layout-frame').length, 0);
  } finally {
    motion.cancel();
    dom.window.close();
    keys.forEach((key, i) => { if (originals[i]) Object.defineProperty(globalThis, key, originals[i]); else delete globalThis[key]; });
  }
});
