import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');

function collectSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'content') continue;
      collectSourceFiles(fullPath, acc);
    } else if (/\.(astro|tsx?|jsx?|mjs|css)$/.test(entry.name)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

describe('No-Seal Monochrome Water-Ink Guard Suite (全站防印章/朱砂红回退守门)', () => {
  const sourceFiles = collectSourceFiles(srcDir);

  it('1. src/ 全量扫描: 严禁存在任何方章 DOM/CSS 结构、钤印文案或硬编码朱砂红色值', () => {
    assert.ok(sourceFiles.length >= 25, '必须扫描全站 src/ 源码文件');

    const forbiddenStructures = [
      'footer-cinnabar-seal',
      'paper-card-seal',
      'data-intro-seal',
      'data-zen-seal',
      'swatch-seal',
      'specimen-seal',
      'accountSealStamp',
      'accountSealWrap',
      'about-stamp',
      'ink-ask-seal-glyph',
      'app-update-seal',
      'modal-seal',
      'prose-callout-seal',
      'SEAL_STAMP_SVG',
      'site-intro-seal',
      'zen-seal',
      'brand-seal',
      'timeline-end-seal',
      'stats-tip-seal',
      'home-rant-seal',
      'egg-toast-seal',
    ];

    const forbiddenCopy = [
      '钤印已录',
      '朱砂钤印',
      '轻点钤印',
      '谢谢来访',
      '钤印核验',
      '钤印成章',
      '印信通行',
      '印信已核',
      '印合',
      '钤印',
    ];

    const forbiddenRedPattern = /#b83b28|#d9533f|#c23f2c|194,\s*63,\s*44/i;

    const violations = [];

    for (const filePath of sourceFiles) {
      const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf8');

      for (const token of forbiddenStructures) {
        if (content.includes(token)) {
          violations.push(`${rel}: 残留禁止的方章结构 "${token}"`);
        }
      }

      for (const phrase of forbiddenCopy) {
        if (content.includes(phrase)) {
          violations.push(`${rel}: 残留禁止的印章文案 "${phrase}"`);
        }
      }

      const redMatch = content.match(forbiddenRedPattern);
      if (redMatch) {
        violations.push(`${rel}: 残留硬编码朱砂红色值 "${redMatch[0]}"`);
      }
    }

    assert.deepEqual(violations, [], `全站去印章化守门发现违规项:\n${violations.join('\n')}`);
  });

  it('2. 核心组件单色细线 SVG 与圆润胶囊视觉语言契约', () => {
    const inkAsk = fs.readFileSync(path.join(rootDir, 'src/components/InkAsk.astro'), 'utf8');
    const postLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/PostLayout.astro'), 'utf8');
    const mermaid = fs.readFileSync(path.join(rootDir, 'src/components/MermaidRenderer.astro'), 'utf8');
    const settings = fs.readFileSync(path.join(rootDir, 'src/pages/settings.astro'), 'utf8');
    const account = fs.readFileSync(path.join(rootDir, 'src/pages/account.astro'), 'utf8');
    const life = fs.readFileSync(path.join(rootDir, 'src/pages/life.astro'), 'utf8');

    // InkAsk: 单色细线 ASK_BRAND_ICON + 圆润圆钮 + 双层水纹墨环
    assert.match(inkAsk, /const ASK_BRAND_ICON\s*=\s*['"]<svg\b/, 'InkAsk 必须定义单色细线 SVG ASK_BRAND_ICON');
    assert.match(inkAsk, /seal\.innerHTML\s*=\s*ASK_BRAND_ICON/, 'InkAsk 悬浮圆钮必须渲染 ASK_BRAND_ICON');
    assert.match(inkAsk, /\.ink-ask-seal\s*\{[\s\S]*?border-radius:\s*9999px/, 'InkAsk 悬浮钮必须采用圆润胶囊/圆钮外观');

    // PostLayout & MermaidRenderer: 细线对勾 SVG + 已复制
    assert.match(postLayout, /CHECK_SVG[\s\S]*?<span>已复制<\/span>/, 'PostLayout 代码复制必须使用细线对勾 SVG 与「已复制」文案');
    assert.match(mermaid, /CHECK_SVG[\s\S]*?<span>已复制<\/span>/, 'MermaidRenderer 复制必须使用细线对勾 SVG 与「已复制」文案');

    // Settings & Account & Life: 圆润单色胶囊徽标与清爽书卷文案
    assert.ok(settings.includes('swatch-dot') && settings.includes('specimen-pill') && settings.includes('试墨预览'), 'settings.astro 须使用圆润色点与试墨预览胶囊');
    assert.ok(account.includes('id="accountStatusBadge"') && account.includes('已登录 · 云端就绪') && account.includes('云墨同频'), 'account.astro 须使用圆润云端核验胶囊与云墨同频节点');
    assert.ok(life.includes('class="modal-pill"'), 'life.astro 抽签弹窗须使用圆润单色胶囊');
  });

  it('3. 动效与架构文档同步去印章化校验', () => {
    const docFiles = ['docs/animations-and-pages.md', 'docs/article-motion-review.md'];
    const forbiddenDocTerms = ['钤印', '朱砂印', '朱砂石章', '问字印', '开场印章', '谢谢来访', '印信'];

    for (const rel of docFiles) {
      const content = fs.readFileSync(path.join(rootDir, rel), 'utf8');
      for (const term of forbiddenDocTerms) {
        assert.ok(!content.includes(term), `${rel} 不得残留过时印章表述 "${term}"`);
      }
    }
  });
});
