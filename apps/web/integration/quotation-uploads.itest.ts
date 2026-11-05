import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { ATTACHMENT_MAX_SIZE_BYTES } from '@nexastack/shared';
import { setupWeb, validQuotation, freshIp, type Web } from './support';
import type * as AuthRoute from '../app/api/quotation/upload/authorize/route';
import type * as UploadRoute from '../app/api/quotation/upload/route';
import type * as SubmitRoute from '../app/api/quotation/route';
import type * as CleanupRoute from '../app/api/quotation/upload/cleanup/route';
import type * as SessionRoute from '../app/api/quotation/upload/session/route';
import type * as Lifecycle from '../lib/quotationUploadLifecycle';
import type * as Security from '../lib/quotationUploadSecurity';
import type * as Models from '../lib/models/QuotationUpload';

let web: Web;
let auth: typeof AuthRoute;
let upload: typeof UploadRoute;
let submit: typeof SubmitRoute;
let cleanup: typeof CleanupRoute;
let sessionRoute: typeof SessionRoute;
let lifecycle: typeof Lifecycle;
let security: typeof Security;
let models: typeof Models;
let failUpload = false;
let failDelete = false;
let publicDelivery = false;
const remote = new Set<string>();
const destroyed: string[] = [];
let uploadCalls = 0;
const cleanupSecret = 'test-cleanup-secret-not-a-real-secret-123456';

before(async () => {
  web = await setupWeb({
    turnstileSecret: 'test-turnstile-secret',
    cloudName: 'test-cloud',
    storage: true,
  });
  process.env.QUOTATION_CLEANUP_SECRET = cleanupSecret;
  auth = await import('../app/api/quotation/upload/authorize/route');
  upload = await import('../app/api/quotation/upload/route');
  submit = await import('../app/api/quotation/route');
  cleanup = await import('../app/api/quotation/upload/cleanup/route');
  sessionRoute = await import('../app/api/quotation/upload/session/route');
  lifecycle = await import('../lib/quotationUploadLifecycle');
  security = await import('../lib/quotationUploadSecurity');
  models = await import('../lib/models/QuotationUpload');
  await models.ensureUploadDatabase();
});
after(async () => web.stop());
beforeEach(async () => {
  // setupWeb refuses non-loopback / non-_test databases. Never touches production.
  await models.uploadSessions().deleteMany({});
  await models.uploadLimits().deleteMany({});
  await web.quotations.deleteMany({});
  remote.clear();
  destroyed.length = 0;
  uploadCalls = 0;
  failUpload = false;
  failDelete = false;
  publicDelivery = false;
  mock.method(console, 'error', () => {});
  mock.method(console, 'info', () => {});
  mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('/siteverify')) {
      const token = new URLSearchParams(String(init?.body)).get('response');
      return Response.json({
        success: !['bad', 'expired'].includes(token ?? ''),
        hostname: token === 'wrong-host' ? 'attacker.test' : 'localhost',
        action: token === 'wrong-action' ? 'contact' : 'quotation-upload',
      });
    }
    if (String(url).endsWith('/image/upload')) {
      uploadCalls++;
      if (failUpload) throw new Error('synthetic storage interruption');
      const form = init!.body as FormData;
      assert.equal(form.get('type'), 'authenticated');
      assert.equal(form.get('overwrite'), 'false');
      assert.match(String(form.get('signature')), /^[a-f0-9]{40}$/);
      const id = String(form.get('public_id'));
      remote.add(id);
      return Response.json({
        public_id: id,
        resource_type: 'image',
        type: publicDelivery ? 'upload' : 'authenticated',
        version: 1,
        bytes: (form.get('file') as File).size,
        format: 'pdf',
      });
    }
    if (String(url).endsWith('/image/destroy')) {
      if (failDelete) return Response.json({ error: 'synthetic failure' }, { status: 500 });
      const body = init!.body as URLSearchParams;
      assert.equal(body.get('type'), 'authenticated');
      const id = body.get('public_id')!;
      destroyed.push(id);
      return Response.json({ result: remote.delete(id) ? 'ok' : 'not found' });
    }
    throw new Error('Unexpected external request');
  });
});
afterEach(() => mock.restoreAll());

