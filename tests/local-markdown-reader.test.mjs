import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildLocalReaderSlug,
  buildReaderDocUrl,
  createLocalDocId,
  deleteLocalDoc,
  findDuplicateDocByFileName,
  getDocAssets,
  getLocalDoc,
  isLocalReaderSlug,
  listLocalDocs,
  listLocalReaderIndex,
  normalizeAssetPath,
  parseLocalReaderSlug,
  resetLocalReaderMemoryStoreForTest,
  resolveAssetPathForDoc,
  saveLocalDoc,
  updateLocalDocMeta,
} from '../src/utils/localReaderStorage.ts';

import {
  convertObsidianImageEmbeds,
  detectCodeLanguages,
  loadCodeHighlighter,
  parseFenceMeta,
  parseFrontmatter,
  parseMarkdownDocument,
  renderLocalMarkdownBody,
  SAMPLE_READER_MARKDOWN,
  splitHighlightedHtmlIntoLines,
} from '../src/utils/localMarkdownRenderer.ts';

import {
  buildDefaultCommands,
  queryCommandPalette,
} from '../src/utils/commandPaletteEngine.ts';

const rootDir = process.cwd();

function installMockLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  return store;
}

describe('本地 Markdown 阅读器全链路测试套件 (Local Markdown Reader Suite)', () => {
  beforeEach(() => {
    installMockLocalStorage();
    resetLocalReaderMemoryStoreForTest();
  });

  it('1. Slug 协议、URL 构建与本地相对路径图片解析引擎', () => {
    const id = createLocalDocId();
    assert.match(id, /^doc_[a-z0-9]+_[a-z0-9]+$/);

    const slug = buildLocalReaderSlug(id);
    assert.equal(slug, `reader/${id}`);
    assert.equal(isLocalReaderSlug(slug), true);
    assert.equal(parseLocalReaderSlug(`/${slug}/`), id);
    assert.equal(parseLocalReaderSlug(`posts/${slug}`), id);
    assert.equal(parseLocalReaderSlug('ue5-gc-deep-dive'), null);

    const url = buildReaderDocUrl(id, { highlightId: 'hl-99', resume: true });
    assert.equal(url, `/reader/?doc=${id}&resume=1#highlight-hl-99`);

    // 相对路径规范化 & 中文 URL 编码 & Obsidian 文件名兜底
    assert.equal(normalizeAssetPath('./docs/../images/架构%20图.png?v=1'), 'images/架构 图.png');

    const available = [
      'ue5-notes/images/pipeline.png',
      'ue5-notes/assets/内存布局.webp',
      'shared/logo.svg',
    ];
    assert.equal(
      resolveAssetPathForDoc('ue5-notes', './images/pipeline.png', available),
      'ue5-notes/images/pipeline.png',
    );
    assert.equal(
      resolveAssetPathForDoc('ue5-notes', 'assets/%E5%86%85%E5%AD%98%E5%B8%83%E5%B1%80.webp', available),
      'ue5-notes/assets/内存布局.webp',
    );
    assert.equal(
      resolveAssetPathForDoc('ue5-notes/sub', '../images/pipeline.png', available),
      'ue5-notes/images/pipeline.png',
    );
    // Obsidian ![[pipeline.png]] 仅凭文件名匹配
    assert.equal(
      resolveAssetPathForDoc('', 'pipeline.png', available),
      'ue5-notes/images/pipeline.png',
    );
    // 外部 URL 不走本地图片解析
    assert.equal(resolveAssetPathForDoc('ue5-notes', 'https://example.com/a.png', available), null);
  });

  it('2. 书架存储 CRUD、图片关联、同名检测与 localStorage 同步索引镜像', async () => {
    const parsed = parseMarkdownDocument(SAMPLE_READER_MARKDOWN, 'guide.md');
    const docId = 'doc_test_01';
    const now = Date.now();
    const fakeBlob = new Blob(['fake-image-bytes'], { type: 'image/png' });

    await saveLocalDoc(
      {
        id: docId,
        title: parsed.title,
        fileName: 'guide.md',
        docDir: 'notes',
        folderName: 'notes',
        category: parsed.category,
        tags: parsed.tags,
        description: parsed.description,
        pubDate: parsed.pubDate,
        markdown: SAMPLE_READER_MARKDOWN,
        wordCount: parsed.wordCount,
        readingMinutes: parsed.readingMinutes,
        headings: parsed.headings,
        assetPaths: [],
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      },
      [
        {
          path: 'notes/images/demo.png',
          fileName: 'demo.png',
          mimeType: 'image/png',
          blob: fakeBlob,
          size: fakeBlob.size,
        },
      ],
      { replaceAssets: true },
    );

    const loaded = await getLocalDoc(docId);
    assert.ok(loaded);
    assert.equal(loaded.title, parsed.title);
    assert.deepEqual(loaded.assetPaths, ['notes/images/demo.png']);

    const assets = await getDocAssets(docId);
    assert.equal(assets.length, 1);
    assert.equal(assets[0].normalizedPath, 'notes/images/demo.png');

    // 同步索引镜像应立即可供 Cmd+K / /notes 读取
    const indexEntries = listLocalReaderIndex();
    assert.equal(indexEntries.length, 1);
    assert.equal(indexEntries[0].id, docId);
    assert.equal(indexEntries[0].assetCount, 1);

    // 同名检测
    const allDocs = await listLocalDocs();
    assert.equal(findDuplicateDocByFileName(allDocs, 'GUIDE.MD')?.id, docId);
    assert.equal(findDuplicateDocByFileName(allDocs, 'other.md'), null);

    // 修改分类并保留原资源
    await updateLocalDocMeta(docId, { category: '学习笔记' });
    const afterMeta = await getLocalDoc(docId);
    assert.equal(afterMeta?.category, '学习笔记');
    assert.equal((await getDocAssets(docId)).length, 1);

    // 删除文稿同时清理关联图片与索引
    await deleteLocalDoc(docId);
    assert.equal(await getLocalDoc(docId), null);
    assert.equal((await getDocAssets(docId)).length, 0);
    assert.equal(listLocalReaderIndex().length, 0);
  });

  it('3. YAML Frontmatter、标题去重、围栏元数据与多行高亮 HTML 安全换行拆分', () => {
    const raw = `---
title: "UE5 反射深度笔记"
description: 拆解 UClass 与 FProperty 内存布局
category: 源码研读
tags:
  - UE5
  - C++
pubDate: 2026-11-19
---

# UE5 反射深度笔记

## 一、对象模型

正文第一段说明。

### 1.1 FProperty 链表
`;

    const fm = parseFrontmatter(raw);
    assert.equal(fm.title, 'UE5 反射深度笔记');
    assert.equal(fm.category, '源码研读');
    assert.deepEqual(fm.tags, ['UE5', 'C++']);

    const parsed = parseMarkdownDocument(raw, 'reflection.md');
    assert.equal(parsed.title, 'UE5 反射深度笔记');
    assert.ok(!parsed.body.trim().startsWith('# UE5 反射深度笔记'), '与 Frontmatter 重复的 leading H1 应自动去重');
    assert.equal(parsed.headings.length, 2);
    assert.equal(parsed.headings[0].depth, 2);
    assert.equal(parsed.headings[1].depth, 3);
    assert.ok(parsed.wordCount > 5);

    const fence = parseFenceMeta('cpp title="MyActor.h" showLineNumbers {2,4-6}');
    assert.equal(fence.lang, 'cpp');
    assert.equal(fence.title, 'MyActor.h');
    assert.equal(fence.forceNumbers, true);
    assert.deepEqual([...fence.highlights].sort((a, b) => a - b), [2, 4, 5, 6]);

    // 跨行 <span class="hljs-comment"> 必须逐行闭合与重开，避免破坏 DOM 树
    const split = splitHighlightedHtmlIntoLines('<span class="hljs-comment">/* line 1\nline 2 */</span>\nint x = 1;');
    assert.equal(split.length, 3);
    assert.equal(split[0], '<span class="hljs-comment">/* line 1</span>');
    assert.equal(split[1], '<span class="hljs-comment">line 2 */</span>');
    assert.equal(split[2], 'int x = 1;');
  });

  it('4. 全功能 Markdown 渲染：highlight.js 代码高亮、KaTeX、Mermaid、Alerts、Obsidian 本地图片与 XSS 清洗', async () => {
    const hljs = await loadCodeHighlighter();
    assert.ok(hljs, 'highlight.js 常用语言子集应成功懒加载');

    const obsidianSrc = convertObsidianImageEmbeds('见图 ![[arch.png|架构图]] 与代码块 `![[ignored.png]]`');
    assert.ok(obsidianSrc.includes('![架构图](arch.png)'));
    assert.ok(obsidianSrc.includes('`![[ignored.png]]`'));

    const md = `
## 核心架构

> [!TIP] 提示标题
> 这里支持 **“中文粗体”** 与行内公式 $E = mc^2$。

\`\`\`cpp title="Demo.cpp" showLineNumbers {2}
// single line
int value = 42;
\`\`\`

\`\`\`mermaid title="流程图"
flowchart LR
  A --> B
\`\`\`

![已加载本地图](./images/arch.png)
![未上传本地图](./images/missing.png)

| 列A | 列B |
| --- | --- |
| 1 | 2 |

<script>alert('xss')</script>
`;

    const assetUrls = new Map([['docs/images/arch.png', 'blob:http://localhost/mock-arch']]);
    const rendered = renderLocalMarkdownBody(md, {
      docDir: 'docs',
      assetUrlMap: assetUrls,
      highlighter: hljs,
    });

    assert.match(rendered.html, /<h2 id="核心架构">/, '标题必须生成稳定锚点 id');
    assert.match(rendered.html, /class="callout-card callout-tip"/, '应支持 GitHub Alerts 笺注块');
    assert.match(rendered.html, /<strong>“中文粗体”<\/strong>/, 'CJK 粗体归一化应生效');
    assert.match(rendered.html, /class="katex"/, 'KaTeX 数学公式应渲染');
    assert.match(rendered.html, /class="astro-code reader-code"/, '代码块应输出博客同款容器类');
    assert.match(rendered.html, /data-title="Demo\.cpp"/, '代码块应透传 title 元数据');
    assert.match(rendered.html, /data-line-numbers="true"/, '代码块应透传行号开关');
    assert.match(rendered.html, /class="line highlighted"/, '代码块应标记指定高亮行');
    assert.match(rendered.html, /hljs-keyword|hljs-number/, 'highlight.js 应产出语法着色 token');
    assert.match(rendered.html, /class="mermaid-block"/, 'Mermaid 应输出与 remarkMermaid 一致的容器');
    assert.match(rendered.html, /class="table-scroll-wrap"/, '表格应包裹横向滚动容器');
    assert.match(rendered.html, /src="blob:http:\/\/localhost\/mock-arch"/, '本地相对图片应解析为 ObjectURL');
    assert.match(rendered.html, /data-missing-asset="true"/, '缺失本地图片应渲染优雅占位提示');
    assert.deepEqual(rendered.missingAssets, ['./images/missing.png']);
    assert.doesNotMatch(rendered.html, /<script/i, '危险脚本标签必须被清洗');
  });

  it('5. ⌘K 全局命令面板无缝融合：页面直达、书架文稿检索与 /reader 续读/书签/笔记路由', () => {
    const cmds = buildDefaultCommands({ basePath: '/' });
    assert.ok(cmds.some((c) => c.id === 'cmd:nav-reader' && c.href === '/reader/'), '⌘K 必须内置前往 /reader 导航指令');

    const out = queryCommandPalette('Shader', 'all', {
      posts: [],
      localDocs: [
        {
          id: 'doc_shader_1',
          title: 'UE5 Shader 编译管线剖析',
          fileName: 'shader-pipeline.md',
          folderName: '',
          category: '技术文档',
          tags: ['UE5', 'HLSL'],
          description: '本地上传的着色器研读笔记',
          pubDate: '2026-11-19',
          wordCount: 3200,
          readingMinutes: 9,
          assetCount: 2,
          createdAt: 1000,
          updatedAt: 2000,
          lastOpenedAt: 3000,
        },
      ],
      recentReading: [
        {
          id: 'prog:reader/doc_shader_1',
          kind: 'progress',
          postSlug: 'reader/doc_shader_1',
          postTitle: 'UE5 Shader 编译管线剖析',
          progress: 0.42,
          headingId: 'shader-cache',
          headingText: 'DDC 着色器缓存',
          completed: false,
          updatedAt: 4000,
        },
      ],
      bookmarks: [
        {
          id: 'bm_local_1',
          kind: 'bookmark',
          postSlug: 'reader/doc_shader_1',
          postTitle: 'UE5 Shader 编译管线剖析',
          progress: 0.55,
          headingId: 'shader-cache',
          headingText: 'DDC 着色器缓存',
          excerpt: 'Shader Permutation 裁剪机制',
          createdAt: 3500,
          updatedAt: 3500,
        },
      ],
      noteBuckets: [
        {
          postSlug: 'reader/doc_shader_1',
          records: [
            {
              id: 'hl_local_1',
              postSlug: 'reader/doc_shader_1',
              postTitle: 'UE5 Shader 编译管线剖析',
              text: 'Shader 变体爆炸治理思路',
              comment: '核心排查点',
              color: 'gold',
              timestamp: 3600,
            },
          ],
        },
      ],
      basePath: '/',
    });

    const localPostItem = out.items.find((i) => i.uid === 'post:reader/doc_shader_1');
    const resumeItem = out.items.find((i) => i.uid === 'resume:prog:reader/doc_shader_1');
    const bmItem = out.items.find((i) => i.uid === 'bm:bm_local_1');
    const noteItem = out.items.find((i) => i.uid === 'note:hl_local_1');

    assert.equal(localPostItem?.href, '/reader/?doc=doc_shader_1');
    assert.equal(resumeItem?.href, '/reader/?doc=doc_shader_1&resume=1');
    assert.equal(bmItem?.href, '/reader/?doc=doc_shader_1&bm=bm_local_1');
    assert.equal(noteItem?.href, '/reader/?doc=doc_shader_1#highlight-hl_local_1');
  });

  it('6. 全站接线完整性契约：导航栏、/notes、/mindmap、阅读伴读组件、无障碍主锚点与 /api/ask 服务端支持', () => {
    const read = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

    const header = read('src/components/Header.astro');
    assert.ok(header.includes("href: '/reader'"), 'Header.astro 必须包含 /reader 侧边栏入口');

    const readerPage = read('src/pages/reader.astro');
    assert.ok(readerPage.includes('<main') && readerPage.includes('id="main-content"') && readerPage.includes('tabindex="-1"'), 'reader.astro 必须包含无障碍 <main id="main-content" tabindex="-1">');
    for (const comp of ['MermaidRenderer', 'CompanionLayout', 'InkAsk', 'PinWorkbench', 'ArticleSearch', 'ArticleSelectionDock', 'ReadingBookmark']) {
      assert.ok(readerPage.includes(`<${comp} />`), `reader.astro 必须挂载 ${comp} 阅读生态组件`);
    }

    for (const rel of [
      'src/components/ArticleSelectionDock.astro',
      'src/components/ReadingBookmark.astro',
      'src/components/InkAsk.astro',
      'src/components/MermaidRenderer.astro',
      'src/components/PinWorkbench.astro',
      'src/components/ArticleSearch.astro',
    ]) {
      assert.ok(read(rel).includes('reader:doc-change'), `${rel} 必须监听 reader:doc-change 实现本地切换文档重挂载`);
    }

    const notesPage = read('src/pages/notes.astro');
    assert.ok(notesPage.includes('parseLocalReaderSlug') && notesPage.includes('resolveArticleJumpUrl'), 'notes.astro 必须支持本地阅读器文稿跳回定位');

    const mindmapPage = read('src/pages/mindmap.astro');
    assert.ok(mindmapPage.includes('parseLocalReaderSlug') && mindmapPage.includes('resolveLinkedPostHref'), 'mindmap.astro 必须支持由本地阅读器生成的导图跳回原文档');

    const askServer = read('server/ask.mjs');
    assert.ok(askServer.includes('function buildLocalReaderPage') && askServer.includes("input.path.startsWith('/reader/')"), 'server/ask.mjs 必须扩展支持 /reader/<docId> 的本地文档墨问伴读');
  });

  it('7. 120fps 水墨宣纸动效补齐与零重排性能守门（按需语言加载 / 3D 纸笺 / 零 scroll 重排 / 无全屏 blur）', async () => {
    const langs = detectCodeLanguages('```cpp\nint a;\n```\n```mermaid\ngraph LR\n```\n```tsx\nconst x = 1;\n```');
    assert.deepEqual(langs.sort(), ['cpp', 'typescript'], 'detectCodeLanguages 应精准识别并归一所需高亮语言且跳过 mermaid');
    assert.deepEqual(detectCodeLanguages('# 无代码块文档\n普通段落'), [], '无代码块文档不应触发语言包加载');

    const readerPage = fs.readFileSync(path.join(rootDir, 'src/pages/reader.astro'), 'utf8');
    assert.ok(readerPage.includes('initPaperCardPhysics') && readerPage.includes('data-paper-card'), '书架卡片必须接入 3D 宣纸物理微倾与纸面光泽');
    assert.ok(readerPage.includes('addCardEnter(') && readerPage.includes('addCardExit(') && readerPage.includes('data-enter-hold'), '书架首屏与筛选切换必须接入 cardMotion 3D 纸笺落案与空态收拢时间线');
    assert.ok(readerPage.includes('detectCodeLanguages(') && readerPage.includes('loadCodeHighlighter(usedLangs)'), '阅读页必须按文档实际代码块语言按需加载 highlight.js');
    assert.ok(readerPage.includes("phase: 'core'") && readerPage.includes("phase: 'companion'"), '打开文档必须分阶段错峰挂载伴读生态组件避免同帧布局风暴');
    assert.ok(readerPage.includes('post-spine-dot') && readerPage.includes('bindSmoothToc'), '阅读舞台必须具备 H2 书脊光晕节点、阻尼进度线与 WAAPI 平滑目录折叠');
    assert.ok(readerPage.includes("el.classList.add('pr')") && readerPage.includes('revealKind('), '阅读正文必须具备 PostLayout 同款单次宣纸显形与 H2 墨线铺展动效');
    assert.ok(readerPage.includes("new CustomEvent('app:modal-enter')") && readerPage.includes("new CustomEvent('app:modal-leave')"), '打开/关闭弹窗必须通知后台环境画布暂停与恢复');
    assert.ok(readerPage.includes('--pill-rx') && readerPage.includes('scaleX('), '分类滑块必须走纯 GPU translate3d + scaleX 零重排实现');
    assert.doesNotMatch(readerPage, /backdrop-filter\s*:\s*blur\(/, 'reader.astro 严禁使用全屏 backdrop-filter blur 造成高分屏合成掉帧');
  });
});
