import { env } from 'node:process';

import { contactFormSchema, type ContactPageInput } from '@nexastack/shared';
import { z } from 'zod';

/** Node-only module. Configuration is checked at delivery time so email cannot prevent a DB save. */
const emailConfigSchema = z.object({
  RESEND_API_KEY: z.string().trim().min(1),
  RESEND_FROM_EMAIL: z.email(),
  CONTACT_NOTIFICATION_EMAIL: z.email(),
});

export type ContactNotification = Pick<
  ContactPageInput,
  'fullName' | 'email' | 'subject' | 'message' | 'phone' | 'companyName'
> & { id: string; createdAt: Date };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character]!;
  });
}

/** Never log request/response bodies, raw errors, configuration values, or visitor fields. */
function contactLog(id: string, delivery: string, status?: number): void {
  try {
    const line = JSON.stringify({
      event: 'contact.received',
      id,
      delivery,
      ...(status === undefined ? {} : { status }),
    });
    if (delivery === 'accepted') console.info(line);
    else console.error(line);
  } catch {
    // Logging failure must not change the submission result either.
  }
}

/** Called only after persistence. Provider acceptance is not proof of inbox delivery. */
export async function notifyContactSubmission(submission: ContactNotification): Promise<void> {
  try {
    const config = emailConfigSchema.safeParse(env);
    if (!config.success) {
      contactLog(submission.id, 'configuration_missing_or_invalid');
      return;
    }
    // Reuse the shared validation rule, including trimming, for Reply-To.
    const replyTo = contactFormSchema.shape.email.safeParse(submission.email);
    if (!replyTo.success) {
      contactLog(submission.id, 'invalid_reply_to');
      return;
    }
    const fields = [
      ['Enquiry ID', submission.id],
      ['Submitted at (UTC)', submission.createdAt.toISOString()],
      ['Name', submission.fullName],
      ['Email', replyTo.data],
      ['Subject', submission.subject],
      ['Phone', submission.phone || 'Not provided'],
      ['Company', submission.companyName || 'Not provided'],
      ['Message', submission.message],
    ];
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.data.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `contact.received/${submission.id}`,
      },
      body: JSON.stringify({
        from: config.data.RESEND_FROM_EMAIL,
        to: [config.data.CONTACT_NOTIFICATION_EMAIL],
        reply_to: replyTo.data,
        subject: `New contact enquiry: ${submission.subject.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ')}`,
        text: fields.map(([label, value]) => `${label}: ${value}`).join('\n\n'),
        html: `<h1>New contact enquiry</h1>${fields.map(([label, value]) => `<p><strong>${label}</strong><br>${escapeHtml(value!).replace(/\r?\n/g, '<br>')}</p>`).join('')}`,
      }),
      signal: AbortSignal.timeout(8_000),
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok) {
      contactLog(submission.id, 'provider_rejected', response.status);
      return;
    }
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== 'object' ||
      !('id' in result) ||
      typeof result.id !== 'string' ||
      !result.id
    ) {
      contactLog(submission.id, 'invalid_provider_response');
      return;
    }
    contactLog(submission.id, 'accepted');
  } catch {
    contactLog(submission.id, 'delivery_failed');
  }
}

/** Quotation delivery remains deferred; enabling contact email does not enable other mail. */
export function notifyQuotationSubmission(submission: { referenceNumber: string }): void {
  try {
    if (env.NODE_ENV === 'production') {
      console.info(
        JSON.stringify({ event: 'quotation.received', ...submission, delivery: 'deferred' }),
      );
    } else {
      console.info(
        '[notifications] quotation.received — no email provider configured, nothing sent (development log)',
        submission,
      );
    }
  } catch {
    try {
      console.error('[notifications] quotation.received hook failed');
    } catch {
      /* Preserve the saved quotation even if logging fails. */
    }
  }
}
