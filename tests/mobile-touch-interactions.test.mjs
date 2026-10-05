import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');

const readFileNormalized = (relPath) =>
  fs.readFileSync(path.join(rootDir, relPath), 'utf-8').replace(/\r\n/g, '\n');

test('1. ArticleSearch: Mobile HUD centering, drag handle suppression, and bounds clamping', () => {
  const searchContent = readFileNormalized('src/components/ArticleSearch.astro');

  // Centering & CSS rules on mobile
  assert.ok(searchContent.includes('@media (max-width: 780px)'), 'Must include 780px mobile media query');
  assert.ok(
    searchContent.includes('.article-search-drag-handle') && searchContent.includes('display: none !important;'),
    'Must hide drag handle on mobile'
  );
  assert.ok(searchContent.includes('left: 50% !important;'), 'HUD must be horizontally centered at 50% on mobile');
  assert.ok(searchContent.includes('--hud-translate-x: -50% !important;'), 'Translate X variable must be pinned to -50% on mobile');
  assert.ok(searchContent.includes('top: max(14px, calc(env(safe-area-inset-top, 0px) + 8px));'), 'HUD must respect safe-area-inset-top');

  // Script: Ignore pointerdown drag on mobile
  assert.ok(searchContent.includes('if (window.innerWidth <= 780) return;'), 'Drag pointerdown must be ignored on <=780px');

  // Clamping math for desktop: Math.max(12, window.innerWidth - hud.offsetWidth - 12)
  assert.ok(searchContent.includes('const maxX = Math.max(12, window.innerWidth - hud.offsetWidth - 12);'), 'Must fix maxX boundary math');
  assert.ok(searchContent.includes('const maxY = Math.max(12, window.innerHeight - hud.offsetHeight - 12);'), 'Must fix maxY boundary math');
});

test('2. BaseLayout & global.css: Lenis virtualScroll whitelist & horizontal touch handling', () => {
  const layoutContent = readFileNormalized('src/layouts/BaseLayout.astro');
  const globalCss = readFileNormalized('src/styles/global.css');

  // Whitelist pin-sheet-open in modal check
  assert.ok(layoutContent.includes("document.body.classList.contains('pin-sheet-open')"), 'Must block Lenis scroll when pin sheet is open');

  // Whitelist pin sheet / window and ink ask card
  assert.ok(layoutContent.includes('.pin-sheet-drawer, .pin-window-body, .ink-ask-card'), 'Must prevent Lenis scroll on pin sheet and ink ask card');

  // Whitelist table, pre, mermaid horizontal containers
  assert.ok(layoutContent.includes('.prose table, table, .table-wrapper, [data-table-wrap], .prose pre, pre, .mermaid-stage, [data-scrollable]'), 'Must whitelist horizontal scrollable elements');
  assert.ok(layoutContent.includes('Math.abs(data.deltaX) > Math.abs(data.deltaY) && Math.abs(data.deltaX) > 1'), 'Must allow horizontal swipe when deltaX dominates');

  // CSS overscroll and touch-action on tables and pre
  assert.ok(globalCss.includes('overscroll-behavior-x: contain;'), 'CSS must include overscroll-behavior-x: contain');
  assert.ok(globalCss.includes('touch-action: pan-x pan-y;'), 'CSS must include touch-action: pan-x pan-y');
});

test('3. ArticleSelectionDock: iOS pointerdown compatibility, safe bottom and tap race guard', () => {
  const dockContent = readFileNormalized('src/components/ArticleSelectionDock.astro');

  // Restricted preventDefault on mouse only
  assert.ok(dockContent.includes("if (e.pointerType === 'mouse') {\n        e.preventDefault();\n      }"), 'Must only preventDefault for mouse pointerType');

  // isDockInteracting flag to prevent tap selection collapse race
  assert.ok(dockContent.includes('let isDockInteracting = false;'), 'Must define isDockInteracting flag');
  assert.ok(dockContent.includes('if (isDockInteracting) return;'), 'Must guard checkProseSelection during dock interaction');

  // Safe area bottom positioning
  assert.ok(dockContent.includes('bottom: max(20px, calc(env(safe-area-inset-bottom, 0px) + 16px));'), 'Must use safe-area bottom on desktop');
  assert.ok(dockContent.includes('bottom: max(16px, calc(env(safe-area-inset-bottom, 0px) + 14px));'), 'Must use safe-area bottom on mobile');
});

test('4. InkAsk: Mobile seal suppression, pull-down gesture, and relocated trigger', () => {
  const inkAskContent = readFileNormalized('src/components/InkAsk.astro');

  // Mobile floating seal suppression
  assert.ok(inkAskContent.includes('if (useSheet()) return hideSeal();'), 'Must suppress seal on mobile screen');

  // Seal preventDefault on mouse only
  assert.ok(inkAskContent.includes("if (event.pointerType === 'mouse') event.preventDefault();"), 'Seal pointerdown must only preventDefault on mouse');

  // Mobile relocated sidebar trigger (bottom-left)
  assert.ok(inkAskContent.includes('left: 16px !important;'), 'Sidebar trigger on mobile must be relocated to left');
  assert.ok(inkAskContent.includes('bottom: max(16px, calc(env(safe-area-inset-bottom, 0px) + 16px)) !important;'), 'Sidebar trigger must use safe bottom inset');

  // Head touch-action none
  assert.ok(inkAskContent.includes('.ink-ask-head {') && inkAskContent.includes('touch-action: none;'), 'InkAsk head must have touch-action: none');

  // Sheet pull down gesture
  assert.ok(inkAskContent.includes('isPullingSheet'), 'Must handle sheet pull gesture');
  assert.ok(inkAskContent.includes('translateY(100%)'), 'Must animate dismissal on pull threshold');
});

