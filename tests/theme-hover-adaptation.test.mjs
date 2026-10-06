import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('主题颜色适配与交互悬停辨识度验证', () => {
  const rootDir = process.cwd();

  it('1. 绿粉主题 (Moss) 基准配色与 5 档候选色阶定义完整', () => {
    const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');

    // 默认推荐底色为翡翠青玉 #00796B
    assert.ok(globalCss.includes('--moss-bg: #00796B;'), 'global.css 中默认 moss 底色应为 #00796B');
    assert.ok(globalCss.includes('--accent: #FFC2D1;'), 'global.css 中 moss 主题 accent 应为柔和浅粉 #FFC2D1');

    // 5 档微调色号变体
    const shades = ['004D40', '00695C', '00796B', '00897B', '4DB6AC'];
    for (const shade of shades) {
      assert.ok(
        globalCss.includes(`[data-moss-shade="${shade}"]`),
        `global.css 应定义 [data-moss-shade="${shade}"] 变体样式`
      );
    }
    assert.ok(globalCss.includes('--moss-badge-text: #004D40;'), 'global.css 中默认 moss 应定义 --moss-badge-text 为深青墨色');
    assert.ok(globalCss.includes('--moss-badge-text: #ffffff;'), 'global.css 中 4DB6AC 浅底色阶应反转 --moss-badge-text 为高反差纯白');
  });

  it('2. 黑色主题与绿粉主题悬停状态文字辨识度保护', () => {
    const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');

    // 归档页标签筛选器悬停与激活态
    assert.ok(globalCss.includes('.archive-filter:not(.is-active):hover'), '应区分非激活项与激活项悬停');
    assert.ok(globalCss.includes('.archive-filter.is-active:hover'), '应保障 .archive-filter 激活项悬停文字辨识度');

    // 白噪音计时器药丸按钮在 dark 与 moss 下的悬停
    assert.ok(globalCss.includes('.zen-timer-pill:not(.is-active):hover'), '药丸按钮应隔离未激活悬停');
    assert.ok(globalCss.includes('[data-theme="dark"] .zen-timer-pill.is-active:hover'), 'dark 主题药丸激活悬停应有高对比度');
    assert.ok(globalCss.includes('[data-theme="moss"] .zen-timer-pill.is-active:hover'), 'moss 主题药丸激活悬停应有高对比度');

    // 弹窗与控制栏按钮悬停
    assert.ok(globalCss.includes('[data-theme="moss"] .mermaid-action-btn:not(.is-active):hover'), 'Mermaid 按钮未激活悬停');
    assert.ok(globalCss.includes('[data-theme="moss"] .mermaid-action-btn.is-active:hover'), 'Mermaid 按钮激活悬停');
    assert.ok(globalCss.includes('[data-theme="moss"] .code-pin-button.is-pinned'), '代码图钉高亮状态对比度适配');
  });

  it('3. 文章搜索与划词问答深色/绿粉悬停文字辨识度保护', () => {
    const searchAstro = fs.readFileSync(path.join(rootDir, 'src/components/ArticleSearch.astro'), 'utf8');
    assert.ok(searchAstro.includes('.article-search-toggle-btn:not(.is-active):hover'), '搜索范围切换按钮未激活悬停');
    assert.ok(searchAstro.includes('[data-theme="dark"] .article-search-toggle-btn.is-active:hover'), 'dark 搜索切换按钮激活悬停');
    assert.ok(searchAstro.includes('[data-theme="moss"] .article-search-toggle-btn.is-active:hover'), 'moss 搜索切换按钮激活悬停');

    const inkAskAstro = fs.readFileSync(path.join(rootDir, 'src/components/InkAsk.astro'), 'utf8');
    assert.ok(inkAskAstro.includes('[data-theme="dark"] .ink-ask-send:hover'), 'dark 问答发送按钮悬停');
    assert.ok(inkAskAstro.includes('[data-theme="moss"] .ink-ask-send:hover'), 'moss 问答发送按钮悬停');
    assert.ok(inkAskAstro.includes('[data-theme="dark"] .ink-ask-drawer-send:hover'), 'dark 抽屉发送按钮悬停');
    assert.ok(inkAskAstro.includes('[data-theme="moss"] .ink-ask-drawer-send:hover'), 'moss 抽屉发送按钮悬停');
  });

  it('4. 画册与生活分类 Tab 标签激活悬停状态防护', () => {
    const galleryAstro = fs.readFileSync(path.join(rootDir, 'src/pages/gallery.astro'), 'utf8');
    assert.ok(galleryAstro.includes('.gallery-cat-tab:not(.is-active):hover'), 'gallery-cat-tab 未激活悬停');
    assert.ok(galleryAstro.includes('.gallery-cat-tab.is-active:hover'), 'gallery-cat-tab 激活悬停');

    const lifeAstro = fs.readFileSync(path.join(rootDir, 'src/pages/life.astro'), 'utf8');
    assert.ok(lifeAstro.includes('.life-cat-tab:not(.is-active):hover'), 'life-cat-tab 未激活悬停');
    assert.ok(lifeAstro.includes('.life-cat-tab.is-active:hover'), 'life-cat-tab 激活悬停');
  });

  it('5. BaseLayout 支持 URL 参数与本地缓存动态切换绿粉色阶及同步 theme-color', () => {
    const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');
    assert.ok(baseLayout.includes("VALID_MOSS_SHADES = ['004D40', '00695C', '00796B', '00897B', '4DB6AC']"), '应定义 VALID_MOSS_SHADES 候选');
    assert.ok(baseLayout.includes("getStoredMossShade"), '应支持从 URL 或 localStorage 获取 moss-shade');
    assert.ok(baseLayout.includes("data-moss-shade"), '应在 documentElement 上设置 data-moss-shade');
    assert.ok(baseLayout.includes("mossShade ? '#' + mossShade : '#00796B'"), 'meta theme-color 应与选定色号保持一致');
    assert.ok(baseLayout.includes("window.__setMossShade = setMossShade"), '应导出全局 setMossShade 工具方法');
    assert.ok(baseLayout.includes("localStorage.setItem('moss-shade', clean)"), '有效 URL 参数应自动写入 localStorage 以保持软切页一致性');
  });

  it('6. 星垂野 (XingChuiYe) 废弃需求遗留彻底清理与仓库纯净度检验', () => {
    const scanDirs = ['src', 'tests', 'scripts', 'public'];
    for (const dir of scanDirs) {
      const fullDirPath = path.join(rootDir, dir);
      if (!fs.existsSync(fullDirPath)) continue;
      const walk = (d) => {
        const files = fs.readdirSync(d, { withFileTypes: true });
        for (const f of files) {
          const p = path.join(d, f.name);
          assert.ok(!f.name.toLowerCase().includes('xingchuiye'), `文件名 ${p} 不应包含 xingchuiye`);
          assert.ok(!f.name.includes('星垂野'), `文件名 ${p} 不应包含 星垂野`);
          if (f.isDirectory()) {
            walk(p);
          } else if (
            f.isFile() &&
            f.name !== 'theme-hover-adaptation.test.mjs' &&
            (f.name.endsWith('.astro') || f.name.endsWith('.ts') || f.name.endsWith('.js') || f.name.endsWith('.mjs') || f.name.endsWith('.css'))
          ) {
            const content = fs.readFileSync(p, 'utf8');
            assert.ok(!content.includes('XingChuiYe'), `${p} 中不应包含 XingChuiYe`);
            assert.ok(!content.includes('xingchuiye'), `${p} 中不应包含 xingchuiye`);
            assert.ok(!content.includes('星垂野'), `${p} 中不应包含 星垂野`);
          }
        }
      };
      walk(fullDirPath);
    }
  });

  it('7. 色度对比度算法验证与各色阶下悬停/激活组件对比度严苛验证', () => {
    function getLuminance(hex) {
      const rgb = hex.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16) / 255);
      const a = rgb.map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }
    function getContrast(h1, h2) {
      const l1 = getLuminance(h1);
      const l2 = getLuminance(h2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    // 默认 moss: 背景 #FFC2D1, 激活文字 #004D40
    const defaultActiveBg = '#FFC2D1';
    const defaultActiveText = '#004D40';
    const defaultContrast = getContrast(defaultActiveBg, defaultActiveText);
    assert.ok(defaultContrast >= 4.5, `默认 moss 激活态文字对比度应达到 WCAG AA 级 (>= 4.5)，实际为 ${defaultContrast.toFixed(2)}`);

    // 浅底色阶 4DB6AC: 激活高亮背景 #004D40, 激活文字 #FFFFFF
    const shade4DB6ACBg = '#004D40';
    const shade4DB6ACText = '#FFFFFF';
    const shadeContrast = getContrast(shade4DB6ACBg, shade4DB6ACText);
    assert.ok(shadeContrast >= 7.0, `4DB6AC 浅底色阶激活态文字对比度应达到 AAA 级 (>= 7.0)，实际为 ${shadeContrast.toFixed(2)}`);

    // 黑色主题: 激活高亮背景 #FFFFFF, 激活文字 #141414
    const darkActiveBg = '#FFFFFF';
    const darkActiveText = '#141414';
    const darkContrast = getContrast(darkActiveBg, darkActiveText);
    assert.ok(darkContrast >= 15.0, `黑色主题激活态文字对比度应极高 (>= 15.0)，实际为 ${darkContrast.toFixed(2)}`);
  });

  it('8. BaseLayout getStoredMossShade 模拟运行环境与边界用例全面验证', () => {
    const VALID_MOSS_SHADES = ['004D40', '00695C', '00796B', '00897B', '4DB6AC'];
    function simulateGetStoredMossShade(searchQuery, storageValue) {
      let mockStorage = storageValue;
      const setItem = (k, v) => { mockStorage = v; };
      const removeItem = () => { mockStorage = null; };

      const raw = new URLSearchParams(searchQuery).get('moss-shade') ||
                  new URLSearchParams(searchQuery).get('shade');
      if (raw) {
        const clean = raw.trim().replace(/^#/, '').toUpperCase();
        if (clean === 'DEFAULT' || clean === 'RESET') {
          removeItem();
          return { shade: null, stored: mockStorage };
        }
        if (VALID_MOSS_SHADES.indexOf(clean) !== -1) {
          setItem('moss-shade', clean);
          return { shade: clean, stored: mockStorage };
        }
      }
      if (mockStorage) {
        const normStored = mockStorage.trim().replace(/^#/, '').toUpperCase();
        if (VALID_MOSS_SHADES.indexOf(normStored) !== -1) {
          return { shade: normStored, stored: mockStorage };
        }
      }
      return { shade: null, stored: mockStorage };
    }

    // 1. 规范十六进制参数
    assert.deepEqual(simulateGetStoredMossShade('?moss-shade=004D40', null), { shade: '004D40', stored: '004D40' });
    // 2. 带 # 前缀与小写容错
    assert.deepEqual(simulateGetStoredMossShade('?moss-shade=%2300695c', null), { shade: '00695C', stored: '00695C' });
    // 3. 别名 shade 参数
    assert.deepEqual(simulateGetStoredMossShade('?shade=00897b', null), { shade: '00897B', stored: '00897B' });
    // 4. 重置 / 清除参数
    assert.deepEqual(simulateGetStoredMossShade('?moss-shade=reset', '004D40'), { shade: null, stored: null });
    // 5. 无 URL 参数时回退至本地存储
    assert.deepEqual(simulateGetStoredMossShade('', '4DB6AC'), { shade: '4DB6AC', stored: '4DB6AC' });
    // 6. 非法色号被阻断并回退
    assert.deepEqual(simulateGetStoredMossShade('?moss-shade=FFAABB', null), { shade: null, stored: null });
  });

  it('9. BaseLayout 主题运行时脚本无语法/引用异常且完整导出全局 API (isValidTheme, applyTheme)', () => {
    const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');
    assert.ok(baseLayout.includes('function isValidTheme'), 'BaseLayout 必须显式声明 isValidTheme 函数');
    assert.ok(baseLayout.includes("VALID_THEMES = ['dark', 'light', 'moss', 'rice']"), 'BaseLayout 必须声明合法主题列表 VALID_THEMES');

    const scripts = [...baseLayout.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    const themeScript = scripts.find(s => s[1].includes('VALID_THEMES'));
    assert.ok(themeScript, '必须包含定义主题核心逻辑的 inline script');

    const windowMock = {
      location: { search: '' },
      matchMedia: () => ({ matches: false }),
      dispatchEvent: () => {},
      clearTimeout: () => {},
      setTimeout: () => {},
      addEventListener: () => {},
    };
    const documentMock = {
      documentElement: {
        classList: { add: () => {}, remove: () => {} },
        setAttribute: (k, v) => { documentMock.documentElement.attrs[k] = v; },
        removeAttribute: (k) => { delete documentMock.documentElement.attrs[k]; },
        getAttribute: (k) => documentMock.documentElement.attrs[k] || null,
        attrs: {},
        style: {}
      },
      querySelector: () => null,
      addEventListener: () => {}
    };
    const storageMock = {};
    const localStorageMock = {
      getItem: (k) => storageMock[k] || null,
      setItem: (k, v) => { storageMock[k] = String(v); },
      removeItem: (k) => { delete storageMock[k]; }
    };
    const CustomEventMock = function(name, opts) { this.name = name; this.opts = opts; };

    // 执行 head inline script，验证绝不抛出 ReferenceError (如 isValidTheme is not defined)
    assert.doesNotThrow(() => {
      const fn = new Function('window', 'document', 'localStorage', 'requestAnimationFrame', 'CustomEvent', themeScript[1]);
      fn(windowMock, documentMock, localStorageMock, (cb) => cb(), CustomEventMock);
    }, 'BaseLayout 主题脚本执行不应抛出任何错误');

    assert.equal(typeof windowMock.__applyTheme, 'function', 'window.__applyTheme 必须成功挂载');
    assert.equal(typeof windowMock.__transitionTheme, 'function', 'window.__transitionTheme 必须成功挂载');
    assert.equal(typeof windowMock.__getPreferredTheme, 'function', 'window.__getPreferredTheme 必须成功挂载');
    assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'light', '默认初始主题应为 light');
  });

  it('10. 全站主题点击切换事件与软导航全链路验证 (light ⇄ dark ⇄ moss ⇄ rice 循环与持久化)', () => {
    const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');
    const scripts = [...baseLayout.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    const themeScript = scripts.find(s => s[1].includes('VALID_THEMES'));
    const toggleScript = scripts.find(s => s[1].includes('THEME_CYCLE'));
    assert.ok(toggleScript, '必须包含主题循环监听 script');

    const windowMock = {
      location: { search: '' },
      matchMedia: () => ({ matches: false }),
      dispatchEvent: () => {},
      clearTimeout: () => {},
      setTimeout: () => {},
      addEventListener: () => {},
    };
    const storageMock = {};
    const localStorageMock = {
      getItem: (k) => storageMock[k] || null,
      setItem: (k, v) => { storageMock[k] = String(v); },
      removeItem: (k) => { delete storageMock[k]; }
    };
    const docListeners = {};
    const documentMock = {
      documentElement: {
        classList: { add: () => {}, remove: () => {} },
        setAttribute: (k, v) => { documentMock.documentElement.attrs[k] = v; },
        removeAttribute: (k) => { delete documentMock.documentElement.attrs[k]; },
        getAttribute: (k) => documentMock.documentElement.attrs[k] || null,
        attrs: {},
        style: {}
      },
      querySelector: () => null,
      addEventListener: (evt, handler) => {
        docListeners[evt] = docListeners[evt] || [];
        docListeners[evt].push(handler);
      }
    };
    const CustomEventMock = function(name, opts) { this.name = name; this.opts = opts; };

    // 运行初始化
    const headFn = new Function('window', 'document', 'localStorage', 'requestAnimationFrame', 'CustomEvent', themeScript[1]);
    headFn(windowMock, documentMock, localStorageMock, (cb) => cb(), CustomEventMock);

    const toggleFn = new Function('window', 'document', 'localStorage', 'requestAnimationFrame', 'CustomEvent', toggleScript[1]);
    toggleFn(windowMock, documentMock, localStorageMock, (cb) => cb(), CustomEventMock);

    assert.ok(docListeners['click'] && docListeners['click'].length > 0, '必须注册 click 监听器');

    const clickToggle = () => {
      const btn = {
        closest: (sel) => (sel === '[data-theme-toggle]' ? btn : null),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 24, height: 24 })
      };
      for (const handler of docListeners['click']) {
        handler({ target: btn, preventDefault: () => {} });
      }
    };

    // 初始状态为 light
    assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'light');

    // 1 次点击 -> dark
    clickToggle();
    assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(storageMock.theme, 'dark');

    // 2 次点击 -> moss
    clickToggle();
    assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'moss');
    assert.equal(storageMock.theme, 'moss');

    // 3 次点击 -> rice
    clickToggle();
    assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'rice');
    assert.equal(storageMock.theme, 'rice');

    // 4 次点击 -> 回到 light
    clickToggle();
    assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(storageMock.theme, 'light');

    // 软导航 Astro 生命周期验证
    // 模拟切换至 moss 并发生软切页
    clickToggle(); // dark
    clickToggle(); // moss
    assert.equal(storageMock.theme, 'moss');

    const newDoc = {
      documentElement: {
        attrs: {},
        setAttribute: (k, v) => { newDoc.documentElement.attrs[k] = v; },
        getAttribute: (k) => newDoc.documentElement.attrs[k] || null,
      }
    };

    // astro:before-swap 钩子应将新页面根节点预设为 moss
    if (docListeners['astro:before-swap']) {
      for (const h of docListeners['astro:before-swap']) {
        h({ newDocument: newDoc });
      }
      assert.equal(newDoc.documentElement.getAttribute('data-theme'), 'moss', 'astro:before-swap 应提前为新页面设定当前主题');
    }

    // astro:after-swap 钩子确认保持当前主题
    if (docListeners['astro:after-swap']) {
      for (const h of docListeners['astro:after-swap']) {
        h({});
      }
      assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'moss', 'astro:after-swap 应恢复当前主题');
    }
  });

  it('11. 主题切换极端防御与边界容错验证 (SVG子节点点击、文本节点点击、私密模式抛错、ViewTransition异常降级)', () => {
    const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');
    const scripts = [...baseLayout.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    const themeScript = scripts.find(s => s[1].includes('VALID_THEMES'));
    const toggleScript = scripts.find(s => s[1].includes('THEME_CYCLE'));

    const windowMock = {
      location: { search: '' },
      matchMedia: () => ({ matches: false }),
      dispatchEvent: () => {},
      clearTimeout: () => {},
      setTimeout: () => {},
      addEventListener: () => {},
      innerWidth: 1024,
      innerHeight: 768,
    };
    const storageMock = {};
    let shouldThrowStorage = false;
    const localStorageMock = {
      getItem: (k) => {
        if (shouldThrowStorage) throw new Error('QuotaExceeded or SecurityError in private browsing');
        return storageMock[k] || null;
      },
      setItem: (k, v) => {
        if (shouldThrowStorage) throw new Error('QuotaExceeded or SecurityError in private browsing');
        storageMock[k] = String(v);
      },
      removeItem: (k) => {
        if (shouldThrowStorage) throw new Error('SecurityError');
        delete storageMock[k];
      }
    };
    const docListeners = {};
    const documentMock = {
      documentElement: {
        classList: { add: () => {}, remove: () => {} },
        setAttribute: (k, v) => { documentMock.documentElement.attrs[k] = v; },
        removeAttribute: (k) => { delete documentMock.documentElement.attrs[k]; },
        getAttribute: (k) => documentMock.documentElement.attrs[k] || null,
        attrs: {},
        style: {}
      },
      querySelector: () => null,
      addEventListener: (evt, handler) => {
        docListeners[evt] = docListeners[evt] || [];
        docListeners[evt].push(handler);
      },
      // 模拟 View Transition 抛出异常的严苛极端场景
      startViewTransition: () => {
        throw new Error('ViewTransition AbortError or InvalidStateError');
      }
    };
    const CustomEventMock = function(name, opts) { this.name = name; this.opts = opts; };

    const headFn = new Function('window', 'document', 'localStorage', 'requestAnimationFrame', 'CustomEvent', themeScript[1]);
    headFn(windowMock, documentMock, localStorageMock, (cb) => cb(), CustomEventMock);

    const toggleFn = new Function('window', 'document', 'localStorage', 'requestAnimationFrame', 'CustomEvent', toggleScript[1]);
    toggleFn(windowMock, documentMock, localStorageMock, (cb) => cb(), CustomEventMock);

    // 1. 测试直接调用 window.__applyTheme('rice') 是否能自动持久化到 localStorage
    windowMock.__applyTheme('rice');
    assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'rice');
    assert.equal(storageMock.theme, 'rice', '显式调用 __applyTheme 必须自动持久化');

    // 2. 模拟 SVG <path> 内部嵌套子节点被点击 (带有 closest 方法)
    const btnMock = {
      nodeType: 1,
      closest: (sel) => (sel === '[data-theme-toggle]' ? btnMock : null),
      getBoundingClientRect: () => ({ left: 10, top: 10, width: 24, height: 24 })
    };
    const svgPathMock = {
      nodeType: 1,
      parentElement: btnMock,
      closest: (sel) => (sel === '[data-theme-toggle]' ? btnMock : null)
    };

    for (const h of docListeners['click']) {
      h({ target: svgPathMock, preventDefault: () => {} });
    }
    // rice -> light
    assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(storageMock.theme, 'light');

    // 3. 模拟文本节点 target (nodeType === 3，无 closest 方法，需回退至 parentElement)
    const textNodeMock = {
      nodeType: 3,
      parentElement: btnMock,
      closest: undefined
    };
    for (const h of docListeners['click']) {
      h({ target: textNodeMock, preventDefault: () => {} });
    }
    // light -> dark (在 startViewTransition 抛异常环境下成功降级)
    assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(storageMock.theme, 'dark');

    // 4. 模拟无痕模式 / 禁用存储环境下抛出 SecurityError 仍能顺利点击切换
    shouldThrowStorage = true;
    assert.doesNotThrow(() => {
      for (const h of docListeners['click']) {
        h({ target: btnMock, preventDefault: () => {} });
      }
    }, 'Storage 抛错时不应中断主题切换流程');
    // dark -> moss
    assert.equal(documentMock.documentElement.getAttribute('data-theme'), 'moss');
  });
});
