import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');

const readFileNormalized = (relPath) =>
  fs.readFileSync(path.join(rootDir, relPath), 'utf-8').replace(/\r\n/g, '\n');

test('1. TOC Header Layout: Redundant buttons hidden on mobile, notes count class fixed, kicker/title nowrap', () => {
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');
  const globalCss = readFileNormalized('src/styles/global.css');

  // Redundant buttons inside TOC card have max-sm:hidden and container is post-toc-tools
  assert.ok(postLayout.includes('class="post-toc-tools flex items-center gap-2"'), 'Must define post-toc-tools container');
  assert.ok(postLayout.includes('class="post-toc-search-btn max-sm:hidden"'), 'Must hide TOC search/notes buttons on mobile screens');

  // Notes count badge class bugfix (not overwritten by search kbd script)
  assert.ok(
    postLayout.includes('<span class="post-toc-notes-badge" data-notes-count>0</span>'),
    'Notes count badge must use post-toc-notes-badge class to prevent being overwritten with Ctrl F'
  );
  assert.ok(!postLayout.includes('<span class="post-toc-search-kbd" data-notes-count>'), 'Must NOT use post-toc-search-kbd on notes count');

  // CSS: nowrap and flex-shrink protection on kicker and title
  assert.ok(postLayout.includes('.post-toc-kicker {') && postLayout.includes('white-space: nowrap;'), 'Kicker must have white-space: nowrap');
  assert.ok(postLayout.includes('.post-toc-title {') && postLayout.includes('white-space: nowrap;'), 'Title must have white-space: nowrap');

  // CSS: Mobile padding 0.9rem
  assert.ok(postLayout.includes('padding: 0.85rem 0.9rem !important;'), 'Must adjust mobile TOC padding to 0.9rem');
  assert.ok(postLayout.includes('.post-toc-tools .post-toc-search-btn {'), 'Must hide post-toc-tools search btn via CSS');
  assert.ok(globalCss.includes('.post-toc-tools .post-toc-search-btn {'), 'global.css must hide post-toc-tools search btn via CSS');
});

test('2. ArticleSelectionDock: Vertical text wrapping prevention, mobile pin button hidden, 2-character delete button', () => {
  const dockContent = readFileNormalized('src/components/ArticleSelectionDock.astro');
  const globalCss = readFileNormalized('src/styles/global.css');

  // Mode B manage text: 2-character "删除"
  assert.ok(dockContent.includes('<span>删除</span>'), 'Mode B delete button must use concise 2-char text "删除"');
  assert.ok(!dockContent.includes('<span>取消划线</span>'), 'Must NOT use 4-char "取消划线"');

  // Nowrap and flex-shrink protection on buttons and status tag
  assert.ok(dockContent.includes('.dock-action-btn {') && dockContent.includes('white-space: nowrap;'), 'Dock action button must be white-space: nowrap');
  assert.ok(dockContent.includes('.dock-action-btn span {') && dockContent.includes('white-space: nowrap;'), 'Dock action button text must be white-space: nowrap');
  assert.ok(dockContent.includes('.dock-status-tag {') && dockContent.includes('white-space: nowrap;'), 'Dock status tag must be white-space: nowrap');

  // Mobile: hide pin buttons and compress padding to 5px 6px
  assert.ok(dockContent.includes('#dock-act-pin') && dockContent.includes('display: none !important;'), 'Must hide pin buttons on mobile');
  assert.ok(dockContent.includes('padding: 5px 6px;'), 'Must compress mobile dock button padding to 5px 6px');

  // State class toggle on body: has-selection-dock-open
  assert.ok(dockContent.includes("document.body.classList.add('has-selection-dock-open')"), 'Must add has-selection-dock-open on showDock');
  assert.ok(dockContent.includes("document.body.classList.remove('has-selection-dock-open')"), 'Must remove has-selection-dock-open on hideDock');

  // CSS hiding floating action capsules when dock is open
  assert.ok(dockContent.includes('body.has-selection-dock-open .article-floating-actions'), 'Dock CSS must suppress floating actions when open');
  assert.ok(globalCss.includes('body.has-selection-dock-open .article-floating-actions'), 'Global CSS must suppress floating actions when open');
});

