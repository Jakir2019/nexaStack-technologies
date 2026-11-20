import { expect, test, type Page } from '@playwright/test';

import { api } from '../support/api';
import { ADMINS, API_URL, authFile, type Role } from '../support/env';
import { cookieFor, state } from '../support/helpers';

/**
 * The admin interface in a real browser, against the real API: signing in and out, what each of the three roles
 * can SEE and can actually DO (the server is asked directly, because hiding a link proves nothing), and the Blog
 * CMS publishing lifecycle observed on the PUBLIC site after every state change, including a hostile post.
 */

const unique = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('signing in and out', () => {
  test('a wrong password is refused with a visible error; the right one reaches the dashboard; sign out ends the session', async ({
    browser,
  }, testInfo) => {
    // The login limiter is 5 per IP per 15 minutes and every browser request shares one IP, so this runs once.
    test.skip(
      testInfo.project.name !== 'chromium',
      'login attempts are rate limited per IP: run once, on Chromium',
    );
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('/admin');
    await page.waitForURL('**/admin/login');

    await page.getByLabel(/Email/i).fill(ADMINS.super_admin.email);
    await page.getByLabel(/Password/i).fill('Definitely-Wrong-Password-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('form').getByRole('alert')).toHaveText('Incorrect email or password.');
    expect(new URL(page.url()).pathname).toBe('/admin/login');
    expect(
      (await context.cookies()).some((cookie) => cookie.name === 'nexastack_admin_session'),
    ).toBe(false);

    await page.getByLabel(/Password/i).fill(ADMINS.super_admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/admin');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible();
    const status = await page.evaluate(async (apiOrigin) => {
      const response = await fetch(`${apiOrigin}/api/v1/auth/session`, { credentials: 'include' });
      return response.status;
    }, API_URL);
    expect(status).toBe(200);

    const cookie = (await context.cookies()).find((c) => c.name === 'nexastack_admin_session');
    expect(cookie?.httpOnly, 'the session cookie is HttpOnly (script cannot read it)').toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('nexastack_admin_session');
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...window.localStorage, ...window.sessionStorage }),
      ),
    ).not.toMatch(/eyJ/);

    await page.getByRole('button', { name: /sign out|log ?out/i }).click();
    await page.waitForURL('**/admin/login');
    await page.goto('/admin/enquiries');
    await page.waitForURL('**/admin/login');
    await context.close();
  });

  for (const scenario of [
    { name: 'missing cookie', cookie: '', message: 'dashboard did not receive the session cookie' },
    {
      name: 'invalid cookie',
      cookie: 'nexastack_admin_session=invalid; HttpOnly; Path=/; SameSite=Lax',
      message: 'session could not be confirmed',
    },
  ]) {
    test(`accepted login with a ${scenario.name} stays on the form`, async ({ page, request }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'use one login attempt');
      // Keep the real login and verification endpoints on both sides of this browser failure.
      await page.route('**/api/v1/auth/login', async (route) => {
        const response = await request.fetch(route.request());
        const headers = response.headers();
        delete headers['set-cookie'];
        if (scenario.cookie) headers['set-cookie'] = scenario.cookie;
        await route.fulfill({ response, headers });
      });
      await page.goto('/admin/login');
      await page.getByLabel(/Email/i).fill(ADMINS.super_admin.email);
      await page.getByLabel(/Password/i).fill(ADMINS.super_admin.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.locator('form').getByRole('alert')).toContainText(scenario.message);
      await expect(page).toHaveURL(/\/admin\/login$/);
    });
  }
});

/** What each role's navigation shows: the SAME rules as `visibleNavLinks`, written out literally. */
const EXPECTED_NAV: Record<Role, string[]> = {
  super_admin: ['Dashboard', 'Enquiries', 'Quotations', 'Blog', 'Media', 'Users', 'Activity'],
  admin: ['Dashboard', 'Enquiries', 'Quotations', 'Blog', 'Media', 'Activity'],
  content_editor: ['Dashboard', 'Blog', 'Media'],
};

/** For each role: [API path, the status the SERVER must answer]. This is authorisation, not visibility. */
const SERVER_DECISIONS: Record<Role, [string, number][]> = {
  super_admin: [
    ['/admin/enquiries', 200],
    ['/admin/users', 200],
    ['/auth/activity', 200],
    ['/admin/blog/posts', 200],
  ],
  admin: [
    ['/admin/enquiries', 200],
    ['/admin/users', 403],
    ['/auth/activity', 200],
    ['/admin/blog/posts', 200],
  ],
  content_editor: [
    ['/admin/enquiries', 403],
    ['/admin/quotations', 403],
    ['/admin/users', 403],
    ['/auth/activity', 403],
    ['/admin/blog/posts', 200],
    ['/admin/media', 200],
  ],
};

