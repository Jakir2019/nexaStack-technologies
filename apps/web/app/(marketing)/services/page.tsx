import type { Metadata } from 'next';

import { withSocialMetadata } from '@/lib/metadata';
import { ServiceCard } from '@/components/sections/ServiceCard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { company } from '@/config/company';
import { navigationActions } from '@/config/navigation';
import { getServiceBySlug, services, type Service } from '@/config/services';
import { env } from '@/lib/env';

export const metadata: Metadata = withSocialMetadata({
  title: 'Services',
  description:
    'Web development services from NexaStack Technologies — business websites, full-stack MERN and Next.js applications, admin dashboards, backend APIs, ongoing maintenance, and performance, SEO and accessibility audits.',
  alternates: { canonical: '/services' },
});

// Real, non-arbitrary split: services that build something new vs. services that work on
// something that already exists. Not every service list clusters this cleanly — this one does.
const BUILD_SLUGS = [
  'business-websites',
  'mern-nextjs-applications',
  'admin-dashboards',
  'backend-and-apis',
];
const SUPPORT_SLUGS = ['maintenance-and-bug-fixing', 'performance-seo-audits'];

function getServices(slugs: readonly string[]): Service[] {
  return slugs.map((slug) => {
    const service = getServiceBySlug(slug);
    if (!service) throw new Error(`Unknown service slug in services page category list: ${slug}`);
    return service;
  });
}

/**
 * Full services listing — the destination for the homepage's "View all services" button,
 * distinct from `FeaturedServices` (the homepage teaser). Server Component throughout.
 *
 * `ServiceCard` is reused unchanged in shape, extended with two optional props
 * (`relatedTechnologies`, `ctaLabel`) rather than forked, so the homepage's existing call
 * site renders exactly as before. `Service` JSON-LD covers all six services; `BreadcrumbList`
 * follows the same pattern as `/about/page.tsx`.
 */
export default function ServicesPage() {
  const buildServices = getServices(BUILD_SLUGS);
  const supportServices = getServices(SUPPORT_SLUGS);

  const serviceJsonLd = services.map((service) => ({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.title,
    description: service.summary,
    url: `${env.NEXT_PUBLIC_SITE_URL}/services/${service.slug}`,
    provider: {
      '@type': 'Organization',
      name: company.legalName,
      url: env.NEXT_PUBLIC_SITE_URL,
    },
  }));

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Services',
        item: `${env.NEXT_PUBLIC_SITE_URL}/services`,
      },
    ],
  };

  return (
    <>
      {/* Page header */}
      <section aria-labelledby="services-heading" className="bg-background">
        <div className="page-container section-y">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Services' }]} />

          <ScrollReveal className="mx-auto mt-8 max-w-2xl text-center">
            <h1
              id="services-heading"
              className="text-page font-semibold tracking-tight text-primary"
            >
              Services
            </h1>
            <p className="mt-4 text-body-lg text-secondary">
              NexaStack builds and maintains web projects end to end — marketing sites, full-stack
              applications, admin tools, APIs and the ongoing work of keeping them running well.
              There&rsquo;s no fixed package: every engagement is scoped around what your project
              actually needs, from a single landing page to a full application with its own backend.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Building Your Project */}
      <section aria-labelledby="services-build-heading" className="bg-background-alt">
        <div className="page-container section-y">
          <ScrollReveal>
            <h2
              id="services-build-heading"
              className="text-section font-semibold tracking-tight text-primary"
            >
              Building Your Project
            </h2>
            <p className="mt-4 max-w-2xl text-body-lg text-secondary">
              Something new, from the ground up.
            </p>

            <ul className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {buildServices.map((service) => (
                <li key={service.slug}>
                  <ServiceCard
                    service={service}
                    relatedTechnologies={service.relatedTechnologies}
                    ctaLabel="View Details"
                  />
                </li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </section>

      {/* Ongoing Support & Audits */}
      <section aria-labelledby="services-support-heading" className="bg-background">
        <div className="page-container section-y">
          <ScrollReveal>
            <h2
              id="services-support-heading"
              className="text-section font-semibold tracking-tight text-primary"
            >
              Ongoing Support &amp; Audits
            </h2>
            <p className="mt-4 max-w-2xl text-body-lg text-secondary">
              Keeping what already exists running well.
            </p>

            <ul className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
              {supportServices.map((service) => (
                <li key={service.slug}>
                  <ServiceCard
                    service={service}
                    relatedTechnologies={service.relatedTechnologies}
                    ctaLabel="View Details"
                  />
                </li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </section>

      {/* Closing CTA */}
      <section aria-labelledby="services-cta-heading" className="bg-background-alt">
        <div className="page-container section-y">
          <ScrollReveal className="mx-auto max-w-xl text-center">
            <h2
              id="services-cta-heading"
              className="text-section font-semibold tracking-tight text-primary"
            >
              Not sure which service fits?
            </h2>
            <p className="mt-4 text-body-lg text-secondary">
              Tell us what you&rsquo;re building and we&rsquo;ll scope it together — no fixed
              package, just a plan for what your project actually needs.
            </p>
            <div className="mt-8 flex justify-center">
              <Button href={navigationActions.quote.href}>{navigationActions.quote.label}</Button>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </>
  );
}
