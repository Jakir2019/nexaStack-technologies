import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ATTACHMENT_MAX_REQUEST_BYTES, ATTACHMENT_MAX_SIZE_BYTES } from '@nexastack/shared';
import { readQuotationUpload, UploadRequestTooLargeError } from './quotationUploadRequest';
// The authenticated route tests now run with a real database in integration/quotation-uploads.itest.ts.
let ip = 0;
function uploadFile(size: number, signature = '%PDF-1.7'): File {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode(signature).subarray(0, size));
  return new File([bytes], 'brief.pdf', { type: 'application/pdf' });
}
function request(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/quotation/upload', {
    method: 'POST', body, headers: { 'x-forwarded-for': `203.0.113.${++ip}`, ...headers },
  });
}
function multipart(size: number, signature?: string): FormData {
  const form = new FormData(); form.append('file', uploadFile(size, signature)); return form;
}

describe('complete multipart request budget', () => {
  it('accepts the exact body cap and leaves Base64 envelope headroom', async () => {
    const input = multipart(ATTACHMENT_MAX_SIZE_BYTES);
    input.append('padding', '');
    const overhead = (await new Response(input).arrayBuffer()).byteLength;
    input.set('padding', 'a'.repeat(ATTACHMENT_MAX_REQUEST_BYTES - overhead));
    const encoded = new Response(input);
    const padded = new Uint8Array(await encoded.arrayBuffer());
    assert.equal(padded.length, ATTACHMENT_MAX_REQUEST_BYTES);
    // Tests the byte reader separately: the route also rejects extra form fields.
    const form = await readQuotationUpload(request(padded, { 'content-type': encoded.headers.get('content-type')! }));
    assert.equal((form.get('file') as File).size, ATTACHMENT_MAX_SIZE_BYTES);
    assert.equal(4 * Math.ceil(padded.length / 3), 5_614_252);
    assert.ok(6_000_000 - 4 * Math.ceil(padded.length / 3) > 380_000);
  });
  it('rejects declared overflow without reading and cancels the stream', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const req = new Request('http://localhost/upload', { method: 'POST', body: stream, duplex: 'half', headers: { 'content-length': String(ATTACHMENT_MAX_REQUEST_BYTES + 1) } } as RequestInit);
    await assert.rejects(readQuotationUpload(req), UploadRequestTooLargeError);
    assert.equal(cancelled, true);
  });
  for (const length of [undefined, '1']) {
    it(`counts actual bytes with ${length ? 'dishonest' : 'absent'} Content-Length`, async () => {
      let cancelled = false;
      let sent = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) { controller.enqueue(new Uint8Array(++sent === 1 ? ATTACHMENT_MAX_REQUEST_BYTES : 1)); },
        cancel() { cancelled = true; },
      });
      const req = new Request('http://localhost/upload', { method: 'POST', body: stream, duplex: 'half', headers: { 'content-type': 'multipart/form-data; boundary=test', ...(length ? { 'content-length': length } : {}) } } as RequestInit);
      await assert.rejects(readQuotationUpload(req), UploadRequestTooLargeError);
      assert.equal(cancelled, true);

    });
  }
});
