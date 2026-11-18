import { getCollection } from 'astro:content';
import { sortPostsByDate } from '../utils/date';
import { buildPostSearchIndexEntry } from '../utils/commandPaletteEngine';

export const prerender = true;

export async function GET() {
  const basePath = import.meta.env.BASE_URL ?? '/';
  const posts = sortPostsByDate(
    await getCollection('posts', ({ data }) => !data.draft)
  );

  const items = posts.map((entry) => buildPostSearchIndexEntry(entry, basePath));

  return new Response(JSON.stringify(items), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
