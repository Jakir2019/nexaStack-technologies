import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';

import { assertSafeTestUri, startMongod } from '../../scripts/lib/mongod.mjs';

import { api, login } from './support/api';
import {
  ADMINS,
  API_PORT,
  API_URL,
  AUTH_DIR,
  STATE_FILE,
  TURNSTILE_TEST_SECRET_KEY,
  TURNSTILE_TEST_SITE_KEY,
  WEB_PORT,
  WEB_URL,
  authFile,
  ROLES,
  type E2eState,
} from './support/env';

/**
 * Boots the WHOLE stack for the browser tier, hermetically:
 *
 *   throwaway mongod -> Express API (real, NODE_ENV=test) -> seed accounts + content through the API
 *   -> `next build` + `next start` (production mode: caching behaviour only shows there) -> signed-in browser
 *   state for each role.
 *
 * It never reads a `.env*` file's values and never touches Atlas: both servers get an explicit environment
 * (unrelated variables are blanked so a developer's `.env.local` cannot leak in), and the database is a
 * loopback `_test` database that is deleted afterwards. `apps/web/.next` is overwritten by the build.
 */

const root = path.resolve(import.meta.dirname, '..', '..');
const webDir = path.join(root, 'apps', 'web');
const apiDir = path.join(root, 'apps', 'api');
const logDir = path.join(import.meta.dirname, '.logs');

const children: ChildProcess[] = [];

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function waitFor(url: string, label: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `${label} did not become ready at ${url} within ${timeoutMs / 1000}s (${lastError}). See apps/e2e/.logs/.`,
  );
}

