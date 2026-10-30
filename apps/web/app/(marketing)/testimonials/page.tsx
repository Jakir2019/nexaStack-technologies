import type { Metadata } from 'next';

import { withSocialMetadata } from '@/lib/metadata';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { TestimonialCard } from '@/components/sections/TestimonialCard';
import { TestimonialFilterLinks, type TestimonialFilterOption } from '@/components/sections/TestimonialFilterLinks';
import { TestimonialGrid } from '@/components/sections/TestimonialGrid';
import { getProjectBySlug } from '@/config/projects';
import { getServiceBySlug } from '@/config/services';
import { getApprovedTestimonials } from '@/config/testimonials';
import { navigationActions } from '@/config/navigation';
import { env } from '@/lib/env';

interface TestimonialsPageProps {
  searchParams: Promise<{ service?: string; project?: string }>;
}

export const metadata: Metadata = withSocialMetadata({
  title: 'Testimonials',
  description: 'What clients say about working with NexaStack Technologies.',
  alternates: { canonical: '/testimonials' },
});

/** Unique, resolved `relatedServiceSlug`s across a testimonial set, as real filter options. */
function serviceFilterOptions(testimonials: readonly { relatedServiceSlug?: string }[]): TestimonialFilterOption[] {
  const slugs = new Set(testimonials.map((t) => t.relatedServiceSlug).filter((slug): slug is string => Boolean(slug)));
  return [...slugs]
    .map((slug) => {
      const service = getServiceBySlug(slug);
      return service ? { value: slug, label: service.title } : null;
    })
    .filter((option): option is TestimonialFilterOption => option !== null);
}

/** Unique, resolved `relatedProjectSlug`s across a testimonial set, as real filter options. */
function projectFilterOptions(testimonials: readonly { relatedProjectSlug?: string }[]): TestimonialFilterOption[] {
  const slugs = new Set(testimonials.map((t) => t.relatedProjectSlug).filter((slug): slug is string => Boolean(slug)));
  return [...slugs]
    .map((slug) => {
      const project = getProjectBySlug(slug);
      return project ? { value: slug, label: project.title } : null;
    })
    .filter((option): option is TestimonialFilterOption => option !== null);
}

export default async function TestimonialsPage({ searchParams }: TestimonialsPageProps) {
  const params = await searchParams;
  const approved = getApprovedTestimonials();

  const featured = approved.filter((testimonial) => testimonial.featured);
  const featuredIds = new Set(featured.map((testimonial) => testimonial.id));
  const nonFeatured = approved.filter((testimonial) => !featuredIds.has(testimonial.id));

  const serviceOptions = serviceFilterOptions(approved);
  const projectOptions = projectFilterOptions(approved);
  const hasFilterableData = serviceOptions.length > 0 || projectOptions.length > 0;

  // The filter narrows the grid only — same relationship blog's search/filter bar has to its
  // separately-always-shown featured post.
  const gridTestimonials = params.service
    ? nonFeatured.filter((testimonial) => testimonial.relatedServiceSlug === params.service)
    : params.project
      ? nonFeatured.filter((testimonial) => testimonial.relatedProjectSlug === params.project)
      : nonFeatured;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Testimonials',
        item: `${env.NEXT_PUBLIC_SITE_URL}/testimonials`,
      },
    ],
  };

  return (
    <div className="page-container section-y">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Testimonials' }]} />

      <ScrollReveal className="mt-8 max-w-prose">
        <h1 className="text-page font-semibold tracking-tight text-primary">What clients say</h1>
        <p className="mt-4 text-body-lg text-secondary">
          Feedback from people NexaStack Technologies has actually worked with.
        </p>
      </ScrollReveal>

      {approved.length === 0 ? (
        <ScrollReveal className="mt-12 max-w-prose">
          <p className="text-body-lg text-secondary">
            Client testimonials will appear here as projects are completed.
          </p>
        </ScrollReveal>
      ) : (
        <ScrollReveal className="mt-12">
          {featured.length > 0 && (
            <div className="mb-12">
              <h2 className="text-section font-semibold tracking-tight text-primary">Featured</h2>
              <ul className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {featured.map((testimonial) => (
                  <li key={testimonial.id}>
                    <TestimonialCard testimonial={testimonial} size="featured" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={featured.length > 0 ? 'border-t border-default pt-10' : undefined}>
            <h2 className="text-section font-semibold tracking-tight text-primary">
              All testimonials
            </h2>

            {hasFilterableData && (
              <div className="mt-6 flex flex-col gap-3 border-y border-default py-6">
                <TestimonialFilterLinks
                  label="Service"
                  paramName="service"
                  options={serviceOptions}
                  activeValue={params.service}
                  currentParams={params}
                  basePath="/testimonials"
                />
                <TestimonialFilterLinks
                  label="Project"
                  paramName="project"
                  options={projectOptions}
                  activeValue={params.project}
                  currentParams={params}
                  basePath="/testimonials"
                />
              </div>
            )}

            <div className="mt-6">
              {gridTestimonials.length > 0 ? (
                <TestimonialGrid testimonials={gridTestimonials} />
              ) : (
                <p className="text-body-lg text-secondary">
                  No testimonials match that filter yet.
                </p>
              )}
            </div>
          </div>
        </ScrollReveal>
      )}

      <ScrollReveal className="mt-12 max-w-prose border-t border-default pt-10">
        <h2 className="text-section font-semibold tracking-tight text-primary">
          Want results like these?
        </h2>
        <p className="mt-4 text-body-lg text-secondary">
          Tell us what you&rsquo;re building and get a project-specific quote.
        </p>
        <Button href={navigationActions.quote.href} className="mt-6">
          {navigationActions.quote.label}
        </Button>
      </ScrollReveal>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </div>
  );
}
