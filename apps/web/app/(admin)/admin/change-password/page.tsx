import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/admin/AuthCard';
import { ChangePasswordForm } from '@/components/admin/ChangePasswordForm';
import { LogoutButton } from '@/components/admin/LogoutButton';
import { getAdminSession } from '@/lib/adminSession.server';

// noindex is already inherited from app/(admin)/admin/layout.tsx's metadata export.
export const metadata: Metadata = {
  title: 'Change Admin Password',
};

/**
 * Sits OUTSIDE the `(protected)` route group on purpose: that group's layout sends an account still on
 * a temporary password HERE, so this page cannot be behind it or the redirect would loop. It has its
 * own guard: no session means the sign-in page. Works for both the forced first-login change (the only
 * page such an account can reach, and the API refuses everything else) and a voluntary change.
 */
export default async function AdminChangePasswordPage() {
  const admin = await getAdminSession({ throwOnUnavailable: true });
  if (!admin) redirect('/admin/login');

  const forced = admin.mustChangePassword;

  return (
    <AuthCard
      title={forced ? 'Choose a new password' : 'Change password'}
      description={
        forced
          ? 'You signed in with a temporary password. Choose your own to continue. You will not be able to use the admin until you do.'
          : `Signed in as ${admin.email}. Other devices signed in to this account will be signed out.`
      }
    >
      <ChangePasswordForm forced={forced} />
      <div className="mt-6 border-t border-default pt-6">
        {forced ? (
          <LogoutButton />
        ) : (
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center rounded-field text-body text-primary-blue underline underline-offset-4 focus-ring hover:text-primary-blue-hover"
          >
            Back to the dashboard
          </Link>
        )}
      </div>
    </AuthCard>
  );
}
