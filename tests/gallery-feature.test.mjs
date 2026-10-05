import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PHOTO_CATEGORIES,
  GALLERY_PHOTOS,
  getAllPhotos,
  getPhotoById,
  getPhotosByCategory,
  getAllPhotoTags,
  getAllPhotoLocations,
} from '../src/data/gallery.ts';

const rootDir = path.resolve(import.meta.dirname, '..');

test('Gallery Categories: Complete category schemas and labels', () => {
  assert.ok(PHOTO_CATEGORIES.length >= 5, 'Must have at least 5 category items');
  const catIds = PHOTO_CATEGORIES.map((c) => c.id);
  assert.ok(catIds.includes('all'), 'Must have all');
  assert.ok(catIds.includes('nature'), 'Must have nature');
  assert.ok(catIds.includes('urban'), 'Must have urban');
  assert.ok(catIds.includes('daily'), 'Must have daily');
  assert.ok(catIds.includes('humanities'), 'Must have humanities');

  PHOTO_CATEGORIES.forEach((cat) => {
    assert.ok(cat.name && cat.name.length > 0, 'Category name must not be empty');
    assert.ok(cat.icon && cat.icon.length > 0, 'Category icon must not be empty');
    assert.ok(cat.desc && cat.desc.length > 0, 'Category desc must not be empty');
  });
});

test('Gallery Data: Photo entries schema, EXIF integrity and asset availability', () => {
  const photos = getAllPhotos();
  assert.ok(photos.length >= 1, 'Must have at least 1 photo record');

  photos.forEach((photo) => {
    assert.ok(photo.id && photo.id.length > 0, 'Photo must have an id');
    assert.ok(photo.title && photo.title.length > 0, 'Photo must have a title');
    assert.ok(photo.story && photo.story.length > 0, 'Photo must have a story/description');
    assert.ok(photo.location && photo.location.length > 0, 'Photo must have a location');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(photo.date), 'Date must be YYYY-MM-DD');
    assert.ok(Array.isArray(photo.tags) && photo.tags.length > 0, 'Photo must have tags');
    assert.ok(photo.exifDisplay && photo.exifDisplay.length > 0, 'Photo must have exifDisplay');

    // EXIF properties
    assert.ok(photo.exif.camera, 'EXIF must have camera');
    assert.ok(photo.exif.lens, 'EXIF must have lens');
    assert.ok(photo.exif.aperture, 'EXIF must have aperture');
    assert.ok(photo.exif.shutter, 'EXIF must have shutter');
    assert.ok(photo.exif.iso, 'EXIF must have iso');

    // Asset file verification
    const assetRelativePath = photo.url.replace(/^\//, '');
    const fullAssetPath = path.join(rootDir, 'public', assetRelativePath);
    assert.ok(
      fs.existsSync(fullAssetPath),
      `Photo asset file must exist at ${fullAssetPath}`
    );
    const stat = fs.statSync(fullAssetPath);
    assert.ok(stat.size > 200, `Photo asset ${photo.url} must not be empty`);
  });

  // Query helpers
  const yanyan = getPhotoById('zhaoqing-huaiji-yanyan');
  assert.ok(yanyan, 'Must be able to find zhaoqing-huaiji-yanyan by id');
  assert.strictEqual(yanyan?.location, '广东省肇庆市怀集县 · 燕岩');
  assert.strictEqual(yanyan?.exif.camera, 'Sony A7C');

  const naturePhotos = getPhotosByCategory('nature');
  assert.ok(naturePhotos.length >= 1, 'Must have at least 1 nature photo');
  naturePhotos.forEach((p) => assert.strictEqual(p.category, 'nature'));

  const tags = getAllPhotoTags();
  assert.ok(tags.length >= 1, 'Must have distinct photo tags');

  const locations = getAllPhotoLocations();
  assert.ok(locations.length >= 1, 'Must have distinct locations');
});

test('Navigation: Header.astro contains /gallery with Gallery / 拾影 label', () => {
  const headerContent = fs.readFileSync(path.join(rootDir, 'src/components/Header.astro'), 'utf-8');
  assert.ok(
    headerContent.includes("{ label: 'Gallery', labelZh: 'Gallery / 拾影', href: '/gallery' }"),
    'Header.astro must contain /gallery navigation item'
  );
});

