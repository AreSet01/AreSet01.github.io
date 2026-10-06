// 划词问答服务：替浏览器持有 API key，把「文章里选中的一段」交给模型解释，答案以 SSE 流式转回。
// 零依赖，Node >= 20.12。配置见 server/ask.env.example，部署见 server/README.md。
//
//   GET  /api/ask  → {"ok":true}（前端探测功能是否可用）
//   POST /api/ask  ← {"path":"/posts/x/","selection":"…","prefix":"选区前几十字","suffix":"选区后几十字","question":"可选的追问"}
//                  → text/event-stream：{"d":"文字"} … {"done":true} | {"error":"…"}

import http from 'node:http';
import { createHash, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// systemd 通过 EnvironmentFile 直接给环境变量；本地调试则读同目录的 ask.env（不存在就算了）
try {
  process.loadEnvFile(process.env.ASK_ENV_FILE || path.join(HERE, 'ask.env'));
} catch {}

const positive = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const config = {
  baseUrl: (process.env.AI_BASE_URL || '').trim().replace(/\/+$/, ''),
  apiKey: (process.env.AI_API_KEY || '').trim(),
  model: (process.env.AI_MODEL || '').trim(),
  maxTokens: positive('AI_MAX_TOKENS', 2048),
  temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : undefined,
  siteName: process.env.ASK_SITE_NAME || '梦付千秋',
  siteDir: path.resolve(HERE, process.env.ASK_SITE_DIR || '../dist'),
  cacheFile: process.env.ASK_CACHE_FILE ? path.resolve(HERE, process.env.ASK_CACHE_FILE) : '',
  host: process.env.ASK_HOST || '127.0.0.1',
  port: positive('ASK_PORT', 8787),
  perMinute: positive('ASK_RATE_PER_MIN', 6),
  perDay: positive('ASK_RATE_PER_DAY', 60),
  dailyLimit: positive('ASK_DAILY_LIMIT', 800),
  maxConcurrent: positive('ASK_MAX_CONCURRENT', 12),
};

const resolveConfigFile = () => {
  if (process.env.ASK_CONFIG_FILE) return path.resolve(HERE, process.env.ASK_CONFIG_FILE);
  if (process.platform === 'linux' && existsSync('/var/lib/blog-ask')) {
    return '/var/lib/blog-ask/runtime-config.json';
  }
  return path.resolve(HERE, 'runtime-config.json');
};
const CONFIG_FILE = resolveConfigFile();

function applyRuntimeConfig() {
  if (!CONFIG_FILE || !existsSync(CONFIG_FILE)) return;
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf8');
    const saved = JSON.parse(raw);
    if (typeof saved.baseUrl === 'string') config.baseUrl = saved.baseUrl.trim().replace(/\/+$/, '');
    if (typeof saved.apiKey === 'string') config.apiKey = saved.apiKey.trim();
    if (typeof saved.model === 'string') config.model = saved.model.trim();
    if (Number.isFinite(saved.maxTokens) && saved.maxTokens > 0) config.maxTokens = saved.maxTokens;
    if (saved.temperature !== undefined) {
      config.temperature = saved.temperature === null || saved.temperature === '' ? undefined : Number(saved.temperature);
    }
    if (Number.isFinite(saved.perMinute) && saved.perMinute > 0) config.perMinute = saved.perMinute;
    if (Number.isFinite(saved.perDay) && saved.perDay > 0) config.perDay = saved.perDay;
    if (Number.isFinite(saved.dailyLimit) && saved.dailyLimit > 0) config.dailyLimit = saved.dailyLimit;
    if (Number.isFinite(saved.maxConcurrent) && saved.maxConcurrent > 0) config.maxConcurrent = saved.maxConcurrent;
  } catch (err) {
    console.error('[ask] failed to read runtime config:', err.message);
  }
}
applyRuntimeConfig();

let configured = Boolean(config.baseUrl && config.apiKey && config.model);

