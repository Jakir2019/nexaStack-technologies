import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { withSocialMetadata } from '@/lib/metadata';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/Accordion';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { ProjectGrid } from '@/components/sections/ProjectGrid';
import { company } from '@/config/company';
import { getProjectBySlug } from '@/config/projects';
import { getServiceBySlug, services } from '@/config/services';
import { getServiceDetailBySlug } from '@/config/service-details';
import { env } from '@/lib/env';

interface ServiceDetailPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: ServiceDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  const detail = getServiceDetailBySlug(slug);
  if (!service || !detail) return {};

  return withSocialMetadata({
    title: service.title,
    description: detail.introduction,
    alternates: { canonical: `/services/${service.slug}` },
  });
}

const DOT_LIST_ITEM = 'flex gap-3';
const DOT_MARKER = 'mt-2.5 size-1.5 shrink-0 rounded-full bg-primary-blue';

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
      {items.map((item) => (
        <li key={item} className={DOT_LIST_ITEM}>
          <span aria-hidden="true" className={DOT_MARKER} />
          <p className="text-body text-secondary">{item}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Full `/services/[slug]` detail template, superseding the earlier title-and-summary stub. Long-
 * form content comes from `config/service-details.ts`, keyed by the same slug as
 * `config/services.ts`. Server Component throughout — `Accordion` (components/ui/Accordion.tsx)
 * is the only Client Component, reused unchanged from the homepage FAQ build.
 *
 * `config/services.ts` currently defines six real services (root CLAUDE.md 22.10), not five —
 * `generateStaticParams` and `serviceDetails` cover all six.
 */
export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  const detail = getServiceDetailBySlug(slug);
  if (!service || !detail) notFound();

  const relatedProjects = detail.relatedProjectSlugs
    .map((projectSlug) => getProjectBySlug(projectSlug))
    .filter((project) => project !== undefined);

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.title,
    description: detail.introduction,
    url: `${env.NEXT_PUBLIC_SITE_URL}/services/${service.slug}`,
    provider: {
      '@type': 'Organization',
      name: company.legalName,
      url: env.NEXT_PUBLIC_SITE_URL,
    },
  };

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
      {
        '@type': 'ListItem',
        position: 3,
        name: service.title,
        item: `${env.NEXT_PUBLIC_SITE_URL}/services/${service.slug}`,
      },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: detail.faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return (
    <div className="page-container section-y">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Services', href: '/services' },
          { label: service.title },
        ]}
      />

      <ScrollReveal className="mt-8 max-w-prose">
        <h1 className="text-page font-semibold tracking-tight text-primary">{service.title}</h1>
        <p className="mt-4 text-body-lg text-secondary">{detail.introduction}</p>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">
          Problems this service solves
        </h2>
        <div className="mt-6">
          <BulletList items={detail.problemsSolved} />
        </div>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Who this is for</h2>
        <p className="mt-4 text-body-lg text-secondary">{detail.targetClients}</p>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">What&rsquo;s included</h2>
        <div className="mt-6">
          <BulletList items={detail.includedFeatures} />
        </div>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Development approach</h2>
        <p className="mt-4 text-body-lg text-secondary">{detail.developmentApproach}</p>
        <Button variant="text" href="/#process-heading" className="mt-2">
          See the full process
        </Button>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Technologies used</h2>
        {detail.technologiesUsed.length > 0 ? (
          <ul className="mt-6 flex flex-wrap gap-2">
            {detail.technologiesUsed.map((tech) => (
              <li key={tech}>
                <Badge mono>{tech}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-body text-secondary">
            This is a diagnostic service rather than a build — see &ldquo;What&rsquo;s
            included&rdquo; above for what it actually covers.
          </p>
        )}
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Expected deliverables</h2>
        <div className="mt-6">
          <BulletList items={detail.deliverables} />
        </div>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Estimated timeline</h2>
        <p className="mt-4 text-body-lg text-secondary">
          There&rsquo;s no fixed timeline for this service — it depends on scope, how many
          integrations or third-party pieces are involved, and how quickly feedback comes back
          during review. You&rsquo;ll get a project-specific timeline as part of your quote,
          not a generic estimate.
        </p>
        <Button href="/quotation" className="mt-4">
          Get a project-specific estimate
        </Button>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Related projects</h2>
        {relatedProjects.length > 0 ? (
          <div className="mt-6">
            <ProjectGrid projects={relatedProjects} />
          </div>
        ) : (
          <p className="mt-4 text-body text-secondary">
            Portfolio examples for this service are on the way — see the full{' '}
            <Link
              href="/portfolio"
              className="rounded-field text-primary-blue underline underline-offset-4 focus-ring hover:text-primary-blue-hover"
            >
              Featured Portfolio
            </Link>{' '}
            for current work.
          </p>
        )}
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Frequently asked questions</h2>
        <Accordion type="multiple" className="mt-6 border-t border-default">
          {detail.faqs.map((item, index) => (
            <AccordionItem key={item.question} value={`${service.slug}-faq-${index}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>
                <p>{item.answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose border-t border-default pt-10">
        <h2 className="text-section font-semibold tracking-tight text-primary">
          Ready to talk about your project?
        </h2>
        <p className="mt-4 text-body-lg text-secondary">
          Tell us what you&rsquo;re building and we&rsquo;ll scope {service.title.toLowerCase()}{' '}
          around what your project actually needs.
        </p>
        <Button href="/quotation" className="mt-6">
          Request a Quote
        </Button>
      </ScrollReveal>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </div>
  );
}
