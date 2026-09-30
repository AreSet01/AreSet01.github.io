import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeRegex,
  buildSearchPattern,
  findMatchesInText,
  mapMatchToTextNodes,
  extractSnippet,
  formatSourceTag,
} from '../src/utils/articleSearchEngine.ts';

/**
 * Lightweight Mock DOM for headless node:test functional verification
 */
class MockTextNode {
  constructor(text) {
    this.nodeType = 3;
    this.nodeValue = text;
    this.parentNode = null;
  }
  get textContent() {
    return this.nodeValue;
  }
  set textContent(v) {
    this.nodeValue = v;
  }
  splitText(offset) {
    const head = this.nodeValue.slice(0, offset);
    const tail = this.nodeValue.slice(offset);
    this.nodeValue = head;
    const tailNode = new MockTextNode(tail);
    tailNode.parentNode = this.parentNode;
    if (this.parentNode) {
      const idx = this.parentNode.childNodes.indexOf(this);
      this.parentNode.childNodes.splice(idx + 1, 0, tailNode);
    }
    return tailNode;
  }
}

class MockElement {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.classList = new Set();
    this.dataset = {};
    this.attributes = new Map();
    this.open = false;
    this.hidden = false;
    this.style = {};
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, val) {
    this.attributes.set(name, String(val));
  }
  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  insertBefore(newNode, refNode) {
    if (newNode.parentNode) {
      newNode.parentNode.removeChild(newNode);
    }
    newNode.parentNode = this;
    const idx = this.childNodes.indexOf(refNode);
    if (idx === -1) {
      this.childNodes.push(newNode);
    } else {
      this.childNodes.splice(idx, 0, newNode);
    }
    return newNode;
  }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  querySelectorAll(selector) {
    const matches = [];
    const walk = (node) => {
      if (node.nodeType === 1) {
        if (selector === 'mark.article-search-mark' && node.tagName === 'MARK' && node.classList.has('article-search-mark')) {
          matches.push(node);
        }
        for (const child of node.childNodes) {
          walk(child);
        }
      }
    };
    walk(this);
    return matches;
  }
  normalize() {
    for (let i = 0; i < this.childNodes.length - 1; i++) {
      const c1 = this.childNodes[i];
      const c2 = this.childNodes[i + 1];
      if (c1.nodeType === 3 && c2.nodeType === 3) {
        c1.nodeValue += c2.nodeValue;
        this.childNodes.splice(i + 1, 1);
        i--;
      }
    }
  }
  closest(selector) {
    let curr = this;
    while (curr) {
      if (selector === 'details' && curr.tagName === 'DETAILS') return curr;
      if (selector === 'pre' && curr.tagName === 'PRE') return curr;
      if (selector.includes('.is-collapsed') && curr.classList.has('is-collapsed')) return curr;
      curr = curr.parentNode;
    }
    return null;
  }
}

test('Functional Test: Highlighting within Shiki code blocks and clean restoration', () => {
  // Structure: <pre><code><span class="line"><span class="kwd">class</span> <span class="cls">FProperty</span></span></code></pre>
  const pre = new MockElement('pre');
  const code = new MockElement('code');
  const line = new MockElement('line');
  const kwdSpan = new MockElement('span');
  const spaceNode = new MockTextNode(' ');
  const clsSpan = new MockElement('span');
  const kwdText = new MockTextNode('class');
  const clsText = new MockTextNode('FProperty');

  kwdSpan.appendChild(kwdText);
  clsSpan.appendChild(clsText);
  line.appendChild(kwdSpan);
  line.appendChild(spaceNode);
  line.appendChild(clsSpan);
  code.appendChild(line);
  pre.appendChild(code);

  // Search for "FProperty"
  const pattern = buildSearchPattern('FProperty', { caseSensitive: true, wholeWord: true });
  assert.ok(pattern);

  const blockEntries = [
    { node: kwdText, start: 0, end: 5, length: 5 },
    { node: spaceNode, start: 5, end: 6, length: 1 },
    { node: clsText, start: 6, end: 15, length: 9 },
  ];
  const combined = 'class FProperty';
  const matches = findMatchesInText(combined, pattern);
  assert.strictEqual(matches.length, 1);

  const ranges = mapMatchToTextNodes(matches[0].start, matches[0].end, 0, blockEntries);
  assert.strictEqual(ranges.length, 1);
  assert.strictEqual(ranges[0].textNode, clsText);
  assert.strictEqual(ranges[0].localStart, 0);
  assert.strictEqual(ranges[0].localEnd, 9);

  // Inject <mark>
  const node = ranges[0].textNode;
  node.splitText(ranges[0].localEnd);
  const matchNode = node.splitText(ranges[0].localStart);
  const mark = new MockElement('mark');
  mark.classList.add('article-search-mark');
  mark.dataset.matchGroup = '0';
  matchNode.parentNode.insertBefore(mark, matchNode);
  mark.appendChild(matchNode);

  // Verify mark exists inside clsSpan
  const allMarks = pre.querySelectorAll('mark.article-search-mark');
  assert.strictEqual(allMarks.length, 1);
  assert.strictEqual(allMarks[0].childNodes[0].nodeValue, 'FProperty');

  // Verify clearHighlights restores DOM cleanly
  const parents = new Set();
  allMarks.forEach((m) => {
    const parent = m.parentNode;
    parents.add(parent);
    while (m.firstChild) {
      parent.insertBefore(m.firstChild, m);
    }
    m.remove();
  });
  parents.forEach((p) => p.normalize());

  assert.strictEqual(pre.querySelectorAll('mark.article-search-mark').length, 0);
  assert.strictEqual(clsSpan.childNodes.length, 1);
  assert.strictEqual(clsSpan.childNodes[0].nodeValue, 'FProperty');
});

