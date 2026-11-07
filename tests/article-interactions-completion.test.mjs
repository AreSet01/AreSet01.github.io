import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('文章内动效与交互全链路补完验证 (Article Interactions & Animations Suite)', () => {
  const rootDir = process.cwd();
  const postLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/PostLayout.astro'), 'utf8');
  const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');
  const companionLayout = fs.readFileSync(path.join(rootDir, 'src/components/CompanionLayout.astro'), 'utf8');
  const selectionDock = fs.readFileSync(path.join(rootDir, 'src/components/ArticleSelectionDock.astro'), 'utf8');
  const inkAsk = fs.readFileSync(path.join(rootDir, 'src/components/InkAsk.astro'), 'utf8');
  const pinWorkbench = fs.readFileSync(path.join(rootDir, 'src/components/PinWorkbench.astro'), 'utf8');
  const globalCss = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf8');

  it('1. 墨问入卷金墨粒子抛物线与微胶囊入卷回馈 (Q2)', () => {
    assert.match(inkAsk, /function flyInkToNotes\(/);
    assert.match(inkAsk, /存入选中 \(\$\{selected\.length\}字\)/);
    assert.match(selectionDock, /function showNoteSavedMicroToast\(/);
    assert.match(selectionDock, /function focusAndPulseNote\(/);
    assert.match(selectionDock, /notes-saved-micro-toast/);
    assert.match(globalCss, /\.companion-seg-badge\.has-bump/);
  });

  it('2. 笔记 ⇄ 墨问双向流转：[追问] 引用芯片挂载与双卷并排拖拽互投 (Q3)', () => {
    assert.match(selectionDock, /notes-btn-ask/);
    assert.match(selectionDock, /application\/x-companion-note/);
    assert.match(selectionDock, /application\/x-inkask-turn/);
    assert.match(inkAsk, /function mountFollowUpContext\(/);
    assert.match(inkAsk, /ink-ask-followup-chip/);
    assert.match(inkAsk, /application\/x-inkask-turn/);
    assert.match(inkAsk, /application\/x-companion-note/);
  });

  it('3. 对照工作台 (PinWorkbench) 边缘智能退让与全源溯源定位 (Q4)', () => {
    assert.match(pinWorkbench, /function getActiveRailOffset\(/);
    assert.match(pinWorkbench, /--pin-edge-offset/);
    assert.match(globalCss, /right:\s*var\(--pin-edge-offset,\s*0px\)/);
    assert.match(pinWorkbench, /locateTurn/);
    assert.match(pinWorkbench, /focusAndPulseNote/);
    assert.match(inkAsk, /function locateTurn\(/);
  });

  it('4. 正文内部链接与章节锚点悬浮书签预览卡 (Q5)', () => {
    assert.match(postLayout, /function initLinkPreviews\(/);
    assert.match(postLayout, /post-link-popover/);
    assert.match(postLayout, /post-link-popover-pin/);
  });

  it('5. 长代码块折叠渐变幕布、SVG 印章复制按钮与选区快捷键微反馈 (Q6)', () => {
    assert.match(postLayout, /code-collapse-button/);
    assert.match(postLayout, /code-expand-veil/);
    assert.match(postLayout, /展开全部 \$\{lineCount\} 行代码/);
    assert.match(selectionDock, /function flyGhostCapsule\(/);
    assert.match(selectionDock, /is-key-pressed/);
    assert.match(companionLayout, /companion-seg-glider/);
    assert.match(companionLayout, /is-snapped-50/);
  });

  it('6. 正文图片灯箱缩放/漫游/多图连播、章节锚点复制脉冲与 [!NOTE] 书斋笺注块 (Q7)', () => {
    assert.match(baseLayout, /image-viewer-toolbar/);
    assert.match(baseLayout, /function setViewerZoom\(/);
    assert.match(baseLayout, /function stepImageViewer\(/);
    assert.match(postLayout, /function enhanceCalloutBlocks\(/);
    assert.match(postLayout, /prose-callout/);
    assert.match(postLayout, /function enhanceHeadingAnchors\(/);
    assert.match(postLayout, /heading-anchor-btn/);
    assert.match(postLayout, /__pulseHeadingTarget/);
  });

  it('7. 行内代码选中着色、跨行内代码划线等高、Mermaid 边界防裁切与卡片内任意比例拖拽漫游、Pin 工作台完整展示与滑动', () => {
    const mermaidRenderer = fs.readFileSync(path.join(rootDir, 'src/components/MermaidRenderer.astro'), 'utf8');
    assert.match(globalCss, /:not\(pre\) > code::selection/);
    assert.match(selectionDock, /:not\(pre\) > code:has\(mark\.article-highlight-mark\)/);
    assert.match(mermaidRenderer, /function fixMermaidSvgBounds\(/);
    assert.match(mermaidRenderer, /function applyBlockTransform\(/);
    assert.match(globalCss, /\.pinned-card\s*\{[\s\S]*?flex-shrink:\s*0\s*!important/);
    assert.match(pinWorkbench, /__fixMermaidSvgBounds/);
  });

  it('8. 墨问与笔记双面板彻底去印章化 + 鲜明书卷水墨动效与干脆常用延迟', () => {
    const removedSeals = [
      'companion-mini-seal',
      'ink-ask-welcome-seal',
      'notes-empty-seal',
      'notes-saved-toast-seal',
      'ink-ask-stamp',
    ];
    for (const token of removedSeals) {
      assert.ok(!companionLayout.includes(token), `CompanionLayout 不得残留印章概念 (${token})`);
      assert.ok(!inkAsk.includes(token), `InkAsk 不得残留印章概念 (${token})`);
      assert.ok(!selectionDock.includes(token), `ArticleSelectionDock 不得残留印章概念 (${token})`);
      assert.ok(!globalCss.includes(token), `global.css 不得残留印章概念 (${token})`);
    }

    // 双面板实体滑块胶囊 + 水墨晕染 + 卷轴展卷 + 涟漪研墨 + 飞墨溅落 + 书脊水墨横扫
    assert.match(companionLayout, /function syncSegGlider\(/);
    assert.match(selectionDock, /function syncNotesFilterGlider\(/);
    assert.match(selectionDock, /notes-filter-glider/);
    assert.match(inkAsk, /ink-ask-welcome-ornament/);
    assert.match(inkAsk, /ink-ask-ripple-ring/);
    assert.match(inkAsk, /__inkSplash/);
    assert.match(inkAsk, /inkAskTurnSweep/);
    assert.match(selectionDock, /notes-empty-ornament/);
    assert.match(selectionDock, /notes-saved-toast-icon/);
    assert.match(selectionDock, /notesCardSpineSweep/);
  });
});