function run(
  label: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  keepRunning: boolean,
): Promise<void> | ChildProcess {
  mkdirSync(logDir, { recursive: true });
  const log = createWriteStream(path.join(logDir, `${label}.log`));
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  if (keepRunning) {
    children.push(child);
    return child;
  }
  return new Promise<void>((resolve, reject) => {
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${label} exited with code ${code}. See apps/e2e/.logs/${label}.log`)),
    );
  });
}

async function probeTurnstile(): Promise<boolean> {
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/api.js', {
      signal: AbortSignal.timeout(6000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  for (const port of [WEB_PORT, API_PORT]) {
    if (!(await isPortFree(port)))
      throw new Error(
        `Port ${port} is already in use. Stop whatever is on it, or set E2E_WEB_PORT / E2E_API_PORT.`,
      );
  }

  rmSync(logDir, { recursive: true, force: true });
  mkdirSync(AUTH_DIR, { recursive: true });

  const mongod = await startMongod();
  const dbName = `nexastack_e2e_${randomBytes(4).toString('hex')}_test`;
  const mongoUri = `${mongod.uri}/${dbName}`;
  assertSafeTestUri(mongoUri);

  const teardown = async () => {
    for (const child of children) child.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await mongod.stop();
  };

  try {
    const jwtSecret = randomBytes(32).toString('hex');

    const apiEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'test', // not "production": a Secure cookie would be dropped by WebKit over http://localhost
      PORT: String(API_PORT),
      CORS_ORIGINS: WEB_URL,
      WEB_APP_URL: WEB_URL,
      MONGODB_URI: mongoUri,
      JWT_SECRET: jwtSecret,
      LOG_LEVEL: 'warn',
      TRUST_PROXY: '1',
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
      RESEND_API_KEY: '',
      ADMIN_SEED_EMAIL: ADMINS.super_admin.email,
      ADMIN_SEED_PASSWORD: ADMINS.super_admin.password,
    };

    // 1. The real API, and the real first-admin script.
    run('api', ['--import', 'tsx', 'src/index.ts'], apiDir, apiEnv, true);
    await waitFor(`${API_URL}/health/ready`, 'the API');
    await run('seed-admin', ['--import', 'tsx', 'scripts/seed-admin.ts'], apiDir, apiEnv, false);

    // 2. The other two roles, created the way a real super_admin does it: temporary password, forced change.
    const superCookie = await login(ADMINS.super_admin.email, ADMINS.super_admin.password);
    const cookies: Record<string, string> = { super_admin: superCookie };
    for (const role of ['admin', 'content_editor'] as const) {
      const created = await api('/admin/users', {
        method: 'POST',
        cookie: superCookie,
        body: { email: ADMINS[role].email, role },
      });
      if (created.status !== 201)
        throw new Error(
          `Creating ${role} failed: ${created.status} ${JSON.stringify(created.body)}`,
        );
      const temp = created.body.data.temporaryPassword as string;
      const tempCookie = await login(ADMINS[role].email, temp);
      const changed = await api('/auth/change-password', {
        method: 'POST',
        cookie: tempCookie,
        body: { currentPassword: temp, newPassword: ADMINS[role].password },
      });
      if (changed.status !== 200)
        throw new Error(
          `Changing ${role}'s password failed: ${changed.status} ${JSON.stringify(changed.body)}`,
        );
      cookies[role] = tempCookie; // the session survives the change
    }

    // 3. Content for the public site, BEFORE the web server starts (public blog reads are cached per process).
    const category = await api('/admin/blog/categories', {
      method: 'POST',
      cookie: superCookie,
      body: { name: 'E2E Category' },
    });
    if (category.status !== 201)
      throw new Error(`Creating the category failed: ${JSON.stringify(category.body)}`);
    const categoryId = category.body.data.category.id as string;
    const makePost = async (title: string, status: 'published' | 'archived' | 'draft') => {
      const created = await api('/admin/blog/posts', {
        method: 'POST',
        cookie: superCookie,
        body: {
          title,
          excerpt: `A synthetic excerpt for the ${status} end-to-end post.`,
          categoryId,
          tags: ['e2e'],
          contentMarkdown: `## Synthetic heading\n\nSynthetic body for the ${status} end-to-end post, with **bold** text and a [safe link](https://example.com).`,
          featured: false,
        },
      });
      if (created.status !== 201)
        throw new Error(`Creating "${title}" failed: ${JSON.stringify(created.body)}`);
      const post = created.body.data.post as { id: string; slug: string };
      if (status !== 'draft') {
        const changed = await api(`/admin/blog/posts/${post.id}/status`, {
          method: 'POST',
          cookie: superCookie,
          body: { status },
        });
        if (changed.status !== 200)
          throw new Error(
            `Setting "${title}" to ${status} failed: ${JSON.stringify(changed.body)}`,
          );
      }
      return { id: post.id, slug: post.slug, title };
    };
    const state: E2eState = {
      turnstileReachable: await probeTurnstile(),
      categoryId,
      publishedPost: await makePost('E2E published post', 'published'),
      draftPost: await makePost('E2E draft post', 'draft'),
      archivedPost: await makePost('E2E archived post', 'archived'),
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    // 4. The real web app, production build, pointed at the same throwaway database and API.
    const webEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SITE_URL: WEB_URL,
      NEXT_PUBLIC_API_URL: API_URL,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
      TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET_KEY,
      MONGODB_URI: mongoUri,
      GOOGLE_SITE_VERIFICATION: '',
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
      RESEND_API_KEY: '',
    };
    const next = createRequire(path.join(webDir, 'package.json')).resolve('next/dist/bin/next');
    if (
      process.env['E2E_REUSE_BUILD'] === '1' &&
      existsSync(path.join(webDir, '.next', 'BUILD_ID'))
    ) {
      console.log(
        '[e2e] E2E_REUSE_BUILD=1: reusing apps/web/.next (it must have been built by this setup).',
      );
    } else {
      console.log('[e2e] building apps/web (production) ...');
      await run('web-build', [next, 'build'], webDir, webEnv, false);
    }
    run('web', [next, 'start', '-p', String(WEB_PORT)], webDir, webEnv, true);
    await waitFor(`${WEB_URL}/`, 'the web app');

    // 5. Signed-in browser state per role (cookies are per host, not per port, so one file serves web and API).
    for (const role of ROLES) {
      const value = cookies[role]!.split('=')[1]!;
      writeFileSync(
        authFile(role),
        JSON.stringify({
          cookies: [
            {
              name: 'nexastack_admin_session',
              value,
              domain: 'localhost',
              path: '/',
              expires: -1,
              httpOnly: true,
              secure: false,
              sameSite: 'Lax',
            },
          ],
          origins: [],
        }),
      );
    }
    if (!state.turnstileReachable)
      console.warn(
        '[e2e] challenges.cloudflare.com is unreachable: form tests that need the Turnstile widget will be SKIPPED, not passed.',
      );
    console.log('[e2e] stack ready.');
  } catch (error) {
    await teardown();
    for (const label of ['api', 'web-build', 'web']) {
      const file = path.join(logDir, `${label}.log`);
      if (existsSync(file))
        console.error(
          `--- tail of ${label}.log ---\n${readFileSync(file, 'utf8').split('\n').slice(-25).join('\n')}`,
        );
    }
    throw error;
  }

  return teardown;
}
