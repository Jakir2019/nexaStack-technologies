import { readFile, access } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { blogPostFormSchema, blogCategoryFormSchema } from '@nexastack/shared';
import { renderArticle } from '../src/lib/markdown.js';

// Content is an import artifact, never a public-page data source. No database driver is used.
const root = new URL('../../../', import.meta.url);
const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    api: { type: 'string', default: 'http://localhost:4000' },
    origin: { type: 'string', default: 'http://localhost:3000' },
    'session-file': { type: 'string' },
  },
});
interface Entry {
  title: string;
  slug: string;
  category: string;
  tags: string[];
  excerpt: string;
  coverImage: string;
  coverImageAlt: string;
  featured: boolean;
}
const manifest = JSON.parse(
  await readFile(new URL('content/blog/manifest.json', root), 'utf8'),
) as Entry[];
const seen = new Set<string>();
const prepared = [];
for (const entry of manifest) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug) || seen.has(entry.slug))
    throw new Error('Invalid or duplicate slug');
  seen.add(entry.slug);
  const contentMarkdown = await readFile(new URL(`content/blog/${entry.slug}.md`, root), 'utf8');
  const input = blogPostFormSchema.parse({
    ...entry,
    contentMarkdown,
    categoryId: '000000000000000000000001',
  });
  await access(new URL(`apps/web/public${input.coverImage}`, root));
  const words = contentMarkdown.trim().split(/\s+/).length;
  if (words < 1200 || words > 1800) throw new Error(`Article length outside target: ${entry.slug}`);
  const rendered = renderArticle(contentMarkdown);
  if (!rendered.tableOfContents.length) throw new Error('Missing headings');
  prepared.push({ entry, input });
  console.log(`Validated ${entry.slug}: ${words} words`);
}
if (!values.apply) {
  console.log('Dry run complete. No HTTP or database writes performed.');
} else {
  // Never infer that a configured Atlas database is development. Only explicit loopback DBs
  // with development names qualify. The running local API must use this same configuration.
  const config = parseEnv(await readFile(new URL('apps/api/.env', root), 'utf8'));
  let db: URL;
  try {
    db = new URL(config.MONGODB_URI ?? '');
  } catch {
    throw new Error('Development database configuration is missing or invalid');
  }
  const api = new URL(values.api);
  const origin = new URL(values.origin);
  const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (
    config.NODE_ENV === 'production' ||
    db.protocol !== 'mongodb:' ||
    !loopback(db.hostname) ||
    !/\/(?:[a-z0-9_]+_dev|[a-z0-9_]+_development)$/.test(db.pathname) ||
    !loopback(api.hostname) ||
    !loopback(origin.hostname) ||
    api.protocol !== 'http:' ||
    api.pathname !== '/' ||
    api.username ||
    api.password
  )
    throw new Error(
      'Import requires a loopback development API and a loopback development database',
    );
  if (!values['session-file'])
    throw new Error('--session-file is required for authenticated draft creation');
  const cookie = (await readFile(values['session-file'], 'utf8')).trim();
  if (!cookie || /[\r\n]/.test(cookie)) throw new Error('Invalid session file');
  async function request(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(new URL(`/api/v1/admin/blog/${path}`, api), {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      headers: {
        Cookie: cookie,
        Origin: origin.origin,
        'X-Requested-With': 'nexastack-admin',
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Admin API returned HTTP ${response.status}; import stopped without overwriting content`,
      );
    const result = (await response.json()) as { data: Record<string, unknown> };
    return result.data;
  }
  const categories = (await request('categories')).categories as {
    id: string;
    name: string;
    slug: string;
  }[];
  for (const { entry, input } of prepared) {
    // Include archived records as well. Exact slug conflicts remain protected by the API's unique index.
    let exists = false;
    for (const status of ['draft', 'published', 'unpublished', 'archived']) {
      let page = 1;
      let totalPages = 1;
      do {
        const data = await request(`posts?status=${status}&page=${page}&limit=50`);
        exists ||= (data.items as { slug: string }[]).some((post) => post.slug === entry.slug);
        totalPages = Number(data.totalPages);
        page += 1;
      } while (page <= totalPages && !exists);
      if (exists) break;
    }
    if (exists) {
      console.log(`Skipped existing ${entry.slug}`);
      continue;
    }
    const slug = entry.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let category = categories.find(
      (item) => item.slug === slug || item.name.toLowerCase() === entry.category.toLowerCase(),
    );
    if (!category) {
      const data = await request(
        'categories',
        blogCategoryFormSchema.parse({ name: entry.category, slug }),
      );
      category = data.category as (typeof categories)[number];
      categories.push(category);
    }
    await request('posts', blogPostFormSchema.parse({ ...input, categoryId: category.id }));
    console.log(`Created draft ${entry.slug}`);
  }
  console.log('Import complete. Publish separately through the administrator dashboard.');
}
