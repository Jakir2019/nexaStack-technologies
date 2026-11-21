import { CONTENT_STATUS, SLUG_PATTERN, type BlogPostAdminDetail } from '@nexastack/shared';
import { unstable_cache } from 'next/cache';
import { computeReadingTime } from '@nexastack/shared';
import { cache } from 'react';

import { company } from '@/config/company';
import { isLoadableCover } from '@/lib/blogImage';
import { BLOG_CACHE_SECONDS, BLOG_CACHE_TAG } from '@/lib/blogCache';
import { BlogCategory } from '@/lib/models/BlogCategory';
import { BlogPost as BlogPostModel } from '@/lib/models/BlogPost';
import { connectToDatabase } from '@/lib/mongodb';

/**
 * Blog data layer. Reads PUBLISHED posts straight from MongoDB through read-only mirror models
 * (`lib/models/Blog*.ts`); the Express API owns every write (`/api/v1/admin/blog/*`). Chosen over
 * a public Express endpoint so the public blog never waits on a sleeping API host (root
 * CLAUDE.md 22.5). This resolves 22.3: the blog's content source is DB-backed markdown authored
 * in the admin dashboard.
 *
 * Every public query filters on `status: 'published'`. Drafts, unpublished and archived posts
 * never leave this module. Functions are async because the database is; the exported types and
 * the pure helpers at the bottom (`filterAndPaginatePosts`, `computeReadingTime`) are unchanged
 * from the earlier stub, so the listing/detail components did not have to change.
 *
 * Reads are cached in two layers:
 * - `unstable_cache`, tagged `BLOG_CACHE_TAG`, keeps the result across requests so a visit does not
 *   cost a MongoDB round trip. The admin UI expires the tag when a post or category changes
 *   (`lib/blogActions.ts`), so a publish or unpublish shows on the very next request; the entry also
 *   expires by itself after `BLOG_CACHE_SECONDS`, so a missed invalidation cannot leave an
 *   unpublished post live for long. (Next.js 16 marks `unstable_cache` as superseded by `'use cache'`,
 *   which needs `cacheComponents`, a sitewide switch; `unstable_cache` is fully supported in 16.3.)
 * - React's `cache()` de-duplicates within ONE server render (a page calling `getAllPosts()`,
 *   `getCategories()` and `getFeaturedPost()` runs one lookup, not three).
 *
 * Only published content is ever cached, and only plain JSON-serialisable values (dates are ISO strings).
 */

export interface BlogPost<PublicationDate extends string | null = string> {
  readingTimeMinutes?: number;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  coverImage?: string;
  /** Required in practice whenever `coverImage` is set — a content image needs real alt text. */
  coverImageAlt?: string;
  publishedAt: PublicationDate;
  featured?: boolean;
}

export interface BlogPostDetail extends BlogPost<string | null> {
  /** Real founder identity (config/company.ts) — no multi-author scheme this project doesn't need. */
  author: { name: string; role: string };
  /** Pre-rendered, trusted HTML, produced by the API's escaping markdown renderer on save. */
  contentHtml: string;
  tableOfContents: { id: string; text: string; level: 2 | 3 }[];
  /** Computed via `computeReadingTime`, never hand-typed. */
  readingTimeMinutes: number;
}

/**
 * Only reachable if a category document was removed by hand in the database: the API refuses to
 * delete a category that still has posts. Shown rather than hiding a published post.
 */
const UNCATEGORIZED = 'Uncategorized';

/** Fields the listing needs. The body (`contentHtml`, `contentMarkdown`) is deliberately not
 * loaded for lists: it can be large and nothing on a list page renders it. */
const SUMMARY_FIELDS = 'slug title excerpt category tags coverImage coverImageAlt publishedAt createdAt featured readingTimeMinutes';

interface SummaryRecord {
  readingTimeMinutes?: number;
  slug: string;
  title: string;
  excerpt: string;
  category: unknown;
  tags: string[];
  coverImage?: string | null;
  coverImageAlt?: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  featured: boolean;
}

interface DetailRecord extends SummaryRecord {
  contentHtml: string;
  tableOfContents: { id: string; text: string; level: number }[];
}

const PUBLISHED = { status: CONTENT_STATUS.PUBLISHED } as const;

const CACHE_OPTIONS = { tags: [BLOG_CACHE_TAG], revalidate: BLOG_CACHE_SECONDS };

/** Category names by id, in display order. */
const readCategories = unstable_cache(
  async (): Promise<{ id: string; name: string }[]> => {
    await connectToDatabase();
    const docs = await BlogCategory.find().sort({ order: 1, name: 1 }).lean();
    return docs.map((doc) => ({ id: String(doc._id), name: doc.name }));
  },
  ['blog', 'categories'],
  CACHE_OPTIONS,
);
const loadCategories = cache(readCategories);

function categoryNameOf(record: SummaryRecord, categories: { id: string; name: string }[]): string {
  return categories.find((category) => category.id === String(record.category))?.name ?? UNCATEGORIZED;
}

