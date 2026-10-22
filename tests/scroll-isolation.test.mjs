import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bindScrollIsolation } from '../src/utils/scrollIsolation.ts';

// 简单轻量的 Mock DOM 模拟运行环境
class MockElement {
  constructor(tagName = 'div', className = '') {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.listeners = {};
    this.parentElement = null;
    this.scrollTop = 0;
    this.scrollHeight = 100;
    this.clientHeight = 100;
    this.scrollLeft = 0;
    this.scrollWidth = 100;
    this.clientWidth = 100;
    this.style = {};
  }

  matches(selector) {
    const parts = selector.split(',').map((s) => s.trim());
    return parts.some((p) => {
      if (p.startsWith('.')) return this.className.split(' ').includes(p.slice(1));
      if (p.startsWith('#')) return this.id === p.slice(1);
      if (p.toLowerCase() === this.tagName.toLowerCase()) return true;
      if (p === '[data-scroll-isolated-body]') return this.hasAttribute && this.hasAttribute('data-scroll-isolated-body');
      return false;
    });
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  addEventListener(type, listener, options) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push({ listener, options });
  }

  removeEventListener(type, listener) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((item) => item.listener !== listener);
  }

  dispatchEvent(event) {
    const list = this.listeners[event.type] || [];
    for (const { listener } of list) {
      listener(event);
    }
  }
}

// 模拟 window.getComputedStyle
globalThis.window = {
  getComputedStyle: (el) => ({
    overflowY: el.style.overflowY || 'visible',
    overflowX: el.style.overflowX || 'visible',
  }),
};

