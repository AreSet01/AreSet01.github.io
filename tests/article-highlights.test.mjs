import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStorageKey,
  scoreContextMatch,
  findTextOffsetInString,
  formatCitation,
  exportHighlightsAsMarkdown,
  mapSpanToTextNodes,
  applyRangesAsHighlight,
  removeHighlightFromDOM,
  rehydrateHighlights,
  getTextNodesInRange,
  findPrecedingHeading,
} from '../src/utils/articleHighlightEngine.ts';

// ---------------------------------------------------------
// 1. Storage & Key Normalization Tests
// ---------------------------------------------------------

test('getStorageKey sanitizes slugs and paths consistently', () => {
  assert.strictEqual(
    getStorageKey('posts/ue5-cdo-architecture-deep-dive?ref=search#section-1'),
    'areSet_article_highlights_posts_ue5-cdo-architecture-deep-dive'
  );
  assert.strictEqual(
    getStorageKey('/posts/renderdoc_mumu/'),
    'areSet_article_highlights_posts_renderdoc_mumu'
  );
  assert.strictEqual(
    getStorageKey(''),
    'areSet_article_highlights_default'
  );
});

// ---------------------------------------------------------
// 2. Context Matching & Disambiguation Tests
// ---------------------------------------------------------

test('scoreContextMatch awards higher scores for matching prefix and suffix', () => {
  const text = 'Alpha Beta Gamma Delta Epsilon';
  // Target: "Gamma" (pos 11, len 5)
  // Candidate 1: surrounded by "Beta " and " Delta"
  const score1 = scoreContextMatch(text, 11, 5, 'Beta ', ' Delta');
  const score2 = scoreContextMatch(text, 11, 5, 'Foo ', ' Bar');
  const score3 = scoreContextMatch(text, 11, 5, 'Xyz', '123');

  assert.ok(score1 > score2, 'Matching context should produce a higher score');
  assert.strictEqual(score3, 0, 'Completely non-matching context should score 0');
});

test('findTextOffsetInString resolves multiple occurrences using W3C context fingerprint', () => {
  const fullText = 'In UE5, UObject is the base class. Later, another UObject instance is allocated in CDO.';
  // First "UObject" is at index 8
  // Second "UObject" is at index 50

  const recordFirst = {
    id: 'hl-1',
    text: 'UObject',
    prefix: 'In UE5, ',
    suffix: ' is the base class.',
    timestamp: Date.now(),
  };

  const match1 = findTextOffsetInString(fullText, recordFirst);
  assert.ok(match1);
  assert.strictEqual(match1.start, 8);
  assert.strictEqual(match1.end, 15);
  assert.strictEqual(fullText.slice(match1.start, match1.end), 'UObject');

  const recordSecond = {
    id: 'hl-2',
    text: 'UObject',
    prefix: 'another ',
    suffix: ' instance is allocated',
    timestamp: Date.now(),
  };

  const match2 = findTextOffsetInString(fullText, recordSecond);
  assert.ok(match2);
  assert.strictEqual(match2.start, 50);
  assert.strictEqual(match2.end, 57);
  assert.strictEqual(fullText.slice(match2.start, match2.end), 'UObject');
});

test('findTextOffsetInString gracefully handles minor whitespace edits in markdown', () => {
  const fullText = '深入剖析虚幻引擎  5 (UE5) \n 垃圾回收系统与反射体系';
  const recordWithDifferentSpaces = {
    id: 'hl-3',
    text: '5 (UE5) 垃圾回收系统',
    prefix: '虚幻引擎 ',
    suffix: '与反射体系',
    timestamp: Date.now(),
  };

  const match = findTextOffsetInString(fullText, recordWithDifferentSpaces);
  assert.ok(match, 'Should find match despite collapsed spaces and newline');
  assert.ok(fullText.slice(match.start, match.end).includes('5 (UE5)'));
  assert.ok(fullText.slice(match.start, match.end).includes('垃圾回收系统'));
});

// ---------------------------------------------------------
// 3. Citation & Markdown Export Formatting Tests
// ---------------------------------------------------------

