/**
 * markdownShortcuts.ts — 为 Textarea 提供 Markdown 快速格式化与快捷键支持
 *
 * 支持快捷键：
 * - ⌘/Ctrl + B: 粗体 (**文字**)
 * - ⌘/Ctrl + I: 斜体 (*文字*)
 * - ⌘/Ctrl + E / ⌘/Ctrl + `: 行内代码 (`code`)
 * - ⌘/Ctrl + K: 插入链接 ([文字](url))
 * - ⌘/Ctrl + Shift + K: 代码块 (```\n代码\n```)
 * - ⌘/Ctrl + Shift + X: 删除线 (~~文字~~)
 * - ⌘/Ctrl + Q: 引用块 (> 文字)
 * - ⌘/Ctrl + Enter: 保存
 * - Esc: 取消 / 退出
 */

export interface MarkdownToolAction {
  id: string;
  label: string;
  title: string;
  icon?: string;
  prefix: string;
  suffix?: string;
  defaultText?: string;
  block?: boolean;
}

export const MARKDOWN_TOOLS: MarkdownToolAction[] = [
  { id: 'bold', label: 'B', title: '加粗 (Ctrl/Cmd + B)', prefix: '**', suffix: '**', defaultText: '加粗文字' },
  { id: 'italic', label: 'I', title: '斜体 (Ctrl/Cmd + I)', prefix: '*', suffix: '*', defaultText: '斜体文字' },
  { id: 'code', label: '<>', title: '行内代码 (Ctrl/Cmd + E)', prefix: '`', suffix: '`', defaultText: '代码' },
  { id: 'codeblock', label: '```', title: '代码块 (Ctrl/Cmd + Shift + K)', prefix: '```\n', suffix: '\n```', defaultText: '代码内容', block: true },
  { id: 'quote', label: '”', title: '引用 (Ctrl/Cmd + Q)', prefix: '> ', suffix: '', defaultText: '引用内容', block: true },
  { id: 'link', label: '🔗', title: '链接 (Ctrl/Cmd + K)', prefix: '[', suffix: '](url)', defaultText: '链接文字' },
];

/**
 * 在 textarea 选区两侧智能包裹 Markdown 定界符；若已包裹则反向解开（Toggle）。
 */
