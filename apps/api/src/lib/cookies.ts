import type { CookieOptions } from 'express';

import { env, isProduction } from '../config/env.js';
import { SESSION_LIFETIME_MS } from './sessionPolicy.js';

export const SESSION_COOKIE_NAME = 'nexastack_admin_session';

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
