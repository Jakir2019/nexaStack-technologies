import Image from 'next/image';
import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import type { BlogPost } from '@/lib/blog';
import { cn } from '@/lib/cn';

export interface ArticleCardProps {
  post: BlogPost;
}

function formatPublishedDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * One article card in the listing grid. `coverImage` is optional on `BlogPost` — same reason
 * `Project.image` is optional on `ProjectCard`: no real post exists yet, so the decorative
 * gradient mockup frame (identical markup/classes to `ProjectCard`'s) is what actually renders
 * today. `next/image` only activates once a post supplies a real path.
 */
export function ArticleCard({ post }: ArticleCardProps) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-default bg-surface shadow-card transition duration-150 ease-out hover:border-default-hover hover:shadow-card-hover">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-t-card bg-background-alt">
        {post.coverImage ? (
          <Image
            src={post.coverImage}
            alt={post.coverImageAlt ?? ''}
            fill
            sizes="(min-width: 1024px) 33vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 flex flex-col">
            <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-default/70 bg-surface px-3">
              <span className="size-2 rounded-full bg-cyan" />
              <span className="size-2 rounded-full bg-primary-blue" />
              <span className="size-2 rounded-full bg-violet" />
            </div>
            <div className="flex-1 bg-linear-to-br from-cyan via-primary-blue to-violet opacity-15" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center gap-3 text-label text-secondary">
          <span className="font-mono tracking-wide text-primary-blue uppercase">
            {post.category}
          </span>
          <span aria-hidden="true">&middot;</span>
          <time dateTime={post.publishedAt}>{formatPublishedDate(post.publishedAt)}</time>
          {post.readingTimeMinutes && <span>{post.readingTimeMinutes} min read</span>}
        </div>

        <h2 className="text-card font-semibold text-primary">
          <Link
            href={`/blog/${post.slug}`}
            className={cn('rounded-field focus-ring', 'hover:text-primary-blue-hover')}
          >
            {post.title}
          </Link>
        </h2>

        <p className="flex-1 text-body text-secondary">{post.excerpt}</p>
        <Link
          href={`/blog/${post.slug}`}
          className="inline-flex min-h-11 items-center rounded-field text-primary-blue focus-ring hover:text-primary-blue-hover"
          aria-label={`Read article: ${post.title}`}
        >
          Read Article <span aria-hidden="true">&nbsp;→</span>
        </Link>

        {post.tags.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <li key={tag}>
                <Badge mono>{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