function request(
  path: string,
  body?: BodyInit,
  cookie = '',
  headers: Record<string, string> = {},
  method = 'POST',
) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    ...(body ? { body } : {}),
    headers: { origin: 'http://localhost:3000', cookie, 'x-forwarded-for': freshIp(), ...headers },
  });
}
async function authorize(token = randomUUID() as string, cookie = '') {
  return auth.POST(
    request('/api/quotation/upload/authorize', JSON.stringify({ turnstileToken: token }), cookie),
  );
}
async function allowed() {
  const reply = await authorize();
  assert.equal(reply.status, 200, await reply.clone().text());
  return reply.headers.get('set-cookie')!.split(';')[0]!;
}
function token(cookie: string) {
  return cookie.split('=')[1]!;
}
function file(size = 100, signature = '%PDF-1.7') {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode(signature).subarray(0, size));
  const body = new FormData();
  body.append('file', new File([bytes], 'brief.pdf', { type: 'application/pdf' }));
  return body;
}
function send(cookie: string, size = 100, id = randomUUID(), body: BodyInit = file(size)) {
  return upload.POST(request('/api/quotation/upload', body, cookie, { 'x-upload-id': id }));
}
async function uploaded(cookie: string, size = 100) {
  const reply = await send(cookie, size);
  assert.equal(reply.status, 201, await reply.clone().text());
  return (await reply.json()).data.url as string;
}
function finalize(cookie: string, urls: string[], nonce = randomUUID(), overrides = {}) {
  return submit.POST(
    request(
      '/api/quotation',
      JSON.stringify({
        ...validQuotation,
        attachments: urls,
        turnstileToken: randomUUID(),
        ...overrides,
      }),
      cookie,
      { 'x-submission-id': nonce },
    ),
  );
}
async function expire(cookie: string) {
  await models
    .uploadSessions()
    .updateOne(
      { tokenHash: security.hashCredential(token(cookie)) },
      { $set: { retainUntil: new Date(0), expiresAt: new Date(0), leaseUntil: new Date(0) } },
    );
}