test('formatCitation outputs clean Markdown blockquote with title and heading anchor URL', () => {
  const citation = formatCitation(
    'UE5 CDO 深度剖析',
    '§ 二、第一阶段：谁是根集？',
    'https://areset.me/posts/ue5-cdo',
    'RootSet 根集识别通过标记追踪展开。',
    'rootset-identification'
  );

  assert.ok(citation.startsWith('> RootSet 根集识别通过标记追踪展开。'));
  assert.ok(citation.includes('— 引用自《UE5 CDO 深度剖析 · 二、第一阶段：谁是根集？》'));
  assert.ok(citation.includes('https://areset.me/posts/ue5-cdo#rootset-identification'));
});

test('exportHighlightsAsMarkdown generates grouped, structured study notes', () => {
  const records = [
    {
      id: 'hl-1',
      text: 'CDO 是所有 UClass 实例的模板原型。',
      prefix: '众所周知，',
      suffix: '，在引擎启动时生成。',
      headingId: 'section-1',
      headingText: '§ 1. CDO 基础概念',
      timestamp: 1727672000000,
    },
    {
      id: 'hl-2',
      text: '每个类的 CDO 只会初始化一次。',
      prefix: '值得注意的是，',
      suffix: '，除非热重载。',
      headingId: 'section-1',
      headingText: '§ 1. CDO 基础概念',
      timestamp: 1727672050000,
    },
    {
      id: 'hl-3',
      text: 'RootSet 保护根集对象不受回收。',
      prefix: '在 GC 标记阶段，',
      suffix: '，确保世界生命周期完整。',
      headingId: 'section-2',
      headingText: '§ 2. 根集与回收机制',
      timestamp: 1727672100000,
    },
  ];

  const md = exportHighlightsAsMarkdown(
    '虚幻引擎 5 架构',
    'https://areset.me/posts/ue5-arch',
    records
  );

  assert.ok(md.includes('# 《虚幻引擎 5 架构》读书笔记与高亮摘要'));
  assert.ok(md.includes('共 3 条划线高亮'));
  assert.ok(md.includes('## § 1. CDO 基础概念'));
  assert.ok(md.includes('## § 2. 根集与回收机制'));
  assert.ok(md.includes('> CDO 是所有 UClass 实例的模板原型。'));
  assert.ok(md.includes('> RootSet 保护根集对象不受回收。'));
  assert.ok(md.includes('[定位原文](https://areset.me/posts/ue5-arch#section-1)'));
});

// ---------------------------------------------------------
// 4. Mock DOM Functional Tests for Highlighting & Restoration
// ---------------------------------------------------------