function persistRuntimeConfig(updated) {
  if (typeof updated.baseUrl === 'string') config.baseUrl = updated.baseUrl.trim().replace(/\/+$/, '');
  if (typeof updated.apiKey === 'string' && updated.apiKey.trim()) config.apiKey = updated.apiKey.trim();
  if (typeof updated.model === 'string') config.model = updated.model.trim();
  if (Number.isFinite(updated.maxTokens) && updated.maxTokens > 0) config.maxTokens = updated.maxTokens;
  if (updated.temperature !== undefined) {
    config.temperature = (updated.temperature === null || updated.temperature === '') ? undefined : Number(updated.temperature);
  }
  if (Number.isFinite(updated.perMinute) && updated.perMinute > 0) config.perMinute = updated.perMinute;
  if (Number.isFinite(updated.perDay) && updated.perDay > 0) config.perDay = updated.perDay;
  if (Number.isFinite(updated.dailyLimit) && updated.dailyLimit > 0) config.dailyLimit = updated.dailyLimit;
  if (Number.isFinite(updated.maxConcurrent) && updated.maxConcurrent > 0) config.maxConcurrent = updated.maxConcurrent;

  configured = Boolean(config.baseUrl && config.apiKey && config.model);

  const payload = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature ?? null,
    perMinute: config.perMinute,
    perDay: config.perDay,
    dailyLimit: config.dailyLimit,
    maxConcurrent: config.maxConcurrent,
    updatedAt: new Date().toISOString(),
  };

  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    throw new Error(`无法写入配置文件: ${err.message}`);
  }
}

// ---------- 管理密码与安全校验 ----------
const ADMIN_PASSWORD_HASH = (process.env.ADMIN_PASSWORD_HASH || '').trim().toLowerCase();
const SESSION_SECRET = randomBytes(32).toString('hex');