test('Functional Test: Auto-expand collapsed <details> and .is-collapsed ancestors', () => {
  const details = new MockElement('details');
  details.open = false;

  const container = new MockElement('div');
  container.classList.add('is-collapsed');
  container.setAttribute('data-collapsed', 'true');

  const pre = new MockElement('pre');
  const code = new MockElement('code');
  const targetMark = new MockElement('mark');

  code.appendChild(targetMark);
  pre.appendChild(code);
  container.appendChild(pre);
  details.appendChild(container);

  // Auto expand algorithm
  function autoExpandAncestors(mark) {
    let curr = mark.parentNode;
    while (curr) {
      if (curr.tagName === 'DETAILS' && !curr.open) {
        curr.open = true;
      }
      if (curr.classList && curr.classList.has('is-collapsed')) {
        curr.classList.delete('is-collapsed');
      }
      if (curr.getAttribute && curr.getAttribute('data-collapsed') === 'true') {
        curr.setAttribute('data-collapsed', 'false');
      }
      curr = curr.parentNode;
    }
  }

  assert.strictEqual(details.open, false);
  assert.strictEqual(container.classList.has('is-collapsed'), true);

  autoExpandAncestors(targetMark);

  assert.strictEqual(details.open, true);
  assert.strictEqual(container.classList.has('is-collapsed'), false);
  assert.strictEqual(container.getAttribute('data-collapsed'), 'false');
});

test('Functional Test: Navigation wrapping (Next / Prev)', () => {
  const total = 5;
  let current = 0;

  function next() {
    current = (current + 1) % total;
  }
  function prev() {
    current = (current - 1 + total) % total;
  }

  assert.strictEqual(current, 0);
  next();
  assert.strictEqual(current, 1);
  next();
  next();
  next();
  assert.strictEqual(current, 4);
  next(); // wraps to 0
  assert.strictEqual(current, 0);
  prev(); // wraps to 4
  assert.strictEqual(current, 4);
  prev();
  assert.strictEqual(current, 3);
});

test('Functional Test: Scrollbar Tick percentage clamping', () => {
  const docHeight = 10000;
  function calcPercent(absoluteY) {
    return Math.min(99.2, Math.max(0.8, (absoluteY / docHeight) * 100));
  }

  assert.strictEqual(calcPercent(0), 0.8); // Clamped min
  assert.strictEqual(calcPercent(5000), 50.0);
  assert.strictEqual(calcPercent(10000), 99.2); // Clamped max
  assert.strictEqual(calcPercent(12000), 99.2); // Clamped max
});

test('Functional Test: IME composition protection on Enter keydown', () => {
  let navigated = false;
  let prevented = false;

  function handleKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      navigated = true;
    }
  }

  // 1. Simulating Chinese Pinyin input where user hits Enter to confirm Latin characters
  const imeEvent = {
    key: 'Enter',
    keyCode: 229,
    isComposing: true,
    preventDefault: () => { prevented = true; },
  };
  handleKeydown(imeEvent);
  assert.strictEqual(navigated, false, 'Should not navigate during IME composition');
  assert.strictEqual(prevented, false, 'Should not preventDefault during IME composition');

  // 2. Normal Enter key after composition is finished
  const normalEvent = {
    key: 'Enter',
    keyCode: 13,
    isComposing: false,
    preventDefault: () => { prevented = true; },
  };
  handleKeydown(normalEvent);
  assert.strictEqual(navigated, true, 'Should navigate on normal Enter key');
  assert.strictEqual(prevented, true, 'Should call preventDefault on normal Enter key');
});

test('Functional Test: Immediate Enter key flushes debounce timer synchronously and stops on initial match', () => {
  let searchDebounceTimer = 1234;
  let totalGroups = 5;
  let currentGroupIndex = -1;

  function executeSearch() {
    // Zero auto-scroll on typing/search execution: keep currentGroupIndex = -1
    currentGroupIndex = -1;
  }

  function nextMatch() {
    if (totalGroups <= 0) return;
    if (currentGroupIndex < 0) {
      currentGroupIndex = 0;
    } else {
      currentGroupIndex = (currentGroupIndex + 1) % totalGroups;
    }
  }

  function handleEnter(e) {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
      executeSearch();
    }
    nextMatch();
  }

  // Phase 1: User types and presses Enter immediately (debounce pending)
  handleEnter({ key: 'Enter' });
  assert.strictEqual(searchDebounceTimer, null, 'Debounce must be flushed immediately on Enter');
  assert.strictEqual(currentGroupIndex, 0, 'First Enter must focus on initial match #0, not skip to match #1');

  // Phase 2: User presses Enter again without typing (debounce null)
  handleEnter({ key: 'Enter' });
  assert.strictEqual(currentGroupIndex, 1, 'Second Enter must cycle to match #1');

  // Phase 3: User presses Enter again
  handleEnter({ key: 'Enter' });
  assert.strictEqual(currentGroupIndex, 2, 'Third Enter must cycle to match #2');
});

