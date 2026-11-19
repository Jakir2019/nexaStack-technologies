import { CONTENT_STATUS, CONTENT_STATUSES } from '@nexastack/shared';
import mongoose, { type InferSchemaType, type Model } from 'mongoose';

// See AdminUser.ts's comment: named imports from 'mongoose' don't reliably resolve under
// Node's raw ESM loader in this pure-Node project.
const { Schema, model, models } = mongoose;

/**
 * A blog post. Deliberately has no author field: the public byline is the founder, stamped from
 * `company.ts` at read time. `createdBy`/`updatedBy` record which admin account acted, for audit.
 *
 * `contentMarkdown` is the editable source; `contentHtml` and `tableOfContents` are derived from
 * it by lib/markdown.ts on every save, so the public site never renders markdown at read time.
 * `contentHtml` is trusted only because that renderer escapes everything it does not emit itself.
 *
 * `apps/web/lib/models/BlogPost.ts` is a read-only mirror of this schema (the API owns writes).
 * Keep the two — and the explicit collection name — in step.
 */
const tocItemSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    level: { type: Number, required: true, enum: [2, 3] },
  },
  { _id: false },
);

const blogPostSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
    },
    excerpt: { type: String, required: true, trim: true, minlength: 20, maxlength: 300 },
    category: { type: Schema.Types.ObjectId, ref: 'BlogCategory', required: true },
    tags: {
      type: [{ type: String, trim: true, maxlength: 30 }],
      default: [],
      validate: (v: string[]) => v.length <= 8,
    },
    // What the site shows: a Media Library URL (set from the library record whenever `coverMediaId`
    // is set, and kept in step when that item's file is replaced) or a legacy site path.
    coverImage: { type: String, trim: true, maxlength: 200 },
    // A real reference to the Media Library item chosen as the cover. This is what lets the library
    // refuse to delete an image a post is using, and repoint posts when its file is replaced.
    coverMediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
    coverImageAlt: { type: String, trim: true, maxlength: 200 },
    contentMarkdown: { type: String, required: true, maxlength: 50_000 },
    contentHtml: { type: String, required: true },
    readingTimeMinutes: { type: Number, min: 1 },
    tableOfContents: { type: [tocItemSchema], default: [] },
    status: { type: String, required: true, enum: CONTENT_STATUSES, default: CONTENT_STATUS.DRAFT },
    featured: { type: Boolean, required: true, default: false },
    // Set on the first transition to `published` and never overwritten: an unpublished post that
    // goes live again keeps its original date.
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  },
  { timestamps: true, collection: 'blogposts' },
);

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ category: 1, status: 1 });
blogPostSchema.index({ updatedAt: -1 });
// Looked up on every Media Library delete and replace. Sparse: most posts have no library cover.
blogPostSchema.index({ coverMediaId: 1 }, { sparse: true });

export type BlogPostDocument = InferSchemaType<typeof blogPostSchema>;

// Explicit Model<T> on both sides of `??` — see AdminUser.ts's comment for why.
export const BlogPost =
  (models.BlogPost as Model<BlogPostDocument> | undefined) ??
  model<BlogPostDocument>('BlogPost', blogPostSchema);
