import { expect, test, type Page } from '@playwright/test';

import { api } from '../support/api';
import { cookieFor, state, waitForHydration } from '../support/helpers';

/**
 * The contact form and the five-step quotation wizard, driven like a visitor: a deliberately INVALID submission
 * must show real, accessible validation errors and send nothing; a valid one must reach the confirmation state,
 * and the record must really exist afterwards (looked up through the admin API, not taken on the page's word).
 *
 * Bot protection uses Cloudflare's PUBLISHED always-pass Turnstile test keys, which needs internet access. If
 * Cloudflare cannot be reached the tests that need the widget are SKIPPED (visibly), never passed.
 */

const unique = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function waitForTurnstileToken(page: Page) {
  test.skip(
    !state().turnstileReachable,
    'challenges.cloudflare.com is unreachable from this machine, so the Turnstile widget cannot complete',
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              document.querySelector(
                'input[name="cf-turnstile-response"]',
              ) as HTMLInputElement | null
            )?.value ?? '',
        ),
      {
        message: 'the Turnstile widget should hand the form a token',
        timeout: 30_000,
      },
    )
    .not.toBe('');
}

test.describe('contact form', () => {
  test('a deliberately invalid submission shows accessible inline errors and sends nothing', async ({
    page,
  }) => {
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/contact'))
        posts.push(request.url());
    });
    await page.goto('/contact');
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Send message' }).click();

    const invalid = page.locator('form [aria-invalid="true"]');
    await expect(invalid.first()).toBeVisible();
    expect(await invalid.count(), 'every empty required field is flagged').toBeGreaterThanOrEqual(
      4,
    );

    // Each flagged control is tied to a visible, non-empty error message through aria-describedby.
    const problems = await page.$$eval('form [aria-invalid="true"]', (controls) =>
      controls.flatMap((control) => {
        const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
        const messages = ids
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .filter(Boolean);
        return messages.length
          ? []
          : [
              `${control.getAttribute('name') ?? control.id}: no error text linked through aria-describedby`,
            ];
      }),
    );
    expect(problems, problems.join('\n')).toEqual([]);

    // The error text says what to do (not just "invalid").
    await expect(page.getByText(/enter your full name/i).first()).toBeVisible();
    await expect(page.getByText(/valid email address/i).first()).toBeVisible();
    await expect(page.getByText(/confirm you agree/i).first()).toBeVisible();
    expect(posts, 'nothing may be sent while the form is invalid').toEqual([]);
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('a malformed email and a too-short message are reported on those fields', async ({
    page,
  }) => {
    await page.goto('/contact');
    await waitForHydration(page);
    await page.getByLabel(/Full name/).fill('Test User');
    await page.getByLabel(/Email address/).fill('not-an-email');
    await page.getByLabel(/Subject/).fill('Test enquiry');
    await page.getByLabel(/^Message/).fill('short');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByLabel(/Email address/)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel(/^Message/)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel(/Full name/)).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('a valid submission reaches the confirmation, and the enquiry really exists afterwards', async ({
    page,
  }) => {
    const subject = `E2E contact ${unique()}`;
    await page.goto('/contact');
    await waitForHydration(page);
    await page.getByLabel(/Full name/).fill('Test User');
    await page.getByLabel(/Email address/).fill('test@example.com');
    await page.getByLabel(/Subject/).fill(subject);
    await page.getByLabel(/^Message/).fill('This is a synthetic end-to-end test message.');
    await page.getByRole('radio', { name: 'Email' }).check();
    await page.getByRole('checkbox', { name: /I agree to be contacted/ }).check();
    await waitForTurnstileToken(page);
    await page.getByRole('button', { name: 'Send message' }).click();

    // 25s: the server makes a real round trip to Cloudflare's siteverify before it answers.
    await expect(page.getByRole('status')).toContainText('Message received', { timeout: 25_000 });

    const found = await api(`/admin/enquiries?q=${encodeURIComponent(subject)}`, {
      cookie: cookieFor('super_admin'),
    });
    expect(found.status).toBe(200);
    expect(found.body.data.items).toHaveLength(1);
    expect(found.body.data.items[0]).toMatchObject({
      fullName: 'Test User',
      email: 'test@example.com',
      subject,
      status: 'new',
      archived: false,
    });
  });
});

/** A complete, valid draft in the wizard's own storage format (the wizard restores it on load). */
const DRAFT = {
  fullName: 'Test User',
  email: 'test@example.com',
  telephone: '+880 1000-000000',
  companyName: 'Test Company',
  country: 'Bangladesh',
  projectType: 'new-website',
  requiredServices: ['business-websites'],
  businessObjectives: 'A synthetic objective for an end-to-end run.',
  targetUsers: 'Test customers',
  projectStatus: 'new',
  requiredFeatures: 'A synthetic feature list for an end-to-end run.',
  numberOfPages: '1-5',
  designRequirements: 'need-full-design',
  needsAdminDashboard: false,
  needsAuthentication: false,
  integrations: '',
  referenceWebsites: [],
  budgetRange: 'small',
  preferredStartDate: '2026-11-01',
  targetCompletionDate: '',
  maintenanceRequired: 'no',
  attachments: [],
  additionalMessage: '',
  consent: true,
};

test.describe('quotation wizard', () => {
  test('attachments reject oversized selections, preserve fields, and allow removal and replacement', async ({ page }) => {
    const requests: number[] = [];
    await page.route('**/api/quotation/upload', async (route) => {
      requests.push(route.request().postDataBuffer()!.length);
      await route.fulfill({ json: { success: true, data: { url: `https://res.cloudinary.com/test/raw/authenticated/nexastack/quotations/file-${requests.length}.pdf`, name: 'brief.pdf', size: 100 } } });
    });
    await page.addInitScript((draft) => sessionStorage.setItem('nexastack-quotation-draft', JSON.stringify(draft)), DRAFT);
    await page.goto('/quotation');
    await waitForHydration(page);
    for (let step = 1; step <= 4; step++) await page.getByRole('button', { name: 'Next' }).click();
    const input = page.locator('input[type=file]');
    await input.setInputFiles([
      { name: 'brief.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4 * 1024 * 1024) },
      { name: 'oversized.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4 * 1024 * 1024 + 1) },
    ]);
    const valid = page.locator('li').filter({ has: page.getByText('brief.pdf', { exact: true }) });
    const invalid = page.locator('li').filter({ has: page.getByText('oversized.pdf', { exact: true }) });
    await expect(valid).toContainText('uploaded');
    await expect(invalid).toContainText('The maximum file size is 4 MB per attachment.');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toBeLessThanOrEqual(4 * 1024 * 1024 + 16 * 1024);
    await invalid.getByRole('button', { name: 'Remove' }).click();
    await valid.getByRole('button', { name: 'Remove' }).click();
    await input.setInputFiles(Array.from({ length: 5 }, (_, index) => ({ name: `replacement-${index}.pdf`, mimeType: 'application/pdf', buffer: Buffer.alloc(100) })));
    await expect(page.locator('li').filter({ hasText: /replacement-\d\.pdf/ }).filter({ hasText: 'uploaded' })).toHaveCount(5);
    expect(requests).toHaveLength(6);
    for (let step = 5; step > 1; step--) await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByLabel(/Full name/)).toHaveValue(DRAFT.fullName);
    await expect(page.getByLabel(/Email address/)).toHaveValue(DRAFT.email);
  });

  test('attachment network and platform failures show helpful errors and permit retry', async ({ page }) => {
    let attempt = 0;
    await page.route('**/api/quotation/upload', async (route) => {
      attempt++;
      if (attempt === 1) return route.abort('failed');
      if (attempt === 2) return route.fulfill({ status: 413, contentType: 'text/html', body: 'Payload too large' });
      return route.fulfill({ json: { success: true, data: { url: 'https://res.cloudinary.com/test/raw/authenticated/nexastack/quotations/retry.pdf', name: 'retry.pdf', size: 100 } } });
    });
    await page.addInitScript((draft) => sessionStorage.setItem('nexastack-quotation-draft', JSON.stringify(draft)), DRAFT);
    await page.goto('/quotation');
    await waitForHydration(page);
    for (let step = 1; step <= 4; step++) await page.getByRole('button', { name: 'Next' }).click();
    const input = page.locator('input[type=file]');
    const file = { name: 'retry.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(100) };
    const row = page.locator('li').filter({ has: page.getByText('retry.pdf', { exact: true }) });
    await input.setInputFiles(file);
    await expect(row).toContainText('Check your connection and try again.');
    await row.getByRole('button', { name: 'Remove' }).click();
    await input.setInputFiles(file);
    await expect(row).toContainText('The maximum file size is 4 MB per attachment.');
    await row.getByRole('button', { name: 'Remove' }).click();
    await input.setInputFiles(file);
    await expect(row).toContainText('uploaded');
  });

  test('a deliberately invalid step 1 shows errors and does not advance', async ({ page }) => {
    await page.goto('/quotation');
    await waitForHydration(page);
    await expect(page.getByLabel(/Full name/)).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('form [aria-invalid="true"]').first()).toBeVisible();
    await expect(page.getByLabel(/Full name/), 'still on step 1').toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit request' })).toHaveCount(0);
  });

  test('the whole wizard: fill, review, submit, get a confirmation number that is a real stored request', async ({
    page,
  }) => {
    await page.addInitScript(
      (draft) => window.sessionStorage.setItem('nexastack-quotation-draft', JSON.stringify(draft)),
      { ...DRAFT, additionalMessage: `E2E ${unique()}` },
    );
    await page.goto('/quotation');
    await waitForHydration(page);
    await expect(page.getByLabel(/Full name/)).toHaveValue('Test User');

    for (let step = 1; step <= 4; step++) await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('button', { name: 'Submit request' })).toBeVisible();

    await waitForTurnstileToken(page);
    await page.getByRole('button', { name: 'Submit request' }).click();

    const status = page.getByRole('status');
    await expect(status).toContainText('Your reference number is', { timeout: 25_000 }); // includes the siteverify round trip
    const reference = (await status.textContent())?.match(/NXQ-[0-9A-F]{8}/)?.[0];
    expect(reference, 'the confirmation shows an NXQ-XXXXXXXX reference').toBeTruthy();

    // The number is traceable to a real document, with the data the visitor entered.
    const found = await api(`/admin/quotations?q=${reference}`, {
      cookie: cookieFor('super_admin'),
    });
    expect(found.status).toBe(200);
    expect(found.body.data.items).toHaveLength(1);
    expect(found.body.data.items[0]).toMatchObject({
      referenceNumber: reference,
      fullName: 'Test User',
      email: 'test@example.com',
      status: 'new',
    });
    const detail = await api(`/admin/quotations/${found.body.data.items[0].id}`, {
      cookie: cookieFor('super_admin'),
    });
    expect(detail.body.data.quotation).toMatchObject({
      country: 'Bangladesh',
      requiredServices: ['business-websites'],
      preferredStartDate: '2026-11-01',
    });

    // The draft is cleared after a successful submit.
    expect(
      await page.evaluate(() => window.sessionStorage.getItem('nexastack-quotation-draft')),
    ).toBeNull();
  });
});