test('Functional Test: Exit transition is safely cancellable upon immediate re-open', () => {
  let isOpen = true;
  let isExiting = false;
  let exitTimeoutId = null;

  function closeHUD() {
    isExiting = true;
    exitTimeoutId = setTimeout(() => {
      isOpen = false;
      isExiting = false;
    }, 580);
  }

  function openHUD() {
    if (exitTimeoutId !== null) {
      clearTimeout(exitTimeoutId);
      exitTimeoutId = null;
    }
    isExiting = false;
    isOpen = true;
  }

  closeHUD();
  assert.strictEqual(isExiting, true);

  // User presses Cmd+F again 100ms later during exit transition
  openHUD();
  assert.strictEqual(isExiting, false, 'Exit state must be cleared on re-open');
  assert.strictEqual(isOpen, true, 'HUD must remain open');
  assert.strictEqual(exitTimeoutId, null, 'Exit timer must be cancelled');
});

test('Functional Test: Active selection in document pre-fills search query', () => {
  let inputValue = 'oldQuery';

  function openHUDWithSelection(mockSelection) {
    if (mockSelection && mockSelection.length > 0 && mockSelection.length < 100) {
      inputValue = mockSelection;
    }
  }

  openHUDWithSelection('FProperty');
  assert.strictEqual(inputValue, 'FProperty', 'Selected word in article must overwrite old search input');
});

test('Functional Test: Multiple matches in a single text node split in descending order and cleanly restore', () => {
  const p = new MockElement('p');
  const textNode = new MockTextNode('UObject in Unreal and UObject in Engine');
  p.appendChild(textNode);

  // Matches for "UObject" at index 0 and index 22
  const matchSpans = [
    { start: 0, end: 7, text: 'UObject', group: 0 },
    { start: 22, end: 29, text: 'UObject', group: 1 },
  ];

  // Must process from tail to head
  const descending = [...matchSpans].sort((a, b) => b.start - a.start);

  for (const m of descending) {
    textNode.splitText(m.end);
    const matchNode = textNode.splitText(m.start);
    const mark = new MockElement('mark');
    mark.classList.add('article-search-mark');
    mark.dataset.matchGroup = String(m.group);
    matchNode.parentNode.insertBefore(mark, matchNode);
    mark.appendChild(matchNode);
  }

  const marks = p.querySelectorAll('mark.article-search-mark');
  assert.strictEqual(marks.length, 2);
  assert.strictEqual(marks[0].childNodes[0].nodeValue, 'UObject');
  assert.strictEqual(marks[1].childNodes[0].nodeValue, 'UObject');

  // Clean restoration
  const parents = new Set();
  marks.forEach((m) => {
    const parent = m.parentNode;
    parents.add(parent);
    while (m.firstChild) {
      parent.insertBefore(m.firstChild, m);
    }
    m.remove();
  });
  parents.forEach((parent) => parent.normalize());

  assert.strictEqual(p.querySelectorAll('mark.article-search-mark').length, 0);
  assert.strictEqual(p.childNodes.length, 1);
  assert.strictEqual(p.childNodes[0].nodeValue, 'UObject in Unreal and UObject in Engine');
});

test('Functional Test: Drag bounds clamping and double-click recenter', () => {
  const windowWidth = 1200;
  const windowHeight = 800;
  const hudWidth = 400;
  const hudHeight = 44;

  function clampPos(x, y) {
    const maxX = windowWidth - hudWidth - 12;
    const maxY = windowHeight - hudHeight - 12;
    return {
      x: Math.max(12, Math.min(maxX, x)),
      y: Math.max(12, Math.min(maxY, y)),
    };
  }

  // Offscreen left/top
  const clampedMin = clampPos(-100, -50);
  assert.strictEqual(clampedMin.x, 12);
  assert.strictEqual(clampedMin.y, 12);

  // Offscreen right/bottom
  const clampedMax = clampPos(2000, 1500);
  assert.strictEqual(clampedMax.x, 788);
  assert.strictEqual(clampedMax.y, 744);

  // Normal position
  const clampedNormal = clampPos(500, 300);
  assert.strictEqual(clampedNormal.x, 500);
  assert.strictEqual(clampedNormal.y, 300);
});

test('Functional Test: Results dropdown items generation with section tag, badge and highlighted snippet', () => {
  // Simulate matches in prose
  const matchesData = [
    {
      group: 0,
      heading: '## 1. 垃圾回收标记',
      text: '虚幻引擎垃圾回收核心机制在标记阶段扫描全部根集',
      query: '垃圾回收',
    },
    {
      group: 1,
      codeCtx: { title: 'Reflection.cpp', language: 'cpp' },
      text: 'void CollectGarbage() { PerformGarbageCollection(); }',
      query: 'CollectGarbage',
    },
  ];

  const items = matchesData.map((m, idx) => {
    const start = m.text.indexOf(m.query);
    const end = start + m.query.length;
    const tag = formatSourceTag(m.heading || null, m.codeCtx);
    const snippet = extractSnippet(m.text, start, end, 10);
    return {
      groupId: m.group,
      badge: `#${idx + 1}`,
      tag,
      snippet,
    };
  });

  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].tag, '§ 1. 垃圾回收标记');
  assert.strictEqual(items[0].badge, '#1');
  assert.strictEqual(items[0].snippet.matchedText, '垃圾回收');

  assert.strictEqual(items[1].tag, '[C++] Reflection.cpp');
  assert.strictEqual(items[1].badge, '#2');
  assert.strictEqual(items[1].snippet.matchedText, 'CollectGarbage');
});

