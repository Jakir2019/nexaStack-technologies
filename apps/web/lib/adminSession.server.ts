import {
  ADMIN_SESSION_COOKIE,
  type ApiResponse,
  type AuthenticatedAdmin,
  type Permission,
} from '@nexastack/shared';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { env } from '@/lib/env';

export type { AuthenticatedAdmin };

type SessionCheck =
  | { status: 'verified'; admin: AuthenticatedAdmin }
  | { status: 'missing' | 'rejected' | 'unavailable' };

/** Share one uncached API verification among components in the same web request. */
export const checkAdminSession = cache(async (): Promise<SessionCheck> => {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return { status: 'missing' };

  try {
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/session`, {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}` },
      cache: 'no-store',
      redirect: 'error',
    });
    if (response.status === 401) return { status: 'rejected' };
    if (!response.ok) return { status: 'unavailable' };

    const body = (await response.json()) as ApiResponse<{ admin: AuthenticatedAdmin }>;
    if (!body.success || typeof body.data?.admin?.id !== 'string') {
      return { status: 'unavailable' };
    }
    return { status: 'verified', admin: body.data.admin };
  } catch {
    return { status: 'unavailable' };
  }
});

export async function getAdminSession({ throwOnUnavailable = false } = {}): Promise<AuthenticatedAdmin | null> {
  const check = await checkAdminSession();
  // Route guards have a retry boundary. Other callers already handle a missing identity.
  if (throwOnUnavailable && check.status === 'unavailable') {
    throw new Error('The admin session service is unavailable.');
  }
  return check.status === 'verified' ? check.admin : null;
}

/**
 * Whether the signed-in admin holds a capability, for deciding what to SHOW. This is user-experience
 * only (root CLAUDE.md 11.3: hiding a button is not authorisation): every action is checked again by
 * the API on the endpoint itself, whatever this returns.
 */
export function can(
  admin: Pick<AuthenticatedAdmin, 'permissions'> | null | undefined,
  permission: Permission,
): boolean {
  return admin ? admin.permissions.includes(permission) : false;
}

/** One line of the dashboard's recent-activity feed. */
export interface AdminActivityEntry {
  id: string;
  eventType: string;
  attemptedEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}
