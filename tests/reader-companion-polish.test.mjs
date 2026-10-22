import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getTextNodesInRange,
  applyRangesAsHighlight,
  collectTextEntries,
  mapSpanToTextNodes,
} from '../src/utils/articleHighlightEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Minimal Mock DOM for Node.js test environment
class MockNode {
  constructor(nodeType, nodeValue = '') {
    this.nodeType = nodeType;
    this.nodeValue = nodeValue;
    this.childNodes = [];
    this.parentElement = null;
    this.parentNode = null;
  }

  appendChild(child) {
    child.parentElement = this;
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(newChild, refChild) {
    const idx = this.childNodes.indexOf(refChild);
    if (idx === -1) return this.appendChild(newChild);
    newChild.parentElement = this;
    newChild.parentNode = this;
    this.childNodes.splice(idx, 0, newChild);
    return newChild;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentElement = null;
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  normalize() {
    const merged = [];
    for (const child of this.childNodes) {
      if (child.nodeType === 3 && merged.length && merged[merged.length - 1].nodeType === 3) {
        merged[merged.length - 1].nodeValue += child.nodeValue;
      } else {
        merged.push(child);
      }
    }
    this.childNodes = merged;
  }
}

class MockTextNode extends MockNode {
  constructor(val) {
    super(3, val);
  }

  splitText(offset) {
    const full = this.nodeValue;
    this.nodeValue = full.slice(0, offset);
    const remainder = new MockTextNode(full.slice(offset));
    if (this.parentNode) {
      const idx = this.parentNode.childNodes.indexOf(this);
      this.parentNode.childNodes.splice(idx + 1, 0, remainder);
      remainder.parentElement = this.parentElement;
      remainder.parentNode = this.parentNode;
    }
    return remainder;
  }
}

class MockElement extends MockNode {
  constructor(tagName) {
    super(1, '');
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.classList = new Set();
    this.dataset = {};
    this.style = {};
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === 'class') {
      this.classList = new Set(String(v).split(/\s+/).filter(Boolean));
    }
  }

  getAttribute(k) {
    return this.attributes.get(k) || null;
  }

  closest(selector) {
    let cur = this;
    const targets = selector.split(',').map((s) => s.trim().toUpperCase());
    while (cur) {
      if (targets.includes(cur.tagName)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelectorAll(sel) {
    const res = [];
    const check = (node) => {
      if (node.nodeType === 1 && node.tagName.toLowerCase() === sel.toLowerCase()) {
        res.push(node);
      }
      for (const child of node.childNodes) check(child);
    };
    check(this);
    return res;
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

test('1. InkAsk.astro includes "新开对话" (New Chat) button and resets conversation state', () => {
  const fileContent = fs.readFileSync(path.join(rootDir, 'src/components/InkAsk.astro'), 'utf8');

  // Verify button exists in drawer header
  assert.match(fileContent, /class="ink-ask-drawer-new"/);
  assert.match(fileContent, /新开对话/);

  // Verify resetConversation handler cleans thread, welcome view, and controller
  assert.match(fileContent, /const resetConversation = \(\) =>/);
  assert.match(fileContent, /sidebarController\.abort\(\)/);
  assert.match(fileContent, /thread\.innerHTML = ''/);
  assert.match(fileContent, /welcome\.style\.display = ''/);

  // Verify exposed in window.__inkAsk
  assert.match(fileContent, /resetConversation,/);
});

test('2. articleHighlightEngine prevents newline and whitespace-only text nodes from corrupting list/quote layouts', () => {
  // Simulating list layout:
  // <ol>
  //   \n (newline between ol and li)
  //   <li><p>内存对齐</p></li>
  //   \n (newline between li and li)
  //   <li><p>遍历快捷链表</p></li>
  // </ol>
  const ol = new MockElement('ol');
  const ws1 = new MockTextNode('\n  ');
  const li1 = new MockElement('li');
  const p1 = new MockElement('p');
  const text1 = new MockTextNode('内存对齐与偏移量定死');
  p1.appendChild(text1);
  li1.appendChild(p1);

  const ws2 = new MockTextNode('\n  ');
  const li2 = new MockElement('li');
  const p2 = new MockElement('p');
  const text2 = new MockTextNode('构建属性遍历快捷链表');
  p2.appendChild(text2);
  li2.appendChild(p2);

  ol.appendChild(ws1);
  ol.appendChild(li1);
  ol.appendChild(ws2);
  ol.appendChild(li2);

  // Ensure inter-block newlines are rejected when wrapped or scanned
  const ranges = [
    { textNode: ws1, localStart: 0, localEnd: 3 },
    { textNode: text1, localStart: 0, localEnd: text1.nodeValue.length },
    { textNode: ws2, localStart: 0, localEnd: 3 },
    { textNode: text2, localStart: 0, localEnd: text2.nodeValue.length },
  ];

  const marks = applyRangesAsHighlight(ranges, {
    id: 'hl-test-multiline',
    text: '内存对齐...构建属性',
    prefix: '',
    suffix: '',
    timestamp: Date.now(),
  });

  // Only the two actual text nodes should be marked; ws1 and ws2 under <ol> MUST be skipped!
  assert.strictEqual(marks.length, 2);
  assert.strictEqual(marks[0].childNodes[0].nodeValue, '内存对齐与偏移量定死');
  assert.strictEqual(marks[1].childNodes[0].nodeValue, '构建属性遍历快捷链表');

  // Verify neither ws1 nor ws2 were wrapped in <mark> inside <ol>
  assert.strictEqual(ol.childNodes[0], ws1);
  assert.strictEqual(ol.childNodes[2], ws2);
});

test('3. ArticleSelectionDock.astro renders notes cards as formatted Markdown without line clamp truncation', () => {
  const dockContent = fs.readFileSync(path.join(rootDir, 'src/components/ArticleSelectionDock.astro'), 'utf8');

  // Verify renderMarkdown is used for all note cards (including highlights)
  assert.match(dockContent, /body\.innerHTML = renderMarkdown\(item\.text\)/);

  // Verify -webkit-line-clamp is unset and max-height is none so text displays completely
  assert.match(dockContent, /-webkit-line-clamp:\s*unset/);
  assert.match(dockContent, /max-height:\s*none/);
});

test('4. ArticleSelectionDock.astro real-time syncs notes list when drawer is already open', () => {
  const dockContent = fs.readFileSync(path.join(rootDir, 'src/components/ArticleSelectionDock.astro'), 'utf8');

  // Verify saveRecords immediately checks is-open and re-renders open drawer
  assert.match(dockContent, /if \(currentDrawer\?\.classList\.contains\('is-open'\)\) \{\s*renderDrawerNotes\(\);/);
});

test('5. PinWorkbench and ArticleSelectionDock coordinate stacking hierarchy and avoid collision', () => {
  const dockContent = fs.readFileSync(path.join(rootDir, 'src/components/ArticleSelectionDock.astro'), 'utf8');
  const workbenchContent = fs.readFileSync(path.join(rootDir, 'src/components/PinWorkbench.astro'), 'utf8');
  const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');

  // Verify PinWorkbench floating window elevated to 100032 base z-index
  assert.match(globalCss, /\.pin-float-window\s*\{[^}]*z-index:\s*100032;/s);

  // Verify PinWorkbench dodges notes drawer when notes drawer is open
  assert.match(workbenchContent, /isNotesDrawerOpen/);

  // Verify pointerdown interaction elevates active window z-index to 100045
  assert.match(workbenchContent, /floatWindow\.style\.zIndex = '100045'/);
  assert.match(dockContent, /drawer\.style\.zIndex = '100045'/);
});