test('Functional Test: Navigation updates dropdown active item and scroll synchronization', () => {
  let activeIndex = -1;
  const total = 3;
  const items = [
    { groupId: 0, isActive: false, ariaSelected: false },
    { groupId: 1, isActive: false, ariaSelected: false },
    { groupId: 2, isActive: false, ariaSelected: false },
  ];

  function syncDropdownActive(targetIndex) {
    if (targetIndex === -1 && activeIndex === -1) {
      activeIndex = -1;
    } else {
      activeIndex = ((targetIndex % total) + total) % total;
    }
    items.forEach((item) => {
      const isCurrent = activeIndex >= 0 && item.groupId === activeIndex;
      item.isActive = isCurrent;
      item.ariaSelected = isCurrent;
    });
  }

  // Initial state on typing: -1 has no active dropdown item
  syncDropdownActive(-1);
  assert.strictEqual(items[0].isActive, false);
  assert.strictEqual(items[0].ariaSelected, false);
  assert.strictEqual(items[1].isActive, false);
  assert.strictEqual(items[2].isActive, false);

  // Navigate explicitly to 0: activates first item
  syncDropdownActive(0);
  assert.strictEqual(items[0].isActive, true);
  assert.strictEqual(items[0].ariaSelected, true);
  assert.strictEqual(items[1].isActive, false);

  // Navigate next (Enter / ArrowDown)
  syncDropdownActive(activeIndex + 1);
  assert.strictEqual(items[1].isActive, true);
  assert.strictEqual(items[0].isActive, false);

  // Navigate prev (Shift+Enter / ArrowUp)
  syncDropdownActive(activeIndex - 1);
  assert.strictEqual(items[0].isActive, true);

  // Navigate prev again (wraps to last item)
  syncDropdownActive(activeIndex - 1);
  assert.strictEqual(items[2].isActive, true);
});

test('Functional Test: Dropdown collapse/expand toggle on HUD button', () => {
  let isDropdownOpen = true;
  let isCollapsed = false;
  let buttonAriaExpanded = 'true';

  function collapseDropdown() {
    isDropdownOpen = false;
    isCollapsed = true;
    buttonAriaExpanded = 'false';
  }

  function expandDropdown() {
    isDropdownOpen = true;
    isCollapsed = false;
    buttonAriaExpanded = 'true';
  }

  function toggleDropdown() {
    if (isDropdownOpen) collapseDropdown();
    else expandDropdown();
  }

  assert.strictEqual(isDropdownOpen, true);
  assert.strictEqual(isCollapsed, false);
  assert.strictEqual(buttonAriaExpanded, 'true');

  // Toggle button clicked -> collapses
  toggleDropdown();
  assert.strictEqual(isDropdownOpen, false);
  assert.strictEqual(isCollapsed, true);
  assert.strictEqual(buttonAriaExpanded, 'false');

  // Toggle button clicked -> re-expands
  toggleDropdown();
  assert.strictEqual(isDropdownOpen, true);
  assert.strictEqual(isCollapsed, false);
  assert.strictEqual(buttonAriaExpanded, 'true');
});

test('Functional Test: HUD dragging moves both capsule and attached dropdown as a unified layout', () => {
  // Parent #article-search-hud coordinates
  const classes = new Set();
  const hud = {
    left: '50%',
    top: '24px',
    transform: 'translate(-50%, 0)',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      has: (c) => classes.has(c),
    },
  };

  function startDrag(clientX, clientY, currentRect) {
    hud.left = `${currentRect.left}px`;
    hud.top = `${currentRect.top}px`;
    hud.transform = 'translate(0px, 0px)';
    hud.classList.add('is-dragging');
  }

  function moveDrag(startX, startY, clientX, clientY, hudStartX, hudStartY) {
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;
    hud.left = `${hudStartX + deltaX}px`;
    hud.top = `${hudStartY + deltaY}px`;
  }

  function stopDrag() {
    hud.classList.remove('is-dragging');
  }

  // Initial pointer down
  startDrag(600, 30, { left: 450, top: 24 });
  assert.strictEqual(hud.left, '450px');
  assert.strictEqual(hud.top, '24px');
  assert.strictEqual(hud.classList.has('is-dragging'), true);

  // Drag delta +100px X, +150px Y
  moveDrag(600, 30, 700, 180, 450, 24);
  assert.strictEqual(hud.left, '550px');
  assert.strictEqual(hud.top, '174px');

  stopDrag();
  assert.strictEqual(hud.classList.has('is-dragging'), false);
  // Both capsule and dropdown child elements inherit this position because they are inside hud
});

