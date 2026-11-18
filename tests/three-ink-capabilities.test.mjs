import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import {
  MAX_INK_RIPPLES,
  XUAN_INK_FRAGMENT_SHADER,
  XUAN_INK_VERTEX_SHADER,
  canUseWebGL,
  createXuanInkStage,
  disposeThreeHierarchy,
  getCanonicalInkPalette,
  hexToRgb01,
  loadThree,
  observeThemePalette,
  prefersReducedMotion,
  resolveInkPalette,
} from '../src/utils/threeInkStage.ts';
import {
  FILAMENT_FRAGMENT_SHADER,
  STAR_HALO_FRAGMENT_SHADER,
  createTagConstellationThree,
  seedSphericalNebula,
  stepSphericalNebula,
} from '../src/utils/tagConstellationThree.ts';

const rootDir = process.cwd();
const readSrc = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

function extractListenerBody(src, eventName) {
  const blocks = [];
  const pattern = new RegExp(`addEventListener\\(\\s*['"]${eventName}['"][\\s\\S]*?\\n\\s*\\);`, 'g');
  let m;
  while ((m = pattern.exec(src)) !== null) {
    blocks.push(m[0]);
  }
  return blocks.join('\n');
}

describe('Slice B — Three.js WebGL 3D Ink Constellation, Xuan-Paper Shader & RenderDoc Inspector Suite', () => {
  it('1. 架构与水墨美学守门: Lazy Three.js 按需分包、零印章/朱砂红、零 filter:blur、pointermove/wheel 零同步回流', () => {
    const ownedFiles = [
      'src/utils/threeInkStage.ts',
      'src/utils/tagConstellationThree.ts',
      'src/components/ThreeInkCanvas.astro',
      'src/components/islands/ThreeDemoStage.tsx',
      'src/pages/tags/index.astro',
      'src/layouts/PostLayout.astro',
      'src/content/posts/renderdoc_Use.md',
    ];

    const forbiddenRedHex = /#b83b28|#d9533f|#c23f2c|194,\s*63,\s*44|184,\s*59,\s*40|#d4733c|#ff7849|#c05c2a/i;
    const forbiddenCopy = [
      '钤印已录',
      '朱砂钤印',
      '轻点钤印',
      '谢谢来访',
      '钤印核验',
      '钤印成章',
      '印信通行',
      '印信已核',
      '印合',
      '钤印',
    ];

    for (const rel of ownedFiles) {
      const content = readSrc(rel);
      assert.doesNotMatch(
        content,
        forbiddenRedHex,
        `${rel} 严禁出现朱砂红/橙红硬编码色值`,
      );
      for (const word of forbiddenCopy) {
        assert.ok(!content.includes(word), `${rel} 严禁包含印章文案 "${word}"`);
      }
    }

    // Newly created Slice B files must have zero 'seal' identifiers and zero filter:blur
    for (const rel of [
      'src/utils/threeInkStage.ts',
      'src/utils/tagConstellationThree.ts',
      'src/components/ThreeInkCanvas.astro',
      'src/components/islands/ThreeDemoStage.tsx',
    ]) {
      const content = readSrc(rel);
      assert.doesNotMatch(content, /seal/i, `${rel} 不得引入任何 seal 命名或概念`);
      assert.doesNotMatch(content, /(?<![a-z-])filter\s*:\s*[^;]*blur\(/i, `${rel} 严禁使用 filter: blur`);

      // Verify zero eager value import of 'three' (only `import type` or dynamic `import('three')`)
      const valueThreeImports = content
        .split('\n')
        .filter((line) => /^\s*import\s+(?!type\b).*from\s+['"]three['"]/.test(line));
      assert.deepEqual(
        valueThreeImports,
        [],
        `${rel} 严禁顶层同步导入 'three'，必须通过 loadThree() 动态分包加载`,
      );

      // Verify zero layout reflow reads inside pointermove / wheel listeners
      for (const evt of ['pointermove', 'wheel']) {
        const body = extractListenerBody(content, evt);
        assert.doesNotMatch(
          body,
          /getBoundingClientRect|offsetWidth|offsetHeight/,
          `${rel} 的 ${evt} 监听器内严禁调用 getBoundingClientRect / offsetWidth / offsetHeight`,
        );
      }
    }
  });

  it('2. threeInkStage: WebGL 能力探测、JSDOM/减弱动态自动降级、四主题水墨调色板与 GPU 树递归销毁', async () => {
    const dom = new JSDOM('<!doctype html><html data-theme="light"><body><div id="stage"></div></body></html>');
    const { window } = dom;
    const { document } = window;

    try {
      // 2a. JSDOM default has no WebGLRenderingContext -> returns false cleanly with zero stderr spam
      window.matchMedia = () => ({ matches: false });
      assert.equal(canUseWebGL({ win: window, doc: document }), false);

      // 2b. Mock WebGL context + reduced-motion guard
      let contextLost = false;
      window.WebGLRenderingContext = function MockWebGL() {};
      window.HTMLCanvasElement.prototype.getContext = function (kind) {
        if (kind === 'webgl' || kind === 'webgl2') {
          return { isContextLost: () => contextLost };
        }
        return null;
      };
      assert.equal(canUseWebGL({ win: window, doc: document }), true);

      window.matchMedia = (q) => ({ matches: q.includes('reduce') });
      assert.equal(prefersReducedMotion(window), true);
      assert.equal(canUseWebGL({ win: window, doc: document }), false);
      assert.equal(canUseWebGL({ win: window, doc: document, allowReducedMotion: true }), true);

      contextLost = true;
      assert.equal(canUseWebGL({ win: window, doc: document, allowReducedMotion: true }), false);

      // 2c. 4-theme monochrome palette resolution & MutationObserver sync
      for (const theme of ['light', 'dark', 'moss', 'rice']) {
        const pal = getCanonicalInkPalette(theme);
        assert.equal(pal.theme, theme);
        assert.equal(pal.paperRgb.length, 3);
        assert.equal(pal.inkStrongRgb.length, 3);
      }
      const lightMoss = getCanonicalInkPalette('moss', '4DB6AC');
      assert.equal(lightMoss.isDark, false);
      assert.deepEqual(hexToRgb01('#000000'), [0, 0, 0]);
      assert.deepEqual(hexToRgb01('#ffffff'), [1, 1, 1]);

      const observedThemes = [];
      const stopObs = observeThemePalette(
        (pal) => observedThemes.push(pal.theme),
        document,
        window,
      );
      document.documentElement.setAttribute('data-theme', 'rice');
      await new Promise((r) => setTimeout(r, 15));
      document.documentElement.setAttribute('data-theme', 'dark');
      await new Promise((r) => setTimeout(r, 15));
      stopObs();
      assert.ok(observedThemes.includes('rice') && observedThemes.includes('dark'));
      assert.equal(resolveInkPalette(document, window).theme, 'dark');

      // 2d. disposeThreeHierarchy deduplicates and disposes geometries, material arrays & uniform textures
      let geomDisposed = 0;
      let matDisposed = 0;
      let texDisposed = 0;
      const sharedTex = { isTexture: true, dispose: () => { texDisposed += 1; } };
      const uniformTex = { isTexture: true, dispose: () => { texDisposed += 1; } };
      const mockGeom = { dispose: () => { geomDisposed += 1; } };
      const matA = { map: sharedTex, dispose: () => { matDisposed += 1; } };
      const matB = {
        uniforms: { uNoise: { value: uniformTex }, uDup: { value: sharedTex } },
        dispose: () => { matDisposed += 1; },
      };
      const mockRoot = {
        children: [
          { geometry: mockGeom, material: [matA, matB] },
          { geometry: mockGeom, material: matA },
        ],
      };
      const stats = disposeThreeHierarchy(mockRoot);
      assert.deepEqual(stats, { geometries: 1, materials: 2, textures: 2 });
      assert.equal(geomDisposed, 1);
      assert.equal(matDisposed, 2);
      assert.equal(texDisposed, 2);
    } finally {
      window.close();
    }
  });

  it('3. createXuanInkStage: 宣纸毛细渗化 Shader、指针涟漪零回流、模态框/离屏暂停与完整销毁', async () => {
    assert.ok(XUAN_INK_VERTEX_SHADER.includes('vUv'));
    assert.ok(XUAN_INK_FRAGMENT_SHADER.includes('xuanFiberField'));
    assert.ok(XUAN_INK_FRAGMENT_SHADER.includes(`uRipples[${MAX_INK_RIPPLES}]`));

    const dom = new JSDOM(
      '<!doctype html><html data-theme="light"><body><div id="ink-host"><canvas data-three-ink-webgl></canvas></div></body></html>',
    );
    const { window } = dom;
    const { document } = window;
    Object.defineProperty(document, 'hidden', { configurable: true, writable: true, value: false });
    window.matchMedia = () => ({ matches: false });

    try {
      const host = document.getElementById('ink-host');
      // Fallback check when WebGL is absent
      const fallbackHandle = await createXuanInkStage({
        container: host,
        win: window,
        doc: document,
      });
      assert.equal(fallbackHandle.active, false);
      assert.equal(fallbackHandle.fallback, true);
      assert.equal(host.dataset.inkMode, 'fallback');
      fallbackHandle.dispose();

      // Mock WebGL + rAF queue
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

      let renderCount = 0;
      let rendererDisposed = false;
      let rectReadsDuringMove = 0;
      let trackingMove = false;
      host.getBoundingClientRect = () => {
        if (trackingMove) rectReadsDuringMove += 1;
        return { left: 10, top: 20, width: 400, height: 300, right: 410, bottom: 320, x: 10, y: 20, toJSON: () => ({}) };
      };

      const stage = await createXuanInkStage({
        container: host,
        ambient: true,
        interactive: true,
        win: window,
        doc: document,
        createRenderer: () => ({
          setPixelRatio: () => {},
          setSize: () => {},
          render: () => { renderCount += 1; },
          renderLists: { dispose: () => {} },
          dispose: () => { rendererDisposed = true; },
        }),
      });

      assert.equal(stage.active, true);
      assert.equal(stage.fallback, false);
      assert.equal(host.dataset.inkMode, 'webgl');
      assert.ok(renderCount >= 1, '初始化即渲染首帧宣纸底纹');
      assert.equal(stage.isRunning(), true);

      // Verify pointermove drops ripple with ZERO getBoundingClientRect calls
      trackingMove = true;
      const moveEvt = new window.Event('pointermove', { bubbles: true });
      Object.assign(moveEvt, { clientX: 210, clientY: 170 });
      host.dispatchEvent(moveEvt);
      trackingMove = false;
      assert.equal(rectReadsDuringMove, 0, 'pointermove 期间严禁触发 getBoundingClientRect');

      // Suspend on app:modal-enter & resume on app:modal-leave
      window.dispatchEvent(new window.Event('app:modal-enter'));
      assert.equal(stage.isRunning(), false, '打开弹窗时必须立即挂起 WebGL rAF');
      window.dispatchEvent(new window.Event('app:modal-leave'));
      assert.equal(stage.isRunning(), true, '关闭弹窗后自动恢复 WebGL rAF');

      // Theme sync updates uniforms cleanly
      document.documentElement.setAttribute('data-theme', 'moss');
      const syncedPal = stage.syncTheme();
      assert.equal(syncedPal.theme, 'moss');

      // Verify visibilitychange auto-sleep & wake
      document.hidden = true;
      document.dispatchEvent(new window.Event('visibilitychange'));
      assert.equal(stage.isRunning(), false, '后台标签页隐藏时必须立即挂起 WebGL rAF');
      document.hidden = false;
      document.dispatchEvent(new window.Event('visibilitychange'));
      assert.equal(stage.isRunning(), true, '标签页切回前台后自动恢复 WebGL rAF');

      const disposeStats = stage.dispose();
      assert.equal(disposeStats.geometries, 1);
      assert.equal(disposeStats.materials, 1);
      assert.equal(rendererDisposed, true);
      assert.equal(stage.isRunning(), false);
    } finally {
      window.close();
    }
  });

  it('4. ThreeInkCanvas.astro & tags/index.astro + tagConstellationThree.ts: 2D/3D 星云双模契约、三维投影、拖拽旋览与滚轮调焦', async () => {
    const inkCanvasAstro = readSrc('src/components/ThreeInkCanvas.astro');
    assert.ok(inkCanvasAstro.includes('data-three-ink-canvas'));
    assert.ok(inkCanvasAstro.includes('__areSetThreeInkCanvasCleanup__'));
    assert.match(inkCanvasAstro, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

    const tagsAstro = readSrc('src/pages/tags/index.astro');
    assert.ok(tagsAstro.includes('平面星图') && tagsAstro.includes('三维星云'), '/tags 须提供平面星图 / 三维星云切换胶囊');
    assert.ok(tagsAstro.includes('data-tag-view-glider'), '/tags 切换器须包含反向圆角弹簧滑块');
    assert.match(tagsAstro, /\.tag-view-glider\s*\{[\s\S]*?width:\s*100px;[\s\S]*?border-radius:\s*var\(--pill-rx,\s*9999px\)\s*\/\s*var\(--pill-ry,\s*9999px\)/);
    assert.ok(tagsAstro.includes('const STEP = 1 / 60;'));
    assert.ok(tagsAstro.includes('alpha <= 0.02 || (alpha < 0.36 && maxDisp < 0.04)'));
    assert.ok(tagsAstro.includes('tag-link-pulse') && tagsAstro.includes('constellationInkFlow'));
    assert.ok(tagsAstro.includes('__areSetTagSkyCleanup__'));

    // Pure 3D Fibonacci spherical nebula physics verification
    assert.ok(FILAMENT_FRAGMENT_SHADER.includes('uAccentColor'));
    assert.ok(STAR_HALO_FRAGMENT_SHADER.includes('gl_PointCoord'));

    const sampleItems = [
      { name: 'renderdoc', weight: 1.0 },
      { name: '鸣潮', weight: 0.75 },
      { name: '抓帧', weight: 0.65 },
      { name: 'UE5', weight: 0.5 },
      { name: 'Shader', weight: 0.35 },
      { name: 'Astro', weight: 0.2 },
    ];
    const seeded = seedSphericalNebula(sampleItems, 180);
    assert.equal(seeded.length, 6);
    assert.ok(
      seeded.some((n) => n.z > 10) && seeded.some((n) => n.z < -10),
      '3D 星云节点必须分布在前后双半球空间中',
    );
    assert.ok(
      seeded[0].targetRadius < seeded[5].targetRadius,
      '高频核心标签应汇聚于星云内核，低频标签环绕外层星壳',
    );
    const disp = stepSphericalNebula(
      seeded,
      [{ aIndex: 0, bIndex: 1, weight: 3, bowSign: 1 }],
      180,
      1.0,
      3,
    );
    assert.ok(Number.isFinite(disp) && disp > 0);

    // Live JSDOM + Mock WebGL 3D Constellation Projection & Interaction Test
    const dom = new JSDOM(`
      <!doctype html>
      <html data-theme="rice">
        <body>
          <section class="tag-sky" data-tag-sky>
            <canvas class="tag-sky-webgl" data-tag-webgl></canvas>
            <div class="tag-sky-nodes" data-tag-nodes>
              <a class="tag-node" href="/tags/renderdoc" data-tag-node data-tag="renderdoc">renderdoc</a>
              <a class="tag-node" href="/tags/ue5" data-tag-node data-tag="ue5">ue5</a>
              <a class="tag-node" href="/tags/astro" data-tag-node data-tag="astro">astro</a>
            </div>
          </section>
        </body>
      </html>
    `);
    const { window } = dom;
    const { document } = window;
    Object.defineProperty(document, 'hidden', { configurable: true, writable: true, value: false });
    window.matchMedia = () => ({ matches: false });

    const rafQueue = new Map();
    let rafIdSeq = 0;
    window.requestAnimationFrame = (cb) => {
      const id = ++rafIdSeq;
      rafQueue.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = (id) => rafQueue.delete(id);
    const flushOneFrame = (nowMs) => {
      const entries = [...rafQueue.entries()];
      rafQueue.clear();
      for (const [, fn] of entries) fn(nowMs);
    };

    try {
      const sky = document.querySelector('[data-tag-sky]');
      Object.defineProperty(sky, 'clientWidth', { configurable: true, value: 800 });
      Object.defineProperty(sky, 'clientHeight', { configurable: true, value: 560 });

      let reflowReadsInGesture = 0;
      let inGesture = false;
      sky.getBoundingClientRect = () => {
        if (inGesture) reflowReadsInGesture += 1;
        return { left: 0, top: 0, width: 800, height: 560, right: 800, bottom: 560, x: 0, y: 0, toJSON: () => ({}) };
      };

      const anchors = Array.from(sky.querySelectorAll('[data-tag-node]'));
      let rendererDisposed = false;

      const constellation = await createTagConstellationThree({
        sky,
        canvas: sky.querySelector('[data-tag-webgl]'),
        nodes: anchors.map((el, idx) => ({
          el,
          name: el.dataset.tag,
          hw: 36,
          hh: 14,
          weight: 1 - idx * 0.3,
        })),
        pairs: [['renderdoc', 'ue5', 3]],
        win: window,
        doc: document,
        createRenderer: () => ({
          setPixelRatio: () => {},
          setSize: () => {},
          render: () => {},
          renderLists: { dispose: () => {} },
          dispose: () => { rendererDisposed = true; },
        }),
      });

      assert.equal(constellation.active, true);
      assert.equal(constellation.fallback, false);

      // Every <a class="tag-node"> gets projected 3D translate3d(...) scale(...) while keeping href
      for (const a of anchors) {
        assert.match(a.style.transform, /^translate3d\([-\d.]+px,\s*[-\d.]+px,\s*0px\)\s*scale\([\d.]+\)$/);
        assert.ok(a.getAttribute('href')?.startsWith('/tags/'));
      }

      const initialTransform0 = anchors[0].style.transform;

      // Hover highlight lights origin + co-occurring neighbour and dims unrelated tag
      constellation.highlight('renderdoc');
      assert.ok(anchors[0].classList.contains('is-origin'));
      assert.ok(anchors[1].classList.contains('is-lit'));
      assert.ok(anchors[2].classList.contains('is-dim'));
      constellation.highlight(null);

      // Orbit drag rotates 3D sphere with ZERO getBoundingClientRect calls
      const down = new window.Event('pointerdown', { bubbles: true });
      Object.assign(down, { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 200, clientY: 200 });
      sky.dispatchEvent(down);

      inGesture = true;
      const move = new window.Event('pointermove', { bubbles: true });
      Object.assign(move, { pointerId: 1, clientX: 310, clientY: 250 });
      window.dispatchEvent(move);

      const wheel = new window.Event('wheel', { bubbles: true, cancelable: true });
      Object.assign(wheel, { deltaY: -240 });
      sky.dispatchEvent(wheel);
      inGesture = false;

      const up = new window.Event('pointerup', { bubbles: true });
      Object.assign(up, { pointerId: 1 });
      window.dispatchEvent(up);

      assert.equal(reflowReadsInGesture, 0, '3D 星云 pointermove 与 wheel 期间严禁同步布局读取');

      flushOneFrame(100);
      flushOneFrame(132);
      assert.notEqual(anchors[0].style.transform, initialTransform0, '拖拽旋转与缩放后 3D 节点屏幕投影应实时更新');
      assert.ok(constellation.getZoom() > 1.02, '滚轮向上调焦应放大三维星云视距');

      // Full GPU disposal of star halos + curved filaments + stardust + renderer
      const stats = constellation.dispose();
      assert.equal(stats.geometries, 3);
      assert.equal(stats.materials, 3);
      assert.equal(rendererDisposed, true);
      assert.equal(anchors[0].style.opacity, '');
    } finally {
      window.close();
    }
  });

  it('5. ThreeDemoStage.tsx + PostLayout.astro + renderdoc_Use.md: 按需挂载、5 渲染通道切换、DrawCall HUD 与销毁回收', async () => {
    const postLayout = readSrc('src/layouts/PostLayout.astro');
    const renderdocPost = readSrc('src/content/posts/renderdoc_Use.md');

    assert.ok(
      renderdocPost.includes('data-three-demo') && renderdocPost.includes('data-demo-preset="resonator"'),
      'renderdoc_Use.md 必须嵌入交互式 RenderDoc 3D 检视台挂载点',
    );
    assert.match(
      postLayout,
      /const hosts = Array\.from\(document\.querySelectorAll<HTMLElement>\('\[data-three-demo\]'\)\);\s*if \(hosts\.length === 0\) return;/,
      'PostLayout.astro 必须在不存在 [data-three-demo] 的普通文章中提前返回，零 React/Three 加载开销',
    );

    // Bundle ThreeDemoStage.tsx in memory via esbuild (bundled in node_modules by Astro/Vite) and run inside JSDOM
    const esbuild = await import('esbuild');
    const THREE_REAL = await loadThree();

    const entryCode = `
      import React, { act } from 'react';
      import { createRoot } from 'react-dom/client';
      import ThreeDemoStage, { RENDER_PASSES, MESH_PRESETS, INSPECTOR_FRAGMENT_SHADER } from './src/components/islands/ThreeDemoStage.tsx';
      export { React, act, createRoot, ThreeDemoStage, RENDER_PASSES, MESH_PRESETS, INSPECTOR_FRAGMENT_SHADER };
    `;

    const built = await esbuild.build({
      stdin: {
        contents: entryCode,
        resolveDir: rootDir,
        sourcefile: 'three-demo-test-entry.tsx',
        loader: 'tsx',
      },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      external: ['three'],
    });
    await esbuild.stop();

    const bundleSource = built.outputFiles[0].text;
    const bundleDataUrl = `data:text/javascript;base64,${Buffer.from(bundleSource).toString('base64')}`;

    const dom = new JSDOM('<!doctype html><html data-theme="light"><body><div id="mount-fallback"></div><div id="mount-webgl"></div></body></html>', {
      url: 'http://localhost/posts/renderdoc_Use',
      pretendToBeVisual: true,
    });

    const prevGlobals = new Map();
    const injectedKeys = [
      'window',
      'document',
      'navigator',
      'HTMLElement',
      'SVGElement',
      'Element',
      'Node',
      'Event',
      'CustomEvent',
      'MutationObserver',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'MessageChannel',
      'IS_REACT_ACT_ENVIRONMENT',
    ];
    for (const key of injectedKeys) {
      prevGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    }

    dom.window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    });

    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: dom.window });
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: dom.window.navigator });
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, writable: true, value: dom.window.HTMLElement });
    Object.defineProperty(globalThis, 'SVGElement', { configurable: true, writable: true, value: dom.window.SVGElement });
    Object.defineProperty(globalThis, 'Element', { configurable: true, writable: true, value: dom.window.Element });
    Object.defineProperty(globalThis, 'Node', { configurable: true, writable: true, value: dom.window.Node });
    Object.defineProperty(globalThis, 'Event', { configurable: true, writable: true, value: dom.window.Event });
    Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, writable: true, value: dom.window.CustomEvent });
    Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, writable: true, value: dom.window.MutationObserver });
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true, value: dom.window.requestAnimationFrame.bind(dom.window) });
    const OrigMessageChannel = globalThis.MessageChannel;
    const openChannels = [];
    class TrackedMessageChannel extends OrigMessageChannel {
      constructor() {
        super();
        openChannels.push(this);
      }
    }
    Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, writable: true, value: dom.window.cancelAnimationFrame.bind(dom.window) });
    Object.defineProperty(globalThis, 'MessageChannel', { configurable: true, writable: true, value: TrackedMessageChannel });
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

    try {
      const mod = await import(bundleDataUrl);
      const { React, act, createRoot, ThreeDemoStage, RENDER_PASSES, MESH_PRESETS, INSPECTOR_FRAGMENT_SHADER } = mod;

      assert.equal(RENDER_PASSES.length, 5);
      assert.equal(MESH_PRESETS.length, 3);
      assert.ok(INSPECTOR_FRAGMENT_SHADER.includes('uPassMode'));

      // 5a. Fallback blueprint mode in JSDOM when WebGL is unavailable
      const fallbackHost = dom.window.document.getElementById('mount-fallback');
      const rootFallback = createRoot(fallbackHost);
      await act(async () => {
        rootFallback.render(React.createElement(ThreeDemoStage, { forceWebGL: false }));
      });

      assert.ok(fallbackHost.querySelector('[data-demo-fallback]'), '无 WebGL 时必须优雅显示静态线框蓝图');
      assert.equal(fallbackHost.querySelector('[data-hud-drawcalls]')?.textContent, '2');

      // Toggle wireframe overlay -> DrawCalls doubles from 2 -> 4
      const wireBtn = fallbackHost.querySelector('[data-demo-wireframe-toggle]');
      await act(async () => {
        wireBtn.click();
      });
      assert.equal(fallbackHost.querySelector('[data-hud-drawcalls]')?.textContent, '4');

      // Switch to single-submesh heightfield preset -> DrawCalls updates to 2 (1 solid + 1 wire)
      const heightBtn = fallbackHost.querySelector('[data-demo-preset="heightfield"]');
      await act(async () => {
        heightBtn.click();
      });
      assert.equal(fallbackHost.querySelector('[data-hud-drawcalls]')?.textContent, '2');

      await act(async () => {
        rootFallback.unmount();
      });

      // 5b. Mock WebGL mode: lazy loadThreeImpl, pass switching, preset rebuild & full GPU disposal on unmount
      const webglHost = dom.window.document.getElementById('mount-webgl');
      let webglRenderCount = 0;
      let disposeReport = null;
      let mockRendererDisposed = false;

      const rootWebgl = createRoot(webglHost);
      await act(async () => {
        rootWebgl.render(
          React.createElement(ThreeDemoStage, {
            forceWebGL: true,
            loadThreeImpl: async () => THREE_REAL,
            createRenderer: () => ({
              setPixelRatio: () => {},
              setSize: () => {},
              render: () => { webglRenderCount += 1; },
              renderLists: { dispose: () => {} },
              dispose: () => { mockRendererDisposed = true; },
            }),
            onDispose: (stats) => { disposeReport = stats; },
          }),
        );
        await new Promise((r) => setTimeout(r, 25));
      });

      assert.equal(
        webglHost.querySelector('.three-demo-shell')?.getAttribute('data-engine-state'),
        'webgl',
      );
      assert.ok(webglRenderCount >= 1, 'WebGL 检视台挂载后必须立即渲染首帧');

      // Cycle through all 5 RenderDoc passes
      for (const pass of ['normal', 'depth', 'uv', 'wireframe', 'ink-lit']) {
        const btn = webglHost.querySelector(`[data-demo-pass="${pass}"]`);
        assert.ok(btn, `必须渲染通道按钮 ${pass}`);
        await act(async () => {
          btn.click();
        });
      }

      // Switch preset to 'crest' and verify live geometry vertex/triangle count updates
      const prevVerts = webglHost.querySelector('[data-hud-vertices]')?.textContent;
      await act(async () => {
        webglHost.querySelector('[data-demo-preset="crest"]').click();
      });
      const nextVerts = webglHost.querySelector('[data-hud-vertices]')?.textContent;
      assert.notEqual(nextVerts, prevVerts, '切换 DrawCall 模型预设后顶点计数 HUD 必须实时刷新');

      // Unmount triggers complete GPU disposal
      await act(async () => {
        rootWebgl.unmount();
      });
      assert.ok(disposeReport && disposeReport.geometries >= 1 && disposeReport.materials >= 2);
      assert.equal(mockRendererDisposed, true);
    } finally {
      for (const ch of openChannels) {
        try { ch.port1.close(); } catch {}
        try { ch.port2.close(); } catch {}
      }
      dom.window.close();
      for (const [key, desc] of prevGlobals.entries()) {
        if (desc) Object.defineProperty(globalThis, key, desc);
        else delete globalThis[key];
      }
    }
  });
});
