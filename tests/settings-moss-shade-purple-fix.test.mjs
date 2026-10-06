import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('设置页绿粉主题色阶定制与按钮点击紫色异常消除验证', () => {
  const rootDir = process.cwd();

  it('1. 彻底消除点击切换主题/字体按钮时的紫色异常现象 (焦点外框、光标拖尾、点击粒子与转场滤镜)', () => {
    const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');
    const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');
    const headerAstro = fs.readFileSync(path.join(rootDir, 'src/components/Header.astro'), 'utf8');

    // A. 按钮默认与焦点外框彻底消除 (防止 Chrome/Safari 在紫色系统强调色下出现紫色边框)
    assert.ok(
      globalCss.includes('.theme-toggle,') &&
      globalCss.includes('.font-toggle,') &&
      globalCss.includes('outline: none !important;') &&
      globalCss.includes('box-shadow: none !important;'),
      'global.css 必须为 theme-toggle 与 font-toggle 声明 outline: none !important 及 box-shadow: none !important'
    );
    assert.ok(
      globalCss.includes('.theme-toggle:focus-visible,') &&
      globalCss.includes('.font-toggle:focus-visible,'),
      'global.css 必须为 theme-toggle 与 font-toggle 的 :focus-visible 提供防御'
    );
    assert.ok(
      globalCss.includes('button.theme-toggle::-moz-focus-inner'),
      'global.css 必须消除 Firefox 内部聚焦虚线框'
    );

    // B. View Transition 转场图层纯净化 (杜绝滤镜模糊与高饱和度导致的紫色色散边缘)
    assert.ok(
      !baseLayout.includes("filter: ['blur(6px) brightness(0.94) saturate(0.92)'"),
      'BaseLayout transitionTheme 绝不能在转场中叠加 blur 与 saturate 滤镜导致粉绿色散成紫'
    );
    assert.ok(
      !baseLayout.includes("filter: ['blur(5px)', 'blur(0)']"),
      'BaseLayout transitionFont 绝不能在转场中叠加 blur 滤镜导致色散'
    );
    assert.ok(
      baseLayout.includes('sourceEl.blur()'),
      'BaseLayout 在进入 View Transition 前必须主动调用 sourceEl.blur() 移除焦点外框'
    );

    // C. 点击事件隔离：杜绝点击控制按钮时迸发粉紫色 inkSplash 粒子
    assert.ok(
      baseLayout.includes('const isHeaderControl = event.target.closest(') &&
      baseLayout.includes('[data-theme-toggle]') &&
      baseLayout.includes('[data-font-toggle]') &&
      baseLayout.includes('if (isPreviewOpen || isSearchInteraction || isImageInteraction || isHeaderControl) return;'),
      'BaseLayout 点击粒子 sparkle 必须严格排除主题、字体与色阶切换按钮'
    );

    // D. 点击事件隔离：杜绝控制按钮应用 pop-active 产生缩放模糊
    assert.ok(
      baseLayout.includes('[data-theme-toggle], [data-font-toggle], .theme-toggle, .font-toggle'),
      'BaseLayout pop-active 动效必须排除主题与字体切换按钮'
    );

    // E. 光标拖尾生命周期与坐标防残留：Header 必须导出全局 __clearCursorTrail 并拦截控制按钮悬停/按压
    assert.ok(
      headerAstro.includes('window.__clearCursorTrail = clearCursorTrail'),
      'Header.astro 必须导出全局 window.__clearCursorTrail'
    );
    assert.ok(
      headerAstro.includes("t.closest('[data-theme-toggle],[data-font-toggle]"),
      'Header.astro 在指针移入或按下控制按钮时必须主动隐藏拖尾笔刷 brush.isVisible = false'
    );
    assert.ok(
      baseLayout.includes('window.__clearCursorTrail()'),
      'BaseLayout transitionTheme 与 transitionFont 在捕获页面快照前必须调用 window.__clearCursorTrail()'
    );
  });

  it('2. 设置页 (settings.astro) 增加绿粉主题色阶 (Moss Shade) 全景实测卡片组，严格匹配图 3 规范', () => {
    const settingsPath = path.join(rootDir, 'src/pages/settings.astro');
    assert.ok(fs.existsSync(settingsPath), 'settings.astro 必须存在');
    const settingsAstro = fs.readFileSync(settingsPath, 'utf8');

    // A. 5 款候选色阶定义完整，包含色号、名称、对比度、评语及图片路径
    const expectedShades = [
      { id: '004D40', hex: '#004D40', name: 'Teal 900 (松石极墨)', contrast: '8.96:1 (AAA)' },
      { id: '00695C', hex: '#00695C', name: 'Teal 800 (竹青墨韵)', contrast: '6.03:1 (AA)' },
      { id: '00796B', hex: '#00796B', name: 'Teal 700 (翡翠青玉 · 推荐)', contrast: '4.85:1 (AA)', isRecommended: true },
      { id: '00897B', hex: '#00897B', name: 'Teal 600 (碧波苍青)', contrast: '3.93:1' },
      { id: '4DB6AC', hex: '#4DB6AC', name: 'Teal 300 (清凉薄荷)', contrast: '2.23:1 (适配深墨)' },
    ];

    for (const shade of expectedShades) {
      assert.ok(settingsAstro.includes(shade.id), `settings.astro 必须定义色阶 ID: ${shade.id}`);
      assert.ok(settingsAstro.includes(shade.hex), `settings.astro 必须展示十六进制色号: ${shade.hex}`);
      assert.ok(settingsAstro.includes(shade.contrast), `settings.astro 必须标注对比度: ${shade.contrast}`);
    }

    // B. 默认优先选用 #00796B 翡翠青玉作为最佳推荐
    assert.ok(settingsAstro.includes('★ 最佳推荐'), '推荐项必须具备 ★ 最佳推荐 标识');
    assert.ok(settingsAstro.includes('isRecommended: true'), '00796B 必须标记为 isRecommended: true');

    // C. 页面卡片挂载了正确的图片资源 (支持 WebP 与 PNG fallback)
    assert.ok(settingsAstro.includes('/assets/previews/shade_1_004D40.webp'), '必须引用 004D40 截图 WebP');
    assert.ok(settingsAstro.includes('/assets/previews/shade_3_00796B.webp'), '必须引用 00796B 推荐截图 WebP');
    assert.ok(settingsAstro.includes('/assets/previews/shade_5_4DB6AC.webp'), '必须引用 4DB6AC 截图 WebP');

    // D. 包含 5 款卡片网格容器与重置恢复按钮
    assert.ok(settingsAstro.includes('id="mossShadesSection"'), '必须包含独立的外观色阶区块 #mossShadesSection');
    assert.ok(settingsAstro.includes('id="mossShadesGrid"'), '必须包含卡片网格 #mossShadesGrid');
    assert.ok(settingsAstro.includes('id="resetShadeBtn"'), '必须包含恢复推荐色按钮 #resetShadeBtn');
    assert.ok(settingsAstro.includes('data-moss-shade-card'), '卡片必须声明 data-moss-shade-card 交互属性');
  });

  it('3. 静态预览截图资源在 public/assets/previews/ 与 public/previews/ 均完整就绪', () => {
    const shades = ['004D40', '00695C', '00796B', '00897B', '4DB6AC'];
    for (let i = 0; i < shades.length; i++) {
      const id = shades[i];
      const webpPath = path.join(rootDir, `public/assets/previews/shade_${i + 1}_${id}.webp`);
      const pngPath = path.join(rootDir, `public/assets/previews/shade_${i + 1}_${id}.png`);
      const rootPngPath = path.join(rootDir, `public/previews/shade_${i + 1}_${id}.png`);

      assert.ok(fs.existsSync(webpPath), `WebP 缩略图必须存在: ${webpPath}`);
      assert.ok(fs.existsSync(pngPath), `PNG 原图必须存在: ${pngPath}`);
      assert.ok(fs.existsSync(rootPngPath), `public/previews 原图必须存在: ${rootPngPath}`);

      const webpStat = fs.statSync(webpPath);
      const pngStat = fs.statSync(pngPath);
      assert.ok(webpStat.size > 5000, `WebP 缩略图体积应有效 (${webpStat.size} bytes)`);
      assert.ok(pngStat.size > 50000, `PNG 截图体积应有效 (${pngStat.size} bytes)`);
    }
  });

  it('4. 设置页色阶热切换脚本逻辑与生命周期模拟运行 (热切换、状态高亮、持久化与重置)', () => {
    const settingsAstro = fs.readFileSync(path.join(rootDir, 'src/pages/settings.astro'), 'utf8');
    assert.ok(settingsAstro.includes('initMossShadeSelector'), 'settings 脚本必须包含 initMossShadeSelector');

    // 提取 initMossShadeSelector 函数体并模拟执行
    const match = settingsAstro.match(/function initMossShadeSelector\(\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*initMossShadeSelector\(\);/);
    assert.ok(match, '必须成功匹配 initMossShadeSelector 实现');

    const fnBody = match[1];

    const storageMock = {};
    const localStorageMock = {
      getItem: (k) => storageMock[k] || null,
      setItem: (k, v) => { storageMock[k] = String(v); },
      removeItem: (k) => { delete storageMock[k]; }
    };

    let toastCalledWith = null;
    const showToastMock = (msg) => { toastCalledWith = msg; };

    let appliedShade = null;
    const windowMock = {
      __setMossShade: (shade) => { appliedShade = shade; },
      addEventListener: () => {},
    };

    const mockCards = ['004D40', '00695C', '00796B', '00897B', '4DB6AC'].map(id => {
      const classes = new Set(['shade-option-card']);
      const attrs = {
        'data-moss-shade-card': id,
        'data-shade-name': `Teal ${id}`,
      };
      const listeners = {};
      const badgeClasses = new Set(['hidden']);
      return {
        getAttribute: (k) => attrs[k] || null,
        setAttribute: (k, v) => { attrs[k] = v; },
        classList: {
          add: (...cls) => cls.forEach(c => classes.add(c)),
          remove: (...cls) => cls.forEach(c => classes.delete(c)),
          contains: (c) => classes.has(c),
        },
        querySelector: (sub) => {
          if (sub === '.shade-active-badge') {
            return {
              classList: {
                add: (...cls) => cls.forEach(c => badgeClasses.add(c)),
                remove: (...cls) => cls.forEach(c => badgeClasses.delete(c)),
                contains: (c) => badgeClasses.has(c),
              }
            };
          }
          return null;
        },
        addEventListener: (evt, handler) => {
          listeners[evt] = listeners[evt] || [];
          listeners[evt].push(handler);
        },
        _triggerClick: () => {
          if (listeners['click']) listeners['click'].forEach(h => h());
        },
        _classes: classes,
        _badgeClasses: badgeClasses
      };
    });

    const resetBtnListeners = {};
    const mockResetBtn = {
      addEventListener: (evt, handler) => {
        resetBtnListeners[evt] = resetBtnListeners[evt] || [];
        resetBtnListeners[evt].push(handler);
      },
      _triggerClick: () => {
        if (resetBtnListeners['click']) resetBtnListeners['click'].forEach(h => h());
      }
    };

    const docAttrs = {};
    const documentMock = {
      documentElement: {
        setAttribute: (k, v) => { docAttrs[k] = v; },
        getAttribute: (k) => docAttrs[k] || null,
      },
      querySelectorAll: (sel) => {
        if (sel === '[data-moss-shade-card]') {
          return mockCards;
        }
        return [];
      },
      getElementById: (id) => {
        if (id === 'resetShadeBtn') {
          return mockResetBtn;
        }
        return null;
      }
    };

    // A. 模拟空状态（初次加载）：默认命中推荐色 00796B
    const runSelector = new Function(
      'document',
      'localStorage',
      'window',
      'showToast',
      fnBody
    );

    assert.doesNotThrow(() => {
      runSelector(documentMock, localStorageMock, windowMock, showToastMock);
    }, 'initMossShadeSelector 执行不应抛出异常');

    // B. 模拟点击 004D40 卡片
    const cards = documentMock.querySelectorAll('[data-moss-shade-card]');
    const card004D40 = cards.find(c => c.getAttribute('data-moss-shade-card') === '004D40');
    assert.ok(card004D40, '必须能找到 004D40 卡片');

    card004D40._triggerClick();
    assert.equal(appliedShade, '004D40', '点击卡片必须通过 window.__setMossShade 切换至 004D40');
    assert.ok(card004D40._classes.has('is-active'), '选中的卡片必须具备 is-active 状态');
    assert.ok(!card004D40._badgeClasses.has('hidden'), '选中的卡片生效徽标必须可见');
    assert.ok(toastCalledWith && toastCalledWith.includes('004D40'), '必须触发友好 Toast 提示');

    // C. 模拟点击重置按钮
    const resetBtn = documentMock.getElementById('resetShadeBtn');
    resetBtn._triggerClick();
    assert.equal(appliedShade, '00796B', '点击重置按钮必须切换回推荐色 00796B');
    const card00796B = cards.find(c => c.getAttribute('data-moss-shade-card') === '00796B');
    assert.ok(card00796B._classes.has('is-active'), '00796B 推荐卡片必须被重新高亮激活');
    assert.ok(!card004D40._classes.has('is-active'), '原卡片必须被取消激活');
  });
});
