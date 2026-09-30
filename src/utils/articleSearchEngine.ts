/**
 * articleSearchEngine.ts
 * Core search matcher & text walker algorithm for In-Article Search
 */

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface MatchSpan {
  start: number;
  end: number;
  text: string;
}

/**
 * Escapes special regex characters in a query string safely.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a valid RegExp from query and search options.
 * Handles Unicode word boundaries when wholeWord is enabled.
 */
export function buildSearchPattern(query: string, options: SearchOptions): RegExp | null {
  if (!query || !query.trim()) return null;

  const escaped = escapeRegex(query);
  let pattern = escaped;

  if (options.wholeWord) {
    // Unicode-aware word boundaries (letters, numbers, underscore)
    try {
      pattern = `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`;
      return new RegExp(pattern, options.caseSensitive ? 'gu' : 'giu');
    } catch {
      // Fallback for older JS engines
      pattern = `\\b${escaped}\\b`;
      return new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
    }
  }

  try {
    return new RegExp(pattern, options.caseSensitive ? 'gu' : 'giu');
  } catch {
    return new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
  }
}

/**
 * Finds all match spans within a string given a compiled RegExp.
 */
export function findMatchesInText(text: string, regex: RegExp): MatchSpan[] {
  if (!text || !regex) return [];

  // Clone regex to reset lastIndex
  const flags = regex.flags;
  const runner = new RegExp(regex.source, flags.includes('g') ? flags : flags + 'g');

  const matches: MatchSpan[] = [];
  let match: RegExpExecArray | null;

  while ((match = runner.exec(text)) !== null) {
    if (match[0].length === 0) {
      runner.lastIndex += 1;
      continue;
    }
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }

  return matches;
}

export interface TextNodeRange {
  textNode: Text;
  localStart: number;
  localEnd: number;
  matchGroup: number;
}

export interface BlockTextEntry {
  node: Text;
  start: number;
  end: number;
  length: number;
}

/**
 * Maps a match range [matchStart, matchEnd] across a list of text nodes in a block.
 */
export function mapMatchToTextNodes(
  matchStart: number,
  matchEnd: number,
  matchGroup: number,
  entries: BlockTextEntry[]
): TextNodeRange[] {
  const ranges: TextNodeRange[] = [];

  for (const entry of entries) {
    if (matchEnd <= entry.start || matchStart >= entry.end) {
      continue; // No overlap
    }

    const localStart = Math.max(0, matchStart - entry.start);
    const localEnd = Math.min(entry.length, matchEnd - entry.start);

    if (localStart < localEnd) {
      ranges.push({
        textNode: entry.node,
        localStart,
        localEnd,
        matchGroup,
      });
    }
  }

  return ranges;
}

export interface SnippetContext {
  prefix: string;
  matchedText: string;
  suffix: string;
}

/**
 * Extracts a concise snippet around a matched keyword range with surrounding context.
 */
export function extractSnippet(
  text: string,
  matchStart: number,
  matchEnd: number,
  contextRadius: number = 36
): SnippetContext {
  if (!text) {
    return { prefix: '', matchedText: '', suffix: '' };
  }

  const start = Math.max(0, Math.min(matchStart, text.length));
  const end = Math.max(start, Math.min(matchEnd, text.length));
  const matchedText = text.slice(start, end);

  const rawPrefix = text.slice(Math.max(0, start - contextRadius), start);
  const cleanPrefix = rawPrefix.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
  const hasMoreBefore = start > contextRadius;
  const prefix = (hasMoreBefore ? '…' : '') + cleanPrefix.trimStart();

  const rawSuffix = text.slice(end, Math.min(text.length, end + contextRadius));
  const cleanSuffix = rawSuffix.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
  const hasMoreAfter = end + contextRadius < text.length;
  const suffix = cleanSuffix.trimEnd() + (hasMoreAfter ? '…' : '');

  return { prefix, matchedText, suffix };
}

/**
 * Normalizes code block language identifier into clean display label.
 */
export function normalizeLanguage(lang?: string | null): string {
  if (!lang) return 'CODE';
  const l = lang.trim().toLowerCase();
  if (l === 'cpp' || l === 'c++') return 'C++';
  if (l === 'cs' || l === 'c#') return 'C#';
  if (l === 'ts' || l === 'typescript') return 'TS';
  if (l === 'js' || l === 'javascript') return 'JS';
  if (l === 'py' || l === 'python') return 'Python';
  if (l === 'rust' || l === 'rs') return 'Rust';
  if (l === 'html') return 'HTML';
  if (l === 'css') return 'CSS';
  if (l === 'json') return 'JSON';
  if (l === 'sh' || l === 'bash' || l === 'shell') return 'Bash';
  return l.toUpperCase();
}

/**
 * Formats section tag or code block source indicator for dropdown result item.
 */
export function formatSourceTag(
  rawHeading: string | null,
  codeContext?: { title?: string | null; language?: string | null }
): string {
  if (codeContext && (codeContext.title || codeContext.language)) {
    const lang = normalizeLanguage(codeContext.language);
    const title = codeContext.title?.trim();
    if (title) {
      return `[${lang}] ${title}`;
    }
    return `[${lang}] 代码片段`;
  }

  if (rawHeading) {
    const clean = rawHeading.replace(/^[#\s§]+/, '').replace(/\s+/g, ' ').trim();
    if (clean) {
      return `§ ${clean}`;
    }
  }

  return '§ 导言 / 正文';
}

