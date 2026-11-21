import type { CookieOptions } from 'express';

import { env, isProduction } from '../config/env.js';
import { ServiceUnavailableError } from './errors.js';
import { SESSION_LIFETIME_MS } from './sessionPolicy.js';

export { ADMIN_SESSION_COOKIE as SESSION_COOKIE_NAME } from '@nexastack/shared';

/** CSRF has already checked Origin. This check can only refuse a misconfigured dashboard login. */
export function requireDashboardCookieScope(hostname: string, origin: string | undefined): void {
  if (origin !== env.WEB_APP_URL || (!isProduction && !env.COOKIE_DOMAIN)) return;
  const apiHost = env.PUBLIC_API_URL ? new URL(env.PUBLIC_API_URL).hostname : hostname.toLowerCase();
  const webHost = new URL(origin).hostname;
  const domain = env.COOKIE_DOMAIN;
  // The env schema already checks that a configured domain covers the web host.
  if (!domain && apiHost !== webHost) {
    throw new ServiceUnavailableError(
      'Dashboard sign-in is unavailable. Set COOKIE_DOMAIN on the API for the separate dashboard and API hosts.',
    );
  }
  if (domain && apiHost !== domain && !apiHost.endsWith(`.${domain}`)) {
    throw new ServiceUnavailableError(
      'Dashboard sign-in is unavailable. Check the browser-facing PUBLIC_API_URL and COOKIE_DOMAIN on the API.',
    );
  }
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction || Boolean(env.COOKIE_DOMAIN),
    ...(env.COOKIE_DOMAIN && { domain: env.COOKIE_DOMAIN }),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_LIFETIME_MS,
  };
}

/** Options for clearing the cookie must match the options it was set with (aside from maxAge),
 * or some browsers won't recognise it as the same cookie to remove. */
export function clearedSessionCookieOptions(): CookieOptions {
  const { maxAge: _maxAge, ...rest } = sessionCookieOptions();
  return rest;
}
