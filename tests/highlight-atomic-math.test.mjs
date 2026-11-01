import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyRangesAsHighlight,
  removeHighlightFromDOM,
} from '../src/utils/articleHighlightEngine.ts';
import { domRangeToMarkdown } from '../src/utils/inkAskMarkdown.ts';

// ---------------------------------------------------------
// Mock DOM Implementation for Math & Code Highlighting Tests
// ---------------------------------------------------------

class MockNode {
  static ELEMENT_NODE = 1;
  static TEXT_NODE = 3;
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.parentNode = null;
  }
  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }
}
globalThis.Node = MockNode;

class MockTextNode extends MockNode {
  constructor(text) {
    super(3);
    this.nodeValue = text;
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
    if (this.parentNode) {
      const idx = this.parentNode.childNodes.indexOf(this);
      this.parentNode.childNodes.splice(idx + 1, 0, tailNode);
      tailNode.parentNode = this.parentNode;
    }
    return tailNode;
  }
}

class MockClassList {
  constructor() {
    this._set = new Set();
  }
  add(v) {
    this._set.add(v);
  }
  remove(v) {
    this._set.delete(v);
  }
  contains(v) {
    return this._set.has(v);
  }
  has(v) {
    return this._set.has(v);
  }
  delete(v) {
    return this._set.delete(v);
  }
  toString() {
    return Array.from(this._set).join(' ');
  }
}

