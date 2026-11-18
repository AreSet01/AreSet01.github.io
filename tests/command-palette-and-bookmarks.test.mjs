import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

import {
  addManualBookmark,
  dismissReadingResume,
  getAllBookmarks,
  getArticleBookmarks,
  getArticleReadingProgress,
  getRecentReadingProgress,
  loadAllReadingEntries,
  removeManualBookmark,
  saveAllReadingEntries,
  shouldPromptResume,
  upsertReadingProgress,
} from '../src/utils/readingBookmarkEngine.ts';
import { mergeServerReadingEntries } from '../src/utils/readingSync.ts';
import {
  PALETTE_CATEGORIES,
  buildDefaultCommands,
  buildPostSearchIndexEntry,
  computePaletteGliderGeometry,
  parsePaletteQuery,
  queryCommandPalette,
  stepPaletteCategory,
} from '../src/utils/commandPaletteEngine.ts';

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

describe('⌘K 全局命令面板跨库混合检索 & 「夹签续读」书签同步套件', () => {
  it('1. search-index.json.ts: 加密文章 (locked: true) 严格脱敏正文，公开文章保留全文检索内容', () => {
    const lockedItem = buildPostSearchIndexEntry({
      id: 'secret-ue5-note',
      body: 'TOP_SECRET_KERNEL_TOKEN 绝密内容不应出现在静态索引中',
      data: {
        title: '私密架构手记',
        description: '内部敏感摘要',
        pubDate: new Date('2026-10-01'),
        tags: ['private'],
        locked: true,
        passwordHint: '书斋暗号',
      },
    });

    assert.equal(lockedItem.locked, true);
    assert.equal(lockedItem.content, '', '加密文章必须清空搜索索引正文');
    assert.equal(lockedItem.description, '内部敏感摘要');
    assert.ok(!lockedItem.excerpt.includes('TOP_SECRET_KERNEL_TOKEN'), '加密文章摘要绝不能泄露正文');
    assert.ok(lockedItem.excerpt.includes('书斋暗号'), '加密文章可展示安全的密码提示');

    const publicItem = buildPostSearchIndexEntry({
      id: 'ue5-cdo-deep-dive',
      body: '## CDO 初始化\nUClass Default Object 在引擎启动阶段构建。',
      data: {
        title: 'UE5 CDO 深度剖析',
        pubDate: new Date('2026-10-02'),
        tags: ['UE5', 'C++'],
        category: '源码剖析',
      },
    });

    assert.equal(publicItem.locked, false);
    assert.ok(publicItem.content.includes('UClass Default Object'));
    assert.equal(publicItem.category, '源码剖析');
  });

  it('2. readingBookmarkEngine: 自动阅读进度阈值、读完归档、关闭防打扰与一文多签管理', () => {
    const store = createMemoryStorage();

    // 低于 4% 的浅层浏览不落盘垃圾记录
    const shallow = upsertReadingProgress(
      { postSlug: '/posts/ue5-gc/', postTitle: 'UE5 GC', progress: 0.02 },
      store
    );
    assert.equal(shallow, null);

    // 阅读至 64%：有效在读，应提示续读
    const mid = upsertReadingProgress(
      {
        postSlug: '/posts/ue5-gc/',
        postTitle: 'UE5 GC 垃圾回收',
        progress: 0.642,
        headingId: 'mark-sweep',
        headingText: '3.2 标记清扫阶段',
        now: 1000,
      },
      store
    );
    assert.ok(mid);
    assert.equal(mid.postSlug, 'ue5-gc');
    assert.equal(mid.completed, false);
    assert.equal(shouldPromptResume(mid), true);

    // 用户点击 × 忽略当前续读提示：同一进度不再弹出，推进 >= 3% 后重新武装
    dismissReadingResume('ue5-gc', store);
    assert.equal(shouldPromptResume(getArticleReadingProgress('ue5-gc', store)), false);

    upsertReadingProgress(
      {
        postSlug: 'ue5-gc',
        postTitle: 'UE5 GC 垃圾回收',
        progress: 0.71,
        headingId: 'reachability',
        headingText: '3.4 可达性分析',
        now: 2000,
      },
      store
    );
    assert.equal(shouldPromptResume(getArticleReadingProgress('ue5-gc', store)), true);
    assert.equal(getRecentReadingProgress(3, store).length, 1);

    // 阅读至 >= 95%：自动标记 completed，不再纳入未读完列表
    const done = upsertReadingProgress(
      { postSlug: 'ue5-gc', postTitle: 'UE5 GC 垃圾回收', progress: 0.97, now: 3000 },
      store
    );
    assert.equal(done?.completed, true);
    assert.equal(shouldPromptResume(done), false);
    assert.equal(getRecentReadingProgress(3, store).length, 0);

    // 一文多签：同一篇文章可添加多处不同段落书签，按正文进度升序排列
    const bmLate = addManualBookmark(
      {
        postSlug: 'ue5-uht',
        postTitle: 'UE5 UHT 代码生成',
        progress: 0.78,
        headingId: 'gen-cpp',
        headingText: '生成 gen.cpp',
        excerpt: 'Z_Construct_UClass 负责注册反射元数据',
        now: 4000,
      },
      store
    );
    const bmEarly = addManualBookmark(
      {
        postSlug: 'ue5-uht',
        postTitle: 'UE5 UHT 代码生成',
        progress: 0.25,
        headingId: 'header-parse',
        headingText: '头文件词法扫描',
        excerpt: 'UCLASS 宏在第 14 行展开为 GENERATED_BODY 桩代码',
        now: 4500,
      },
      store
    );
    assert.ok(bmLate && bmEarly);

    const postBms = getArticleBookmarks('ue5-uht', store);
    assert.equal(postBms.length, 2);
    assert.equal(postBms[0].id, bmEarly.id, '本文夹签列表按文章阅读位置从前到后排序');
    assert.equal(postBms[1].id, bmLate.id);

    // 模拟已同步上云的书签被删除 -> 保留 deleted 墓碑供下次 Push
    const allWithRev = loadAllReadingEntries(store).map((e) =>
      e.id === bmEarly.id ? { ...e, serverRev: 12, dirty: false } : e
    );
    saveAllReadingEntries(allWithRev, false, store);
    assert.equal(removeManualBookmark(bmEarly.id, store), true);
    assert.equal(getArticleBookmarks('ue5-uht', store).length, 1);
    const rawTombstone = loadAllReadingEntries(store).find((e) => e.id === bmEarly.id);
    assert.equal(rawTombstone?.deleted, true, '已上云书签删除后保留墓碑以同步跨设备删除');
    assert.equal(getAllBookmarks(store).length, 1);
  });

  it('3. readingSync: LWW 冲突合并保护本地更新的 dirty 修改并正确应用远端墓碑', () => {
    const store = createMemoryStorage();
    upsertReadingProgress(
      { postSlug: 'post-local-newer', postTitle: '本地更新篇', progress: 0.62, now: 5000 },
      store
    );
    const bm = addManualBookmark(
      {
        postSlug: 'post-remote-del',
        postTitle: '远端删除篇',
        progress: 0.4,
        excerpt: '即将被远端墓碑移除',
        now: 2000,
      },
      store
    );

    const applied = mergeServerReadingEntries(
      [
        // 远端版本比本地 dirty 版本旧 -> 保留本地 62%
        {
          id: 'prog:post-local-newer',
          kind: 'progress',
          postSlug: 'post-local-newer',
          postTitle: '本地更新篇',
          progress: 0.25,
          completed: false,
          updatedAt: 3000,
          serverRev: 4,
        },
        // 远端新增另一台设备的阅读进度
        {
          id: 'prog:post-from-ipad',
          kind: 'progress',
          postSlug: 'post-from-ipad',
          postTitle: 'iPad 阅读篇',
          progress: 0.51,
          headingId: 'sec-2',
          headingText: '第二节 渲染管线',
          completed: false,
          updatedAt: 6000,
          serverRev: 5,
        },
        // 远端更新的删除墓碑 -> 移除本地对应书签
        {
          id: bm.id,
          kind: 'bookmark',
          postSlug: 'post-remote-del',
          postTitle: '远端删除篇',
          progress: 0.4,
          excerpt: '即将被远端墓碑移除',
          createdAt: 2000,
          updatedAt: 7000,
          deleted: true,
          serverRev: 6,
        },
      ],
      store
    );

    assert.equal(applied, 2);
    assert.equal(getArticleReadingProgress('post-local-newer', store)?.progress, 0.62);
    assert.equal(getArticleReadingProgress('post-from-ipad', store)?.progress, 0.51);
    assert.equal(getArticleBookmarks('post-remote-del', store).length, 0);
  });

  it('4. commandPaletteEngine: 空态置顶「最近在读」、跨库检索 (文章/笔记/夹签/深度导图节点) 与 > 指令前缀', () => {
    const sources = {
      basePath: '/',
      posts: [
        {
          title: 'UE5 反射系统深度解析',
          description: 'UObject 与 UClass 底层元数据结构',
          content: 'FProperty 链表与函数反射调用机制',
          tags: ['UE5', 'Reflection'],
          category: '引擎架构',
          slug: 'ue5-reflection',
          href: '/posts/ue5-reflection/',
          dateLabel: '2026-11-10',
          publishedAt: 1762732800000,
        },
      ],
      recentReading: [
        {
          id: 'prog:ue5-reflection',
          kind: 'progress',
          postSlug: 'ue5-reflection',
          postTitle: 'UE5 反射系统深度解析',
          progress: 0.58,
          headingId: 'uclass-layout',
          headingText: '2.3 UClass 内存布局',
          completed: false,
          updatedAt: 1762800000000,
        },
      ],
      noteBuckets: [
        {
          postSlug: 'ue5-reflection',
          records: [
            {
              id: 'hl_101',
              kind: 'highlight',
              text: 'CDO 始终保存在 UClass::ClassDefaultObject 指针槽位中',
              comment: '调试器观察偏移 0x118',
              prefix: '',
              suffix: '',
              headingId: 'cdo-slot',
              headingText: 'CDO 槽位',
              timestamp: 1762750000000,
              updatedAt: 1762750000000,
            },
          ],
        },
      ],
      bookmarks: [
        {
          id: 'bm_202',
          kind: 'bookmark',
          postSlug: 'ue5-reflection',
          postTitle: 'UE5 反射系统深度解析',
          progress: 0.42,
          headingId: 'rpc-flag',
          headingText: 'RPC 函数标记',
          excerpt: 'FUNC_Net 标志位由 UHT 在编译期注入',
          createdAt: 1762760000000,
          updatedAt: 1762760000000,
        },
      ],
      mindmaps: [
        {
          id: 'mm_ue5_arch',
          title: 'UE5 核心对象模型全景图',
          category: '架构拆解',
          tags: ['UObject'],
          layout: 'logic-right',
          createdAt: 1762700000000,
          updatedAt: 1762790000000,
          root: {
            id: 'n_root',
            text: 'UObject 体系',
            children: [
              {
                id: 'n_sub1',
                text: '垃圾回收簇',
                children: [
                  {
                    id: 'n_leaf_guobject',
                    text: 'GUObjectArray 全局对象表与簇索引',
                    note: '支持无锁并发按索引寻址',
                    children: [],
                  },
                ],
              },
            ],
          },
        },
      ],
      commands: buildDefaultCommands({
        isArticlePage: true,
        currentTheme: 'light',
        currentFont: 'pixel',
        hasRecentResume: true,
        recentResumeTitle: 'UE5 反射系统深度解析',
        recentResumeHref: '/posts/ue5-reflection/?resume=1',
      }),
    };

    // A. 空查询 all 分类：首条必须是「最近在读」续读卡
    const emptyAll = queryCommandPalette('', 'all', sources);
    assert.equal(emptyAll.effectiveCategory, 'all');
    assert.equal(emptyAll.items[0]?.kind, 'resume', '空态首条必须置顶最近在读文章');
    assert.equal(emptyAll.items[0]?.badge, '续读 58%');
    assert.equal(emptyAll.items[0]?.href, '/posts/ue5-reflection/?resume=1');

    // B. 跨库搜批注关键词 -> 命中划线笔记并直达文章 ?noteId=hl_101
    const noteHit = queryCommandPalette('0x118', 'all', sources);
    assert.equal(noteHit.items[0]?.kind, 'note');
    assert.equal(noteHit.items[0]?.href, '/posts/ue5-reflection/?noteId=hl_101');

    // C. 跨库搜手动夹签 -> 命中夹签并直达文章 ?bm=bm_202
    const bmHit = queryCommandPalette('FUNC_Net', 'notes', sources);
    assert.equal(bmHit.items[0]?.kind, 'bookmark');
    assert.equal(bmHit.items[0]?.href, '/posts/ue5-reflection/?bm=bm_202');

    // D. 深度检索思维导图三级子节点 -> 展示脉络面包屑并直达 ?map=...&node=...
    const mmNodeHit = queryCommandPalette('GUObjectArray', 'all', sources);
    assert.equal(mmNodeHit.items[0]?.kind, 'mindmap');
    assert.equal(mmNodeHit.items[0]?.badge, '导图节点');
    assert.ok(mmNodeHit.items[0]?.summary.includes('UObject 体系 › 垃圾回收簇 › GUObjectArray'));
    assert.equal(mmNodeHit.items[0]?.href, '/mindmap/?map=mm_ue5_arch&node=n_leaf_guobject');

    // E. 输入 `>` 或中文全角 `＞` 前缀 -> 自动进入指令模式
    assert.equal(parsePaletteQuery('> 米笺', 'posts').isCommandPrefix, true);
    assert.equal(parsePaletteQuery('＞ 听雨', 'all').effectiveCategory, 'commands');
    const cmdHit = queryCommandPalette('> 米笺', 'posts', sources);
    assert.equal(cmdHit.effectiveCategory, 'commands');
    assert.equal(cmdHit.items[0]?.actionId, 'theme:rice');

    // F. Tab 分类循环与水墨胶囊反向圆角不越界校验
    assert.equal(stepPaletteCategory('all', 1), 'posts');
    assert.equal(stepPaletteCategory('all', -1), 'commands');
    assert.equal(PALETTE_CATEGORIES.length, 5);

    for (const w of [44, 64, 88, 124]) {
      for (const h of [26, 30, 34]) {
        const g = computePaletteGliderGeometry(12, w, h, 100, 30, 3);
        assert.ok(2 * g.rx <= 100.05, `2*rx (${2 * g.rx}) <= 100`);
        assert.ok(2 * g.ry <= 30.05, `2*ry (${2 * g.ry}) <= 30`);
      }
    }
  });

  it('5. 60-120fps 零模糊合成器约束、服务端路由与 JSDOM 交互接线验证', async () => {
    const readingAstro = readSrc('src/components/ReadingBookmark.astro');
    const baseLayout = readSrc('src/layouts/BaseLayout.astro');
    const globalCss = readSrc('src/styles/global.css');
    const serverCode = readSrc('server/ask.mjs');
    const nginxConf = readSrc('server/nginx.conf.example');

    // 1. 严禁逐帧 filter: blur 与未卸载生命周期
    assert.doesNotMatch(readingAstro, /(?<![a-z-])filter\s*:\s*[^;]*blur\(/i, 'ReadingBookmark 严禁使用动态 filter: blur');
    assert.match(readingAstro, /__areSetReadingBookmarkCleanup__/, 'ReadingBookmark 必须提供幂等销毁钩子');
    assert.match(globalCss, /\.search-tab-glider\s*\{[\s\S]*?border-radius:\s*var\(--pill-rx,\s*9999px\)\s*\/\s*var\(--pill-ry,\s*9999px\);/, '命令面板分类游标必须采用反向椭圆圆角补偿');

    // 2. 依然完整保留全局搜索 Tab 焦点捕获
    assert.ok(
      baseLayout.includes('function trapFocusInContainer(container, event)') &&
      baseLayout.includes('trapFocusInContainer(searchOverlay, event);'),
      'BaseLayout 必须保持全局搜索焦点陷阱无障碍契约'
    );

    // 3. 服务端 /api/notes/reading/* (零运维兼容已有 Nginx) 与 /api/reading/* 双路由就位
    assert.ok(serverCode.includes("pathname.startsWith('/api/notes/reading/')"), 'server/ask.mjs 支持 /api/notes/reading/* 兼容反代');
    assert.ok(serverCode.includes("pathname.startsWith('/api/reading/')"), 'server/ask.mjs 支持 /api/reading/* 直接路由');
    assert.ok(nginxConf.includes('reading(/.*)?'), 'nginx.conf.example 已同步包含 reading 反代');

    // 4. 在 JSDOM 中打包运行 ReadingBookmark.astro，验证按 B 键夹签、列表渲染与删除闭环
    const scriptBody = readingAstro.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
    const markup = readingAstro.slice(0, readingAstro.indexOf('<style>')).replace(/---[\s\S]*?---/, '');
    const bundled = esbuild.buildSync({
      stdin: {
        contents: scriptBody,
        resolveDir: path.join(rootDir, 'src/components'),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'iife',
    }).outputFiles[0].text;

    const dom = new JSDOM(
      `<!doctype html><html><body>
        <article>
          <h1 data-post-title>UE5 智能指针详解</h1>
          <button type="button" data-article-bookmarks-trigger><span data-bookmarks-count>0</span></button>
          <div data-post-prose>
            <h2 id="shared-ptr">TSharedPtr 引用计数</h2>
            <p id="p-first">ESPMode::ThreadSafe 使用原子指令维护强弱引用计数控制块。</p>
          </div>
        </article>
        ${markup}
      </body></html>`,
      { url: 'http://localhost/posts/ue5-smart-pointers/', runScripts: 'outside-only' }
    );

    try {
      const { window: win, document: doc } = dom.window;
      win.matchMedia = () => ({ matches: false });
      win.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
      win.cancelAnimationFrame = (id) => clearTimeout(id);
      win.fetch = async () => ({ status: 401, ok: false, json: async () => ({}) });
      doc.getElementById('p-first').getBoundingClientRect = () => ({
        top: 180, bottom: 220, left: 40, right: 640, width: 600, height: 40,
      });
      doc.querySelector('[data-post-prose]').getBoundingClientRect = () => ({
        top: 100, bottom: 2100, left: 40, right: 640, width: 600, height: 2000,
      });

      win.eval(bundled);
      assert.ok(win.__readingBookmarks, '挂载全局 __readingBookmarks 协作接口');

      // 按 B 键在当前阅读行夹入书签
      win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 30));

      assert.equal(doc.querySelector('[data-bookmarks-count]').textContent, '1', '按 B 键成功新增夹签并同步角标');
      assert.equal(win.__readingBookmarks.getBookmarks().length, 1);
      assert.ok(win.__readingBookmarks.getBookmarks()[0].excerpt.includes('ESPMode::ThreadSafe'));

      // 展开夹签浮笺并点击删除
      doc.querySelector('[data-article-bookmarks-trigger]').click();
      await new Promise((r) => setTimeout(r, 30));
      const popover = doc.getElementById('reading-bookmarks-popover');
      assert.equal(popover.hidden, false);
      const delBtn = popover.querySelector('[data-rbm-del]');
      assert.ok(delBtn, '浮笺列表渲染出删除按钮');
      delBtn.click();
      assert.equal(doc.querySelector('[data-bookmarks-count]').textContent, '0', '删除书签后角标归零');
    } finally {
      dom.window.__areSetReadingBookmarkCleanup__?.();
      dom.window.close();
    }
  });
});