class MockTextNode {
  constructor(text) {
    this.nodeType = 3;
    this.nodeValue = text;
    this.parentNode = null;
  }
  get length() {
    return this.nodeValue ? this.nodeValue.length : 0;
  }
  get textContent() {
    return this.nodeValue;
  }
  set textContent(v) {
    this.nodeValue = v;
  }
  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }
  splitText(offset) {
    const curLen = this.nodeValue ? this.nodeValue.length : 0;
    if (offset > curLen) {
      throw new Error(`IndexSizeError: offset ${offset} exceeds length ${curLen}`);
    }
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
    this.style = {};
  }
  get id() {
    return this.getAttribute('id') || '';
  }
  set id(val) {
    this.setAttribute('id', val);
  }
  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, val) {
    this.attributes.set(name, String(val));
    if (name === 'class') {
      this.classList = new Set(String(val).split(/\s+/).filter(Boolean));
    }
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
  closest(selector) {
    if (selector.includes('.code-block-toolbar') && this.classList.has('code-block-toolbar')) return this;
    const tagMatches = selector.split(',').map(s => s.trim().toUpperCase());
    if (tagMatches.includes(this.tagName)) return this;
    if (this.parentNode && this.parentNode.closest) return this.parentNode.closest(selector);
    return null;
  }
  contains(node) {
    let curr = node;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }
  compareDocumentPosition(node) {
    if (this.contains(node)) return 4 | 16;
    return 4;
  }
  querySelectorAll(selector) {
    const matches = [];
    const tags = selector.split(',').map(s => s.trim().toUpperCase());
    const walk = (node) => {
      if (node.nodeType === 1) {
        if (selector.startsWith('mark[data-highlight-id=') || selector === 'mark' || selector.startsWith('mark.')) {
          if (node.tagName === 'MARK') {
            const idMatch = selector.match(/data-highlight-id="([^"]+)"/);
            if (!idMatch || node.dataset.highlightId === idMatch[1]) {
              matches.push(node);
            }
          }
        } else if (tags.includes(node.tagName)) {
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
    let i = 0;
    while (i < this.childNodes.length - 1) {
      const cur = this.childNodes[i];
      const next = this.childNodes[i + 1];
      if (cur.nodeType === 3 && next.nodeType === 3) {
        cur.nodeValue += next.nodeValue;
        this.removeChild(next);
      } else {
        if (cur.nodeType === 1) cur.normalize();
        i++;
      }
    }
    if (this.childNodes.length > 0 && this.childNodes[this.childNodes.length - 1].nodeType === 1) {
      this.childNodes[this.childNodes.length - 1].normalize();
    }
  }
  get textContent() {
    let result = '';
    for (const child of this.childNodes) {
      if (child.nodeType === 3) {
        result += child.nodeValue || '';
      } else if (child.nodeType === 1) {
        result += child.textContent || '';
      }
    }
    return result;
  }
}

globalThis.NodeFilter = {
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
  SHOW_TEXT: 4,
};

globalThis.document = {
  createElement(tag) {
    return new MockElement(tag);
  },
  createTreeWalker(root, whatToShow, filter) {
    const textNodes = [];
    const walk = (node) => {
      if (node.nodeType === 3) {
        if (!filter || filter.acceptNode(node) === globalThis.NodeFilter.FILTER_ACCEPT) {
          textNodes.push(node);
        }
      } else if (node.childNodes) {
        for (const child of [...node.childNodes]) {
          walk(child);
        }
      }
    };
    walk(root);

    let idx = -1;
    return {
      nextNode() {
        idx++;
        return textNodes[idx] || null;
      }
    };
  }
};
globalThis.Node = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
  DOCUMENT_POSITION_PRECEDING: 2,
  DOCUMENT_POSITION_FOLLOWING: 4,
  DOCUMENT_POSITION_CONTAINS: 8,
  DOCUMENT_POSITION_CONTAINED_BY: 16,
};

test('applyRangesAsHighlight wraps target text across nodes and preserves syntax highlighting', () => {
  // Simulating: <code><span class="token keyword">virtual</span> <span class="token function">Process</span>();</code>
  const p = new MockElement('p');
  const code = new MockElement('code');
  const spanKeyword = new MockElement('span');
  spanKeyword.setAttribute('class', 'token keyword');
  const textKeyword = new MockTextNode('virtual');
  spanKeyword.appendChild(textKeyword);

  const textSpace = new MockTextNode(' ');

  const spanFunc = new MockElement('span');
  spanFunc.setAttribute('class', 'token function');
  const textFunc = new MockTextNode('Process');
  spanFunc.appendChild(textFunc);

  const textTail = new MockTextNode('();');

  code.appendChild(spanKeyword);
  code.appendChild(textSpace);
  code.appendChild(spanFunc);
  code.appendChild(textTail);
  p.appendChild(code);

  const entries = [
    { node: textKeyword, start: 0, end: 7, length: 7 },
    { node: textSpace, start: 7, end: 8, length: 1 },
    { node: textFunc, start: 8, end: 15, length: 7 },
    { node: textTail, start: 15, end: 18, length: 3 },
  ];

  // Highlight "virtual Process" (0 to 15)
  const nodeRanges = mapSpanToTextNodes(0, 15, entries);
  assert.strictEqual(nodeRanges.length, 3);

  const record = {
    id: 'hl-test-123',
    text: 'virtual Process',
    prefix: '',
    suffix: '();',
    timestamp: Date.now(),
  };

  const marks = applyRangesAsHighlight(nodeRanges, record);
  assert.strictEqual(marks.length, 3);
  assert.strictEqual(marks[0].dataset.highlightId, 'hl-test-123');

  // Verify that spanKeyword still wraps its mark, preserving syntax tokens!
  assert.strictEqual(spanKeyword.childNodes[0], marks[0]);
  assert.strictEqual(marks[0].childNodes[0].nodeValue, 'virtual');

  // Clean removal test: unwraps mark and returns text to pristine state
  removeHighlightFromDOM('hl-test-123', p);
  const remainingMarks = p.querySelectorAll('mark');
  assert.strictEqual(remainingMarks.length, 0);
  assert.strictEqual(spanKeyword.childNodes[0].nodeValue, 'virtual');
  assert.strictEqual(spanFunc.childNodes[0].nodeValue, 'Process');
});

test('removeHighlightFromDOM selectively removes one highlight while keeping others intact', () => {
  const p = new MockElement('p');
  const t1 = new MockTextNode('Sentence One. ');
  const t2 = new MockTextNode('Sentence Two. ');
  const t3 = new MockTextNode('Sentence Three.');

  p.appendChild(t1);
  p.appendChild(t2);
  p.appendChild(t3);

  // Apply highlight A on t1
  const recA = { id: 'hl-A', text: 'Sentence One. ', prefix: '', suffix: '', timestamp: 1 };
  applyRangesAsHighlight([{ textNode: t1, localStart: 0, localEnd: 14 }], recA);

  // Apply highlight B on t3
  const recB = { id: 'hl-B', text: 'Sentence Three.', prefix: '', suffix: '', timestamp: 2 };
  applyRangesAsHighlight([{ textNode: t3, localStart: 0, localEnd: 15 }], recB);

  assert.strictEqual(p.querySelectorAll('mark').length, 2);

  // Remove only A
  removeHighlightFromDOM('hl-A', p);

  const marksAfterA = p.querySelectorAll('mark');
  assert.strictEqual(marksAfterA.length, 1);
  assert.strictEqual(marksAfterA[0].dataset.highlightId, 'hl-B');

  // Remove B
  removeHighlightFromDOM('hl-B', p);
  assert.strictEqual(p.querySelectorAll('mark').length, 0);
});

test('findTextOffsetInString edge cases: empty strings, unmatched queries, and boundaries', () => {
  assert.strictEqual(findTextOffsetInString('', { id: '1', text: '', prefix: '', suffix: '', timestamp: 1 }), null);
  assert.strictEqual(findTextOffsetInString('Hello world', { id: '2', text: 'NotFound', prefix: '', suffix: '', timestamp: 1 }), null);

  const boundaryText = 'Start to Finish';
  const startMatch = findTextOffsetInString(boundaryText, { id: '3', text: 'Start', prefix: '', suffix: ' to Finish', timestamp: 1 });
  assert.ok(startMatch);
  assert.strictEqual(startMatch.start, 0);
  assert.strictEqual(startMatch.end, 5);

  const endMatch = findTextOffsetInString(boundaryText, { id: '4', text: 'Finish', prefix: 'Start to ', suffix: '', timestamp: 1 });
  assert.ok(endMatch);
  assert.strictEqual(endMatch.start, 9);
  assert.strictEqual(endMatch.end, 15);
});

test('formatCitation multi-line blockquote formatting', () => {
  const multiLine = 'First line of excerpt.\nSecond line of excerpt.\nThird line.';
  const citation = formatCitation('My Article', '导言 / 正文', 'https://example.com/post', multiLine);

  assert.ok(citation.includes('> First line of excerpt.'));
  assert.ok(citation.includes('> Second line of excerpt.'));
  assert.ok(citation.includes('> Third line.'));
  assert.ok(citation.includes('— 引用自《My Article》 https://example.com/post'));
});

// ---------------------------------------------------------
// 5. Robustness & Regression Tests for Rehydration & Fuzzy Scenarios
// ---------------------------------------------------------

test('findTextOffsetInString resolves multiple occurrences with edited whitespace using context scoring', () => {
  const combined = 'The cat   sat on the mat. Later another cat   sat on the rug.';
  const recordSecond = {
    id: 'hl-cat-2',
    text: 'cat sat on the',
    prefix: 'Later another ',
    suffix: ' rug.',
    timestamp: Date.now(),
  };

  const res = findTextOffsetInString(combined, recordSecond);
  assert.ok(res, 'Should resolve match even with collapsed/edited whitespace');
  assert.strictEqual(res.start, 40, 'Should disambiguate to second occurrence via prefix/suffix context');
  assert.strictEqual(combined.slice(res.start, res.end), 'cat   sat on the');
});

test('rehydrateHighlights properly restores multiple highlights in the same paragraph without offset drift or split errors', () => {
  const prose = new MockElement('div');
  const p = new MockElement('p');
  const textNode = new MockTextNode('Hello world! This is a test of persistent highlights rehydration in UE5.');
  p.appendChild(textNode);
  prose.appendChild(p);

  const records = [
    { id: 'hl-1', text: 'world!', prefix: 'Hello ', suffix: ' This is', timestamp: 1 },
    { id: 'hl-2', text: 'persistent highlights', prefix: 'test of ', suffix: ' rehydration', timestamp: 2 },
  ];

  const resultMap = rehydrateHighlights(records, prose);
  assert.strictEqual(resultMap.size, 2, 'Both highlights must be rehydrated successfully without throwing IndexSizeError');

  const marks1 = resultMap.get('hl-1');
  assert.ok(marks1 && marks1.length > 0);
  assert.strictEqual(marks1[0].childNodes[0].nodeValue, 'world!');

  const marks2 = resultMap.get('hl-2');
  assert.ok(marks2 && marks2.length > 0);
  assert.strictEqual(marks2[0].childNodes[0].nodeValue, 'persistent highlights');

  const allMarks = prose.querySelectorAll('mark');
  assert.strictEqual(allMarks.length, 2);
});

test('getTextNodesInRange filters out SKIP_SELECTOR elements such as code block toolbars', () => {
  const root = new MockElement('div');
  const pre = new MockElement('pre');
  const toolbar = new MockElement('div');
  toolbar.setAttribute('class', 'code-block-toolbar');
  const toolbarText = new MockTextNode('C++ Copy Pin');
  toolbar.appendChild(toolbarText);

  const code = new MockElement('code');
  const codeText = new MockTextNode('int x = 42;');
  code.appendChild(codeText);

  pre.appendChild(toolbar);
  pre.appendChild(code);
  root.appendChild(pre);

  // Range spanning across the whole pre element
  const fakeRange = {
    startContainer: toolbarText,
    startOffset: 0,
    endContainer: codeText,
    endOffset: 11,
    commonAncestorContainer: pre,
    intersectsNode(node) {
      return true;
    }
  };

  const ranges = getTextNodesInRange(fakeRange);
  // Toolbar text should be filtered out by SKIP_SELECTOR
  assert.strictEqual(ranges.length, 1);
  assert.strictEqual(ranges[0].textNode, codeText);
});

test('findPrecedingHeading identifies heading when startNode is directly the heading or descendant', () => {
  const prose = new MockElement('div');
  const h2 = new MockElement('h2');
  h2.setAttribute('id', 'intro-heading');
  const h2Text = new MockTextNode('Introduction to UE5');
  h2.appendChild(h2Text);
  prose.appendChild(h2);

  const p = new MockElement('p');
  const pText = new MockTextNode('Some body paragraph.');
  p.appendChild(pText);
  prose.appendChild(p);

  // Directly selecting the heading text
  const headingDirect = findPrecedingHeading(h2Text, prose);
  assert.strictEqual(headingDirect.id, 'intro-heading');
  assert.strictEqual(headingDirect.text, '§ Introduction to UE5');

  // Selecting body paragraph after heading
  const headingPara = findPrecedingHeading(pText, prose);
  assert.strictEqual(headingPara.id, 'intro-heading');
  assert.strictEqual(headingPara.text, '§ Introduction to UE5');
});