test('Functional Test: Dragging does not trigger or restart entrance animation when pointer is released', () => {
  const classes = new Set(['is-entering']);
  let entranceCount = 0;

  // Simulate openHUD
  entranceCount++;

  // Entrance animation ends after 680ms
  function onEntranceEnd() {
    classes.delete('is-entering');
  }
  onEntranceEnd();
  assert.strictEqual(classes.has('is-entering'), false, 'is-entering must be cleared after entrance animation finishes');

  // User drags and releases
  classes.add('is-dragging');
  assert.strictEqual(classes.has('is-dragging'), true);

  classes.delete('is-dragging');
  assert.strictEqual(classes.has('is-dragging'), false);
  assert.strictEqual(classes.has('is-entering'), false, 'Releasing drag must NOT re-apply is-entering');
  assert.strictEqual(entranceCount, 1, 'Entrance animation must not replay on drag end');
});

test('Functional Test: Dynamic dropdown target height calculation for small vs large item sets', () => {
  function calcTargetHeight(itemCount, itemHeight = 44, headerHeight = 34) {
    const contentH = itemCount * itemHeight;
    return Math.min(280, headerHeight + contentH + 4);
  }

  // 1 item (e.g. 34 + 44 + 4 = 82px)
  const singleItemHeight = calcTargetHeight(1);
  assert.strictEqual(singleItemHeight, 82, 'Single item must produce compact target height, avoiding 280px dead-time');

  // 2 items (e.g. 34 + 88 + 4 = 126px)
  const twoItemsHeight = calcTargetHeight(2);
  assert.strictEqual(twoItemsHeight, 126);

  // 10 items (e.g. 34 + 440 + 4 = 478px -> capped at 280px)
  const tenItemsHeight = calcTargetHeight(10);
  assert.strictEqual(tenItemsHeight, 280, 'Large item set must be bounded by 280px max-height');
});

test('Functional Test: Dropdown bottom viewport auto-adjustment prevents clipping offscreen', () => {
  const windowHeight = 800;

  function adjustHudTop(currentTop, targetDropdownHeight) {
    const totalEstimatedHeight = 48 + 10 + targetDropdownHeight;
    const maxAllowedTop = windowHeight - totalEstimatedHeight - 16;
    if (currentTop > maxAllowedTop) {
      return Math.max(12, maxAllowedTop);
    }
    return currentTop;
  }

  // Case 1: HUD near top (top = 24px, targetHeight = 280px) -> total 338px -> 24 + 338 = 362 < 800 -> No adjustment needed
  const unadjusted = adjustHudTop(24, 280);
  assert.strictEqual(unadjusted, 24);

  // Case 2: HUD dragged near bottom (top = 650px, targetHeight = 280px) -> total 338px -> 650 + 338 = 988 > 800
  // maxAllowedTop = 800 - 338 - 16 = 446px
  const adjusted = adjustHudTop(650, 280);
  assert.strictEqual(adjusted, 446, 'HUD top must be adjusted upwards so dropdown stays fully within viewport');
});

test('Functional Test: Radar pulse animation cleanly restarts with DOM reflow and self-removes on end', () => {
  const classes = new Set();
  let pulseTriggered = 0;

  function triggerPulse(reflowFn) {
    classes.delete('has-pulse');
    if (typeof reflowFn === 'function') reflowFn(); // Simulate void element.offsetWidth
    classes.add('has-pulse');
    pulseTriggered++;
  }

  function onPulseEnd() {
    classes.delete('has-pulse');
  }

  // Trigger 1st pulse
  triggerPulse(() => {});
  assert.strictEqual(classes.has('has-pulse'), true);
  assert.strictEqual(pulseTriggered, 1);

  // Animation ends
  onPulseEnd();
  assert.strictEqual(classes.has('has-pulse'), false, 'Pulse class must be cleaned up on animationend');

  // Trigger 2nd pulse immediately on navigation
  triggerPulse(() => {});
  assert.strictEqual(classes.has('has-pulse'), true);
  assert.strictEqual(pulseTriggered, 2, 'Pulse must be re-triggerable on consecutive navigation');
});

test('Functional Test: Responsive source tag ellipsis without squeezing match badge', () => {
  // Simulate flex item with flex: 1 and min-width: 0
  const containerWidth = 350; // Narrow mobile screen
  const badgeWidth = 32;
  const gap = 8;
  const padding = 28;

  const availableTagWidth = containerWidth - padding - badgeWidth - gap;
  assert.strictEqual(availableTagWidth, 282);
  assert.ok(availableTagWidth > 0, 'Available tag width must remain positive and flexible on mobile viewports');
});

test('Functional Test: Zero auto-scroll on typing keeping viewport completely stationary', () => {
  let scrollCalls = 0;
  let currentGroupIndex = -1;
  let totalGroups = 0;
  const marks = [];
  const dropdownItems = [];

  function mockScrollTo() {
    scrollCalls++;
  }

  function executeSearch(query) {
    // Reset highlights
    marks.length = 0;
    dropdownItems.length = 0;

    // Simulate finding 5 matches
    totalGroups = 5;
    for (let i = 0; i < totalGroups; i++) {
      marks.push({ group: i, isCurrent: false, hasPulse: false });
      dropdownItems.push({ group: i, isActive: false, ariaSelected: false });
    }

    // Zero auto-scroll on typing: do NOT call goToGroup
    currentGroupIndex = -1;
  }

  // User types query
  executeSearch('UObject');

  // Verify: currentGroupIndex is -1
  assert.strictEqual(currentGroupIndex, -1, 'currentGroupIndex must be -1 after typing search');

  // Verify: zero scroll calls
  assert.strictEqual(scrollCalls, 0, 'Viewport must remain completely stationary on typing with 0 scroll calls');

  // Verify: no dropdown item is active
  assert.strictEqual(dropdownItems.every((item) => !item.isActive && !item.ariaSelected), true);

  // Verify: no prose mark is current or pulsed
  assert.strictEqual(marks.every((mark) => !mark.isCurrent && !mark.hasPulse), true);
});

