import { contactFormSchema, ERROR_CODES, type ApiResponse } from '@nexastack/shared';
import { NextResponse } from 'next/server';

import { connectToDatabase } from '@/lib/mongodb';
import { ContactSubmission } from '@/lib/models/ContactSubmission';
import { notifyContactSubmission } from '@/lib/notifications';
import { checkContactRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyTurnstileToken } from '@/lib/turnstile';

/**
 * Public general-inquiry contact endpoint. Runs in the Node.js runtime (the default for Route
 * Handlers) because Mongoose needs a TCP connection, which the Edge runtime doesn't support.
 *
 * Chosen over the Express API (apps/api) so a public contact form never depends on a Render
 * free-tier instance waking up from sleep — see root CLAUDE.md section 22 item 5.
 */

function jsonSuccess<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
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
  const ip = getClientIp(request);
  const rateLimit = checkContactRateLimit(ip);
  if (!rateLimit.allowed) {
    return jsonError(
      429,
      ERROR_CODES.RATE_LIMITED,
      'Too many messages have been sent from your connection. Please wait 15 minutes and try again.',
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

  const { turnstileToken, ...candidate } =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  const parsed = await contactFormSchema.safeParseAsync(candidate);
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

  const verification = await verifyTurnstileToken(
    typeof turnstileToken === 'string' ? turnstileToken : undefined,
    'contact',
  );
  if (verification.outcome === 'unavailable') {
    return jsonError(
      503,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      'Sending messages is temporarily unavailable. Please email or call us instead, or try again later.',
    );
  }
  if (verification.outcome === 'failed') {
    return jsonError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'The verification challenge could not be confirmed. Please try again.',
    );
  }

  let created: { id: string; createdAt: Date };
  try {
    await connectToDatabase();
    created = await ContactSubmission.create(parsed.data);
  } catch (err) {
    console.error('[contact] Failed to persist submission', err);
    return jsonError(
      500,
      ERROR_CODES.INTERNAL_ERROR,
      'Something went wrong on our end. Please try again in a moment.',
    );
  }

  // Await the bounded provider request so serverless execution cannot end before delivery.
  // The hook contains failures: the saved enquiry still receives a successful response.
  await notifyContactSubmission({ ...parsed.data, id: created.id, createdAt: created.createdAt });

  return jsonSuccess({ received: true }, 201);
}
