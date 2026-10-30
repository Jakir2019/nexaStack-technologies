import type { Metadata } from 'next';

import { withSocialMetadata } from '@/lib/metadata';
import { SolutionCard } from '@/components/sections/SolutionCard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { company } from '@/config/company';
import { solutions } from '@/config/solutions';
import { env } from '@/lib/env';

export const metadata: Metadata = withSocialMetadata({
  title: 'Solutions and Industries',
  description:
    'How NexaStack Technologies approaches recruitment platforms, logistics systems, business-management tools, e-commerce and startup MVPs — tailored to what each kind of business actually needs.',
  alternates: { canonical: '/solutions' },
});

/**
 * Full solutions listing — the "browse all five" destination, distinct from the homepage's
 * `SolutionsIndustries` section (an asymmetric, homepage-only teaser layout — see that
 * component's own doc comment). This page uses the same standard 3-up grid as the Services
 * listing page instead, since all five entries read here as equal-weight options, not a
 * hierarchy. `SolutionCard` is reused unchanged in shape, extended with one optional
 * `ctaLabel` prop so the homepage's existing call site (which relies on the `'Explore'`
 * default) renders exactly as before.
 */
export default function SolutionsPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Solutions and Industries',
        item: `${env.NEXT_PUBLIC_SITE_URL}/solutions`,
      },
    ],
  };

  return (
    <>
      <section aria-labelledby="solutions-heading" className="bg-background">
        <div className="page-container section-y">
          <Breadcrumb
            items={[{ label: 'Home', href: '/' }, { label: 'Solutions and Industries' }]}
          />

          <ScrollReveal className="mx-auto mt-8 max-w-2xl text-center">
            <h1
              id="solutions-heading"
              className="text-page font-semibold tracking-tight text-primary"
            >
              Solutions and Industries
            </h1>
            <p className="mt-4 text-body-lg text-secondary">
              {company.legalName} builds around what each kind of business actually needs, not an
              off-the-shelf package applied regardless of fit. The pages below describe how the same
              MERN and Next.js stack, and the same development process, would approach a few common
              kinds of projects — a starting point for a conversation, not a fixed template.
            </p>
          </ScrollReveal>
        </div>
      </section>

      <section aria-labelledby="solutions-grid-heading" className="bg-background-alt">
        <div className="page-container section-y">
          <h2 id="solutions-grid-heading" className="sr-only">
            All Solutions
          </h2>
          <ScrollReveal>
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {solutions.map((solution) => (
                <li key={solution.slug}>
                  <SolutionCard solution={solution} ctaLabel="View Details" />
                </li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </>
  );
}
