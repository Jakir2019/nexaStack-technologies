import {
  CONTENT_STATUS,
  computeReadingTime,
  hasPermission,
  type BlogPostAdminDetail,
  type BlogPostAdminSummary,
  type BlogPostInput,
  type BlogPostListQuery,
  type BlogTocItem,
  type ContentStatus,
  type Paginated,
} from '@nexastack/shared';
import mongoose, { type Types } from 'mongoose';

import { resolveCover, type CoverInput, type ResolvedCover } from '../lib/blogCover.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { escapeRegex, skipFor, toPaginated } from '../lib/listQuery.js';
import { renderArticle } from '../lib/markdown.js';
import { findFreeSlug, slugify } from '../lib/slug.js';
import { BlogCategory } from '../models/BlogCategory.js';
import { BlogPost, type BlogPostDocument } from '../models/BlogPost.js';
import { Media } from '../models/Media.js';
import { type AdminActionContext, logAdminAction } from './adminActivityLog.service.js';
import { isDuplicateKeyError } from './blogCategory.service.js';
import { applyStatusTransition } from './contentStatus.js';

/** A lean BlogPost as read back from MongoDB, timestamps included. */
type LeanPost = BlogPostDocument & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

async function loadCategoryRefs(ids: Types.ObjectId[]): Promise<Map<string, CategoryRef>> {
  // `trusted`: see listPosts — `sanitizeFilter` would otherwise turn `$in` into `$eq`. The ids are
  // ObjectIds read from our own documents.
  const docs = await BlogCategory.find({ _id: mongoose.trusted({ $in: ids }) })
    .select('name slug')
    .lean();
  return new Map(
    docs.map((doc) => [String(doc._id), { id: String(doc._id), name: doc.name, slug: doc.slug }]),
  );
}

function toSummary(post: LeanPost, categories: Map<string, CategoryRef>): BlogPostAdminSummary {
  return {
    id: String(post._id),
    title: post.title,
    slug: post.slug,
    category: categories.get(String(post.category)) ?? null,
    status: post.status as ContentStatus,
    featured: post.featured,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    updatedAt: post.updatedAt.toISOString(),
  };
}

function toDetail(post: LeanPost, categories: Map<string, CategoryRef>): BlogPostAdminDetail {
  return {
    ...toSummary(post, categories),
    excerpt: post.excerpt,
    tags: post.tags,
    coverImage: post.coverImage ?? undefined,
    coverMediaId: post.coverMediaId ? String(post.coverMediaId) : undefined,
    coverImageAlt: post.coverImageAlt ?? undefined,
    contentMarkdown: post.contentMarkdown,
    contentHtml: post.contentHtml,
    tableOfContents: post.tableOfContents.map((item): BlogTocItem => ({
      id: item.id,
      text: item.text,
      level: item.level === 3 ? 3 : 2,
    })),
    createdAt: post.createdAt.toISOString(),
  };
}

async function requireCategory(categoryId: string): Promise<void> {
  if (!(await BlogCategory.exists({ _id: categoryId }))) {
    throw new ValidationError([
      {
        location: 'body',
        path: 'categoryId',
        message: 'That category no longer exists. Please choose another one.',
      },
    ]);
  }
}

/**
 * The cover to store. A library image is looked up here and its URL taken from the library record
 * (never from the request); a legacy site path passes through. See `lib/blogCover.ts` for the rules.
 */
async function resolveCoverForSave(input: CoverInput): Promise<ResolvedCover> {
  const media = input.coverMediaId
    ? await Media.findById(input.coverMediaId).select('url mediaType mimeType').lean()
    : null;

  return resolveCover(
    input,
    media
      ? { id: String(media._id), url: media.url, mediaType: media.mediaType, mimeType: media.mimeType }
      : null,
  );
}

function slugTakenMessage(slug: string): string {
  return `A post with the URL slug "${slug}" already exists. Choose a different slug.`;
}

/**
 * Search + filter + paginate, all in the database query — the admin list never fetches an
 * unbounded set. With no `status` filter, archived posts are hidden ("active" posts only);
 * ask for `status=archived` to see them.
 */
