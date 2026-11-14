import type { Metadata } from 'next';
import Link from 'next/link';

import { withSocialMetadata } from '@/lib/metadata';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { company } from '@/config/company';
import { env } from '@/lib/env';

export const metadata: Metadata = withSocialMetadata({
  title: 'Privacy Policy',
  description: `How ${company.legalName} collects, uses and stores information submitted through this website.`,
  alternates: { canonical: '/privacy-policy' },
});

/**
 * Editorial fact, not a computed value — this only changes when the content below is
 * actually edited, unlike the Footer's copyright year (which is genuinely always "this
 * year"). Formatted for display, never derived from `new Date()`.
 */
const PRIVACY_POLICY_LAST_UPDATED = '2026-09-18';

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
  { id: 'information-we-collect', label: 'Information We Collect' },
  { id: 'purpose-of-data-collection', label: 'Purpose of Data Collection' },
  { id: 'contact-and-quotation-submissions', label: 'Contact and Quotation Submissions' },
  { id: 'cookies-and-analytics', label: 'Cookies and Analytics' },
  { id: 'data-storage', label: 'Data Storage' },
  { id: 'third-party-services', label: 'Third-Party Services' },
  { id: 'data-retention', label: 'Data Retention' },
  { id: 'security-practices', label: 'Security Practices' },
  { id: 'your-rights', label: 'Your Rights' },
  { id: 'contact-details', label: 'Contact Details' },
  { id: 'last-updated', label: 'Last Updated' },
];

const H2_CLASSES = 'text-card font-semibold tracking-tight text-primary scroll-mt-24';
const P_CLASSES = 'mt-3 text-body text-secondary';

