import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIFE_CATEGORIES,
  LIFE_ITEMS,
  getAllLifeTags,
  getAllLifeCities,
} from '../src/data/life.ts';

test('LIFE_CATEGORIES contains all required category definitions', () => {
  const ids = LIFE_CATEGORIES.map((c) => c.id);
  assert.deepStrictEqual(ids, ['all', 'places', 'activities', 'items']);
  LIFE_CATEGORIES.forEach((c) => {
    assert.ok(c.name && c.name.length > 0, `Category ${c.id} must have a name`);
    assert.ok(c.icon && c.icon.length > 0, `Category ${c.id} must have an icon`);
    assert.ok(c.desc && c.desc.length > 0, `Category ${c.id} must have a description`);
  });
});

test('LIFE_ITEMS contains valid items conforming to schema', () => {
  assert.ok(LIFE_ITEMS.length > 0, 'Must have at least one item');

  const seenIds = new Set();
  LIFE_ITEMS.forEach((item) => {
    // Unique ID
    assert.ok(item.id && typeof item.id === 'string', 'Item must have valid string id');
    assert.ok(!seenIds.has(item.id), `Duplicate item id found: ${item.id}`);
    seenIds.add(item.id);

    // Title and city
    assert.ok(item.title && item.title.trim().length > 0, `Item ${item.id} must have title`);
    assert.ok(item.city && item.city.trim().length > 0, `Item ${item.id} must have city`);

    // Category
    assert.ok(
      ['places', 'activities', 'items'].includes(item.category),
      `Item ${item.id} has invalid category: ${item.category}`
    );

    // Rating
    assert.ok(
      Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5,
      `Item ${item.id} has invalid rating: ${item.rating}`
    );

    // Summary
    assert.ok(item.summary && item.summary.trim().length > 0, `Item ${item.id} must have summary`);

    // Tags
    assert.ok(Array.isArray(item.tags) && item.tags.length > 0, `Item ${item.id} must have tags array`);
    item.tags.forEach((tag) => {
      assert.ok(typeof tag === 'string' && tag.length > 0, `Tag must be non-empty string in ${item.id}`);
    });

    // Optional fields if present
    if (item.tips) {
      assert.ok(Array.isArray(item.tips), `Tips in ${item.id} must be array`);
      item.tips.forEach((tip) => {
        assert.ok(typeof tip === 'string' && tip.length > 0, `Tip must be non-empty string in ${item.id}`);
      });
    }

    if (item.locationUrl) {
      assert.ok(item.locationUrl.startsWith('http'), `LocationUrl in ${item.id} must be valid URL`);
    }
  });
});

test('getAllLifeTags and getAllLifeCities return unique, non-empty values', () => {
  const tags = getAllLifeTags();
  assert.ok(tags.length > 0);
  const tagSet = new Set(tags);
  assert.strictEqual(tags.length, tagSet.size, 'Tags list must not contain duplicates');

  const cities = getAllLifeCities();
  assert.ok(cities.length > 0);
  const citySet = new Set(cities);
  assert.strictEqual(cities.length, citySet.size, 'Cities list must not contain duplicates');
});

test('life filtering and search matching logic works accurately', () => {
  // Test matching logic as used in life.astro
  function matchItem(item, category, tag, query) {
    const matchesCategory = category === 'all' || item.category === category;
    const matchesTag =
      tag === 'all' || item.city === tag || item.tags.includes(tag);
    const searchText = `${item.title} ${item.city} ${item.categoryLabel} ${item.tags.join(' ')} ${item.summary} ${(item.tips || []).join(' ')}`.toLowerCase();
    const matchesSearch = !query || searchText.includes(query.toLowerCase().trim());
    return matchesCategory && matchesTag && matchesSearch;
  }

  // All match
  const allMatches = LIFE_ITEMS.filter((i) => matchItem(i, 'all', 'all', ''));
  assert.strictEqual(allMatches.length, LIFE_ITEMS.length);

  // Category filter: places
  const places = LIFE_ITEMS.filter((i) => matchItem(i, 'places', 'all', ''));
  assert.ok(places.length > 0);
  places.forEach((p) => assert.strictEqual(p.category, 'places'));

  // Tag filter: first available tag
  const firstTag = getAllLifeTags()[0];
  const tagFiltered = LIFE_ITEMS.filter((i) => matchItem(i, 'all', firstTag, ''));
  assert.ok(tagFiltered.length > 0);
  tagFiltered.forEach((item) => {
    assert.ok(item.tags.includes(firstTag) || item.city === firstTag);
  });

  // Search filter
  const observatoryMatches = LIFE_ITEMS.filter((i) => matchItem(i, 'all', 'all', '天文台'));
  assert.ok(observatoryMatches.length >= 1);
  assert.strictEqual(observatoryMatches[0].id, 'shenzhen-astronomical-observatory');

  // Non-matching query returns empty array
  const noMatches = LIFE_ITEMS.filter((i) => matchItem(i, 'all', 'all', 'xyz999nonexistentquery'));
  assert.strictEqual(noMatches.length, 0);

  // Whitespace-only query should be treated as empty and match all
  const whitespaceMatches = LIFE_ITEMS.filter((i) => matchItem(i, 'all', 'all', '   '));
  assert.strictEqual(whitespaceMatches.length, LIFE_ITEMS.length);
});

