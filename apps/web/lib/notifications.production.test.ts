import assert from 'node:assert/strict';
import { it, mock } from 'node:test';

it('production missing configuration logs identifiers only', async () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  delete process.env.RESEND_API_KEY;
  const { notifyContactSubmission } = await import('./notifications');
  const error = mock.method(console, 'error', () => {});
  try {
    await notifyContactSubmission({
      id: 'abc123',
      createdAt: new Date(),
      fullName: 'Private Name',
      email: 'private@example.com',
      subject: 'Private Subject',
      message: 'Private Message',
    });
    assert.deepEqual(JSON.parse(String(error.mock.calls[0]!.arguments[0])), {
      event: 'contact.received',
      id: 'abc123',
      delivery: 'configuration_missing_or_invalid',
    });
  } finally {
    mock.restoreAll();
  }
});
