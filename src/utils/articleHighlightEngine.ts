/**
 * articleHighlightEngine.ts — 文章持久化高亮与划词批注引擎
 *
 * 核心设计遵循 W3C Web Annotation 数据模型 (TextQuoteSelector):
 * 1. 结构化指纹：{ id, text, prefix, suffix, headingId, headingText, timestamp }
 * 2. 弹性文本锚定：抗 Markdown 编辑轻微改动、空白符折叠与同名短语歧义
 * 3. 语法树保护：跨节点分割文本时绝不破坏 Shiki 代码块与内联标签语义
 * 4. 纯净 DOM 还原：取消高亮时完全解除包裹并调用 normalize() 恢复原生文本节点
 */

export interface ArticleHighlightRecord {
  id: string;
  text: string;
  prefix: string;
  suffix: string;
  headingId?: string;
  headingText?: string;
  color?: string;
  timestamp: number;
}

export interface HighlightTextEntry {
  node: Text;
  start: number;
  end: number;
  length: number;
}

export interface HighlightNodeRange {
  textNode: Text;
  localStart: number;
  localEnd: number;
}

const CONTEXT_RADIUS = 36;
const SKIP_SELECTOR = '.code-block-toolbar, .mermaid-block-header, .mermaid-block-actions, button, svg, script, style, [data-no-search], [data-no-highlight]';

/**
 * 生成基于文章路径或 slug 的 localStorage 键名
 */
export function getStorageKey(postSlug: string): string {
  const cleanSlug = (postSlug || '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\//g, '_');
  return `areSet_article_highlights_${cleanSlug || 'default'}`;
}

/**
 * 从 localStorage 安全加载指定文章的高亮记录
 */
export function loadHighlights(postSlug: string): ArticleHighlightRecord[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(postSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => item && typeof item.id === 'string' && typeof item.text === 'string'
    );
  } catch (err) {
    console.warn('[highlightEngine] Failed to load highlights from storage:', err);
    return [];
  }
}

/**
 * 将高亮记录安全写入 localStorage
 */
export function saveHighlights(postSlug: string, records: ArticleHighlightRecord[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = getStorageKey(postSlug);
    if (!records || records.length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(records));
    }
  } catch (err) {
    console.warn('[highlightEngine] Failed to save highlights to storage:', err);
  }
}

/**
 * 寻找选区所处的前导小节标题
 */
