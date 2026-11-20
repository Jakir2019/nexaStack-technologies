import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AdminNav } from '@/components/admin/AdminNav';
import { LogoutButton } from '@/components/admin/LogoutButton';
import { ROLE_LABELS } from '@/lib/adminRoles';
import { getAdminSession } from '@/lib/adminSession.server';

export interface ProtectedAdminLayoutProps {
  children: ReactNode;
}

/**
 * The real auth guard for everything under `(protected)` — `/admin/login`,
 * `/admin/forgot-password`, `/admin/reset-password` and `/admin/change-password` sit outside this route
 * group specifically so they're reachable without a session (or, for the last, without the rest of the
 * admin). A server-side check (not a client-side redirect after render) so a protected page's content is
 * never sent to an unauthenticated browser in the first place.
 *
 * An account still on its TEMPORARY password is sent to the change-password screen and can go nowhere
 * else. That is also enforced by the API (every route but changing the password answers 403
 * PASSWORD_CHANGE_REQUIRED), so this redirect is the courtesy and the API is the boundary.
 *
 * Minimal by design: an identity line, a small nav (one link per admin area this admin may use) and a
 * logout button. It is not a sidebar; add a link to `lib/adminNav.ts` when a new area ships.
 */
export default async function ProtectedAdminLayout({ children }: Readonly<ProtectedAdminLayoutProps>) {
  const admin = await getAdminSession({ throwOnUnavailable: true });
  if (!admin) redirect('/admin/login');
  if (admin.mustChangePassword) redirect('/admin/change-password');

  return (
    <div className="page-container section-y">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-default pb-4">
        <div>
          <p className="text-label font-semibold text-primary">NexaStack Admin</p>
          <p className="text-label text-secondary">
            {admin.email} · {ROLE_LABELS[admin.role]}
          </p>
        </div>
        <AdminNav permissions={admin.permissions} />
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/change-password"
            className="inline-flex min-h-11 items-center rounded-field px-3 text-body text-secondary focus-ring hover:bg-surface-hover hover:text-primary"
          >
            Change password
          </Link>
          <LogoutButton />
        </div>
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