describe('upload authorization and distributed limits', () => {
  it('requires trusted origin and a session before reading multipart or contacting storage', async () => {
    assert.equal((await send('')).status, 401);
    assert.equal((await send('nexastack_quotation_upload=' + 'a'.repeat(64))).status, 401);
    assert.equal(
      (
        await auth.POST(
          request('/api/quotation/upload/authorize', '{}', '', { origin: 'https://attacker.test' }),
        )
      ).status,
      403,
    );
    assert.equal(uploadCalls, 0);
  });
  for (const bad of ['bad', 'expired', 'wrong-host', 'wrong-action', '']) {
    it(`refuses ${bad || 'missing'} Turnstile verification`, async () => {
      assert.equal((await authorize(bad)).status, 400);
      assert.equal(await models.uploadSessions().countDocuments(), 0);
    });
  }
  it('consumes a challenge once, stores only token hashes, and sets a private cookie', async () => {
    const challenge = randomUUID();
    const reply = await authorize(challenge);
    assert.equal(reply.status, 200);
    assert.equal((await authorize(challenge)).status, 400);
    const cookie = reply.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=strict/i);
    const document = await models.uploadSessions().findOne({});
    assert.equal(document?.tokenHash, security.hashCredential(token(cookie.split(';')[0]!)));
    assert.doesNotMatch(JSON.stringify(await reply.json()), /token|secret|sessionId/);
  });
  for (const patch of [
    { expiresAt: new Date(0) },
    { status: 'revoked' },
    { purpose: 'another-purpose' },
  ]) {
    it(`refuses invalid session state ${Object.keys(patch)[0]}`, async () => {
      const cookie = await allowed();
      await models.uploadSessions().updateOne({}, { $set: patch } as never);
      assert.equal((await send(cookie)).status, 401);
      assert.equal(uploadCalls, 0);
    });
  }
  it('renews the same draft after a fresh challenge without resetting quota or losing files', async () => {
    const cookie = await allowed();
    const url = await uploaded(cookie);
    await models.uploadSessions().updateOne({}, { $set: { expiresAt: new Date(0) } });
    const renewed = await authorize(randomUUID(), cookie);
    assert.equal(renewed.status, 200);
    assert.equal(renewed.headers.get('set-cookie')!.split(';')[0], cookie);
    const state = await models.uploadSessions().findOne({});
    assert.equal(state?.usedBytes, 100);
    assert.equal(state?.assets[0]?.url, url);
  });
  it('atomically caps concurrent rate-limit increments shared across callers and expires windows', async () => {
    const now = Date.now();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 20 }, () => security.uploadRateLimit('shared-key', 3, now)),
    );
    assert.equal(outcomes.filter((v) => v.status === 'fulfilled').length, 3);
    await security.uploadRateLimit('shared-key', 3, now + 16 * 60_000);
    const indexes = await models.uploadLimits().indexes();
    assert.ok(indexes.some((i) => i.expireAfterSeconds === 0));
    // Creation races must not reject ordinary traffic below the configured allowance.
    await Promise.all(
      Array.from({ length: 10 }, () => security.uploadRateLimit('ordinary-concurrency', 10, now)),
    );
  });
  it('limits repeated failed challenges before Cloudflare and ignores spoofed forwarded identities', async () => {
    await models.uploadLimits().deleteMany({});
    const { uploadPolicy } = await import('../lib/quotationUploadPolicy');
    for (let i = 0; i < uploadPolicy.authAttempts; i++)
      await security.uploadRateLimit('authorize-global', uploadPolicy.authAttempts);
    assert.equal((await authorize()).status, 429);
  });
  it('limits verified session creation independently', async () => {
    const { uploadPolicy } = await import('../lib/quotationUploadPolicy');
    for (let i = 0; i < uploadPolicy.sessions; i++)
      await security.uploadRateLimit('sessions-global', uploadPolicy.sessions);
    assert.equal((await authorize()).status, 429);
    assert.equal(await models.uploadSessions().countDocuments(), 0);
  });
});

