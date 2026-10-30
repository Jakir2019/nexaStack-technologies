import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { withSocialMetadata } from '@/lib/metadata';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { ScreenshotLightbox } from '@/components/ui/ScreenshotLightbox';
import { ServiceCard } from '@/components/sections/ServiceCard';
import { caseStudies, getCaseStudyBySlug } from '@/config/case-studies';
import { company } from '@/config/company';
import { getProjectBySlug, projects } from '@/config/projects';
import { getServiceBySlug } from '@/config/services';
import { env } from '@/lib/env';

// Full `/portfolio/[slug]` case-study template, superseding the earlier title-and-summary stub.
// Long-form content comes from `config/case-studies.ts`, keyed by the same slug as
// `config/projects.ts`. Server Component throughout — `ScreenshotLightbox` (the only Client
// Component) is pushed to that leaf, same pattern `services/[slug]/page.tsx` uses for `Accordion`.
//
// Only slugs that have a real case study are built — `generateStaticParams` intersects the two
// config files rather than assuming every project has one (see `config/case-studies.ts`'s doc
// comment: a project without a case study yet is a normal, honest state, not a gap to fill).

interface ProjectCaseStudyPageProps {
  params: Promise<{ slug: string }>;
}

const NEW_TAB_NOTICE = '(opens in a new tab)';
const H2_CLASS = 'text-section font-semibold tracking-tight text-primary';
const SECTION_CLASS = 'mt-12 max-w-prose';

