import type { Metadata } from 'next';

import { withSocialMetadata } from '@/lib/metadata';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { ProcessStep } from '@/components/sections/ProcessStep';
import { developmentProcessSteps } from '@/config/development-process';
import { env } from '@/lib/env';

// Full `/process` page, replacing the earlier minimal stub. A fourteen-step walkthrough,
// more granular than the homepage's eight-step teaser (`ProcessTimeline.tsx` +
// `config/process.ts`, both untouched by this page) — a full read versus a condensed
// preview, not a duplicate. Server Component; `ScrollReveal` is the only Client Component,
// reused unchanged. `ProcessStep` (components/sections/ProcessStep.tsx) is reused unchanged
// too: it only needs an object shaped like `{ id, title, description, inlineLink? }`, which
// `DevelopmentProcessStep` matches structurally without importing anything from
// `config/process.ts`.

export const metadata: Metadata = withSocialMetadata({
  title: 'Development Process',
  description:
    'The full, fourteen-step breakdown of how a NexaStack Technologies project runs, from first conversation to launch and beyond.',
  alternates: { canonical: '/process' },
});

export default function ProcessPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Development Process',
        item: `${env.NEXT_PUBLIC_SITE_URL}/process`,
      },
    ],
  };

  return (
    <div className="page-container section-y">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Development Process' }]} />

      <ScrollReveal className="mt-8 max-w-prose">
        <h1 className="text-page font-semibold tracking-tight text-primary">Development Process</h1>
        <p className="mt-4 text-body-lg text-secondary">
          Here&rsquo;s exactly what happens, from first conversation to launch and beyond —
          the detailed version of the process, step by step.
        </p>
      </ScrollReveal>

      <ScrollReveal>
        <div className="relative mt-14">
          <div
            aria-hidden="true"
            className="absolute top-5 bottom-5 left-5 w-px -translate-x-1/2 bg-gradient-to-b from-cyan via-primary-blue to-violet lg:left-1/2"
          />

          <ol className="flex flex-col gap-10 lg:gap-16">
            {developmentProcessSteps.map((step, index) => (
              <ProcessStep
                key={step.id}
                step={step}
                position={index + 1}
                side={index % 2 === 0 ? 'right' : 'left'}
                titleAs="h2"
              />
            ))}
          </ol>
        </div>
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose border-t border-default pt-10">
        <h2 className="text-section font-semibold tracking-tight text-primary">
          Ready to start with a consultation?
        </h2>
        <p className="mt-4 text-body-lg text-secondary">
          Tell us what you&rsquo;re building and we&rsquo;ll walk you through how this
          process applies to your project.
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
