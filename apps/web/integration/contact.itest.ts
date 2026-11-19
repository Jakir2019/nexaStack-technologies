import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { setupWeb, validContact, type Web } from './support';

/**
 * POST /api/contact: the real Route Handler against a real database. Valid and invalid submissions, what is
 * (and is not) stored, the Resend request (mocked externally), the rate limit, mass assignment, and
 * that an internal failure never leaks its message.
 */

let web: Web;
let info: ReturnType<typeof mock.method<Console, 'info'>>;
let error: ReturnType<typeof mock.method<Console, 'error'>>;

before(async () => {
  web = await setupWeb();
});

after(async () => {
  await web.stop();
});

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_dummy_test';
  process.env.RESEND_FROM_EMAIL = 'notifications@example.com';
  process.env.CONTACT_NOTIFICATION_EMAIL = 'info@example.com';
  mock.method(globalThis, 'fetch', async () => Response.json({ id: 'test-email' }));
  info = mock.method(console, 'info', () => {});
  error = mock.method(console, 'error', () => {});
  mock.method(console, 'warn', () => {});
});

afterEach(() => {
  mock.restoreAll();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.CONTACT_NOTIFICATION_EMAIL;
});

const hookCalls = () =>
  info.mock.calls.filter((call) => String(call.arguments[0]).includes('contact.received'));

describe('a valid submission', () => {
  it('is stored, answered 201 in the envelope, and fires the notification hook exactly once with the stored id', async () => {
    const reply = await web.postContact({
      ...validContact,
      subject: 'Valid submission test',
      phone: '+880 1000-000000',
      companyName: 'Test Company',
    });

    assert.equal(reply.status, 201);
    assert.deepEqual(reply.body, { success: true, data: { received: true } });

    const stored = await web.contacts.findOne({ subject: 'Valid submission test' });
    assert.ok(stored, 'the enquiry is really in the database');
    assert.equal(stored.fullName, 'Test User');
    assert.equal(stored.email, 'test@example.com');
    assert.equal(stored.phone, '+880 1000-000000');
    assert.equal(stored.companyName, 'Test Company');
    assert.equal(stored.preferredContactMethod, 'email');
    assert.equal(stored.consent, true);
    assert.equal(stored.status, 'new');
    assert.equal(stored.archived, false);

    assert.equal(hookCalls().length, 1, 'the hook fires exactly once');
    assert.deepEqual(JSON.parse(String(hookCalls()[0]!.arguments[0])), {
      event: 'contact.received',
      id: String(stored._id),
      delivery: 'accepted',
    });
  });

  it('the response never echoes the submission back (no personal data in the confirmation)', async () => {
    const reply = await web.postContact(validContact);
    assert.doesNotMatch(reply.text, /test@example\.com|Test User|synthetic/);
  });

  it('trims fields before storing them', async () => {
    await web.postContact({
      ...validContact,
      fullName: '  Trim Test  ',
      subject: '  Trim subject  ',
    });
    const stored = await web.contacts.findOne({ subject: 'Trim subject' });
    assert.equal(stored?.fullName, 'Trim Test');
  });
});

describe('an invalid submission', () => {
  it('is refused with 400 and per-field messages, stores NOTHING, and does NOT fire the hook', async () => {
    const before = await web.contacts.countDocuments();
    const reply = await web.postContact({
      fullName: 'T',
      email: 'not-an-email',
      subject: 'Hi',
      message: 'short',
      preferredContactMethod: 'fax',
      consent: false,
    });

    assert.equal(reply.status, 400);
    assert.equal(reply.body.success, false);
    assert.equal(reply.body.error?.code, 'VALIDATION_ERROR');
    const paths = reply.body.error?.details?.map((detail) => detail.path).sort();
    assert.deepEqual(paths, [
      'consent',
      'email',
      'fullName',
      'message',
      'preferredContactMethod',
      'subject',
    ]);
    for (const detail of reply.body.error?.details ?? []) {
      assert.ok(
        detail.message.length > 10,
        `${detail.path} has a helpful message: "${detail.message}"`,
      );
    }
    assert.equal(await web.contacts.countDocuments(), before, 'nothing was stored');
    assert.equal(hookCalls().length, 0, 'no notification for a submission that was refused');
  });

  it('a phone preference without a phone number is refused on the preference field', async () => {
    const reply = await web.postContact({ ...validContact, preferredContactMethod: 'whatsapp' });
    assert.equal(reply.status, 400);
    assert.equal(reply.body.error?.details?.[0]?.path, 'preferredContactMethod');
  });

  it('missing consent is refused (the consent checkbox is enforced on the server, not only the client)', async () => {
    const { consent: _consent, ...withoutConsent } = validContact;
    const reply = await web.postContact(withoutConsent);
    assert.equal(reply.status, 400);
    assert.ok(reply.body.error?.details?.some((detail) => detail.path === 'consent'));
  });

  it('malformed JSON is 400 INVALID_JSON, and a non-object body is a validation error, never a 500', async () => {
    const malformed = await web.postContact('{"fullName": ', { raw: true });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error?.code, 'INVALID_JSON');
    for (const body of [null, [], 'text', 42]) {
      const reply = await web.postContact(body);
      assert.equal(reply.status, 400, JSON.stringify(body));
      assert.equal(reply.body.error?.code, 'VALIDATION_ERROR');
    }
    assert.equal(hookCalls().length, 0);
  });

  it('NoSQL operator objects in fields are refused', async () => {
    for (const override of [
      { email: { $ne: null } },
      { fullName: { $gt: '' } },
      { subject: ['a', 'b'] },
      { message: { $regex: '.*' } },
    ]) {
      const reply = await web.postContact({ ...validContact, ...override });
      assert.equal(reply.status, 400, JSON.stringify(override));
    }
  });
});

