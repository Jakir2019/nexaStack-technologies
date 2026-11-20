import type { CookieOptions } from 'express';

import { env, isProduction } from '../config/env.js';
import { ServiceUnavailableError } from './errors.js';
import { SESSION_LIFETIME_MS } from './sessionPolicy.js';

export { ADMIN_SESSION_COOKIE as SESSION_COOKIE_NAME } from '@nexastack/shared';

/** CSRF has already checked Origin. This check can only refuse a misconfigured dashboard login. */
export function requireDashboardCookieScope(hostname: string, origin: string | undefined): void {
  if (origin !== env.WEB_APP_URL || (!isProduction && !env.COOKIE_DOMAIN)) return;
  const apiHost = hostname.toLowerCase();
  const webHost = new URL(origin).hostname;
  const domain = env.COOKIE_DOMAIN;
  // The env schema already checks that a configured domain covers the web host.
  const usable = domain
    ? apiHost === domain || apiHost.endsWith(`.${domain}`)
    : apiHost === webHost;
  if (!usable) {
    throw new ServiceUnavailableError(
      'Dashboard sign-in is unavailable. The site operator must check the API cookie domain.',
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