export function findPrecedingHeading(startNode: Node, proseRoot: HTMLElement): { id?: string; text: string } {
  const headings = Array.from(proseRoot.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
  let targetHeading: HTMLElement | null = null;

  for (const h of headings) {
    if (h === startNode || h.contains(startNode)) {
      targetHeading = h;
      break;
    }
    const pos = h.compareDocumentPosition(startNode);
    // Node.DOCUMENT_POSITION_FOLLOWING (4) means startNode is after h in document order
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
      targetHeading = h;
    } else {
      break;
    }
  }

  if (targetHeading) {
    const text = targetHeading.textContent?.trim().replace(/^#+\s*/, '') || '';
    const id = (typeof targetHeading.getAttribute === 'function' ? targetHeading.getAttribute('id') : targetHeading.id) || targetHeading.id || undefined;
    return {
      id: id || undefined,
      text: text.startsWith('§') ? text : `§ ${text}`,
    };
  }

  return {
    id: undefined,
    text: '§ 导言 / 正文',
  };
}

/**
 * 将用户选中的 DOM Range 序列化为 W3C Annotation 指纹
 */
export function serializeHighlight(range: Range, proseRoot: HTMLElement): ArticleHighlightRecord | null {
  const rawText = range.toString().trim();
  if (!rawText) return null;

  // 1. 提取临近前缀与后缀上下文
  let prefix = '';
  let suffix = '';

  try {
    const preRange = document.createRange();
    preRange.setStart(proseRoot, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const preStr = preRange.toString().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
    prefix = preStr.slice(-CONTEXT_RADIUS).trimStart();
  } catch {
    prefix = '';
  }

  try {
    const postRange = document.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEnd(proseRoot, proseRoot.childNodes.length);
    const postStr = postRange.toString().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
    suffix = postStr.slice(0, CONTEXT_RADIUS).trimEnd();
  } catch {
    suffix = '';
  }

  // 2. 找到对应的小节锚点与标题
  const headingInfo = findPrecedingHeading(range.startContainer, proseRoot);

  const id = `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    text: rawText,
    prefix,
    suffix,
    headingId: headingInfo.id,
    headingText: headingInfo.text,
    color: 'gold',
    timestamp: Date.now(),
  };
}

/**
 * 收集元素内部的有效文本节点与起止偏移表
 */
export function collectTextEntries(root: Element): { combinedText: string; entries: HighlightTextEntry[] } {
  const entries: HighlightTextEntry[] = [];
  let combinedText = '';

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    const val = textNode.nodeValue || '';
    const start = combinedText.length;
    const end = start + val.length;
    entries.push({
      node: textNode,
      start,
      end,
      length: val.length,
    });
    combinedText += val;
  }

  return { combinedText, entries };
}

/**
 * 计算候选位置与指纹 prefix/suffix 的上下文相似度得分
 */
export function scoreContextMatch(
  text: string,
  pos: number,
  len: number,
  prefix: string,
  suffix: string
): number {
  let score = 0;
  if (prefix) {
    const actualPrefix = text.slice(Math.max(0, pos - prefix.length), pos);
    let commonPrefix = 0;
    const minP = Math.min(actualPrefix.length, prefix.length);
    for (let i = 1; i <= minP; i++) {
      if (actualPrefix[actualPrefix.length - i] === prefix[prefix.length - i]) {
        commonPrefix++;
      } else {
        break;
      }
    }
    score += commonPrefix * 2;
  }

  if (suffix) {
    const actualSuffix = text.slice(pos + len, pos + len + suffix.length);
    let commonSuffix = 0;
    const minS = Math.min(actualSuffix.length, suffix.length);
    for (let i = 0; i < minS; i++) {
      if (actualSuffix[i] === suffix[i]) {
        commonSuffix++;
      } else {
        break;
      }
    }
    score += commonSuffix * 2;
  }

  return score;
}

/**
 * 根据 W3C 指纹在 prose 树中重新寻找对应字符区间 [start, end]
 */
export function findTextOffsetInString(
  combinedText: string,
  record: ArticleHighlightRecord
): { start: number; end: number } | null {
  const query = record.text;
  if (!query) return null;

  // 1. 精确查找所有可能出现的位置
  const matches: number[] = [];
  let idx = combinedText.indexOf(query);
  while (idx !== -1) {
    matches.push(idx);
    idx = combinedText.indexOf(query, idx + 1);
  }

  if (matches.length === 1) {
    return { start: matches[0], end: matches[0] + query.length };
  }

  if (matches.length > 1) {
    // 存在多个相同短语，依据上下文 prefix/suffix 计算最佳匹配
    let bestIdx = matches[0];
    let maxScore = -1;
    for (const m of matches) {
      const score = scoreContextMatch(combinedText, m, query.length, record.prefix, record.suffix);
      if (score > maxScore) {
        maxScore = score;
        bestIdx = m;
      }
    }
    return { start: bestIdx, end: bestIdx + query.length };
  }

  // 2. 宽松容错查找：折叠空白符后进行模糊匹配
  // 当文章 markdown 修改了多余空格或换行时依然能稳定找回
  const normQuery = query.replace(/\s+/g, ' ').trim();
  const normCombined = combinedText.replace(/\s+/g, ' ');

  const normMatches: number[] = [];
  let nIdx = normCombined.indexOf(normQuery);
  while (nIdx !== -1) {
    normMatches.push(nIdx);
    nIdx = normCombined.indexOf(normQuery, nIdx + 1);
  }

  if (normMatches.length > 0) {
    let chosenNormIdx = normMatches[0];
    if (normMatches.length > 1) {
      const normPrefix = (record.prefix || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
      const normSuffix = (record.suffix || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
      let bestScore = -1;
      for (const m of normMatches) {
        const score = scoreContextMatch(normCombined, m, normQuery.length, normPrefix, normSuffix);
        if (score > bestScore) {
          bestScore = score;
          chosenNormIdx = m;
        }
      }
    }

    // 将 chosenNormIdx 映射回原始 combinedText 坐标
    let origStart = 0;
    let currNorm = 0;
    while (origStart < combinedText.length && currNorm < chosenNormIdx) {
      if (/\s/.test(combinedText[origStart])) {
        // 跳过连续多余空白
        while (origStart + 1 < combinedText.length && /\s/.test(combinedText[origStart + 1])) {
          origStart++;
        }
      }
      origStart++;
      currNorm++;
    }

    let origEnd = origStart;
    let matchedChars = 0;
    while (origEnd < combinedText.length && matchedChars < normQuery.length) {
      if (/\s/.test(combinedText[origEnd])) {
        while (origEnd + 1 < combinedText.length && /\s/.test(combinedText[origEnd + 1])) {
          origEnd++;
        }
      }
      origEnd++;
      matchedChars++;
    }

    return { start: origStart, end: origEnd };
  }

  return null;
}

/**
 * 将全局字符偏移映射至文本节点
 */
export function mapSpanToTextNodes(
  matchStart: number,
  matchEnd: number,
  entries: HighlightTextEntry[]
): HighlightNodeRange[] {
  const ranges: HighlightNodeRange[] = [];

  for (const entry of entries) {
    if (matchEnd <= entry.start || matchStart >= entry.end) {
      continue;
    }

    const localStart = Math.max(0, matchStart - entry.start);
    const localEnd = Math.min(entry.length, matchEnd - entry.start);

    if (localStart < localEnd) {
      ranges.push({
        textNode: entry.node,
        localStart,
        localEnd,
      });
    }
  }

  return ranges;
}

/**
 * 遍历 Range 所包含或相交的文本节点
 */
export function getTextNodesInRange(range: Range): HighlightNodeRange[] {
  const ranges: HighlightNodeRange[] = [];
  const startNode = range.startContainer;
  const endNode = range.endContainer;

  if (startNode === endNode && startNode.nodeType === Node.TEXT_NODE) {
    if (range.startOffset < range.endOffset) {
      ranges.push({
        textNode: startNode as Text,
        localStart: range.startOffset,
        localEnd: range.endOffset,
      });
    }
    return ranges;
  }

  const root = range.commonAncestorContainer;
  const ancestor = root.nodeType === Node.TEXT_NODE ? root.parentElement || root : root;

  const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Node).parentElement;
      if (!parent || parent.closest(SKIP_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (range.intersectsNode(node)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    },
  });

  let currentNode: Text | null;
  while ((currentNode = walker.nextNode() as Text | null)) {
    let localStart = 0;
    let localEnd = currentNode.nodeValue ? currentNode.nodeValue.length : 0;

    if (currentNode === startNode) {
      localStart = range.startOffset;
    }
    if (currentNode === endNode) {
      localEnd = range.endOffset;
    }

    if (localStart < localEnd) {
      ranges.push({
        textNode: currentNode,
        localStart,
        localEnd,
      });
    }
  }

  return ranges;
}

/**
 * 将匹配的文本范围应用为 <mark class="article-highlight-mark">
 * 保持代码高亮语法树层级，且完全保护原始属性
 */
export function applyRangesAsHighlight(
  nodeRanges: HighlightNodeRange[],
  record: ArticleHighlightRecord
): HTMLElement[] {
  const marks: HTMLElement[] = [];
  if (!nodeRanges.length) return marks;

  // 按文本节点分组并逆序分割，避免偏移失真
  const nodeMap = new Map<Text, HighlightNodeRange[]>();
  for (const r of nodeRanges) {
    const list = nodeMap.get(r.textNode) || [];
    list.push(r);
    nodeMap.set(r.textNode, list);
  }

  let isFirst = true;
  for (const [node, list] of nodeMap.entries()) {
    list.sort((a, b) => b.localStart - a.localStart);

    for (const r of list) {
      try {
        const fullLen = node.nodeValue ? node.nodeValue.length : 0;
        let matchNode: Text;

        if (r.localStart === 0 && r.localEnd >= fullLen) {
          matchNode = node;
        } else if (r.localStart === 0) {
          node.splitText(r.localEnd);
          matchNode = node;
        } else if (r.localEnd >= fullLen) {
          matchNode = node.splitText(r.localStart);
        } else {
          node.splitText(r.localEnd);
          matchNode = node.splitText(r.localStart);
        }

        const mark = document.createElement('mark');
        mark.className = 'article-highlight-mark';
        mark.dataset.highlightId = record.id;
        mark.setAttribute('tabindex', '0');
        mark.setAttribute('role', 'button');
        mark.setAttribute('aria-label', `高亮标注：${record.text.slice(0, 30)}`);
        mark.title = `高亮笔记 (点击管理) · ${new Date(record.timestamp).toLocaleDateString()}`;

        // 仅在首个 mark 上赋予定位锚点 id
        if (isFirst) {
          mark.id = record.id;
          isFirst = false;
        }

        matchNode.parentNode?.insertBefore(mark, matchNode);
        mark.appendChild(matchNode);
        marks.push(mark);
      } catch (e) {
        console.debug('[highlightEngine] text node split error:', e);
      }
    }
  }

  return marks;
}

/**
 * 将 Range 转换为持久化高亮并在 DOM 中渲染
 */
export function applyHighlightToRange(range: Range, record: ArticleHighlightRecord): HTMLElement[] {
  const nodeRanges = getTextNodesInRange(range);
  return applyRangesAsHighlight(nodeRanges, record);
}

/**
 * 从 DOM 中完全清除指定 id 的高亮标记，并彻底恢复文本节点（无冗余残留）
 */
export function removeHighlightFromDOM(highlightId: string, proseRoot: Element): void {
  const marks = Array.from(proseRoot.querySelectorAll<HTMLElement>(`mark[data-highlight-id="${highlightId}"]`));
  const parentsToNormalize = new Set<Node>();

  for (const mark of marks) {
    const parent = mark.parentNode;
    if (parent) {
      parentsToNormalize.add(parent);
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      mark.remove();
    }
  }

  for (const parent of parentsToNormalize) {
    parent.normalize();
  }
}

/**
 * 页面加载或路由切换时，扫描并重新挂载全部持久化高亮
 */
export function rehydrateHighlights(
  records: ArticleHighlightRecord[],
  proseRoot: HTMLElement
): Map<string, HTMLElement[]> {
  const resultMap = new Map<string, HTMLElement[]>();
  if (!records.length || !proseRoot) return resultMap;

  for (const record of records) {
    const { combinedText, entries } = collectTextEntries(proseRoot);
    if (!combinedText || !entries.length) break;

    const span = findTextOffsetInString(combinedText, record);
    if (!span) continue;

    const nodeRanges = mapSpanToTextNodes(span.start, span.end, entries);
    if (!nodeRanges.length) continue;

    const marks = applyRangesAsHighlight(nodeRanges, record);
    if (marks.length) {
      resultMap.set(record.id, marks);
    }
  }

  return resultMap;
}

/**
 * 格式化标准 Markdown 引用卡片
 */
export function formatCitation(
  articleTitle: string,
  sectionTitle: string,
  articleUrl: string,
  text: string,
  headingId?: string
): string {
  const cleanSnippet = text
    .split('\n')
    .map((line) => `> ${line.trim()}`)
    .join('\n');

  const cleanSection = sectionTitle.replace(/^§\s*/, '').trim();
  const sourceLabel = cleanSection && cleanSection !== '导言 / 正文'
    ? `《${articleTitle} · ${cleanSection}》`
    : `《${articleTitle}》`;

  const fullUrl = headingId
    ? `${articleUrl.replace(/#.*$/, '')}#${headingId}`
    : articleUrl;

  return `${cleanSnippet}\n\n— 引用自${sourceLabel} ${fullUrl}`;
}

/**
 * 将整篇文章的所有高亮导出为结构化 Markdown 研读笔记
 */
export function exportHighlightsAsMarkdown(
  articleTitle: string,
  articleUrl: string,
  records: ArticleHighlightRecord[]
): string {
  const dateStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const cleanUrl = articleUrl.replace(/#.*$/, '');

  let md = `# 《${articleTitle}》读书笔记与高亮摘要\n\n`;
  md += `> 本文共 ${records.length} 条划线高亮 · 导出时间：${dateStr}\n`;
  md += `> 原文链接：${cleanUrl}\n\n`;
  md += `---\n\n`;

  // 按小节分组
  const sectionMap = new Map<string, ArticleHighlightRecord[]>();
  for (const rec of records) {
    const sec = rec.headingText || '§ 导言 / 正文';
    const list = sectionMap.get(sec) || [];
    list.push(rec);
    sectionMap.set(sec, list);
  }

  for (const [section, items] of sectionMap.entries()) {
    md += `## ${section}\n\n`;
    for (const item of items) {
      const quoteText = item.text
        .split('\n')
        .map((l) => `> ${l.trim()}`)
        .join('\n');
      const itemUrl = item.headingId ? `${cleanUrl}#${item.headingId}` : cleanUrl;
      const timeTag = new Date(item.timestamp).toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      md += `${quoteText}\n`;
      md += `— [定位原文](${itemUrl}) · *${timeTag}*\n\n`;
    }
  }

  return md;
}
