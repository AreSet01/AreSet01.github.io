import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as nodeModule from 'node:module';
import { JSDOM } from 'jsdom';

import { readArticleMotion } from '../src/utils/articleMotion.ts';
import { waitForPostEntrance } from '../src/utils/postEntranceGate.ts';
import {
  classifyRectsToGeometry,
  computeWetInkStrokeDuration,
} from '../src/utils/unifiedHighlightGeometry.ts';
import { clampPanelSize, makeResizable } from '../src/utils/panelResize.ts';

const rootDir = process.cwd();
const readSrc = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

async function createTsStripper() {
  if (typeof nodeModule.stripTypeScriptTypes === 'function') {
    return nodeModule.stripTypeScriptTypes;
  }
  const esbuild = await import('esbuild');
  return (code) => esbuild.transformSync(code, { loader: 'ts' }).code;
}
const stripTs = await createTsStripper();

describe('Reader & Companion Motion Upgrade Suite (宣纸批注 · 朱砂钤印 · 书法飞白)', () => {
  it('1. PostLayout & global.css: H2/H3 完成态严格归零、单次显现零回滚闪烁、脊线运笔朱砂微芒与毛笔分割线', () => {
    const globalCss = readSrc('src/styles/global.css');
    const postLayout = readSrc('src/layouts/PostLayout.astro');

    // JSDOM 样式计算验证：.prose .pr[data-pr="heading"].is-in 与 subheading 完成态绝无残留负向位移
    const prSliceStart = globalCss.indexOf('/* ---------- Generic block ---------- */');
    const prSliceEnd = globalCss.indexOf('/* ================= Site-entry curtain');
    assert.ok(prSliceStart !== -1 && prSliceEnd > prSliceStart, '必须定位到正文显现样式区块');
    const prCss = globalCss.slice(prSliceStart, prSliceEnd);

    const dom = new JSDOM(`
      <!doctype html>
      <html>
        <head><style>${prCss}</style></head>
        <body>
          <div class="prose">
            <h2 class="pr" data-pr="heading">未入场 H2</h2>
            <h2 class="pr is-in" data-pr="heading">已入场 H2</h2>
            <h3 class="pr" data-pr="subheading">未入场 H3</h3>
            <h3 class="pr is-in" data-pr="subheading">已入场 H3</h3>
          </div>
        </body>
      </html>
    `);
    try {
      const [h2Pre, h2In, h3Pre, h3In] = dom.window.document.querySelectorAll('h2, h3');
      assert.equal(
        dom.window.getComputedStyle(h2Pre).transform,
        'translate3d(-10px, 0, 0)',
        'H2 未入场前应仅对 :not(.is-in) 设置轻盈起笔偏移'
      );
      assert.equal(
        dom.window.getComputedStyle(h2In).transform,
        'translate3d(0, 0, 0)',
        'H2 .pr.is-in 完成态位移必须严格归零，绝无 -18px/-14px 残留'
      );
      assert.equal(dom.window.getComputedStyle(h2In).opacity, '1');
      assert.equal(
        dom.window.getComputedStyle(h3Pre).transform,
        'translate3d(-8px, 0, 0)',
        'H3 未入场前应仅对 :not(.is-in) 设置轻盈起笔偏移'
      );
      assert.equal(
        dom.window.getComputedStyle(h3In).transform,
        'translate3d(0, 0, 0)',
        'H3 .pr.is-in 完成态位移必须严格归零，绝无 -14px/-10px 残留'
      );
      assert.equal(dom.window.getComputedStyle(h3In).opacity, '1');
    } finally {
      dom.window.close();
    }

    // 长列表与大表格排队上限收敛至 <= 3，杜绝数十行慢动作排队
    assert.match(postLayout, /Math\.min\(i,\s*3\)/, '长表格与长列表交错排队索引上限须收敛至 3');
    assert.match(postLayout, /revealObserver\.unobserve\(el\)/, '已读段落显现后立即 unobserve，杜绝回滚闪烁');
    assert.doesNotMatch(postLayout, /resetObserver/, '不得保留剥离已读段落 .is-in 的 resetObserver');

    // 左缘阅读脊线柔顺阻尼运笔 + 经过标题时墨点晕开朱砂微芒
    assert.match(postLayout, /stepSpineBrush/, '阅读脊线须采用 rAF 柔顺阻尼运笔插值');
    assert.match(globalCss, /\.post-spine-dot\.is-lit::after[\s\S]*?spineDotCinnabarBloom/, '经过章节标题时墨点须晕开朱砂微芒');
    assert.match(globalCss, /\.prose\s+\.pr\[data-pr="heading"\]::before[\s\S]*?linear-gradient\([\s\S]*?var\(--vermilion/, 'H2 分割线须如毛笔朱墨起收笔延展');

    // 引用块大引号去静态 blur 且无过冲
    const bqSlice = globalCss.slice(globalCss.indexOf('.prose blockquote::before'), globalCss.indexOf('[data-theme="dark"] .prose blockquote'));
    assert.doesNotMatch(bqSlice, /filter:\s*blur/i, '引用块大引号不得带静态或动态 blur 滤镜');
  });

  it('2. PostLayout JSDOM 交互验证: 代码块按高度自适应时长折叠/展开、「钤印已录」复制反馈与章节跳转抵达「水墨底纹轻拂」', async () => {
    const postLayout = readSrc('src/layouts/PostLayout.astro');
    const enhancementsScript = [...postLayout.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      .find((code) => code.includes('__areSetPostEnhancementsCleanup__'));
    assert.ok(enhancementsScript, '必须提取到 PostLayout 增强脚本');

    const html = `
      <div data-post-prose>
        <h2 id="sec-near">近处章节</h2>
        <h2 id="sec-far">远处章节</h2>
        <pre><code>${'const ink = 1;\n'.repeat(28)}</code></pre>
      </div>
    `;
    const dom = new JSDOM(html, { url: 'http://localhost/posts/motion', runScripts: 'outside-only' });
    const { window } = dom;
    window.matchMedia = () => ({ matches: false });
    let copiedText = '';
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (txt) => { copiedText = txt; } },
    });

    const recordedAnims = [];
    window.HTMLElement.prototype.animate = function (keyframes, options) {
      const anim = {
        keyframes,
        options,
        onfinish: null,
        oncancel: null,
        cancel() { if (this.oncancel) this.oncancel(); },
      };
      recordedAnims.push({ el: this, keyframes, options, anim });
      return anim;
    };

    const rafCallbacks = new Map();
    let rafSeq = 0;
    window.requestAnimationFrame = (cb) => {
      const id = ++rafSeq;
      rafCallbacks.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      rafCallbacks.delete(id);
    };

    try {
      window.eval(enhancementsScript);

      const pre = window.document.querySelector('pre');
      const collapseBtn = pre.querySelector('.code-collapse-button');
      const copyBtn = pre.querySelector('.code-copy-button');

      // 模拟短高差 (320px -> 240px) 与长高差 (1400px -> 240px) 代码块折叠时长自适应
      let currentRectH = 320;
      Object.defineProperty(pre, 'scrollHeight', { configurable: true, get: () => 1400 });
      pre.getBoundingClientRect = () => ({ top: 100, left: 0, width: 600, height: currentRectH, bottom: 100 + currentRectH, right: 600 });

      collapseBtn.click(); // 折叠短高差 (delta = 80px)
      const shortCollapseDuration = recordedAnims.at(-1).options.duration;
      currentRectH = 240;
      collapseBtn.click(); // 展开大高差 (240 -> 1400, delta = 1160px)
      const tallExpandDuration = recordedAnims.at(-1).options.duration;

      assert.ok(shortCollapseDuration >= 280 && shortCollapseDuration <= 360, `短代码块折叠应轻巧迅速 (${shortCollapseDuration}ms)`);
      assert.ok(tallExpandDuration > shortCollapseDuration && tallExpandDuration <= 580, `长代码块展开应按高度自适应拉长且有上限 (${tallExpandDuration}ms)`);

      // 复制按钮「钤印已录」反馈
      copyBtn.click();
      await new Promise((r) => setTimeout(r, 15));
      assert.ok(copiedText.includes('const ink = 1;'));
      assert.ok(copyBtn.classList.contains('is-copied'), '复制后必须挂载 is-copied 状态');
      assert.ok(copyBtn.textContent.includes('钤印已录'), '复制按钮须呈现「钤印已录」反馈');

      // 章节跳转：远处目标滚动未抵达前不抢跑，连点反向目标自动取消旧监听，抵达阅读带后触发 .is-anchor-target
      const nearH2 = window.document.getElementById('sec-near');
      const farH2 = window.document.getElementById('sec-far');
      let farTop = 980;
      nearH2.getBoundingClientRect = () => ({ top: 68, left: 0, width: 500, height: 36, bottom: 104, right: 500 });
      farH2.getBoundingClientRect = () => ({ top: farTop, left: 0, width: 500, height: 36, bottom: farTop + 36, right: 500 });

      window.__pulseHeadingTarget(farH2);
      assert.equal(farH2.classList.contains('is-anchor-target'), false, '远处标题尚未滚入视口时绝不可提前空放动画');

      // 连点近处标题：取消对 farH2 的等待并立即对已在阅读带的 nearH2 轻拂水墨底纹
      window.__pulseHeadingTarget(nearH2);
      assert.equal(nearH2.classList.contains('is-anchor-target'), true, '已在视口阅读带的标题立即触发水墨底纹轻拂');
      assert.equal(rafCallbacks.size, 0, '连点新目标时必须取消上一目标的抵达观察 rAF');

      // 再次点击远处标题并模拟滚动抵达 70px 停靠位
      window.__pulseHeadingTarget(farH2);
      assert.equal(farH2.classList.contains('is-anchor-target'), false);
      farTop = 70;
      for (let step = 0; step < 3; step++) {
        const cbs = [...rafCallbacks.values()];
        rafCallbacks.clear();
        cbs.forEach((fn) => fn(step * 16));
      }
      assert.equal(farH2.classList.contains('is-anchor-target'), true, '滚动抵达停靠带后精准触发水墨底纹轻拂');
      assert.equal(nearH2.classList.contains('is-anchor-target'), false, '旧标题高亮自动让位，不残留双份底纹');

      assert.match(postLayout, /headingInkWashSweep/, '章节抵达反馈必须采用 GPU scaleX 水墨底纹轻拂');
      assert.doesNotMatch(postLayout, /@keyframes\s+headingAnchorPulse/, '必须移除耗性能的 box-shadow 脉冲关键帧');
    } finally {
      window.__areSetPostEnhancementsCleanup__?.();
      window.close();
    }
  });

  it('3. 加密文章「破封启卷」水墨解锁与错密轻震验证', async () => {
    const postLayout = readSrc('src/layouts/PostLayout.astro');
    const lockScriptMatch = postLayout.match(/\{isLocked && \(\s*<script is:inline data-astro-rerun>([\s\S]*?)<\/script>\s*\)\}/);
    assert.ok(lockScriptMatch, '必须找到加密文章解锁脚本');

    // SHA-256("open-sesame")
    const cryptoSubtle = globalThis.crypto.subtle;
    const hashBuf = await cryptoSubtle.digest('SHA-256', new TextEncoder().encode('open-sesame'));
    const expectedHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const dom = new JSDOM(`
      <article data-locked-post="true" data-lock-key="${expectedHash}">
        <section class="lock-panel" data-lock-panel>
          <form data-lock-form>
            <input class="lock-input" name="password" value="wrong" />
            <button type="submit">Unlock</button>
          </form>
          <p data-lock-message></p>
        </section>
        <div data-locked-content="true" hidden>机密正文</div>
      </article>
    `, { url: 'http://localhost/posts/secret', runScripts: 'outside-only' });

    const { window } = dom;
    window.TextEncoder = TextEncoder;
    Object.defineProperty(window, 'crypto', { configurable: true, value: globalThis.crypto });
    window.matchMedia = () => ({ matches: false });

    let unlockedEvents = 0;
    window.addEventListener('post-unlocked', () => { unlockedEvents += 1; });

    try {
      window.eval(lockScriptMatch[1]);
      const form = window.document.querySelector('[data-lock-form]');
      const input = window.document.querySelector('.lock-input');
      const panel = window.document.querySelector('[data-lock-panel]');
      const content = window.document.querySelector('[data-locked-content="true"]');

      // 1. 错密触发笔触轻震
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(input.classList.contains('is-error-shake'), true, '密码错误时输入框应触发错密轻震反馈');
      assert.equal(content.hidden, true);

      // 2. 正确密码触发「破封启卷」水墨动效
      input.value = 'open-sesame';
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(panel.classList.contains('is-unsealing'), true, '密码正确后锁面板先进入破封态 is-unsealing');

      panel.dispatchEvent(new window.Event('animationend'));
      assert.equal(panel.hidden, true, '破封动画结束后隐藏锁面板');
      assert.equal(content.hidden, false, '正文解除隐藏');
      assert.equal(content.classList.contains('is-unfurling'), true, '正文展卷呈现 is-unfurling 动效');
      assert.equal(unlockedEvents, 1, '派发 post-unlocked 通知目录与正文显现初始化');
    } finally {
      window.close();
    }
  });

  it('4. ArticleSelectionDock & unifiedHighlightGeometry: ~220ms 轻盈宣纸托盘、湿墨运笔晕染与笺注浮窗', () => {
    const dock = readSrc('src/components/ArticleSelectionDock.astro');

    // 自适应湿墨运笔时长几何计算验证
    const narrowSingle = classifyRectsToGeometry(
      {
        rects: [{ left: 40, top: 20, right: 120, bottom: 42, width: 80, height: 22 }],
        extraInlineCodeRects: [],
        coveredInlineCodes: new Set(),
        distinctBlockCount: 1,
        isPurePre: false,
      },
      { left: 0, top: 0, width: 680, height: 900 }
    );
    const wideBlock = classifyRectsToGeometry(
      {
        rects: [
          { left: 20, top: 20, right: 620, bottom: 42, width: 600, height: 22 },
          { left: 20, top: 52, right: 620, bottom: 74, width: 600, height: 22 },
          { left: 20, top: 84, right: 480, bottom: 106, width: 460, height: 22 },
        ],
        extraInlineCodeRects: [],
        coveredInlineCodes: new Set(),
        distinctBlockCount: 1,
        isPurePre: false,
      },
      { left: 0, top: 0, width: 680, height: 900 }
    );
    const dNarrow = computeWetInkStrokeDuration(narrowSingle);
    const dWide = computeWetInkStrokeDuration(wideBlock);
    assert.ok(dNarrow >= 400 && dNarrow <= 540, `短句湿墨时长应在灵动区间 (${dNarrow}ms)`);
    assert.ok(dWide > dNarrow && dWide <= 600, `多行块级湿墨时长应随行数自然舒展 (${dWide}ms)`);

    // 划词托盘 ~220ms 宣纸舒展、无 blur
    assert.match(dock, /selection-dock-in\s+220ms\s+var\(--article-ease-surface\)/, '划词浮层入场须提速至 ~220ms 灵动曲线');
    assert.match(dock, /selection-dock-out\s+170ms\s+var\(--article-ease-layout\)/, '划词浮层收拢须干脆利落 (~170ms)');
    assert.match(dock, /@keyframes\s+wetInkBrushFront/, '块级与条带划线须包含湿墨前锋浸润收干关键帧');
    assert.match(dock, /\[data-theme="rice"\]\s+\.note-hover-tooltip-card/, '1s 笺注悬停卡须完整适配米黄宣纸主题');
    assert.doesNotMatch(dock, /(?<![a-z-])filter\s*:\s*[^;]*blur\(/i, 'ArticleSelectionDock 全文件不得残留任何动态 filter: blur');
  });

  it('5. InkAsk: 「问」字朱砂印钤落墨环、双笔飞白墨圈、圆形墨晕渗开、呼吸墨滴收笔回墨与零 blur', () => {
    const inkAsk = readSrc('src/components/InkAsk.astro');

    assert.match(inkAsk, /ink-ask-seal-glyph[\s\S]*?>问</, '划词印章须呈现书法「问」字朱砂钤印');
    assert.match(inkAsk, /\.ink-ask-seal\.is-popping::before[\s\S]*?\.ink-ask-seal\.is-popping::after/, '「问」字印章钤落时须荡开双层同心墨环');
    assert.match(inkAsk, /\.ink-ask-ring\.is-drawn\s+\.ink-ask-ring-echo[\s\S]*?stroke-dasharray:/, '墨圈副笔须呈现干擦断续的书法飞白笔意');
    assert.match(inkAsk, /\.ink-ask-ring\.is-drying\s+path[\s\S]*?stroke-dashoffset:\s*-1/, '关闭墨问时墨圈须顺势收笔回墨');
    assert.match(inkAsk, /\.ink-ask-card\.is-opening[\s\S]*?clip-path\s+420ms\s+var\(--article-ease-surface\)/, '墨问卡片须自印章原点圆形墨晕渗开');
    assert.match(inkAsk, /function\s+settleCaret\(/, '流式回答结束时须执行呼吸墨滴收笔回墨');
    assert.doesNotMatch(inkAsk, /(?<![a-z-])filter\s*:\s*[^;]*blur\(/i, 'InkAsk 全文件不得残留任何动态 filter: blur');
  });

  it('6. CompanionLayout & panelResize: 抽屉推挤零时差同步、去 blur 轻巧切换、全程 rAF 拖拽与朱砂墨丝指引', () => {
    const globalCss = readSrc('src/styles/global.css');
    const companion = readSrc('src/components/CompanionLayout.astro');

    // 正文避让与抽屉滑入共享同一时长与曲线令牌
    assert.match(
      globalCss,
      /\.site-shell\s*>\s*main\s*\{[\s\S]*?padding-right\s+var\(--article-duration-panel\)\s+var\(--article-ease-layout\)/,
      '正文列推挤过渡必须与伴读抽屉共享同一时长与缓动令牌，彻底消除重排时差'
    );
    assert.match(
      globalCss,
      /#companion-splitter:hover::before,\s*\nhtml\[data-companion-resizing="true"\]\s+#companion-splitter::before/,
      '分隔条悬停与拖拽时必须浮现朱砂墨丝指引'
    );
    assert.doesNotMatch(companion, /(?<![a-z-])filter\s*:\s*[^;]*blur\(/i, 'CompanionLayout 面板切换必须彻底清除动态 blur');
    assert.match(companion, /splitDragRaf\s*=\s*requestAnimationFrame\(flushSplitterFrame\)/, '并排分隔条拖拽必须全程 rAF 节流');

    // panelResize JSDOM 行为验证：多次高频 pointermove 合并为单帧 rAF 写入，松手同步落盘且支持显式 minHeight: 220
    assert.deepEqual(
      clampPanelSize({ width: 200, height: 150 }, { minWidth: 350, minHeight: 220, fitContentHeight: true, maxWidth: 900, maxHeight: 700 }),
      { width: 350, height: 220 },
      '显式传入 minHeight: 220 时不得被 fitContentHeight 硬覆盖为 380'
    );

    const dom = new JSDOM('<div id="panel"><div id="handle"></div></div>');
    const prevWin = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const rafQueue = new Map();
    let nextRaf = 0;
    dom.window.requestAnimationFrame = (fn) => { const id = ++nextRaf; rafQueue.set(id, fn); return id; };
    dom.window.cancelAnimationFrame = (id) => { rafQueue.delete(id); };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });

    try {
      const panel = dom.window.document.getElementById('panel');
      const handle = dom.window.document.getElementById('handle');
      panel.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 500, right: 480, bottom: 500 });
      let changeCalls = 0;
      const resizable = makeResizable(panel, handle, {
        minWidth: 350,
        minHeight: 220,
        maxWidth: 900,
        maxHeight: 800,
        onChange: () => { changeCalls += 1; },
      });

      const fire = (type, x, y) => {
        const ev = new dom.window.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
        ev.pointerType = 'mouse';
        ev.pointerId = 1;
        handle.dispatchEvent(ev);
      };

      fire('pointerdown', 480, 500);
      assert.equal(panel.getAttribute('data-resizing'), 'true', '拖拽开始时标记 data-resizing="true"');

      // 同一帧内连续 4 次 pointermove：仅排队 1 个 rAF，尚未写 DOM
      fire('pointermove', 500, 510);
      fire('pointermove', 520, 520);
      fire('pointermove', 540, 530);
      fire('pointermove', 560, 540);
      assert.equal(rafQueue.size, 1, '同帧多次 pointermove 必须合并为单个 rAF');
      assert.equal(changeCalls, 0, 'rAF 触发前不重复触发布局回调');

      // 执行一帧 rAF
      const [cb] = rafQueue.values();
      rafQueue.clear();
      cb(16);
      assert.equal(changeCalls, 1, '单帧 rAF 精准执行一次尺寸更新');
      assert.equal(panel.style.width, '560px');
      assert.equal(panel.style.height, '540px');

      // 再来一次未冲刷的 pointermove 后立即 pointerup：finish 必须同步冲刷终态绝不丢帧
      fire('pointermove', 590, 560);
      fire('pointerup', 590, 560);
      assert.equal(panel.style.width, '590px', '松手时必须同步冲刷最后一帧坐标');
      assert.equal(panel.hasAttribute('data-resizing'), false, '松手后清除 data-resizing');

      resizable.destroy();
      assert.equal(rafQueue.size, 0, 'destroy 必须清理未决 rAF');
    } finally {
      dom.window.close();
      if (prevWin) Object.defineProperty(globalThis, 'window', prevWin);
      else delete globalThis.window;
    }
  });

  it('7. PinWorkbench, ArticleSearch & MermaidRenderer: 飞墨流光弧线与轻漾墨环、搜索去 blur 墨框脉冲与图表阻尼惯性', async () => {
    const workbench = readSrc('src/components/PinWorkbench.astro');
    const search = readSrc('src/components/ArticleSearch.astro');
    const mermaid = readSrc('src/components/MermaidRenderer.astro');

    // PinWorkbench 飞墨流光弧线 + 轻漾墨环 + 零 blur
    assert.match(workbench, /pin-fly-arc-svg/, '钉住段落飞入工作台须绘制二次贝塞尔飞墨流光弧线');
    assert.match(workbench, /pin-ink-ripple/, '飞墨落点须轻漾单枚朱砂墨环');
    assert.doesNotMatch(workbench, /(?<![a-z-])filter\s*:\s*[^;]*blur\(/i, 'PinWorkbench 不得残留任何动态 filter: blur');

    // ArticleSearch 去 blur 提速 + 朱砂墨框脉冲
    assert.match(search, /articleSearchHudEnter\s+260ms\s+var\(--article-ease-surface\)/, '文内搜索胶囊入场须提速至 ~260ms 轻巧展卷');
    assert.match(search, /articleSearchHudExit\s+190ms\s+var\(--article-ease-layout\)/, '文内搜索胶囊退场须提速至 ~190ms');
    assert.match(search, /articleSearchRadarPulse\s+520ms\s+var\(--article-ease-surface\)/, '匹配项切换须采用克制醒目的朱砂墨框脉冲');
    assert.doesNotMatch(search, /(?<![a-z-])filter\s*:\s*[^;]*blur\(/i, 'ArticleSearch 不得残留任何动态 filter: blur');

    // MermaidRenderer 阻尼惯性漫游与「钤印已录」微交互 JSDOM 验证
    assert.match(mermaid, /stepModalInertia/, '全屏画布漫游须支持松手阻尼惯性');
    assert.match(mermaid, /stepStageInertia/, '内嵌图表漫游须支持松手阻尼惯性');
    assert.match(mermaid, /钤印已录/, 'Mermaid 复制按钮须提供「钤印已录」微交互反馈');

    const markup = mermaid.slice(mermaid.indexOf('<div class="mermaid-modal-overlay"'), mermaid.indexOf('<script>'));
    const blockHtml = `<div class="mermaid-block"><button class="mermaid-btn-expand"></button><div class="mermaid-stage"><div class="mermaid-render"><svg></svg></div></div></div>`;
    const dom = new JSDOM(markup + blockHtml, { url: 'http://localhost/posts/mermaid', runScripts: 'outside-only' });
    const { window } = dom;
    window.matchMedia = () => ({ matches: false });

    let clock = 100;
    window.performance.now = () => clock;
    const inertiaRafs = new Map();
    let rId = 0;
    window.requestAnimationFrame = (fn) => { const id = ++rId; inertiaRafs.set(id, fn); return id; };
    window.cancelAnimationFrame = (id) => { inertiaRafs.delete(id); };

    const script = stripTs(
      mermaid.match(/<script>([\s\S]*?)<\/script>/)[1]
        .replace(/import \{ waitForPostEntrance \} from .*?;/, 'const waitForPostEntrance = () => new Promise(() => {});')
    );

    try {
      window.eval(script);
      window.document.dispatchEvent(new window.Event('astro:page-load'));
      window.document.querySelector('.mermaid-btn-expand').click();
      const content = window.document.getElementById('mermaid-modal-content');
      const canvas = window.document.getElementById('mermaid-modal-canvas');

      const firePtr = (target, type, x, y) => {
        target.dispatchEvent(new window.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
      };

      // 多采样真实快速甩动 (dt = 16ms per sample) -> 松手后启动阻尼惯性继续顺滑滑行并衰减停稳
      firePtr(content, 'pointerdown', 100, 100);
      clock += 16;
      firePtr(window, 'pointermove', 130, 120);
      clock += 16;
      firePtr(window, 'pointermove', 178, 152);
      firePtr(window, 'pointerup', 178, 152);

      assert.equal(canvas.style.transform, 'translate(78px, 52px) scale(1)', '松手瞬间坐标精确贴合手指');
      assert.equal(inertiaRafs.size, 1, '快速甩动松手后启动 rAF 阻尼惯性');

      const [, stepFn] = [...inertiaRafs.entries()][0];
      inertiaRafs.clear();
      stepFn(clock + 16);
      assert.notEqual(canvas.style.transform, 'translate(78px, 52px) scale(1)', '惯性帧驱动画布顺滑延续位移');

      // 切页或关闭时彻底回收惯性 rAF，零泄漏
      window.document.dispatchEvent(new window.Event('astro:before-swap'));
      assert.equal(inertiaRafs.size, 0, 'astro:before-swap 必须立即终止未决惯性帧');
    } finally {
      window.close();
    }
  });

  it('8. 共享令牌读取与无障碍 prefers-reduced-motion 全局兜底契约', async () => {
    // 验证 readArticleMotion 新增 revealMs 与 popoverMs 解析
    const origDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const origStyle = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: {} } });
    Object.defineProperty(globalThis, 'getComputedStyle', {
      configurable: true,
      value: () => ({
        getPropertyValue: (name) => {
          if (name === '--article-duration-panel') return '.52s';
          if (name === '--article-duration-reveal') return '620ms';
          if (name === '--article-duration-popover') return '.22s';
          return '';
        },
      }),
    });
    try {
      const m = readArticleMotion();
      assert.equal(m.panelMs, 520);
      assert.equal(m.revealMs, 620);
      assert.equal(m.popoverMs, 220);
    } finally {
      if (origDoc) Object.defineProperty(globalThis, 'document', origDoc);
      else delete globalThis.document;
      if (origStyle) Object.defineProperty(globalThis, 'getComputedStyle', origStyle);
      else delete globalThis.getComputedStyle;
    }

    // 验证所有核心模块均声明 prefers-reduced-motion: reduce 保护
    for (const rel of [
      'src/layouts/PostLayout.astro',
      'src/styles/global.css',
      'src/components/ArticleSelectionDock.astro',
      'src/components/InkAsk.astro',
      'src/components/CompanionLayout.astro',
      'src/components/PinWorkbench.astro',
      'src/components/ArticleSearch.astro',
      'src/components/MermaidRenderer.astro',
    ]) {
      assert.match(readSrc(rel), /prefers-reduced-motion:\s*reduce/, `${rel} 必须支持 prefers-reduced-motion: reduce`);
    }
  });
});
