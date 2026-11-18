import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

import {
  activeModal,
  clearAllModals,
  connectShellStoreDom,
  cursorTrail,
  cycleShellTheme,
  font,
  hydrateShellStore,
  isDarkSurface,
  isModalOpen,
  mossShade,
  resetShellStore,
  setModalOpenState,
  setShellCursorTrail,
  setShellFont,
  setShellMossShade,
  setShellSidebarCollapsed,
  setShellTheme,
  sidebarCollapsed,
  theme,
  toggleShellCursorTrail,
  toggleShellFont,
} from '../src/stores/shellStore.ts';

import {
  activeIndex,
  activeItem,
  closeCommandPalette,
  effectiveCategory,
  indexState,
  isCommandPrefix,
  isOpen as isPaletteOpen,
  items as paletteItems,
  openCommandPalette,
  query as paletteQuery,
  resetCommandPaletteStore,
  selectedCategory,
  setPaletteCategory,
  setPaletteIndexState,
  setPalettePostEntries,
  setPaletteQuery,
  statusText,
  stepActivePaletteIndex,
  stepPaletteCategoryInStore,
  togglePaletteCommandPrefix,
} from '../src/stores/commandPaletteStore.ts';

import {
  addArticleBookmark,
  bookmarkCount,
  bookmarks as postBookmarksAtom,
  clearReadingToast,
  currentProgress,
  dismissArticleResumeSlip,
  hydrateReadingStoreForPost,
  isPopoverOpen,
  promptResumeSlipIfEligible,
  recordArticleProgress,
  removeArticleBookmark,
  resetReadingStore,
  resumeSlip,
  setBookmarkPopoverOpen,
  toast as readingToast,
  toggleBookmarkPopoverOpen,
  triggerReadingToast,
} from '../src/stores/readingStore.ts';

import {
  activeSceneMeta,
  bindZenAudioEngine,
  formattedCountdown,
  isOpen as isZenOpen,
  isPlaying as isZenPlaying,
  rainEnabled,
  remainingSeconds,
  resetZenStore,
  sceneId,
  setZenCapsuleOpen,
  setZenRainEnabled,
  setZenTimerMinutes,
  setZenVolume,
  timerMinutes,
  toggleZenCapsuleOpen,
  toggleZenRainEnabled,
  volume as zenVolume,
  volumePercent,
} from '../src/stores/zenStore.ts';

import { ZenAudioEngine } from '../src/utils/zenAudioEngine.ts';
import { buildDefaultCommands } from '../src/utils/commandPaletteEngine.ts';

const rootDir = process.cwd();
const readSrc = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    key(i) {
      return [...map.keys()][i] ?? null;
    },
    removeItem(k) {
      map.delete(k);
    },
    setItem(k, v) {
      map.set(String(k), String(v));
    },
  };
}