function createSessionToken() {
  const exp = Date.now() + 24 * 3600 * 1000; // 24小时有效
  const salt = randomBytes(8).toString('hex');
  const payload = `${exp}.${salt}`;
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expStr, salt, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expectedSig = createHmac('sha256', SESSION_SECRET).update(`${expStr}.${salt}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}

const loginAttempts = new Map(); // ip -> { count, lockedUntil }
function checkLoginAttempt(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (record && record.lockedUntil > now) {
    const waitSec = Math.ceil((record.lockedUntil - now) / 1000);
    return `密码输错次数过多，请在 ${waitSec} 秒后再试`;
  }
  return null;
}
function recordLoginFailure(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = now + 5 * 60 * 1000; // 锁定5分钟
    record.count = 0;
  }
  loginAttempts.set(ip, record);
}
function recordLoginSuccess(ip) {
  loginAttempts.delete(ip);
}

function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

const LIMITS = { selection: 400, question: 120, anchor: 64, body: 8 * 1024 };
const IDLE_TIMEOUT_MS = 60_000; // 思考型模型首字可能很慢，但一分钟没有任何字节就放弃
const HEARTBEAT_MS = 15_000; // 让 nginx 和浏览器知道连接还活着

const log = (...args) => console.log(new Date().toISOString(), '[ask]', ...args);

// ---------- 文章文本：从构建产物里读，用来核对选区、取上下文 ----------

const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'table', 'thead',
  'tbody', 'tr', 'td', 'th', 'section', 'header', 'footer', 'nav', 'details', 'summary', 'figure',
  'figcaption', 'dl', 'dt', 'dd', 'hr', 'br', 'article', 'aside', 'main', 'form', 'label',
]);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', times: '×' };

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });

// 核对时忽略空白与大小写：浏览器的 selection.toString() 和 HTML 源里的换行、缩进对不上
const INVISIBLE = /[\s​-‍⁠﻿]/;
const normalize = (s) => s.replace(/[\s​-‍⁠﻿]+/g, '').toLowerCase();

const tidy = (s) =>
  s.replace(/\r/g, '').replace(/[ \t\f\v ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function extractPage(html) {
  const titleHtml = /<h1[^>]*data-post-title[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const title = tidy(decode(titleHtml.replace(/<[^>]*>/g, '')));

  // 只取正文 [data-post-prose]：前端也只允许在正文里划词，目录、评论区的字不该混进上下文
  const open = /<[^>]*\sdata-post-prose\b[^>]*>/.exec(html);
  const start = open ? open.index + open[0].length : 0;
  const ends = ['class="series-ends', '>Discussion<', '</article>']
    .map((marker) => html.indexOf(marker, start))
    .filter((index) => index > start);
  const body = html.slice(start, ends.length ? Math.min(...ends) : html.length)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // 按钮文字（Copy / Expand …）不是正文，前端取选区时同样会剔掉
    .replace(/<(script|style|svg|template|noscript|button)\b[\s\S]*?<\/\1\s*>/gi, ' ');

  const blocks = [];
  let buffer = '';
  let headingNext = false;
  let heading = '';
  const flush = () => {
    const text = tidy(decode(buffer));
    buffer = '';
    if (!text) return;
    if (headingNext) heading = text;
    headingNext = false;
    blocks.push({ text, norm: normalize(text), heading });
  };

  const token = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*>|([^<]+)|</g;
  for (let m; (m = token.exec(body)); ) {
    if (m[3] !== undefined) buffer += m[3];
    else if (m[2] === undefined) buffer += '<';
    else if (BLOCK_TAGS.has(m[2].toLowerCase())) {
      flush();
      if (!m[1] && /^h[1-6]$/i.test(m[2])) headingNext = true;
    }
  }
  flush();

  const offsets = [];
  let joined = '';
  for (const block of blocks) {
    offsets.push(joined.length);
    joined += block.norm;
  }
  return { title, blocks, offsets, joined };
}

const pages = new Map(); // file -> { mtimeMs, page }

async function loadPage(requestPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestPath).replace(/\/+$/, '');
  } catch {
    return null;
  }
  if (!/^\/posts\/[^?#]+$/.test(pathname)) return null;
  const postsDir = path.join(config.siteDir, 'posts');
  const file = path.resolve(config.siteDir, `.${pathname}`, 'index.html');
  if (!file.startsWith(postsDir + path.sep)) return null;

  let info;
  try {
    info = await stat(file);
  } catch {
    return null;
  }
  const cached = pages.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs) return { key: pathname, page: cached.page };

  const page = extractPage(await readFile(file, 'utf8'));
  pages.set(file, { mtimeMs: info.mtimeMs, page });
  if (pages.size > 64) pages.delete(pages.keys().next().value);
  return { key: pathname, page };
}

// 找到选区在文章里的位置。同一段文字可能出现多次（比如两段代码都以同一个宏开头），
// 所以前端还会带上选区前后各几十个字，先按「前文 + 选区 + 后文」整体去找
function locate(page, selectionNorm, prefix, suffix) {
  const before = normalize(prefix).slice(-32);
  const after = normalize(suffix).slice(0, 32);
  const attempts = [
    [before + selectionNorm + after, before.length],
    [selectionNorm + after, 0],
    [before + selectionNorm, before.length],
    [selectionNorm, 0],
  ];
  let pos = -1;
  for (const [needle, skip] of attempts) {
    const index = page.joined.indexOf(needle);
    if (index !== -1) {
      pos = index + skip;
      break;
    }
  }
  if (pos === -1) return null;

  const blockAt = (at) => {
    let lo = 0;
    let hi = page.offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (page.offsets[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return { pos, first: blockAt(pos), last: blockAt(pos + selectionNorm.length - 1) };
}

// 选区所在的段落，再向前后扩到约 700 字；太长（大段代码）就截取选区附近的一个窗口
function contextFor(page, loc, selectionLength) {
  const { blocks } = page;
  let from = loc.first;
  let to = loc.last;
  let size = 0;
  for (let i = from; i <= to; i++) size += blocks[i].text.length;
  while (size < 700 && (from > 0 || to < blocks.length - 1)) {
    if (from > 0) size += blocks[--from].text.length;
    if (size < 700 && to < blocks.length - 1) size += blocks[++to].text.length;
  }

  let text = blocks.slice(from, to + 1).map((block) => block.text).join('\n');
  if (text.length > 1600) {
    // 把「第 n 个可见字符」换算回 text 里的下标
    let remaining = loc.pos - page.offsets[from];
    let index = 0;
    while (index < text.length && (remaining > 0 || INVISIBLE.test(text[index]))) {
      if (!INVISIBLE.test(text[index])) remaining--;
      index++;
    }
    const left = Math.max(0, index - 700);
    const right = Math.min(text.length, index + selectionLength + 700);
    text = `${left > 0 ? '…' : ''}${text.slice(left, right)}${right < text.length ? '…' : ''}`;
  }
  return { text, heading: blocks[loc.first].heading };
}

function contextForArticle(page) {
  const headings = Array.from(new Set(page.blocks.map((b) => b.heading).filter(Boolean)));
  const outline = headings.length ? `主要小节大纲：\n- ${headings.join('\n- ')}` : '';
  const excerpt = page.blocks.slice(0, 12).map((b) => b.text).join('\n\n').slice(0, 1500);
  return {
    text: `${outline}\n\n文章正文内容精选：\n${excerpt}`,
    heading: '',
  };
}

// ---------- 提示词 ----------

const SYSTEM_PROMPT = `你是技术博客「${config.siteName}」的专属伴读助手，像一位懂技术、热心且风趣的技术老朋友。
读者正在阅读技术文章，请结合文章上下文，用通俗生动、接地气的大白话解答读者的疑问。

回答准则：
1. 【深入浅出，通俗好懂】：拒绝干瘪冰冷的说教和生硬堆砌的专业术语。第一句话先用大白话或生动贴切的生活比喻点透本质（“它其实就像...”），让读者一秒抓住核心；然后再娓娓道来背后的原理。
2. 【紧扣技术与文章场景】：紧密结合文章实际语境（如 UE5、C++ 游戏引擎底层等），讲清楚它在这里扮演什么角色、解决什么痛点、为什么要这么写。
3. 【排版清晰有条理】：用精炼语言组织，善用加粗关键结论、\`行内代码\`、精简列表。严格遵守 Markdown 规范：加粗符号 ** 紧贴文字内容，内侧严禁带空格（例如 **结论**，勿写成 ** 结论 **）；反引号代码与加粗组合时写为 **\`Code\`**。
4. 【亲切自然老友风】：语气真诚温和，不掉书袋，不讲官话。读者追问时直击要害，解答透彻。
5. 【专注阅读】：紧扣所选内容与当前文章技术主题，礼貌拒绝完全无关的非技术闲聊。`;

function buildMessages({ title, context, selection, question, previous, isArticleChat }) {
  const base = isArticleChat
    ? [
        `文章：《${title}》`,
        `文章核心大纲与内容精要：\n"""\n${context.text}\n"""`,
      ].join('\n')
    : [
        `文章：《${title}》`,
        context.heading && context.heading !== title ? `小节：${context.heading}` : '',
        `上下文：\n"""\n${context.text}\n"""`,
        `选中的内容：「${selection}」`,
      ].filter(Boolean).join('\n');

  const defaultPrompt = isArticleChat
    ? '请用通俗生动的大白话概括本文的核心要点，讲讲它解决了什么核心问题。'
    : '请用通俗生动的大白话解释选中的内容，讲清它在这里的作用和核心原理。';

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (!question) {
    messages.push({ role: 'user', content: `${base}\n${defaultPrompt}` });
  } else if (previous) {
    messages.push(
      { role: 'user', content: `${base}\n${defaultPrompt}` },
      { role: 'assistant', content: previous },
      { role: 'user', content: `追问：${question}` },
    );
  } else {
    messages.push({ role: 'user', content: `${base}\n读者的问题：${question}` });
  }
  return messages;
}

// ---------- 限流与答案缓存 ----------

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const quota = { day: today(), total: 0, perIp: new Map() };
const recent = new Map(); // ip -> 最近一分钟的请求时间
let active = 0;

// 每分钟：所有请求都算，包括会被拒的，防止拿来暴力试探
function allowMinute(ip) {
  if (recent.size > 50_000) recent.clear();
  const now = Date.now();
  const stamps = (recent.get(ip) || []).filter((t) => now - t < 60_000);
  const allowed = stamps.length < config.perMinute;
  if (allowed) stamps.push(now);
  recent.set(ip, stamps);
  return allowed;
}

// 每天：只有真正请求了模型才算，缓存命中不花钱也不扣次数
function dailyRefusal(ip) {
  const day = today();
  if (day !== quota.day) {
    quota.day = day;
    quota.total = 0;
    quota.perIp.clear();
  }
  if (quota.total >= config.dailyLimit) return '今天的提问总量用完了，明天再来吧';
  if ((quota.perIp.get(ip) || 0) >= config.perDay) return '你今天问得太多啦，明天再来吧';
  return '';
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, stamps] of recent) if (!stamps.some((t) => now - t < 60_000)) recent.delete(ip);
  if (quota.perIp.size > 50_000) quota.perIp.clear();
}, 5 * 60_000).unref();

