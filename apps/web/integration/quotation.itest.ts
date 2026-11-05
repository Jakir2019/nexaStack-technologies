import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { setupWeb, validQuotation, type Web } from './support';

/**
 * POST /api/quotation: the real Route Handler against a real database. Focus on what makes a quotation
 * special: the confirmation number MUST be traceable to the stored document (root CLAUDE.md, quotation task),
 * a refused request stores nothing, attachments are only accepted if THIS site's upload route made them, and
 * the schema (shared with the browser wizard) holds at the server, which is the security boundary.
 */

const CLOUD = 'test-cloud';
const OWN_ATTACHMENT = `https://res.cloudinary.com/${CLOUD}/raw/authenticated/v1700000000/nexastack/quotations/test_file-1.pdf`;

let web: Web;
let info: ReturnType<typeof mock.method<Console, 'info'>>;
let error: ReturnType<typeof mock.method<Console, 'error'>>;

before(async () => {
  web = await setupWeb({ cloudName: CLOUD });
});

after(async () => {
  await web.stop();
});

beforeEach(() => {
  info = mock.method(console, 'info', () => {});
  error = mock.method(console, 'error', () => {});
  mock.method(console, 'warn', () => {});
});

afterEach(() => {
  mock.restoreAll();
});

const hookCalls = () =>
  info.mock.calls.filter((call) => String(call.arguments[0]).includes('quotation.received'));

describe('a valid quotation request', () => {
  it('is stored; the confirmation number is derived from the SAME _id as the stored document; the hook fires once', async () => {
    const reply = await web.postQuotation({ ...validQuotation, companyName: 'Test Company' });

    assert.equal(reply.status, 201);
    assert.equal(reply.body.success, true);
    const referenceNumber = reply.body.data?.['referenceNumber'] as string;
    assert.match(referenceNumber, /^NXQ-[0-9A-F]{8}$/);

    const stored = await web.quotations.findOne({ referenceNumber });
    assert.ok(stored, 'the confirmation number points at a real document');
    assert.equal(
      referenceNumber,
      `NXQ-${String(stored._id).slice(-8).toUpperCase()}`,
      'derived from the stored _id, not generated for display only',
    );
    assert.equal(stored.fullName, 'Test User');
    assert.equal(stored.companyName, 'Test Company');
    assert.deepEqual(stored.requiredServices, ['business-websites']);
    assert.equal(stored.status, 'new');
    assert.equal(stored.archived, false);
    assert.equal(stored.consent, true);

    assert.equal(hookCalls().length, 1);
    const [message, fields] = hookCalls()[0]!.arguments as [string, { referenceNumber: string }];
    assert.match(message, /nothing sent/);
    assert.deepEqual(fields, { referenceNumber });
  });

  it('gives every request its own confirmation number', async () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const reply = await web.postQuotation(validQuotation);
      numbers.add(reply.body.data?.['referenceNumber'] as string);
    }
    assert.equal(numbers.size, 8);
  });

  it('rejects a plausible Cloudinary URL without proof of session ownership', async () => {
    const reply = await web.postQuotation({ ...validQuotation, attachments: [OWN_ATTACHMENT] });
    assert.equal(reply.status, 401);
  });

  it('accepts optional fields (reference websites, target completion date, additional message)', async () => {
    const reply = await web.postQuotation({
      ...validQuotation,
      referenceWebsites: ['https://example.com', 'https://example.org/page'],
      targetCompletionDate: '2027-01-15',
      additionalMessage: 'A synthetic additional message.',
      integrations: 'A synthetic integration note.',
    });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
  });
});

