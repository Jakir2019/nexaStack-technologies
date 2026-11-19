import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { setupWeb, validContact, validQuotation, type Web } from './support';

/**
 * Cloudflare Turnstile on both public forms with a secret CONFIGURED. Cloudflare's siteverify endpoint is
 * stubbed so the run is deterministic and offline (a real round trip against Cloudflare's published test keys
 * is part of the browser tier). What is proven here is OUR handling of every outcome: fail closed, check the
 * body first, never store the token.
 */

let web: Web;
let fetchSpy: ReturnType<typeof mock.method<typeof globalThis, 'fetch'>>;
let info: ReturnType<typeof mock.method<Console, 'info'>>;
let error: ReturnType<typeof mock.method<Console, 'error'>>;

before(async () => {
  web = await setupWeb({ turnstileSecret: 'test-secret-not-a-real-key' });
});

after(async () => {
  await web.stop();
});

beforeEach(() => {
  fetchSpy = mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify({ success: true })),
  );
  info = mock.method(console, 'info', () => {});
  error = mock.method(console, 'error', () => {});
  mock.method(console, 'warn', () => {});
});

afterEach(() => {
  mock.restoreAll();
});

const siteverify = (result: unknown) =>
  fetchSpy.mock.mockImplementation(async () => new Response(JSON.stringify(result)));

const FORMS = [
  {
    name: '/api/contact',
    collection: 'contactsubmissions',
    post: (body: unknown) => web.postContact(body),
    valid: validContact,
    count: () => web.contacts.countDocuments(),
    hook: 'contact.received',
  },
  {
    name: '/api/quotation',
    collection: 'quotationsubmissions',
    post: (body: unknown) => web.postQuotation(body),
    valid: validQuotation,
    count: () => web.quotations.countDocuments(),
    hook: 'quotation.received',
  },
] as const;

for (const form of FORMS) {
  const hookCount = () =>
    [...info.mock.calls, ...error.mock.calls].filter((call) =>
      String(call.arguments[0]).includes(form.hook),
    ).length;

  describe(form.name, () => {
    it('refuses a submission with NO token (400), stores nothing, fires no hook', async () => {
      const before = await form.count();
      const reply = await form.post(form.valid);
      assert.equal(reply.status, 400);
      assert.equal(reply.body.error?.code, 'VALIDATION_ERROR');
      assert.match(reply.body.error?.message ?? '', /verification challenge/i);
      assert.equal(await form.count(), before);
      assert.equal(hookCount(), 0);
    });

    it('refuses a token Cloudflare rejects, stores nothing', async () => {
      siteverify({ success: false, 'error-codes': ['invalid-input-response'] });
      const before = await form.count();
      const reply = await form.post({ ...form.valid, turnstileToken: 'a-bad-token' });
      assert.equal(reply.status, 400);
      assert.equal(await form.count(), before);
    });

    it('refuses a token that is not a string (an object, an array, a number)', async () => {
      const before = await form.count();
      for (const turnstileToken of [{ $ne: null }, ['x'], 12345, true]) {
        const reply = await form.post({ ...form.valid, turnstileToken });
        assert.equal(reply.status, 400, JSON.stringify(turnstileToken));
      }
      assert.equal(await form.count(), before);
    });

    it('accepts a token Cloudflare confirms: stored, hook fired, and the token itself is NOT stored', async () => {
      siteverify({ success: true });
      const before = await form.count();
      const reply = await form.post({ ...form.valid, turnstileToken: 'a-good-token' });
      assert.equal(reply.status, 201, JSON.stringify(reply.body));
      assert.equal(await form.count(), before + 1);
      assert.equal(hookCount(), 1);
      if (form.name === '/api/contact') {
        assert.match(String(error.mock.calls[0]!.arguments[0]), /configuration_missing_or_invalid/);
      }
      const raw = await web.mongoose.connection
        .collection(form.collection)
        .findOne({}, { sort: { _id: -1 } });
      assert.ok(raw);
      assert.equal('turnstileToken' in raw, false, 'the token is not persisted');
      assert.doesNotMatch(JSON.stringify(raw), /a-good-token/);
    });

    it('FAILS CLOSED when Cloudflare is unreachable or answers garbage: the submission is refused, not waved through', async () => {
      const before = await form.count();
      fetchSpy.mock.mockImplementation(async () => {
        throw new Error('network down');
      });
      assert.equal((await form.post({ ...form.valid, turnstileToken: 'a-token' })).status, 400);
      fetchSpy.mock.mockImplementation(
        async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
      );
      assert.equal((await form.post({ ...form.valid, turnstileToken: 'a-token' })).status, 400);
      assert.equal(await form.count(), before);
    });

    it('validates the body BEFORE calling Cloudflare (a garbage submission costs no verification call)', async () => {
      const reply = await form.post({ ...form.valid, email: 'nope', turnstileToken: 'a-token' });
      assert.equal(reply.status, 400);
      assert.equal(
        reply.body.error?.details?.some((detail) => detail.path === 'email'),
        true,
      );
      assert.equal(fetchSpy.mock.callCount(), 0);
    });

    it('sends the secret and the token to Cloudflare, and nothing from the submission', async () => {
      siteverify({ success: true });
      await form.post({ ...form.valid, turnstileToken: 'token-xyz' });
      const [url, init] = fetchSpy.mock.calls[0]!.arguments as [string, RequestInit];
      assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      const sent = new URLSearchParams(String(init.body));
      assert.deepEqual([...sent.keys()].sort(), ['response', 'secret']);
      assert.equal(sent.get('response'), 'token-xyz');
    });
  });
}