test('5. MermaidRenderer: Pinch-to-zoom at 1.0 zoom level and double tap reset', () => {
  const mermaidContent = readFileNormalized('src/components/MermaidRenderer.astro');
  const globalCss = readFileNormalized('src/styles/global.css');

  // Active stage assigned for unzoomed diagrams so pinch works
  assert.ok(mermaidContent.includes('activeStageEl = stage;'), 'Must set activeStageEl on stage pointerdown');
  assert.ok(mermaidContent.includes('initialPinchDistance = Math.hypot('), 'Must compute initial pinch distance');

  // Pinch calculation in pointermove
  assert.ok(mermaidContent.includes('activePointers.size === 2 && activeStageEl'), 'Must check 2 pointers and activeStageEl');
  assert.ok(mermaidContent.includes('setBlockZoom(block, initialPinchZoom * ratio);'), 'Must update block zoom from ratio');

  // Double tap reset
  assert.ok(mermaidContent.includes('lastTapStage === stage && now - lastTapTime < 320'), 'Must detect double tap within 320ms');
  assert.ok(mermaidContent.includes('setBlockZoom(block, 1.0);'), 'Must reset zoom to 1.0 on double tap');

  // CSS touch-action
  assert.ok(globalCss.includes('.mermaid-stage {') && globalCss.includes('touch-action: pan-x pan-y;'), 'Unzoomed stage must have touch-action: pan-x pan-y');
  assert.ok(globalCss.includes('.mermaid-stage.is-zoomed {') && globalCss.includes('touch-action: none;'), 'Zoomed stage must have touch-action: none');
});

test('6. Header: Cursor trail bypass on touch and Safari back-swipe guard', () => {
  const headerContent = readFileNormalized('src/components/Header.astro');

  // Cursor trail bypass on touch / coarse
  assert.ok(
    headerContent.includes("e.pointerType === 'touch' || isMobile || !window.matchMedia('(pointer: fine)').matches"),
    'Must bypass ink brush when pointerType is touch or coarse'
  );

  // Safari back swipe guard (clientX < 30)
  assert.ok(
    headerContent.includes('if (e.touches[0].clientX < 30) return;'),
    'Must ignore touches within 30px of left screen edge to avoid Safari back gesture conflict'
  );
});

test('7. PinWorkbench: Bottom sheet pull-down gesture and enlarged touch hit target', () => {
  const pinContent = readFileNormalized('src/components/PinWorkbench.astro');
  const globalCss = readFileNormalized('src/styles/global.css');

  // Sheet pull down logic
  assert.ok(pinContent.includes('function bindSheetDrag()'), 'Must implement bindSheetDrag');
  assert.ok(pinContent.includes('closeMobileSheet();'), 'Must close sheet when pulled beyond threshold');

  // Sheet handle touch target enlargement in global.css
  assert.ok(globalCss.includes('.pin-sheet-handle::before'), 'Must provide pseudo-element touch expander for pin-sheet-handle');
  assert.ok(globalCss.includes('.pin-window-header {') && globalCss.includes('touch-action: none;'), 'Pin window header must have touch-action: none');
});

test('8. Gallery Lightbox: Drawer touch event propagation suppression', () => {
  const galleryContent = readFileNormalized('src/pages/gallery.astro');

  assert.ok(galleryContent.includes('const lightboxDrawer = lightbox?.querySelector<HTMLElement>(\'.lightbox-info-drawer\');'), 'Must select lightbox drawer');
  assert.ok(galleryContent.includes('lightboxDrawer.addEventListener(\'touchstart\', stopDrawerTouch'), 'Must stop touchstart propagation on drawer');
  assert.ok(galleryContent.includes('lightboxDrawer.addEventListener(\'touchmove\', stopDrawerTouch'), 'Must stop touchmove propagation on drawer');
  assert.ok(galleryContent.includes('lightboxDrawer.addEventListener(\'touchend\', stopDrawerTouch'), 'Must stop touchend propagation on drawer');
});

test('9. ZenSoundscape: Volume slider touch drag protection and thumb enlargement', () => {
  const zenContent = readFileNormalized('src/components/ZenSoundscape.astro');
  const globalCss = readFileNormalized('src/styles/global.css');

  // Dragging volume guard on dismiss
  assert.ok(zenContent.includes('(window as any).__zenIsDraggingVolume = true;'), 'Must set __zenIsDraggingVolume on pointerdown');
  assert.ok(zenContent.includes('if ((window as any).__zenIsDraggingVolume) return;'), 'Must skip outside dismissal while dragging volume');

  // CSS touch-action and thumb dimensions
  assert.ok(globalCss.includes('.zen-volume-slider {') && globalCss.includes('touch-action: none;'), 'Zen slider must have touch-action: none');
  assert.ok(globalCss.includes('.zen-volume-slider::-webkit-slider-thumb') && globalCss.includes('width: 24px;'), 'Mobile thumb must be 24px');
});

test('10. Timeline: Viewport pan-y touch action', () => {
  const globalCss = readFileNormalized('src/styles/global.css');

  assert.ok(globalCss.includes('.timeline-viewport {') && globalCss.includes('touch-action: pan-y;'), 'Timeline viewport must have touch-action: pan-y');
});
