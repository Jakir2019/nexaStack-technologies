import { expect, test } from '@playwright/test';

import { API_URL, WEB_URL } from '../support/env';
import { STATIC_ROUTES, isDesktop, publicPaths, sitemapPaths, state } from '../support/helpers';

/**
 * Navigation and links: every route in the inventory resolves, every internal link found in the rendered pages
 * resolves, navbar and footer match the navigation config, and the things that must NOT be reachable are not.
 * The route inventory for dynamic pages comes from the site's own sitemap, so a new service or post is covered
 * automatically.
 */

test.describe('routes', () => {
  test('every static route and every sitemap URL answers 200', async ({ request }) => {
    const paths = await publicPaths(request);
    expect(paths.length).toBeGreaterThan(STATIC_ROUTES.length + 5); // services + solutions + case study + a post
    const failures: string[] = [];
    for (const path of paths) {
      const response = await request.get(path);
      if (response.status() !== 200) failures.push(`${path} -> ${response.status()}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('an unknown URL is a real 404 with a helpful page, not a soft 200', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('link', { name: /home|back/i }).first()).toBeVisible();
  });

  test('unknown dynamic slugs are 404s', async ({ request }) => {
    // KNOWN DEFECT, reported and deliberately tracked rather than hidden: `/blog/[slug]/loading.tsx` streams the page
    // shell (HTTP 200) before `notFound()` runs, so a missing, draft, unpublished or archived post answers 200 with
    // a noindex "not found" body (a soft 404) even for Googlebot; `/services/nope` etc. are real 404s. Fixing it means
    // dropping that route's skeleton (a UX/performance decision for the site owner). `test.fail` keeps this test
    // green while the defect exists and turns RED the moment it is fixed, forcing this marker to be removed.
    test.fail(
      true,
      'soft 404 on /blog/[slug]: 200 + noindex instead of 404 (loading.tsx streaming)',
    );
    const wrong: string[] = [];
    for (const path of ['/services/nope', '/solutions/nope', '/portfolio/nope', '/blog/nope']) {
      const status = (await request.get(path)).status();
      if (status !== 404) wrong.push(`${path} -> ${status}`);
    }
    expect(
      wrong,
      `a missing page must be a real 404 for crawlers, not a 200: ${wrong.join(', ')}`,
    ).toEqual([]);
  });
});

test.describe('sitemap and robots', () => {
  test('the sitemap lists every static page on the configured origin', async ({ request }) => {
    const paths = await sitemapPaths(request);
    for (const route of STATIC_ROUTES) {
      expect(paths, route).toContain(route);
    }
    const xml = await (await request.get('/sitemap.xml')).text();
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g))
      expect(loc!.startsWith(WEB_URL), loc).toBe(true);
    for (const path of paths) expect(path).not.toMatch(/^\/(admin|api|dev)(\/|$)/);
  });

  test('the sitemap includes the published post and NOT the draft or archived ones', async ({
    request,
  }) => {
    const { publishedPost, draftPost, archivedPost } = state();
    const paths = await sitemapPaths(request);
    expect(paths).toContain(`/blog/${publishedPost.slug}`);
    expect(paths).not.toContain(`/blog/${draftPost.slug}`);
    expect(paths).not.toContain(`/blog/${archivedPost.slug}`);
  });

  test('robots.txt keeps crawlers out of /admin, /api/ and /dev and points at the sitemap', async ({
    request,
  }) => {
    const text = await (await request.get('/robots.txt')).text();
    for (const path of ['/admin', '/api/', '/dev'])
      expect(text).toMatch(new RegExp(`Disallow:\\s*${path}`));
    expect(text).toContain(`${WEB_URL}/sitemap.xml`);
  });
});

test.describe('links', () => {
  test('every internal link on every public page resolves (no broken link, no unintended 404)', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const paths = await publicPaths(request);
    const seen = new Map<string, string>(); // link -> first page it was found on
    const external = new Set<string>();

    for (const path of paths) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const hrefs = await page.$$eval('a[href]', (anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
      );
      for (const href of hrefs) {
        const url = new URL(href);
        if (url.origin !== WEB_URL) {
          external.add(href);
          continue;
        }
        if (!['http:', 'https:'].includes(url.protocol)) continue;
        url.hash = '';
        if (!seen.has(url.toString())) seen.set(url.toString(), path);
      }
    }

    const broken: string[] = [];
    for (const [link, foundOn] of seen) {
      const response = await request.get(link);
      if (response.status() >= 400)
        broken.push(`${link} -> ${response.status()} (linked from ${foundOn})`);
    }
    expect(seen.size, 'the crawl should have found many links').toBeGreaterThan(30);
    expect(broken, broken.join('\n')).toEqual([]);

    // External links: only https (or tel/mailto/wa handled elsewhere), never javascript:.
    for (const href of external) expect(href, href).toMatch(/^(https:|mailto:|tel:)/);
  });

  test('external links that open a new tab carry rel="noopener" (no window.opener leak)', async ({
    page,
    request,
  }) => {
    const paths = await publicPaths(request);
    const offenders: string[] = [];
    for (const path of paths) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const bad = await page.$$eval('a[target="_blank"]', (anchors) =>
        anchors
          .filter((anchor) => !/\bnoopener\b/.test(anchor.getAttribute('rel') ?? ''))
          .map((anchor) => (anchor as HTMLAnchorElement).href),
      );
      for (const href of bad) offenders.push(`${path}: ${href}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('the header and footer link to every page in the navigation config (desktop)', async ({
    page,
  }) => {
    await page.goto('/');
    test.skip(
      !isDesktop(page),
      'the header navigation collapses into a drawer below the desktop breakpoint',
    );
    const header = new Set(
      await page.$$eval('header a[href]', (anchors) =>
        anchors.map((a) => new URL((a as HTMLAnchorElement).href).pathname),
      ),
    );
    for (const href of [
      '/',
      '/about',
      '/services',
      '/solutions',
      '/portfolio',
      '/process',
      '/blog',
      '/contact',
      '/quotation',
    ]) {
      expect(header, `header should link to ${href}`).toContain(href);
    }
    const footer = new Set(
      await page.$$eval('footer a[href]', (anchors) =>
        anchors.map((a) => new URL((a as HTMLAnchorElement).href).pathname),
      ),
    );
    for (const href of [
      '/about',
      '/services',
      '/blog',
      '/contact',
      '/privacy-policy',
      '/terms-and-conditions',
    ]) {
      expect(footer, `footer should link to ${href}`).toContain(href);
    }
  });
});

test.describe('what must not be reachable', () => {
  test('protected admin pages redirect an unauthenticated visitor to the login page, and never send their content', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    for (const path of [
      '/admin',
      '/admin/enquiries',
      '/admin/quotations',
      '/admin/blog',
      '/admin/media',
      '/admin/users',
      '/admin/activity',
    ]) {
      await page.goto(path);
      // The redirect is issued while the page streams, so wait for it rather than reading the URL at `load`.
      await page.waitForURL('**/admin/login', { timeout: 15_000 }).catch(() => undefined);
      expect(new URL(page.url()).pathname, path).toBe('/admin/login');
    }
    await context.close();
  });

  test('the admin API refuses an unauthenticated request', async ({ request }) => {
    expect((await request.get(`${API_URL}/api/v1/admin/enquiries`)).status()).toBe(401);
  });

  test('the developer preview pages are not served in production', async ({ request }) => {
    const served: string[] = [];
    for (const path of [
      '/dev/tokens',
      '/dev/blog-preview',
      '/dev/blog-post-preview',
      '/dev/testimonials-preview',
    ]) {
      const status = (await request.get(path)).status();
      if (status !== 404) served.push(`${path} -> ${status}`);
    }
    expect(
      served,
      `these pages are described as "dev-only" and must not ship: ${served.join(', ')}`,
    ).toEqual([]);
  });
});
