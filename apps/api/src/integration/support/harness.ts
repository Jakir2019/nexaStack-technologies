import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Role } from '@nexastack/shared';

import { assertSafeTestUri } from '../../../../../scripts/lib/mongod.mjs';

/**
 * The integration harness: the REAL Express app (`createApp()`), served over real HTTP, backed by a real
 * MongoDB that `scripts/run-integration.mjs` started for the run. Nothing is stubbed.
 *
 * It refuses to connect to anything but a loopback database whose name ends in `_test` (`assertSafeTestUri`),
 * builds a database of its own per test file, and drops it afterwards. Every record made here is obviously
 * synthetic (`test@example.com`, "Test User"). The API reads its configuration at import time, so the
 * environment is set here BEFORE the app is imported, which is why nothing in this file imports app code
 * statically.
 */

export const TEST_ORIGIN = 'http://localhost:3000';
export const CSRF_HEADER = 'x-requested-with';
/** The value the API's csrf middleware requires (not exported from there). */
export const CSRF_VALUE = 'nexastack-admin';
export const SESSION_COOKIE = 'nexastack_admin_session';
export const API = '/api/v1';

/** A response body in the API's envelope (root CLAUDE.md 11.2). `data` is whatever the endpoint returns. */
export interface Envelope {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- endpoint payloads differ; tests assert what they read
  data?: any;
  error?: { code: string; message: string; details?: unknown };
}

export interface Reply {
  status: number;
  body: Envelope;
  headers: Headers;
  /** Raw text, for responses that are not JSON. */
  text: string;
  /** `name=value` of every cookie the response set. */
  setCookies: string[];
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Send this exact body text instead of JSON-encoding `body` (malformed-JSON tests). */
  rawBody?: string;
  /** A `name=value` cookie header, as returned by `loginAs`. */
  cookie?: string;
  /** Client IP for the rate limiters (the app trusts one proxy hop). Every call gets a fresh one by default. */
  ip?: string;
  /** Override the Origin header; `null` sends none. Default: the allowed test origin, on mutations. */
  origin?: string | null;
  /** Send the CSRF header. Default true, on mutations. */
  csrf?: boolean;
  headers?: Record<string, string>;
}

export interface SeededAdmin {
  id: string;
  email: string;
  password: string;
  role: Role;
}

export interface SeedAdminOptions {
  email?: string;
  password?: string;
  status?: 'active' | 'suspended';
  mustChangePassword?: boolean;
}

const DEFAULT_PASSWORD = 'Test-Password-1234';

