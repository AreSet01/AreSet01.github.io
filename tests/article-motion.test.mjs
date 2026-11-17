import test from 'node:test';
import assert from 'node:assert/strict';
import { readArticleMotion } from '../src/utils/articleMotion.ts';

test('article timers match CSS duration before and after production unit minification', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalStyle = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
  let duration = '';
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: {} } });
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    value: () => ({ getPropertyValue: name => name === '--article-duration-panel' ? duration : '' }),
  });
  try {
    for (const [css, expected] of [['620ms', 620], ['.62s', 620], [' 0.62s ', 620], ['1.2s', 1200], ['0ms', 0], ['', 620], ['invalid', 620], ['-1s', 620]]) {
      duration = css;
      assert.equal(readArticleMotion().panelMs, expected, css);
    }
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
    if (originalStyle) Object.defineProperty(globalThis, 'getComputedStyle', originalStyle);
    else delete globalThis.getComputedStyle;
  }
});
