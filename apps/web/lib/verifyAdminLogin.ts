'use server';

import { getAdminSession } from '@/lib/adminSession.server';

/** Check the cookie received on the web origin using the dashboard's own session lookup. */
export async function verifyAdminLogin(adminId: string) {
  const admin = await getAdminSession();
  if (!admin || admin.id !== adminId) return null;
  return admin.mustChangePassword ? '/admin/change-password' : '/admin';
}