// 同一篇、同一处、同一个问题的答案直接复用。位置也算进 key：
// 同一个词出现在两段不同的代码里，上下文不同，解释也该不同。Map 的插入顺序就是 LRU 顺序
const answers = new Map();
let answersDirty = false;
const answerKey = (page, pos, selectionNorm, question) =>
  createHash('sha1').update(`${page}\n${pos}\n${selectionNorm}\n${normalize(question)}`).digest('base64url');

function remember(key, answer) {
  answers.delete(key);
  answers.set(key, answer);
  if (answers.size > 500) answers.delete(answers.keys().next().value);
  answersDirty = true;
}

function recall(key) {
  const answer = answers.get(key);
  if (answer !== undefined) {
    answers.delete(key);
    answers.set(key, answer);
  }
  return answer;
}

function saveAnswers() {
  if (!config.cacheFile || !answersDirty) return;
  try {
    writeFileSync(config.cacheFile, JSON.stringify([...answers]));
    answersDirty = false;
  } catch (error) {
    log('cache save failed:', error.message);
  }
}

if (config.cacheFile) {
  try {
    for (const [key, answer] of JSON.parse(readFileSync(config.cacheFile, 'utf8'))) remember(key, answer);
    answersDirty = false;
    log(`loaded ${answers.size} cached answers`);
  } catch {}
  setInterval(saveAnswers, 10 * 60_000).unref();
}

