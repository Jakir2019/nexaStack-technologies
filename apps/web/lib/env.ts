import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

/** Treat an empty string the same as an unset variable. */
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const siteUrl = z
  .url({
    protocol: /^https?$/,
    error: (issue) =>
      issue.input === undefined
        ? 'is required for production builds but not set'
        : 'must be an absolute http(s) URL',
  })
  .transform((url) => url.replace(/\/+$/, ''));

const webEnvSchema = z.object({
  // Required in production builds; defaults to localhost in development.
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    emptyToUndefined,
    isProduction ? siteUrl : siteUrl.default('http://localhost:3000'),
  ),
  // Optional: unset until Cloudflare Turnstile is configured (CLAUDE.md 22, /contact form).
  // When unset, the Turnstile widget does not render and /api/contact skips verification.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  // Optional: the verification code Google Search Console issues once a real domain (CLAUDE.md
  // 22.1) is registered as a property. Not a secret (it's meant to be public in a meta tag) —
  // when unset, the root layout renders no verification tag at all rather than an empty one.
  GOOGLE_SITE_VERIFICATION: z.preprocess(emptyToUndefined, z.string().optional()),
  // REQUIRED. The Express API's origin (no trailing slash) — root CLAUDE.md 22.5 reserves
  // apps/api for the admin interface, so the admin login form calls it directly rather than
  // proxying through a Next.js Route Handler. Not a secret (it's the same origin CORS already
  // allowlists), so one NEXT_PUBLIC_* value covers both the client-side login fetch and the
  // server-side session check in app/(admin)/admin/(protected)/layout.tsx.
  NEXT_PUBLIC_API_URL: z
    .preprocess(
      emptyToUndefined,
      isProduction
        ? z.url({ protocol: /^https?$/, error: 'is required for production builds but not set' })
        : z.url({ protocol: /^https?$/ }).default('http://localhost:4000'),
    )
    .transform((url) => url.replace(/\/+$/, ''))
    .refine((value) => {
      // Callers already supply /api/v1. A path, query or fragment here changes the
      // requested endpoint; reject it instead of silently sending requests to a 404.
      const url = URL.parse(value);
      if (!url) return false;
      return (
        url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password &&
        !value.includes('?') &&
        !value.includes('#')
      );
    }, 'must be an http(s) origin only, without /api/v1, another path, query, fragment or credentials'),
});

// NEXT_PUBLIC_* variables must be referenced literally so Next.js can inline them.
const parsed = webEnvSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  GOOGLE_SITE_VERIFICATION: process.env.GOOGLE_SITE_VERIFICATION,
});

if (!parsed.success) {
  const lines = parsed.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  throw new Error(`Invalid web environment configuration:\n${lines.join('\n')}`);
}

export const env = parsed.data;