export function wrapTextareaSelection(
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix = prefix,
  defaultText = '',
  block = false
): void {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const value = textarea.value;
  const selected = value.slice(start, end);

  // 1. 如果当前选区已被相同的 prefix/suffix 包裹，执行反向解包 (Toggle unwrap)
  const hasPrefix = value.slice(Math.max(0, start - prefix.length), start) === prefix;
  const hasSuffix = value.slice(end, end + suffix.length) === suffix;

  if (hasPrefix && hasSuffix) {
    const before = value.slice(0, start - prefix.length);
    const middle = selected;
    const after = value.slice(end + suffix.length);
    textarea.value = before + middle + after;
    textarea.selectionStart = start - prefix.length;
    textarea.selectionEnd = end - prefix.length;
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // 2. 块级标记包裹（如代码块、引用）
  if (block) {
    const isLineStart = start === 0 || value[start - 1] === '\n';
    const actualPrefix = isLineStart ? prefix : `\n${prefix}`;
    const actualSuffix = suffix ? (suffix.startsWith('\n') ? suffix : `\n${suffix}`) : '';
    const textToInsert = selected || defaultText;
    const replacement = `${actualPrefix}${textToInsert}${actualSuffix}`;

    const before = value.slice(0, start);
    const after = value.slice(end);
    textarea.value = before + replacement + after;

    textarea.focus();
    if (selected) {
      textarea.selectionStart = start + actualPrefix.length;
      textarea.selectionEnd = start + actualPrefix.length + selected.length;
    } else {
      textarea.selectionStart = start + actualPrefix.length;
      textarea.selectionEnd = start + actualPrefix.length + defaultText.length;
    }
  } else {
    // 3. 行内标记包裹（加粗、斜体、行内代码、链接等）
    const textToInsert = selected || defaultText;
    const replacement = `${prefix}${textToInsert}${suffix}`;
    const before = value.slice(0, start);
    const after = value.slice(end);
    textarea.value = before + replacement + after;

    textarea.focus();
    if (selected) {
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = start + prefix.length + selected.length;
    } else {
      const cursor = start + prefix.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor + defaultText.length;
    }
  }

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * 监听并处理 Textarea 中的快捷键。返回 true 表示消耗了该事件。
 */
export function handleMarkdownKeydown(
  e: KeyboardEvent,
  textarea: HTMLTextAreaElement,
  onSave?: () => void,
  onCancel?: () => void
): boolean {
  const isMod = e.metaKey || e.ctrlKey;

  // ⌘/Ctrl + Enter 保存
  if (isMod && e.key === 'Enter') {
    e.preventDefault();
    onSave?.();
    return true;
  }

  // Esc 取消
  if (e.key === 'Escape' && !isMod && !e.shiftKey && !e.altKey) {
    if (onCancel) {
      e.preventDefault();
      onCancel();
      return true;
    }
  }

  if (!isMod) return false;

  const key = e.key.toLowerCase();

  // ⌘/Ctrl + B -> 加粗
  if (key === 'b' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    wrapTextareaSelection(textarea, '**', '**', '加粗文字');
    return true;
  }

  // ⌘/Ctrl + I -> 斜体
  if (key === 'i' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    wrapTextareaSelection(textarea, '*', '*', '斜体文字');
    return true;
  }

  // ⌘/Ctrl + E 或 ⌘/Ctrl + ` -> 行内代码
  if ((key === 'e' && !e.shiftKey && !e.altKey) || e.key === '`') {
    e.preventDefault();
    wrapTextareaSelection(textarea, '`', '`', '代码');
    return true;
  }

  // ⌘/Ctrl + Shift + K 或 ⌘/Ctrl + Alt + C -> 围栏代码块
  if ((key === 'k' && e.shiftKey) || (key === 'c' && e.altKey)) {
    e.preventDefault();
    wrapTextareaSelection(textarea, '```\n', '\n```', '代码内容', true);
    return true;
  }

  // ⌘/Ctrl + K (非 Shift) -> 链接
  if (key === 'k' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = textarea.value.slice(start, end).trim();
    if (selected.startsWith('http://') || selected.startsWith('https://')) {
      wrapTextareaSelection(textarea, '[链接描述](', ')', selected);
    } else {
      wrapTextareaSelection(textarea, '[', '](https://)', selected || '链接文字');
    }
    return true;
  }

  // ⌘/Ctrl + Shift + X -> 删除线
  if (key === 'x' && e.shiftKey) {
    e.preventDefault();
    wrapTextareaSelection(textarea, '~~', '~~', '删除线文字');
    return true;
  }

  // ⌘/Ctrl + Q -> 引用
  if (key === 'q' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    wrapTextareaSelection(textarea, '> ', '', '引用内容', true);
    return true;
  }

  return false;
}

/**
 * 创建轻量精致的 Markdown 工具条 DOM 元素
 */
export function createMarkdownToolbar(textarea: HTMLTextAreaElement): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'md-quick-toolbar';

  MARKDOWN_TOOLS.forEach((tool) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `md-tool-btn md-tool-${tool.id}`;
    btn.textContent = tool.label;
    btn.title = tool.title;
    btn.setAttribute('aria-label', tool.title);
    btn.tabIndex = -1; // 避免 Tab 导航打断 textarea 流程
    btn.addEventListener('mousedown', (e) => {
      // 阻止 mousedown 导致 textarea 失去焦点与选区
      e.preventDefault();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrapTextareaSelection(textarea, tool.prefix, tool.suffix ?? tool.prefix, tool.defaultText ?? '', tool.block ?? false);
    });
    bar.appendChild(btn);
  });

  return bar;
}
