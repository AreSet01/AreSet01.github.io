import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import {
  collectRangeTextRects,
  collectMarkRects,
  classifyRectsToGeometry,
} from '../src/utils/unifiedHighlightGeometry.ts';
import {
  SITE_CONTEXT_MENU_ITEMS,
  getEditableTarget,
  inspectContextMenuState,
  computeContextMenuPosition,
  applyInputTextEdit,
  mountSiteContextMenu,
} from '../src/utils/siteContextMenu.ts';

describe('统一整体划线 / 选中 & 全站自定义右键菜单套件', () => {
  const rootDir = process.cwd();
  const selectionDock = fs.readFileSync(path.join(rootDir, 'src/components/ArticleSelectionDock.astro'), 'utf8');
  const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');
  const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');

  it('1. 几何分类引擎：单行跨越正文与行内 code 时生成完整连续条带并覆盖 inline code', () => {
    const dom = new JSDOM(
      `<div class="prose"><p>优先调用 <code id="c1">BaseAllocator()</code> 实例化。</p></div>`,
    );
    const { document } = dom.window;
    const prose = document.querySelector('.prose');
    const p = document.querySelector('p');
    const code = document.getElementById('c1');
    const text1 = p.firstChild;
    const codeText = code.firstChild;
    const text2 = p.lastChild;

    // Mock client rects inside same single line (top: 100..122)
    const mockRangeProto = dom.window.Range.prototype;
    const origGetClientRects = mockRangeProto.getClientRects;
    mockRangeProto.getClientRects = function () {
      const node = this.startContainer;
      if (node === text1) return [{ left: 40, top: 100, right: 112, bottom: 122, width: 72, height: 22 }];
      if (node === codeText) return [{ left: 118, top: 102, right: 240, bottom: 120, width: 122, height: 18 }];
      if (node === text2) return [{ left: 246, top: 100, right: 310, bottom: 122, width: 64, height: 22 }];
      return [];
    };
    code.getBoundingClientRect = () => ({ left: 113, top: 99, right: 245, bottom: 123, width: 132, height: 24 });

    try {
      const range = document.createRange();
      range.setStart(text1, 0);
      range.setEnd(text2, text2.length);

      const collected = collectRangeTextRects(range, prose);
      assert.equal(collected.isPurePre, false);
      assert.equal(collected.coveredInlineCodes.size, 1);
      assert.equal(collected.coveredInlineCodes.has(code), true);

      const geom = classifyRectsToGeometry(collected, { left: 40, top: 80, width: 700, height: 300 });
      assert.equal(geom.mode, 'single');
      assert.ok(geom.band);
      assert.equal(geom.band.left, -3);
      assert.equal(Math.round(geom.band.width), Math.round(310 - 40 + 6));
    } finally {
      mockRangeProto.getClientRects = origGetClientRects;
    }
  });

  it('2. 几何分类引擎：仅选中单个 inline code 内部文本时保留 code 卡片边框', () => {
    const dom = new JSDOM(`<div class="prose"><p>调用 <code id="c1">FPlatformMemory::BaseAllocator()</code> 函数</p></div>`);
    const { document } = dom.window;
    const prose = document.querySelector('.prose');
    const code = document.getElementById('c1');
    const codeText = code.firstChild;

    dom.window.Range.prototype.getClientRects = () => [
      { left: 120, top: 102, right: 210, bottom: 120, width: 90, height: 18 },
    ];
    code.getBoundingClientRect = () => ({ left: 110, top: 99, right: 280, bottom: 123, width: 170, height: 24 });

    const range = document.createRange();
    range.setStart(codeText, 17);
    range.setEnd(codeText, 30);

    const collected = collectRangeTextRects(range, prose);
    assert.equal(collected.coveredInlineCodes.size, 0);
    const geom = classifyRectsToGeometry(collected, { left: 40, top: 80, width: 700, height: 300 });
    assert.equal(geom.mode, 'single');
  });

  it('3. 几何分类引擎：多行或跨段落/列表选区合并为对齐阅读区的整体 block，纯 pre 返回 none', () => {
    const dom = new JSDOM(
      `<div class="prose"><p id="p1">第一段文字</p><ul><li id="li1">列表项 <code>GMalloc</code> 内容</li></ul><pre><code id="precode">int x = 1;</code></pre></div>`,
    );
    const { document } = dom.window;
    const prose = document.querySelector('.prose');
    const p1 = document.getElementById('p1');
    const li1 = document.getElementById('li1');
    const preCode = document.getElementById('precode');

    dom.window.Range.prototype.getClientRects = function () {
      if (this.startContainer === p1.firstChild) {
        return [{ left: 40, top: 100, right: 320, bottom: 122, width: 280, height: 22 }];
      }
      if (this.startContainer === li1.firstChild) {
        return [{ left: 64, top: 148, right: 240, bottom: 170, width: 176, height: 22 }];
      }
      if (this.startContainer === preCode.firstChild) {
        return [{ left: 56, top: 210, right: 160, bottom: 230, width: 104, height: 20 }];
      }
      return [];
    };

    const crossRange = document.createRange();
    crossRange.setStart(p1.firstChild, 0);
    crossRange.setEnd(li1.firstChild, li1.firstChild.length);
    const collectedCross = collectRangeTextRects(crossRange, prose);
    const crossGeom = classifyRectsToGeometry(collectedCross, { left: 40, top: 80, width: 700, height: 400 });
    assert.equal(crossGeom.mode, 'block');
    assert.equal(crossGeom.top, 15);
    assert.equal(crossGeom.height, 80);

    // Persisted mark classification check
    const m1 = document.createElement('mark');
    const m2 = document.createElement('mark');
    p1.appendChild(m1);
    li1.appendChild(m2);
    m1.getClientRects = () => [{ left: 40, top: 100, right: 320, bottom: 122, width: 280, height: 22 }];
    m2.getClientRects = () => [{ left: 64, top: 148, right: 240, bottom: 170, width: 176, height: 22 }];
    const markGeom = classifyRectsToGeometry(collectMarkRects([m1, m2], prose), {
      left: 40,
      top: 80,
      width: 700,
      height: 400,
    });
    assert.equal(markGeom.mode, 'block');

    // Pure <pre> code block keeps native code highlight/selection
    const preRange = document.createRange();
    preRange.setStart(preCode.firstChild, 0);
    preRange.setEnd(preCode.firstChild, preCode.firstChild.length);
    const preCollected = collectRangeTextRects(preRange, prose);
    assert.equal(preCollected.isPurePre, true);
    const preGeom = classifyRectsToGeometry(preCollected, { left: 40, top: 80, width: 700, height: 400 });
    assert.equal(preGeom.mode, 'none');
  });

  it('4. 右键菜单项定义：严格只含 返回/复制/刷新/粘贴/剪切 五项且状态判定精确', () => {
    assert.deepEqual(
      SITE_CONTEXT_MENU_ITEMS.map((item) => item.label),
      ['返回', '复制', '刷新', '粘贴', '剪切'],
    );
    assert.deepEqual(
      SITE_CONTEXT_MENU_ITEMS.map((item) => item.action),
      ['back', 'copy', 'reload', 'paste', 'cut'],
    );

    const dom = new JSDOM(`
      <p id="plain">Hello World</p>
      <input id="txt" type="text" value="abcdef" />
      <input id="pwd" type="password" value="secret" />
      <input id="ro" type="text" readonly value="locked" />
    `, { url: 'https://areset.xyz/posts/test' });

    const { window: win, document: doc } = dom.window;
    Object.defineProperty(win, 'navigation', { value: { canGoBack: false }, configurable: true });
    win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });

    // Plain prose with no selection & no history
    const s1 = inspectContextMenuState(doc.getElementById('plain'), win, doc);
    assert.deepEqual(
      { back: s1.canBack, copy: s1.canCopy, reload: s1.canReload, paste: s1.canPaste, cut: s1.canCut },
      { back: false, copy: false, reload: true, paste: false, cut: false },
    );

    // Input with selected slice & available history
    Object.defineProperty(win, 'navigation', { value: { canGoBack: true }, configurable: true });
    const txt = doc.getElementById('txt');
    txt.setSelectionRange(1, 4);
    const s2 = inspectContextMenuState(txt, win, doc);
    assert.deepEqual(
      { back: s2.canBack, copy: s2.canCopy, reload: s2.canReload, paste: s2.canPaste, cut: s2.canCut, copyText: s2.copyText },
      { back: true, copy: true, reload: true, paste: true, cut: true, copyText: 'bcd' },
    );

    // Input with caret only (no selection) -> canPaste yes, canCut/canCopy no
    txt.setSelectionRange(2, 2);
    const s3 = inspectContextMenuState(txt, win, doc);
    assert.deepEqual(
      { copy: s3.canCopy, paste: s3.canPaste, cut: s3.canCut },
      { copy: false, paste: true, cut: false },
    );

    // Password input blocks copy & cut even when selected, permits paste
    const pwd = doc.getElementById('pwd');
    pwd.setSelectionRange(0, 6);
    const s4 = inspectContextMenuState(pwd, win, doc);
    assert.deepEqual(
      { copy: s4.canCopy, paste: s4.canPaste, cut: s4.canCut },
      { copy: false, paste: true, cut: false },
    );

    // Readonly input blocks paste & cut
    assert.equal(getEditableTarget(doc.getElementById('ro')), null);
  });

  it('5. 右键菜单视口边界钳制、文本编辑事件与端到端 DOM 挂载交互', async () => {
    const posRightBottom = computeContextMenuPosition(1250, 760, 170, 185, 1280, 800, 10);
    assert.ok(posRightBottom.left <= 1280 - 170 - 10);
    assert.ok(posRightBottom.top <= 800 - 185 - 10);
    assert.equal(posRightBottom.origin, 'bottom right');

    const dom = new JSDOM(`<p id="p">测试选区内容</p><textarea id="ta">hello world</textarea>`, {
      url: 'https://areset.xyz/notes',
    });
    const { window: win, document: doc } = dom.window;
    win.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });

    const written = [];
    let clipboardReadValue = 'XYZ';
    Object.defineProperty(win.navigator, 'clipboard', {
      value: {
        writeText: async (t) => {
          written.push(t);
        },
        readText: async () => clipboardReadValue,
      },
      configurable: true,
    });

    const cleanup = mountSiteContextMenu(win, doc);
    try {
      const menu = doc.getElementById('site-context-menu');
      assert.ok(menu);
      const items = menu.querySelectorAll('[role="menuitem"]');
      assert.equal(items.length, 5);

      const ta = doc.getElementById('ta');
      ta.setSelectionRange(0, 5);
      let inputFired = false;
      ta.addEventListener('input', () => {
        inputFired = true;
      });

      const ctxEv = new win.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 120,
      });
      ta.dispatchEvent(ctxEv);
      assert.equal(ctxEv.defaultPrevented, true);
      assert.equal(menu.hidden, false);

      // Click Paste -> replaces "hello" with "XYZ"
      const pasteBtn = menu.querySelector('[data-ctx-action="paste"]');
      assert.equal(pasteBtn.disabled, false);
      pasteBtn.click();
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(ta.value, 'XYZ world');
      assert.equal(inputFired, true);
      assert.equal(menu.hidden, true);

      // Reopen on selection and click Cut -> removes "XYZ "
      ta.setSelectionRange(0, 4);
      ta.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 60 }));
      const cutBtn = menu.querySelector('[data-ctx-action="cut"]');
      cutBtn.click();
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(ta.value, 'world');
      assert.equal(written.at(-1), 'XYZ ');

      // Escape dismisses open menu
      doc.getElementById('p').dispatchEvent(
        new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }),
      );
      assert.equal(menu.hidden, false);
      doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.equal(menu.hidden, true);

      // Direct applyInputTextEdit verification
      applyInputTextEdit(ta, 'new ', 0, 0);
      assert.equal(ta.value, 'new world');

      // Right-click (mousedown button 2) followed by browser selection collapse restores selection on contextmenu
      ta.setSelectionRange(0, 3);
      const rmd = new win.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2 });
      ta.dispatchEvent(rmd);
      assert.equal(rmd.defaultPrevented, true);
      ta.setSelectionRange(3, 3); // simulate browser caret collapse on right-click
      ta.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 }));
      assert.equal(menu.querySelector('[data-ctx-action="copy"]').disabled, false);
      assert.equal(menu.querySelector('[data-ctx-action="cut"]').disabled, false);
    } finally {
      cleanup();
    }
  });

  it('6. 核心文件接线与主题样式完整性验证', () => {
    assert.match(selectionDock, /prose-highlight-backdrop/);
    assert.match(selectionDock, /prose-selection-backdrop/);
    assert.match(selectionDock, /\.article-highlight-block/);
    assert.match(selectionDock, /\.article-highlight-band/);
    assert.match(selectionDock, /\.article-selection-block/);
    assert.match(selectionDock, /\.article-selection-band/);
    assert.match(selectionDock, /mark\.article-highlight-mark\.is-block-highlight/);
    assert.match(selectionDock, /mark\.article-highlight-mark\.is-band-highlight/);

    assert.match(globalCss, /\.prose\s*\{[\s\S]*?isolation:\s*isolate;/);
    assert.match(globalCss, /\.prose\.has-unified-selection\s*::selection/);
    assert.match(globalCss, /code\[data-sel-covered="true"\]/);
    assert.match(globalCss, /\.site-ctx-menu/);
    assert.match(globalCss, /\[data-theme="dark"\]\s*\.site-ctx-menu/);
    assert.match(globalCss, /\[data-theme="moss"\]\s*\.site-ctx-menu/);
    assert.match(globalCss, /\[data-theme="rice"\]\s*\.site-ctx-menu/);

    assert.match(baseLayout, /mountSiteContextMenu/);
  });
});
