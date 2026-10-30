import type { Metadata } from 'next';
import Link from 'next/link';

import { withSocialMetadata } from '@/lib/metadata';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { company } from '@/config/company';
import { env } from '@/lib/env';

export const metadata: Metadata = withSocialMetadata({
  title: 'Terms and Conditions',
  description: `The terms for using ${company.legalName}'s website and engaging its services.`,
  alternates: { canonical: '/terms-and-conditions' },
});

/**
 * Editorial fact, not a computed value — matches `PRIVACY_POLICY_LAST_UPDATED`'s pattern in
 * `privacy-policy/page.tsx`. Only changes when the content below is actually edited; formatted
 * for display, never derived from `new Date()`.
 */
const TERMS_AND_CONDITIONS_LAST_UPDATED = '2026-09-18';

function formatLastUpdated(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    date,
  );
}

const LINK_CLASSES =
  'rounded-field text-primary-blue underline underline-offset-4 focus-ring hover:text-primary-blue-hover';

interface TocItem {
  id: string;
  label: string;
}

const TOC_ITEMS: readonly TocItem[] = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'website-usage', label: 'Website Usage' },
  { id: 'intellectual-property', label: 'Intellectual Property' },
  { id: 'service-information', label: 'Service Information' },
  { id: 'quotations', label: 'Quotations' },
  { id: 'payment-conditions', label: 'Payment Conditions' },
  { id: 'external-links', label: 'External Links' },
  { id: 'prohibited-activities', label: 'Prohibited Activities' },
  { id: 'limitation-of-liability', label: 'Limitation of Liability' },
  { id: 'changes-to-the-terms', label: 'Changes to the Terms' },
  { id: 'contact-information', label: 'Contact Information' },
  { id: 'last-updated', label: 'Last Updated' },
];

const H2_CLASSES = 'text-card font-semibold tracking-tight text-primary scroll-mt-24';
const P_CLASSES = 'mt-3 text-body text-secondary';

