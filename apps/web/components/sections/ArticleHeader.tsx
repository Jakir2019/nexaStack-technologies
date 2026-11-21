import { ArticleCover } from '@/components/sections/ArticleCover';
import type { BlogPostDetail } from '@/lib/blog';

export interface ArticleHeaderProps {
  post: BlogPostDetail;
}

function formatPublishedDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

/** Title, byline, computed reading time and the featured image — everything above the fold. */
export function ArticleHeader({ post }: ArticleHeaderProps) {
  return (
    <header>
      <div className="flex flex-wrap items-center gap-2 text-label text-secondary">
        <span className="font-mono uppercase tracking-wide text-primary-blue">{post.category}</span>
      </div>

      <h1 className="mt-4 text-page font-semibold tracking-tight text-primary">{post.title}</h1>
      <p className="mt-4 max-w-prose text-body-lg text-secondary">{post.excerpt}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-secondary">
        <span className="font-medium text-primary">{post.author.name}</span>
        <span aria-hidden="true">&middot;</span>
        <span>{post.author.role}</span>
        <span aria-hidden="true">&middot;</span>
        {post.publishedAt && (
          <>
            <time dateTime={post.publishedAt}>{formatPublishedDate(post.publishedAt)}</time>
            <span aria-hidden="true">&middot;</span>
          </>
        )}
        <span>{post.readingTimeMinutes} min read</span>
      </div>

      <ArticleCover
        key={post.coverImage}
        src={post.coverImage}
        alt={post.coverImageAlt?.trim() || `Cover for ${post.title}`}
      />
    </header>
  );
}