let warnedAboutCover = false;

/**
 * A cover the app is not configured to load (a Media Library image while `CLOUDINARY_CLOUD_NAME` is
 * unset, say) is dropped here, for the public site and the admin preview alike, rather than being
 * handed to `next/image`, which would throw. Logged once so the misconfiguration is discoverable.
 */
function loadableCover(coverImage: string | null | undefined): string | undefined {
  if (!coverImage) return undefined;
  if (isLoadableCover(coverImage)) return coverImage;
  if (!warnedAboutCover) {
    warnedAboutCover = true;
    console.warn(
      '[blog] A post has a cover image this app is not configured to load, so it is shown without one. ' +
        'Set CLOUDINARY_CLOUD_NAME in the web environment (at build and run time) to the same account the Media Library uses.',
    );
  }
  return undefined;
}

function buildPost<PublicationDate extends string | null>(fields: {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: readonly string[];
  coverImage?: string | null | undefined;
  coverImageAlt?: string | null | undefined;
  publishedAt: PublicationDate;
  featured: boolean;
}): BlogPost<PublicationDate> {
  const coverImage = loadableCover(fields.coverImage);
  return {
    slug: fields.slug,
    title: fields.title,
    excerpt: fields.excerpt,
    category: fields.category,
    tags: [...fields.tags],
    ...(coverImage ? { coverImage, coverImageAlt: fields.coverImageAlt ?? '' } : {}),
    publishedAt: fields.publishedAt,
    featured: fields.featured,
  };
}

function toBlogPost(record: SummaryRecord, categories: { id: string; name: string }[]): BlogPost {
  const post = buildPost({
    slug: record.slug,
    title: record.title,
    excerpt: record.excerpt,
    category: categoryNameOf(record, categories),
    tags: record.tags,
    coverImage: record.coverImage,
    coverImageAlt: record.coverImageAlt,
    publishedAt: (record.publishedAt ?? record.createdAt).toISOString(),
    featured: record.featured,
  });
  if (record.readingTimeMinutes) post.readingTimeMinutes = record.readingTimeMinutes;
  return post;
}

function withDetail(
  post: BlogPost<string | null>,
  contentHtml: string,
  tableOfContents: { id: string; text: string; level: number }[],
): BlogPostDetail {
  return {
    ...post,
    // The byline is always the founder, from the one source of company facts.
    author: { name: company.founder.name, role: company.founder.jobTitle },
    contentHtml,
    tableOfContents: tableOfContents.map((item) => ({
      id: item.id,
      text: item.text,
      level: item.level === 3 ? 3 : 2,
    })),
    readingTimeMinutes: computeReadingTime(contentHtml),
  };
}

/**
 * The admin API's view of a post → the public template's shape. Used by the admin preview so it
 * renders through the public template, preserving a null date for a never-published post.
 */
export function blogPostDetailFromAdmin(detail: BlogPostAdminDetail): BlogPostDetail {
  const post = buildPost({
    slug: detail.slug,
    title: detail.title,
    excerpt: detail.excerpt,
    category: detail.category?.name ?? UNCATEGORIZED,
    tags: detail.tags,
    coverImage: detail.coverImage,
    coverImageAlt: detail.coverImageAlt,
    publishedAt: detail.publishedAt,
    featured: detail.featured,
  });
  return withDetail(post, detail.contentHtml, detail.tableOfContents);
}

/** All published posts, newest first. */
const readPublishedPosts = unstable_cache(
  async (): Promise<BlogPost[]> => {
    await connectToDatabase();
    const [records, categories] = await Promise.all([
      BlogPostModel.find(PUBLISHED)
        .select(SUMMARY_FIELDS)
        .sort({ publishedAt: -1, _id: -1 })
        .lean<SummaryRecord[]>(),
      loadCategories(),
    ]);
    return records.map((record) => toBlogPost(record, categories));
  },
  ['blog', 'published-posts'],
  CACHE_OPTIONS,
);
const loadPublishedPosts = cache(readPublishedPosts);

const readPublishedPost = unstable_cache(
  async (slug: string): Promise<BlogPostDetail | null> => {
    await connectToDatabase();
    const [record, categories] = await Promise.all([
      BlogPostModel.findOne({ ...PUBLISHED, slug })
        .select(`${SUMMARY_FIELDS} contentHtml tableOfContents`)
        .lean<DetailRecord | null>(),
      loadCategories(),
    ]);
    if (!record) return null;

    return withDetail(toBlogPost(record, categories), record.contentHtml, record.tableOfContents);
  },
  ['blog', 'published-post'],
  CACHE_OPTIONS,
);

const loadPublishedPost = cache(async (slug: string): Promise<BlogPostDetail | null> => {
  // The slug comes from the URL. Only a well-formed one can match a real post.
  if (!SLUG_PATTERN.test(slug)) return null;

  // A slug that is not in the (cached) list of published posts is answered here, without a database
  // read and, importantly, without creating a cache entry for it: the detail cache is keyed by slug,
  // so caching lookups for arbitrary made-up slugs would let anyone grow it without bound.
  const published = await loadPublishedPosts();
  if (!published.some((post) => post.slug === slug)) return null;

  return readPublishedPost(slug);
});