describe('authorized file validation and quota reservations', () => {
  it('enforces weighted daily site budgets before Cloudinary and releases known failures', async () => {
    const cookie = await allowed();
    const { uploadPolicy } = await import('../lib/quotationUploadPolicy');
    await security.uploadRateLimit(
      'daily-bytes',
      uploadPolicy.dailyBytes,
      Date.now(),
      uploadPolicy.dailyBytes,
      86400_000,
    );
    const response = await send(cookie);
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
    assert.equal(uploadCalls, 0);
    const record = await models.uploadSessions().findOne({});
    assert.equal(record?.usedBytes, 0);
    assert.equal(record?.assets[0]?.status, 'deleted');
    assert.ok(record?.purgeAt);
    await models.uploadLimits().deleteMany({});
    await security.uploadRateLimit(
      'daily-files',
      uploadPolicy.dailyFiles,
      Date.now(),
      uploadPolicy.dailyFiles,
      86400_000,
    );
    assert.equal((await send(cookie)).status, 429);
    assert.equal(uploadCalls, 0);
  });
  for (const size of [100, ATTACHMENT_MAX_SIZE_BYTES - 1, ATTACHMENT_MAX_SIZE_BYTES]) {
    it(`accepts ${size} bytes`, async () => {
      await uploaded(await allowed(), size);
    });
  }
  for (const size of [ATTACHMENT_MAX_SIZE_BYTES + 1, 5 * 1024 * 1024, 10 * 1024 * 1024]) {
    it(`rejects ${size} bytes before Cloudinary`, async () => {
      assert.equal((await send(await allowed(), size)).status, 413);
      assert.equal(uploadCalls, 0);
    });
  }
  it('rejects empty, forged MIME, malformed multipart and duplicate fields', async () => {
    const cookie = await allowed();
    const duplicate = file();
    duplicate.append('extra', 'value');
    for (const body of [file(0), file(100, '<script>'), 'bad', duplicate])
      assert.equal((await send(cookie, 100, randomUUID(), body)).status, 400);
    assert.equal(uploadCalls, 0);
  });
  it('keeps real PNG and JPEG magic-number validation', async () => {
    const cookie = await allowed();
    for (const bytes of [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      new Uint8Array([255, 216, 255, 224, 0, 16]),
    ]) {
      const body = new FormData();
      body.append('file', new File([bytes], 'file.bin', { type: 'text/plain' }));
      assert.equal((await send(cookie, bytes.length, randomUUID(), body)).status, 201);
    }
  });
  it('caps count and bytes, and makes an upload retry idempotent', async () => {
    const cookie = await allowed();
    const id = randomUUID();
    assert.equal((await send(cookie, 100, id)).status, 201);
    assert.equal((await send(cookie, 100, id)).status, 201);
    assert.equal(uploadCalls, 1);
    assert.equal((await send(cookie, 101, id)).status, 409);
    for (let i = 0; i < 4; i++) await uploaded(cookie);
    assert.equal((await send(cookie)).status, 429);
    const state = await models.uploadSessions().findOne({});
    assert.equal(state?.assets.length, 5);
    await models
      .uploadSessions()
      .updateOne({}, { $set: { usedBytes: 5 * ATTACHMENT_MAX_SIZE_BYTES, assets: [] } });
    assert.equal((await send(cookie)).status, 429);
  });
  it('permits only one concurrent reservation and rejects changed retry claims', async () => {
    const cookie = await allowed();
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        lifecycle.reserveUpload(token(cookie), randomUUID(), 100, 'application/pdf'),
      ),
    );
    assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await models.uploadSessions().findOne({}))?.usedBytes, 100);
  });
  it('retains a tracked identifier after Cloudinary failure and does not return a reference', async () => {
    const cookie = await allowed();
    failUpload = true;
    const response = await send(cookie);
    assert.equal(response.status, 500);
    assert.equal((await response.json()).data, undefined);
    const state = await models.uploadSessions().findOne({});
    assert.equal(state?.assets[0]?.status, 'uploading');
    assert.match(state!.assets[0]!.publicId, /^nexastack\/quotations\/q_/);
    await expire(cookie);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(destroyed.length, 1);
  });
  it('fails closed when Cloudinary does not confirm private delivery', async () => {
    const cookie = await allowed();
    publicDelivery = true;
    assert.equal((await send(cookie)).status, 500);
    assert.equal((await models.uploadSessions().findOne({}))?.assets[0]?.status, 'uploading');
  });
  it('removes a file from the draft without immediately deleting customer data', async () => {
    const cookie = await allowed();
    const url = await uploaded(cookie);
    assert.equal(
      (
        await sessionRoute.DELETE(
          request('/session', JSON.stringify({ url }), cookie, {}, 'DELETE'),
        )
      ).status,
      200,
    );
    assert.equal((await finalize(cookie, [url])).status, 400);
    assert.equal(destroyed.length, 0);
    await uploaded(cookie);
  });
});