export default function PrivacyPolicyPage() {
  const lastUpdatedDisplay = formatLastUpdated(PRIVACY_POLICY_LAST_UPDATED);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Privacy Policy',
        item: `${env.NEXT_PUBLIC_SITE_URL}/privacy-policy`,
      },
    ],
  };

  return (
    <div className="page-container section-y">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Privacy Policy' }]} />

      <div className="mt-8 max-w-prose">
        {/* Scoped to the arrival content only — an IntersectionObserver-based reveal (see
            ScrollReveal's own doc comment) needs ~15% of the wrapped element visible at once to
            trigger. Wrapping the entire multi-thousand-pixel document in one instance means that
            threshold can never be reached in a normal viewport, so the whole page would stay
            permanently invisible after hydration. Only the header block gets the entrance; the
            rest of this long-form document renders normally, which is also the more readable
            choice for content people scroll through and reference rather than "arrive at". */}
        <ScrollReveal>
          <h1 className="text-page font-semibold tracking-tight text-primary">Privacy Policy</h1>
          <p className="mt-4 text-body-lg text-secondary">Last updated {lastUpdatedDisplay}.</p>

          <div className="mt-6 rounded-card border border-default bg-surface p-5">
            <p className="text-body text-secondary">
              This policy was written and published by {company.legalName} directly — it has not
              been reviewed by a lawyer. It describes, as accurately and plainly as possible, what
              this website actually does today. Some details depend on decisions {company.legalName}{' '}
              has not finalised yet (its formal business registration, and the exact regulatory
              regime that applies to it); where that is the case, this policy says so directly
              rather than asserting something that might not be true. If you have any question
              about how your information is handled, the fastest path is to contact us directly
              using the details in{' '}
              <a href="#contact-details" className={LINK_CLASSES}>
                Contact Details
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
              This Privacy Policy explains what information {company.legalName} collects through
              this website, why, and what is done with it. It applies to anyone browsing the
              public site, and to anyone who submits the Contact form or the Quotation form.{' '}
              {company.legalName} is a founder-led web development studio based in Dhaka,
              Bangladesh, working with clients both in Bangladesh and internationally.
            </p>
            <p className={P_CLASSES}>
              This policy covers this website only. It does not cover any external site you reach
              by following a link from here, including the third-party services listed in{' '}
              <a href="#third-party-services" className={LINK_CLASSES}>
                Third-Party Services
              </a>
              , each of which has its own privacy policy. See also our{' '}
              <Link href="/terms-and-conditions" className={LINK_CLASSES}>
                Terms and Conditions
              </Link>{' '}
              for the terms governing use of this website and its services.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="information-we-collect">2. Information We Collect</h2>
            <p className={P_CLASSES}>
              The only personal information collected is what you choose to submit through one of
              this site&rsquo;s two forms, plus standard technical information every website
              receives as part of normal server operation.
            </p>

            <p className="mt-5 text-label font-semibold text-primary">Contact form</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-secondary">
              <li>Full name</li>
              <li>Email address</li>
              <li>Phone or WhatsApp number (optional)</li>
              <li>Company name (optional)</li>
              <li>Subject and message</li>
              <li>Your preferred contact method (email, phone, or WhatsApp)</li>
            </ul>

            <p className="mt-5 text-label font-semibold text-primary">Quotation form</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-secondary">
              <li>Full name, email address, telephone number, company name (optional), country</li>
              <li>
                Project details: project type, the services you&rsquo;re interested in, your
                business objectives, who the project is for, and whether it&rsquo;s a new or
                existing project
              </li>
              <li>
                Project requirements: required features, approximate number of pages, design
                requirements, whether you need an admin dashboard or user authentication, any
                third-party integrations (optional), and links to reference websites (optional)
              </li>
              <li>Budget range, preferred start date, target completion date (optional), and maintenance preference</li>
              <li>Any file attachments and an additional message you choose to include (both optional)</li>
            </ul>

            <p className="mt-5 text-label font-semibold text-primary">Technical information</p>
            <p className={P_CLASSES}>
              Like virtually any website, the infrastructure that serves this site automatically
              logs standard technical information for every visitor as part of normal server
              operation — such as IP address and browser type. This is generated by the hosting
              providers themselves, not collected through any code on this site, and is not linked
              to your name unless you separately submit a form.
            </p>

            <p className="mt-5 text-label font-semibold text-primary">What is not collected</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-secondary">
              <li>No tracking or advertising cookies</li>
              <li>No analytics or behavioural-tracking tool of any kind</li>
              <li>No third-party advertising pixels</li>
              <li>Personal information is never sold or rented to third parties</li>
            </ul>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="purpose-of-data-collection">3. Purpose of Data Collection</h2>
            <p className={P_CLASSES}>Information submitted through this site is used only to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-secondary">
              <li>Respond to a message sent through the Contact form</li>
              <li>Review a project request and prepare a quotation in response to the Quotation form</li>
              <li>Operate, secure and troubleshoot the website itself</li>
            </ul>
            <p className={P_CLASSES}>
              Information is never used for advertising, profiling, or any purpose beyond what you
              submitted it for.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="contact-and-quotation-submissions">4. Contact and Quotation Submissions</h2>
            <p className={P_CLASSES}>
              Both forms are validated on the server before anything is stored — the check that
              runs in your browser is a convenience, not the real safeguard. Once validated, a
              submission is stored directly in {company.legalName}&rsquo;s database and reviewed
              from there to respond to your inquiry or quote request.
            </p>
            <p className={P_CLASSES}>
              [Open item] No automatic confirmation or notification email is sent yet — a
              transactional email provider for this hasn&rsquo;t been chosen. Until one is, every
              submission is still reliably stored and reviewed directly; you just won&rsquo;t
              receive an automated email receipt in the meantime.
            </p>
            <p className={P_CLASSES}>
              Both forms are rate-limited per connection to reduce automated spam and abuse — see{' '}
              <a href="#security-practices" className={LINK_CLASSES}>
                Security Practices
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="cookies-and-analytics">5. Cookies and Analytics</h2>
            <p className={P_CLASSES}>
              This website does not set any cookies for visitors browsing the public site, and does
              not use any analytics, behavioural-tracking, or advertising tool. Your choice of
              light or dark theme is remembered using your browser&rsquo;s local storage, which
              stays on your device and is never sent to {company.legalName} or anyone else.
            </p>
            <p className={P_CLASSES}>
              [Open item] A password-protected admin area is planned for a later phase of this
              site, for {company.legalName}&rsquo;s own internal use, and is not built yet. When it
              exists, it will use a single session cookie, readable only by this site&rsquo;s own
              server, solely to keep that internal login signed in — never for tracking visitors,
              advertising, or analytics. This section will be updated if that changes, or if any
              analytics tool is ever added.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="data-storage">6. Data Storage</h2>
            <p className={P_CLASSES}>
              Form submissions are stored in a MongoDB Atlas database. This site&rsquo;s specific
              hosting region isn&rsquo;t published here.
            </p>
            <p className={P_CLASSES}>
              Quotation file attachments are designed to be stored with Cloudinary, a media-hosting
              service. [Open item] That integration is not active yet, so file attachments
              aren&rsquo;t currently being transmitted anywhere — the Quotation form can still be
              submitted in full without one. Once Cloudinary is active, this section will describe
              exactly what it can access.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="third-party-services">7. Third-Party Services</h2>
            <p className={P_CLASSES}>
              This site is built to use a small number of third-party services. Each is listed
              below with what it&rsquo;s used for and a link to its own privacy policy.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-body text-secondary">
              <li>
                <span className="font-medium text-primary">MongoDB Atlas</span> — stores Contact
                and Quotation form submissions.{' '}
                <a
                  href="https://www.mongodb.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASSES}
                >
                  MongoDB&rsquo;s privacy policy
                </a>
              </li>
              <li>
                <span className="font-medium text-primary">Cloudinary</span> — intended for storing
                Quotation file attachments; not active yet, see{' '}
                <a href="#data-storage" className={LINK_CLASSES}>
                  Data Storage
                </a>
                .{' '}
                <a
                  href="https://cloudinary.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASSES}
                >
                  Cloudinary&rsquo;s privacy policy
                </a>
              </li>
              <li>
                <span className="font-medium text-primary">Cloudflare Turnstile</span> — a
                spam-prevention check designed to run on the Contact form; not active yet.{' '}
                <a
                  href="https://www.cloudflare.com/privacypolicy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASSES}
                >
                  Cloudflare&rsquo;s privacy policy
                </a>
              </li>
              <li>
                <span className="font-medium text-primary">Vercel</span> — hosts the public
                website.{' '}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASSES}
                >
                  Vercel&rsquo;s privacy policy
                </a>
              </li>
              <li>
                <span className="font-medium text-primary">Render</span> — hosts a backend service
                used by this site.{' '}
                <a
                  href="https://render.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASSES}
                >
                  Render&rsquo;s privacy policy
                </a>
              </li>
            </ul>
            <p className={P_CLASSES}>
              This site does not currently use any analytics, advertising, or tracking service — see{' '}
              <a href="#cookies-and-analytics" className={LINK_CLASSES}>
                Cookies and Analytics
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="data-retention">8. Data Retention</h2>
            <p className={P_CLASSES}>
              Information submitted through the Contact or Quotation form is kept for as long as
              necessary to respond to your inquiry or to discuss and deliver a project, unless a
              longer period is required by law. [Open item] A specific retention schedule — for
              example, automatic deletion after a fixed number of months of inactivity — has not
              been finalised yet. If you&rsquo;d like your information deleted sooner, you can
              request that directly at any time; see{' '}
              <a href="#your-rights" className={LINK_CLASSES}>
                Your Rights
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="security-practices">9. Security Practices</h2>
            <p className={P_CLASSES}>The following measures are actually in place today:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-secondary">
              <li>
                Every form submission is validated on the server before being stored — this, not
                the in-browser check, is the real safeguard
              </li>
              <li>A second layer of validation at the database level</li>
              <li>Per-connection rate limiting on both forms, to reduce automated abuse</li>
              <li>
                Quotation file attachments are checked by their actual file content, not just the
                file name or the type your browser reports
              </li>
              <li>The site is served over HTTPS by its hosting providers</li>
            </ul>
            <p className={P_CLASSES}>
              [Open item] A password-protected admin area, with bcrypt-hashed credentials and an
              HTTP-only session cookie, is planned for a later phase and is not built yet — see{' '}
              <a href="#cookies-and-analytics" className={LINK_CLASSES}>
                Cookies and Analytics
              </a>
              . No part of this site currently holds any third-party security certification, and
              this policy does not claim one.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="your-rights">10. Your Rights</h2>
            <p className={P_CLASSES}>
              You can contact {company.legalName} at any time to ask what information you&rsquo;ve
              submitted, to correct it, or to have it deleted. {company.legalName} will respond
              directly and act on that request — see{' '}
              <a href="#contact-details" className={LINK_CLASSES}>
                Contact Details
              </a>{' '}
              below. [Open item] Which specific data-protection law applies to you depends on
              where you&rsquo;re located and on decisions {company.legalName} hasn&rsquo;t
              finalised yet, so this section describes a practice {company.legalName} follows for
              everyone, rather than citing a specific regulation.
            </p>
          </section>

          <section>
            <h2 className={H2_CLASSES} id="contact-details">11. Contact Details</h2>
            <p className={P_CLASSES}>
              Questions about this policy, or about any information you&rsquo;ve submitted, can be
              sent to:
            </p>
            <address className="mt-3 space-y-1 text-body text-secondary not-italic">
              <p className="font-medium text-primary">{company.legalName}</p>
              <p>{company.address.full}</p>
              <p>
                <a
                  href={company.email.href}
                  className="inline-block min-h-11 content-center rounded-field text-primary-blue underline underline-offset-4 wrap-anywhere focus-ring hover:text-primary-blue-hover"
                >
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
              This policy was last updated on {lastUpdatedDisplay}. It will be revised as the
              practices it describes change — in particular the items marked{' '}
              <span className="font-medium text-primary">[Open item]</span> above, once those are
              actually built or decided.
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