test('Markup & Structure: gallery.astro provides white-mat mount borders and darkroom lightbox', () => {
  const galleryContent = fs.readFileSync(path.join(rootDir, 'src/pages/gallery.astro'), 'utf-8');

  // 1. Page enter choreography & Oriental aesthetic
  assert.ok(galleryContent.includes('data-enter="top"'), 'Eyebrow must have data-enter="top"');
  assert.ok(galleryContent.includes('data-enter="left"'), 'Title must have data-enter="left"');
  assert.ok(galleryContent.includes('data-enter="stamp"'), 'Stats must have data-enter="stamp"');
  assert.ok(galleryContent.includes('data-enter="bottom"'), 'Tabs/Search must have data-enter="bottom"');
  assert.ok(galleryContent.includes('data-enter={enterFrom}'), 'Cards must have data-enter');
  assert.ok(!galleryContent.includes('class="gallery-title-seal"'), 'Title must not feature red seal stamp');

  // 2. Stats odometer counter
  assert.ok(galleryContent.includes('data-count={allPhotos.length}'), 'Total photo count must have data-count');
  assert.ok(galleryContent.includes('data-count={allLocations.length}'), 'Total locations must have data-count');

  // 3. Category tabs & Search
  assert.ok(galleryContent.includes('data-category-tab={cat.id}'), 'Must have category tabs');
  assert.ok(galleryContent.includes('id="gallery-search-input"'), 'Must have search input');
  assert.ok(galleryContent.includes('id="gallery-search-clear"'), 'Must have clear button');

  // 4. Museum White-Mat Mount Cards (艺术馆装裱留白)
  assert.ok(galleryContent.includes('class="mat-frame"'), 'Cards must have white-mat passe-partout frame');
  assert.ok(galleryContent.includes('class="mat-image-window"'), 'Cards must have photo window');
  assert.ok(galleryContent.includes('class="mat-plaque"'), 'Cards must have artwork plaque');
  assert.ok(galleryContent.includes('class="mat-exif-pill"'), 'Cards must display EXIF pill');

  // 5. Ink Darkroom Lightbox (全屏水墨暗房看图器)
  assert.ok(galleryContent.includes('id="gallery-lightbox"'), 'Must have lightbox dialog element');
  assert.ok(galleryContent.includes('class="gallery-lightbox'), 'Must have gallery-lightbox class');
  assert.ok(galleryContent.includes('role="dialog"'), 'Lightbox must be a dialog');
  assert.ok(galleryContent.includes('aria-modal="true"'), 'Lightbox must declare aria-modal="true"');
  assert.ok(galleryContent.includes('data-lenis-prevent'), 'Lightbox must have data-lenis-prevent');

  // 6. Lightbox Controls & EXIF Matrix
  assert.ok(galleryContent.includes('data-lightbox-prev'), 'Lightbox must have prev navigation button');
  assert.ok(galleryContent.includes('data-lightbox-next'), 'Lightbox must have next navigation button');
  assert.ok(galleryContent.includes('data-lightbox-close'), 'Lightbox must have close button');
  assert.ok(galleryContent.includes('id="lightbox-main-img"'), 'Lightbox must have main photo element');
  assert.ok(galleryContent.includes('class="lightbox-exif-grid"'), 'Lightbox must display EXIF grid');
  assert.ok(galleryContent.includes('id="lightbox-exif-camera"'), 'Lightbox must display camera model');
  assert.ok(galleryContent.includes('id="lightbox-exif-lens"'), 'Lightbox must display lens model');
  assert.ok(galleryContent.includes('id="lightbox-exif-aperture"'), 'Lightbox must display aperture');
  assert.ok(galleryContent.includes('id="lightbox-exif-shutter"'), 'Lightbox must display shutter speed');
  assert.ok(galleryContent.includes('id="lightbox-exif-iso"'), 'Lightbox must display ISO');

  // 7. Lenis Coordination & Keyboard Navigation
  assert.ok(galleryContent.includes('lenis.stop()'), 'Lenis must be stopped when lightbox opens');
  assert.ok(galleryContent.includes('lenis.start()'), 'Lenis must be resumed when lightbox closes');
  assert.ok(galleryContent.includes("e.key === 'Escape'"), 'Must handle Esc to close lightbox');
  assert.ok(galleryContent.includes("e.key === 'ArrowRight'"), 'Must handle ArrowRight for next photo');
  assert.ok(galleryContent.includes("e.key === 'ArrowLeft'"), 'Must handle ArrowLeft for prev photo');

  // 8. View Transitions & Mobile Touch Lifecycle
  assert.ok(
    galleryContent.includes("document.addEventListener('astro:page-load'"),
    'gallery.astro must bind to astro:page-load for client-side navigation'
  );
  assert.ok(
    galleryContent.includes('touchstart') && galleryContent.includes('touchend'),
    'gallery.astro must support mobile touch swipe navigation in lightbox'
  );
  assert.ok(
    galleryContent.includes("ke.key === 'Enter'") && galleryContent.includes("ke.key === ' '"),
    'gallery.astro cards must be accessible via keyboard Enter and Space'
  );
  assert.ok(
    galleryContent.includes('overflow-x: auto') && galleryContent.includes('@media (max-width: 639px)'),
    'gallery.astro must make EXIF matrix responsive on mobile viewports'
  );
});