describe('an invalid request stores nothing and fires no hook', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['no consent', { consent: false }, 'consent'],
    ['a malformed email', { email: 'nope' }, 'email'],
    ['a country that is not on the list', { country: 'Atlantis' }, 'country'],
    ['no services chosen', { requiredServices: [] }, 'requiredServices'],
    ['an unknown service', { requiredServices: ['time-travel'] }, 'requiredServices.0'],
    [
      'a start date in the wrong format',
      { preferredStartDate: '01/11/2026' },
      'preferredStartDate',
    ],
    [
      'an IMPOSSIBLE start date (2026-02-31)',
      { preferredStartDate: '2026-02-31' },
      'preferredStartDate',
    ],
    [
      'an impossible month (2026-13-45)',
      { preferredStartDate: '2026-13-45' },
      'preferredStartDate',
    ],
    [
      'a completion date before the start date',
      { targetCompletionDate: '2026-10-01' },
      'targetCompletionDate',
    ],
    ['a telephone that is too short', { telephone: '123' }, 'telephone'],
    [
      'too many reference websites',
      { referenceWebsites: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`) },
      'referenceWebsites',
    ],
    [
      'a reference website that is not a URL',
      { referenceWebsites: ['javascript:alert(1)x'] },
      'referenceWebsites.0',
    ],
    ['a string where a boolean is expected', { needsAuthentication: 'yes' }, 'needsAuthentication'],
  ];
  for (const [label, override, path] of cases) {
    it(`${label}: 400 on "${path}"`, async () => {
      const before = await web.quotations.countDocuments();
      const hooks = hookCalls().length;
      const reply = await web.postQuotation({ ...validQuotation, ...override });
      assert.equal(reply.status, 400, JSON.stringify(reply.body));
      assert.equal(reply.body.error?.code, 'VALIDATION_ERROR');
      assert.ok(
        reply.body.error?.details?.some((detail) => detail.path === path),
        `expected an error on ${path}: ${JSON.stringify(reply.body.error?.details)}`,
      );
      assert.equal(await web.quotations.countDocuments(), before);
      assert.equal(hookCalls().length, hooks);
    });
  }

  it('malformed JSON is 400 INVALID_JSON', async () => {
    const reply = await web.postQuotation('{"fullName": ', { raw: true });
    assert.equal(reply.status, 400);
    assert.equal(reply.body.error?.code, 'INVALID_JSON');
  });

  it('a completely empty body reports every required field at once (so the wizard can show them together)', async () => {
    const reply = await web.postQuotation({});
    assert.equal(reply.status, 400);
    const paths = new Set(reply.body.error?.details?.map((detail) => detail.path));
    for (const field of [
      'fullName',
      'email',
      'telephone',
      'country',
      'projectType',
      'requiredServices',
      'businessObjectives',
      'consent',
    ]) {
      assert.ok(paths.has(field), `${field} should be reported`);
    }
  });
});

describe('attachments (only files THIS site uploaded are accepted)', () => {
  const foreign: [string, string][] = [
    ['another host', 'https://evil.example/quotations/file.pdf'],
    [
      'another Cloudinary account',
      'https://res.cloudinary.com/someone-else/raw/authenticated/v1700000000/nexastack/quotations/file.pdf',
    ],
    [
      'a public (not authenticated) delivery path',
      `https://res.cloudinary.com/${CLOUD}/raw/upload/v1700000000/nexastack/quotations/file.pdf`,
    ],
    [
      'a path outside the quotations folder',
      `https://res.cloudinary.com/${CLOUD}/raw/authenticated/v1700000000/nexastack/other/file.pdf`,
    ],
    [
      'a disallowed extension',
      `https://res.cloudinary.com/${CLOUD}/raw/authenticated/v1700000000/nexastack/quotations/file.exe`,
    ],
    [
      'a path-traversal attempt',
      `https://res.cloudinary.com/${CLOUD}/raw/authenticated/v1700000000/nexastack/quotations/../../../secret.pdf`,
    ],
    ['an SSRF-style internal address', 'http://169.254.169.254/latest/meta-data/'],
    ['a javascript: URL', 'javascript:alert(1)'],
  ];
  for (const [label, url] of foreign) {
    it(`refuses ${label}`, async () => {
      const before = await web.quotations.countDocuments();
      const reply = await web.postQuotation({ ...validQuotation, attachments: [url] });
      assert.equal(reply.status, 400, JSON.stringify(reply.body));
      assert.ok(reply.body.error?.details?.some((detail) => detail.path === 'attachments.0'));
      assert.equal(await web.quotations.countDocuments(), before);
    });
  }

  it('refuses more than 5 attachments', async () => {
    const reply = await web.postQuotation({
      ...validQuotation,
      attachments: Array.from({ length: 6 }, () => OWN_ATTACHMENT),
    });
    assert.equal(reply.status, 400);
  });
});

describe('mass assignment', () => {
  it('a client cannot choose its own reference number, status, archive flag, notes or _id', async () => {
    const reply = await web.postQuotation({
      ...validQuotation,
      referenceNumber: 'NXQ-00000000',
      status: 'accepted',
      archived: true,
      notes: [{ text: 'injected' }],
      _id: '507f1f77bcf86cd799439011',
    });
    assert.equal(reply.status, 201);
    const referenceNumber = reply.body.data?.['referenceNumber'] as string;
    assert.notEqual(referenceNumber, 'NXQ-00000000');
    const stored = await web.quotations.findOne({ referenceNumber });
    assert.equal(stored?.status, 'new');
    assert.equal(stored?.archived, false);
    assert.equal(stored?.notes.length, 0);
    assert.notEqual(String(stored?._id), '507f1f77bcf86cd799439011');
  });
});

describe('rate limiting (10 per IP per 15 minutes)', () => {
  it('accepts 10, then 429 in the envelope with nothing stored; another IP is unaffected', async () => {
    const ip = '203.0.113.210';
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await web.postQuotation(validQuotation, { ip })).status,
        201,
        `request ${i + 1}`,
      );
    const before = await web.quotations.countDocuments();
    const blocked = await web.postQuotation(validQuotation, { ip });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error?.code, 'RATE_LIMITED');
    assert.equal(await web.quotations.countDocuments(), before);
    assert.equal((await web.postQuotation(validQuotation)).status, 201);
  });
});

describe('a failure while saving', () => {
  it('is a generic 503 with no leak and no hook; the outbox preserves recovery', async () => {
    const secret =
      'MongoServerError: mongodb://leak-user:leak-pass@internal-host:27017/prod at /srv/app/x.js';
    const create = mock.method(web.QuotationSubmission, 'updateOne', () =>
      Promise.reject(new Error(secret)),
    );
    const before = await web.quotations.countDocuments();
    const reply = await web.postQuotation(validQuotation);
    assert.equal(reply.status, 503);
    assert.equal(reply.body.error?.code, 'SERVICE_UNAVAILABLE');
    for (const leaked of ['leak-user', 'leak-pass', 'internal-host', 'MongoServerError', 'x.js'])
      assert.ok(!reply.text.includes(leaked), leaked);
    assert.equal(hookCalls().length, 0);
    assert.ok(error.mock.callCount() >= 1);
    assert.equal(await web.quotations.countDocuments(), before);
    create.mock.restore();
    assert.equal((await web.postQuotation(validQuotation)).status, 201);
  });
});
