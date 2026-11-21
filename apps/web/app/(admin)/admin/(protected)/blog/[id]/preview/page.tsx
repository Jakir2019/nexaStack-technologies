import { CONTENT_STATUS, OBJECT_ID_PATTERN } from '@nexastack/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { LoadError } from '@/components/admin/content/LoadError';
import { StatusBadge } from '@/components/admin/content/StatusBadge';
import { ArticleView } from '@/components/sections/ArticleView';
import { Button } from '@/components/ui/Button';
import { getBlogPost } from '@/lib/adminBlog.server';
import { blogPostDetailFromAdmin, getRelatedPostsFor } from '@/lib/blog';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Preview blog post',
};

interface PreviewBlogPostPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Preview of a post in ANY status, rendered through `ArticleView`: the exact component the public
 * `/blog/[slug]` page uses, fed the exact `BlogPostDetail` shape the public data layer produces
 * (`blogPostDetailFromAdmin`). There is no preview-only layout to drift from the live one. It shows
 * the LAST SAVED version, not unsaved edits in the editor. The admin layout already sets
 * `noindex`, so a preview is never indexed.
 */
export default async function PreviewBlogPostPage({ params }: PreviewBlogPostPageProps) {
  const { id } = await params;
  if (!OBJECT_ID_PATTERN.test(id)) notFound();

  const result = await getBlogPost(id);
  if (!result.ok && result.status === 404) notFound();
  if (!result.ok && result.status === 401) redirect('/admin/login');
  if (!result.ok) {
    return <LoadError subject="this post" status={result.status} message={result.message} />;
  }

  const admin = result.data;
  const post = blogPostDetailFromAdmin(admin);
  const relatedPosts = await getRelatedPostsFor(post).catch(() => {
    console.warn('[blog] Related articles could not be loaded for the admin preview.');
    return [];
  });
  const isLive = admin.status === CONTENT_STATUS.PUBLISHED;

  return (
    <div>
      <div
        role="note"
        aria-label="Preview notice"
        className="mb-8 flex flex-col gap-3 rounded-card border border-strong bg-surface p-4 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <p className="flex flex-wrap items-center gap-3 text-body font-semibold text-primary">
            Preview
            <StatusBadge status={admin.status} />
          </p>
          <p className="mt-1 text-label text-secondary">
            {isLive ? (
              <>
                This is the live article. It is public at{' '}
                <Link
                  href={`/blog/${admin.slug}`}
                  className="rounded-field font-mono text-primary-blue underline underline-offset-4 focus-ring hover:text-primary-blue-hover"
                >
                  /blog/{admin.slug}
                </Link>
                .
              </>
            ) : (
              'Not visible to the public. This is how it will look once published, showing the last saved version.'
            )}
          </p>
        </div>
        <Button href={`/admin/blog/${admin.id}/edit`} variant="secondary">
          Back to editor
        </Button>
      </div>

      <ArticleView
        post={post}
        relatedPosts={relatedPosts}
        canonicalUrl={isLive ? `${env.NEXT_PUBLIC_SITE_URL}/blog/${post.slug}` : undefined}
      />
    </div>
  );
}