for (const role of ['super_admin', 'admin', 'content_editor'] as const) {
  test.describe(`as ${role}`, () => {
    test.use({ storageState: authFile(role) });

    test('the navigation shows exactly the areas this role may use', async ({ page }) => {
      await page.goto('/admin');
      await expect(page.locator('h1').first()).toBeVisible();
      const links = await page.$$eval('header a, nav a', (anchors) =>
        anchors
          .filter((a) => (a as HTMLAnchorElement).pathname.startsWith('/admin'))
          .map((a) => a.textContent?.trim() ?? ''),
      );
      const shown = [
        'Dashboard',
        'Enquiries',
        'Quotations',
        'Blog',
        'Media',
        'Users',
        'Activity',
      ].filter((name) => links.includes(name));
      expect(shown).toEqual(EXPECTED_NAV[role]);
    });

    test('the SERVER, not just the interface, enforces it (the browser session is asked directly)', async ({
      page,
    }) => {
      for (const [path, expected] of SERVER_DECISIONS[role]) {
        const response = await page.request.get(`${API_URL}/api/v1${path}`);
        expect(response.status(), `${role} -> GET ${path}`).toBe(expected);
      }
    });

    if (role === 'admin') {
      test('typing the address of the admin-accounts page shows a no-access screen, not the data', async ({
        page,
      }) => {
        await page.goto('/admin/users');
        await expect(page.getByRole('heading', { level: 1 })).toContainText(/No access/i);
        await expect(page.locator('table')).toHaveCount(0);
      });
    }

    if (role === 'content_editor') {
      // Enquiries and quotations refuse through the API (403) and the page shows its error state instead of rows.
      // (Only /admin/users and /admin/activity use the dedicated NoAccess screen: a small inconsistency, noted in the report.)
      test('typing the address of the enquiries page shows a permission error and NO enquiry data', async ({
        page,
      }) => {
        await page.goto('/admin/enquiries');
        await expect(
          page.getByText('Your account does not have permission to view this.'),
        ).toBeVisible();
        await expect(page.locator('ul[aria-label="Enquiries"]')).toHaveCount(0);
        await expect(page.getByRole('link', { name: /Test User/ })).toHaveCount(0);
      });
    }
  });
}

test.describe('an action the role is not allowed, attempted straight against the API from its own browser session', () => {
  test.use({ storageState: authFile('content_editor') });

  test('a content_editor cannot publish: the server answers 403 and the post stays a draft', async ({
    page,
  }) => {
    const draft = state().draftPost;
    const response = await page.request.post(
      `${API_URL}/api/v1/admin/blog/posts/${draft.id}/status`,
      {
        data: { status: 'published' },
        headers: { origin: 'http://localhost:3210', 'x-requested-with': 'nexastack-admin' },
      },
    );
    expect(response.status()).toBe(403);
    const check = await api(`/admin/blog/posts/${draft.id}`, { cookie: cookieFor('super_admin') });
    expect(check.body.data.post.status).toBe('draft');
  });
});

test.describe('the Blog CMS lifecycle, observed on the public site', () => {
  test.use({ storageState: authFile('admin') });
  test.describe.configure({ mode: 'serial' });

  let post: { id: string; slug: string; title: string };

  const isPublic = async (page: Page) => {
    await page.goto(`/blog/${post.slug}`);
    return (await page.locator('h1').first().textContent())?.trim() === post.title;
  };
  const inBlogList = async (page: Page) => {
    await page.goto('/blog');
    return (await page.getByText(post.title).count()) > 0;
  };
  const inSitemap = async (page: Page) =>
    (await (await page.request.get('/sitemap.xml')).text()).includes(`/blog/${post.slug}`);
  const press = async (
    page: Page,
    action: 'Publish' | 'Unpublish' | 'Archive' | 'Restore to draft',
    done: RegExp,
  ) => {
    await page.goto(`/admin/blog/${post.id}/edit`);
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: done })).toBeVisible();
  };

  test.beforeAll(async () => {
    const title = `E2E lifecycle ${unique()}`;
    const created = await api('/admin/blog/posts', {
      method: 'POST',
      cookie: cookieFor('admin'),
      body: {
        title,
        excerpt: `A synthetic excerpt for the lifecycle test ${title}.`,
        categoryId: state().categoryId,
        tags: ['e2e'],
        contentMarkdown: 'Synthetic lifecycle body, long enough to pass validation.',
        featured: false,
      },
    });
    expect(created.status).toBe(201);
    post = { id: created.body.data.post.id, slug: created.body.data.post.slug, title };
  });

  test('a DRAFT is not public, and the admin preview renders it through the public template', async ({
    page,
  }) => {
    expect(await isPublic(page)).toBe(false);
    expect(await inBlogList(page)).toBe(false);
    expect(await inSitemap(page)).toBe(false);

    await page.goto(`/admin/blog/${post.id}/preview`);
    await expect(page.locator('h1').first()).toHaveText(post.title);
    await expect(page.locator('.article-prose, article').first()).toContainText(
      'Synthetic lifecycle body',
    );
    expect(await page.locator('meta[name="robots"]').first().getAttribute('content')).toMatch(
      /noindex/,
    );
  });

  test('PUBLISH makes it public everywhere at once', async ({ page }) => {
    await press(page, 'Publish', /Published\. It is now live/);
    expect(await isPublic(page)).toBe(true);
    expect(await inBlogList(page)).toBe(true);
    expect(await inSitemap(page)).toBe(true);
  });

  test('UNPUBLISH takes it down everywhere at once', async ({ page }) => {
    await press(page, 'Unpublish', /Unpublished/);
    expect(await isPublic(page)).toBe(false);
    expect(await inBlogList(page)).toBe(false);
    expect(await inSitemap(page)).toBe(false);
  });

  test('re-publishing works, then ARCHIVE hides it again', async ({ page }) => {
    await press(page, 'Publish', /Published\. It is now live/);
    expect(await isPublic(page)).toBe(true);
    await press(page, 'Archive', /Archived/);
    expect(await isPublic(page)).toBe(false);
    expect(await inBlogList(page)).toBe(false);
    expect(await inSitemap(page)).toBe(false);
  });

  test('RESTORE returns it to a draft (still not public); the API shows the final state', async ({
    page,
  }) => {
    await press(page, 'Restore to draft', /Restored to a draft/);
    expect(await isPublic(page)).toBe(false);
    const stored = await api(`/admin/blog/posts/${post.id}`, { cookie: cookieFor('super_admin') });
    expect(stored.body.data.post.status).toBe('draft');
  });
});