test('3. Bottom Floating Capsules: Unified safe-area bottom, collision prevention, and main pb-28', () => {
  const globalCss = readFileNormalized('src/styles/global.css');
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');
  const searchContent = readFileNormalized('src/components/ArticleSearch.astro');
  const dockContent = readFileNormalized('src/components/ArticleSelectionDock.astro');
  const inkAskContent = readFileNormalized('src/components/InkAsk.astro');

  // Unified safe-area calculation for floating actions
  assert.ok(
    globalCss.includes('.article-floating-actions {') &&
      globalCss.includes('bottom: calc(16px + env(safe-area-inset-bottom, 0px));'),
    'article-floating-actions must use unified safe-area bottom calc(16px + env(safe-area-inset-bottom, 0px))'
  );
  assert.ok(
    searchContent.includes('bottom: calc(16px + env(safe-area-inset-bottom, 0px));'),
    'article-search-floating-pill must use unified safe-area bottom'
  );
  assert.ok(
    dockContent.includes('.article-highlights-floating-pill {') &&
      dockContent.includes('bottom: calc(16px + env(safe-area-inset-bottom, 0px));'),
    'article-highlights-floating-pill must use unified safe-area bottom'
  );
  assert.ok(
    inkAskContent.includes('bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important;'),
    'ink-ask-sidebar-trigger must use unified safe-area bottom calc(16px + env(safe-area-inset-bottom, 0px))'
  );
  assert.ok(
    dockContent.includes('bottom: calc(16px + env(safe-area-inset-bottom, 0px));'),
    'article-selection-dock on mobile must use unified safe-area bottom calc(16px + env(safe-area-inset-bottom, 0px))'
  );

  // PinWorkbench mobile edge tab cleared above floating capsules
  assert.ok(
    globalCss.includes('bottom: calc(72px + env(safe-area-inset-bottom, 0px));'),
    'pin-edge-tab on mobile must be raised to bottom: calc(72px + ...) so it does not cover floating pills'
  );

  // PostLayout main pb-28
  assert.ok(postLayout.includes('pb-28 lg:pt-8'), 'PostLayout main must have pb-28 for bottom dock clearance');
});

test('4. Mobile Keyboard Shortcuts Cleanup: Physical shortcut badges hidden on coarse pointer & mobile', () => {
  const searchContent = readFileNormalized('src/components/ArticleSearch.astro');
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');
  const globalCss = readFileNormalized('src/styles/global.css');

  // ArticleSearch: Esc and pill kbd hidden on mobile / pointer: coarse
  assert.ok(
    searchContent.includes('.article-search-kbd,') && searchContent.includes('.article-search-pill-kbd {') && searchContent.includes('display: none !important;'),
    'ArticleSearch must hide search badges on mobile'
  );
  assert.ok(
    searchContent.includes('@media (hover: none) and (pointer: coarse)'),
    'ArticleSearch must handle pointer: coarse media query'
  );

  // PostLayout: post-toc-search-kbd hidden on mobile / pointer: coarse
  assert.ok(
    postLayout.includes('.post-toc-search-kbd {') && postLayout.includes('display: none !important;'),
    'PostLayout must hide post-toc-search-kbd on mobile'
  );

  // global.css: global mobile shortcuts cleanup
  assert.ok(
    globalCss.includes('.article-search-pill-kbd,') && globalCss.includes('.post-toc-search-kbd,'),
    'global.css must provide coarse/mobile suppression for keyboard shortcuts'
  );
});

test('5. Viewport Meta & Reading Column Padding: viewport-fit=cover and px-4 py-6 on mobile', () => {
  const baseLayout = readFileNormalized('src/layouts/BaseLayout.astro');
  const postLayout = readFileNormalized('src/layouts/PostLayout.astro');

  // BaseLayout viewport-fit=cover
  assert.ok(
    baseLayout.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />'),
    'BaseLayout must specify viewport-fit=cover for iOS safe area support'
  );

  // PostLayout reading column padding
  assert.ok(
    postLayout.includes('px-4 py-6 sm:px-6 md:px-10 md:py-10'),
    'PostLayout post-body must use px-4 py-6 on mobile to reclaim 24px reading width'
  );
});
