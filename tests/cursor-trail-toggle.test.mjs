import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const headerPath = path.join(rootDir, 'src/components/Header.astro');
const globalCssPath = path.join(rootDir, 'src/styles/global.css');
const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');

test('Cursor Trail Toggle & Permanent Circle Pointer Suite', async (t) => {
  const headerContent = fs.readFileSync(headerPath, 'utf-8');
  const globalCssContent = fs.readFileSync(globalCssPath, 'utf-8');
  const baseLayoutContent = fs.readFileSync(baseLayoutPath, 'utf-8');

  await t.test('1. Header.astro 运行时语法完备性: onPointerUp 正确声明，绝无 ReferenceError', () => {
    // 验证 onPointerUp 必须具备完整函数声明
    assert.match(
      headerContent,
      /function\s+onPointerUp\s*\(\)\s*\{[\s\S]*?brush\.isPressed\s*=\s*false;[\s\S]*?\}/,
      'Header.astro 必须完整定义 function onPointerUp，彻底杜绝调用时抛出 ReferenceError 阻断脚本运行'
    );
    // 验证 pointerup 事件注册与解绑成对存在
    assert.match(
      headerContent,
      /window\.addEventListener\('pointerup',\s*onPointerUp\);/,
      'Header.astro 必须注册 pointerup 监听器'
    );
    assert.match(
      headerContent,
      /\(\)\s*=>\s*window\.removeEventListener\('pointerup',\s*onPointerUp\)/,
      'Header.astro 必须在 cleanupFns 中移除 pointerup 监听器'
    );
  });

  await t.test('2. Header.astro 指针开关交互与全局 API: 仅禁用拖尾，常驻圆圈指针', () => {
    // 验证导出全局 API
    assert.match(
      headerContent,
      /window\.__setCursorTrailDisabled\s*=\s*setCursorTrailDisabled;/,
      'Header.astro 必须导出全局 window.__setCursorTrailDisabled'
    );
    assert.match(
      headerContent,
      /window\.__isCursorTrailDisabled\s*=\s*isCursorTrailDisabled;/,
      'Header.astro 必须导出全局 window.__isCursorTrailDisabled'
    );

    // 验证点击切换事件监听器健壮性
    assert.match(
      headerContent,
      /target\.closest\('\[data-cursor-trail-toggle\]'\)/,
      '点击事件必须安全识别 [data-cursor-trail-toggle] 目标'
    );
    assert.match(
      headerContent,
      /setCursorTrailDisabled\(!isCursorTrailDisabled\(\)\);/,
      '点击开关必须立即切换 isCursorTrailDisabled 状态'
    );

    // 验证圆圈指针常驻绘制：无论拖尾开关如何，在 brush.isVisible 时均绘制中心实心墨核与外圈发丝细线
    assert.match(
      headerContent,
      /(activeCtx|ctx)\.arc\(mouse\.x,\s*mouse\.y,\s*1\.5,\s*0,\s*Math\.PI\s*\*\s*2\);/,
      'Header.astro 必须始终在鼠标位置绘制 1.5px 中心墨核'
    );
    assert.match(
      headerContent,
      /(activeCtx|ctx)\.arc\(mouse\.x,\s*mouse\.y,\s*brush\.outerRadius,\s*0,\s*Math\.PI\s*\*\s*2\);/,
      'Header.astro 必须始终在鼠标位置绘制 outerRadius 外圈细线'
    );
    // 验证禁用拖尾时仅清空/阻断墨线 points，绝不将 canvas 隐藏为 display: none
    assert.doesNotMatch(
      headerContent,
      /if\s*\(disabled\)[\s\S]*?canvas\.style\.display\s*=\s*'none'/,
      '禁用拖尾时不得将 canvas 设为 display: none，必须保留圆圈指针渲染'
    );
  });

  await t.test('3. global.css 圆圈指针常驻与原生指针彻底隐藏: 桌面端绝不冒出系统箭头', () => {
    // 验证桌面端 cursor: none 常驻隐藏原生箭头
    assert.match(
      globalCssContent,
      /html,\s*html body\s*\{\s*cursor:\s*none\s*!important;\s*\}/,
      'global.css 必须在 pointer: fine 下常驻隐藏原生指针，保障圆圈指针独占'
    );

    // 验证文本输入框保留 text 提示
    assert.match(
      globalCssContent,
      /cursor:\s*text\s*!important;/,
      '文本输入框必须保留 cursor: text 保证输入体验'
    );

    // 验证禁止出现将 canvas 设置为 display: none 的破坏性规则
    assert.doesNotMatch(
      globalCssContent,
      /html\[data-cursor-trail="disabled"\]\s+#inkCanvas\s*\{\s*display:\s*none/,
      'global.css 严禁对 #inkCanvas 施加 display: none'
    );
  });

  await t.test('4. 跨路由与首屏持久化: BaseLayout 与 localStorage 一致性', () => {
    assert.match(
      baseLayoutContent,
      /localStorage\.getItem\('cursor-trail'\)\s*===\s*'disabled'/,
      'BaseLayout.astro 必须在首屏 head 与软导航后核查 localStorage cursor-trail'
    );
    assert.match(
      baseLayoutContent,
      /document\.documentElement\.setAttribute\('data-cursor-trail',\s*'disabled'\);/,
      'BaseLayout.astro 必须在检测到禁用缓存时设置 data-cursor-trail="disabled"'
    );
  });
});
