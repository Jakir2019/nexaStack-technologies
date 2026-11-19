import type { MetadataRoute } from 'next';

type SitemapEntry = MetadataRoute.Sitemap[number];

export interface PublicRoute {
  path: `/${string}`;
  changeFrequency: NonNullable<SitemapEntry['changeFrequency']>;
  priority: number;
}

/**
 * Public, indexable static routes. `app/sitemap.ts` is generated from this list; add a route
 * here when its page is built. Dynamic routes (services, projects, posts) will be appended
 * from their data sources.
 */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: '/', changeFrequency: 'monthly', priority: 1 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/services', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/solutions', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/portfolio', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/technologies', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/process', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/testimonials', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.6 },
  { path: '/quotation', changeFrequency: 'yearly', priority: 0.6 },
  { path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms-and-conditions', changeFrequency: 'yearly', priority: 0.3 },
];

/** Areas that must never be crawled. */
export const DISALLOWED_PATHS: readonly string[] = ['/admin', '/api/', '/dev'];
