import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { RouteFocusManager } from '@/components/layout/RouteFocusManager';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { company } from '@/config/company';
import { DEFAULT_SHARE_IMAGE } from '@/lib/blogImage';
import { cn } from '@/lib/cn';
import { env } from '@/lib/env';
import { themeInitScript } from '@/lib/theme';

import '@/styles/globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

const description = `${company.legalName} is a founder-led web development firm in Dhaka, Bangladesh. ${company.tagline}.`;

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: `${company.legalName} — ${company.tagline}`,
    template: `%s | ${company.legalName}`,
  },
  description,
  applicationName: company.legalName,
  authors: [{ name: company.founder.name }],
  creator: company.legalName,
  openGraph: {
    type: 'website',
    siteName: company.legalName,
    title: company.legalName,
    description,
    locale: 'en',
    images: [DEFAULT_SHARE_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: company.legalName,
    description,
    images: [DEFAULT_SHARE_IMAGE],
  },
  // Renders a google-site-verification meta tag only once a real Search Console code exists
  // (CLAUDE.md 22.1 — the domain itself is still unresolved). Omitted entirely when unset.
  verification: env.GOOGLE_SITE_VERIFICATION ? { google: env.GOOGLE_SITE_VERIFICATION } : undefined,
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

// Site-wide Organization JSON-LD (root CLAUDE.md section 13). Real, already-established facts
// only: company identity, public business email, founder and social profiles.
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: company.legalName,
  email: company.email.general,
  url: env.NEXT_PUBLIC_SITE_URL,
  logo: `${env.NEXT_PUBLIC_SITE_URL}/brand/nexastack-mark.png`,
  founder: {
    '@type': 'Person',
    name: company.founder.name,
    jobTitle: company.founder.jobTitle,
  },
  sameAs: [company.social.github, company.social.linkedin],
};

export interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    // suppressHydrationWarning: the theme script changes <html> class/style before hydration.
    <html lang="en" className={cn(geistSans.variable, geistMono.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      {/*
       * suppressHydrationWarning: a browser extension (not this app) injects a
       * `__processed_<uuid>__="true"` attribute onto <body> after the server response is
       * generated — confirmed by the UUID differing on every page load, which nothing in this
       * codebase can produce (no Math.random/Date.now/locale formatting/window branch anywhere
       * in apps/web). There is no application-side fix for third-party DOM mutation, so this
       * only silences the resulting, unactionable warning — it must not be used to hide a real
       * mismatch.
       */}
      <body suppressHydrationWarning>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:inline-flex focus:min-h-12 focus:items-center focus:rounded-btn focus:border focus:border-default focus:bg-surface focus:px-4 focus:font-semibold focus:text-primary"
        >
          Skip to main content
        </a>
        <RouteFocusManager />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
