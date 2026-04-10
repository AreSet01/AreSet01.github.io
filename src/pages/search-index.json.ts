import { getCollection } from 'astro:content';
import { formatDate, sortPostsByDate } from '../utils/date';

export const prerender = true;

const stripMarkdown = (source: string) =>
  source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/^#+\s+/gm, ' ')
    .replace(/[*_~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const createExcerpt = (body: string, fallback = '') => {
  const plain = stripMarkdown(fallback || body);
  if (plain.length <= 120) return plain;
  return `${plain.slice(0, 117).trim()}...`;
};

export async function GET() {
  const basePath = import.meta.env.BASE_URL ?? '/';
  const posts = sortPostsByDate(
    await getCollection('posts', ({ data }) => !data.draft)
  );

  const items = posts.map((entry) => ({
    title: entry.data.title,
    description: entry.data.description ?? '',
    excerpt: createExcerpt(entry.body, entry.data.description),
    tags: entry.data.tags ?? [],
    slug: entry.id,
    href: `${basePath}posts/${entry.id}/`,
    dateLabel: formatDate(entry.data.pubDate),
    publishedAt: new Date(entry.data.pubDate).getTime(),
  }));

  return new Response(JSON.stringify(items), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
