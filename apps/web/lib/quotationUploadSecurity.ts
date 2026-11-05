import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { ApiResponse } from '@nexastack/shared';
import { uploadLimits, ensureUploadDatabase } from './models/QuotationUpload';
import { uploadPolicy } from './quotationUploadPolicy';

export const UPLOAD_COOKIE =
  process.env.NODE_ENV === 'production'
    ? '__Host-nexastack_quotation_upload'
    : 'nexastack_quotation_upload';
export const hashCredential = (value: string) => createHash('sha256').update(value).digest('hex');
export class UploadError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSeconds = 900,
  ) {
    super(message);
  }
}
export function uploadErrorResponse(error: unknown): NextResponse<ApiResponse<never>> {
  const status = error instanceof UploadError ? error.status : 503;
  const code =
    status === 429
      ? 'RATE_LIMITED'
      : status === 401
        ? 'UNAUTHENTICATED'
        : status === 409
          ? 'CONFLICT'
          : status === 403
            ? 'FORBIDDEN'
            : status === 400
              ? 'VALIDATION_ERROR'
              : 'SERVICE_UNAVAILABLE';
  if (!(error instanceof UploadError)) console.error('[quotation-upload] service failure');
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message:
          error instanceof UploadError
            ? error.message
            : 'File services are temporarily unavailable. Please try again shortly.',
      },
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(status === 429
          ? { 'Retry-After': String(error instanceof UploadError ? error.retryAfterSeconds : 900) }
          : {}),
      },
    },
  );
}
export function requireUploadOrigin(request: Request): void {
  const trusted = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').origin;
  if (request.headers.get('origin') !== trusted)
    throw new UploadError(403, 'Please use the quotation form on this website.');
}
export function uploadToken(request: Request): string {
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${UPLOAD_COOKIE}=`))
    ?.slice(UPLOAD_COOKIE.length + 1);
  if (!value || !/^[a-f0-9]{64}$/.test(value))
    throw new UploadError(401, 'Verify the attachment challenge before uploading.');
  return value;
}
/** Shared fixed-window limiter. No forwarded IP header is trusted. Global budgets also bound
 * anonymous verification failures; authenticated requests additionally use the hashed session identity. */
export async function uploadRateLimit(
  key: string,
  max: number,
  now = Date.now(),
  cost = 1,
  windowMs = uploadPolicy.windowMs,
): Promise<void> {
  await ensureUploadDatabase();
  if (cost > max)
    throw new UploadError(
      429,
      'The upload allowance is temporarily exhausted. Please try again later.',
    );
  const window = Math.floor(now / windowMs);
  const id = hashCredential(`${key}:${window}`);
  const retrySeconds = Math.ceil(((window + 1) * windowMs - now) / 1000);
  const exhausted = () =>
    new UploadError(
      429,
      'The request allowance is temporarily exhausted. Please try again later or submit without more attachments.',
      retrySeconds,
    );
  try {
    const result = await uploadLimits().findOneAndUpdate(
      { _id: id, count: { $lte: max - cost } },
      {
        $inc: { count: cost },
        $setOnInsert: { expiresAt: new Date((window + 2) * windowMs) },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if (!result) throw exhausted();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      // A competing worker may have created a not-yet-full bucket. Retry without upsert
      // to distinguish that race from real quota exhaustion; never increment past max.
      const retried = await uploadLimits().updateOne(
        { _id: id, count: { $lte: max - cost } },
        { $inc: { count: cost } },
      );
      if (retried.modifiedCount === 1) return;
      throw exhausted();
    }
    throw error;
  }
}
export async function consumeChallenge(token: string): Promise<void> {
  try {
    await uploadLimits().insertOne({
      _id: `challenge:${hashCredential(token)}`,
      count: 1,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new UploadError(400, 'Please complete a fresh verification challenge.');
    throw error;
  }
}
export async function boundedUploadJson(request: Request): Promise<unknown> {
  if (!request.body) throw new UploadError(400, 'Send a JSON request.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 8192) {
        await reader.cancel();
        throw new UploadError(400, 'The request is too large.');
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError(400, 'Send a valid JSON request.');
  } finally {
    reader.releaseLock();
  }
}
