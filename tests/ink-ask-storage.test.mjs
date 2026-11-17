import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getStorageKey,
  loadArticleAskStore,
  saveArticleAskStore,
  getActiveSession,
  appendTurn,
  updateActiveTurnAnswer,
  removeTurn,
  archiveAndNewSession,
  switchActiveSession,
  deleteSession,
  clearAllSessions,
  getRecentHistoryMessages,
  formatRelativeTime,
  MAX_TURNS_PER_SESSION,
  MAX_SESSIONS_PER_ARTICLE,
} from '../src/utils/inkAskStorage.ts';

// 模拟浏览器 localStorage 环境
function mockLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test('inkAskStorage: 键名规范化与文章隔离', () => {
  assert.equal(getStorageKey('/posts/ue5-coroutine/'), 'areSet_ink_ask_posts_ue5-coroutine');
  assert.equal(getStorageKey('/posts/ue5-coroutine'), 'areSet_ink_ask_posts_ue5-coroutine');
  assert.equal(getStorageKey('posts/ue5-coroutine?query=1#section'), 'areSet_ink_ask_posts_ue5-coroutine');
  assert.equal(getStorageKey(''), 'areSet_ink_ask_default');
});

test('inkAskStorage: 会话增删改查与多轮上下文提取', () => {
  global.window = { localStorage: mockLocalStorage() };

  const path = '/posts/demo/';
  const active = getActiveSession(path);
  assert.ok(active.id);
  assert.equal(active.turns.length, 0);

  // 追加第 1 轮提问
  const turn1 = appendTurn(path, {
    question: '这篇文章的核心要点是什么？',
    answer: '本文主要介绍了水墨伴读的设计理念与实现。',
  });
  assert.ok(turn1.id);
  assert.equal(turn1.question, '这篇文章的核心要点是什么？');

  const after1 = getActiveSession(path);
  assert.equal(after1.turns.length, 1);
  assert.equal(after1.title, '这篇文章的核心要点是什么？');

  // 追加第 2 轮追问
  const turn2 = appendTurn(path, {
    question: '追问：那它如何保证离线存储的安全？',
  });
  updateActiveTurnAnswer(path, turn2.id, '它通过 localStorage 本地持久化与防爆仓修剪实现。');

  const after2 = getActiveSession(path);
  assert.equal(after2.turns.length, 2);
  assert.equal(after2.turns[1].answer, '它通过 localStorage 本地持久化与防爆仓修剪实现。');

  // 验证多轮上下文提取 (getRecentHistoryMessages)
  const history = getRecentHistoryMessages(path, 3);
  assert.equal(history.length, 4); // 2 轮 * 2 (user + assistant)
  assert.equal(history[0].role, 'user');
  assert.equal(history[0].content, '这篇文章的核心要点是什么？');
  assert.equal(history[1].role, 'assistant');
  assert.equal(history[2].role, 'user');
  assert.equal(history[2].content, '追问：那它如何保证离线存储的安全？');
  assert.equal(history[3].role, 'assistant');

  // 撤回提问 (removeTurn)
  removeTurn(path, turn2.id);
  const afterRemove = getActiveSession(path);
  assert.equal(afterRemove.turns.length, 1);
  assert.equal(afterRemove.turns[0].id, turn1.id);
});

test('inkAskStorage: 新开对话与归档多会话切换', () => {
  global.window = { localStorage: mockLocalStorage() };
  const path = '/posts/archive-test/';

  appendTurn(path, {
    question: '会话 1 的首个问题',
    answer: '会话 1 的回答',
  });

  const session1 = getActiveSession(path);
  assert.equal(session1.title, '会话 1 的首个问题');

  // 新开对话归档
  const session2 = archiveAndNewSession(path);
  assert.notEqual(session1.id, session2.id);
  assert.equal(session2.turns.length, 0);

  appendTurn(path, {
    question: '会话 2 的新问题',
    answer: '会话 2 的回答',
  });

  const store = loadArticleAskStore(path);
  assert.equal(store.sessions.length, 2);
  assert.equal(store.activeSessionId, session2.id);

  // 切换回会话 1
  switchActiveSession(path, session1.id);
  const current = getActiveSession(path);
  assert.equal(current.id, session1.id);
  assert.equal(current.turns[0].question, '会话 1 的首个问题');

  // 删除会话 2
  deleteSession(path, session2.id);
  const storeAfterDelete = loadArticleAskStore(path);
  assert.equal(storeAfterDelete.sessions.length, 1);

  // 清空所有会话
  clearAllSessions(path);
  const storeAfterClear = loadArticleAskStore(path);
  assert.equal(storeAfterClear.sessions.length, 1);
  assert.equal(storeAfterClear.sessions[0].turns.length, 0);
});

test('inkAskStorage: 智能防爆仓容量限制与修剪', () => {
  global.window = { localStorage: mockLocalStorage() };
  const path = '/posts/capacity-test/';

  // 1. 测试单会话 MAX_TURNS_PER_SESSION 截断
  for (let i = 0; i < MAX_TURNS_PER_SESSION + 5; i++) {
    appendTurn(path, {
      question: `问题 ${i}`,
      answer: `回答 ${i}`,
    });
  }
  const session = getActiveSession(path);
  assert.equal(session.turns.length, MAX_TURNS_PER_SESSION);
  assert.equal(session.turns[MAX_TURNS_PER_SESSION - 1].question, `问题 ${MAX_TURNS_PER_SESSION + 4}`);

  // 2. 测试单文章 MAX_SESSIONS_PER_ARTICLE 截断
  for (let s = 0; s < MAX_SESSIONS_PER_ARTICLE + 5; s++) {
    archiveAndNewSession(path);
    appendTurn(path, {
      question: `多会话归档提问 ${s}`,
      answer: `归档回答 ${s}`,
    });
  }
  const store = loadArticleAskStore(path);
  assert.ok(store.sessions.length <= MAX_SESSIONS_PER_ARTICLE);
});
