// inkAskStorage.ts — 墨问 AI 对话持久化与历史会话管理器
// 1. 每篇文章按 slug 隔离存储对话流，无缝续接历史交流；
// 2. 支持「活跃会话」与「多会话归档」，可在抽屉历史面板中切换、重温或删除；
// 3. 追问时提供最近 2~3 轮上下文消息，支持多轮深度探讨；
// 4. 智能容量防护：单会话上限 30 轮，单文章上限 10 组历史会话，超额安全修剪防御 localStorage 爆仓。

export interface AskTurn {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
  cached?: boolean;
  selection?: string;
}

export interface AskSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: AskTurn[];
}

export interface ArticleAskStore {
  activeSessionId: string;
  sessions: AskSession[];
}

export const MAX_TURNS_PER_SESSION = 30;
export const MAX_SESSIONS_PER_ARTICLE = 10;
const STORAGE_PREFIX = 'areSet_ink_ask_';

function generateId(): string {
  return 'ask_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/**
 * 格式化文章路径为标准干净的 storage 键名
 */
export function getStorageKey(pathname?: string): string {
  const p = pathname || (typeof location !== 'undefined' ? location.pathname : '');
  const cleanSlug = (p || '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\//g, '_');
  return `${STORAGE_PREFIX}${cleanSlug || 'default'}`;
}

function createEmptySession(title = '伴读对话'): AskSession {
  const now = Date.now();
  return {
    id: generateId(),
    title,
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

function createInitialStore(): ArticleAskStore {
  const session = createEmptySession();
  return {
    activeSessionId: session.id,
    sessions: [session],
  };
}

/**
 * 从 localStorage 安全加载指定文章的对话数据
 */
export function loadArticleAskStore(pathname?: string): ArticleAskStore {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createInitialStore();
  }

  const key = getStorageKey(pathname);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return createInitialStore();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
      return createInitialStore();
    }

    // 结构校验与修正
    const sessions: AskSession[] = [];
    for (const s of parsed.sessions) {
      if (s && typeof s === 'object' && typeof s.id === 'string') {
        const turns = Array.isArray(s.turns)
          ? s.turns
              .filter((t: any) => t && typeof t.question === 'string')
              .map((t: any) => ({
                id: typeof t.id === 'string' ? t.id : generateId(),
                question: String(t.question || ''),
                answer: String(t.answer || ''),
                timestamp: Number(t.timestamp) || Date.now(),
                cached: Boolean(t.cached),
                selection: typeof t.selection === 'string' ? t.selection : undefined,
              }))
          : [];

        sessions.push({
          id: s.id,
          title: typeof s.title === 'string' && s.title.trim() ? s.title.trim() : '伴读对话',
          createdAt: Number(s.createdAt) || Date.now(),
          updatedAt: Number(s.updatedAt) || Date.now(),
          turns: turns.slice(-MAX_TURNS_PER_SESSION),
        });
      }
    }

    if (sessions.length === 0) return createInitialStore();

    let activeSessionId = typeof parsed.activeSessionId === 'string' ? parsed.activeSessionId : '';
    if (!sessions.some((s) => s.id === activeSessionId)) {
      activeSessionId = sessions[0].id;
    }

    return {
      activeSessionId,
      sessions,
    };
  } catch (err) {
    console.warn('[inkAskStorage] Failed to parse stored history:', err);
    return createInitialStore();
  }
}

/**
 * 将对话数据安全写入 localStorage，内置防爆仓修剪机制
 */
export function saveArticleAskStore(pathname: string | undefined, store: ArticleAskStore): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const key = getStorageKey(pathname);

  // 1. 约束单文章会话总数与单会话轮数
  let prunedSessions = store.sessions.map((s) => ({
    ...s,
    turns: s.turns.slice(-MAX_TURNS_PER_SESSION),
  }));

  if (prunedSessions.length > MAX_SESSIONS_PER_ARTICLE) {
    // 保留活跃会话，修剪最旧的非活跃会话
    const active = prunedSessions.find((s) => s.id === store.activeSessionId);
    const nonActive = prunedSessions.filter((s) => s.id !== store.activeSessionId);
    nonActive.sort((a, b) => b.updatedAt - a.updatedAt);
    const keepCount = active ? MAX_SESSIONS_PER_ARTICLE - 1 : MAX_SESSIONS_PER_ARTICLE;
    const kept = nonActive.slice(0, keepCount);
    prunedSessions = active ? [active, ...kept] : kept;
    prunedSessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const payload: ArticleAskStore = {
    activeSessionId: store.activeSessionId,
    sessions: prunedSessions,
  };

  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (err: any) {
    // 捕获 QuotaExceededError：尝试修剪最旧的历史会话后再次写入
    if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) {
      console.warn('[inkAskStorage] Storage quota exceeded, trimming old sessions...');
      try {
        if (payload.sessions.length > 1) {
          payload.sessions = payload.sessions.filter((s) => s.id === payload.activeSessionId);
          window.localStorage.setItem(key, JSON.stringify(payload));
        }
      } catch (innerErr) {
        console.warn('[inkAskStorage] Failed to save even after trimming:', innerErr);
      }
    } else {
      console.warn('[inkAskStorage] Failed to save ask history:', err);
    }
  }
}

/**
 * 获取当前文章的活跃会话
 */
export function getActiveSession(pathname?: string): AskSession {
  const store = loadArticleAskStore(pathname);
  let active = store.sessions.find((s) => s.id === store.activeSessionId);
  if (!active) {
    active = store.sessions[0] || createEmptySession();
    store.activeSessionId = active.id;
    saveArticleAskStore(pathname, store);
  }
  return active;
}

