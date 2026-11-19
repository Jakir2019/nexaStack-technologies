import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * READ-ONLY mirror of `apps/api/src/models/BlogPost.ts`. The Express API owns every write; this
 * app only reads published posts for the public `/blog` pages (`lib/blog.ts`). Keep the fields
 * and the explicit collection name in step with the API model. Nothing in `apps/web` may write
 * to this collection, and every public query must filter on `status: 'published'`.
 *
 * `contentHtml` is produced only by the API's markdown renderer, which escapes everything it does not
 * emit itself. It is still NOT taken on trust: `ArticleBody` re-checks it against the shared
 * article-HTML allow-list (`findUnsafeArticleHtml`) before rendering it with
 * `dangerouslySetInnerHTML`, so a value that reached the database by any other route is not injected.
 */
const tocItemSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    level: { type: Number, required: true },
  },
  { _id: false },
);

const blogPostSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true },
    excerpt: { type: String, required: true },
    category: { type: Schema.Types.ObjectId, required: true },
    tags: { type: [String], default: [] },
    coverImage: { type: String },
    coverMediaId: { type: Schema.Types.ObjectId },
    coverImageAlt: { type: String },
    contentMarkdown: { type: String, required: true },
    contentHtml: { type: String, required: true },
    readingTimeMinutes: { type: Number, min: 1 },
    tableOfContents: { type: [tocItemSchema], default: [] },
    status: { type: String, required: true },
    featured: { type: Boolean, required: true, default: false },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'blogposts' },
);

export type BlogPostDocument = InferSchemaType<typeof blogPostSchema>;

// `models.BlogPost` is reused across hot reloads in development so Mongoose doesn't throw
// "Cannot overwrite model once compiled".
export const BlogPost =
  (models.BlogPost as Model<BlogPostDocument> | undefined) ??
  model<BlogPostDocument>('BlogPost', blogPostSchema);
