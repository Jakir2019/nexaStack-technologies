import { quotationSchema, quotationUploadIdSchema, ERROR_CODES, type ApiResponse } from '@nexastack/shared';
import { NextResponse } from 'next/server';

import { isOwnAttachmentUrl } from '@/lib/cloudinary';
import { commitQuotation, commitUnattachedQuotation, retryQuotation, revokeUnusedSession } from '@/lib/quotationUploadLifecycle';
import { requireUploadOrigin, uploadToken, uploadErrorResponse, uploadRateLimit } from '@/lib/quotationUploadSecurity';
import { uploadPolicy } from '@/lib/quotationUploadPolicy';
import { notifyQuotationSubmission } from '@/lib/notifications';
import { checkQuotationRateLimit, getClientIp } from '@/lib/quotationRateLimit';
import { verifyTurnstileToken } from '@/lib/turnstile';

/**
 * Public `/quotation` submission endpoint. Runs in the Node.js runtime (the default for Route
 * Handlers) because Mongoose needs a TCP connection, which the Edge runtime doesn't support.
 *
 * Chosen over the Express API (apps/api), matching `/api/contact`'s reasoning: a public form
 * must never depend on a Render free-tier instance waking up from sleep (root CLAUDE.md 22.5).
 */

interface QuotationResponseData {
  referenceNumber: string;
}

function jsonSuccess(
  data: QuotationResponseData,
  status = 201,
): NextResponse<ApiResponse<QuotationResponseData>> {
  return NextResponse.json({ success: true, data }, { status });
}

function jsonError(
  status: number,
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
  message: string,
  details?: { location: 'body'; path: string; message: string }[],
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse<unknown>>> {
  try { requireUploadOrigin(request); } catch (error) { return uploadErrorResponse(error); }
  const ip = getClientIp(request);
  const rateLimit = checkQuotationRateLimit(ip);
  if (!rateLimit.allowed) {
    return jsonError(
      429,
      ERROR_CODES.RATE_LIMITED,
      'Too many requests have been sent from your connection. Please wait 15 minutes and try again.',
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(
      400,
      ERROR_CODES.INVALID_JSON,
      'Send the request body as JSON with the header Content-Type: application/json',
    );
  }

  // The Turnstile token rides in the same JSON body but is not part of the shared quotation schema.
  const { turnstileToken, ...candidate } =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  const parsed = await quotationSchema.safeParseAsync(candidate);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      location: 'body' as const,
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return jsonError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Some of the information sent needs attention. Check the details and try again.',
      details,
    );
  }

  // Attachments are URLs the browser sends back after uploading; only ones this site's own upload
  // route could have produced are accepted (the shared schema only checks that they look like URLs).
  const badAttachment = (parsed.data.attachments ?? []).findIndex((url) => !isOwnAttachmentUrl(url));
  if (badAttachment !== -1) {
    return jsonError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Some of the information sent needs attention. Check the details and try again.',
      [
        {
          location: 'body',
          path: `attachments.${badAttachment}`,
          message: 'That attachment was not uploaded through this form. Remove it and attach the file again.',
        },
      ],
    );
  }

  const nonce = quotationUploadIdSchema.safeParse(request.headers.get('x-submission-id'));
  if (!nonce.success) return jsonError(400, ERROR_CODES.VALIDATION_ERROR, 'Please reload the quotation form and try again.');
  let token: string | undefined;
  let unusedToken: string | undefined;
  try {
    await uploadRateLimit('quotation-submit-global', uploadPolicy.submitRequests);
    if (parsed.data.attachments?.length) token = uploadToken(request);
    else { try { unusedToken = uploadToken(request); } catch { /* Optional upload session. */ } }
    const previous = await retryQuotation(token ?? `submission:${nonce.data}`, parsed.data);
    if (previous) {
      if (unusedToken) await revokeUnusedSession(unusedToken);
      return jsonSuccess({ referenceNumber: previous });
    }
  } catch (error) { return uploadErrorResponse(error); }

  const verification = await verifyTurnstileToken(
    typeof turnstileToken === 'string' ? turnstileToken : undefined,
    'quotation',
  );
  if (verification.outcome === 'unavailable') {
    return jsonError(
      503,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      'Quotation requests are temporarily unavailable. Please email or call us instead, or try again later.',
    );
  }
  if (verification.outcome === 'failed') {
    return jsonError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'The verification challenge could not be confirmed. Please try again.',
    );
  }

  let referenceNumber: string;
  try {
    referenceNumber = token ? await commitQuotation(token, parsed.data) : await commitUnattachedQuotation(nonce.data, parsed.data);
    if (unusedToken) await revokeUnusedSession(unusedToken);
  } catch (err) {
    return uploadErrorResponse(err);
  }

  // Deferred email hook, now in one shared place (lib/notifications.ts) instead of a copy here.
  // Behaviour is unchanged: no provider is configured, so nothing is sent.
  notifyQuotationSubmission({ referenceNumber });

  return jsonSuccess({ referenceNumber }, 201);
}
