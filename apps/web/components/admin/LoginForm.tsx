'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  loginSchema,
  type ApiResponse,
  type AuthenticatedAdmin,
  type LoginInput,
} from '@nexastack/shared';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';

import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/FieldError';
import { Input } from '@/components/ui/Input';
import { adminApiFetch } from '@/lib/adminApi';
import { verifyAdminLogin } from '@/lib/verifyAdminLogin';

interface LoginFormFields {
  email: string;
  password: string;
}

const DEFAULT_VALUES: LoginFormFields = { email: '', password: '' };
const LABEL_CLASSES = 'block text-label font-medium text-primary';

/**
 * Utility surface, not a marketing page (root CLAUDE.md admin auth brief, section 7): a plain
 * card, no gradient, no decorative motion — the same field/error conventions as `ContactForm`
 * (labels above fields, inline errors linked via `aria-describedby`), restrained everywhere
 * else. Calls apps/api directly (root CLAUDE.md 22.5) rather than a Next.js Route Handler.
 */
export function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormFields, unknown, LoginInput>({
    resolver: zodResolver(loginSchema) as unknown as Resolver<LoginFormFields, unknown, LoginInput>,
    defaultValues: DEFAULT_VALUES,
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);

    try {
      const response = await adminApiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const body = (await response.json()) as ApiResponse<{ admin: AuthenticatedAdmin }>;

      if (!body.success) {
        setServerError(body.error.message);
        return;
      }

      if (!response.ok) throw new Error('Sign-in failed');
      const session = await verifyAdminLogin(body.data.admin.id);
      if (!session.ok) {
        setServerError(session.message);
        return;
      }
      // A new document request also discards any signed-out App Router state.
      window.location.replace(session.destination);
    } catch {
      setServerError('Something went wrong signing in. Please check your connection and try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {serverError && (
        <p role="alert" className="rounded-field border border-error bg-surface px-4 py-3 text-body text-error">
          {serverError}
        </p>
      )}

      <div>
        <label htmlFor="email" className={LABEL_CLASSES}>
          Email address
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          invalid={Boolean(errors.email)}
          aria-required="true"
          aria-describedby="email-error"
          className="mt-2"
          {...register('email')}
        />
        <FieldError id="email-error" message={errors.email?.message} />
      </div>

      <div>
        <label htmlFor="password" className={LABEL_CLASSES}>
          Password
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          invalid={Boolean(errors.password)}
          aria-required="true"
          aria-describedby="password-error"
          className="mt-2"
          {...register('password')}
        />
        <FieldError id="password-error" message={errors.password?.message} />
      </div>

      <p className="text-label text-secondary">
        <Link href="/admin/forgot-password" className="rounded-field text-primary-blue underline underline-offset-4 focus-ring hover:text-primary-blue-hover">
          Forgot your password?
        </Link>
      </p>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