describe('mass assignment', () => {
  it('a client cannot set status, archived, notes, _id or timestamps', async () => {
    const reply = await web.postContact({
      ...validContact,
      subject: 'Mass assignment test',
      status: 'closed',
      archived: true,
      archivedAt: '2001-01-01T00:00:00.000Z',
      notes: [{ text: 'injected', authorAdminId: '507f1f77bcf86cd799439011' }],
      _id: '507f1f77bcf86cd799439011',
      createdAt: '2001-01-01T00:00:00.000Z',
    });
    assert.equal(reply.status, 201);
    const stored = await web.contacts.findOne({ subject: 'Mass assignment test' });
    assert.equal(stored?.status, 'new');
    assert.equal(stored?.archived, false);
    assert.equal(stored?.notes.length, 0);
    assert.notEqual(String(stored?._id), '507f1f77bcf86cd799439011');
    assert.ok((stored?.createdAt.getFullYear() ?? 0) >= 2026);
  });
});

describe('rate limiting (10 per IP per 15 minutes)', () => {
  it('accepts 10, then answers 429 in the envelope and stores nothing more; another IP is unaffected', async () => {
    const ip = '203.0.113.200';
    for (let i = 0; i < 10; i++) {
      const reply = await web.postContact({ ...validContact, subject: `Rate limit ${i}` }, { ip });
      assert.equal(reply.status, 201, `submission ${i + 1}`);
    }
    const before = await web.contacts.countDocuments({ subject: /^Rate limit/ });
    const blocked = await web.postContact({ ...validContact, subject: 'Rate limit 11' }, { ip });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error?.code, 'RATE_LIMITED');
    assert.equal(
      await web.contacts.countDocuments({ subject: /^Rate limit/ }),
      before,
      'the refused one is not stored',
    );
    assert.equal((await web.postContact(validContact)).status, 201, 'a different IP is fine');
  });

  it('the limit is checked before the body is read: a rate-limited client cannot even cause validation work', async () => {
    const ip = '203.0.113.201';
    for (let i = 0; i < 10; i++) await web.postContact(validContact, { ip });
    const reply = await web.postContact('not even json', { ip, raw: true });
    assert.equal(reply.status, 429);
  });
});

describe('a failure while saving', () => {
  it('is a generic 500, never leaks the internal message, fires NO hook, and a retry can succeed', async () => {
    const secret =
      'MongoServerError: E11000 mongodb://leak-user:leak-pass@internal-host:27017/prod at /srv/app/x.js';
    const create = mock.method(web.ContactSubmission, 'create', () =>
      Promise.reject(new Error(secret)),
    );
    const reply = await web.postContact({ ...validContact, subject: 'Save failure test' });

    assert.equal(reply.status, 500);
    assert.equal(reply.body.error?.code, 'INTERNAL_ERROR');
    for (const leaked of [
      'leak-user',
      'leak-pass',
      'internal-host',
      'MongoServerError',
      'E11000',
      'x.js',
    ]) {
      assert.ok(!reply.text.includes(leaked), `leaked "${leaked}"`);
    }
    assert.equal(
      hookCalls().length,
      0,
      'a notification for an enquiry that was never saved would be a lie',
    );
    assert.ok(error.mock.callCount() >= 1, 'the detail is logged server-side instead');
    assert.equal(await web.contacts.countDocuments({ subject: 'Save failure test' }), 0);

    create.mock.restore();
    assert.equal(
      (await web.postContact({ ...validContact, subject: 'Save failure test' })).status,
      201,
    );
  });
});

for (const failure of ['provider', 'network', 'configuration']) {
  it('preserves the saved enquiry and returns 201 on ' + failure + ' failure', async () => {
    if (failure === 'configuration') delete process.env.RESEND_API_KEY;
    else
      mock.method(globalThis, 'fetch', async () => {
        if (failure === 'network') throw new Error('private provider details');
        return new Response('private provider details', { status: 503 });
      });
    const subject = 'Delivery failure ' + failure;
    const reply = await web.postContact({ ...validContact, subject });
    assert.equal(reply.status, 201);
    assert.deepEqual(reply.body, { success: true, data: { received: true } });
    const stored = await web.contacts.findOne({ subject });
    assert.ok(stored);
    assert.equal(stored.message, validContact.message);
    assert.equal(hookCalls().length, 0);
    assert.equal(error.mock.callCount(), 1);
    assert.doesNotMatch(JSON.stringify(error.mock.calls), /private provider details|synthetic/);
  });
}
