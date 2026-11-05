import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { ATTACHMENT_MAX_REQUEST_BYTES, ATTACHMENT_MAX_SIZE_BYTES } from '@nexastack/shared';

import { quotationFileError, uploadQuotationAttachment } from './quotationUpload';

afterEach(() => mock.restoreAll());

function file(size: number, name = 'brief.pdf'): File {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

describe('quotation browser upload', () => {
  for (const size of [1, ATTACHMENT_MAX_SIZE_BYTES - 1, ATTACHMENT_MAX_SIZE_BYTES]) {
    it(`sends one supported ${size}-byte file in a bounded multipart request`, async () => {
      const fetchSpy = mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        const body = init!.body as Blob;
        assert.ok(body.size <= ATTACHMENT_MAX_REQUEST_BYTES);
        assert.ok(4 * Math.ceil(body.size / 3) < 6_000_000);
        const form = await new Response(body, { headers: init!.headers }).formData();
        assert.equal([...form.keys()].length, 1);
        assert.equal((form.get('file') as File).size, size);
        return Response.json({ success: true, data: { url: 'https://example.test/brief.pdf', size, name: 'brief.pdf' } });
      });
      assert.equal((await uploadQuotationAttachment(file(size))).success, true);
      assert.equal(fetchSpy.mock.callCount(), 1);
    });
  }
  for (const size of [ATTACHMENT_MAX_SIZE_BYTES + 1, 5 * 1024 * 1024, 10 * 1024 * 1024]) {
    it(`rejects ${size} bytes before any network call`, async () => {
      const fetchSpy = mock.method(globalThis, 'fetch');
      assert.match(quotationFileError(file(size))!, /4 MB/);
      await assert.rejects(uploadQuotationAttachment(file(size)), /4 MB/);
      assert.equal(fetchSpy.mock.callCount(), 0);
    });
  }
  it('rejects empty files and unsupported extensions; keeps all supported extensions', () => {
    assert.match(quotationFileError(file(0))!, /empty/);
    assert.match(quotationFileError(file(1, 'bad.exe'))!, /Only PDF/);
    for (const name of ['brief.pdf', 'photo.PNG', 'photo.jpg', 'photo.jpeg']) {
      assert.equal(quotationFileError(file(1, name)), undefined);
    }
  });
  it('bounds multipart overhead too, before upload', async () => {
    const fetchSpy = mock.method(globalThis, 'fetch');
    await assert.rejects(uploadQuotationAttachment(file(ATTACHMENT_MAX_SIZE_BYTES, `${'a'.repeat(20_000)}.pdf`)), /request is too large/);
    assert.equal(fetchSpy.mock.callCount(), 0);
  });
  it('keeps valid files in a mixed selection and sends each separately', async () => {
    const fetchSpy = mock.method(globalThis, 'fetch', async () => Response.json({ success: true, data: { url: 'https://example.test/a.pdf' } }));
    const files = [file(10), file(ATTACHMENT_MAX_SIZE_BYTES + 1), file(20)];
    const results = await Promise.all(files.map(async (value) => quotationFileError(value) ?? uploadQuotationAttachment(value)));
    assert.equal(fetchSpy.mock.callCount(), 2);
    assert.match(String(results[1]), /4 MB/);
  });
  it('handles an upstream HTML 413 and a non-JSON gateway error', async () => {
    const fetchSpy = mock.method(globalThis, 'fetch', async () => new Response('<html>too large</html>', { status: 413 }));
    await assert.rejects(uploadQuotationAttachment(file(1)), /4 MB/);
    fetchSpy.mock.mockImplementation(async () => new Response('gateway failed', { status: 502 }));
    await assert.rejects(uploadQuotationAttachment(file(1)), /try again/);
  });
  it('preserves structured failure and permits retry after a network interruption', async () => {
    const fetchSpy = mock.method(globalThis, 'fetch', async () => { throw new Error('private network detail'); });
    await assert.rejects(uploadQuotationAttachment(file(1)), /Check your connection and try again/);
    fetchSpy.mock.mockImplementation(async () => Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Please try again.' } }, { status: 500 }));
    assert.equal((await uploadQuotationAttachment(file(1))).success, false);
    fetchSpy.mock.mockImplementation(async () => Response.json({ success: true, data: { url: 'https://example.test/a.pdf' } }));
    assert.equal((await uploadQuotationAttachment(file(1))).success, true);
  });
});