let ipCounter = 0;
/** A distinct documentation-range IP per call, so a test never trips a limiter it is not testing. */
export function freshIp(): string {
  ipCounter += 1;
  return `198.51.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

export async function startApi(cookieDomain = '') {
  const serverUri = process.env['NEXASTACK_TEST_MONGO_URI'];
  if (!serverUri) {
    throw new Error(
      'NEXASTACK_TEST_MONGO_URI is not set. Run the integration tests with `pnpm test:integration` (it starts a ' +
        'throwaway mongod). They never fall back to a configured database.',
    );
  }
  const dbName = `nexastack_${randomUUID().replaceAll('-', '').slice(0, 12)}_test`;
  const mongoUri = `${serverUri}/${dbName}`;
  assertSafeTestUri(mongoUri);

  const webOrigin = cookieDomain ? `https://${cookieDomain}` : TEST_ORIGIN;
  Object.assign(process.env, {
    NODE_ENV: 'test',
    CORS_ORIGINS: webOrigin,
    COOKIE_DOMAIN: cookieDomain,
    MONGODB_URI: mongoUri,
    JWT_SECRET: randomBytes(32).toString('hex'),
    WEB_APP_URL: webOrigin,
    LOG_LEVEL: 'silent',
    TRUST_PROXY: '1',
  });
  for (const name of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
    delete process.env[name];
  }

  const { default: mongoose } = await import('mongoose');
  const { connectWithRetry, disconnectDatabase } = await import('../../lib/db.js');
  const { createApp } = await import('../../app.js');
  const { hashPassword } = await import('../../lib/password.js');
  const { logger } = await import('../../lib/logger.js');
  const { AdminUser } = await import('../../models/AdminUser.js');
  const { AdminSession } = await import('../../models/AdminSession.js');
  const { AdminActivityLog } = await import('../../models/AdminActivityLog.js');
  const { PasswordResetToken } = await import('../../models/PasswordResetToken.js');
  const { BlogCategory } = await import('../../models/BlogCategory.js');
  const { BlogPost } = await import('../../models/BlogPost.js');
  const { ContactSubmission } = await import('../../models/ContactSubmission.js');
  const { QuotationSubmission } = await import('../../models/QuotationSubmission.js');
  const { Media } = await import('../../models/Media.js');

  await connectWithRetry(mongoUri);
  // Belt and braces: the connection actually made must be to the guarded database.
  if (mongoose.connection.name !== dbName)
    throw new Error(`Connected to "${mongoose.connection.name}", expected "${dbName}".`);

  const server: Server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function request(path: string, options: RequestOptions = {}): Promise<Reply> {
    const method = options.method ?? 'GET';
    const mutating = method !== 'GET' && method !== 'HEAD';
    const headers: Record<string, string> = {
      'x-forwarded-for': options.ip ?? freshIp(),
      ...(cookieDomain && { 'x-forwarded-host': `api.${cookieDomain}` }),
      ...options.headers,
    };
    const origin = options.origin === undefined ? (mutating ? webOrigin : null) : options.origin;
    if (origin) headers['origin'] = origin;
    if (mutating && options.csrf !== false) headers[CSRF_HEADER] = CSRF_VALUE;
    if (options.cookie) headers['cookie'] = options.cookie;

    let body: string | undefined;
    if (options.rawBody !== undefined) {
      body = options.rawBody;
      headers['content-type'] ??= 'application/json';
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['content-type'] = 'application/json';
    }

    const response = await fetch(`${base}${path}`, { method, headers, body, redirect: 'manual' });
    // Not `response.text()`: the fetch spec strips a leading UTF-8 BOM there, and the CSV export writes one on purpose.
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer());
    let parsed: Envelope = { success: false };
    try {
      parsed = JSON.parse(text) as Envelope;
    } catch {
      // not JSON: callers read `text`
    }
    return {
      status: response.status,
      body: parsed,
      headers: response.headers,
      text,
      setCookies: response.headers.getSetCookie(),
    };
  }

  const hashes = new Map<string, string>();
  async function seedAdmin(role: Role, options: SeedAdminOptions = {}): Promise<SeededAdmin> {
    const password = options.password ?? DEFAULT_PASSWORD;
    let passwordHash = hashes.get(password);
    if (!passwordHash) {
      passwordHash = await hashPassword(password);
      hashes.set(password, passwordHash);
    }
    const email =
      options.email ?? `test-${role.replace('_', '-')}-${randomUUID().slice(0, 8)}@example.com`;
    const user = await AdminUser.create({
      email,
      passwordHash,
      role,
      status: options.status ?? 'active',
      mustChangePassword: options.mustChangePassword ?? false,
    });
    return { id: String(user._id), email, password, role };
  }

  /** Signs in through the real login endpoint and returns the `name=value` cookie for later requests. */
  async function loginAs(
    admin: Pick<SeededAdmin, 'email' | 'password'>,
    ip?: string,
  ): Promise<string> {
    const reply = await request(`${API}/auth/login`, {
      method: 'POST',
      body: { email: admin.email, password: admin.password },
      ip,
    });
    if (reply.status !== 200) {
      throw new Error(`Test login failed (${reply.status}): ${JSON.stringify(reply.body)}`);
    }
    const cookie = reply.setCookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
    if (!cookie) throw new Error('Login did not set the session cookie');
    return cookie.split(';')[0]!;
  }

  async function seedCategory(name = 'Test Category', order = 0) {
    return BlogCategory.create({ name, slug: name.toLowerCase().replaceAll(' ', '-'), order });
  }

  async function stop(): Promise<void> {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  }

  return {
    base,
    webOrigin,
    dbName,
    request,
    seedAdmin,
    loginAs,
    seedCategory,
    stop,
    logger,
    models: {
      AdminUser,
      AdminSession,
      AdminActivityLog,
      PasswordResetToken,
      BlogCategory,
      BlogPost,
      ContactSubmission,
      QuotationSubmission,
      Media,
    },
  };
}

export type Api = Awaited<ReturnType<typeof startApi>>;