test('Gallery Scheme B Animations: Clean typography & Full consistency with /life', () => {
  const galleryContent = fs.readFileSync(path.join(rootDir, 'src/pages/gallery.astro'), 'utf-8');
  const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf-8');

  // Scheme B registration and custom eases
  assert.ok(galleryContent.includes("CustomEase.create('enter'"), 'Must register enter custom ease');
  assert.ok(galleryContent.includes("CustomEase.create('ink'"), 'Must register ink custom ease');

  // Calligraphy scroll unfurling clip-path stages
  assert.ok(galleryContent.includes("inset(0 100% 0 0)"), 'Must include scroll roll-up clip-path');
  assert.ok(galleryContent.includes("inset(0 0% 0 0)"), 'Must include scroll unfurl clip-path');

  // Card seal stamps removed per user request for clean aesthetic
  assert.ok(!galleryContent.includes('class="gallery-card-seal"'), 'Gallery cards must not feature card seal stamps');
  assert.ok(!galleryContent.includes('data-card-seal'), 'Gallery cards must not have data-card-seal');
  assert.ok(galleryContent.includes('settleCard('), 'Must provide settleCard function');
  assert.ok(galleryContent.includes('syncGridBaseline('), 'Must provide syncGridBaseline function to prevent height shifts');
  assert.ok(galleryContent.includes('data-click-tag'), 'Gallery tags must support quick click filtering');

  // Body lock in global.css
  assert.ok(globalCss.includes('body.gallery-lightbox-open'), 'global.css must lock scroll for gallery-lightbox-open');
});

test('Gallery Image Asset Robustness: Photo assets exist with valid size', () => {
  const photos = getAllPhotos();
  photos.forEach((photo) => {
    const assetPath = path.join(rootDir, 'public', photo.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(assetPath), `Photo file ${photo.url} must exist`);
    const stat = fs.statSync(assetPath);
    assert.ok(stat.size > 1000, `Photo file ${photo.url} must be substantial (actual: ${stat.size} bytes)`);
  });
});

