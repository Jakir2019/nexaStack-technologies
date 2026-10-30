import type { Metadata } from 'next';
import { cache } from 'react';

import { ArticleGrid } from '@/components/sections/ArticleGrid';
import { BlogFilterLinks } from '@/components/sections/BlogFilterLinks';
import { BlogSearchInput } from '@/components/sections/BlogSearchInput';
import { BlogUnavailable } from '@/components/sections/BlogUnavailable';
import { FeaturedArticle } from '@/components/sections/FeaturedArticle';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { company } from '@/config/company';
import { navigationActions } from '@/config/navigation';
import { env } from '@/lib/env';
import { DEFAULT_SHARE_IMAGE } from '@/lib/blogImage';
import {
  filterAndPaginatePosts,
  getAllPosts,
  getCategories,
  getFeaturedPost,
  getTags,
  logBlogReadFailure,
} from '@/lib/blog';

// Full `/blog` page, reading published posts from MongoDB through `lib/blog.ts`. With zero
// published posts, this page renders only the intro and the honest empty-state message: no
// featured article, no search box, no filter links, no pagination — those all depend on real
// content existing, and a search box over nothing is a hollow control. The full interactive
// experience is also verified against fixture data on `/dev/blog-preview`, which reuses every
// component below unchanged. Rendered per request (it awaits `searchParams`), so publishing or
// unpublishing in the admin shows here immediately.

interface BlogPageProps {
  searchParams: Promise<{ q?: string; category?: string; tag?: string; page?: string }>;
}

// Use the displayed page and filters for canonicals. React cache shares the data read
// with the page in this request; Next.js blocks metadata streaming for HTML-limited bots.
export async function generateMetadata({ searchParams }: BlogPageProps): Promise<Metadata> {
  const params = await searchParams;
  const data = await loadBlogListData();
  if (!data) return { title: 'Blog unavailable', robots: { index: false } };

  const gridPosts = data.featuredPost
    ? data.allPosts.filter((post) => post.slug !== data.featuredPost?.slug)
    : data.allPosts;
  const { currentPage } = filterAndPaginatePosts(gridPosts, params);
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.category) query.set('category', params.category);
  if (params.tag) query.set('tag', params.tag);
  if (currentPage > 1) query.set('page', String(currentPage));
  const canonical = query.size ? `/blog?${query.toString()}` : '/blog';
  const title = currentPage > 1 ? `Blog — Page ${currentPage}` : 'Blog';
  const description =
    'Articles on web development and building better websites, from NexaStack Technologies.';

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: company.legalName,
      title,
      description,
      url: canonical,
      images: [DEFAULT_SHARE_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [DEFAULT_SHARE_IMAGE],
    },
  };
}

/**
 * Everything the list needs from the database, or `null` if it cannot be read. The failure is logged
 * here (server-side, real cause) and the page shows `BlogUnavailable` rather than the generic error
 * boundary, so a database outage never leaves the visitor with a broken page.
 */
const loadBlogListData = cache(async () => {
  try {
    const allPosts = await getAllPosts();
    const hasAnyPosts = allPosts.length > 0;
    return {
      allPosts,
      featuredPost: hasAnyPosts ? await getFeaturedPost() : null,
      categories: hasAnyPosts ? await getCategories() : [],
      tags: hasAnyPosts ? await getTags() : [],
    };
  } catch (error) {
    logBlogReadFailure({ route: '/blog' }, error);
    return null;
  }
});

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const params = await searchParams;
  const data = await loadBlogListData();
  const isUnavailable = data === null;
  const { allPosts, featuredPost, categories, tags } = data ?? {
    allPosts: [],
    featuredPost: null,
    categories: [],
    tags: [],
  };
  const hasAnyPosts = allPosts.length > 0;
  const gridSourcePosts = featuredPost
    ? allPosts.filter((post) => post.slug !== featuredPost.slug)
    : allPosts;
  const { posts, currentPage, totalPages } = hasAnyPosts
    ? filterAndPaginatePosts(gridSourcePosts, params)
    : { posts: [], currentPage: 1, totalPages: 1 };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${env.NEXT_PUBLIC_SITE_URL}/blog` },
    ],
  };

  return (
    <div className="page-container section-y">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Blog' }]} />

      <ScrollReveal className="mt-8 max-w-prose">
        <h1 className="text-page font-semibold tracking-tight text-primary">Blog</h1>
        <p className="mt-4 text-body-lg text-secondary">
          Articles on web development and building better websites.
        </p>
      </ScrollReveal>

      {isUnavailable ? (
        <BlogUnavailable retryHref="/blog" />
      ) : hasAnyPosts ? (
        <ScrollReveal className="mt-12">
          {featuredPost && (
            <div className="mb-12">
              <FeaturedArticle post={featuredPost} />
            </div>
          )}

          <div className="flex flex-col gap-6 border-y border-default py-6 md:flex-row md:items-end md:justify-between">
            <BlogSearchInput id="blog-search" />
            <div className="flex flex-col gap-3">
              <BlogFilterLinks
                label="Category"
                paramName="category"
                options={categories}
                activeValue={params.category}
                currentParams={params}
                basePath="/blog"
              />
              <BlogFilterLinks
                label="Tag"
                paramName="tag"
                options={tags}
                activeValue={params.tag}
                currentParams={params}
                basePath="/blog"
              />
            </div>
          </div>

          <ArticleGrid posts={posts} />

          <Pagination
            basePath="/blog"
            currentPage={currentPage}
            totalPages={totalPages}
            currentParams={params}
          />
        </ScrollReveal>
      ) : (
        <ScrollReveal className="mt-12 max-w-prose">
          <p className="text-body-lg text-secondary">
            No articles published yet — check back soon.
          </p>
        </ScrollReveal>
      )}

      <ScrollReveal className="mt-12 max-w-prose border-t border-default pt-10">
        <h2 className="text-section font-semibold tracking-tight text-primary">
          Looking for something else?
        </h2>
        <p className="mt-4 text-body-lg text-secondary">
          Explore {company.legalName}&rsquo;s services, or tell us what you&rsquo;re building and
          get a project-specific quote.
        </p>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row">
          <Button href={navigationActions.quote.href}>{navigationActions.quote.label}</Button>
          <Button href="/services" variant="secondary">
            Explore Services
          </Button>
        </div>
      </ScrollReveal>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </div>
  );
}