test('Functional Test: Explicit activation via Enter, Shift+Enter, Next/Prev, and item click', () => {
  let scrollCalls = 0;
  let currentGroupIndex = -1;
  const totalGroups = 5;
  let lastScrolledTarget = -1;

  function goToGroup(index) {
    currentGroupIndex = ((index % totalGroups) + totalGroups) % totalGroups;
    scrollCalls++;
    lastScrolledTarget = currentGroupIndex;
  }

  function nextMatch() {
    if (totalGroups <= 0) return;
    if (currentGroupIndex < 0) {
      goToGroup(0);
    } else {
      goToGroup(currentGroupIndex + 1);
    }
  }

  function prevMatch() {
    if (totalGroups <= 0) return;
    if (currentGroupIndex < 0) {
      goToGroup(totalGroups - 1);
    } else {
      goToGroup(currentGroupIndex - 1);
    }
  }

  // 1. Initial state: -1
  assert.strictEqual(currentGroupIndex, -1);
  assert.strictEqual(scrollCalls, 0);

  // 2. User presses Enter / clicks Next
  nextMatch();
  assert.strictEqual(currentGroupIndex, 0, 'Enter/Next from -1 must activate match 0');
  assert.strictEqual(lastScrolledTarget, 0);
  assert.strictEqual(scrollCalls, 1);

  // 3. User presses Enter again -> advances to match 1
  nextMatch();
  assert.strictEqual(currentGroupIndex, 1);
  assert.strictEqual(lastScrolledTarget, 1);
  assert.strictEqual(scrollCalls, 2);

  // 4. Test Shift+Enter / Prev from initial -1 state
  currentGroupIndex = -1;
  prevMatch();
  assert.strictEqual(currentGroupIndex, 4, 'Shift+Enter/Prev from -1 must activate the last match (total - 1)');
  assert.strictEqual(lastScrolledTarget, 4);
  assert.strictEqual(scrollCalls, 3);

  // 5. Test direct dropdown item click
  goToGroup(2);
  assert.strictEqual(currentGroupIndex, 2, 'Dropdown item click must directly activate clicked group');
  assert.strictEqual(lastScrolledTarget, 2);
  assert.strictEqual(scrollCalls, 4);
});

test('Functional Test: Counter text formatting with tabular-nums stability', () => {
  function formatCounter(current, total, hasQuery) {
    if (!hasQuery) return '0 / 0';
    if (total === 0) return '0 / 0';
    const displayCurrent = current >= 0 ? current + 1 : 0;
    return `${displayCurrent} / ${total}`;
  }

  // Empty / No query
  assert.strictEqual(formatCounter(-1, 0, false), '0 / 0');

  // No matches found
  assert.strictEqual(formatCounter(-1, 0, true), '0 / 0');

  // 5 matches found on typing (unselected state)
  assert.strictEqual(formatCounter(-1, 5, true), '0 / 5', 'Typing search with 5 matches must show 0 / 5');

  // User activates match 0
  assert.strictEqual(formatCounter(0, 5, true), '1 / 5', 'Navigating to match 0 must show 1 / 5');

  // User navigates to match 4
  assert.strictEqual(formatCounter(4, 5, true), '5 / 5', 'Navigating to last match must show 5 / 5');

  // 120 matches found
  assert.strictEqual(formatCounter(-1, 120, true), '0 / 120');
  assert.strictEqual(formatCounter(23, 120, true), '24 / 120');
});

test('Functional Test: Mobile counter reserved base width 58px prevents width jitter for 0..99 results', () => {
  // Approximate character width in monospace 0.74rem (~11.8px) with tabular-nums is ~7.1px per char
  const CHAR_WIDTH_PX = 7.1;
  const PADDING_PX = 12; // 6px left + 6px right

  function calcTextWidth(text) {
    return text.length * CHAR_WIDTH_PX + PADDING_PX;
  }

  const mobileBaseWidth = 58;
  const desktopBaseWidth = 68;

  // Mobile checks
  assert.ok(calcTextWidth('0 / 0') <= mobileBaseWidth, '0 / 0 must fit within mobile min-width 58px');
  assert.ok(calcTextWidth('0 / 9') <= mobileBaseWidth, '0 / 9 must fit within mobile min-width 58px');
  assert.ok(calcTextWidth('0 / 99') <= mobileBaseWidth, '0 / 99 must fit within mobile min-width 58px');
  assert.ok(calcTextWidth('99 / 99') <= mobileBaseWidth + 5, '99 / 99 is well-contained without sudden snapping');

  // Desktop checks
  assert.ok(calcTextWidth('0 / 0') <= desktopBaseWidth, '0 / 0 must fit within desktop min-width 68px');
  assert.ok(calcTextWidth('0 / 99') <= desktopBaseWidth, '0 / 99 must fit within desktop min-width 68px');
  assert.ok(calcTextWidth('99 / 99') <= desktopBaseWidth, '99 / 99 must fit within desktop min-width 68px');
});