test('filter partition logic cleanly separates leaving, arriving, and persisting cards', () => {
  // Mock card objects with id and filteredOut flag across multiple categories
  const sampleItems = [
    { id: 'item-1', category: 'places' },
    { id: 'item-2', category: 'activities' },
    { id: 'item-3', category: 'places' },
    { id: 'item-4', category: 'reading' },
  ];
  const mockCards = sampleItems.map((item) => ({
    id: item.id,
    category: item.category,
    filteredOut: false, // Initially all visible
  }));

  function partition(cards, targetCategory) {
    const leaving = [];
    const arriving = [];
    const persisting = [];

    cards.forEach((card) => {
      const matches = targetCategory === 'all' || card.category === targetCategory;
      if (matches) {
        if (card.filteredOut) {
          arriving.push(card);
        } else {
          persisting.push(card);
        }
      } else {
        if (!card.filteredOut) {
          leaving.push(card);
        }
      }
    });

    return { leaving, arriving, persisting };
  }

  // 1. Initial filter to 'places'
  const p1 = partition(mockCards, 'places');
  assert.strictEqual(p1.arriving.length, 0, 'No cards arriving when starting from all visible');
  assert.ok(p1.persisting.length > 0, 'Matching places should persist');
  assert.ok(p1.leaving.length > 0, 'Non-places should be marked leaving');
  assert.strictEqual(p1.persisting.length + p1.leaving.length, mockCards.length);

  // Apply state change for leaving cards
  p1.leaving.forEach((c) => { c.filteredOut = true; });

  // 2. Switch filter to 'activities'
  const p2 = partition(mockCards, 'activities');
  assert.ok(p2.arriving.length > 0, 'Activities should be arriving');
  assert.strictEqual(p2.persisting.length, 0, 'No activities were visible previously');
  assert.strictEqual(p2.leaving.length, p1.persisting.length, 'All previously visible places should leave');

  // Apply state change
  p2.leaving.forEach((c) => { c.filteredOut = true; });
  p2.arriving.forEach((c) => { c.filteredOut = false; });

  // 3. Switch back to 'all'
  const p3 = partition(mockCards, 'all');
  assert.strictEqual(p3.leaving.length, 0, 'No cards should leave when switching to all');
  assert.strictEqual(p3.persisting.length, p2.arriving.length, 'Current activities should persist without reload');
  assert.strictEqual(p3.persisting.length + p3.arriving.length, mockCards.length, 'All items accounted for');
});

test('lottery candidate selection avoids immediate consecutive duplicates when pool > 1', () => {
  const pool = [
    { id: 'c1', title: 'Candidate 1' },
    { id: 'c2', title: 'Candidate 2' },
    { id: 'c3', title: 'Candidate 3' },
  ];
  assert.ok(pool.length >= 2);

  let currentCard = pool[0];

  // Run 30 simulated rerolls and ensure no immediate consecutive duplicates
  for (let i = 0; i < 30; i++) {
    const eligible = pool.length > 1 && currentCard ? pool.filter((c) => c !== currentCard) : pool;
    assert.strictEqual(eligible.length, pool.length - 1);
    assert.ok(!eligible.includes(currentCard));

    const picked = eligible[Math.floor(Math.random() * eligible.length)];
    assert.notStrictEqual(picked.id, currentCard.id);
    currentCard = picked;
  }

  // When pool has only 1 item, eligible falls back to single item gracefully
  const singlePool = [LIFE_ITEMS[0]];
  const singleEligible = singlePool.length > 1 && singlePool[0] ? singlePool.filter((c) => c !== singlePool[0]) : singlePool;
  assert.strictEqual(singleEligible.length, 1);
  assert.strictEqual(singleEligible[0], LIFE_ITEMS[0]);
});

