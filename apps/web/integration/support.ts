import { randomUUID } from 'node:crypto';

import { assertSafeTestUri } from '../../../scripts/lib/mongod.mjs';

/**
 * Harness for the web app's Route Handler integration tests (`/api/contact`, `/api/quotation`): the REAL
 * handlers, called in-process with real `Request` objects, writing to a REAL MongoDB that
 * `scripts/run-integration.mjs` started. Only Cloudflare's siteverify call is ever stubbed, per test.
 *
 * Same safety rule as the API harness: it refuses anything but a loopback database whose name ends in `_test`,
 * makes a database of its own per test file, and drops it afterwards. Fixtures are obviously synthetic. The
 * handlers read their configuration at import time, so the environment is set here BEFORE they are imported;
 * nothing in this file imports app code statically.
 */

export interface SetupOptions {
  storage?: boolean;
  /** `TURNSTILE_SECRET_KEY`; undefined leaves it unset (the "not configured" case). */
  turnstileSecret?: string;
  /** `CLOUDINARY_CLOUD_NAME`, which decides which attachment URLs count as "ours". */
  cloudName?: string;
}

export interface JsonReply {
  status: number;
  body: {
    success: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string; details?: { path: string; message: string }[] };
  };
  text: string;
}

const env = process.env as Record<string, string | undefined>;

function setOrDelete(name: string, value: string | undefined): void {
  if (value === undefined) delete env[name];
  else env[name] = value;
}

let ipCounter = 0;
/** A distinct documentation-range IP per call, so a test never trips the limiter it is not testing. */
export function freshIp(): string {
  ipCounter += 1;
  return `203.0.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

export async function setupWeb(options: SetupOptions = {}) {
  const serverUri = env['NEXASTACK_TEST_MONGO_URI'];
  if (!serverUri) {
    throw new Error(
      'NEXASTACK_TEST_MONGO_URI is not set. Run the integration tests with `pnpm test:integration` (it starts a ' +
        'throwaway mongod). They never fall back to a configured database.',
    );
  }
  const dbName = `nexastack_${randomUUID().replaceAll('-', '').slice(0, 12)}_test`;
  const mongoUri = `${serverUri}/${dbName}`;
  assertSafeTestUri(mongoUri);

  env['NODE_ENV'] = 'test';
  env['MONGODB_URI'] = mongoUri;
  env['NEXT_PUBLIC_SITE_URL'] = 'http://localhost:3000';
  // Never `env[x] = undefined`: process.env stores that as the STRING "undefined", which would read as "configured".
  setOrDelete('TURNSTILE_SECRET_KEY', options.turnstileSecret);
  setOrDelete('CLOUDINARY_CLOUD_NAME', options.cloudName);
  setOrDelete('CLOUDINARY_API_KEY', options.storage ? 'test-key' : undefined);
  setOrDelete('CLOUDINARY_API_SECRET', options.storage ? 'test-secret' : undefined);
  delete env['RESEND_API_KEY'];

  const { default: mongoose } = await import('mongoose');
  const { connectToDatabase } = await import('@/lib/mongodb');
  const contact = await import('@/app/api/contact/route');
  const quotation = await import('@/app/api/quotation/route');
  const { ContactSubmission } = await import('@/lib/models/ContactSubmission');
  const { QuotationSubmission } = await import('@/lib/models/QuotationSubmission');

  await connectToDatabase();
  if (mongoose.connection.name !== dbName) {
    throw new Error(`Connected to "${mongoose.connection.name}", expected "${dbName}".`);
  }

  /** POST a JSON body (or raw text) to a handler, as a browser would. */
  async function post(
    handler: (request: Request) => Promise<Response>,
    body: unknown,
    init: { ip?: string; raw?: boolean } = {},
  ): Promise<JsonReply> {
    const request = new Request('http://localhost:3000/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-submission-id': randomUUID(), 'x-forwarded-for': init.ip ?? freshIp() },
      body: init.raw ? String(body) : JSON.stringify(body),
    });
    const response = await handler(request);
    const text = await response.text();
    return { status: response.status, body: JSON.parse(text) as JsonReply['body'], text };
  }

  async function stop(): Promise<void> {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }

  return {
    dbName,
    mongoose,
    ContactSubmission,
    QuotationSubmission,
    /** Raw driver collections, for READING what the handlers stored (loosely typed, unlike the model union). */
    contacts: mongoose.connection.collection('contactsubmissions'),
    quotations: mongoose.connection.collection('quotationsubmissions'),
    postContact: (body: unknown, init?: { ip?: string; raw?: boolean }) =>
      post(contact.POST, body, init),
    postQuotation: (body: unknown, init?: { ip?: string; raw?: boolean }) =>
      post(quotation.POST, body, init),
    stop,
  };
}

export type Web = Awaited<ReturnType<typeof setupWeb>>;

/** A valid `/contact` submission (synthetic). */
export const validContact = {
  fullName: 'Test User',
  email: 'test@example.com',
  subject: 'Test enquiry',
  message: 'This is a synthetic test message.',
  preferredContactMethod: 'email',
  consent: true,
} as const;

/** A valid `/quotation` submission (synthetic). */
export const validQuotation = {
  fullName: 'Test User',
  email: 'test@example.com',
  telephone: '+880 1000-000000',
  country: 'Bangladesh',
  projectType: 'new-website',
  requiredServices: ['business-websites'],
  businessObjectives: 'A synthetic objective for a test run.',
  targetUsers: 'Test customers',
  projectStatus: 'new',
  requiredFeatures: 'A synthetic feature list for a test run.',
  numberOfPages: '1-5',
  designRequirements: 'need-full-design',
  needsAdminDashboard: false,
  needsAuthentication: false,
  budgetRange: 'small',
  preferredStartDate: '2026-11-01',
  maintenanceRequired: 'no',
  consent: true,
} as const;
