import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DOCK_PATH = path.join(ROOT, 'src', 'components', 'ArticleSelectionDock.astro');
const ENGINE_PATH = path.join(ROOT, 'src', 'utils', 'articleHighlightEngine.ts');

test('1. ArticleSelectionDock: Mounts hover tooltip DOM elements with semantic attributes', () => {
  const content = fs.readFileSync(DOCK_PATH, 'utf8');

  assert.ok(content.includes('id="article-note-hover-tooltip"'), 'Must contain article-note-hover-tooltip element');
  assert.ok(content.includes('id="note-hover-tooltip-content"'), 'Must contain note-hover-tooltip-content for rich markdown');
  assert.ok(content.includes('id="note-hover-tooltip-arrow"'), 'Must contain note-hover-tooltip-arrow');
  assert.ok(content.includes('role="tooltip"'), 'Must have role=tooltip for accessibility');
});

test('2. ArticleSelectionDock: Enforces exact 1000ms (1s) hover threshold for notes with comments', () => {
  const content = fs.readFileSync(DOCK_PATH, 'utf8');

  assert.match(content, /HOVER_DELAY\s*=\s*1000/, 'Must define 1000ms hover delay');
  assert.match(content, /record\.comment\?\.trim\(\)/, 'Must strictly check whether highlight has non-empty comment');
  assert.match(content, /window\.setTimeout\(\(\)\s*=>\s*\{\s*showHoverTooltip\(mark,\s*record\);\s*\},\s*HOVER_DELAY\)/, 'Must trigger showHoverTooltip after HOVER_DELAY');
});

test('3. ArticleSelectionDock: Cancels hover timer immediately upon premature mouseout or empty comments', () => {
  const content = fs.readFileSync(DOCK_PATH, 'utf8');

  assert.ok(content.includes('cancelHoverTimer()'), 'Must contain cancelHoverTimer function');
  assert.match(content, /prose\.addEventListener\('mouseout'/, 'Must listen to prose mouseout');
  assert.match(content, /scheduleHideTooltip/, 'Must schedule hide tooltip when cursor leaves mark');
});

test('4. ArticleSelectionDock: Tooltip dismisses on window scroll, resize, dock opening, or drawer opening', () => {
  const content = fs.readFileSync(DOCK_PATH, 'utf8');

  assert.match(content, /window\.addEventListener\('scroll',\s*\(\)\s*=>\s*\{[\s\S]*?hideHoverTooltip\(true\)/, 'Must hide tooltip on scroll');
  assert.match(content, /window\.addEventListener\('resize',\s*\(\)\s*=>\s*\{[\s\S]*?hideHoverTooltip\(true\)/, 'Must hide tooltip on resize');
  assert.match(content, /function showDock[\s\S]*?hideHoverTooltip\(true\)/, 'Must hide tooltip when selection dock opens');
  assert.match(content, /function openNotesDrawer[\s\S]*?hideHoverTooltip\(true\)/, 'Must hide tooltip when notes drawer opens');
});

test('5. Styling & Visuals: Subtle dotted ink annotation spine on marks and paper card styling', () => {
  const content = fs.readFileSync(DOCK_PATH, 'utf8');

  assert.ok(content.includes('mark.article-highlight-mark.has-note-comment'), 'Must style marks with comments');
  assert.ok(content.includes('cursor: help'), 'Must display help cursor for marks with comments');
  assert.ok(content.includes('.note-hover-tooltip-card'), 'Must provide paper card styling');
  assert.ok(content.includes('.note-hover-tooltip-arrow'), 'Must provide arrow indicator styling');
  assert.ok(content.includes('[data-theme="dark"] .note-hover-tooltip-card'), 'Must support dark theme');
});

test('6. articleHighlightEngine: Marks with comments automatically receive has-note-comment class', () => {
  const engineContent = fs.readFileSync(ENGINE_PATH, 'utf8');

  assert.match(engineContent, /if\s*\(record\.comment\?\.trim\(\)\)\s*mark\.classList\.add\('has-note-comment'\)/, 'Must tag marks with has-note-comment when comment exists');
});