export async function listPosts(
  query: BlogPostListQuery,
): Promise<Paginated<BlogPostAdminSummary>> {
  const filter: Record<string, unknown> = {};

  // `trusted`: the project sets `sanitizeFilter`, which would otherwise wrap these operators in
  // `$eq`. Every operand here is a constant or a validated enum value, never raw user input.
  filter.status = query.status ?? mongoose.trusted({ $ne: CONTENT_STATUS.ARCHIVED });

  if (query.category) {
    const category = await BlogCategory.findOne({ slug: query.category }).select('_id').lean();
    if (!category) return toPaginated([], 0, query.page, query.limit);
    filter.category = category._id;
  }

  if (query.q) {
    // Literal, case-insensitive match — the same substring semantics as the public search.
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: pattern }, { excerpt: pattern }];
  }

  const [posts, total] = await Promise.all([
    BlogPost.find(filter)
      // Only what `toSummary` shows. Without this every row also loaded `contentMarkdown` (up to 50 KB)
      // and `contentHtml`, so one page of the list could pull a megabyte or two from the database.
      .select('title slug category status featured publishedAt updatedAt')
      .sort({ updatedAt: -1, _id: -1 })
      .skip(skipFor(query.page, query.limit))
      .limit(query.limit)
      .lean<LeanPost[]>(),
    BlogPost.countDocuments(filter),
  ]);

  const categories = await loadCategoryRefs(posts.map((post) => post.category));
  return toPaginated(
    posts.map((post) => toSummary(post, categories)),
    total,
    query.page,
    query.limit,
  );
}

/** One post in any status — the editor's and the preview's data source. */
export async function getPostById(id: string): Promise<BlogPostAdminDetail> {
  const post = await BlogPost.findById(id).lean<LeanPost>();
  if (!post) throw new NotFoundError('That post was not found. It may have been deleted.');

  const categories = await loadCategoryRefs([post.category]);
  return toDetail(post, categories);
}

