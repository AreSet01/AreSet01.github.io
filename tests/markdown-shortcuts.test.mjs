import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  wrapTextareaSelection,
  handleMarkdownKeydown,
  createMarkdownToolbar,
  MARKDOWN_TOOLS,
} from '../src/utils/markdownShortcuts.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;

test('wrapTextareaSelection wraps selected text in bold and toggles to unwrap', () => {
  const textarea = document.createElement('textarea');
  textarea.value = 'hello world';
  textarea.selectionStart = 6;
  textarea.selectionEnd = 11; // 'world'

  wrapTextareaSelection(textarea, '**', '**', '加粗文字');
  assert.equal(textarea.value, 'hello **world**');
  assert.equal(textarea.selectionStart, 8);
  assert.equal(textarea.selectionEnd, 13);

  // Toggle unwrap when cursor is on the wrapped selection
  wrapTextareaSelection(textarea, '**', '**', '加粗文字');
  assert.equal(textarea.value, 'hello world');
  assert.equal(textarea.selectionStart, 6);
  assert.equal(textarea.selectionEnd, 11);
});

test('wrapTextareaSelection inserts default text when selection is empty', () => {
  const textarea = document.createElement('textarea');
  textarea.value = '';
  textarea.selectionStart = 0;
  textarea.selectionEnd = 0;

  wrapTextareaSelection(textarea, '`', '`', 'code');
  assert.equal(textarea.value, '`code`');
  assert.equal(textarea.selectionStart, 1);
  assert.equal(textarea.selectionEnd, 5);
});

test('handleMarkdownKeydown handles Ctrl+B, Ctrl+I, Ctrl+Enter, Esc', () => {
  const textarea = document.createElement('textarea');
  textarea.value = '测试文本';
  textarea.selectionStart = 0;
  textarea.selectionEnd = 2; // '测试'

  let saved = false;
  let cancelled = false;

  // 1. Ctrl+B
  const boldEvent = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true });
  const handledB = handleMarkdownKeydown(boldEvent, textarea, () => { saved = true; }, () => { cancelled = true; });
  assert.equal(handledB, true);
  assert.equal(textarea.value, '**测试**文本');

  // 2. Ctrl+Enter
  const saveEvent = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true });
  const handledSave = handleMarkdownKeydown(saveEvent, textarea, () => { saved = true; }, () => { cancelled = true; });
  assert.equal(handledSave, true);
  assert.equal(saved, true);

  // 3. Escape
  const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  const handledEsc = handleMarkdownKeydown(escEvent, textarea, () => { saved = true; }, () => { cancelled = true; });
  assert.equal(handledEsc, true);
  assert.equal(cancelled, true);
});

test('createMarkdownToolbar creates all quick action buttons', () => {
  const textarea = document.createElement('textarea');
  const bar = createMarkdownToolbar(textarea);
  assert.ok(bar.classList.contains('md-quick-toolbar'));
  const buttons = bar.querySelectorAll('button');
  assert.equal(buttons.length, MARKDOWN_TOOLS.length);

  // Click bold button
  textarea.value = '快捷键';
  textarea.selectionStart = 0;
  textarea.selectionEnd = 3;
  const boldBtn = bar.querySelector('.md-tool-bold');
  assert.ok(boldBtn);
  boldBtn.click();
  assert.equal(textarea.value, '**快捷键**');
});