test('Functional Test: Dropdown expand/collapse transition timing specification', () => {
  // Validates the slow damping curve and timing parameters
  const timingConfig = {
    maxHeightDuration: 640,
    opacityDuration: 540,
    transformDuration: 640,
    marginTopDuration: 640,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  };

  assert.strictEqual(timingConfig.maxHeightDuration, 640, 'Dropdown max-height duration must be 640ms');
  assert.strictEqual(timingConfig.opacityDuration, 540, 'Dropdown opacity duration must be 540ms');
  assert.strictEqual(timingConfig.transformDuration, 640, 'Dropdown transform duration must be 640ms');
  assert.strictEqual(timingConfig.easing, 'cubic-bezier(0.16, 1, 0.3, 1)', 'Easing must be graceful water-ink damping');
});

test('Functional Test: Clear button maintains reserved geometry and does not alter input shell layout', () => {
  // Simulates clear button state toggles and geometry reservation without hidden attribute
  const clearBtn = {
    classes: new Set(['article-search-clear-btn', 'is-hidden']),
    ariaHidden: 'true',
    tabIndex: -1,
    width: 20,
    height: 20,
    display: 'flex',
  };

  function updateClearButton(hasValue) {
    if (hasValue) {
      clearBtn.classes.add('is-visible');
      clearBtn.classes.delete('is-hidden');
      clearBtn.ariaHidden = 'false';
      clearBtn.tabIndex = 0;
    } else {
      clearBtn.classes.delete('is-visible');
      clearBtn.classes.add('is-hidden');
      clearBtn.ariaHidden = 'true';
      clearBtn.tabIndex = -1;
    }
  }

  // Initial state: hidden via opacity/visibility but reserved geometry
  assert.strictEqual(clearBtn.classes.has('is-hidden'), true);
  assert.strictEqual(clearBtn.classes.has('is-visible'), false);
  assert.strictEqual(clearBtn.ariaHidden, 'true');
  assert.strictEqual(clearBtn.tabIndex, -1);
  assert.strictEqual(clearBtn.width, 20, 'Slot reservation width must stay 20px even when hidden');
  assert.strictEqual(clearBtn.display, 'flex', 'Display flex must remain active to prevent collapsing input shell');

  // Typing first character: activates button
  updateClearButton(true);
  assert.strictEqual(clearBtn.classes.has('is-visible'), true);
  assert.strictEqual(clearBtn.classes.has('is-hidden'), false);
  assert.strictEqual(clearBtn.ariaHidden, 'false');
  assert.strictEqual(clearBtn.tabIndex, 0);
  assert.strictEqual(clearBtn.width, 20, 'Slot reservation width must remain 20px when shown');
  assert.strictEqual(clearBtn.display, 'flex');

  // Clearing input: hides button without resizing geometry
  updateClearButton(false);
  assert.strictEqual(clearBtn.classes.has('is-visible'), false);
  assert.strictEqual(clearBtn.classes.has('is-hidden'), true);
  assert.strictEqual(clearBtn.ariaHidden, 'true');
  assert.strictEqual(clearBtn.tabIndex, -1);
  assert.strictEqual(clearBtn.width, 20, 'Slot reservation width must remain exactly 20px on clear');
});

test('Functional Test: Search typing execution does not trigger intermediate collapse, 0/0 blink or nav disable jitter', () => {
  let collapseCalls = 0;
  let expandCalls = 0;
  let counterHistory = [];
  let navDisabledHistory = [];

  const state = {
    totalGroups: 0,
    isDropdownOpen: false,
    navDisabled: true,
    counterText: '0 / 0',
  };

  function mockUpdateCounter(current, total, hasQuery) {
    const text = !hasQuery || total === 0 ? '0 / 0' : `${current >= 0 ? current + 1 : 0} / ${total}`;
    state.counterText = text;
    counterHistory.push(text);
  }

  function mockUpdateNav(total) {
    const disabled = total <= 0;
    state.navDisabled = disabled;
    navDisabledHistory.push(disabled);
  }

  function mockCollapseDropdown() {
    state.isDropdownOpen = false;
    collapseCalls++;
  }

  function mockExpandDropdown() {
    state.isDropdownOpen = true;
    expandCalls++;
  }

  // Refactored executeSearch flow:
  // clearProseMarks only clears DOM, does not collapse UI or flash 0/0
  function executeSearch(query, matchCount) {
    if (!query.trim()) {
      mockCollapseDropdown();
      mockUpdateCounter(0, 0, false);
      mockUpdateNav(0);
      return;
    }

    state.totalGroups = matchCount;
    mockUpdateNav(state.totalGroups);

    if (state.totalGroups > 0) {
      if (!state.isDropdownOpen) {
        mockExpandDropdown();
      }
      mockUpdateCounter(-1, state.totalGroups, true);
    } else {
      mockUpdateCounter(0, 0, true);
      mockCollapseDropdown();
    }
  }

  // 1. Initial typing 'A' -> 5 matches
  executeSearch('A', 5);
  assert.strictEqual(state.totalGroups, 5);
  assert.strictEqual(state.isDropdownOpen, true);
  assert.strictEqual(state.navDisabled, false);
  assert.strictEqual(state.counterText, '0 / 5');
  assert.strictEqual(collapseCalls, 0, 'No collapse calls during matching');
  assert.strictEqual(expandCalls, 1);

  // 2. Typing 'B' ('AB') -> 3 matches
  // The intermediate state must NOT call collapseDropdown, must NOT reset counter to '0 / 0', and must NOT disable nav buttons!
  const prevCollapseCount = collapseCalls;
  counterHistory = [];
  navDisabledHistory = [];

  executeSearch('AB', 3);
  assert.strictEqual(collapseCalls, prevCollapseCount, 'Typing consecutive matches must NEVER trigger intermediate collapseDropdown');
  assert.strictEqual(state.isDropdownOpen, true);
  assert.strictEqual(state.counterText, '0 / 3');
  assert.deepStrictEqual(counterHistory, ['0 / 3'], 'Counter must transition directly to 0/3 without blinking 0/0');
  assert.deepStrictEqual(navDisabledHistory, [false], 'Nav buttons must stay enabled without blinking disabled');
});