/** Always creates a draft. Going live is a separate, explicit status change. */
export async function createPost(
  input: BlogPostInput,
  context: AdminActionContext,
): Promise<BlogPostAdminDetail> {
  await requireCategory(input.categoryId);

  let slug: string;
  if (input.slug) {
    // An explicit slug is never silently altered: a clash is the author's to resolve.
    if (await BlogPost.exists({ slug: input.slug })) {
      throw new ConflictError(slugTakenMessage(input.slug));
    }
    slug = input.slug;
  } else {
    slug = await findFreeSlug(slugify(input.title, 'post'), async (candidate) =>
      Boolean(await BlogPost.exists({ slug: candidate })),
    );
  }

  const { html, tableOfContents } = renderArticle(input.contentMarkdown);
  const cover = await resolveCoverForSave(input);

  let created;
  try {
    created = await BlogPost.create({
      title: input.title,
      slug,
      excerpt: input.excerpt,
      category: input.categoryId,
      tags: input.tags,
      coverImage: cover.coverImage,
      coverMediaId: cover.coverMediaId,
      coverImageAlt: input.coverImageAlt,
      contentMarkdown: input.contentMarkdown,
      contentHtml: html,
      readingTimeMinutes: computeReadingTime(html),
      tableOfContents,
      status: CONTENT_STATUS.DRAFT,
      featured: input.featured,
      publishedAt: null,
      createdBy: context.adminId,
      updatedBy: context.adminId,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new ConflictError(slugTakenMessage(slug));
    throw err;
  }

  const id = created.id as string;
  await logAdminAction(context, 'blog_post_created', { postId: id, slug });
  return getPostById(id);
}

/**
 * Edit content fields. Never changes `status` — that is `changePostStatus`. Two rules:
 * - an archived post must be restored to a draft first;
 * - the slug is locked once the post has ever been published (`publishedAt` set), because a
 *   live URL that changes would break every link to it and no redirect system exists.
 * A blank slug on update keeps the current one.
 */
export async function updatePost(
  id: string,
  input: BlogPostInput,
  context: AdminActionContext,
): Promise<BlogPostAdminDetail> {
  const post = await BlogPost.findById(id);
  if (!post) throw new NotFoundError('That post was not found. It may have been deleted.');

  // Editing a post that is not a draft changes what the public sees (or would see once restored),
  // which is exactly what publishing does. So it needs the same capability: a role that can create and
  // edit but not publish (a content editor) may edit DRAFTS only. The route already required
  // `content:edit`; this part depends on the post's status, so it is decided here.
  if (post.status !== CONTENT_STATUS.DRAFT && !hasPermission(context.role, 'content:publish')) {
    throw new ForbiddenError(
      'You can edit drafts only. Changing a post that is live, unpublished or archived needs someone who can publish.',
    );
  }

  if (post.status === CONTENT_STATUS.ARCHIVED) {
    throw new ConflictError('This post is archived. Restore it to a draft before editing it.');
  }

  await requireCategory(input.categoryId);

  if (input.slug && input.slug !== post.slug) {
    if (post.publishedAt) {
      throw new ConflictError(
        'The URL slug is locked once a post has been published, because changing it would break existing links.',
      );
    }
    if (await BlogPost.exists({ slug: input.slug, _id: mongoose.trusted({ $ne: post._id }) })) {
      throw new ConflictError(slugTakenMessage(input.slug));
    }
    post.slug = input.slug;
  }

  const { html, tableOfContents } = renderArticle(input.contentMarkdown);
  const cover = await resolveCoverForSave(input);

  post.title = input.title;
  post.excerpt = input.excerpt;
  post.set('category', input.categoryId);
  post.set('tags', input.tags);
  post.set('coverImage', cover.coverImage);
  post.set('coverMediaId', cover.coverMediaId);
  post.set('coverImageAlt', input.coverImageAlt);
  post.contentMarkdown = input.contentMarkdown;
  post.contentHtml = html;
  post.readingTimeMinutes = computeReadingTime(html);
  post.set('tableOfContents', tableOfContents);
  post.featured = input.featured;
  post.set('updatedBy', context.adminId);

  try {
    await post.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new ConflictError(slugTakenMessage(post.slug));
    throw err;
  }

  await logAdminAction(context, 'blog_post_updated', {
    postId: id,
    slug: post.slug,
    coverMediaId: cover.coverMediaId ?? null,
  });
  return getPostById(id);
}

const STATUS_EVENTS = {
  [CONTENT_STATUS.PUBLISHED]: 'blog_post_published',
  [CONTENT_STATUS.UNPUBLISHED]: 'blog_post_unpublished',
  [CONTENT_STATUS.ARCHIVED]: 'blog_post_archived',
  // archived → draft is the only way to reach `draft`.
  [CONTENT_STATUS.DRAFT]: 'blog_post_restored',
} as const satisfies Record<ContentStatus, string>;

export async function changePostStatus(
  id: string,
  next: ContentStatus,
  context: AdminActionContext,
): Promise<BlogPostAdminDetail> {
  const post = await BlogPost.findById(id);
  if (!post) throw new NotFoundError('That post was not found. It may have been deleted.');

  // Throws ConflictError (409) if the workflow doesn't allow it; sets `publishedAt` on the first
  // publish only.
  const change = applyStatusTransition(post, next);
  post.set('updatedBy', context.adminId);
  await post.save();

  await logAdminAction(context, STATUS_EVENTS[next], {
    postId: id,
    slug: post.slug,
    from: change.from,
    to: change.to,
  });
  return getPostById(id);
}

/** Only drafts and archived posts. A live or unpublished post must be archived first, so a
 * post that has been public is never destroyed by a single click. */
export async function deletePost(id: string, context: AdminActionContext): Promise<void> {
  const post = await BlogPost.findById(id).select('slug status').lean();
  if (!post) throw new NotFoundError('That post was not found. It may have been deleted.');

  if (post.status !== CONTENT_STATUS.DRAFT && post.status !== CONTENT_STATUS.ARCHIVED) {
    throw new ConflictError(
      'Only drafts and archived posts can be deleted. Archive this post first.',
    );
  }

  await BlogPost.deleteOne({ _id: post._id });
  await logAdminAction(context, 'blog_post_deleted', { postId: id, slug: post.slug });
}
