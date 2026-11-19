import { expect, test } from '@playwright/test';

import { revealEverything, runAxe, seedTheme } from '../support/helpers';

const slugs = ['careerbridge', 'livetasker', 'nextcart'];

test('portfolio navigation, metadata and screenshot', async ({ page }) => {
  await page.goto('/portfolio');
  await expect(page.locator('article')).toHaveCount(3);
  for (const slug of slugs) {
    await expect(page.locator(`article a[href="/portfolio/${slug}"]`).first()).toBeVisible();
    await page.goto(`/portfolio/${slug}`);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`/portfolio/${slug}$`),
    );
    await expect(page.getByRole('link', { name: 'All portfolio projects' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a Quote', exact: true })).toBeVisible();
    await page.goto('/portfolio');
  }
  await expect(page.getByRole('img', { name: /LiveTasker task board/ })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test(`portfolio responsive layouts and axe: ${theme}`, async ({ page }) => {
    test.setTimeout(240_000);
    await seedTheme(page, theme);
    for (const route of ['/portfolio', ...slugs.map((slug) => `/portfolio/${slug}`)]) {
      for (const width of [375, 768, 1280, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await revealEverything(page);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          `${route} at ${width}`,
        ).toBe(true);
      }
      expect(await runAxe(page), route).toEqual([]);
    }
  });
}
