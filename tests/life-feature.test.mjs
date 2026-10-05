import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  LIFE_CATEGORIES,
  LIFE_ITEMS,
  getAllLifeTags,
  getAllLifeCities,
} from '../src/data/life.ts';

const rootDir = path.resolve(import.meta.dirname, '..');

test('Life Data Integrity: Shenzhen Observatory and starter items', () => {
  const shenzhen = LIFE_ITEMS.find((i) => i.id === 'shenzhen-astronomical-observatory');
  assert.ok(shenzhen, 'Shenzhen Observatory item must exist');
  assert.strictEqual(shenzhen.title, '深圳天文台');
  assert.strictEqual(shenzhen.category, 'places');
  assert.strictEqual(shenzhen.categoryLabel, '推荐去处');
  assert.strictEqual(shenzhen.city, '深圳 · 大鹏半岛');
  assert.strictEqual(shenzhen.rating, 5);
  assert.ok(shenzhen.summary.includes('日出日落'), 'Summary must mention sunrise/sunset');
  assert.ok(shenzhen.summary.includes('星空'), 'Summary must mention stargazing');
  assert.ok(shenzhen.locationUrl && shenzhen.locationUrl.includes('amap.com'), 'Must have map link');
  assert.ok(Array.isArray(shenzhen.tips) && shenzhen.tips.length >= 3, 'Must have at least 3 tips');

  // Verify categories schema and user item
  const categories = new Set(LIFE_ITEMS.map((i) => i.category));
  assert.ok(categories.has('places'), 'Must have places');
  assert.strictEqual(LIFE_ITEMS.length, 1, 'Only genuine user-added item remains after removing placeholders');
});

test('Header Navigation contains /life with Life / 拾光 label', () => {
  const headerContent = fs.readFileSync(path.join(rootDir, 'src/components/Header.astro'), 'utf-8');
  assert.ok(
    headerContent.includes("{ label: 'Life', labelZh: 'Life / 拾光', href: '/life' }"),
    'Header.astro must contain /life navigation item'
  );
});

test('life.astro has complete animation coverage and attributes', () => {
  const lifeContent = fs.readFileSync(path.join(rootDir, 'src/pages/life.astro'), 'utf-8');

  // 1. Page enter choreography
  assert.ok(lifeContent.includes('data-enter="top"'), 'Eyebrow must have data-enter');
  assert.ok(lifeContent.includes('data-enter="left"'), 'Title must have data-enter');
  assert.ok(lifeContent.includes('data-enter="stamp"'), 'Stats block must have data-enter="stamp"');
  assert.ok(lifeContent.includes('data-enter="bottom"'), 'Tabs/Search must have data-enter');
  assert.ok(lifeContent.includes('data-enter={enterFrom}'), 'Cards must have data-enter attribute');

  // 2. Odometer number counter animation
  assert.ok(lifeContent.includes('data-count={allItems.length}'), 'Total count must have data-count');

  // 3. Lenis & Modal scroll coordination
  assert.ok(lifeContent.includes('data-lenis-prevent'), 'Modal backdrop & dialog must have data-lenis-prevent');
  assert.ok(lifeContent.includes('lenis.stop()'), 'Lenis must be paused when modal opens');
  assert.ok(lifeContent.includes('lenis.start()'), 'Lenis must be resumed when modal closes');
  assert.ok(lifeContent.includes('lenis.scrollTo'), 'Must use lenis.scrollTo for smooth anchor jump');

  // 4. Lifecycle management with ViewTransitions
  assert.ok(lifeContent.includes("document.addEventListener('astro:page-load', initLifePage)"), 'Must attach on astro:page-load');
  assert.ok(lifeContent.includes("document.addEventListener('astro:before-swap'"), 'Must clean up on astro:before-swap');
  assert.ok(lifeContent.includes('controller.abort()'), 'Must abort event listeners on cleanup');

  // 5. Spotlight highlight and ink splash interactions
  assert.ok(lifeContent.includes('is-spotlight'), 'Must include spotlight focus class');
  assert.ok(lifeContent.includes('__inkSplash'), 'Must trigger ink splash effects on actions');
  assert.ok(lifeContent.includes('life-dice-icon'), 'Must include dice animation target');
});

test('Search & Filtering algorithm handles edge cases without throwing', () => {
  function match(item, cat, tag, q) {
    const matchesCat = cat === 'all' || item.category === cat;
    const matchesTag = tag === 'all' || item.city === tag || item.tags.includes(tag);
    const text = `${item.title} ${item.city} ${item.categoryLabel} ${item.tags.join(' ')} ${item.summary} ${(item.tips || []).join(' ')}`.toLowerCase();
    const matchesQ = !q || text.includes(q.toLowerCase().trim());
    return matchesCat && matchesTag && matchesQ;
  }

  // Exact search
  const res1 = LIFE_ITEMS.filter((i) => match(i, 'places', 'all', '深圳天文台'));
  assert.strictEqual(res1.length, 1);
  assert.strictEqual(res1[0].id, 'shenzhen-astronomical-observatory');

  // Partial search in tips
  const res2 = LIFE_ITEMS.filter((i) => match(i, 'all', 'all', '西涌海滩'));
  assert.strictEqual(res2.length, 1);
  assert.strictEqual(res2[0].id, 'shenzhen-astronomical-observatory');

  // Tag filter
  const res3 = LIFE_ITEMS.filter((i) => match(i, 'all', '看星空', ''));
  assert.strictEqual(res3.length, 1);

  // Mismatch
  const res4 = LIFE_ITEMS.filter((i) => match(i, 'items', '深圳 · 大鹏半岛', ''));
  assert.strictEqual(res4.length, 0);
});
