import { ArticleBody } from '@/components/sections/ArticleBody';
import { ArticleGrid } from '@/components/sections/ArticleGrid';
import { ArticleHeader } from '@/components/sections/ArticleHeader';
import { ArticleTableOfContents } from '@/components/sections/ArticleTableOfContents';
import { ShareLinks } from '@/components/sections/ShareLinks';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { company } from '@/config/company';
import type { BlogPost, BlogPostDetail } from '@/lib/blog';

export interface ArticleViewProps {
  post: BlogPostDetail;
  relatedPosts: readonly BlogPost[];
  canonicalUrl?: string | undefined;
}

/**
 * The article layout for `/blog/[slug]`: breadcrumb, header, share links, body with table of
 * contents, related articles and the closing call to action.
 *
 * Extracted from the page so the admin preview (`/admin/blog/[id]/preview`) renders through this
 * very component, not a lookalike — what the founder previews is what publishing produces. It
 * renders the content only; the caller supplies the surrounding `page-container` (the public page
 * and the admin layout both provide one) and any JSON-LD.
 */
export function ArticleView({ post, relatedPosts, canonicalUrl }: ArticleViewProps) {
  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Blog', href: '/blog' },
          { label: post.title },
        ]}
      />

      {/* A long article may never fit the reveal threshold in any viewport. Keep it visible on first paint. */}
      <article className="mt-8">
        <ArticleHeader post={post} />

        {canonicalUrl && (
          <div className="mt-6">
            <ShareLinks url={canonicalUrl} title={post.title} />
          </div>
        )}

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_16rem]">
          <div className="order-2 max-w-prose min-w-0 lg:order-1">
            <ArticleBody contentHtml={post.contentHtml} />

            {canonicalUrl && (
              <div className="mt-10 max-w-prose border-t border-default pt-6">
                <ShareLinks url={canonicalUrl} title={post.title} />
              </div>
            )}
          </div>

          {post.tableOfContents.length > 0 && (
            <div className="order-1 lg:order-2">
              <ArticleTableOfContents items={post.tableOfContents} />
            </div>
          )}
        </div>
      </article>

      {relatedPosts.length > 0 && (
        <ScrollReveal className="mt-12 max-w-4xl border-t border-default pt-10">
          <h2 className="text-section font-semibold tracking-tight text-primary">
            Related articles
          </h2>
          <ArticleGrid posts={relatedPosts} />
        </ScrollReveal>
      )}

      <ScrollReveal className="mt-12 max-w-prose border-t border-default pt-10">
        <h2 className="text-section font-semibold tracking-tight text-primary">
          Building something for your business?
        </h2>
        <p className="mt-4 text-body-lg text-secondary">
          Tell {company.legalName} what you&rsquo;re building and get a project-specific quote.
        </p>
        <Button href="/quotation" className="mt-6">
          Request a Quote
        </Button>
      </ScrollReveal>
    </>
  );
}