describe('ownership, finalization and cleanup recovery', () => {
  it('refuses cleanup identities outside the recorded account and tracked folder', async () => {
    const cookie = await allowed();
    await uploaded(cookie);
    await expire(cookie);
    await models
      .uploadSessions()
      .updateOne({}, { $set: { 'assets.0.cloudName': 'another-cloud' } });
    assert.equal((await lifecycle.cleanupQuotationUploads()).failed, 1);
    assert.equal(destroyed.length, 0);
    await expire(cookie);
    await models.uploadSessions().updateOne(
      {},
      {
        $set: {
          'assets.0.cloudName': 'test-cloud',
          'assets.0.publicId': 'nexastack/media/unrelated',
        },
      },
    );
    assert.equal((await lifecycle.cleanupQuotationUploads()).failed, 1);
    assert.equal(destroyed.length, 0);
  });
  it('allows only one quotation record when two final submissions race', async () => {
    const cookie = await allowed();
    const url = await uploaded(cookie);
    const responses = await Promise.all([finalize(cookie, [url]), finalize(cookie, [url])]);
    assert.ok(responses.some((r) => r.status === 201));
    assert.ok(
      responses.every((r) => [201, 409].includes(r.status)),
      JSON.stringify(
        await Promise.all(responses.map(async (r) => ({ status: r.status, body: await r.json() }))),
      ),
    );
    assert.equal(await web.quotations.countDocuments(), 1);
  });
  it('commits owned files, denies reuse, and returns the same quotation on retry', async () => {
    const cookie = await allowed();
    const url = await uploaded(cookie);
    const response = await finalize(cookie, [url]);
    assert.equal(response.status, 201, await response.clone().text());
    const result = await response.json();
    const again = await finalize(cookie, [url]);
    assert.deepEqual(await again.json(), result);
    assert.equal(await web.quotations.countDocuments(), 1);
    assert.equal((await models.uploadSessions().findOne({}))?.assets[0]?.status, 'committed');
    assert.equal((await send(cookie)).status, 401);
    assert.equal(
      (await finalize(cookie, [url], randomUUID(), { fullName: 'Another User' })).status,
      409,
    );
    await expire(cookie);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(destroyed.length, 0);
    assert.equal(remote.size, 1);
  });
  it('rejects a forged URL, another session attachment, and expired ownership', async () => {
    const one = await allowed();
    const url = await uploaded(one);
    const two = await allowed();
    assert.equal((await finalize(two, [url])).status, 400);
    assert.equal(
      (await finalize(one, [url.replace(/q_[a-f0-9]+/, 'q_' + 'a'.repeat(32))])).status,
      400,
    );
    await expire(one);
    assert.equal((await finalize(one, [url])).status, 401);
  });
  it('deduplicates final submissions without attachments by an independent nonce', async () => {
    const id = randomUUID();
    const first = await finalize('', [], id);
    const second = await finalize('', [], id);
    assert.equal(first.status, 201);
    assert.deepEqual(await first.json(), await second.json());
    assert.equal(await web.quotations.countDocuments(), 1);
  });
  it('revokes unused upload permission when the customer submits without files', async () => {
    const cookie = await allowed();
    await uploaded(cookie);
    assert.equal((await finalize(cookie, [])).status, 201);
    assert.equal((await send(cookie)).status, 401);
  });
  it('recovers an upload that succeeded remotely but could not persist its response', async () => {
    const cookie = await allowed();
    const prototype = web.mongoose.mongo.Collection.prototype;
    const original = prototype.updateOne;
    const failure = mock.method(
      prototype,
      'updateOne',
      function (
        this: InstanceType<typeof web.mongoose.mongo.Collection>,
        ...args: Parameters<typeof original>
      ) {
        const update = args[1] as { $set?: Record<string, unknown> };
        if (update.$set?.['assets.$.status'] === 'uploaded')
          return Promise.reject(new Error('synthetic metadata failure'));
        return original.apply(this, args);
      },
    );
    assert.equal((await send(cookie)).status, 500);
    assert.equal(remote.size, 1);
    failure.mock.restore();
    assert.equal((await models.uploadSessions().findOne({}))?.assets[0]?.status, 'uploading');
    await expire(cookie);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(remote.size, 0);
  });
  it('retries deletion if Cloudinary succeeded but its database acknowledgment failed', async () => {
    const cookie = await allowed();
    await uploaded(cookie);
    await expire(cookie);
    const prototype = web.mongoose.mongo.Collection.prototype;
    const original = prototype.updateOne;
    const failure = mock.method(
      prototype,
      'updateOne',
      function (
        this: InstanceType<typeof web.mongoose.mongo.Collection>,
        ...args: Parameters<typeof original>
      ) {
        const update = args[1] as { $set?: Record<string, unknown> };
        if (update.$set?.['assets.$.status'] === 'deleted')
          return Promise.reject(new Error('synthetic metadata failure'));
        return original.apply(this, args);
      },
    );
    assert.equal((await lifecycle.cleanupQuotationUploads()).failed, 1);
    assert.equal(remote.size, 0);
    failure.mock.restore();
    await expire(cookie);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(destroyed.length, 2);
    assert.equal((await models.uploadSessions().findOne({}))?.assets[0]?.status, 'deleted');
  });
  it('does not let concurrent finalization and cleanup delete a submitted file', async () => {
    const cookie = await allowed();
    const url = await uploaded(cookie);
    await Promise.all([finalize(cookie, [url]), lifecycle.cleanupQuotationUploads()]);
    assert.equal(await web.quotations.countDocuments({ attachments: url }), 1);
    await expire(cookie);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(destroyed.length, 0);
  });
  it('protects a frozen finalization during a database failure and recovers it before cleanup', async () => {
    const cookie = await allowed();
    const url = await uploaded(cookie);
    const failure = mock.method(web.QuotationSubmission, 'updateOne', () => {
      throw new Error('synthetic database failure');
    });
    assert.equal((await finalize(cookie, [url])).status, 503);
    assert.equal((await models.uploadSessions().findOne({}))?.status, 'finalizing');
    await expire(cookie);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(destroyed.length, 0);
    failure.mock.restore();
    await lifecycle.cleanupQuotationUploads();
    assert.equal(await web.quotations.countDocuments(), 1);
    assert.equal(destroyed.length, 0);
  });
  it('cleans expired files, skips active ones, and retries a missing asset idempotently', async () => {
    const cookie = await allowed();
    await uploaded(cookie);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(destroyed.length, 0);
    await expire(cookie);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(destroyed.length, 1);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(destroyed.length, 1);
    const state = await models.uploadSessions().findOne({});
    assert.ok(state?.purgeAt);
    assert.equal(state?.assets[0]?.status, 'deleted');
  });
  it('retains metadata and retries Cloudinary deletion failures', async () => {
    const cookie = await allowed();
    await uploaded(cookie);
    await expire(cookie);
    failDelete = true;
    assert.equal((await lifecycle.cleanupQuotationUploads()).failed, 1);
    assert.equal((await models.uploadSessions().findOne({}))?.purgeAt, undefined);
    failDelete = false;
    await expire(cookie);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(destroyed.length, 1);
  });
  it('leases cleanup work so overlapping workers do not delete the same asset twice', async () => {
    const cookie = await allowed();
    await uploaded(cookie);
    await expire(cookie);
    await Promise.all([lifecycle.cleanupQuotationUploads(), lifecycle.cleanupQuotationUploads()]);
    assert.equal(destroyed.length, 1);
  });
  it('never deletes an asset referenced by a quotation even if lifecycle metadata was not committed', async () => {
    const cookie = await allowed();
    const url = await uploaded(cookie);
    await web.QuotationSubmission.create({
      ...validQuotation,
      attachments: [url],
      referenceNumber: 'NXQ-12345678',
    });
    await expire(cookie);
    await lifecycle.cleanupQuotationUploads();
    assert.equal(destroyed.length, 0);
    assert.equal((await models.uploadSessions().findOne({}))?.assets[0]?.status, 'committed');
  });
  it('requires the cleanup secret and never accepts browser authorization instead', async () => {
    assert.equal((await cleanup.POST(request('/cleanup'))).status, 401);
    assert.equal(
      (
        await cleanup.POST(
          request('/cleanup', undefined, '', { authorization: `Bearer ${cleanupSecret}` }),
        )
      ).status,
      200,
    );
  });
});
