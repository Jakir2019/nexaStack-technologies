import {
  changePasswordSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '@nexastack/shared';
import type { Request, Response } from 'express';

import {
  clearedSessionCookieOptions,
  requireDashboardCookieScope,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../lib/cookies.js';
import { UnauthenticatedError } from '../lib/errors.js';
import { sendSuccess } from '../lib/respond.js';
import { validatedBody, validatedQuery } from '../middleware/validate.js';
import { auditLogQuerySchema } from '../schemas/adminAudit.js';
import { queryAdminActivity } from '../services/adminActivityLog.service.js';
import * as authService from '../services/auth.service.js';

/** Never logged, never returned — just read once per request to build the audit context. */
function requestContext(req: Request): authService.RequestContext {
  return { ipAddress: req.ip ?? 'unknown', userAgent: req.headers['user-agent'] };
}

function clearLegacySessionCookie(req: Request, res: Response): void {
  const { domain, ...hostOnly } = clearedSessionCookieOptions();
  // Retire an earlier API-host-only cookie before issuing the domain cookie. Browsers
  // can otherwise send both under the same name and Express may read the older session.
  if (domain && req.cookies?.[SESSION_COOKIE_NAME]) {
    res.clearCookie(SESSION_COOKIE_NAME, hostOnly);
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = validatedBody(res, loginSchema);
  requireDashboardCookieScope(req.hostname, req.headers.origin);
  const result = await authService.login(input, requestContext(req));

  clearLegacySessionCookie(req, res);
  res.cookie(SESSION_COOKIE_NAME, result.token, sessionCookieOptions());
  // The token is set as an HTTP-only cookie, never returned in the body — the browser never
  // needs to read it directly, and it must not end up in application-level JS or logs.
  sendSuccess(res, { admin: result.admin }, 200);
}

export async function logout(req: Request, res: Response): Promise<void> {
  if (req.sessionId) {
    await authService.logout(req.sessionId, req.admin ?? null, requestContext(req));
  }
  clearLegacySessionCookie(req, res);
  res.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions());
  sendSuccess(res, { loggedOut: true }, 200);
}

/** Used by `apps/web`'s protected-route layout (server-to-server, forwarding the browser's
 * cookie explicitly) to check whether the current session is valid, without a local JWT decode
 * on the web side — see the Admin Authentication task's cross-origin architecture notes. */
export function getSession(req: Request, res: Response): void {
  // requireSession has already run; reaching here means req.admin is set.
  sendSuccess(res, { admin: req.admin }, 200);
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  const input = validatedBody(res, passwordResetRequestSchema);
  await authService.requestPasswordReset(input, requestContext(req));
  // Same response whether or not the email belongs to a real account — see auth.service.ts.
  sendSuccess(res, { requested: true }, 200);
}

export async function confirmPasswordReset(req: Request, res: Response): Promise<void> {
  const input = validatedBody(res, passwordResetConfirmSchema);
  await authService.confirmPasswordReset(input, requestContext(req));
  sendSuccess(res, { reset: true }, 200);
}

/**
 * Changes the signed-in admin's own password: the forced first-login change and a voluntary one. The
 * session making the request stays signed in; the account's others are revoked (see the service).
 */
export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.admin || !req.sessionId) throw new UnauthenticatedError();
  const input = validatedBody(res, changePasswordSchema);
  const admin = await authService.changePassword(req.admin, req.sessionId, input, requestContext(req));
  sendSuccess(res, { admin }, 200);
}

/** The audit view's data source: filtered by event type and date, paginated. Needs `audit:view`. */
export async function listActivity(_req: Request, res: Response): Promise<void> {
  const { page, limit, ...filter } = validatedQuery(res, auditLogQuerySchema);
  sendSuccess(res, await queryAdminActivity(filter, page, limit), 200);
}
