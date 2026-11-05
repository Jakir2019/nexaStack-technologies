import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { ATTACHMENT_MAX_REQUEST_BYTES, ATTACHMENT_MAX_SIZE_BYTES } from '@nexastack/shared';

import { readQuotationUpload, UploadRequestTooLargeError } from './quotationUploadRequest';

// Never load local credentials or contact real storage/database services.
Object.assign(process.env, {
  MONGODB_URI: 'mongodb://127.0.0.1:1/nexastack_test',
  CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret',
});
const { POST } = await import('../app/api/quotation/upload/route');
let ip = 0;
let storage: ReturnType<typeof mock.method<typeof globalThis, 'fetch'>>;
beforeEach(() => {
  storage = mock.method(globalThis, 'fetch', async (_url, init) => {
    const form = init!.body as FormData;
    assert.equal(form.get('type'), 'authenticated');
    assert.equal(form.get('folder'), 'nexastack/quotations');
    assert.equal(typeof form.get('signature'), 'string');
    assert.ok(init!.signal);
    return Response.json({ type: 'authenticated', resource_type: 'image', version: 1, public_id: 'nexastack/quotations/test', format: 'pdf', bytes: (form.get('file') as File).size });
  });
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

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

describe('real quotation upload Route Handler, mocked Cloudinary transport', () => {
  for (const size of [100, ATTACHMENT_MAX_SIZE_BYTES - 1, ATTACHMENT_MAX_SIZE_BYTES]) {
    it(`accepts ${size} bytes and returns only an authenticated unsigned reference`, async () => {
      const response = await POST(request(multipart(size)));
      assert.equal(response.status, 201);
      const result = await response.json();
      assert.equal(result.data.size, size);
      assert.equal(result.data.url, 'https://res.cloudinary.com/test-cloud/image/authenticated/v1/nexastack/quotations/test.pdf');
      assert.equal(storage.mock.callCount(), 1);
    });
  }
  for (const size of [ATTACHMENT_MAX_SIZE_BYTES + 1, 5 * 1024 * 1024, 10 * 1024 * 1024]) {
    it(`rejects ${size} bytes with 413 before storage`, async () => {
      const response = await POST(request(multipart(size)));
      assert.equal(response.status, 413);
      assert.equal((await response.json()).error.code, 'PAYLOAD_TOO_LARGE');
      assert.equal(storage.mock.callCount(), 0);
    });
  }
  it('rejects empty, forged MIME, non-multipart and multi-file/extra-field requests', async () => {
    const two = multipart(100); two.append('file', uploadFile(100));
    const extra = multipart(100); extra.append('ignored', 'no');
    for (const body of [multipart(0), multipart(100, '<script>'), 'invalid', two, extra]) {
      assert.equal((await POST(request(body))).status, 400);
    }
    assert.equal(storage.mock.callCount(), 0);
  });
  it('retains PNG and JPEG byte detection even when the declared MIME is wrong', async () => {
    for (const bytes of [new Uint8Array([137,80,78,71,13,10,26,10]), new Uint8Array([255,216,255,224,0,16])]) {
      const form = new FormData(); form.append('file', new File([bytes], 'file.bin', { type: 'text/plain' }));
      assert.equal((await POST(request(form))).status, 201);
    }
  });
  it('returns a safe failure with no reference on Cloudinary failure or public delivery', async () => {
    for (const reply of [new Response('secret detail', { status: 500 }), Response.json({ type: 'upload' })]) {
      storage.mock.mockImplementation(async () => reply);
      const response = await POST(request(multipart(100)));
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.success, false); assert.equal(body.data, undefined);
      assert.doesNotMatch(JSON.stringify(body), /secret detail|test-secret/);
    }
  });
  it('still rate limits repeated upload attempts', async () => {
    let response: Response | undefined;
    for (let i = 0; i < 21; i++) response = await POST(request(multipart(0), { 'x-forwarded-for': '198.51.100.99' }));
    assert.equal(response!.status, 429);
    assert.equal(storage.mock.callCount(), 0);
  });
});

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
      assert.equal(storage.mock.callCount(), 0);
    });
  }
});
