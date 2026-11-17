export interface LineBand {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SelectionBandRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RegionGeometry {
  mode: 'none' | 'single' | 'block';
  top: number;
  height: number;
  band?: SelectionBandRect;
  bands: LineBand[];
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface CollectedRangeRects {
  rects: RectLike[];
  extraInlineCodeRects: RectLike[];
  coveredInlineCodes: Set<HTMLElement>;
  distinctBlockCount: number;
  isPurePre: boolean;
}

const BLOCK_SELECTOR =
  'p, li, blockquote, h1, h2, h3, h4, h5, h6, dt, dd, figcaption, td, th';

function intersectsVerticalBand(a: LineBand, top: number, bottom: number): boolean {
  const overlap = Math.min(a.bottom, bottom) - Math.max(a.top, top);
  const minHeight = Math.min(a.bottom - a.top, bottom - top);
  return overlap > minHeight * 0.45;
}

function getInlineCodeHost(el: Element | null): HTMLElement | null {
  if (!el) return null;
  const code = el.closest('code');
  if (!code || code.closest('pre')) return null;
  return code as HTMLElement;
}

function getBlockHost(el: Element | null, root: Element): Element | null {
  if (!el) return null;
  const block = el.closest(BLOCK_SELECTOR);
  if (!block || !root.contains(block)) return null;
  return block;
}

function getTextNodesIntersectingRange(range: Range): Text[] {
  const ancestor = range.commonAncestorContainer;
  if (ancestor.nodeType === 3) {
    return [ancestor as Text];
  }
  const doc = ancestor.ownerDocument || document;
  const nodes: Text[] = [];
  const walker = doc.createTreeWalker(ancestor, 4 /* NodeFilter.SHOW_TEXT */);
  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    let overlaps = false;
    try {
      overlaps = range.intersectsNode(textNode);
    } catch {
      overlaps = false;
    }
    if (overlaps) {
      nodes.push(textNode);
    }
    current = walker.nextNode();
  }
  return nodes;
}

/**
 * Collect exact glyph client rects from text nodes inside a live DOM Range,
 * avoiding outer element box artifacts and isolating inline <code> pills.
 */
export function collectRangeTextRects(range: Range, root: Element): CollectedRangeRects {
  const rects: RectLike[] = [];
  const extraInlineCodeRects: RectLike[] = [];
  const coveredInlineCodes = new Set<HTMLElement>();
  const blocks = new Set<Element>();
  let sawPre = false;
  let sawProse = false;

  const nodes = getTextNodesIntersectingRange(range);
  const doc = root.ownerDocument || document;
  const subRange = doc.createRange();

  for (const node of nodes) {
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (end <= start) continue;

    const slice = (node.nodeValue || '').slice(start, end);
    // Skip pure inter-block formatting newlines/whitespace that generate phantom zero-width rects
    if (!slice.trim() && /[\r\n]/.test(slice)) continue;
    if (slice.length === 0) continue;

    const parent = node.parentElement;
    if (!parent || !root.contains(parent)) continue;

    if (parent.closest('pre')) {
      sawPre = true;
      continue;
    }
    sawProse = true;

    const block = getBlockHost(parent, root);
    if (block) blocks.add(block);

    const inlineCode = getInlineCodeHost(parent);
    const codeRect =
      inlineCode &&
      !coveredInlineCodes.has(inlineCode) &&
      !inlineCode.contains(range.commonAncestorContainer) &&
      typeof inlineCode.getBoundingClientRect === 'function'
        ? inlineCode.getBoundingClientRect()
        : null;
    if (inlineCode && !inlineCode.contains(range.commonAncestorContainer)) {
      coveredInlineCodes.add(inlineCode);
    }

    try {
      subRange.setStart(node, start);
      subRange.setEnd(node, end);
      const clientRects = subRange.getClientRects();
      for (let i = 0; i < clientRects.length; i += 1) {
        const rect = clientRects[i];
        if (rect.width >= 0.8 && rect.height >= 2) {
          rects.push(rect);
          if (codeRect && codeRect.width >= 0.8 && codeRect.height >= 2) {
            const coversCodeStart = !inlineCode!.contains(range.startContainer) || range.startOffset === 0;
            const coversCodeEnd = !inlineCode!.contains(range.endContainer) || end === node.length;
            const edgeLeft = coversCodeStart ? codeRect.left : rect.left;
            const edgeRight = coversCodeEnd ? codeRect.right : rect.right;
            extraInlineCodeRects.push({
              left: edgeLeft,
              top: rect.top,
              right: edgeRight,
              bottom: rect.bottom,
              width: Math.max(1, edgeRight - edgeLeft),
              height: rect.height,
            });
          }
        }
      }
    } catch {
      // Ignore detached or invalid offsets during mid-mutation checks
    }
  }

  return {
    rects,
    extraInlineCodeRects,
    coveredInlineCodes,
    distinctBlockCount: blocks.size,
    isPurePre: sawPre && !sawProse,
  };
}

/**
 * Collect glyph client rects and enclosing blocks from persisted <mark> spans.
 */
export function collectMarkRects(marks: HTMLElement[], root: Element): CollectedRangeRects {
  const rects: RectLike[] = [];
  const extraInlineCodeRects: RectLike[] = [];
  const coveredInlineCodes = new Set<HTMLElement>();
  const marksByCode = new Map<HTMLElement, HTMLElement[]>();
  const blocks = new Set<Element>();
  let sawPre = false;
  let sawProse = false;

  for (const mark of marks) {
    if (!mark.isConnected || !root.contains(mark)) continue;
    if (mark.closest('pre')) {
      sawPre = true;
      continue;
    }
    sawProse = true;

    const block = getBlockHost(mark, root);
    if (block) blocks.add(block);

    const inlineCode = getInlineCodeHost(mark.parentElement);
    if (inlineCode) {
      coveredInlineCodes.add(inlineCode);
      const list = marksByCode.get(inlineCode);
      if (list) list.push(mark);
      else marksByCode.set(inlineCode, [mark]);
    }

    const clientRects = mark.getClientRects();
    for (let i = 0; i < clientRects.length; i += 1) {
      const rect = clientRects[i];
      if (rect.width >= 0.8 && rect.height >= 2) {
        rects.push(rect);
      }
    }
  }

  marksByCode.forEach((codeMarks, codeEl) => {
    const crossesOutside = marks.some((m) => !codeEl.contains(m));
    if (!crossesOutside) return;
    const markedText = codeMarks.map((m) => m.textContent || '').join('').trim();
    const fullText = (codeEl.textContent || '').trim();
    if (fullText && markedText === fullText && typeof codeEl.getBoundingClientRect === 'function') {
      const codeRect = codeEl.getBoundingClientRect();
      if (codeRect.width >= 0.8 && codeRect.height >= 2) {
        extraInlineCodeRects.push(codeRect);
      }
    }
  });

  return {
    rects,
    extraInlineCodeRects,
    coveredInlineCodes,
    distinctBlockCount: blocks.size,
    isPurePre: sawPre && !sawProse,
  };
}

/**
 * Classify client rects into single-line inline vs multi-line/multi-block rectangular geometry.
 */
export function classifyRectsToGeometry(
  collected: CollectedRangeRects,
  containerRect: Pick<RectLike, 'left' | 'top' | 'width' | 'height'>,
): RegionGeometry {
  if (collected.isPurePre || collected.rects.length === 0) {
    return { mode: 'none', top: 0, height: 0, bands: [] };
  }

  const bands: LineBand[] = [];
  for (const r of collected.rects) {
    if (r.width < 0.8 || r.height < 2) continue;
    const relTop = r.top - containerRect.top;
    const relBottom = r.bottom - containerRect.top;
    const relLeft = r.left - containerRect.left;
    const relRight = r.right - containerRect.left;

    const match = bands.find((b) => intersectsVerticalBand(b, relTop, relBottom));
    if (match) {
      match.top = Math.min(match.top, relTop);
      match.bottom = Math.max(match.bottom, relBottom);
      match.left = Math.min(match.left, relLeft);
      match.right = Math.max(match.right, relRight);
    } else {
      bands.push({ top: relTop, bottom: relBottom, left: relLeft, right: relRight });
    }
  }

  if (bands.length === 0) {
    return { mode: 'none', top: 0, height: 0, bands: [] };
  }

  // Merge inline <code> pill horizontal edges into matching visual bands so bars leave no padding cutouts
  for (const r of collected.extraInlineCodeRects) {
    if (r.width < 0.8 || r.height < 2) continue;
    const relTop = r.top - containerRect.top;
    const relBottom = r.bottom - containerRect.top;
    const relLeft = r.left - containerRect.left;
    const relRight = r.right - containerRect.left;

    const match = bands.find((b) => intersectsVerticalBand(b, relTop, relBottom));
    if (match) {
      match.top = Math.min(match.top, relTop);
      match.bottom = Math.max(match.bottom, relBottom);
      match.left = Math.min(match.left, relLeft);
      match.right = Math.max(match.right, relRight);
    }
  }

  bands.sort((a, b) => a.top - b.top);

  if (bands.length >= 2 || collected.distinctBlockCount >= 2) {
    const top = Math.max(0, bands[0].top - 5);
    const bottom = bands[bands.length - 1].bottom + 5;
    return {
      mode: 'block',
      top,
      height: Math.max(20, bottom - top),
      bands,
    };
  }

  const single = bands[0];
  const bandTop = Math.max(0, single.top - 2);
  const bandHeight = Math.max(16, single.bottom - single.top + 4);
  const bandLeft = Math.max(-6, single.left - 3);
  const bandWidth = Math.max(4, single.right - single.left + 6);

  return {
    mode: 'single',
    top: bandTop,
    height: bandHeight,
    band: {
      left: bandLeft,
      top: bandTop,
      width: bandWidth,
      height: bandHeight,
    },
    bands,
  };
}

/**
 * Compute adaptive calligraphic wet-ink brush duration (in ms) from highlight geometry:
 * short single-line phrases sweep crisply (~420ms), while wide bands and multi-line blocks
 * breathe naturally up to ~600ms for wet-ink permeation + fiber drying settle.
 */
export function computeWetInkStrokeDuration(geom: RegionGeometry): number {
  if (geom.mode === 'none') return 420;
  if (geom.mode === 'single' && geom.band) {
    return Math.round(Math.min(540, Math.max(400, 360 + geom.band.width * 0.28)));
  }
  const lineCount = Math.max(2, geom.bands.length);
  return Math.round(Math.min(600, Math.max(450, 410 + lineCount * 24)));
}
