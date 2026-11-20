'use server';

import { checkAdminSession } from '@/lib/adminSession.server';

/** Check the cookie received on the web origin using the dashboard's own session lookup. */
export async function verifyAdminLogin(adminId: string) {
  const session = await checkAdminSession();
  if (session.status === 'missing') {
    return {
      ok: false,
      message:
        'Sign-in was accepted, but the dashboard did not receive the session cookie. Check the browser cookie settings and the API cookie domain.',
    } as const;
  }
  if (session.status === 'unavailable') {
    return {
      ok: false,
      message: 'Sign-in was accepted, but the session service is unavailable. Try again shortly.',
    } as const;
  }
  if (session.status !== 'verified' || session.admin.id !== adminId) {
    return {
      ok: false,
      message: 'The session could not be confirmed for this account. Please sign in again.',
    } as const;
  }
  return {
    ok: true,
    destination: session.admin.mustChangePassword ? '/admin/change-password' : '/admin',
  } as const;
}
