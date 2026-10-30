import type { Metadata } from 'next';
import Link from 'next/link';

import { withSocialMetadata } from '@/lib/metadata';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { CoreValueIcon } from '@/components/ui/CoreValueIcon';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { WhatsAppLink } from '@/components/layout/WhatsAppLink';
import { about } from '@/config/about';
import { company } from '@/config/company';
import { env } from '@/lib/env';
import { navigationActions } from '@/config/navigation';
import { technologyCategories } from '@/config/technologies';
import { whyChooseItems } from '@/config/why-choose';

export const metadata: Metadata = withSocialMetadata({
  title: 'About',
  description: `Who ${company.legalName} is, how the studio works, and why it exists.`,
  alternates: { canonical: '/about' },
});

const LABEL_CLASSES = 'text-label font-semibold text-secondary uppercase tracking-wide';
const INLINE_LINK_CLASSES =
  'rounded-field text-primary-blue underline underline-offset-4 focus-ring hover:text-primary-blue-hover';

/** First letter of the first and last words of a name. Deliberate twin of the same helper in
 * `TestimonialCard.tsx` — not extracted to a shared util so that file stays untouched. */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export default function AboutPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'About',
        item: `${env.NEXT_PUBLIC_SITE_URL}/about`,
      },
    ],
  };

  return (
    <>
      {/* Page header */}
      <section aria-labelledby="about-heading" className="bg-background">
        <div className="page-container section-y">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'About' }]} />

          <ScrollReveal className="mx-auto mt-8 max-w-2xl text-center">
            <h1 id="about-heading" className="text-page font-semibold tracking-tight text-primary">
              About NexaStack
            </h1>
            <p className="mt-4 text-body-lg text-secondary">{company.tagline}</p>
          </ScrollReveal>
        </div>
      </section>

      {/* 1. Company introduction */}
      <section aria-labelledby="intro-heading" className="bg-background-alt">
        <div className="page-container section-y">
          <ScrollReveal className="mx-auto max-w-2xl text-center">
            <h2 id="intro-heading" className="sr-only">
              Company Introduction
            </h2>
            <p className="text-body-lg text-secondary">{about.intro.body}</p>
          </ScrollReveal>
        </div>
      </section>

      {/* 2. NexaStack's story */}
      <section aria-labelledby="story-heading" className="bg-background">
        <div className="page-container section-y">
          <ScrollReveal className="mx-auto max-w-2xl">
            <h2
              id="story-heading"
              className="text-section font-semibold tracking-tight text-primary"
            >
              {about.story.heading}
            </h2>
            <div className="mt-6 space-y-4">
              {about.story.paragraphs.map((paragraph, index) => (
                <p key={index} className="text-body-lg text-secondary">
                  {paragraph}
                </p>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* 3. Mission and vision */}
      <section aria-labelledby="mission-vision-heading" className="bg-background-alt">
        <div className="page-container section-y">
          <ScrollReveal className="mx-auto max-w-3xl">
            <h2 id="mission-vision-heading" className="sr-only">
              Mission and Vision
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-card border border-default p-6">
                <p className={LABEL_CLASSES}>Mission</p>
                <p className="mt-3 text-card font-medium text-primary">
                  {about.missionVision.mission}
                </p>
              </div>
              <div className="rounded-card border border-default p-6">
                <p className={LABEL_CLASSES}>Vision</p>
                <p className="mt-3 text-card font-medium text-primary">
                  {about.missionVision.vision}
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* 4. Core values */}
      <section aria-labelledby="values-heading" className="bg-background">
        <div className="page-container section-y">
          <ScrollReveal>
            <h2
              id="values-heading"
              className="text-center text-section font-semibold tracking-tight text-primary"
            >
              Core Values
            </h2>
            <ul className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2">
              {about.coreValues.map((value) => (
                <li key={value.id} className="flex flex-col items-start gap-4">
                  <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary-blue/10 text-primary-blue">
                    <CoreValueIcon icon={value.icon} className="size-6" />
                  </span>
                  <h3 className="text-card font-semibold text-primary">{value.title}</h3>
                  <p className="text-body text-secondary">{value.description}</p>
                </li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </section>

      {/* 5. Founder's message + 6. Professional and technical experience (one visual band) */}
      <section className="bg-background-alt">
        <div className="page-container section-y">
          <ScrollReveal className="mx-auto max-w-3xl">
            <h2
              id="founder-message-heading"
              className="text-section font-semibold tracking-tight text-primary"
            >
              {about.founderMessage.heading}
            </h2>

            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-[auto_1fr] md:items-start">
              <span
                aria-hidden="true"
                className="mx-auto flex size-28 shrink-0 items-center justify-center rounded-full bg-primary-blue text-section font-semibold text-on-primary md:mx-0"
              >
                {getInitials(company.founder.name)}
              </span>

              <blockquote className="space-y-4">
                {about.founderMessage.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-body-lg text-secondary">
                    {paragraph}
                  </p>
                ))}
                <footer className="mt-4">
                  <cite className="text-body font-semibold text-primary not-italic">
                    {company.founder.name}
                  </cite>
                  <span className="text-body text-secondary"> · {company.founder.jobTitle}</span>
                </footer>
              </blockquote>
            </div>

            <div className="mt-12 border-t border-default pt-10">
              <h2
                id="experience-heading"
                className="text-card font-semibold tracking-tight text-primary"
              >
                {about.experience.heading}
              </h2>
              <div className="mt-4 space-y-4">
                {about.experience.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-body-lg text-secondary">
                    {index === 1 ? (
                      <>
                        Until that&rsquo;s written up, the most honest signal available right now is
                        the code itself: this site is built with the exact stack described below,
                        and the source is public on{' '}
                        <a
                          href={company.social.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={INLINE_LINK_CLASSES}
                        >
                          GitHub
                        </a>
                        .
                      </>
                    ) : (
                      paragraph
                    )}
                  </p>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* 7. Development philosophy */}
      <section aria-labelledby="philosophy-heading" className="bg-background">
        <div className="page-container section-y">
          <ScrollReveal className="mx-auto max-w-2xl">
            <h2
              id="philosophy-heading"
              className="text-section font-semibold tracking-tight text-primary"
            >
              Development Philosophy
            </h2>
            <ul className="mt-8 space-y-6">
              {about.philosophy.map((item) => (
                <li key={item.id} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary-blue"
                  />
                  <div>
                    <p className="text-card font-semibold text-primary">{item.title}</p>
                    <p className="mt-1 text-body text-secondary">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </section>

      {/* 8. Why Choose NexaStack (condensed) */}
      <section aria-labelledby="why-choose-summary-heading" className="bg-background-alt">
        <div className="page-container section-y">
          <ScrollReveal className="mx-auto max-w-2xl text-center">
            <h2
              id="why-choose-summary-heading"
              className="text-section font-semibold tracking-tight text-primary"
            >
              {about.whyChooseSummary.heading}
            </h2>
            <p className="mt-4 text-body-lg text-secondary">{about.whyChooseSummary.body}</p>
            <p className="mt-4">
              <Link href="/#why-choose-heading" className={INLINE_LINK_CLASSES}>
                See all {whyChooseItems.length} practices on the homepage
              </Link>
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* 9. Technology capabilities (condensed) */}
      <section aria-labelledby="tech-summary-heading" className="bg-background">
        <div className="page-container section-y">
          <ScrollReveal className="mx-auto max-w-2xl text-center">
            <h2
              id="tech-summary-heading"
              className="text-section font-semibold tracking-tight text-primary"
            >
              {about.techSummary.heading}
            </h2>
            <p className="mt-4 text-body-lg text-secondary">{about.techSummary.body}</p>
            <ul className="mt-6 flex flex-wrap justify-center gap-2">
              {technologyCategories.map((category) => (
                <li
                  key={category.id}
                  className="rounded-field border border-default bg-surface px-3 py-1.5 text-label font-medium text-primary"
                >
                  {category.label}
                </li>
              ))}
            </ul>
            <p className="mt-6">
              <Link href="/technologies" className={INLINE_LINK_CLASSES}>
                See full technology details
              </Link>
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* 10. Closing CTA */}
      <section aria-labelledby="about-cta-heading" className="bg-background-alt">
        <div className="page-container section-y">
          <ScrollReveal className="mx-auto max-w-xl text-center">
            <h2
              id="about-cta-heading"
              className="text-section font-semibold tracking-tight text-primary"
            >
              Ready to start a conversation?
            </h2>
            <p className="mt-4 text-body-lg text-secondary">
              Tell us what you&rsquo;re building — you&rsquo;ll hear back directly, not through a
              queue.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button href={navigationActions.quote.href} className="w-full sm:w-auto">
                {navigationActions.quote.label}
              </Button>
              <WhatsAppLink className="w-full sm:w-auto" />
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
