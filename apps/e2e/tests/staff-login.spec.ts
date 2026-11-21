import { expect, test } from '@playwright/test';

import { authFile, WEB_URL } from '../support/env';
import { seedTheme } from '../support/helpers';

test('staff link appears once across public pages and supports responsive themes', async ({ page }) => {
  for (const theme of ['light', 'dark', 'system'] as const) {
    await seedTheme(page, theme);
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/about', '/services', '/solutions', '/portfolio', '/blog', '/faq', '/contact', '/quotation', '/privacy-policy', '/terms-and-conditions']) {
        await page.goto(path);
        const link = page.getByRole('contentinfo').getByRole('link', { name: 'Staff Login', exact: true });
        await expect(link).toHaveCount(1);
        await expect(link).toHaveAttribute('href', '/admin/login');
        await link.click({ trial: true });
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
  }
  await page.getByRole('link', { name: 'Staff Login', exact: true }).click();
  await expect(page).toHaveURL(WEB_URL + '/admin/login');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

for (const role of ['super_admin', 'admin', 'content_editor'] as const) {
  test(`verified ${role} reaches the dashboard from the footer`, async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile(role) });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await page.getByRole('link', { name: 'Staff Login', exact: true }).click();
      await expect(page).toHaveURL(WEB_URL + '/admin');
      await expect(page.getByRole('contentinfo')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test('a rejected session stays on the login page', async ({ page, context }) => {
  await context.addCookies([{ name: 'nexastack_admin_session', value: 'expired-session', url: WEB_URL }]);
  await page.goto('/');
  await page.getByRole('link', { name: 'Staff Login', exact: true }).click();
  await expect(page).toHaveURL(WEB_URL + '/admin/login');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
