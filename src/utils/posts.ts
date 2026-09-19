import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/** Newest first. */
export function byNewest(posts: Post[]): Post[] {
  return [...posts].sort(
    (a, b) => new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime()
  );
}

/* ================= Categories ================= */

export interface CategoryStat {
  name: string;
  count: number;
}

export function categoryStats(posts: Post[]): CategoryStat[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const name = post.data.category || '未归类';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
}

/* ================= Series ================= */

export interface SeriesEntry {
  post: Post;
  index: number; // 1-based position within the series
}

export interface SeriesInfo {
  name: string;
  parts: SeriesEntry[];
  /** Position of the post this info was built for. */
  current: number;
  prev?: Post;
  next?: Post;
}

/** All posts of a series, ordered by seriesOrder (falling back to date). */
export function seriesParts(posts: Post[], series: string): Post[] {
  return posts
    .filter((post) => post.data.series === series)
    .sort((a, b) => {
      const ao = a.data.seriesOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.data.seriesOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return new Date(a.data.pubDate).getTime() - new Date(b.data.pubDate).getTime();
    });
}

export function seriesInfoFor(posts: Post[], post: Post): SeriesInfo | null {
  const name = post.data.series;
  if (!name) return null;
  const ordered = seriesParts(posts, name);
  if (ordered.length < 2) return null;
  const at = ordered.findIndex((entry) => entry.id === post.id);
  if (at === -1) return null;
  return {
    name,
    parts: ordered.map((entry, index) => ({ post: entry, index: index + 1 })),
    current: at + 1,
    prev: at > 0 ? ordered[at - 1] : undefined,
    next: at < ordered.length - 1 ? ordered[at + 1] : undefined,
  };
}

/** Every series on the site, longest first. */
export function allSeries(posts: Post[]): Array<{ name: string; parts: Post[] }> {
  const names = new Set(posts.map((post) => post.data.series).filter(Boolean) as string[]);
  return [...names]
    .map((name) => ({ name, parts: seriesParts(posts, name) }))
    .filter((group) => group.parts.length > 1)
    .sort((a, b) => b.parts.length - a.parts.length);
}

/* ================= Tags ================= */

/** URL-safe, human-readable slug. Kept pure so every component can derive it from a name alone;
 *  two tags colliding would surface as a duplicate-route build error rather than a silent merge. */
export function tagSlug(tag: string): string {
  return (
    tag
      .trim()
      .toLowerCase()
      .replace(/\+/g, 'plus')
      .replace(/#/g, 'sharp')
      .replace(/[^a-z0-9一-鿿㐀-䶿]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tag'
  );
}

export interface TagStat {
  name: string;
  count: number;
}

export function tagStats(posts: Post[]): TagStat[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
}

/** Undirected tag co-occurrence: how many posts each pair shares. */
export function tagPairs(posts: Post[]): Array<{ a: string; b: string; weight: number }> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const tags = [...new Set(post.data.tags ?? [])].sort();
    for (let i = 0; i < tags.length; i += 1) {
      for (let j = i + 1; j < tags.length; j += 1) {
        const key = `${tags[i]}\u0000${tags[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([key, weight]) => {
      const [a, b] = key.split('\u0000');
      return { a, b, weight };
    })
    .sort((left, right) => right.weight - left.weight);
}

/** Tags that co-occur with `tag`, strongest first. */
export function relatedTagsOf(
  posts: Post[],
  tag: string,
  limit = 8
): Array<{ name: string; weight: number }> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const tags = post.data.tags ?? [];
    if (!tags.includes(tag)) continue;
    for (const other of tags) {
      if (other === tag) continue;
      counts.set(other, (counts.get(other) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, weight]) => ({ name, weight }))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, 'zh'))
    .slice(0, limit);
}

/* ================= Word / code counts ================= */

export interface PostMetrics {
  chars: number;      // CJK characters + latin words, code excluded
  codeLines: number;  // non-empty lines inside fenced blocks
  images: number;
  minutes: number;    // rough reading time
}

const FENCE = /^([ \t]*)(`{3,}|~{3,})/;

export function postMetrics(post: Post): PostMetrics {
  const body = post.body ?? '';
  let inFence = false;
  let fenceMarker = '';
  let codeLines = 0;
  let prose = '';
  let images = 0;

  for (const rawLine of body.split(/\r?\n/)) {
    const fence = FENCE.exec(rawLine);
    if (fence) {
      const marker = fence[2][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        continue;
      }
      if (marker === fenceMarker) {
        inFence = false;
        continue;
      }
    }
    if (inFence) {
      if (rawLine.trim()) codeLines += 1;
      continue;
    }
    images += (rawLine.match(/!\[[^\]]*\]\(/g) ?? []).length;
    prose += `${rawLine}\n`;
  }

  // Strip the markup that would otherwise inflate the count
  const text = prose
    .replace(/`[^`]*`/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*|+\s]+/gm, ' ')
    .replace(/[*_~]/g, '');

  const cjk = (text.match(/[一-鿿㐀-䶿぀-ヿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
  const chars = cjk + latin;

  // ~400 CJK chars or ~220 latin words per minute; code skimmed at ~60 lines
  const minutes = Math.max(1, Math.round(cjk / 400 + latin / 220 + codeLines / 60));

  return { chars, codeLines, images, minutes };
}
