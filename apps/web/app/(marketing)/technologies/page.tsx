import type { Metadata } from 'next';
import Link from 'next/link';

import { withSocialMetadata } from '@/lib/metadata';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { company } from '@/config/company';
import {
  fullTechnologyCategories,
  getRelatedProjectsForCategory,
  getRelatedServicesForCategory,
} from '@/config/technologies';
import { env } from '@/lib/env';

// Full `/technologies` page, superseding the earlier grid-of-tiles stub. A single-column
// reading page — not the homepage's bento treatment, which root CLAUDE.md section 8 scopes
// to the homepage Technology Stack section only — covering all eleven categories from
// `config/technologies.ts`'s `fullTechnologyCategories` (the homepage's six, reused
// unchanged, plus five more built for this page). Server Component throughout; `ScrollReveal`
// is the only Client Component, reused unchanged from every other detail page on the site.

const H2_CLASS = 'scroll-mt-24 text-section font-semibold tracking-tight text-primary';
const SECTION_CLASS = 'mt-12 max-w-prose';

export const metadata: Metadata = withSocialMetadata({
  title: 'Technology Stack',
  description:
    'The real technologies NexaStack Technologies builds with, organised by category, including what is deliberately not used and what is planned but not yet installed.',
  alternates: { canonical: '/technologies' },
});

function ChipRow({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item}>
          <Badge mono>{item}</Badge>
        </li>
      ))}
    </ul>
  );
}

export default function TechnologiesPage() {
  const categoriesWithRelated = fullTechnologyCategories.map((category) => ({
    category,
    relatedServices: getRelatedServicesForCategory(category),
    relatedProjects: getRelatedProjectsForCategory(category),
  }));
  const categoryGroupsWithLinks = categoriesWithRelated.filter(
    ({ relatedServices, relatedProjects }) => relatedServices.length > 0 || relatedProjects.length > 0,
  );

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Technology Stack',
        item: `${env.NEXT_PUBLIC_SITE_URL}/technologies`,
      },
    ],
  };

  return (
    <div className="page-container section-y">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Technology Stack' }]} />

      <ScrollReveal className="mt-8 max-w-prose">
        <h1 className="text-page font-semibold tracking-tight text-primary">Technology Stack</h1>
        <p className="mt-4 text-body-lg text-secondary">
          The real technologies {company.legalName} builds with, organised by category —
          including what is deliberately not used, and what is planned but not yet
          installed, stated plainly rather than implied.
        </p>
      </ScrollReveal>

      <nav aria-label="Categories" className="mt-10 max-w-prose border-y border-default py-4">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-label text-secondary">
          {fullTechnologyCategories.map((category) => (
            <li key={category.id}>
              <a
                href={`#${category.id}`}
                className="rounded-field focus-ring hover:text-primary-blue-hover"
              >
                {category.label}
              </a>
            </li>
          ))}
          <li>
            <a href="#related" className="rounded-field focus-ring hover:text-primary-blue-hover">
              Related services and projects
            </a>
          </li>
        </ul>
      </nav>

      {fullTechnologyCategories.map((category) => (
        <ScrollReveal key={category.id} className={SECTION_CLASS}>
          <h2 id={category.id} className={H2_CLASS}>
            {category.label}
          </h2>
          <p className="mt-4 text-body-lg text-secondary">{category.description}</p>
          {category.items.length > 0 ? (
            <ChipRow items={category.items} />
          ) : (
            <p className="mt-4 text-body text-secondary">
              Nothing installed yet in this category — see the description above for what&rsquo;s
              intended.
            </p>
          )}
        </ScrollReveal>
      ))}

      <ScrollReveal className="mt-12 max-w-4xl">
        <h2 id="related" className={H2_CLASS}>
          Related services and projects
        </h2>
        {categoryGroupsWithLinks.length > 0 ? (
          <ul className="mt-6 flex flex-col gap-6">
            {categoryGroupsWithLinks.map(({ category, relatedServices, relatedProjects }) => (
              <li key={category.id}>
                <h3 className="text-card font-semibold text-primary">{category.label}</h3>
                <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-body text-secondary">
                  {relatedServices.map((service) => (
                    <li key={service.slug}>
                      <Link
                        href={`/services/${service.slug}`}
                        className="rounded-field text-primary-blue underline underline-offset-4 focus-ring hover:text-primary-blue-hover"
                      >
                        {service.title}
                      </Link>
                    </li>
                  ))}
                  {relatedProjects.map((project) => (
                    <li key={project.slug}>
                      <Link
                        href={project.caseStudyHref}
                        className="rounded-field text-primary-blue underline underline-offset-4 focus-ring hover:text-primary-blue-hover"
                      >
                        {project.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 max-w-prose text-body-lg text-secondary">
            No linked services or portfolio projects yet.
          </p>
        )}
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose border-t border-default pt-10">
        <h2 className={H2_CLASS}>Building something with this stack?</h2>
        <p className="mt-4 text-body-lg text-secondary">
          Tell {company.legalName} what you&rsquo;re building and get a project-specific
          quote scoped around it.
        </p>
        <Button href="/quotation" className="mt-6">
          Request a Quote
        </Button>
      </ScrollReveal>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </div>
  );
}
