import { visit } from 'unist-util-visit';

/**
 * 给正文表格套一层滚动容器。
 *
 * 直接对 <table> 用 display:block + overflow 会破坏原生表格布局（列宽不按内容分配、
 * 最后一列容易被挤成超长单行）；这里让 table 保持 table 布局，超宽时由外层横向滚动。
 */
export function rehypeTableScroll() {
  return (tree: any) => {
    const tables: Array<{ parent: any; index: number; node: any }> = [];

    visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
      if (node.tagName === 'table' && parent && typeof index === 'number') {
        tables.push({ parent, index, node });
      }
    });

    for (const { parent, index, node } of tables) {
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-scroll'], tabIndex: 0 },
        children: [node],
      };
    }
  };
}