class MockElement extends MockNode {
  constructor(tagName) {
    super(1);
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.classList = new MockClassList();
    this.dataset = {};
    this.attributes = new Map();
  }
  get id() {
    return this.attributes.get('id') || '';
  }
  set id(v) {
    this.attributes.set('id', String(v));
  }
  get className() {
    return this.classList.toString();
  }
  set className(v) {
    this.classList = new MockClassList();
    for (const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c);
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, v) {
    this.attributes.set(name, String(v));
    if (name === 'class') {
      this.classList = new MockClassList();
      for (const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c);
    }
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  insertBefore(newNode, refNode) {
    if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
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
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  closest(selector) {
    for (const item of selector.split(',')) {
      const s = item.trim();
      if (s.startsWith('.') && this.classList.contains(s.slice(1))) return this;
      if (s.toUpperCase().startsWith('CODE') && this.tagName === 'CODE') {
        if (s.includes(':not(pre code)') && this.parentNode && this.parentNode.tagName === 'PRE') {
          continue;
        }
        return this;
      }
      if (s.toUpperCase() === this.tagName) return this;
    }
    if (this.parentNode && this.parentNode.closest) return this.parentNode.closest(selector);
    return null;
  }
  querySelectorAll(selector) {
    const matches = [];
    const walk = (node) => {
      if (node.nodeType === 1) {
        if (selector.startsWith('mark[data-highlight-id=') && node.tagName === 'MARK') {
          const idMatch = selector.match(/data-highlight-id="([^"]+)"/);
          if (!idMatch || node.dataset.highlightId === idMatch[1]) matches.push(node);
        } else if (selector === 'mark' && node.tagName === 'MARK') {
          matches.push(node);
        }
        for (const c of node.childNodes) walk(c);
      }
    };
    walk(this);
    return matches;
  }
  querySelector(selector) {
    const res = this.querySelectorAll(selector);
    return res[0] || null;
  }
  normalize() {
    const nextChildren = [];
    for (let i = 0; i < this.childNodes.length; i++) {
      const c = this.childNodes[i];
      if (c.nodeType === 3) {
        if (nextChildren.length > 0 && nextChildren[nextChildren.length - 1].nodeType === 3) {
          nextChildren[nextChildren.length - 1].nodeValue += c.nodeValue;
          continue;
        }
      }
      nextChildren.push(c);
    }
    this.childNodes = nextChildren;
  }
}

// Global Document mock for creating mark elements
globalThis.document = {
  createElement(tag) {
    return new MockElement(tag);
  },
};

test('1. 行内数学公式原子化高亮：包裹整个 .katex，不打碎内部 DOM', () => {
  const p = new MockElement('p');
  const t1 = new MockTextNode('在（默认 ');
  p.appendChild(t1);

  // 构建模拟 KaTeX 行内公式结构：
  // <span class="katex"><span class="katex-html"><span class="mord">S</span><span class="mord">inline</span></span></span>
  const katexSpan = new MockElement('span');
  katexSpan.className = 'katex';
  const katexHtml = new MockElement('span');
  katexHtml.className = 'katex-html';
  const mordS = new MockElement('span');
  mordS.className = 'mord';
  const textS = new MockTextNode('S');
  mordS.appendChild(textS);
  const mordInline = new MockElement('span');
  mordInline.className = 'mord';
  const textInline = new MockTextNode('inline');
  mordInline.appendChild(textInline);
  katexHtml.appendChild(mordS);
  katexHtml.appendChild(mordInline);
  katexSpan.appendChild(katexHtml);
  p.appendChild(katexSpan);

  const t2 = new MockTextNode('）的栈空间');
  p.appendChild(t2);

  // 模拟涉及公式内部字符的 ranges
  const nodeRanges = [
    { textNode: t1, localStart: 0, localEnd: t1.nodeValue.length },
    { textNode: textS, localStart: 0, localEnd: 1 },
    { textNode: textInline, localStart: 0, localEnd: 6 },
    { textNode: t2, localStart: 0, localEnd: t2.nodeValue.length },
  ];

  const record = {
    id: 'hl-math-01',
    text: '在（默认 S_inline）的栈空间',
    timestamp: Date.now(),
  };

  const marks = applyRangesAsHighlight(nodeRanges, record);

  // 验证：包含公式整体时，应当产生 3 个 mark（前缀文字、公式整体、后缀文字），而不是拆出 4 个 mark
  assert.strictEqual(marks.length, 3, '应当将 katex 作为一个原子包裹，生成 3 个 mark');

  // 验证中间公式 mark 具有 is-atomic-math 类名，且内部孩子是整个 katexSpan
  const mathMark = marks[1];
  assert.ok(mathMark.classList.has('is-atomic-math'), '公式高亮标记必须包含 is-atomic-math 类');
  assert.strictEqual(mathMark.childNodes[0], katexSpan, 'mark 必须原子包裹整个 katexSpan 容器');
  assert.strictEqual(mordS.childNodes[0], textS, '公式内部 S 节点必须保持原样未被分割');
  assert.strictEqual(mordInline.childNodes[0], textInline, '公式内部 inline 节点必须保持原样未被分割');

  // 验证取消高亮
  removeHighlightFromDOM('hl-math-01', p);
  assert.strictEqual(p.querySelectorAll('mark').length, 0, '取消后 mark 应当全部移除');
  assert.strictEqual(katexSpan.parentNode, p, 'katexSpan 必须完好无损地放回父容器 p 中');
});

test('2. 独立居中大公式卡片高亮：整块卡片高亮包裹并标记 is-display-math-card', () => {
  const container = new MockElement('div');
  const displayDiv = new MockElement('div');
  displayDiv.className = 'katex-display';
  const katexSpan = new MockElement('span');
  katexSpan.className = 'katex';
  const textFormula = new MockTextNode('sizeof(Instance) <= S_inline');
  katexSpan.appendChild(textFormula);
  displayDiv.appendChild(katexSpan);
  container.appendChild(displayDiv);

  const nodeRanges = [
    { textNode: textFormula, localStart: 0, localEnd: textFormula.nodeValue.length },
  ];

  const record = {
    id: 'hl-math-display',
    text: 'sizeof(Instance) <= S_inline',
    timestamp: Date.now(),
  };

  const marks = applyRangesAsHighlight(nodeRanges, record);
  assert.strictEqual(marks.length, 1);
  const cardMark = marks[0];
  assert.ok(cardMark.classList.has('is-display-math-card'), '大公式必须带有 is-display-math-card 类名');
  assert.strictEqual(cardMark.childNodes[0], displayDiv, 'displayDiv 必须整体被 cardMark 包裹');

  // 取消划线
  removeHighlightFromDOM('hl-math-display', container);
  assert.strictEqual(container.querySelectorAll('mark').length, 0);
  assert.strictEqual(displayDiv.parentNode, container, 'displayDiv 必须恢复到 container');
});

test('3. 行内代码融合：code 元素在划线时获得 has-highlight-mark 并在移除时清除', () => {
  const p = new MockElement('p');
  const codeEl = new MockElement('code');
  const codeText = new MockTextNode('TDelegate');
  codeEl.appendChild(codeText);
  p.appendChild(codeEl);

  const nodeRanges = [
    { textNode: codeText, localStart: 0, localEnd: codeText.nodeValue.length },
  ];

  const record = {
    id: 'hl-code-01',
    text: 'TDelegate',
    timestamp: Date.now(),
  };

  const marks = applyRangesAsHighlight(nodeRanges, record);
  assert.strictEqual(marks.length, 1);
  assert.ok(codeEl.classList.has('has-highlight-mark'), 'code 元素必须添加 has-highlight-mark 类以消除背景冲突');

  // 取消划线
  removeHighlightFromDOM('hl-code-01', p);
  assert.ok(!codeEl.classList.has('has-highlight-mark'), '取消高亮后必须清理 has-highlight-mark');
});

test('4. CSS 规则审查：验证 is-atomic-math, is-display-math-card 与 code 融合规则完备', () => {
  const dockCss = fs.readFileSync(path.resolve('src/components/ArticleSelectionDock.astro'), 'utf-8');
  const globalCss = fs.readFileSync(path.resolve('src/styles/global.css'), 'utf-8');

  assert.ok(dockCss.includes('is-atomic-math'), 'ArticleSelectionDock 必须包含 is-atomic-math 样式');
  assert.ok(dockCss.includes('is-display-math-card'), 'ArticleSelectionDock 必须包含 is-display-math-card 样式');
  assert.ok(dockCss.includes('.prose code:has(mark.article-highlight-mark)'), 'ArticleSelectionDock 必须包含 code 融合样式');
  assert.ok(globalCss.includes('.prose code:has(mark.article-highlight-mark)'), 'global.css 必须包含 code 融合样式');
});