/**
 * 格式化会话标题（取首问前 20 字）
 */
function deriveSessionTitle(question: string): string {
  const clean = question.replace(/^[\s#*`>—\-–\d.、，。！？]+/, '').trim();
  if (!clean) return '伴读探讨';
  return clean.length > 20 ? `${clean.slice(0, 20)}…` : clean;
}

/**
 * 向当前活跃会话追加一轮提问（若标题为默认值则自动用水墨首问命名）
 */
export function appendTurn(
  pathname: string | undefined,
  turnData: { question: string; answer?: string; selection?: string; cached?: boolean; id?: string },
): AskTurn {
  const store = loadArticleAskStore(pathname);
  let session = store.sessions.find((s) => s.id === store.activeSessionId);
  if (!session) {
    session = createEmptySession();
    store.sessions.unshift(session);
    store.activeSessionId = session.id;
  }

  const now = Date.now();
  const turn: AskTurn = {
    id: turnData.id || generateId(),
    question: turnData.question,
    answer: turnData.answer || '',
    timestamp: now,
    cached: Boolean(turnData.cached),
    selection: turnData.selection,
  };

  // 首问命名会话
  if (session.turns.length === 0 || session.title === '伴读对话' || session.title === '新会话') {
    session.title = deriveSessionTitle(turnData.question);
  }

  session.turns.push(turn);
  if (session.turns.length > MAX_TURNS_PER_SESSION) {
    session.turns = session.turns.slice(-MAX_TURNS_PER_SESSION);
  }
  session.updatedAt = now;

  saveArticleAskStore(pathname, store);
  return turn;
}

/**
 * 更新活跃会话中指定轮次的回答文字与状态
 */
export function updateActiveTurnAnswer(
  pathname: string | undefined,
  turnId: string,
  answer: string,
  opts?: { cached?: boolean },
): void {
  const store = loadArticleAskStore(pathname);
  const session = store.sessions.find((s) => s.id === store.activeSessionId);
  if (!session) return;

  const target = session.turns.find((t) => t.id === turnId);
  if (target) {
    target.answer = answer;
    if (opts?.cached !== undefined) target.cached = opts.cached;
    session.updatedAt = Date.now();
    saveArticleAskStore(pathname, store);
  }
}

/**
 * 撤回或移除某轮提问
 */
export function removeTurn(pathname: string | undefined, turnId: string): void {
  const store = loadArticleAskStore(pathname);
  const session = store.sessions.find((s) => s.id === store.activeSessionId);
  if (!session) return;

  const idx = session.turns.findIndex((t) => t.id === turnId);
  if (idx !== -1) {
    session.turns.splice(idx, 1);
    session.updatedAt = Date.now();
    if (session.turns.length === 0) {
      session.title = '伴读对话';
    }
    saveArticleAskStore(pathname, store);
  }
}

/**
 * 新开对话：将当前会话归档，并生成一个新的空白活跃会话
 */
export function archiveAndNewSession(pathname?: string): AskSession {
  const store = loadArticleAskStore(pathname);
  const currentActive = store.sessions.find((s) => s.id === store.activeSessionId);

  // 如果当前会话本来就是空的，无需创建多余的空会话，直接复用
  if (currentActive && currentActive.turns.length === 0) {
    return currentActive;
  }

  const newSession = createEmptySession('新会话');
  store.sessions.unshift(newSession);
  store.activeSessionId = newSession.id;

  saveArticleAskStore(pathname, store);
  return newSession;
}

/**
 * 切换到指定历史会话
 */
export function switchActiveSession(pathname: string | undefined, sessionId: string): AskSession | null {
  const store = loadArticleAskStore(pathname);
  const target = store.sessions.find((s) => s.id === sessionId);
  if (!target) return null;

  store.activeSessionId = target.id;
  target.updatedAt = Date.now();
  saveArticleAskStore(pathname, store);
  return target;
}

/**
 * 删除指定会话
 */
export function deleteSession(pathname: string | undefined, sessionId: string): AskSession {
  const store = loadArticleAskStore(pathname);
  const filtered = store.sessions.filter((s) => s.id !== sessionId);

  if (filtered.length === 0) {
    const fresh = createEmptySession();
    store.sessions = [fresh];
    store.activeSessionId = fresh.id;
  } else {
    store.sessions = filtered;
    if (store.activeSessionId === sessionId) {
      store.activeSessionId = filtered[0].id;
    }
  }

  saveArticleAskStore(pathname, store);
  return store.sessions.find((s) => s.id === store.activeSessionId)!;
}

/**
 * 清空当前文章的所有历史会话
 */
export function clearAllSessions(pathname?: string): AskSession {
  const initial = createInitialStore();
  saveArticleAskStore(pathname, initial);
  return initial.sessions[0];
}

/**
 * 提取最近几轮问答作为上下文给模型传递（仅返回已生成完毕的问答对）
 */
export function getRecentHistoryMessages(
  pathname: string | undefined,
  maxTurns = 3,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const session = getActiveSession(pathname);
  const completed = session.turns.filter((t) => t.question && t.answer.trim());
  const recentTurns = completed.slice(-maxTurns);

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const turn of recentTurns) {
    messages.push({ role: 'user', content: turn.question.trim() });
    messages.push({ role: 'assistant', content: turn.answer.trim() });
  }
  return messages;
}

/**
 * 格式化相对时间（如“刚刚”、“10分钟前”、“昨天”、“10月29日”）
 */
export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '刚刚';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 86400_000 * 2) return '昨天';

  const d = new Date(timestamp);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
}