test.describe('seeded posts: only the published one is public', () => {
  test('published is reachable and listed; draft and archived are neither', async ({ page }) => {
    const { publishedPost, draftPost, archivedPost } = state();
    await page.goto(`/blog/${publishedPost.slug}`);
    await expect(page.locator('h1').first()).toHaveText(publishedPost.title);
    await page.goto('/blog');
    await expect(page.getByText(publishedPost.title)).toBeVisible();
    await expect(page.getByText(draftPost.title)).toHaveCount(0);
    await expect(page.getByText(archivedPost.title)).toHaveCount(0);
    for (const hidden of [draftPost, archivedPost]) {
      await page.goto(`/blog/${hidden.slug}`);
      await expect(page.locator('h1').first()).not.toHaveText(hidden.title);
      await expect(page.getByText(/could not be found|not found/i).first()).toBeVisible();
    }
  });
});

test.describe('XSS through the Blog CMS: a hostile post must be inert in the preview and on the public page', () => {
  test.use({ storageState: authFile('admin') });

  const PAYLOAD = [
    'Intro paragraph that is long enough to pass validation.',
    '',
    '<script>window.__xss = "script"</script>',
    '<img src=x onerror="window.__xss = \'onerror\'">',
    '<svg onload="window.__xss = \'svg\'"></svg>',
    "[click me](javascript:window.__xss='link')",
    '[data link](data:text/html;base64,PHNjcmlwdD53aW5kb3cuX194c3MgPSAiZGF0YSI8L3NjcmlwdD4=)',
    '**<b onmouseover="window.__xss = \'hover\'">bold</b>**',
    '',
    '```html',
    '<script>window.__xss = "fence"</script>',
    '```',
  ].join('\n');

  async function assertInert(page: Page, url: string) {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await page.goto(url);
    await page.waitForLoadState('load');
    await page.locator('h1').first().hover({ timeout: 5_000 });
    await page
      .locator('.article-prose strong, .article-prose b')
      .first()
      .hover({ timeout: 2_000 })
      .catch(() => undefined);

    expect(
      await page.evaluate(() => (window as unknown as { __xss?: string }).__xss),
      'no injected script ran',
    ).toBeUndefined();
    expect(dialogs).toEqual([]);
    // The post BODY (the first <article> on the page can be a related-post card).
    const article = page.locator('.article-prose').first();
    await expect(article).toBeVisible();
    expect(
      await article
        .locator('script, iframe, img[onerror], svg[onload], [onmouseover], [onerror], [onload]')
        .count(),
      'no active element or handler in the article',
    ).toBe(0);
    const hrefs = await article
      .locator('a')
      .evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href') ?? ''));
    for (const href of hrefs)
      expect(href, 'no script-scheme link').not.toMatch(/^\s*(javascript|data|vbscript):/i);
    await expect(article).toContainText('window.__xss'); // the payload is visible as harmless text, not executed or dropped
  }

  test('preview and public page both render it inert (and the publish goes through the real UI)', async ({
    page,
  }) => {
    const title = `E2E hostile ${unique()}`;
    const created = await api('/admin/blog/posts', {
      method: 'POST',
      cookie: cookieFor('admin'),
      body: {
        title,
        excerpt: `A synthetic hostile post for the XSS test ${title}.`,
        categoryId: state().categoryId,
        tags: ['e2e'],
        contentMarkdown: PAYLOAD,
        featured: false,
      },
    });
    expect(created.status).toBe(201);
    const { id, slug } = created.body.data.post as { id: string; slug: string };

    await assertInert(page, `/admin/blog/${id}/preview`);

    await page.goto(`/admin/blog/${id}/edit`);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /Published\. It is now live/ }),
    ).toBeVisible();

    await assertInert(page, `/blog/${slug}`);
  });
});