describe('Nanostores 壳层状态机 + React 19 & Motion Islands 响应式套件', () => {
  it('1. shellStore: 主题/色阶/字形/拖尾/侧栏/模态框双向同步与 MutationObserver 桥接', async () => {
    resetShellStore();
    const dom = new JSDOM('<!doctype html><html data-theme="rice" data-font="kai"><body></body></html>', {
      url: 'http://localhost/',
    });

    try {
      const { window: win, document: doc } = dom.window;
      win.matchMedia = () => ({ matches: false });
      const storage = createMemoryStorage();
      const env = { win, doc, storage };

      hydrateShellStore(env);
      assert.equal(theme.get(), 'rice');
      assert.equal(font.get(), 'kai');
      assert.equal(isDarkSurface.get(), false);

      // 循环切换主题 light -> dark -> moss -> rice
      setShellTheme('light', env);
      assert.equal(theme.get(), 'light');
      assert.equal(doc.documentElement.getAttribute('data-theme'), 'light');
      assert.equal(storage.getItem('theme'), 'light');

      assert.equal(cycleShellTheme(env), 'dark');
      assert.equal(isDarkSurface.get(), true);
      assert.equal(cycleShellTheme(env), 'moss');
      assert.equal(isDarkSurface.get(), true);

      // 青苔色阶归一化与非法值拦截
      assert.equal(setShellMossShade('#00695c', env), '00695C');
      assert.equal(mossShade.get(), '00695C');
      assert.equal(doc.documentElement.getAttribute('data-moss-shade'), '00695C');
      assert.equal(setShellMossShade('INVALID_HEX', env), null);
      assert.equal(mossShade.get(), null);

      // 字形、拖尾与侧栏折叠同步
      assert.equal(toggleShellFont(env), 'pixel');
      assert.equal(doc.documentElement.getAttribute('data-font'), null);
      assert.equal(setShellFont('kai', env), 'kai');
      assert.equal(doc.documentElement.getAttribute('data-font'), 'kai');

      assert.equal(setShellCursorTrail('disabled', env), 'disabled');
      assert.equal(cursorTrail.get(), 'disabled');
      assert.equal(doc.documentElement.getAttribute('data-cursor-trail'), 'disabled');
      assert.equal(toggleShellCursorTrail(env), 'enabled');
      assert.equal(doc.documentElement.getAttribute('data-cursor-trail'), null);

      assert.equal(setShellSidebarCollapsed(true, env), true);
      assert.equal(sidebarCollapsed.get(), true);
      assert.equal(doc.documentElement.getAttribute('data-sidebar-collapsed'), 'true');

      // 活跃模态栈与 app:modal-enter / app:modal-leave 事件联动
      const modalEvents = [];
      win.addEventListener('app:modal-enter', () => modalEvents.push('enter'));
      win.addEventListener('app:modal-leave', () => modalEvents.push('leave'));

      setModalOpenState('search', true, { emitDomEvent: true, win });
      assert.equal(activeModal.get(), 'search');
      assert.equal(isModalOpen.get(), true);
      setModalOpenState('imageViewer', true, { emitDomEvent: true, win });
      assert.equal(activeModal.get(), 'imageViewer');
      setModalOpenState('imageViewer', false, { emitDomEvent: true, win });
      assert.equal(activeModal.get(), 'search');
      setModalOpenState('search', false, { emitDomEvent: true, win });
      assert.equal(activeModal.get(), null);
      assert.equal(isModalOpen.get(), false);
      assert.deepEqual(modalEvents, ['enter', 'leave']);

      // 外部脚本直接修改 <html> 属性时，MutationObserver 自动回写 shellStore
      const cleanup = connectShellStoreDom(env);
      doc.documentElement.setAttribute('data-theme', 'dark');
      doc.documentElement.setAttribute('data-cursor-trail', 'disabled');
      await new Promise((r) => setTimeout(r, 15));
      assert.equal(theme.get(), 'dark');
      assert.equal(cursorTrail.get(), 'disabled');

      cleanup();
      clearAllModals();
    } finally {
      dom.window.close();
      resetShellStore();
    }
  });

  it('2. commandPaletteStore: 跨库查询状态流、`>` 指令前缀劫持、分类循环与键盘游标包裹', () => {
    resetCommandPaletteStore();

    const posts = [
      {
        title: 'UE5 RenderGraph 管线调度深度解析',
        description: 'RDG Pass 裁剪与屏障合并机制',
        content: 'FRDGBuilder Compile 阶段自动推导资源生命周期',
        tags: ['UE5', 'RDG'],
        category: '渲染架构',
        slug: 'ue5-rdg',
        href: '/posts/ue5-rdg/',
        dateLabel: '2026-11-12',
        publishedAt: 1762900000000,
      },
      {
        title: 'Nanostores 轻量原子状态设计',
        description: '跨岛屿零样板状态共享',
        content: 'atom 与 computed 构建响应式数据图',
        tags: ['Frontend', 'Architecture'],
        category: '工程实践',
        slug: 'nanostores-guide',
        href: '/posts/nanostores-guide/',
        dateLabel: '2026-11-15',
        publishedAt: 1763100000000,
      },
    ];
    const sources = {
      posts,
      commands: buildDefaultCommands({ currentTheme: 'light', currentFont: 'pixel' }),
      basePath: '/',
    };

    openCommandPalette();
    assert.equal(isPaletteOpen.get(), true);
    setPaletteIndexState('loading');
    assert.equal(indexState.get(), 'loading');
    assert.ok(statusText.get().includes('整理'));

    setPalettePostEntries(posts);
    setPaletteQuery('RDG', sources);
    assert.equal(indexState.get(), 'ready');
    assert.equal(paletteItems.get().length, 1);
    assert.equal(paletteItems.get()[0].slug ?? paletteItems.get()[0].uid, 'post:ue5-rdg');
    assert.equal(activeIndex.get(), 0);
    assert.equal(activeItem.get()?.title, 'UE5 RenderGraph 管线调度深度解析');

    // 切换 > 指令前缀自动将 effectiveCategory 切到 commands
    togglePaletteCommandPrefix(sources);
    assert.ok(paletteQuery.get().startsWith('>'));
    assert.equal(isCommandPrefix.get(), true);
    assert.equal(effectiveCategory.get(), 'commands');

    // 从指令前缀切回普通分类自动剥离 `>`
    setPaletteQuery('> 米笺', sources);
    assert.equal(isCommandPrefix.get(), true);
    assert.equal(paletteItems.get()[0]?.actionId, 'theme:rice');

    setPaletteCategory('posts', sources);
    assert.equal(selectedCategory.get(), 'posts');
    assert.equal(isCommandPrefix.get(), false);
    assert.equal(paletteQuery.get(), '米笺');

    // 分类循环与结果下标环形步进
    setPaletteQuery('', sources);
    assert.equal(paletteItems.get().length, 2);
    assert.equal(stepActivePaletteIndex(1), 1);
    assert.equal(stepActivePaletteIndex(1), 0, '末尾继续向下应环形回到首项');
    assert.equal(stepActivePaletteIndex(-1), 1, '首项向上应环形跳至末项');

    assert.equal(stepPaletteCategoryInStore(1, sources), 'notes');
    closeCommandPalette();
    assert.equal(isPaletteOpen.get(), false);
    resetCommandPaletteStore();
  });

  it('3. readingStore & zenStore: 阅读续读浮签/一文多签与白噪音音景状态联动', () => {
    resetReadingStore();
    resetZenStore();
    const store = createMemoryStorage();

    // A. readingStore 生命周期
    hydrateReadingStoreForPost('/posts/ue5-nanite/', 'UE5 Nanite 虚拟几何体', store);
    assert.equal(bookmarkCount.get(), 0);

    // 写入 52% 进度 -> 重进文章可触发续读浮条
    recordArticleProgress({ progress: 0.52, headingId: 'cluster-cull', headingText: '簇级剔除', now: 1000 }, store);
    assert.equal(currentProgress.get()?.progress, 0.52);

    hydrateReadingStoreForPost('/posts/ue5-nanite/', 'UE5 Nanite 虚拟几何体', store);
    assert.equal(promptResumeSlipIfEligible({}, store), true);
    assert.equal(resumeSlip.get().visible, true);
    assert.equal(resumeSlip.get().percent, 52);
    assert.ok(resumeSlip.get().label.includes('簇级剔除'));

    // 用户继续深读超过 6% -> 自动收起未点击的续读浮条
    recordArticleProgress({ progress: 0.62, headingId: 'raster', headingText: '软光栅', now: 2000 }, store);
    assert.equal(resumeSlip.get().visible, false);

    // 忽略续读提示后同进度不再打扰
    dismissArticleResumeSlip('ue5-nanite', store);
    assert.equal(promptResumeSlipIfEligible({}, store), false);

    // 手动夹签增删与排序
    const bm2 = addArticleBookmark({ progress: 0.74, headingText: '材质评估', excerpt: '可见性缓冲延迟着色' }, store);
    const bm1 = addArticleBookmark({ progress: 0.22, headingText: 'BVH 层次', excerpt: 'DAG 簇组误差度量边界' }, store);
    assert.ok(bm1 && bm2);
    assert.equal(bookmarkCount.get(), 2);
    assert.equal(postBookmarksAtom.get()[0].id, bm1.id, '按阅读进度升序排列');

    assert.equal(toggleBookmarkPopoverOpen(), true);
    assert.equal(isPopoverOpen.get(), true);
    setBookmarkPopoverOpen(false);
    assert.equal(isPopoverOpen.get(), false);

    triggerReadingToast('已夹入书签');
    assert.equal(readingToast.get().visible, true);
    clearReadingToast();
    assert.equal(readingToast.get().visible, false);

    assert.equal(removeArticleBookmark(bm1.id, store), true);
    assert.equal(bookmarkCount.get(), 1);

    // B. zenStore 与 ZenAudioEngine 双向绑定
    const dom = new JSDOM('<!doctype html><html><body><canvas id="zenRainCanvas"></canvas></body></html>');
    try {
      const engine = new ZenAudioEngine();
      const unbind = bindZenAudioEngine(engine, { doc: dom.window.document, storage: store });

      setZenVolume(0.82, engine);
      assert.equal(zenVolume.get(), 0.82);
      assert.equal(volumePercent.get(), 82);

      engine.setScene('stream');
      assert.equal(sceneId.get(), 'stream');
      assert.equal(activeSceneMeta.get().name, '古寺清溪');

      setZenTimerMinutes(25, engine);
      assert.equal(timerMinutes.get(), 25);
      assert.equal(remainingSeconds.get(), 1500);
      assert.equal(formattedCountdown.get(), '25:00');

      setZenTimerMinutes(0, engine);
      assert.equal(formattedCountdown.get(), '--:--');

      assert.equal(rainEnabled.get(), true);
      assert.equal(toggleZenRainEnabled({ doc: dom.window.document, storage: store }, engine), false);
      assert.equal(dom.window.document.documentElement.getAttribute('data-zen-rain'), 'disabled');
      assert.equal(store.getItem('zen-rain-disabled'), '1');
      assert.equal(setZenRainEnabled(true, { doc: dom.window.document, storage: store }, engine), true);
      assert.equal(dom.window.document.documentElement.getAttribute('data-zen-rain'), null);

      setZenCapsuleOpen(true);
      assert.equal(isZenOpen.get(), true);
      assert.equal(toggleZenCapsuleOpen(), false);
      assert.equal(isZenPlaying.get(), false);

      unbind();
    } finally {
      dom.window.close();
      resetReadingStore();
      resetZenStore();
    }
  });

  it('4. React 19 + Motion Islands (CommandPaletteResults & BookmarkPopoverList): JSDOM 挂载、响应式重绘与无泄漏卸载', async () => {
    const islandHarnessCode = `
      import { mountCommandPaletteResultsIsland } from './src/components/islands/CommandPaletteResults.tsx';
      import { mountBookmarkPopoverIsland } from './src/components/islands/BookmarkPopoverList.tsx';
      import * as paletteStore from './src/stores/commandPaletteStore.ts';
      import * as readingStoreMod from './src/stores/readingStore.ts';

      window.__islandTest = {
        mountCommandPaletteResultsIsland,
        mountBookmarkPopoverIsland,
        paletteStore,
        readingStoreMod,
      };
    `;

    const bundled = esbuild.buildSync({
      stdin: {
        contents: islandHarnessCode,
        resolveDir: rootDir,
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
    }).outputFiles[0].text;

    const dom = new JSDOM(
      `<!doctype html><html><body>
        <div id="palette-host" data-search-results></div>
        <div id="bookmark-host" data-rbm-list></div>
      </body></html>`,
      { url: 'http://localhost/posts/test-post/', runScripts: 'outside-only' }
    );

    try {
      const { window: win, document: doc } = dom.window;
      win.matchMedia = () => ({ matches: false });
      win.requestAnimationFrame = (cb) => setTimeout(() => cb(16), 0);
      win.cancelAnimationFrame = (id) => clearTimeout(id);

      win.eval(bundled);
      const {
        mountCommandPaletteResultsIsland,
        mountBookmarkPopoverIsland,
        paletteStore,
        readingStoreMod,
      } = win.__islandTest;

      // 1. 挂载 CommandPaletteResults Island
      const activated = [];
      const paletteHost = doc.getElementById('palette-host');
      const paletteHandle = mountCommandPaletteResultsIsland(paletteHost, {
        onSelectResult: (idx, item) => activated.push({ idx, uid: item.uid }),
      });

      paletteStore.setPaletteIndexState('loading');
      await new Promise((r) => setTimeout(r, 25));
      assert.ok(paletteHost.textContent.includes('正在装载全站书目与知识索引'));

      paletteStore.applyPaletteQueryOutput(
        {
          effectiveCategory: 'all',
          isCommandPrefix: false,
          cleanQuery: '',
          statusText: '共 2 项',
          items: [
            {
              uid: 'resume:ue5-gc',
              kind: 'resume',
              category: 'posts',
              sectionLabel: '最近在读 · 继续展卷',
              title: 'UE5 GC 深度剖析',
              summary: '上次读至 64%',
              badge: '续读 64%',
              badgeTone: 'vermilion',
              metaRight: '2026-11-18',
              chips: ['GC'],
              href: '/posts/ue5-gc/?resume=1',
              progressRatio: 0.64,
              score: 1000,
              timestamp: 100,
            },
            {
              uid: 'cmd:theme-rice',
              kind: 'command',
              category: 'commands',
              sectionLabel: '快捷指令',
              title: '切换主题：古籍米笺',
              summary: '暖调护眼旧书笺纸',
              badge: '主题',
              badgeTone: 'ink',
              metaRight: '',
              chips: [],
              actionId: 'theme:rice',
              score: 900,
              timestamp: 90,
            },
          ],
        },
        { resetActive: true }
      );
      await new Promise((r) => setTimeout(r, 30));

      const renderedResults = paletteHost.querySelectorAll('[data-search-result]');
      assert.equal(renderedResults.length, 2, '应渲染 1 条续读链接与 1 条快捷指令按钮');
      assert.equal(renderedResults[0].tagName, 'A');
      assert.equal(renderedResults[1].tagName, 'BUTTON');
      assert.equal(renderedResults[0].getAttribute('aria-selected'), 'true');
      assert.ok(paletteHost.querySelector('[data-palette-active-indicator]'), '激活项应挂载水墨侧脊指示器');

      // 键盘向下切换激活项 -> 响应式重绘 aria-selected
      paletteStore.stepActivePaletteIndex(1);
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(
        paletteHost.querySelectorAll('[data-search-result]')[1].getAttribute('aria-selected'),
        'true'
      );

      paletteHost.querySelectorAll('[data-search-result]')[1].click();
      assert.equal(activated.length, 1);
      assert.equal(activated[0].uid, 'cmd:theme-rice');

      // 2. 挂载 BookmarkPopoverList Island
      const jumped = [];
      const deleted = [];
      const bookmarkHost = doc.getElementById('bookmark-host');
      readingStoreMod.hydrateReadingStoreForPost('test-post', '测试文章');
      const bmHandle = mountBookmarkPopoverIsland(bookmarkHost, {
        onJumpBookmark: (id) => jumped.push(id),
        onDeleteBookmark: (id) => {
          deleted.push(id);
          readingStoreMod.removeArticleBookmark(id);
        },
      });

      assert.ok(bookmarkHost.querySelector('.rbm-empty'), '初始无夹签时渲染空态提示');

      const createdBm = readingStoreMod.addArticleBookmark({
        postSlug: 'test-post',
        postTitle: '测试文章',
        progress: 0.45,
        headingId: 'sec-1',
        headingText: '第一章',
        excerpt: '水墨合成器零回流弹簧过渡',
      });
      await new Promise((r) => setTimeout(r, 30));

      assert.ok(createdBm);
      const jumpBtn = bookmarkHost.querySelector('[data-rbm-jump]');
      const delBtn = bookmarkHost.querySelector('[data-rbm-del]');
      assert.ok(jumpBtn && delBtn, '新增书签后响应式渲染跳转与删除按钮');
      jumpBtn.click();
      assert.deepEqual(jumped, [createdBm.id]);

      delBtn.click();
      assert.deepEqual(deleted, [createdBm.id]);
      assert.equal(readingStoreMod.bookmarkCount.get(), 0);

      // 卸载两个 React Islands，验证容器清空且无异常
      paletteHandle.unmount();
      bmHandle.unmount();
      assert.equal(paletteHost.innerHTML, '');
      assert.equal(bookmarkHost.innerHTML, '');
    } finally {
      dom.window.close();
    }
  });

  it('5. 壳层与阅读器源码契约审计: Motion 弹簧接入、零 filter:blur、零朱砂印章残留', () => {
    const baseLayout = readSrc('src/layouts/BaseLayout.astro');
    const readingAstro = readSrc('src/components/ReadingBookmark.astro');
    const zenAstro = readSrc('src/components/ZenSoundscape.astro');
    const paletteIsland = readSrc('src/components/islands/CommandPaletteResults.tsx');
    const bookmarkIsland = readSrc('src/components/islands/BookmarkPopoverList.tsx');

    assert.ok(baseLayout.includes("from 'motion'"), 'BaseLayout 应接入 vanilla motion 弹簧动画');
    assert.ok(baseLayout.includes('mountCommandPaletteResultsIsland'), 'BaseLayout 应挂载 CommandPaletteResults React Island');
    assert.ok(readingAstro.includes('mountBookmarkPopoverIsland'), 'ReadingBookmark 应挂载 BookmarkPopoverList React Island');
    assert.ok(zenAstro.includes('../stores/zenStore'), 'ZenSoundscape 应接入响应式 zenStore');

    for (const [name, code] of [
      ['BaseLayout.astro', baseLayout],
      ['ReadingBookmark.astro', readingAstro],
      ['ZenSoundscape.astro', zenAstro],
      ['CommandPaletteResults.tsx', paletteIsland],
      ['BookmarkPopoverList.tsx', bookmarkIsland],
    ]) {
      assert.doesNotMatch(code, /(?<![a-z-])filter\s*:\s*[^;]*blur\(/i, `${name} 严禁包含动态 filter: blur`);
      assert.doesNotMatch(
        code,
        /#b83b28|#d9533f|#c23f2c|194,\s*63,\s*44|184,\s*59,\s*40/i,
        `${name} 严禁残留硬编码朱砂红颜色`
      );
    }
  });

  it('6. Vanilla Motion Springs: 命令面板游标与宣纸浮层弹簧物理在 JSDOM 中可中断且零残留停止', async () => {
    const motionSnippet = `
      import { animate, spring } from 'motion';
      import { computePaletteGliderGeometry } from './src/utils/commandPaletteEngine.ts';
      window.__runMotionCheck = (gliderEl, modalEl) => {
        const g = computePaletteGliderGeometry(84, 68, 30, 100, 30, 2);
        gliderEl.style.setProperty('--pill-rx', g.rx + 'px');
        gliderEl.style.setProperty('--pill-ry', g.ry + 'px');
        const c1 = animate(gliderEl, { transform: g.transform, opacity: 1 }, { type: spring, stiffness: 480, damping: 35 });
        const c2 = animate(
          modalEl,
          {
            opacity: [0, 1],
            transform: ['translate3d(0px, -24px, 0) scale(0.92, 0.86)', 'translate3d(0px, 0px, 0) scale(1, 1)'],
          },
          { type: spring, stiffness: 390, damping: 32 }
        );
        return () => {
          c1.stop();
          c2.stop();
        };
      };
    `;

    const bundled = esbuild.buildSync({
      stdin: { contents: motionSnippet, resolveDir: rootDir, loader: 'ts' },
      bundle: true,
      write: false,
      format: 'iife',
    }).outputFiles[0].text;

    const dom = new JSDOM('<!doctype html><html><body><span id="glider"></span><div id="modal"></div></body></html>', {
      runScripts: 'outside-only',
    });

    try {
      const { window: win, document: doc } = dom.window;
      win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(16), 4);
      win.cancelAnimationFrame = (id) => win.clearTimeout(id);
      win.eval(bundled);

      const glider = doc.getElementById('glider');
      const modal = doc.getElementById('modal');
      const stopAll = win.__runMotionCheck(glider, modal);

      await new Promise((r) => setTimeout(r, 35));
      assert.ok(parseFloat(glider.style.getPropertyValue('--pill-rx')) > 0, '游标应写入反向圆角补偿 --pill-rx');
      assert.ok((modal.getAttribute('style') || '').includes('transform'), '模态框应由 Motion 弹簧驱动合成器 transform');
      stopAll();
    } finally {
      dom.window.close();
    }
  });
});