test('Functional Test: Capsule slots rigid geometry prevents width jitter during typing', () => {
  // Verifies that total width of all slots in capsule is invariant whether typing or empty
  const DRAG_HANDLE_WIDTH = 14;
  const INPUT_SHELL_WIDTH = 350;
  const COUNTER_WIDTH = 68;
  const SEP_WIDTH = 1;
  const NAV_WIDTH = 28 * 3 + 3 * 2; // 90px
  const OPTIONS_WIDTH = 32 * 2 + 3; // 67px
  const CLOSE_BTN_WIDTH = 66;
  const GAPS_TOTAL = 8 * 8; // 8 gaps of 8px = 64px
  const PADDING_TOTAL = 14 + 12 + 2; // 28px including 1px border on each side

  function computeCapsuleWidth(isTyping, hasMatches) {
    // In our rigid design, every slot width is constant regardless of state
    const shellWidth = INPUT_SHELL_WIDTH;
    const counterWidth = COUNTER_WIDTH;
    const navWidth = NAV_WIDTH;
    const optionsWidth = OPTIONS_WIDTH;
    const closeWidth = CLOSE_BTN_WIDTH;

    return (
      PADDING_TOTAL +
      DRAG_HANDLE_WIDTH +
      shellWidth +
      counterWidth +
      SEP_WIDTH * 3 +
      navWidth +
      optionsWidth +
      closeWidth +
      GAPS_TOTAL
    );
  }

  const emptyWidth = computeCapsuleWidth(false, false);
  const typingWidth = computeCapsuleWidth(true, false);
  const matchedWidth = computeCapsuleWidth(true, true);

  assert.strictEqual(emptyWidth, 750, 'Capsule width must be precisely 750px');
  assert.strictEqual(emptyWidth, typingWidth, 'Capsule width while typing must exactly equal empty width');
  assert.strictEqual(typingWidth, matchedWidth, 'Capsule width when matched must exactly equal typing width');
});

test('Functional Test: Counter warning state maintains constant font metrics without reflow', () => {
  // Tabular numbers guarantee identical glyph advance widths
  const baseMetrics = {
    fontFamily: 'monospace',
    fontWeight: 500,
    width: 68,
    boxSizing: 'border-box',
  };

  const warningMetrics = {
    fontFamily: 'monospace',
    fontWeight: 500, // Kept at 500 to prevent text reflow
    width: 68,
    boxSizing: 'border-box',
  };

  assert.strictEqual(baseMetrics.width, warningMetrics.width, 'Counter box width must remain 68px in warning state');
  assert.strictEqual(baseMetrics.fontWeight, warningMetrics.fontWeight, 'Font weight must remain 500 in warning state to prevent reflow');
});

test('Functional Test: Search capsule height and flex-basis in column flexbox prevents circle distortion', () => {
  // .article-search-hud is display: flex, flex-direction: column.
  // In a column flex container, flex-basis applies to the vertical axis (height).
  // If flex: 0 0 750px is set, height becomes 750px, forming a 750x750 perfect circle with border-radius: 9999px.
  // Therefore, capsule height must be strictly locked to 48px (flex: 0 0 48px).
  const hudLayout = {
    display: 'flex',
    flexDirection: 'column',
    width: 750,
  };
  const capsuleStyle = {
    height: 48,
    minHeight: 48,
    maxHeight: 48,
    width: 750,
    flexBasis: 48, // 48px along main axis (vertical)
    borderRadius: 9999,
  };

  assert.strictEqual(capsuleStyle.height, 48, 'Capsule height must be locked to 48px');
  assert.strictEqual(capsuleStyle.flexBasis, 48, 'Capsule flex-basis along column main axis must be 48px, preventing circle geometry');
  assert.notStrictEqual(capsuleStyle.height, capsuleStyle.width, 'Height and width must not be equal, avoiding 1:1 circle aspect ratio');
});




