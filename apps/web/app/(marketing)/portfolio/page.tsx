import type { Metadata } from 'next';

import { withSocialMetadata } from '@/lib/metadata';
import { ProjectGrid } from '@/components/sections/ProjectGrid';
import { projects } from '@/config/projects';
import { env } from '@/lib/env';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = withSocialMetadata(
  {
    title: 'Portfolio',
    description: 'Selected website and web application projects by NexaStack Technologies.',
    alternates: { canonical: '/portfolio' },
  },
  '/portfolio',
);

export default function PortfolioPage() {
  return (
    <div className="page-container section-y">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Portfolio' }]} />
      <h1 className="mt-8 text-page font-semibold tracking-tight">Portfolio</h1>
      <p className="mt-4 max-w-prose text-body-lg text-secondary">
        Explore recruitment, team collaboration and commerce applications. Each case study explains
        the implementation, architecture and current development status.
      </p>

      <div className="mt-10">
        <ProjectGrid projects={projects} headingLevel="h2" />
      </div>
      <div className="mt-12 border-t border-default pt-10">
        <h2 className="text-section font-semibold text-primary">Have a project in mind?</h2>
        <p className="mt-4 text-body-lg text-secondary">
          Tell us about the application your business needs.
        </p>
        <Button href="/quotation" className="mt-6">
          Request a Quote
        </Button>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Portfolio',
            url: `${env.NEXT_PUBLIC_SITE_URL}/portfolio`,
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: projects.map((project, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: project.title,
                url: `${env.NEXT_PUBLIC_SITE_URL}${project.caseStudyHref}`,
              })),
            },
          }),
        }}
      />
    </div>
  );
}
