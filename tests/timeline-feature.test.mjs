import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');

test('Timeline Markup: Structure, baseline fill, and year watermark', () => {
  const timelineContent = fs.readFileSync(path.join(rootDir, 'src/pages/timeline.astro'), 'utf-8');

  // 1. Stage and year watermark
  assert.ok(timelineContent.includes('class="timeline-stage" data-timeline'), 'Must have timeline stage');
  assert.ok(timelineContent.includes('data-timeline-year'), 'Must have dynamic year watermark');

  // 2. Viewport and baseline fill element
  assert.ok(timelineContent.includes('class="timeline-viewport" data-timeline-viewport'), 'Must have viewport');
  assert.ok(timelineContent.includes('class="timeline-track" data-timeline-track'), 'Must have track');
  assert.ok(timelineContent.includes('class="timeline-baseline" aria-hidden="true"'), 'Must have baseline');
  assert.ok(
    timelineContent.includes('data-timeline-baseline-fill'),
    'Must have data-timeline-baseline-fill element for mobile scroll progress'
  );

  // 3. Entries and cards
  assert.ok(timelineContent.includes('data-timeline-entry'), 'Entries must have data-timeline-entry');
  assert.ok(timelineContent.includes('data-year={entry.year}'), 'Entries must attach data-year attribute');
  assert.ok(timelineContent.includes('class="timeline-dot"'), 'Entries must have dot');
  assert.ok(timelineContent.includes('class="timeline-card"'), 'Entries must have card link');
  assert.ok(timelineContent.includes('class="timeline-end"'), 'Track must have timeline end seal');
});

test('Timeline Script: Desktop horizontal unroll and mobile vertical ScrollTrigger choreography', () => {
  const timelineContent = fs.readFileSync(path.join(rootDir, 'src/pages/timeline.astro'), 'utf-8');

  // 1. ScrollTrigger plugin and prefix
  assert.ok(timelineContent.includes('gsap.registerPlugin(ScrollTrigger)'), 'Must register ScrollTrigger plugin');
  assert.ok(timelineContent.includes("const TRIGGER_PREFIX = 'timeline:'"), 'Must use timeline trigger prefix');

  // 2. Mobile vertical choreography branch
  assert.ok(
    timelineContent.includes('!horizontal') && timelineContent.includes('mobile-baseline'),
    'Must implement mobile-baseline ScrollTrigger'
  );
  assert.ok(
    timelineContent.includes('mobile-entry-'),
    'Must create ScrollTrigger for mobile entries'
  );
  assert.ok(
    timelineContent.includes('updateMobileYear'),
    'Must provide dynamic year watermark updater on mobile'
  );
  assert.ok(
    timelineContent.includes("entry.classList.add('is-revealed')"),
    'Must mark revealed entries on mobile scroll'
  );
  assert.ok(
    timelineContent.includes("entry.classList.add('is-near')"),
    'Must toggle is-near for active reading window on mobile'
  );
  assert.ok(
    timelineContent.includes('mobile-end'),
    'Must create ScrollTrigger for timeline end seal on mobile'
  );

  // 3. Desktop horizontal unroll branch
  assert.ok(timelineContent.includes('horizontal'), 'Must handle desktop horizontal layout');
  assert.ok(timelineContent.includes('unroll'), 'Must create unroll tween for desktop');
  assert.ok(timelineContent.includes('pin: true'), 'Desktop unroll must pin stage');

  // 4. View Transitions and cleanup
  assert.ok(timelineContent.includes('__areSetTimelineCleanup__'), 'Must provide cleanup key');
  assert.ok(timelineContent.includes('controller.abort()'), 'Must abort controller on cleanup');
});

test('Timeline Styles: Global CSS supports both desktop horizontal and mobile vertical interactions', () => {
  const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf-8');

  // Desktop baseline & progress
  assert.ok(globalCss.includes('.timeline-baseline'), 'Must style timeline-baseline');
  assert.ok(globalCss.includes('.timeline-baseline-fill'), 'Must style timeline-baseline-fill');

  // Mobile media query rules
  assert.ok(
    globalCss.includes('@media (max-width: 1023px)'),
    'Must define responsive media query for narrow viewports'
  );
  assert.ok(
    globalCss.includes('.timeline-year') && globalCss.includes('position: sticky'),
    'Mobile timeline-year must be sticky'
  );
  assert.ok(
    globalCss.includes('.timeline-entry.is-near .timeline-dot'),
    'Mobile dot must bloom when is-near'
  );
  assert.ok(
    globalCss.includes('.timeline-entry.is-near .timeline-card'),
    'Mobile card must elevate and accent when is-near'
  );
  assert.ok(
    globalCss.includes('.timeline-entry.is-revealed .timeline-card'),
    'Mobile card must reveal smoothly when is-revealed'
  );
});
