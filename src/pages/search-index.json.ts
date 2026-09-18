import { getCollection } from 'astro:content';
import { formatDate, sortPostsByDate } from '../utils/date';

export const prerender = true;

const stripMarkdown = (source: string = '') =>
  source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, ' ')
    .replace(/[*_~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const createExcerpt = (body: string = '', fallback: string = '') => {
  const plain = stripMarkdown(body || fallback);
  if (plain.length <= 140) return plain;
  return `${plain.slice(0, 137).trim()}...`;
};

export async function GET() {
  const basePath = import.meta.env.BASE_URL ?? '/';
  const posts = sortPostsByDate(
    await getCollection('posts', ({ data }) => !data.draft)
  );

  const items = posts.map((entry) => {
    const cleanBody = stripMarkdown(entry.body || '');
    return {
      title: entry.data.title,
      description: entry.data.description ?? '',
      excerpt: entry.data.description?.trim() || createExcerpt(entry.body, '') || '打开这篇文章继续阅读。',
      content: cleanBody.slice(0, 4000),
      tags: entry.data.tags ?? [],
      slug: entry.id,
      href: `${basePath}posts/${entry.id}/`,
      dateLabel: formatDate(entry.data.pubDate),
      publishedAt: new Date(entry.data.pubDate).getTime(),
    };
  });

  return new Response(JSON.stringify(items), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
