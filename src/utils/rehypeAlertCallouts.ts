import { visit } from 'unist-util-visit';

export interface CalloutMeta {
  type: 'note' | 'tip' | 'important' | 'warning' | 'caution';
  defaultTitle: string;
  iconPaths: Array<{ tag: string; props: Record<string, string> }>;
}

export const CALLOUT_REGISTRY: Record<string, CalloutMeta> = {
  note: {
    type: 'note',
    defaultTitle: '提示',
    iconPaths: [
      { tag: 'path', props: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } },
      { tag: 'polyline', props: { points: '14 2 14 8 20 8' } },
      { tag: 'line', props: { x1: '16', y1: '13', x2: '8', y2: '13' } },
      { tag: 'line', props: { x1: '16', y1: '17', x2: '8', y2: '17' } },
    ],
  },
  tip: {
    type: 'tip',
    defaultTitle: '技巧',
    iconPaths: [
      {
        tag: 'path',
        props: {
          d: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
        },
      },
    ],
  },
  important: {
    type: 'important',
    defaultTitle: '重要',
    iconPaths: [
      { tag: 'circle', props: { cx: '12', cy: '12', r: '10' } },
      { tag: 'line', props: { x1: '12', y1: '8', x2: '12', y2: '12' } },
      { tag: 'line', props: { x1: '12', y1: '16', x2: '12.01', y2: '16' } },
    ],
  },
  warning: {
    type: 'warning',
    defaultTitle: '注意',
    iconPaths: [
      {
        tag: 'path',
        props: {
          d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
        },
      },
      { tag: 'line', props: { x1: '12', y1: '9', x2: '12', y2: '13' } },
      { tag: 'line', props: { x1: '12', y1: '17', x2: '12.01', y2: '17' } },
    ],
  },
  caution: {
    type: 'caution',
    defaultTitle: '警告',
    iconPaths: [
      {
        tag: 'polygon',
        props: {
          points: '7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2',
        },
      },
      { tag: 'line', props: { x1: '12', y1: '8', x2: '12', y2: '12' } },
      { tag: 'line', props: { x1: '12', y1: '16', x2: '12.01', y2: '16' } },
    ],
  },
};

const ALERT_REGEX = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*([^\r\n]*)(?:\r?\n([\s\S]*))?/i;

function buildIconElement(meta: CalloutMeta) {
  return {
    type: 'element',
    tagName: 'svg',
    properties: {
      viewBox: '0 0 24 24',
      width: '16',
      height: '16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: ['callout-svg-icon'],
      'aria-hidden': 'true',
    },
    children: meta.iconPaths.map((item) => ({
      type: 'element',
      tagName: item.tag,
      properties: item.props,
      children: [],
    })),
  };
}

/**
 * 将 Markdown 引用块中的 GitHub Alerts 语法转换为水墨书斋风格的 Callout 提示卡片。
 *
 * 支持：
 * - > [!NOTE] 或 > [!NOTE] 自定义标题
 * - > [!TIP]
 * - > [!IMPORTANT]
 * - > [!WARNING]
 * - > [!CAUTION]
 */
export function rehypeAlertCallouts() {
  return (tree: any) => {
    visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
      if (node.tagName !== 'blockquote' || !parent || typeof index !== 'number') return;

      // 寻找首个有效子标签（通常为 <p>）
      let firstPIndex = -1;
      let firstP: any = null;
      for (let i = 0; i < (node.children || []).length; i++) {
        const child = node.children[i];
        if (child.type === 'element') {
          if (child.tagName === 'p') {
            firstP = child;
            firstPIndex = i;
          }
          break;
        }
      }

      if (!firstP || !Array.isArray(firstP.children) || firstP.children.length === 0) return;

      const firstTextNode = firstP.children[0];
      if (!firstTextNode || firstTextNode.type !== 'text' || typeof firstTextNode.value !== 'string') return;

      const match = ALERT_REGEX.exec(firstTextNode.value);
      if (!match) return;

      const rawType = match[1].toLowerCase();
      const meta = CALLOUT_REGISTRY[rawType] || {
        type: rawType as any,
        defaultTitle: rawType.toUpperCase(),
        iconPaths: CALLOUT_REGISTRY.note.iconPaths,
      };

      const customTitle = (match[2] || '').trim();
      const title = customTitle || meta.defaultTitle;
      const rest = match[3];

      // 处理第一段文本：若换行后有剩余文本，保留给正文；否则将该首行文本清除
      if (rest !== undefined && rest.trim().length > 0) {
        firstTextNode.value = rest;
      } else {
        firstP.children.shift();
        // 若该 <p> 不再包含任何内容，从 blockquote 中彻底剔除
        const hasRemainingContent = firstP.children.some(
          (c: any) => c.type === 'element' || (c.type === 'text' && c.value.trim().length > 0)
        );
        if (!hasRemainingContent) {
          node.children.splice(firstPIndex, 1);
        }
      }

      // 构建 aside.callout-card 结构
      const calloutCard = {
        type: 'element',
        tagName: 'aside',
        properties: {
          className: ['callout-card', `callout-${rawType}`],
          'data-callout': rawType,
          role: 'note',
        },
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['callout-header'] },
            children: [
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['callout-icon'], 'aria-hidden': 'true' },
                children: [buildIconElement(meta)],
              },
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['callout-title'] },
                children: [{ type: 'text', value: title }],
              },
            ],
          },
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['callout-body'] },
            children: node.children,
          },
        ],
      };

      parent.children[index] = calloutCard;
    });
  };
}
