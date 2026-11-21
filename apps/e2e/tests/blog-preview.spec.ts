import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import articles from '../../../content/blog/manifest.json' with { type: 'json' };
import { api, SESSION_COOKIE } from '../support/api';
import { authFile, WEB_URL } from '../support/env';
import { cookieFor, runAxe, state, waitForHydration } from '../support/helpers';

async function createDraft(article: (typeof articles)[number], coverImage = article.coverImage) {
  const contentMarkdown = readFileSync(
    new URL(`../../../content/blog/${article.slug}.md`, import.meta.url),
    'utf8',
  )
    .replace(/\r\n/g, '\n')
    .trim();
  const saved = await api('/admin/blog/posts', {
    method: 'POST',
    cookie: cookieFor('admin'),
    body: {
      ...article,
      slug: `test-${randomUUID()}`,
      categoryId: state().categoryId,
      coverImage,
      contentMarkdown,
    },
  });
  expect(saved.status).toBe(201);
  const { id, slug } = saved.body.data.post as { id: string; slug: string };
  return {
    id,
    slug,
    contentMarkdown,
    preview: `/admin/blog/${id}/preview`,
    edit: `/admin/blog/${id}/edit`,
  };
}

test.describe('full-length saved article previews', () => {
  test.use({ storageState: authFile('admin') });

  for (const article of articles) {
    test(article.title, async ({ page }) => {
      test.setTimeout(90_000);
      const draft = await createDraft(article);
      const read = await api(`/admin/blog/posts/${draft.id}`, { cookie: cookieFor('admin') });
      expect(read.status).toBe(200);
      expect(read.body.data.post.contentMarkdown).toBe(draft.contentMarkdown);
      expect(read.body.data.post.status).toBe('draft');

      for (const [width, height, theme] of [
        [375, 667, 'light'],
        [768, 1024, 'dark'],
        [1280, 800, 'light'],
        [1920, 1080, 'dark'],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(draft.preview);
        const heading = page.getByRole('heading', { level: 1, name: article.title, exact: true });
        await heading.scrollIntoViewIfNeeded();
        // Playwright's toBeVisible() accepts opacity:0, including on ancestors.
        expect(await heading.evaluate((el) => el.checkVisibility({ opacityProperty: true }))).toBe(
          true,
        );
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
        const rendered = page.getByRole('article').filter({ has: heading });
        await expect(rendered.getByText(article.excerpt, { exact: true })).toBeVisible();
        await expect(rendered.locator('header time')).toHaveCount(0);

        const body = rendered.locator('.article-prose');
        const savedText = await page.evaluate(
          (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent,
          read.body.data.post.contentHtml,
        );
        await expect(body).toHaveText(savedText);
        expect(await body.locator('h2').count()).toBeGreaterThan(1);
        expect(await body.evaluate((el) => el.checkVisibility({ opacityProperty: true }))).toBe(
          true,
        );
        const cover = page.getByRole('img', { name: article.coverImageAlt });
        await expect
          .poll(() => cover.evaluate((el: HTMLImageElement) => el.currentSrc))
          .toBe(WEB_URL + article.coverImage);
        await expect
          .poll(() => cover.evaluate((el: HTMLImageElement) => el.naturalWidth))
          .toBe(1200);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        ).toBe(true);

        if (width === 375 && draft.contentMarkdown.includes('\n|')) {
          const table = body.getByRole('region', { name: 'Comparison table' }).first();
          await expect(table.getByRole('columnheader').first()).toBeVisible();
          expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
          await table.focus();
          await page.keyboard.press('ArrowRight');
          await expect.poll(() => table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
        }
      }
      await page.goto(`/blog/${draft.slug}`);
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    });
  }

  test('editor save, preview, refresh, and keyboard return use the same draft', async ({
    page,
  }) => {
    const draft = await createDraft(articles[0]!, '/images/blog/missing-test-cover.svg');
    await page.goto(draft.edit);
    await waitForHydration(page);
    const updated = draft.contentMarkdown + '\n\n## Saved revision\n\nThe latest saved paragraph.';
    await page.getByLabel('Body (markdown)', { exact: false }).fill(updated);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    const opened = page.waitForEvent('popup');
    await page.getByRole('link', { name: /^Preview/ }).click();
    const preview = await opened;
    await expect(preview).toHaveURL(WEB_URL + draft.preview);
    await preview.reload();
    await expect(preview.getByRole('heading', { name: 'Saved revision' })).toBeVisible();
    await expect(preview.locator('.article-prose p').last()).toHaveText(
      'The latest saved paragraph.',
    );
    await expect(preview.locator('article header img')).toHaveCount(0);
    expect(await runAxe(preview)).toEqual([]);
    const back = preview.getByRole('link', { name: 'Back to editor' });
    await back.focus();
    await preview.keyboard.press('Tab');
    await preview.keyboard.press('Shift+Tab');
    await expect(back).toBeFocused();
    await expect(back).toHaveCSS('outline-style', 'solid');
    await preview.keyboard.press('Enter');
    await expect(preview).toHaveURL(WEB_URL + draft.edit);
    await expect(preview.getByRole('button', { name: 'Save draft' })).toBeVisible();
    await expect(preview.getByLabel('Body (markdown)', { exact: false })).toHaveValue(updated);
  });

  test('a missing post has a route back to the blog list', async ({ page }) => {
    await page.goto('/admin/blog/000000000000000000000000/preview');
    await expect(page.getByRole('heading', { name: 'Blog post not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to blog posts' })).toHaveAttribute(
      'href',
      '/admin/blog',
    );
  });
});

test('a private preview requires a valid session on both the page and the detail API', async ({
  page,
  context,
}) => {
  const { id, title } = state().draftPost;
  for (const cookie of ['', 'expired-test-session']) {
    if (cookie) await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: WEB_URL }]);
    expect(
      (await api(`/admin/blog/posts/${id}`, { cookie: cookie && `${SESSION_COOKIE}=${cookie}` }))
        .status,
    ).toBe(401);
    const response = await page.goto(`/admin/blog/${id}/preview`);
    await expect(page).toHaveURL(WEB_URL + '/admin/login');
    expect(await response!.text()).not.toContain(title);
  }
});
