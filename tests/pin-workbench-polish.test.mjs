import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('对照工作台 (PinWorkbench) 彻底消除黑色滚动条与全尺寸自适应排版验证', () => {
  const rootDir = process.cwd();
  const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');
  const workbench = fs.readFileSync(path.join(rootDir, 'src/components/PinWorkbench.astro'), 'utf8');
  const panelResize = fs.readFileSync(path.join(rootDir, 'src/utils/panelResize.ts'), 'utf8');

  it('1. 彻底消除卡片内部黑色滚动条与黑色背景底色', () => {
    // pinned-card-body 不得有强制黑色背景，不可出现纵向滚动条
    assert.ok(globalCss.includes('.pinned-card-body') && globalCss.includes('overflow-y: visible !important;'),
      'pinned-card-body 必须设置 overflow-y: visible !important，杜绝内部纵向滚动条');
    assert.ok(globalCss.includes('background: transparent !important;'),
      'pinned-card-body 必须背景透明，杜绝黑色背景底块露底');
    assert.ok(globalCss.includes('.pinned-card-body::-webkit-scrollbar') && globalCss.includes('display: none !important;'),
      'pinned-card-body 必须彻底禁用 webkit 滚动条');

    // pinned-quote-body 必须完全展开无滚动条
    assert.ok(globalCss.includes('.pinned-quote-body') && globalCss.includes('max-height: none !important;'),
      'pinned-quote-body 绝不可设置 240px 等高度封顶导致滚动条出现');
    assert.ok(globalCss.includes('.pinned-quote-body::-webkit-scrollbar') && globalCss.includes('display: none !important;'),
      'pinned-quote-body 必须彻底隐藏滚动条');
  });

  it('2. 浮窗顶栏与操作按钮具备严格单行防折行机制 (No-Wrap Header)', () => {
    assert.ok(globalCss.includes('.pin-window-header') && globalCss.includes('white-space: nowrap;'),
      'pin-window-header 必须声明 white-space: nowrap，防止标题与按钮换行');
    assert.ok(globalCss.includes('.pin-window-title') && globalCss.includes('white-space: nowrap;') && globalCss.includes('text-overflow: ellipsis;'),
      'pin-window-title 必须单行省略，绝不允许拆成两行文字');
    assert.ok(globalCss.includes('.pin-action-btn') && globalCss.includes('white-space: nowrap;') && globalCss.includes('flex-shrink: 0;'),
      'pin-action-btn 折叠/清空/贴边按钮必须禁止文字垂直拆分折行');
  });

  it('3. 卡片头部按钮紧凑排版，保障标题具备充足展示空间', () => {
    assert.ok(globalCss.includes('.pinned-card-actions') && globalCss.includes('white-space: nowrap;'),
      'pinned-card-actions 必须为单行横向排版');
    assert.ok(globalCss.includes('.pinned-btn') && globalCss.includes('white-space: nowrap;') && globalCss.includes('flex-shrink: 0;'),
      'pinned-btn 必须具备 flex-shrink: 0 防止被挤扁');
    assert.ok(globalCss.includes('.pinned-card-title') && globalCss.includes('text-overflow: ellipsis;'),
      'pinned-card-title 必须具备省略保护');
  });

  it('4. 浮窗最小尺寸安全保护与底部留白防手柄压盖', () => {
    assert.ok(globalCss.includes('.pin-float-window') && globalCss.includes('min-width: 350px;'),
      'pin-float-window 必须设置 min-width: 350px，防止被压扁到无法阅读');
    assert.ok(panelResize.includes('minWidth ?? 350;') && panelResize.includes('minHeight ?? 220;'),
      'panelResize 必须具备健康的默认最小限制');
    assert.ok(workbench.includes('minWidth: 350,') && workbench.includes('minHeight: 220,'),
      'PinWorkbench 必须配置 minWidth: 350 与 minHeight: 220');
    assert.ok(globalCss.includes('.pin-window-body') && globalCss.includes('padding: 0.85rem 0.85rem 1.4rem 0.85rem;'),
      'pin-window-body 底部必须预留 1.4rem 安全呼吸区，杜绝右下角拉伸图标压盖正文或卡片边框');
  });
});
