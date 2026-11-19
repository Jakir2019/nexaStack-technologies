import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { navigationActions, primaryNavigation } from '@/config/navigation';
import { services } from '@/config/services';
import { solutions } from '@/config/solutions';
import { DISALLOWED_PATHS, PUBLIC_ROUTES } from '@/lib/routes';

/**
 * Consistency between the route inventory (`PUBLIC_ROUTES`, which the sitemap is generated from), the
 * navigation config and the pages that actually exist on disk. A page added without a sitemap entry, or a
 * nav link to a page that does not exist, fails here instead of surfacing as a 404 in production.
 */

const appDir = path.resolve(import.meta.dirname, '..', 'app');
const marketingDir = path.join(appDir, '(marketing)');

/** Static (non-dynamic) URL paths that have a `page.tsx` under the marketing route group. */
function marketingStaticPages(dir = marketingDir, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory() || entry.startsWith('[')) continue;
    const url = `${prefix}/${entry}`;
    if (statSync(path.join(full, 'page.tsx'), { throwIfNoEntry: false })?.isFile()) found.push(url);
    found.push(...marketingStaticPages(full, url));
  }
  return found;
}

function hasPage(urlPath: string): boolean {
  const segments = urlPath === '/' ? [] : urlPath.split('/').filter(Boolean);
  return Boolean(
    statSync(path.join(marketingDir, ...segments, 'page.tsx'), { throwIfNoEntry: false })?.isFile(),
  );
}

/** Marketing pages deliberately absent from the sitemap. */
const NOT_IN_SITEMAP = new Map<string, string>();

describe('PUBLIC_ROUTES (the sitemap source)', () => {
  it('lists each path once, as an absolute path with a valid priority', () => {
    const paths = PUBLIC_ROUTES.map((route) => route.path);
    assert.equal(new Set(paths).size, paths.length);
    for (const route of PUBLIC_ROUTES) {
      assert.match(route.path, /^\/[a-z0-9\-/]*$/);
      assert.ok(route.priority >= 0 && route.priority <= 1, `${route.path} priority`);
    }
  });

  it('every listed route has a page on disk', () => {
    for (const route of PUBLIC_ROUTES)
      assert.equal(hasPage(route.path), true, `${route.path} has no page.tsx`);
  });

  it('every static marketing page is listed, or is a documented exception (a new page cannot skip the sitemap)', () => {
    const listed = new Set<string>(PUBLIC_ROUTES.map((route) => route.path));
    const unlisted = marketingStaticPages().filter(
      (url) => !listed.has(url) && !NOT_IN_SITEMAP.has(url),
    );
    assert.deepEqual(
      unlisted,
      [],
      'add each to PUBLIC_ROUTES (lib/routes.ts) or to NOT_IN_SITEMAP with a reason',
    );
  });

  it('the documented exceptions still exist and are still not listed', () => {
    for (const [url] of NOT_IN_SITEMAP) {
      assert.equal(hasPage(url), true, `${url} no longer exists: drop it from NOT_IN_SITEMAP`);
      assert.equal(
        PUBLIC_ROUTES.some((route) => route.path === url),
        false,
        `${url} is now listed`,
      );
    }
  });
});

describe('navigation', () => {
  it('every primary navigation link and the quote action point at a page that exists', () => {
    for (const item of [...primaryNavigation, navigationActions.quote]) {
      assert.equal(hasPage(item.href), true, `${item.label} -> ${item.href} has no page.tsx`);
    }
  });

  it('has no duplicate links or labels', () => {
    const hrefs = primaryNavigation.map((item) => item.href);
    const labels = primaryNavigation.map((item) => item.label);
    assert.equal(new Set(hrefs).size, hrefs.length);
    assert.equal(new Set(labels).size, labels.length);
  });

  it('the header links to Home first, and the Get a Quote action is the quotation page', () => {
    assert.equal(primaryNavigation[0]?.href, '/');
    assert.equal(navigationActions.quote.href, '/quotation');
  });
});

describe('dynamic route data', () => {
  it('service and solution slugs are unique and URL-safe (each becomes a page)', () => {
    for (const [name, list] of [
      ['services', services],
      ['solutions', solutions],
    ] as const) {
      const slugs = list.map((item) => item.slug);
      assert.equal(new Set(slugs).size, slugs.length, `${name} has a duplicate slug`);
      for (const slug of slugs)
        assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${name}: ${slug}`);
    }
  });

  it('the six agreed services exist (CLAUDE.md 22.10)', () => {
    assert.deepEqual(services.map((service) => service.slug).sort(), [
      'admin-dashboards',
      'backend-and-apis',
      'business-websites',
      'maintenance-and-bug-fixing',
      'mern-nextjs-applications',
      'performance-seo-audits',
    ]);
  });
});

describe('robots disallow list', () => {
  it('keeps crawlers out of the admin area, the API and the dev pages', () => {
    for (const disallowed of ['/admin', '/api/', '/dev'])
      assert.ok(DISALLOWED_PATHS.includes(disallowed), disallowed);
  });

  it('never disallows a page that is in the sitemap', () => {
    for (const route of PUBLIC_ROUTES) {
      for (const disallowed of DISALLOWED_PATHS) {
        assert.equal(
          route.path.startsWith(disallowed),
          false,
          `${route.path} is both in the sitemap and disallowed`,
        );
      }
    }
  });
});
