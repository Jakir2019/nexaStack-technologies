import Link from 'next/link';
import Image from 'next/image';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Project } from '@/config/projects';
import { cn } from '@/lib/cn';

export interface ProjectCardProps {
  project: Project;
  /** `featured`: single-project hero layout (image beside content at `md`+). `tile`: grid cell (image always on top). */
  layout: 'featured' | 'tile';
  headingLevel?: 'h2' | 'h3';
}

const NEW_TAB_NOTICE = '(opens in a new tab)';

/**
 * Unlike `ServiceCard`/`SolutionCard`, this is not one stretched link — a project has a
 * case study plus optional live-site and repository destinations, and nesting
 * links under one wrapping link is invalid HTML and swallows keyboard access. So: only the
 * title links to the case study, and the controls at the bottom are independent,
 * clearly labelled links. Hover
 * elevation is a plain `:hover` on the outer element, since there's no shared overlay to drive
 * it through a `group`.
 */
export function ProjectCard({ project, layout, headingLevel = 'h3' }: ProjectCardProps) {
  const featured = layout === 'featured';
  const Heading = headingLevel;

  return (
    <article
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-card border border-default bg-surface shadow-card transition duration-150 ease-out hover:border-default-hover hover:shadow-card-hover',
        featured && 'md:flex-row lg:mx-auto lg:w-2/3',
      )}
    >
      {/* Render only verified screenshots; reserved legacy paths keep the fallback. */}
      <div
        className={cn(
          'relative aspect-video shrink-0 overflow-hidden bg-background-alt',
          featured
            ? 'rounded-t-card md:w-2/5 md:rounded-t-none md:rounded-l-card'
            : 'w-full rounded-t-card',
        )}
      >
        {project.image && project.imageAlt ? (
          <Image
            src={project.image}
            alt={project.imageAlt}
            fill
            sizes="(min-width: 1024px) 400px, (min-width: 768px) 50vw, 100vw"
            className="object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col" aria-hidden="true">
            <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-default/70 bg-surface px-3">
              <span className="size-2 rounded-full bg-cyan" />
              <span className="size-2 rounded-full bg-primary-blue" />
              <span className="size-2 rounded-full bg-violet" />
            </div>
            <div className="flex flex-1 flex-col justify-center gap-2 p-6">
              <p className="text-card font-semibold text-primary">{project.title}</p>
              <p className="text-label text-secondary">
                Project illustration · Screenshot unavailable
              </p>
            </div>
          </div>
        )}
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col gap-4 p-6', featured && 'md:p-8')}>
        <div className="flex flex-wrap items-center gap-3">
          <Heading className="text-card font-semibold text-primary">
            <Link
              href={project.caseStudyHref}
              className="rounded-field text-primary focus-ring hover:text-primary-blue-hover"
            >
              {project.title}
            </Link>
          </Heading>
          {project.status === 'in-development' && <Badge>In active development</Badge>}
          {project.status === 'demonstration' && <Badge>Demonstration</Badge>}
        </div>

        {project.category && <p className="text-label text-primary-blue">{project.category}</p>}
        <p className="flex-1 text-body text-secondary">{project.summary}</p>

        <ul className="flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <li key={tag}>
              <Badge mono>{tag}</Badge>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button href={project.caseStudyHref} variant="primary">
            View Case Study
          </Button>
          {project.liveUrl && (
            <Button
              href={project.liveUrl}
              variant="secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Live Website <span className="sr-only">{NEW_TAB_NOTICE}</span>
            </Button>
          )}
          {project.repoUrl && (
            <Button
              href={project.repoUrl}
              variant="secondary"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View source on GitHub ${NEW_TAB_NOTICE}`}
              className="size-12 px-0"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-5 shrink-0"
              >
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
