import type { Metadata } from 'next';

import { withSocialMetadata } from '@/lib/metadata';
import { ProjectGrid } from '@/components/sections/ProjectGrid';
import { projects } from '@/config/projects';

// PLACEHOLDER: project list is real (from config/projects.ts) but the page chrome around it is
// not designed yet, and there is no filter UI — that is separate, dedicated work. Once designed,
// this will need a canonical URL and JSON-LD (root CLAUDE.md section 13).

export const metadata: Metadata = withSocialMetadata(
  {
    title: 'Portfolio',
    description: 'Selected website and web application projects by NexaStack Technologies.',
    robots: { index: false, follow: false },
  },
  '/portfolio',
);

export default function PortfolioPage() {
  return (
    <div className="page-container section-y">
      <h1 className="text-page font-semibold tracking-tight">Portfolio</h1>
      <p className="mt-4 max-w-prose text-body-lg text-secondary">
        Selected projects built by NexaStack Technologies.
      </p>

      <div className="mt-10">
        <ProjectGrid projects={projects} />
      </div>
    </div>
  );
}
