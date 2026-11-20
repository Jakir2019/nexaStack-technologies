import { z } from 'zod';

/**
 * Environment configuration, validated once at startup. Import `env` instead of reading
 * `process.env` anywhere else. If validation fails the process exits with a message naming
 * every invalid variable.
 */

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Treat an empty string the same as an unset variable. */
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const requiredString = (hint: string) =>
  z.string({
    error: (issue) => (issue.input === undefined ? `is required but not set (${hint})` : hint),
  });

const envSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'test', 'production']).default('development'),
  ),

  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(4000)),

  CORS_ORIGINS: z.preprocess(
    emptyToUndefined,
    requiredString('comma-separated list of allowed origins, e.g. http://localhost:3000')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(
            z
              .url({
                protocol: /^https?$/,
                error: 'each origin must be an absolute http(s) URL; "*" is not allowed',
              })
              .transform((url) => new URL(url).origin),
          )
          .min(1, { error: 'must list at least one origin' }),
      ),
  ),

  MONGODB_URI: z.preprocess(
    emptyToUndefined,
    requiredString('MongoDB connection string').regex(/^mongodb(\+srv)?:\/\//, {
      error: 'must start with mongodb:// or mongodb+srv://',
    }),
  ),

  LOG_LEVEL: z.preprocess(emptyToUndefined, z.enum(LOG_LEVELS).default('info')),

  // REQUIRED. Signs and verifies admin session JWTs (root CLAUDE.md 11.3). No default — a
  // fallback secret baked into the app would defeat the point of a secret. Generate a long
  // random value per environment; never reuse the same one across dev/staging/production.
  JWT_SECRET: z.preprocess(
    emptyToUndefined,
    requiredString('a long random string, e.g. `openssl rand -hex 32`').min(32, {
      error: 'must be at least 32 characters — a short secret is brute-forceable',
    }),
  ),

  // REQUIRED. The public web app's origin, used only to build the password-reset link sent to
  // the admin (e.g. `${WEB_APP_URL}/admin/reset-password?token=...`). Distinct from
  // CORS_ORIGINS (which may list more than one origin) so this one, specific use has an
  // unambiguous value.
  WEB_APP_URL: z.preprocess(
    emptyToUndefined,
    z
      .url({
        protocol: /^https?$/,
        error: (issue) =>
          issue.input === undefined
            ? 'is required but not set (the public web app origin, e.g. http://localhost:3000)'
            : 'must be an absolute http(s) URL',
      })
      .transform((url) => new URL(url).origin),
  ),

  // Number of reverse-proxy hops in front of the API (Render: 1). Needed so rate limiting
  // sees the real client IP. 0 = trust none (local development).
  TRUST_PROXY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(0)),

  // OPTIONAL. Cloudinary credentials, used only to retrieve quotation attachments for the admin
  // (lib/cloudinary.ts). Uploads are made by apps/web with its own copy of these values. When any
  // of the three is unset the API still runs; attachments are then listed but cannot be
  // downloaded (503), instead of pretending to work. Must be the SAME Cloudinary account as
  // apps/web's. Never prefix with NEXT_PUBLIC_, never commit real values.
  CLOUDINARY_CLOUD_NAME: z.preprocess(emptyToUndefined, z.string().optional()),
  CLOUDINARY_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  CLOUDINARY_API_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (result.success) return result.data;

  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  console.error(
    [
      'Invalid environment configuration:',
      ...lines,
      '',
      'Set the variables above in the API environment. For local development, copy apps/api/.env.example to apps/api/.env.local.',
    ].join('\n'),
  );
  process.exit(1);
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
