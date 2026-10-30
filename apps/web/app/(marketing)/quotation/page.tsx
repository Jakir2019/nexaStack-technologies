import type { Metadata } from 'next';

import { withSocialMetadata } from '@/lib/metadata';
import { QuotationWizard } from '@/components/sections/QuotationWizard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { env } from '@/lib/env';

export const metadata: Metadata = withSocialMetadata({
  title: 'Get a Quote',
  description:
    'Tell us about your project in five short steps and request a quotation for a website, web application or backend build.',
  alternates: { canonical: '/quotation' },
});

export default function QuotationPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Get a Quote',
        item: `${env.NEXT_PUBLIC_SITE_URL}/quotation`,
      },
    ],
  };

  return (
    <>
      <section aria-labelledby="quotation-heading" className="bg-background">
        <div className="page-container section-y">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Get a Quote' }]} />

          <div className="mx-auto mt-8 max-w-2xl text-center">
            <h1
              id="quotation-heading"
              className="text-page font-semibold tracking-tight text-primary"
            >
              Request a Quote
            </h1>
            <p className="mt-4 text-body-lg text-secondary">
              Tell us about your project in five short steps. We&rsquo;ll review your request and
              get back to you.
            </p>
          </div>

          <div className="mt-12">
            <QuotationWizard />
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </>
  );
}
