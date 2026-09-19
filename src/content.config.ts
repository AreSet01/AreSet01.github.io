import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    // Broad shelf this post sits on — set per post, deliberately coarser than tags.
    // The archive's filter chips are derived from whatever values actually appear.
    category: z.string().default('未归类'),
    // Multi-part writing: same `series` string + an ascending `seriesOrder`
    series: z.string().optional(),
    seriesOrder: z.number().optional(),
    draft: z.boolean().default(false),
    locked: z.boolean().default(false),
    passwordHash: z.string().optional(),
    passwordHint: z.string().optional(),
  }),
});

export const collections = { posts };
