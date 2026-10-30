import type { Metadata } from 'next';
import Link from 'next/link';

import { withSocialMetadata } from '@/lib/metadata';
import { ContactDetails } from '@/components/sections/ContactDetails';
import { ContactForm } from '@/components/sections/ContactForm';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { company } from '@/config/company';
import { navigationActions } from '@/config/navigation';
import { env } from '@/lib/env';

export const metadata: Metadata = withSocialMetadata({
  title: 'Contact',
  description: `Get in touch with ${company.legalName} with a question or general inquiry.`,
  alternates: { canonical: '/contact' },
});

export default function ContactPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Contact',
        item: `${env.NEXT_PUBLIC_SITE_URL}/contact`,
      },
    ],
  };

  return (
    <>
      <section aria-labelledby="contact-heading" className="bg-background">
        <div className="page-container section-y">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Contact' }]} />

          <ScrollReveal className="mt-8">
            <div className="mx-auto max-w-2xl text-center">
              <h1
                id="contact-heading"
                className="text-page font-semibold tracking-tight text-primary"
              >
                Contact
              </h1>
              <p className="mt-4 text-body-lg text-secondary">
                Have a question or a general inquiry? Send us a message below. Already know the
                project you want to build?{' '}
                <Link
                  href={navigationActions.quote.href}
                  className="text-primary-blue underline underline-offset-4 hover:text-primary-blue-hover"
                >
                  Request a quote
                </Link>{' '}
                instead.
              </p>
            </div>

            <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-12 lg:grid-cols-[1.6fr_1fr]">
              <ContactForm />
              <ContactDetails />
            </div>
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