// ---------- 调模型 ----------

// 有些中转会把思考过程包在开头的 <think>…</think> 里，读者只需要看结论
function stripThinking(raw) {
  const lead = raw.trimStart();
  if ('<think>'.startsWith(lead)) return '';
  if (!lead.startsWith('<think>')) return raw;
  const close = raw.indexOf('</think>');
  return close === -1 ? '' : raw.slice(close + 8).replace(/^\s+/, '');
}

async function callModel(messages, { signal, touch, onText, onThinking }) {
  const body = { model: config.model, messages, stream: true, max_tokens: config.maxTokens };
  if (Number.isFinite(config.temperature)) body.temperature = config.temperature;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  touch();
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 400);
    throw Object.assign(new Error(`upstream ${response.status}: ${detail}`), { status: response.status });
  }

  let raw = '';
  let sent = 0;
  let finishReason = '';
  let lastThinking = 0;
  const handle = (json) => {
    if (json.error) throw new Error(`upstream error: ${JSON.stringify(json.error).slice(0, 400)}`);
    const choice = json.choices?.[0];
    if (!choice) return;
    const delta = choice.delta ?? choice.message ?? {};
    const content = Array.isArray(delta.content) ? delta.content.map((part) => part?.text ?? '').join('') : delta.content;
    if (typeof content === 'string' && content) {
      raw += content;
      const visible = stripThinking(raw);
      if (visible.length > sent) {
        onText(visible.slice(sent));
        sent = visible.length;
      }
    }
    if ((delta.reasoning_content || delta.reasoning || delta.thinking) && Date.now() - lastThinking > 2000) {
      lastThinking = Date.now();
      onThinking();
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  };

  // 出错或不支持流式的中转会直接回一整个 JSON
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    handle(await response.json());
    return { text: stripThinking(raw), finishReason };
  }

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    touch();
    buffer += decoder.decode(chunk, { stream: true });
    for (let newline; (newline = buffer.indexOf('\n')) !== -1; ) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return { text: stripThinking(raw), finishReason };
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      handle(json);
    }
  }
  return { text: stripThinking(raw), finishReason };
}

// ---------- HTTP ----------

