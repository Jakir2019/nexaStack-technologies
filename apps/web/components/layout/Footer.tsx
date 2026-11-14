import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { company } from '@/config/company';
import { primaryNavigation } from '@/config/navigation';
import { services } from '@/config/services';

const HEADING_CLASSES = 'text-label font-semibold text-primary';
const LIST_LINK_CLASSES =
  'rounded-field text-body text-secondary underline-offset-4 focus-ring hover:text-primary-blue-hover hover:underline';

function copyrightYears(): string {
  const currentYear = new Date().getFullYear();
  return currentYear > company.foundingYear
    ? `${company.foundingYear}–${currentYear}`
    : `${company.foundingYear}`;
}

/**
 * Site-wide footer, rendered once in `app/(marketing)/layout.tsx` so it appears on every
 * public route. Server Component — nothing here needs client JavaScript. Not nested inside
 * any sectioning element, so `<footer>` keeps its implicit `contentinfo` landmark role.
 */
export function Footer() {
  return (
    <footer className="border-t border-default bg-background-alt">
      <h2 className="sr-only">Footer</h2>

      <div className="page-container py-12 md:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] lg:gap-8">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-field">
              <span className="flex flex-col">
                <span className="text-card leading-none font-bold tracking-tight">
                  <span className="text-primary">Nexa</span>
                  <span className="text-primary-blue">Stack</span>
                </span>
                <span className="mt-1 text-label leading-none font-medium tracking-wider text-secondary uppercase">
                  Technologies
                </span>
              </span>
              <span className="sr-only">{company.legalName}, home</span>
            </Link>
            <p className="mt-4 max-w-xs text-body text-secondary">
              {company.tagline}. {company.shortDescription}
            </p>
          </div>

          <nav aria-label="Footer quick links">
            <h3 className={HEADING_CLASSES}>Quick Links</h3>
            <ul className="mt-4 space-y-3">
              {primaryNavigation.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={LIST_LINK_CLASSES}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer services">
            <h3 className={HEADING_CLASSES}>Services</h3>
            <ul className="mt-4 space-y-3">
              {services.map((service) => (
                <li key={service.slug}>
                  <Link href={`/services/${service.slug}`} className={LIST_LINK_CLASSES}>
                    {service.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            <h3 className={HEADING_CLASSES}>Contact</h3>
            <address className="mt-4 space-y-3 text-body text-secondary not-italic">
              <p>{company.address.full}</p>
              <p>
                <a href={company.phone.href} className={LIST_LINK_CLASSES}>
                  {company.phone.display}
                </a>
              </p>
              <p>
                <span className="block text-label font-semibold text-primary">Business Email</span>
                <a
                  href={company.email.href}
                  aria-label={`Business Email: ${company.email.general}`}
                  className="block min-h-11 content-center rounded-field text-label font-semibold wrap-anywhere text-primary-blue underline-offset-4 focus-ring hover:text-primary-blue-hover hover:underline"
                >
                  {company.email.general}
                </a>
              </p>
              <p>
                <span className="block text-label">Alternative Email</span>
                <a
                  href={company.email.secondaryHref}
                  aria-label={`Alternative Email: ${company.email.secondary}`}
                  className="block min-h-11 content-center rounded-field text-label wrap-anywhere text-secondary underline-offset-4 focus-ring hover:text-primary-blue-hover hover:underline"
                >
                  {company.email.secondary}
                </a>
              </p>
              <p>{company.hours.display}</p>
            </address>
          </div>

          <div>
            <h3 className={HEADING_CLASSES}>Follow</h3>
            <div className="mt-4 flex gap-3">
              <Button
                variant="secondary"
                href={company.social.github}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="size-12 px-0"
              >
                {/* Simple Icons (CC0-1.0), in currentColor — same sourcing as the WhatsApp glyph. */}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-5">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </Button>
              <Button
                variant="secondary"
                href={company.social.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="size-12 px-0"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-5">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 border-t border-default pt-8 sm:flex-row sm:justify-between">
          <p className="text-label text-secondary">
            &copy; {copyrightYears()} {company.legalName}. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/privacy-policy" className={LIST_LINK_CLASSES}>
              Privacy Policy
            </Link>
            <Link href="/terms-and-conditions" className={LIST_LINK_CLASSES}>
              Terms and Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