export default function TermsAndConditionsPage() {
  const lastUpdatedDisplay = formatLastUpdated(TERMS_AND_CONDITIONS_LAST_UPDATED);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Terms and Conditions',
        item: `${env.NEXT_PUBLIC_SITE_URL}/terms-and-conditions`,
      },
    ],
  };

  return (
    <div className="page-container section-y">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Terms and Conditions' }]} />

      <div className="mt-8 max-w-prose">
        {/* Scoped to the arrival content only, same reasoning as privacy-policy/page.tsx: an
            IntersectionObserver-based reveal needs ~15% of the wrapped element visible at once
            to trigger, which a multi-thousand-pixel document can never reach in a normal
            viewport. Wrapping the whole page in one ScrollReveal would leave it permanently
            invisible after hydration. */}
        <ScrollReveal>
          <h1 className="text-page font-semibold tracking-tight text-primary">Terms and Conditions</h1>
          <p className="mt-4 text-body-lg text-secondary">Last updated {lastUpdatedDisplay}.</p>

          <div className="mt-6 rounded-card border border-default bg-surface p-5">
            <p className="text-body text-secondary">
              These terms were written and published by {company.legalName} directly — they have
              not been reviewed by a lawyer. They describe, as accurately and plainly as possible,
              what actually applies to using this website and engaging {company.legalName}
              &rsquo;s services today. Some details depend on decisions {company.legalName} has
              not finalised yet (its formal business registration, and which jurisdiction&rsquo;s
              law would govern a dispute); where that is the case, these terms say so directly
              rather than asserting something that might not be true. See also our{' '}
              <Link href="/privacy-policy" className={LINK_CLASSES}>
                Privacy Policy
              </Link>{' '}
              for how information you submit is handled. If you have any question, the fastest
              path is to contact us directly using the details in{' '}
              <a href="#contact-information" className={LINK_CLASSES}>
                Contact Information
              </a>{' '}
              below.
            </p>
          </div>
        </ScrollReveal>

        <nav aria-label="Table of contents" className="mt-8 rounded-card border border-default bg-background-alt p-5">
          <p className="text-label font-semibold text-primary">Jump to a section</p>
          <ol className="mt-3 columns-1 gap-x-8 sm:columns-2">
            {TOC_ITEMS.map((item, index) => (
              <li key={item.id} className="break-inside-avoid">
                <a href={`#${item.id}`} className={LINK_CLASSES}>
                  {index + 1}. {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          <section>
            <h2 className={H2_CLASSES} id="introduction">1. Introduction</h2>
            <p className={P_CLASSES}>
              These Terms and Conditions govern your use of this website and, where you engage{' '}
              {company.legalName} for a project, the services provided. They apply to anyone
              browsing the public site, and to anyone who submits the Contact or Quotation form or
              otherwise engages {company.legalName} as a client. {company.legalName} is a
              founder-led web development studio based in Dhaka, Bangladesh, working with clients
              both in Bangladesh and internationally.
            </p>
            <p className={P_CLASSES}>
              By using this website, you agree to these terms. If you go on to engage{' '}
              {company.legalName}&rsquo;s services, the specific scope, deliverables and any
              project-specific terms are set out in a separate written agreement — see{' '}
              <a href="#quotations" className={LINK_CLASSES}>
                Quotations
              </a>
              . Where the two conflict for a given project, that written agreement governs.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="website-usage">2. Website Usage</h2>
            <p className={P_CLASSES}>
              This website is provided so you can learn about {company.legalName}&rsquo;s work and
              get in touch about a project. You may browse it, and use the Contact and Quotation
              forms, for that genuine purpose. You&rsquo;re asked to provide accurate information
              when you submit either form, and not to submit anything on behalf of someone else
              without their permission.
            </p>
            <p className={P_CLASSES}>
              You should only use this website, or submit a form on it, if you&rsquo;re legally
              able to enter into an agreement in your jurisdiction. This is stated simply and
              generally, and isn&rsquo;t a substitute for your own understanding of what applies
              to you.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="intellectual-property">3. Intellectual Property</h2>
            <p className={P_CLASSES}>
              The content, design and code of this website, and the {company.legalName} name and
              logo, belong to {company.legalName} unless stated otherwise. You may not copy,
              reuse or redistribute them without permission.
            </p>
            <p className={P_CLASSES}>
              <span className="font-medium text-primary">[Open item — confirm or amend]</span>{' '}
              Ownership of a client project&rsquo;s custom deliverables (the specific website or
              application built for you) is not yet a formally settled policy. A reasonable,
              commonly-used default — drafted here for your confirmation, not asserted as already
              decided — is that ownership of the custom work transfers to the client once it has
              been paid for in full, while {company.legalName} retains its own general know-how,
              reusable frameworks, internal tooling, and any code or components that existed
              before the project and aren&rsquo;t specific to it. Until this is confirmed, treat
              intellectual property ownership for any specific project as a matter for the
              written agreement covering that project, not this page.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="service-information">4. Service Information</h2>
            <p className={P_CLASSES}>
              Services described on this website — business websites, web applications, admin
              dashboards, backend APIs, maintenance, and performance/SEO audits — are described as
              generally offered. The specific scope, features and deliverables for an actual
              engagement are defined per project, through the quotation and agreement process, not
              by anything stated generally on the marketing pages of this site.
            </p>
            <p className={P_CLASSES}>
              No general timeline, delivery date, or availability is guaranteed by anything on
              this website. A project-specific timeline is provided as part of your quote once
              scope is understood — consistent with how the{' '}
              <Link href="/process" className={LINK_CLASSES}>
                development process
              </Link>{' '}
              is described elsewhere on this site.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="quotations">5. Quotations</h2>
            <p className={P_CLASSES}>
              Submitting the{' '}
              <Link href="/quotation" className={LINK_CLASSES}>
                Quotation form
              </Link>{' '}
              sends {company.legalName} a request, not a binding order. You&rsquo;ll receive a
              confirmation number acknowledging that your request was received — that
              acknowledgement is not itself an agreement to deliver a project.
            </p>
            <p className={P_CLASSES}>
              After review, {company.legalName} confirms scope and next steps with you. A
              quotation becomes a binding commitment only once both parties agree on scope and
              price and a written agreement is signed, together with an advance payment that
              secures the project&rsquo;s place — the same sequence described on the{' '}
              <Link href="/process" className={LINK_CLASSES}>
                development process
              </Link>{' '}
              page. There&rsquo;s no fixed price list; every quote is specific to the project
              described, and the budget ranges shown in the quotation form are drafts for
              planning purposes, not final figures.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="payment-conditions">6. Payment Conditions</h2>
            <p className={P_CLASSES}>
              Payment terms — including the advance payment required to begin a project — are
              agreed as part of the written agreement for that specific project, alongside its
              scope and quote. <span className="font-medium text-primary">[Open item]</span> No
              general payment schedule, split, or percentage is fixed by this page or anywhere
              else on this site; if you&rsquo;d like the specific terms for your project before
              deciding whether to proceed, ask during the quotation review — see{' '}
              <a href="#quotations" className={LINK_CLASSES}>
                Quotations
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="external-links">7. External Links</h2>
            <p className={P_CLASSES}>
              This site links to real external resources — live project links and case studies in{' '}
              <Link href="/portfolio" className={LINK_CLASSES}>
                Portfolio
              </Link>
              , social profiles, and referenced technologies. {company.legalName} doesn&rsquo;t
              control those external sites and isn&rsquo;t responsible for their content,
              accuracy, or availability. Following an external link is at your own discretion, and
              that site&rsquo;s own terms and privacy policy apply once you&rsquo;re there.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="prohibited-activities">8. Prohibited Activities</h2>
            <p className={P_CLASSES}>When using this website, you agree not to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-secondary">
              <li>Attempt to gain unauthorized access to any part of this site or its systems</li>
              <li>Submit fraudulent, abusive, or intentionally false content through the Contact or Quotation form</li>
              <li>Scrape, automate, or otherwise misuse the site beyond normal browsing and genuine form submissions</li>
              <li>Attempt to bypass or interfere with the site&rsquo;s spam-prevention or rate-limiting measures</li>
            </ul>
            <p className={P_CLASSES}>
              Both forms are rate-limited per connection, and the Contact form is designed to use
              a spam-prevention check once configured, to help enforce this in practice.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="limitation-of-liability">9. Limitation of Liability</h2>
            <p className={P_CLASSES}>
              This website and {company.legalName}&rsquo;s services are provided as described, in
              good faith. To the extent permitted by law, {company.legalName} isn&rsquo;t liable
              for indirect or consequential loss arising from your use of this website.
            </p>
            <p className={P_CLASSES}>
              <span className="font-medium text-primary">[Open item]</span> Exactly which
              jurisdiction&rsquo;s law governs this clause, and how enforceable a specific
              liability cap would be, depends on {company.legalName}&rsquo;s formal business
              registration and target-market decisions that haven&rsquo;t been finalised yet. This
              section is therefore intentionally general rather than citing a specific governing
              law — it will be revisited once those decisions are made.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="changes-to-the-terms">10. Changes to the Terms</h2>
            <p className={P_CLASSES}>
              These terms may be updated as {company.legalName}&rsquo;s practices change. An
              update takes effect as soon as it&rsquo;s posted here, marked with a new last-updated
              date below. There&rsquo;s no account or mailing-list system for visitors to this
              site, so updates aren&rsquo;t sent by email — checking back here is the way to see
              the current version.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="contact-information">11. Contact Information</h2>
            <p className={P_CLASSES}>Questions about these terms can be sent to:</p>
            <address className="mt-3 space-y-1 text-body text-secondary not-italic">
              <p className="font-medium text-primary">{company.legalName}</p>
              <p>{company.address.full}</p>
              <p>
                <a href={company.email.href} className={LINK_CLASSES}>
                  {company.email.general}
                </a>
              </p>
              <p>
                <a href={company.phone.href} className={LINK_CLASSES}>
                  {company.phone.display}
                </a>
              </p>
              <p>{company.hours.display}</p>
            </address>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="last-updated">12. Last Updated</h2>
            <p className={P_CLASSES}>
              These terms were last updated on {lastUpdatedDisplay}. They will be revised as the
              practices they describe change — in particular the items marked{' '}
              <span className="font-medium text-primary">[Open item]</span> above, once those are
              actually decided.
            </p>
          </section>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </div>
  );
}