function clientIp(req) {
  const peer = req.socket.remoteAddress || '';
  // 只信任本机 nginx 转发的头；有人直连时伪造的 X-Real-IP 不算数
  if (peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1') {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real.trim()) return real.trim();
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',').pop().trim();
  }
  return peer;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > LIMITS.body) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handleAsk(req, res) {
  const started = Date.now();
  const ip = clientIp(req);

  if (!configured) return sendJson(res, 503, { error: 'AI 问答还没有配置好' });
  // 要求 JSON：别的网站没法用一个「简单请求」让读者的浏览器替它刷接口
  if (!String(req.headers['content-type'] || '').includes('application/json')) return sendJson(res, 415, { error: '请求格式不对' });
  if (Number(req.headers['content-length'] || 0) > LIMITS.body) return sendJson(res, 413, { error: '请求太大了' });
  if (!allowMinute(ip)) return sendJson(res, 429, { error: `问得太快了，歇一会儿再来（每分钟最多 ${config.perMinute} 次）` });

  let input;
  try {
    input = await readJson(req);
  } catch (error) {
    return sendJson(res, error.status || 400, { error: error.status === 413 ? '请求太大了' : '请求格式不对' });
  }

  const isArticleChat = Boolean(input?.isArticle || (!input?.selection && input?.question));
  const selection = typeof input?.selection === 'string' ? tidy(input.selection) : '';
  const question = typeof input?.question === 'string' ? tidy(input.question) : '';
  const prefix = typeof input?.prefix === 'string' ? input.prefix.slice(-LIMITS.anchor) : '';
  const suffix = typeof input?.suffix === 'string' ? input.suffix.slice(0, LIMITS.anchor) : '';
  if (!isArticleChat && !selection) return sendJson(res, 400, { error: '没有选中内容' });
  if (selection && [...selection].length > LIMITS.selection) return sendJson(res, 400, { error: `选中的内容太长了，请缩短到 ${LIMITS.selection} 字以内` });
  if ([...question].length > LIMITS.question) return sendJson(res, 400, { error: `提问请控制在 ${LIMITS.question} 字以内` });

  const loaded = typeof input.path === 'string' ? await loadPage(input.path) : null;
  if (!loaded) return sendJson(res, 404, { error: '找不到这篇文章' });

  let loc = null;
  let context = null;
  let selectionNorm = '';
  if (isArticleChat) {
    context = contextForArticle(loaded.page);
    selectionNorm = '__ARTICLE__';
  } else {
    selectionNorm = normalize(selection);
    loc = locate(loaded.page, selectionNorm, prefix, suffix);
    // 只回答文章里真实存在的文字，接口就没法被拿去当免费聊天机器人
    if (!loc) return sendJson(res, 422, { error: '只能询问文章正文里的内容' });
    context = contextFor(loaded.page, loc, selection.length);
  }

  const key = answerKey(loaded.key, loc ? loc.pos : 0, selectionNorm, question);
  const cached = recall(key);
  if (cached === undefined) {
    const refusal = dailyRefusal(ip);
    if (refusal) return sendJson(res, 429, { error: refusal });
    if (active >= config.maxConcurrent) return sendJson(res, 503, { error: '现在提问的人有点多，稍后再试' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const write = (chunk) => {
    if (!res.destroyed && !res.writableEnded) res.write(chunk);
  };
  const emit = (payload) => write(`data: ${JSON.stringify(payload)}\n\n`);
  const summary = `${loaded.key} ${isArticleChat ? 'article-chat' : `sel=${[...selection].length}`}${question ? ` q=${[...question].length}` : ''} ip=${ip}`;

  if (cached !== undefined) {
    emit({ d: cached });
    emit({ done: true, cached: true });
    res.end();
    log(`cache ${Date.now() - started}ms ${summary}`);
    return;
  }

  quota.total++;
  quota.perIp.set(ip, (quota.perIp.get(ip) || 0) + 1);
  active++;

  const upstream = new AbortController();
  let settled = false;
  let timedOut = false;
  res.on('close', () => {
    if (!settled) upstream.abort(); // 读者关掉了卡片：别让模型继续写、继续计费
  });
  let idle;
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      timedOut = true;
      upstream.abort();
    }, IDLE_TIMEOUT_MS);
  };
  touch();
  const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);

  const previous = question ? recall(answerKey(loaded.key, loc ? loc.pos : 0, selectionNorm, '')) : undefined;
  const messages = buildMessages({
    title: loaded.page.title,
    context,
    selection,
    question,
    previous,
    isArticleChat,
  });

  let outcome;
  try {
    const result = await callModel(messages, {
      signal: upstream.signal,
      touch,
      onText: (text) => emit({ d: text }),
      onThinking: () => emit({ t: 1 }),
    });
    const answer = result.text.trim();
    const truncated = result.finishReason === 'length';
    if (!answer) {
      outcome = `empty(${result.finishReason || '?'})`;
      emit({ error: truncated ? '模型想得太久，没来得及作答，换个问法再试试' : '模型没有给出回答，换个问法再试试' });
    } else {
      outcome = truncated ? 'truncated' : 'ok';
      if (!truncated) remember(key, answer);
      emit({ done: true, truncated });
    }
  } catch (error) {
    if (upstream.signal.aborted && !timedOut) {
      outcome = 'client-closed';
    } else {
      outcome = timedOut ? 'timeout' : `fail(${error.status || error.name})`;
      log('upstream:', error.message);
      emit({
        error: timedOut ? 'AI 想得太久了，稍后再试' : error.status === 429 ? 'AI 服务繁忙，稍后再试' : 'AI 服务暂时不可用，稍后再试',
      });
    }
  } finally {
    settled = true;
    active--;
    clearTimeout(idle);
    clearInterval(heartbeat);
    res.end();
  }
  log(`${outcome} ${Date.now() - started}ms ${summary}`);
}

