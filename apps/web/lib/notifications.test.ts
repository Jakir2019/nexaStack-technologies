import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';

import { notifyContactSubmission, notifyQuotationSubmission } from './notifications';

const submission = {
  id: '507f1f77bcf86cd799439011',
  createdAt: new Date('2026-11-19T10:00:00Z'),
  fullName: 'Test <Visitor>',
  email: 'test@example.com',
  subject: 'Test enquiry',
  message: '<script>alert("private")</script>\nSecond line & more',
  phone: '+8801000000000',
  companyName: "Test's Company",
};
const keys = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'CONTACT_NOTIFICATION_EMAIL'] as const;
const original = keys.map((key) => process.env[key]);
let info: ReturnType<typeof mock.method<Console, 'info'>>;
let error: ReturnType<typeof mock.method<Console, 'error'>>;
let send: ReturnType<typeof mock.method<typeof globalThis, 'fetch'>>;
beforeEach(() => {
  process.env.RESEND_API_KEY = 're_dummy_secret';
  process.env.RESEND_FROM_EMAIL = 'notifications@send.nexastacktechnologies.com';
  process.env.CONTACT_NOTIFICATION_EMAIL = 'info@nexastacktechnologies.com';
  info = mock.method(console, 'info', () => {});
  error = mock.method(console, 'error', () => {});
  send = mock.method(globalThis, 'fetch', async () => Response.json({ id: 'email-test' }));
});
afterEach(() => {
  mock.restoreAll();
  keys.forEach((key, index) => {
    if (original[index] === undefined) delete process.env[key];
    else process.env[key] = original[index];
  });
});
it('sends all fields with escaped HTML, validated Reply-To and stable idempotency', async () => {
  await notifyContactSubmission(submission);
  await notifyContactSubmission(submission);
  const [url, options] = send.mock.calls[0]!.arguments;
  assert.equal(url, 'https://api.resend.com/emails');
  const body = JSON.parse(String(options!.body));
  assert.equal(body.from, process.env.RESEND_FROM_EMAIL);
  assert.deepEqual(body.to, [process.env.CONTACT_NOTIFICATION_EMAIL]);
  assert.equal(body.reply_to, submission.email);
  for (const value of Object.values(submission)) {
    assert.ok(body.text.includes(value instanceof Date ? value.toISOString() : value));
  }
  assert.ok(body.html.includes('&lt;script&gt;'));
  assert.ok(body.html.includes('&quot;private&quot;'));
  assert.ok(body.html.includes('Test&#39;s Company'));
  assert.ok(body.html.includes('<br>Second line &amp; more'));
  assert.ok(!body.html.includes('<script>'));
  assert.equal(options!.redirect, 'error');
  assert.ok(options!.signal instanceof AbortSignal);
  assert.equal(
    new Headers(options!.headers).get('Idempotency-Key'),
    `contact.received/${submission.id}`,
  );
  assert.deepEqual(send.mock.calls[1]!.arguments[1]!.headers, options!.headers);
  assert.equal(JSON.parse(String(info.mock.calls[0]!.arguments[0])).delivery, 'accepted');
});
for (const status of [401, 429, 500]) {
  it(`contains provider ${status} failure without leaking its response`, async () => {
    send.mock.mockImplementation(
      async () => new Response('private message re_dummy_secret', { status }),
    );
    await assert.doesNotReject(notifyContactSubmission(submission));
    assert.deepEqual(JSON.parse(String(error.mock.calls[0]!.arguments[0])), {
      event: 'contact.received',
      id: submission.id,
      delivery: 'provider_rejected',
      status,
    });
  });
}
for (const key of keys) {
  it(`skips delivery when ${key} is missing`, async () => {
    delete process.env[key];
    await notifyContactSubmission(submission);
    assert.equal(send.mock.callCount(), 0);
    assert.match(String(error.mock.calls[0]!.arguments[0]), /configuration_missing_or_invalid/);
  });
}
it('contains network/timeout errors and broken logging', async () => {
  send.mock.mockImplementation(async () => {
    throw new Error('secret private message');
  });
  await assert.doesNotReject(notifyContactSubmission(submission));
  assert.doesNotMatch(JSON.stringify(error.mock.calls), /secret private message/);
  error.mock.mockImplementation(() => {
    throw new Error('logger unavailable');
  });
  await assert.doesNotReject(notifyContactSubmission(submission));
});
it('rejects invalid Reply-To and invalid configured addresses before sending', async () => {
  await notifyContactSubmission({
    ...submission,
    email: 'test@example.com\r\nBcc: other@example.com',
  });
  process.env.RESEND_FROM_EMAIL = 'invalid';
  await notifyContactSubmission(submission);
  assert.equal(send.mock.callCount(), 0);
});
it('detects malformed success responses and renders absent optional fields', async () => {
  send.mock.mockImplementation(async () => Response.json({}));
  await notifyContactSubmission({ ...submission, phone: undefined, companyName: undefined });
  assert.match(String(send.mock.calls[0]!.arguments[1]!.body), /Not provided/);
  assert.match(String(error.mock.calls[0]!.arguments[0]), /invalid_provider_response/);
});
it('quotation remains deferred without making a provider request', () => {
  notifyQuotationSubmission({ referenceNumber: 'NXQ-TEST' });
  assert.equal(send.mock.callCount(), 0);
  assert.equal(info.mock.callCount(), 1);
});
