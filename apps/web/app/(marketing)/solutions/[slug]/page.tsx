import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { withSocialMetadata } from '@/lib/metadata';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { ProjectGrid } from '@/components/sections/ProjectGrid';
import { getProjectBySlug } from '@/config/projects';
import { getServiceBySlug } from '@/config/services';
import { getSolutionBySlug, solutions } from '@/config/solutions';
import { getSolutionDetailBySlug } from '@/config/solution-details';
import { env } from '@/lib/env';

interface SolutionDetailPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return solutions.map((solution) => ({ slug: solution.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: SolutionDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const solution = getSolutionBySlug(slug);
  const detail = getSolutionDetailBySlug(slug);
  if (!solution || !detail) return {};

  return withSocialMetadata({
    title: solution.title,
    description: detail.introduction,
    alternates: { canonical: `/solutions/${solution.slug}` },
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
 * Full `/solutions/[slug]` detail template, superseding the earlier title-and-summary stub.
 * Long-form content comes from `config/solution-details.ts`, keyed by the same slug as
 * `config/solutions.ts`. Server Component throughout — no client-only piece is needed here
 * (unlike Services, this page has no accordion).
 *
 * Every sentence below is written as capability ("how this stack/process would approach it"),
 * never as track record — see `config/solution-details.ts`'s doc comment for why that
 * distinction matters more here than on the Services pages.
 */
export default async function SolutionDetailPage({ params }: SolutionDetailPageProps) {
  const { slug } = await params;
  const solution = getSolutionBySlug(slug);
  const detail = getSolutionDetailBySlug(slug);
  if (!solution || !detail) notFound();

  const applicableServices = detail.applicableServices
    .map((serviceSlug) => getServiceBySlug(serviceSlug))
    .filter((service) => service !== undefined);

  const relatedCaseStudies = detail.relatedCaseStudySlugs
    .map((projectSlug) => getProjectBySlug(projectSlug))
    .filter((project) => project !== undefined);

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
      {
        '@type': 'ListItem',
        position: 3,
        name: solution.title,
        item: `${env.NEXT_PUBLIC_SITE_URL}/solutions/${solution.slug}`,
      },
    ],
  };

  return (
    <div className="page-container section-y">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions and Industries', href: '/solutions' },
          { label: solution.title },
        ]}
      />

      <ScrollReveal className="mt-8 max-w-prose">
        <h1 className="text-page font-semibold tracking-tight text-primary">{solution.title}</h1>
        <p className="mt-4 text-body-lg text-secondary">{detail.introduction}</p>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Business challenges</h2>
        <div className="mt-6">
          <BulletList items={detail.businessChallenges} />
        </div>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Recommended solutions</h2>
        <p className="mt-4 text-body-lg text-secondary">{detail.recommendedSolutions}</p>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">
          Important application features
        </h2>
        <div className="mt-6">
          <BulletList items={detail.importantFeatures} />
        </div>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Applicable services</h2>
        <ul className="mt-4 flex flex-col items-start gap-1">
          {applicableServices.map((service) => (
            <li key={service.slug}>
              <Button variant="text" href={`/services/${service.slug}`}>
                {service.title}
              </Button>
            </li>
          ))}
        </ul>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Recommended technologies</h2>
        <ul className="mt-6 flex flex-wrap gap-2">
          {detail.recommendedTechnologies.map((tech) => (
            <li key={tech}>
              <Badge mono>{tech}</Badge>
            </li>
          ))}
        </ul>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose">
        <h2 className="text-section font-semibold tracking-tight text-primary">Related case studies</h2>
        {relatedCaseStudies.length > 0 ? (
          <div className="mt-6">
            <ProjectGrid projects={relatedCaseStudies} />
          </div>
        ) : (
          <p className="mt-4 text-body text-secondary">
            Case studies for this industry are on the way — see the full{' '}
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

      <ScrollReveal className="mt-12 max-w-prose border-t border-default pt-10">
        <h2 className="text-section font-semibold tracking-tight text-primary">
          Talk to us about your project
        </h2>
        <p className="mt-4 text-body-lg text-secondary">
          If this sounds like the kind of project you&rsquo;re considering, get in touch and
          we&rsquo;ll talk through what you actually need before anything is scoped or quoted.
        </p>
        <Button href="/contact" className="mt-6">
          Contact Us
        </Button>
      </ScrollReveal>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </div>
  );
}