describe('悬浮面板与抽屉滚动边界隔离引擎 (Scroll Isolation Engine)', () => {
  function setupTestDrawer() {
    const drawer = new MockElement('aside', 'article-notes-drawer');
    const header = new MockElement('div', 'notes-drawer-header');
    const body = new MockElement('div', 'notes-drawer-body');
    const emptyState = new MockElement('div', 'notes-empty-state');
    const footer = new MockElement('div', 'notes-drawer-footer');

    header.parentElement = drawer;
    body.parentElement = drawer;
    emptyState.parentElement = body;
    footer.parentElement = drawer;

    const unbind = bindScrollIsolation(drawer, {
      scrollableSelector: '.notes-drawer-body',
    });

    return { drawer, header, body, emptyState, footer, unbind };
  }

  it('1. 在面板头部或底部非滚动区域滚轮：100% 阻止冒泡与默认行为，杜绝文章正文滚动', () => {
    const { drawer, header, footer } = setupTestDrawer();

    let preventedHeader = false;
    let stoppedHeader = false;
    const wheelEventHeader = {
      type: 'wheel',
      target: header,
      deltaX: 0,
      deltaY: 50,
      preventDefault: () => { preventedHeader = true; },
      stopPropagation: () => { stoppedHeader = true; },
    };
    drawer.dispatchEvent(wheelEventHeader);
    assert.equal(preventedHeader, true, '头部滚轮必须 preventDefault');
    assert.equal(stoppedHeader, true, '头部滚轮必须 stopPropagation');

    let preventedFooter = false;
    const wheelEventFooter = {
      type: 'wheel',
      target: footer,
      deltaX: 0,
      deltaY: -30,
      preventDefault: () => { preventedFooter = true; },
      stopPropagation: () => {},
    };
    drawer.dispatchEvent(wheelEventFooter);
    assert.equal(preventedFooter, true, '底部滚轮必须 preventDefault');
  });

  it('2. 在无滚动条的空状态（如暂无笔记，scrollHeight <= clientHeight）滚轮：彻底阻断穿透滚动', () => {
    const { drawer, body, emptyState } = setupTestDrawer();
    // 0 条笔记时：内容高度为 300px，容器高度为 600px
    body.clientHeight = 600;
    body.scrollHeight = 300;
    body.scrollTop = 0;

    let preventedDown = false;
    drawer.dispatchEvent({
      type: 'wheel',
      target: emptyState,
      deltaX: 0,
      deltaY: 40,
      preventDefault: () => { preventedDown = true; },
      stopPropagation: () => {},
    });
    assert.equal(preventedDown, true, '空状态向下滚动必须 preventDefault');

    let preventedUp = false;
    drawer.dispatchEvent({
      type: 'wheel',
      target: emptyState,
      deltaX: 0,
      deltaY: -40,
      preventDefault: () => { preventedUp = true; },
      stopPropagation: () => {},
    });
    assert.equal(preventedUp, true, '空状态向上滚动必须 preventDefault');
  });

  it('3. 在多条笔记可滚动列表中间区域滚轮：放行内部容器自然平滑滚动，且阻止冒泡至全局', () => {
    const { drawer, body } = setupTestDrawer();
    body.clientHeight = 500;
    body.scrollHeight = 1200;
    body.scrollTop = 200; // 处于中间

    let preventedMidDown = false;
    let stoppedMidDown = false;
    drawer.dispatchEvent({
      type: 'wheel',
      target: body,
      deltaX: 0,
      deltaY: 40,
      preventDefault: () => { preventedMidDown = true; },
      stopPropagation: () => { stoppedMidDown = true; },
    });
    assert.equal(preventedMidDown, false, '中间区域正常向下滚动不可 preventDefault');
    assert.equal(stoppedMidDown, true, '必须 stopPropagation 防止外部平滑滚动库联动');

    let preventedMidUp = false;
    drawer.dispatchEvent({
      type: 'wheel',
      target: body,
      deltaX: 0,
      deltaY: -40,
      preventDefault: () => { preventedMidUp = true; },
      stopPropagation: () => {},
    });
    assert.equal(preventedMidUp, false, '中间区域正常向上滚动不可 preventDefault');
  });

  it('4. 滚动到达容器顶部或底部边界时：阻断级联穿透，防止正文被拉动', () => {
    const { drawer, body } = setupTestDrawer();
    body.clientHeight = 500;
    body.scrollHeight = 1200;

    // 处于顶部
    body.scrollTop = 0;
    let preventedTopUp = false;
    drawer.dispatchEvent({
      type: 'wheel',
      target: body,
      deltaX: 0,
      deltaY: -30,
      preventDefault: () => { preventedTopUp = true; },
      stopPropagation: () => {},
    });
    assert.equal(preventedTopUp, true, '到达顶部继续向上滚必须 preventDefault');

    // 在顶部向下滚放行
    let preventedTopDown = false;
    drawer.dispatchEvent({
      type: 'wheel',
      target: body,
      deltaX: 0,
      deltaY: 30,
      preventDefault: () => { preventedTopDown = true; },
      stopPropagation: () => {},
    });
    assert.equal(preventedTopDown, false, '到达顶部向下滚应正常放行');

    // 处于底部
    body.scrollTop = 700; // 700 + 500 = 1200
    let preventedBottomDown = false;
    drawer.dispatchEvent({
      type: 'wheel',
      target: body,
      deltaX: 0,
      deltaY: 30,
      preventDefault: () => { preventedBottomDown = true; },
      stopPropagation: () => {},
    });
    assert.equal(preventedBottomDown, true, '到达底部继续向下滚必须 preventDefault');

    // 在底部向上滚放行
    let preventedBottomUp = false;
    drawer.dispatchEvent({
      type: 'wheel',
      target: body,
      deltaX: 0,
      deltaY: -30,
      preventDefault: () => { preventedBottomUp = true; },
      stopPropagation: () => {},
    });
    assert.equal(preventedBottomUp, false, '到达底部向上滚应正常放行');
  });

  it('5. 触屏/移动端 touchmove 边界隔离与空状态阻断', () => {
    const { drawer, body, emptyState } = setupTestDrawer();
    body.clientHeight = 600;
    body.scrollHeight = 300; // 空状态

    drawer.dispatchEvent({
      type: 'touchstart',
      touches: [{ clientY: 200, clientX: 100 }],
    });

    let touchPrevented = false;
    drawer.dispatchEvent({
      type: 'touchmove',
      touches: [{ clientY: 150, clientX: 100 }], // 上划拖动 deltaY = 50
      cancelable: true,
      preventDefault: () => { touchPrevented = true; },
    });
    assert.equal(touchPrevented, true, '触屏空状态下滑动必须 preventDefault');
  });

  it('6. unbind 函数能正确解绑所有监听器', () => {
    const { drawer, unbind } = setupTestDrawer();
    assert.ok(drawer.listeners['wheel'].length > 0);
    unbind();
    assert.equal(drawer.listeners['wheel'].length, 0);
    assert.equal(drawer.listeners['touchstart'].length, 0);
    assert.equal(drawer.listeners['touchmove'].length, 0);
  });
});
