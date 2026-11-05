import { ATTACHMENT_MAX_REQUEST_BYTES } from '@nexastack/shared';

export class UploadRequestTooLargeError extends Error {}

/** Bounds bytes before multipart parsing, even with absent or dishonest Content-Length.
 * Netlify can still reject a request upstream before this code executes.
 */
export async function readQuotationUpload(request: Request): Promise<FormData> {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > ATTACHMENT_MAX_REQUEST_BYTES) {
    await request.body?.cancel();
    throw new UploadRequestTooLargeError();
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !request.body) {
    throw new Error('Expected multipart form data');
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      received += next.value.byteLength;
      if (received > ATTACHMENT_MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new UploadRequestTooLargeError();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(Buffer.concat(chunks, received), {
    headers: { 'content-type': contentType },
  }).formData();
}
