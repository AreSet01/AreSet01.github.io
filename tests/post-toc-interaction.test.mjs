import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = path.resolve(import.meta.dirname, '..');

const readFileNormalized = (relPath) =>
  fs.readFileSync(path.join(rootDir, relPath), 'utf-8').replace(/\r\n/g, '\n');

test('1. SyntaxError & Script Architecture: inline TOC script is valid pure JavaScript with zero TypeScript types', () => {
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');

  // Extract the TOC inline script block
  const tocScriptMatch = postLayout.match(/<script is:inline>([\s\S]*?__areSetPostTocCleanup__[\s\S]*?)<\/script>/);
  assert.ok(tocScriptMatch, 'PostLayout must contain TOC inline script block');

  const scriptCode = tocScriptMatch[1];

  // Must contain ZERO TypeScript type assertions or type annotations
  assert.ok(!scriptCode.includes(' as HTMLElement'), 'Must not contain "as HTMLElement" in inline script');
  assert.ok(!scriptCode.includes(' as any'), 'Must not contain "as any" in inline script');
  assert.ok(!scriptCode.includes(': Animation'), 'Must not contain ": Animation" in inline script');
  assert.ok(!scriptCode.includes(': HTMLElement'), 'Must not contain ": HTMLElement" in inline script');

  // Must compile as valid JavaScript in Node VM without syntax error
  assert.doesNotThrow(() => {
    new vm.Script(scriptCode);
  }, 'Inline script must parse as valid JavaScript without SyntaxError');
});

test('2. Smooth Accordion Expand/Collapse: uses expander.scrollHeight, cancels WAAPI on finish, syncs lenis/ScrollTrigger', () => {
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');
  const tocScriptMatch = postLayout.match(/<script is:inline>([\s\S]*?__areSetPostTocCleanup__[\s\S]*?)<\/script>/);
  const scriptCode = tocScriptMatch[1];

  // Uses expander.scrollHeight to prevent 13.6px sudden jump caused by inner margin-top
  assert.ok(
    scriptCode.includes('expander.scrollHeight'),
    'Must calculate targetHeight using expander.scrollHeight to account for child margins'
  );

  // Calls tocAnim.cancel() onfinish to avoid forwards fill lock
  assert.ok(
    scriptCode.includes('tocAnim.cancel();') && scriptCode.includes('tocAnim.onfinish'),
    'Must call tocAnim.cancel() in onfinish to clear WAAPI forwards fill lock'
  );

  // Syncs with lenis and ScrollTrigger
  assert.ok(scriptCode.includes('window.lenis?.resize()'), 'Must call window.lenis?.resize()');
  assert.ok(scriptCode.includes('window.ScrollTrigger?.refresh()'), 'Must call window.ScrollTrigger?.refresh()');
});

test('3. Event Isolation for Summary Buttons: prevents summary toggle and stops propagation on child buttons', () => {
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');

  // Markup contains IDs on child buttons
  assert.ok(postLayout.includes('id="post-toc-notes-btn"'), 'Must define id="post-toc-notes-btn" on notes button');
  assert.ok(postLayout.includes('id="post-toc-search-btn"'), 'Must define id="post-toc-search-btn" on search button');

  const tocScriptMatch = postLayout.match(/<script is:inline>([\s\S]*?__areSetPostTocCleanup__[\s\S]*?)<\/script>/);
  const scriptCode = tocScriptMatch[1];

  // Button clicks inside summary stop propagation
  assert.ok(
    scriptCode.includes('summaryButtons.forEach') && scriptCode.includes('event.stopPropagation()'),
    'Child buttons must call stopPropagation to isolate events from summary'
  );

  // Summary click checks for button targets and calls preventDefault & stopPropagation
  assert.ok(
    scriptCode.includes("target.closest('button, a, input, [role=\"button\"]')") &&
      scriptCode.includes('event.preventDefault()') &&
      scriptCode.includes('event.stopPropagation()'),
    'Summary click listener must isolate child button clicks and prevent default toggle'
  );
});

test('4. Smooth Scrolling on TOC Link Click: -70px sticky header offset, preventDefault, history hash and active link update', () => {
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');
  const tocScriptMatch = postLayout.match(/<script is:inline>([\s\S]*?__areSetPostTocCleanup__[\s\S]*?)<\/script>/);
  const scriptCode = tocScriptMatch[1];

  // Prevent default instant hash jump
  assert.ok(
    scriptCode.includes("link.getAttribute('data-toc-link')") && scriptCode.includes('event.preventDefault()'),
    'TOC link click must prevent default hash jump'
  );

  // Smooth scroll with -70 offset
  assert.ok(
    scriptCode.includes("window.lenis.scrollTo(targetEl, { offset: -70 })"),
    'Must use window.lenis.scrollTo with offset -70 for sticky header clearance'
  );
  assert.ok(
    scriptCode.includes("window.scrollY - 70") && scriptCode.includes("behavior: 'smooth'"),
    'Must fallback to smooth window.scrollTo with -70 offset when lenis is unavailable'
  );

  // Update active state and URL hash
  assert.ok(scriptCode.includes('setActive(id)'), 'Must update active link state on click');
  assert.ok(scriptCode.includes("history.pushState(null, '', '#' + id)"), 'Must update URL hash on link click');
});

