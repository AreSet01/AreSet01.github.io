import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const headerPath = path.join(rootDir, 'src/components/Header.astro');
const globalCssPath = path.join(rootDir, 'src/styles/global.css');
const baseLayoutPath = path.join(rootDir, 'src/layouts/BaseLayout.astro');

test('Cursor Trail Toggle & Native Pointer Restoration Suite', async (t) => {
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

  await t.test('2. Header.astro 指针开关交互与全局 API: setCursorTrailDisabled 与画布休眠', () => {
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

    // 验证 setCursorTrailDisabled 中主动同步 canvas display: none
    assert.match(
      headerContent,
      /if\s*\(canvas\)\s*canvas\.style\.display\s*=\s*'none';/,
      '禁用指针拖尾时必须主动将 canvas 设为 display: none'
    );
    assert.match(
      headerContent,
      /if\s*\(canvas\)\s*canvas\.style\.removeProperty\('display'\);/,
      '启用指针拖尾时必须移除 display 内联样式'
    );
  });

  await t.test('3. global.css 原生电脑系统指针彻底回归: 作用域隔离与零残留 cursor: none', () => {
    // 验证 cursor: none 仅对未禁用状态生效
    assert.match(
      globalCssContent,
      /html:not\(\[data-cursor-trail="disabled"\]\),\s*html:not\(\[data-cursor-trail="disabled"\]\)\s+body\s*\{\s*cursor:\s*none\s*!important;\s*\}/,
      'global.css 必须仅在 html:not([data-cursor-trail="disabled"]) 下隐藏原生指针'
    );

    // 验证当 data-cursor-trail="disabled" 时完整恢复系统指针
    assert.match(
      globalCssContent,
      /html\[data-cursor-trail="disabled"\],\s*html\[data-cursor-trail="disabled"\]\s+body,\s*html\[data-cursor-trail="disabled"\]\s+\.home-ticker\s*\{\s*cursor:\s*auto\s*!important;\s*\}/,
      '禁用时 html、body、home-ticker 必须强制恢复 cursor: auto !important'
    );

    // 验证核心交互元素恢复 pointer 指针
    assert.match(
      globalCssContent,
      /html\[data-cursor-trail="disabled"\]\s+a,[\s\S]*?html\[data-cursor-trail="disabled"\]\s+button,[\s\S]*?html\[data-cursor-trail="disabled"\]\s+\.cursor-trail-toggle/,
      '禁用时所有交互按钮与链接必须恢复 cursor: pointer !important'
    );

    // 验证 .home-ticker 不包含硬编码无条件 cursor: none
    assert.doesNotMatch(
      globalCssContent,
      /\.home-ticker\s*\{[\s\S]*?cursor:\s*none;/g,
      '.home-ticker 样式规则中禁止包含硬编码无条件的 cursor: none'
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
