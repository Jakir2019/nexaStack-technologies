import { quotationUploadAuthorizationSchema } from '@nexastack/shared';
import { NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { issueUploadSession } from '@/lib/quotationUploadLifecycle';
import { uploadPolicy } from '@/lib/quotationUploadPolicy';
import {
  boundedUploadJson,
  consumeChallenge,
  requireUploadOrigin,
  UPLOAD_COOKIE,
  UploadError,
  uploadErrorResponse,
  uploadRateLimit,
  uploadToken,
} from '@/lib/quotationUploadSecurity';

export async function POST(request: Request): Promise<Response> {
  try {
    requireUploadOrigin(request);
    await uploadRateLimit('authorize-global', uploadPolicy.authAttempts);
    const parsed = quotationUploadAuthorizationSchema.safeParse(await boundedUploadJson(request));
    if (!parsed.success)
      throw new UploadError(400, 'Please complete the attachment verification challenge.');
    await consumeChallenge(parsed.data.turnstileToken);
    const verified = await verifyTurnstileToken(parsed.data.turnstileToken, 'quotation-upload');
    if (verified.outcome !== 'passed')
      throw new UploadError(
        verified.outcome === 'unavailable' ? 503 : 400,
        'Attachment verification failed. Please complete a fresh challenge.',
      );
    await uploadRateLimit('sessions-global', uploadPolicy.sessions);
    let previous: string | undefined;
    try {
      previous = uploadToken(request);
    } catch {
      /* First draft has no cookie. */
    }
    const session = await issueUploadSession(previous);
    const response = NextResponse.json(
      { success: true, data: { expiresAt: session.expiresAt.toISOString() } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    response.cookies.set(UPLOAD_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: Math.ceil(uploadPolicy.retentionMs / 1000),
    });
    return response;
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