test('5. Scrollspy & Internal Auto-Scroll for Long TOCs: IntersectionObserver, top fallback, scrollIntoView', () => {
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');
  const tocScriptMatch = postLayout.match(/<script is:inline>([\s\S]*?__areSetPostTocCleanup__[\s\S]*?)<\/script>/);
  const scriptCode = tocScriptMatch[1];

  // Scrollspy observer
  assert.ok(scriptCode.includes('new IntersectionObserver'), 'Must use IntersectionObserver for scrollspy');
  assert.ok(scriptCode.includes("rootMargin: '-18% 0px -70% 0px'"), 'Must specify precise rootMargin for active heading detection');

  // Initial fallback when page near top
  assert.ok(
    scriptCode.includes('window.scrollY < 200'),
    'Must provide initial fallback when window.scrollY < 200 to activate 1st section'
  );

  // Auto-scroll long TOC active item into view
  assert.ok(
    scriptCode.includes("link.scrollIntoView({ block: 'nearest', behavior: 'smooth' })"),
    'Must call link.scrollIntoView with block: nearest and smooth behavior'
  );
});

test('6. Micro-Interactions & Transitions: tactile :active feedback and smooth caret rotation sync', () => {
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');

  // Tactile feedback on buttons and links
  assert.ok(
    postLayout.includes('.post-toc-search-btn:active {') && postLayout.includes('transform: scale(0.97);'),
    'Must provide :active transform: scale(0.97) for TOC search/notes buttons'
  );
  assert.ok(
    postLayout.includes('.post-toc-link:active {') && postLayout.includes('transform: scale(0.97);'),
    'Must provide :active transform: scale(0.97) for TOC links'
  );

  // Caret rotation sync
  assert.ok(
    postLayout.includes('.post-toc[open] .post-toc-caret {') && postLayout.includes('transform: rotate(0deg);'),
    'Caret must rotate to 0deg when open'
  );
  assert.ok(
    postLayout.includes('.post-toc.is-collapsed .post-toc-caret {') && postLayout.includes('transform: rotate(-90deg) !important;'),
    'Caret must immediately rotate to -90deg when collapsing'
  );
});

test('7. Edge Cases & Robustness: deduplication of setActive, hash priority, safe collapse timing, and history sync', () => {
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');
  const tocScriptMatch = postLayout.match(/<script is:inline>([\s\S]*?__areSetPostTocCleanup__[\s\S]*?)<\/script>/);
  const scriptCode = tocScriptMatch[1];

  // Deduplication: currentActiveId prevents continuous smooth scroll jitter while reading
  assert.ok(
    scriptCode.includes('let currentActiveId = null;') &&
      scriptCode.includes('if (!id || id === currentActiveId) return;'),
    'Must track currentActiveId and return early to prevent continuous scrollIntoView fights on every scroll tick'
  );

  // Initial load priority: location.hash takes precedence over scrollY < 200 fallback
  const hashIdx = scriptCode.indexOf('if (location.hash)');
  const scrollYFallbackIdx = scriptCode.indexOf('!currentActiveId && window.scrollY < 200');
  assert.ok(hashIdx !== -1, 'Must check location.hash on load');
  assert.ok(scrollYFallbackIdx !== -1, 'Must fallback to top only when no active hash is selected');
  assert.ok(hashIdx < scrollYFallbackIdx, 'location.hash check must precede scrollY fallback on initial load');

  // History sync: hashchange event listener updates TOC active link on back/forward navigation
  assert.ok(
    scriptCode.includes("window.addEventListener('hashchange'"),
    'Must listen for hashchange events to sync TOC active state with browser history'
  );

  // Safe collapse timing: toc.open = false set before tocAnim.cancel()
  const collapseFinishIdx = scriptCode.indexOf('tocAnim.onfinish = () => {\n                toc.open = false;');
  assert.ok(
    collapseFinishIdx !== -1 || scriptCode.includes('toc.open = false;\n                if (tocAnim) {\n                  tocAnim.cancel();'),
    'Must set toc.open = false before cancelling animation fill to prevent 1-frame flash of open content'
  );

  // Auto-scroll active link when user expands TOC
  assert.ok(
    scriptCode.includes("const activeLink = toc.querySelector('.post-toc-link.is-active');") &&
      scriptCode.includes('activeLink.scrollIntoView({ block: \'nearest\' });'),
    'Must scroll active link into view inside scrollable nav when TOC is expanded'
  );

  // Child button isolation: calls event.preventDefault() for all child buttons in summary
  assert.ok(
    scriptCode.includes('event.stopPropagation();\n              event.preventDefault();'),
    'Must call event.preventDefault() and stopPropagation() on all summary child buttons'
  );
});

