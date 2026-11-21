import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { it } from 'node:test';

const web = 'https://nexastacktechnologies.com';
const api = 'https://api.nexastacktechnologies.com';
const domain = 'nexastacktechnologies.com';

// Each case loads the real startup schema in a fresh process. No database or network access.
function check(settings: NodeJS.ProcessEnv, requestHost = 'internal.test') {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import { requireDashboardCookieScope, sessionCookieOptions } from './src/lib/cookies.ts';
    try {
      requireDashboardCookieScope(process.env.TEST_HOST, process.env.WEB_APP_URL);
      const { domain, secure } = sessionCookieOptions();
      console.log(JSON.stringify({ domain: domain ?? null, secure }));
    } catch (error) {
      console.log(JSON.stringify({ status: error.statusCode }));
    }
  `,
    ],
    {
      cwd: new URL('../../', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        WEB_APP_URL: web,
        CORS_ORIGINS: web,
        PUBLIC_API_URL: api,
        COOKIE_DOMAIN: domain,
        JWT_SECRET: 'x'.repeat(40),
        TEST_HOST: requestHost,
        MONGODB_URI: 'mongodb://127.0.0.1:1/cookies_test',
        ...settings,
      },
    },
  );
}

it('uses the public API origin behind a proxy and normalizes the explicit domain', () => {
  const result = check({ COOKIE_DOMAIN: ' .NEXASTACKTECHNOLOGIES.COM ' });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { domain, secure: true });
});

it('retains the request-host fallback for a direct deployment', () => {
  const result = check({ PUBLIC_API_URL: '' }, 'api.nexastacktechnologies.com');
  assert.deepEqual(JSON.parse(result.stdout), { domain, secure: true });
});

it('refuses a public API outside the configured cookie domain, even if the proxy host matches', () => {
  const result = check({ PUBLIC_API_URL: 'https://other.test' }, domain);
  assert.deepEqual(JSON.parse(result.stdout), { status: 503 });
});

it('keeps a host-only cookie for local development', () => {
  const result = check(
    {
      NODE_ENV: 'development',
      WEB_APP_URL: 'http://localhost:3000',
      COOKIE_DOMAIN: '',
      PUBLIC_API_URL: '',
    },
    'localhost',
  );
  assert.deepEqual(JSON.parse(result.stdout), { domain: null, secure: false });
});

for (const [key, value] of [
  ['COOKIE_DOMAIN', '*.nexastacktechnologies.com'],
  ['COOKIE_DOMAIN', 'other.test'],
  ['PUBLIC_API_URL', 'http://api.nexastacktechnologies.com'],
  ['PUBLIC_API_URL', api + '/api/v1'],
  ['PUBLIC_API_URL', 'invalid'],
] as const) {
  it(`rejects invalid ${key} configuration (${value}) at startup`, () => {
    const result = check({ [key]: value });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`Invalid environment configuration:[\\s\\S]*${key}`));
  });
}