export function generateStaticParams() {
  const projectSlugs = new Set(projects.map((project) => project.slug));
  return caseStudies
    .filter((detail) => projectSlugs.has(detail.slug))
    .map((detail) => ({ slug: detail.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: ProjectCaseStudyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  const caseStudy = getCaseStudyBySlug(slug);
  if (!project || !caseStudy) return {};

  return withSocialMetadata({
    title: project.title,
    description: caseStudy.overview,
    alternates: { canonical: `/portfolio/${project.slug}` },
  });
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary-blue" />
          <p className="text-body-lg text-secondary">{item}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function ProjectCaseStudyPage({ params }: ProjectCaseStudyPageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  const caseStudy = getCaseStudyBySlug(slug);
  if (!project || !caseStudy) notFound();

  const inDevelopment = project.status === 'in-development';
  const hasScreenshots = caseStudy.screenshots.length > 0;
  const relatedServices = caseStudy.relatedServiceSlugs
    .map((serviceSlug) => getServiceBySlug(serviceSlug))
    .filter((service) => service !== undefined);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Portfolio',
        item: `${env.NEXT_PUBLIC_SITE_URL}/portfolio`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: project.title,
        item: `${env.NEXT_PUBLIC_SITE_URL}/portfolio/${project.slug}`,
      },
    ],
  };

  return (
    <div className="page-container section-y">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Portfolio', href: '/portfolio' },
          { label: project.title },
        ]}
      />

      {/* 1. Project overview */}
      <ScrollReveal className="mt-8 max-w-prose">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-page font-semibold tracking-tight text-primary">{project.title}</h1>
          {inDevelopment && <Badge>In active development</Badge>}
        </div>
        <p className="mt-4 text-body-lg text-secondary">{project.summary}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button href={project.liveUrl} variant="secondary" target="_blank" rel="noopener noreferrer">
            Live Website <span className="sr-only">{NEW_TAB_NOTICE}</span>
          </Button>
          {project.repoUrl && (
            <Button href={project.repoUrl} variant="secondary" target="_blank" rel="noopener noreferrer">
              View on GitHub <span className="sr-only">{NEW_TAB_NOTICE}</span>
            </Button>
          )}
          {relatedServices.map((service) => (
            <Button key={service.slug} href={`/services/${service.slug}`} variant="text">
              {service.title}
            </Button>
          ))}
        </div>
      </ScrollReveal>

      {/* 2. Client or business problem */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>The problem this project addresses</h2>
        <p className="mt-4 text-body-lg text-secondary">{caseStudy.businessProblem}</p>
      </ScrollReveal>

      {/* 3. Project objectives */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>Project objectives</h2>
        <BulletList items={caseStudy.objectives} />
      </ScrollReveal>

      {/* 4. Target users */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>Target users</h2>
        <p className="mt-4 text-body-lg text-secondary">{caseStudy.targetUsers}</p>
      </ScrollReveal>

      {/* 5. Proposed solution */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>Proposed solution</h2>
        <p className="mt-4 text-body-lg text-secondary">{caseStudy.proposedSolution}</p>
      </ScrollReveal>

      {/* 6. Major features */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>Major features</h2>
        <BulletList items={caseStudy.majorFeatures} />
      </ScrollReveal>

      {/* 7. User roles — omitted entirely for a single-role project, not this one */}
      {caseStudy.userRoles && caseStudy.userRoles.length > 0 && (
        <ScrollReveal className={SECTION_CLASS}>
          <h2 className={H2_CLASS}>User roles</h2>
          <ul className="mt-6 flex flex-col gap-4">
            {caseStudy.userRoles.map((userRole) => (
              <li key={userRole.role}>
                <p className="text-card font-semibold text-primary">{userRole.role}</p>
                <p className="mt-1 text-body-lg text-secondary">{userRole.description}</p>
              </li>
            ))}
          </ul>
        </ScrollReveal>
      )}

      {/* 8. Technology stack */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>Technology stack</h2>
        <ul className="mt-6 flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <li key={tag}>
              <Badge mono>{tag}</Badge>
            </li>
          ))}
        </ul>
      </ScrollReveal>

      {/* 9. System architecture */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>System architecture</h2>
        <p className="mt-4 text-body-lg text-secondary">{caseStudy.systemArchitecture}</p>
      </ScrollReveal>

      {/* 10. Development process */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>Development process</h2>
        <p className="mt-4 text-body-lg text-secondary">{caseStudy.developmentProcess}</p>
      </ScrollReveal>

      {/* 11 & 12. Technical challenges and their solutions, paired side by side on desktop */}
      <ScrollReveal className="mt-12 max-w-4xl">
        <h2 className={H2_CLASS}>Technical challenges and solutions</h2>
        <ul className="mt-6 flex flex-col gap-6">
          {caseStudy.technicalChallenges.map((challenge, index) => (
            <li
              key={challenge}
              className="grid grid-cols-1 gap-4 rounded-card border border-default bg-surface p-6 shadow-card md:grid-cols-2"
            >
              <div>
                <p className="text-label font-semibold uppercase tracking-wide text-secondary">
                  Challenge
                </p>
                <p className="mt-2 text-body-lg text-primary">{challenge}</p>
              </div>
              <div>
                <p className="text-label font-semibold uppercase tracking-wide text-secondary">
                  Solution
                </p>
                <p className="mt-2 text-body-lg text-secondary">
                  {caseStudy.challengeSolutions[index]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </ScrollReveal>

      {/* 13. Security approach */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>Security approach</h2>
        <p className="mt-4 text-body-lg text-secondary">{caseStudy.securityApproach}</p>
      </ScrollReveal>

      {/* 14. Screenshots */}
      <ScrollReveal className="mt-12 max-w-4xl">
        <h2 className={H2_CLASS}>Screenshots</h2>
        {hasScreenshots ? (
          <div className="mt-6">
            <ScreenshotLightbox screenshots={caseStudy.screenshots} />
          </div>
        ) : (
          <p className="mt-4 max-w-prose text-body-lg text-secondary">
            Screenshots coming soon — this project is still in active development and real
            screenshots haven&rsquo;t been captured yet.
          </p>
        )}
      </ScrollReveal>

      {/* 15. Project results */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>Project results</h2>
        <p className="mt-4 text-body-lg text-secondary">{caseStudy.projectResults}</p>
      </ScrollReveal>

      {/* 16. Live website and repository links */}
      <ScrollReveal className={SECTION_CLASS}>
        <h2 className={H2_CLASS}>Live website and repository</h2>
        {inDevelopment && (
          <p className="mt-4 text-body-lg text-secondary">
            This project is still in active development — the live site below reflects current,
            in-progress work rather than a finished product.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button href={project.liveUrl} variant="primary" target="_blank" rel="noopener noreferrer">
            Live Website <span className="sr-only">{NEW_TAB_NOTICE}</span>
          </Button>
          {project.repoUrl ? (
            <Button href={project.repoUrl} variant="secondary" target="_blank" rel="noopener noreferrer">
              View on GitHub <span className="sr-only">{NEW_TAB_NOTICE}</span>
            </Button>
          ) : (
            <p className="text-body text-secondary">No public repository link yet.</p>
          )}
        </div>
      </ScrollReveal>

      {/* 17. Related services */}
      {relatedServices.length > 0 && (
        <ScrollReveal className={SECTION_CLASS}>
          <h2 className={H2_CLASS}>Related services</h2>
          <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {relatedServices.map((service) => (
              <li key={service.slug}>
                <ServiceCard service={service} relatedTechnologies={service.relatedTechnologies} />
              </li>
            ))}
          </ul>
        </ScrollReveal>
      )}

      {/* 18. Project-enquiry CTA */}
      <ScrollReveal className="mt-12 max-w-prose border-t border-default pt-10">
        <h2 className={H2_CLASS}>Interested in something similar?</h2>
        <p className="mt-4 text-body-lg text-secondary">
          Tell {company.legalName} what you&rsquo;re building and get a project-specific quote
          scoped around it — whether that&rsquo;s a job portal, another multi-role application,
          or something else entirely.
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