export async function getAllPosts(): Promise<BlogPost[]> {
  return loadPublishedPosts();
}

/**
 * Server-side log line for a failed blog read (database unreachable, bad connection string, and so on).
 * A blog page that catches such a failure calls this and shows `BlogUnavailable` instead: the detail
 * stays in the server log (root CLAUDE.md 11.2) and nothing from `error` reaches the visitor. This app
 * logs with `console.error` (no Pino here; see `app/sitemap.ts`), so the request context is a plain object.
 */
export function logBlogReadFailure(context: { route: string; slug?: string }, error: unknown): void {
  console.error('[blog] Could not read published posts; showing the unavailable state.', context, error);
}

/** The newest published post marked `featured`, or null. */
export async function getFeaturedPost(): Promise<BlogPost | null> {
  const posts = await loadPublishedPosts();
  return posts.find((post) => post.featured) ?? null;
}

/**
 * Category names in the admin-defined display order, limited to categories that have at least
 * one published post — the public filter never offers a category that would show nothing.
 */
export async function getCategories(): Promise<string[]> {
  const [posts, categories] = await Promise.all([loadPublishedPosts(), loadCategories()]);
  const used = new Set(posts.map((post) => post.category));
  return categories.map((category) => category.name).filter((name) => used.has(name));
}

/** Derived from real published posts, never hardcoded ahead of real content. */
export async function getTags(): Promise<string[]> {
  const posts = await loadPublishedPosts();
  return Array.from(new Set(posts.flatMap((post) => post.tags))).sort();
}

export async function getPost(slug: string): Promise<BlogPostDetail | null> {
  return loadPublishedPost(slug);
}

const RELATED_POSTS_LIMIT = 3;

/** Published posts other than this one, ranked by shared category (weighted higher) then shared
 * tags, newest first among ties. Posts with nothing in common are not "related". */
export async function getRelatedPosts(slug: string): Promise<BlogPost[]> {
  const posts = await loadPublishedPosts();
  const current = posts.find((post) => post.slug === slug);
  return current ? rankRelatedPosts(current, posts) : [];
}

/**
 * Related posts for a post that may not be published yet — the admin preview passes the post it
 * is previewing, so it shows the related articles the post WILL have once published. The post
 * itself is never listed as related to itself.
 */
export async function getRelatedPostsFor(
  current: Pick<BlogPost, 'slug' | 'category' | 'tags'>,
): Promise<BlogPost[]> {
  return rankRelatedPosts(current, await loadPublishedPosts());
}

function rankRelatedPosts(
  current: Pick<BlogPost, 'slug' | 'category' | 'tags'>,
  posts: readonly BlogPost[],
): BlogPost[] {
  const slug = current.slug;
  const currentTags = new Set(current.tags);
  return posts
    .filter((post) => post.slug !== slug)
    .map((post) => ({
      post,
      score:
        (post.category === current.category ? 2 : 0) +
        post.tags.filter((tag) => currentTags.has(tag)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, RELATED_POSTS_LIMIT)
    .map(({ post }) => post);
}

/**
 * Reading time computed from contentHtml's real word count — same "compute, don't hardcode"
 * discipline as the Footer's copyright year. 225 wpm is a commonly cited average adult reading
 * speed.
 */
export { computeReadingTime };

export interface BlogQueryParams {
  q?: string;
  category?: string;
  tag?: string;
  page?: string;
}

export interface BlogQueryResult {
  posts: BlogPost[];
  currentPage: number;
  totalPages: number;
}

export const BLOG_PAGE_SIZE = 9;

/**
 * Presentation-layer search/filter/pagination — pure list processing, independent of where the
 * posts come from. Operates on whatever `BlogPost[]` it's given, so the real `/blog` page and the
 * fixture-driven `/dev/blog-preview` page share this one implementation rather than duplicating
 * the filtering logic.
 */
export function filterAndPaginatePosts(
  posts: readonly BlogPost[],
  { q, category, tag, page }: BlogQueryParams,
  /** Override for `/dev/blog-preview`, which uses a handful of fixtures and a small size to
   * genuinely exercise multi-page pagination without inflating the fixture count. The real
   * page never passes this, so it always uses `BLOG_PAGE_SIZE`. */
  pageSize: number = BLOG_PAGE_SIZE,
): BlogQueryResult {
  const query = q?.trim().toLowerCase();

  const filtered = posts.filter((post) => {
    if (category && post.category !== category) return false;
    if (tag && !post.tags.includes(tag)) return false;
    if (query) {
      const haystack = `${post.title} ${post.excerpt}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const requestedPage = Number(page);
  const currentPage = Number.isInteger(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, totalPages) : 1;
  const start = (currentPage - 1) * pageSize;

  return {
    posts: filtered.slice(start, start + pageSize),
    currentPage,
    totalPages,
  };
}
