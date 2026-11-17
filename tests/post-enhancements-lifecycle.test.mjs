import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

test('code controls survive repeated article initialization and bind on the next article', () => {
  const source = fs.readFileSync('src/layouts/PostLayout.astro', 'utf8');
  const script = [...source.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(code => code.includes('__areSetPostEnhancementsCleanup__'));
  assert.ok(script);
  const article = `<div data-post-prose><pre><code>${'line\n'.repeat(24)}</code></pre></div>`;
  const dom = new JSDOM(article, { url: 'http://localhost/posts/test', runScripts: 'outside-only' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true });
  try {
    window.eval(script);
    window.document.dispatchEvent(new window.Event('astro:page-load'));
    window.dispatchEvent(new window.Event('post-unlocked'));
    window.eval(script);
    const pre = window.document.querySelector('pre');
    assert.equal(pre.querySelectorAll('.code-block-toolbar').length, 1);
    const button = pre.querySelector('.code-collapse-button');
    button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.ok(pre.classList.contains('is-code-collapsed'));
    button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.ok(!pre.classList.contains('is-code-collapsed'));

    window.document.body.innerHTML = article;
    window.document.dispatchEvent(new window.Event('astro:page-load'));
    const nextButton = window.document.querySelector('.code-collapse-button');
    nextButton.click();
    assert.equal(nextButton.getAttribute('aria-expanded'), 'false');
  } finally {
    window.close();
  }
});
