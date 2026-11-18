import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { mountSiteContextMenu } from '../src/utils/siteContextMenu.ts';
import { mountAppAutoUpdate } from '../src/utils/appAutoUpdate.ts';
import { ZenAudioEngine } from '../src/utils/zenAudioEngine.ts';

const rootDir = process.cwd();
const readSrc = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

describe('Motion Shell & Intro Artisan Upgrade Suite (60–120fps 零掉帧纯粹单色水墨与圆润胶囊)', () => {
  const baseLayout = readSrc('src/layouts/BaseLayout.astro');
  const header = readSrc('src/components/Header.astro');
  const footer = readSrc('src/components/Footer.astro');
  const siteIntro = readSrc('src/components/SiteIntro.astro');
  const postTransition = readSrc('src/components/PostTransition.astro');
  const zenRainscape = readSrc('src/components/ZenRainscape.astro');
  const zenSoundscape = readSrc('src/components/ZenSoundscape.astro');
  const siteContextMenu = readSrc('src/utils/siteContextMenu.ts');
  const appAutoUpdate = readSrc('src/utils/appAutoUpdate.ts');

  it('1. BaseLayout: [data-enter] 纯单色水墨曲线编排、零 filter:blur、预读防抖与 will-change 及时释放', () => {
    // 宣纸舒卷、水墨毛细渗透与水墨凝定三条专属 CustomEase（无印章/朱砂语义）
    assert.match(baseLayout, /CustomEase\.create\('paper-glide'/, '必须注册宣纸舒卷曲线 paper-glide');
    assert.match(baseLayout, /CustomEase\.create\('ink-seep'/, '必须注册水墨渗透曲线 ink-seep');
    assert.match(baseLayout, /CustomEase\.create\('ink-settle'/, '必须注册水墨凝定曲线 ink-settle');
    assert.doesNotMatch(baseLayout, /cinnabar-seal|stamp-seal-halo/, 'BaseLayout 严禁残留印章曲线或朱砂光环类名');

    // 单色水墨涟漪光环 + ink 首屏读写分离防回流
    assert.match(baseLayout, /function spawnInkRippleHalo/, '必须激发纯单色水墨涟漪光环');
    assert.match(baseLayout, /\.ink-ripple-halo\s*\{[\s\S]*?border-radius:\s*9999px;/, '水墨涟漪光环必须为圆润环形');
    assert.match(baseLayout, /const preMetaMap = new Map\(\);/, 'initPageEnter 必须在批量写入样式前统一预读几何坐标');

    // bloom 与 sparkle 彻底根除 filter:blur 逐帧动画与 boxShadow 重绘
    const bloomBlock = baseLayout.slice(
      baseLayout.indexOf("if (kind === 'bloom')"),
      baseLayout.indexOf("if (kind === 'ink')")
    );
    assert.doesNotMatch(bloomBlock, /filter:\s*['"]blur/, 'bloom 严禁使用 filter: blur 逐帧过渡');
    assert.match(bloomBlock, /clipPath:\s*'inset/, 'bloom 应采用纯合成器 clip-path 宣纸绽放');

    const sparkleBlock = baseLayout.slice(
      baseLayout.indexOf('function sparkle(x, y, count)'),
      baseLayout.indexOf('window.__inkSplash = sparkle;')
    );
    assert.doesNotMatch(sparkleBlock, /blur\(/, 'sparkle 飞墨粒子严禁触发逐帧 filter: blur');
    assert.doesNotMatch(sparkleBlock, /boxShadow/, 'sparkle 飞墨粒子严禁附加昂贵 boxShadow');

    // finishEnter 及时卸载 willChange
    assert.match(
      baseLayout,
      /clearProps:\s*'transform,opacity,clipPath,filter,transformOrigin,willChange'/,
      'finishEnter 结束时必须及时清理 willChange 释放显存图层'
    );
  });

  it('2. BaseLayout Lightbox & Theme Ritual: 520ms/360ms 宣纸绫裱 FLIP、双层交叉切图与水墨主题切换', () => {
    assert.match(baseLayout, /const VIEWER_OPEN_MS = 520;/, 'Lightbox 画框展开时长应精确调校为 520ms');
    assert.match(baseLayout, /const VIEWER_CLOSE_MS = 360;/, 'Lightbox 画框收拢时长应精确调校为 360ms');
    assert.match(baseLayout, /image-viewer-silk-corners/, 'Lightbox 应包含宣纸绫裱四角纹饰');
    assert.match(baseLayout, /image-viewer-media-ghost/, '连续切图应采用双层交叉淡入消除闪烁与重缩放');
    assert.match(
      baseLayout,
      /\.image-viewer-overlay,\s*\.image-viewer-overlay\.is-open\s*\{[\s\S]*?backdrop-filter:\s*none\s*!important;/,
      'Lightbox 遮罩必须禁用逐帧 backdrop-filter: blur 过渡以根除大屏掉帧'
    );
    assert.doesNotMatch(
      baseLayout,
      /modals\s*=\s*document\.querySelectorAll\('\.search-overlay,\s*\.preview-overlay,\s*\.image-viewer-overlay'\)/,
      '严禁 MutationObserver 在打开 Lightbox 时把子元素隐藏 160ms+900ms 抢夺 FLIP 控制权'
    );

    // 主题切换水墨晕环与 VT 期间静默 CSS 过滤重绘
    assert.match(baseLayout, /function spawnThemeInkRipple/, '主题与字体切换必须激发柔和的水墨晕环仪式感');
    assert.match(
      baseLayout,
      /html\[data-vt-active="true"\]\.theme-switching \*/,
      'View Transition 期间必须静默内层 CSS 过渡，避免旧帧滞后与阴影重绘卡顿'
    );
  });

  it('3. PostTransition: 浓淡双层水墨渗染、书法飞白丝缕、破墨揭卷与精准时序交接', () => {
    assert.match(postTransition, /COS_LUT = new Float32Array/, '转场画布必须预计算三角函数表，消除每帧逐顶点三角运算');
    assert.match(postTransition, /feibaiStreaks/, '转场必须包含书法飞白枯笔丝缕');
    assert.match(postTransition, /globalCompositeOperation = 'destination-out'/, '退场揭开阶段应采用内圈破墨澄明渐隐而非单调缩放淡出');
    assert.match(postTransition, /--bg-base/, '转场宣纸底衬必须正确读取 --bg-base 以完美兼容浅/深/绿粉三套主题');
    assert.match(
      postTransition,
      /if \(state\.p >= 0\.75 && \(animTween\?\.progress\(\) \?\? 0\) >= 0\.62 && !released\)/,
      '转场交接必须同时校验视觉消散度与真实时间进度'
    );
    assert.match(postTransition, /__areSetPostTransitionCleanup__/, 'PostTransition 必须提供完整清理钩子');
    assert.doesNotMatch(postTransition, /sealRed|#b83b28|#d9533f/i, 'PostTransition 严禁残留朱砂红配色');
  });

  it('4. SiteIntro: 消除 7000 粒子旋涡 Math.hypot 瓶颈、预烘焙扫描墨带、离屏休眠与纯单色水墨涟漪定版', () => {
    assert.match(siteIntro, /SIN_LUT = new Float32Array\(256\)/, 'SiteIntro 必须使用预计算正弦表替代逐粒子 Math.sin');
    assert.match(siteIntro, /const rSq = dx \* dx \+ dy \* dy;/, '旋涡场必须使用平方距离 + 单次 sqrt 替代高开销 Math.hypot');
    assert.doesNotMatch(siteIntro, /Math\.hypot\(dx,\s*dy\)/, 'SiteIntro 粒子物理循环内严禁调用 Math.hypot');
    assert.doesNotMatch(siteIntro, /data-intro-seal|site-intro-seal|#b83b28|#d9533f/i, 'SiteIntro 严禁挂载方章节点或朱砂红变量');
    assert.match(siteIntro, /data-intro-ring/, 'SiteIntro 必须挂载单色水墨涟漪扩散节点');
    assert.match(siteIntro, /T\.ripple/, '定版时刻采用单色水纹涟漪扩散');
    assert.match(siteIntro, /document\.addEventListener\('visibilitychange'/, 'SiteIntro 必须在标签页不可见时自动休眠暂停 rAF');
  });

  it('5. Header & Footer: 零 pointermove 同步回流、单色浓淡墨痕游标、rAF 指针合帧与简洁素雅页脚', () => {
    // 提取 Header 导航磁吸控制器，确保 pointermove 内绝无 getBoundingClientRect
    const navCtrlStart = header.indexOf('setupNavMagneticGliderController');
    const navCtrlEnd = header.indexOf('setupMobileDrawerController');
    const navCtrlCode = header.slice(navCtrlStart, navCtrlEnd);
    const pointerMoveBlock = navCtrlCode.slice(
      navCtrlCode.indexOf("item.addEventListener('pointermove'"),
      navCtrlCode.indexOf("item.addEventListener('pointerleave'")
    );
    assert.doesNotMatch(
      pointerMoveBlock,
      /getBoundingClientRect|offsetHeight|offsetWidth/,
      '导航项 pointermove 内严禁调用 getBoundingClientRect 或 offsetHeight 引发强制同步回流'
    );
    assert.match(navCtrlCode, /metricMap = new WeakMap/, '导航游标必须通过预缓存几何表驱动');
    assert.match(header, /\.glass-nav \.nav-magnetic-glider/, '导航悬停与激活项由纯合成器浓淡飞白水墨游标指示，无冗余背景框');
    assert.doesNotMatch(header, /#b83b28|#d9533f|footer-cinnabar-seal/i, 'Header 严禁残留硬编码朱砂红或印章选择器');
    assert.match(header, /\.glass-nav \.nav-link::before,\s*\.glass-nav \.nav-link::after\s*\{\s*display:\s*none\s*!important;/, '导航链接保持纯文本无背景框极简排版');
    assert.match(header, /function scheduleCursorFrame\(\)/, '鼠标水墨拖尾与圆圈指针必须通过单一 rAF 合帧调度');
    assert.match(header, /__areSetMobileDrawerCleanup__/, '移动端抽屉必须遵循幂等销毁生命周期');

    // 页脚保持简洁纯粹细墨线与版权排版，无闲章
    assert.doesNotMatch(footer, /data-footer-seal|footer-cinnabar-seal|钤印|#b83b28|#d9533f/i, 'Footer 必须彻底移除方印按钮与朱砂红渐变');
    assert.match(footer, /var\(--border\)/, 'Footer 使用主题细墨线分隔');
  });

  it('6. siteContextMenu & appAutoUpdate: 单色起笔墨线 + 游走墨衬 Pill & 圆润飞鸽更新胶囊 JSDOM 实测', async () => {
    assert.doesNotMatch(siteContextMenu, /filter:\s*blur\(/, '右键菜单严禁使用 filter: blur(...) 动画');
    assert.doesNotMatch(appAutoUpdate, /filter:\s*blur\(/, '更新提示胶囊严禁使用 filter: blur(...) 动画');
    assert.doesNotMatch(siteContextMenu, /#b83b28|#d9533f/i, '右键菜单严禁残留朱砂红硬编码色值');
    assert.doesNotMatch(appAutoUpdate, /app-update-seal|#b83b28|#d9533f/i, '更新提示严禁包含方章或朱砂红硬编码色值');

    // A. 右键菜单端到端结构与悬停游走墨衬 Pill 验证
    {
      const dom = new JSDOM(`<p id="prose">梦付千秋清浅纸境</p><input id="inp" value="hello" />`, {
        url: 'https://areset.xyz/posts/ink',
      });
      const { window: win, document: doc } = dom.window;
      win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });

      const cleanup = mountSiteContextMenu(win, doc);
      try {
        const menu = doc.getElementById('site-context-menu');
        assert.ok(menu, '右键菜单根节点应挂载');
        assert.ok(menu.querySelector('[data-ctx-brush-head]'), '应包含顶缘起笔墨线');
        const hoverPill = menu.querySelector('[data-ctx-hover-pill]');
        assert.ok(hoverPill, '应包含悬停游走墨色底衬 Pill');

        const inp = doc.getElementById('inp');
        inp.setSelectionRange(0, 5);
        inp.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 90 }));
        assert.equal(menu.hidden, false);
        assert.equal(menu.classList.contains('is-open'), true);

        const copyBtn = menu.querySelector('[data-ctx-action="copy"]');
        copyBtn.dispatchEvent(new win.Event('pointerenter'));
        assert.equal(hoverPill.classList.contains('is-active'), true, '悬停可用菜单项时墨色底衬 Pill 应激活跟随');

        menu.querySelector('.site-ctx-list').dispatchEvent(new win.Event('pointerleave'));
        assert.equal(hoverPill.classList.contains('is-active'), false, '移出列表时墨色底衬 Pill 应柔和隐去');
      } finally {
        cleanup();
        assert.equal(doc.getElementById('site-ctx-motion-styles'), null, 'cleanup 必须同步卸载注入样式');
      }
    }

    // B. 无感更新提示：飞鸽朱砂小笺与底缘水墨进度条验证
    {
      const dom = new JSDOM(
        `<!doctype html><html><head><meta name="app-build-version" content="v10" /></head><body><textarea id="ed"></textarea></body></html>`,
        { url: 'https://areset.xyz/notes/' }
      );
      const { window: win, document: doc } = dom.window;
      doc.getElementById('ed').focus();

      const api = mountAppAutoUpdate({
        win,
        doc,
        pollIntervalMs: 0,
        settleDelayMs: 60,
        fetchImpl: async () => ({ ok: true, json: async () => ({ version: 'v11' }) }),
        navigateImpl: () => {},
      });

      try {
        await api.checkNow(true);
        const pill = doc.getElementById('app-update-pill');
        assert.ok(pill, '繁忙编辑态下应挂载圆润飞鸽更新胶囊');
        assert.equal(pill.querySelector('[data-update-seal]'), null, '更新胶囊严禁挂载方印节点');
        assert.ok(pill.querySelector('.app-update-dove svg'), '更新胶囊应包含精致细线飞鸽 SVG 图标');
        assert.ok(pill.querySelector('[data-update-ink-bar]'), '更新胶囊应包含底缘单色水墨进度反馈条');

        // 退出编辑焦点进入结算期 -> 触发 is-settling 满墨过渡
        doc.getElementById('ed').blur();
        doc.dispatchEvent(new win.Event('focusout', { bubbles: true }));
        assert.equal(pill.classList.contains('is-settling'), true, '搁笔进入结算倒计时时应启动底缘满墨进度动画');
      } finally {
        win.__areSetAppAutoUpdateCleanup__?.();
      }
    }
  });

  it('7. ZenRainscape & ZenSoundscape: Path2D 批绘制、帧率无关 dtScale、不可见休眠与声波律动采样', () => {
    assert.match(zenRainscape, /const dtScale = lastFrameTime > 0/, '听雨画布必须具备帧率无关 dtScale 步长钳制');
    assert.match(zenRainscape, /const rainFar = new Path2D\(\);/, '斜风细雨必须采用分层 Path2D 批量路径绘制');
    assert.match(zenRainscape, /const ripHigh = new Path2D\(\);/, '宣纸水澜必须采用透明度分桶 Path2D 批量绘制');
    assert.match(zenRainscape, /eaveDrips/, '听雨画布应具备檐前垂珠触纸成澜意境');
    assert.match(zenRainscape, /__areSetZenRainscapeCleanup__/, 'ZenRainscape 必须注册幂等销毁钩子');
    assert.doesNotMatch(zenRainscape, /sealAccent|184,\s*59,\s*40/, 'ZenRainscape 必须统一使用清透单色水墨涟漪');
    assert.ok(!zenRainscape.includes('splashes') && !zenRainscape.includes('mists'), '严禁引入底部积水或灰雾斑块');

    assert.doesNotMatch(zenSoundscape, /data-zen-seal|\.zen-seal/, '音景面板严禁挂载「雨」字方章');
    assert.match(zenSoundscape, /\.zen-brand-pill[\s\S]*?border-radius:\s*9999px/, '音景面板采用细线 SVG + 圆润胶囊徽标');
    assert.match(zenSoundscape, /data-zen-wave/, '音景面板应包含 7 毫单色水墨声波律动谱');
    assert.match(zenSoundscape, /function measureAndClampCapsule\(\)/, '音景面板滚动钳制必须通过 rAF 合帧避免强制同步回流');

    // 验证 ZenAudioEngine 零分配声波采样行为
    const engine = new ZenAudioEngine();
    const bands = new Float32Array(7);
    assert.equal(engine.sampleWaveBands(bands, 1000), false, '未播放时采样返回静默 false');
    assert.ok(bands.every((v) => Math.abs(v - 0.12) < 1e-5), '未播放时声波毫柱保持静息高度');
  });
});