test('Gallery Interactive Consistency & Architecture: BaseLayout integration and robust event handlers', () => {
  const galleryContent = fs.readFileSync(path.join(rootDir, 'src/pages/gallery.astro'), 'utf-8');
  const baseLayoutContent = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf-8');

  // 1. Scroll re-entry handled naturally by BaseLayout triggers (no data-no-replay)
  assert.ok(
    !galleryContent.includes('data-no-replay'),
    'Gallery cards must not declare data-no-replay so BaseLayout can manage scroll entrance'
  );

  // 2. BaseLayout Lenis coordination
  assert.ok(
    baseLayoutContent.includes("document.body.classList.contains('gallery-lightbox-open')"),
    'BaseLayout must guard Lenis virtualScroll when gallery-lightbox-open is active'
  );
  assert.ok(
    baseLayoutContent.includes('#gallery-lightbox'),
    'BaseLayout must prevent scroll hijacking for #gallery-lightbox element'
  );

  // 3. Stage & Container backdrop click-outside-to-close
  assert.ok(
    galleryContent.includes('e.target === lightboxStage'),
    'Clicking empty stage background must close the lightbox'
  );
  assert.ok(
    galleryContent.includes('e.target === lightboxContainer'),
    'Clicking empty container backdrop must close the lightbox'
  );

  // 4. Aspect-ratio styling and flex-shrink protection
  assert.ok(
    galleryContent.includes('aspect-ratio: var(--lightbox-aspect'),
    'Lightbox wrapper must bind aspect-ratio to dynamic CSS variable'
  );
  assert.ok(
    galleryContent.includes('flex-shrink: 0'),
    'Top bar and info drawer must have flex-shrink: 0 to protect stage dimensions'
  );

  // 5. Card hover zoom and tag click category synchronization
  assert.ok(
    galleryContent.includes('.gallery-mat-card:hover .mat-photo-img'),
    'Hovering gallery card must elevate and zoom photo smoothly'
  );
  assert.ok(
    galleryContent.includes("currentCategory = 'all'"),
    'Clicking tag chip must reset category to all for full-catalog search'
  );
});

test('Gallery Lightbox Animations & Sidebar Layout Robustness', () => {
  const galleryContent = fs.readFileSync(path.join(rootDir, 'src/pages/gallery.astro'), 'utf-8');
  const headerContent = fs.readFileSync(path.join(rootDir, 'src/components/Header.astro'), 'utf-8');
  const baseLayoutContent = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf-8');

  // 1. Lightbox GSAP open & close animation integrity
  assert.ok(
    galleryContent.includes("lightbox.querySelector<HTMLElement>('.lightbox-info-drawer')"),
    'openLightbox and closeLightbox must query the exact .lightbox-info-drawer selector'
  );
  assert.ok(
    !galleryContent.includes("lightbox.querySelector<HTMLElement>('.lightbox-drawer')"),
    'openLightbox must not use outdated non-existent .lightbox-drawer class'
  );
  assert.ok(
    galleryContent.includes('back.out(1.4)') || galleryContent.includes('back.out(1.5)'),
    'openLightbox must use spring rise choreography for main stage container'
  );
  assert.ok(
    galleryContent.includes('power2.in'),
    'closeLightbox must use power2.in choreography for smooth exit transition'
  );
  assert.ok(
    galleryContent.includes('filter: blur(10px)') || galleryContent.includes("filter: 'blur(10px)'"),
    'openLightbox must unfurl photo from ink blur'
  );
  assert.ok(
    !galleryContent.includes('lightbox-seal'),
    'Lightbox top-bar must not feature red seal stamp'
  );
  assert.ok(
    !galleryContent.includes('data-lightbox-prev\n            aria-label="上一张 (←)"'),
    'Lightbox top-bar must not have duplicate prev button (stage arrows handle navigation)'
  );

  // 2. Sidebar Navigation balanced layout & overflow protection
  assert.ok(
    headerContent.includes('overflow-y: hidden !important'),
    'Header.astro must enforce overflow-y: hidden on desktop to prevent accidental scrolling'
  );
  assert.ok(
    headerContent.includes('clamp(15.5rem, 20vw, 19rem)'),
    'Header.astro must use balanced, substantial sidebar width'
  );
  assert.ok(
    headerContent.includes('nav.scrollTop = 0') && headerContent.includes('requestAnimationFrame(resetScroll)'),
    'Header.astro must reset sidebar scrollTop to 0 on initial setup and navigation clicks'
  );
  assert.ok(
    baseLayoutContent.includes('sidebarNav.scrollTop = 0'),
    'BaseLayout.astro must reset sidebar scrollTop on swap and page load'
  );
  assert.ok(
    baseLayoutContent.includes("CustomEase.create('enter', 'M0,0 C0.16,1 0.3,1 1,1')"),
    'BaseLayout.astro must use smooth, natural glide ease rather than front-loaded snap'
  );
});

