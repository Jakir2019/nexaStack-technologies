import { SpeedInsights } from '@vercel/speed-insights/next';
import type { ReactNode } from 'react';

import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/layout/Navbar';
import { WhatsAppWidget } from '@/components/layout/WhatsAppWidget';

export interface MarketingLayoutProps {
  children: ReactNode;
}

/**
 * Public site shell: shared Navbar and Footer on every route in this group. `WhatsAppWidget`
 * is mounted here rather than the root layout so it's excluded from `(admin)` (its own separate
 * layout) and `/dev/*` preview routes (outside both route groups) without any path checks.
 *
 * `SpeedInsights` is mounted here for the same reason: Core Web Vitals field data should describe
 * what visitors experience, not the admin's or the dev proof pages'. It does nothing until the site is
 * deployed on Vercel with Speed Insights enabled (it loads `/_vercel/speed-insights/script.js`, which
 * only Vercel serves), so locally it reports nothing.
 */
export default function MarketingLayout({ children }: Readonly<MarketingLayoutProps>) {
  return (
    <>
      <Navbar />
      {/* tabIndex={-1}: a fragment link (the skip link, or any `#main-content` href) scrolls here
          either way, but only focuses it if it's focusable — without this, activating the skip
          link left focus on <body>, so the very next Tab restarted from the top of the page. */}
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <Footer />
      <WhatsAppWidget />
      {process.env.VERCEL === '1' && <SpeedInsights />}
    </>
  );
}