async function handleSettings(req, res, subPath) {
  const ip = clientIp(req);

  // 1. 登录校验
  if (subPath === '/login' && req.method === 'POST') {
    if (!ADMIN_PASSWORD_HASH) {
      return sendJson(res, 403, { error: '服务器未配置 ADMIN_PASSWORD_HASH，请先在环境配置中设置管理密码哈希' });
    }
    const attemptBlock = checkLoginAttempt(ip);
    if (attemptBlock) return sendJson(res, 429, { error: attemptBlock });

    let body;
    try {
      body = await readJson(req);
    } catch {
      return sendJson(res, 400, { error: '请求数据格式有误' });
    }

    const password = typeof body?.password === 'string' ? body.password : '';
    const hash = createHash('sha256').update(password, 'utf8').digest('hex').toLowerCase();

    if (hash === ADMIN_PASSWORD_HASH) {
      recordLoginSuccess(ip);
      const token = createSessionToken();
      log(`admin login success from ${ip}`);
      return sendJson(res, 200, { ok: true, token });
    } else {
      recordLoginFailure(ip);
      log(`admin login failed from ${ip}`);
      return sendJson(res, 401, { error: '管理密码错误' });
    }
  }

  // 2. 其它 /api/settings/* 接口全部需要验证 Session Token
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!verifySessionToken(token)) {
    return sendJson(res, 401, { error: '未授权或登录已过期，请重新登录' });
  }

  // 3. 获取配置
  if (subPath === '/config' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      config: {
        baseUrl: config.baseUrl,
        apiKeyMasked: maskApiKey(config.apiKey),
        hasApiKey: Boolean(config.apiKey),
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature ?? null,
        perMinute: config.perMinute,
        perDay: config.perDay,
        dailyLimit: config.dailyLimit,
        maxConcurrent: config.maxConcurrent,
        siteName: config.siteName,
      },
      status: {
        configured,
        cacheCount: answers.size,
        dailyUsed: quota.total,
        active,
      },
    });
  }

  // 4. 保存配置
  if (subPath === '/config' && req.method === 'POST') {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return sendJson(res, 400, { error: '请求格式不正确' });
    }
    try {
      persistRuntimeConfig(body);
      log(`admin updated runtime configuration`);
      return sendJson(res, 200, { ok: true, message: '配置已更新并热重载生效' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || '保存配置失败' });
    }
  }

  // 5. 拉取远端模型列表
  if (subPath === '/models' && req.method === 'POST') {
    let body = {};
    try {
      body = await readJson(req);
    } catch {}

    const targetBaseUrl = (body.baseUrl || config.baseUrl || '').trim().replace(/\/+$/, '');
    const rawKey = body.apiKey && !body.apiKey.includes('...') ? body.apiKey.trim() : config.apiKey;
    const targetApiKey = rawKey || '';

    if (!targetBaseUrl || !targetApiKey) {
      return sendJson(res, 400, { error: '请先填写或保存 Base URL 与 API Key' });
    }

    try {
      const upstream = await fetch(`${targetBaseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${targetApiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!upstream.ok) {
        const detail = (await upstream.text().catch(() => '')).slice(0, 300);
        return sendJson(res, 200, {
          ok: false,
          status: upstream.status,
          error: `上游返回 HTTP ${upstream.status}: ${detail || '未能获取模型列表'}`,
        });
      }

      const json = await upstream.json().catch(() => null);
      let list = [];
      if (Array.isArray(json)) list = json;
      else if (Array.isArray(json?.data)) list = json.data;
      else if (Array.isArray(json?.models)) list = json.models;

      const models = Array.from(
        new Set(list.map((m) => (typeof m === 'string' ? m : m?.id)).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));

      return sendJson(res, 200, { ok: true, models });
    } catch (err) {
      return sendJson(res, 200, {
        ok: false,
        error: err.name === 'TimeoutError' ? '连接上游接口超时 (10s)' : (err.message || '获取模型失败'),
      });
    }
  }

  // 6. 模型测活
  if (subPath === '/test-model' && req.method === 'POST') {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return sendJson(res, 400, { error: '请求格式不正确' });
    }

    const targetBaseUrl = (body.baseUrl || config.baseUrl || '').trim().replace(/\/+$/, '');
    const rawKey = body.apiKey && !body.apiKey.includes('...') ? body.apiKey.trim() : config.apiKey;
    const targetApiKey = rawKey || '';
    const targetModel = (body.model || config.model || '').trim();

    if (!targetBaseUrl || !targetApiKey || !targetModel) {
      return sendJson(res, 400, { error: 'Base URL、API Key 与待测模型不能为空' });
    }

    const start = Date.now();
    try {
      const upstream = await fetch(`${targetBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${targetApiKey}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: 'user', content: 'Say "OK" briefly' }],
          max_tokens: 8,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;

      if (!upstream.ok) {
        const detail = (await upstream.text().catch(() => '')).slice(0, 300);
        return sendJson(res, 200, {
          ok: false,
          status: upstream.status,
          error: detail || `HTTP ${upstream.status}`,
          latencyMs,
        });
      }

      const json = await upstream.json().catch(() => ({}));
      const reply = json?.choices?.[0]?.message?.content?.trim() || 'OK';
      return sendJson(res, 200, {
        ok: true,
        model: targetModel,
        latencyMs,
        sample: reply.slice(0, 50),
      });
    } catch (err) {
      const latencyMs = Date.now() - start;
      return sendJson(res, 200, {
        ok: false,
        error: err.name === 'TimeoutError' ? '上游测活响应超时 (15s)' : (err.message || '网络连接失败'),
        latencyMs,
      });
    }
  }

  // 7. 清空缓存
  if (subPath === '/clear-cache' && req.method === 'POST') {
    const cleared = answers.size;
    answers.clear();
    answersDirty = true;
    saveAnswers();
    log(`admin cleared ${cleared} cached answers`);
    return sendJson(res, 200, { ok: true, cleared });
  }

  return sendJson(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url || '/', 'http://localhost');
  if (pathname === '/api/ask') {
    if (req.method === 'GET' || req.method === 'HEAD') return sendJson(res, 200, { ok: configured });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
    return handleAsk(req, res).catch((error) => {
      log('crash:', error?.stack || error);
      if (!res.headersSent) sendJson(res, 500, { error: '服务出错了' });
      else res.end();
    });
  }

  if (pathname.startsWith('/api/settings')) {
    const subPath = pathname.slice('/api/settings'.length);
    return handleSettings(req, res, subPath).catch((error) => {
      log('settings crash:', error?.stack || error);
      if (!res.headersSent) sendJson(res, 500, { error: '服务出错了' });
      else res.end();
    });
  }

  return sendJson(res, 404, { error: 'not found' });
});

server.listen(config.port, config.host, () => {
  log(`listening on http://${config.host}:${config.port}/api/ask · model ${config.model || '(未配置)'} · site ${config.siteDir}`);
  if (!configured) log('warning: AI_BASE_URL / AI_API_KEY / AI_MODEL 没配齐，提问会返回 503');
  stat(path.join(config.siteDir, 'posts')).catch(() => log(`warning: ${config.siteDir}/posts 不存在，先构建站点或检查 ASK_SITE_DIR`));
});

const shutdown = () => {
  saveAnswers();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
