import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/admin/AuthCard';
import { LoginForm } from '@/components/admin/LoginForm';
import { getAdminSession } from '@/lib/adminSession.server';

// noindex is already inherited from app/(admin)/admin/layout.tsx's metadata export.
export const metadata: Metadata = {
  title: 'Admin Sign In',
};

export default async function AdminLoginPage() {
  const admin = await getAdminSession();
  if (admin) redirect(admin.mustChangePassword ? '/admin/change-password' : '/admin');

  return (
    <AuthCard title="Admin sign in" description="Sign in with your NexaStack admin account.">
      <LoginForm />
    </AuthCard>
  );
}
