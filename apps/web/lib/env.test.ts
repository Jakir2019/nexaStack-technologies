import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';

// Each subprocess imports the actual environment module afresh. No .env files,
// network requests, database connections or real credentials are used.
function loadEnvironment(apiUrl: string | undefined, production = true) {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: production ? 'production' : 'development',
    NEXT_PUBLIC_SITE_URL: 'https://web.example.test',
    NEXT_PUBLIC_API_URL: apiUrl ?? '',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
    GOOGLE_SITE_VERIFICATION: '',
  };
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `const { env } = await import('./lib/env.ts');
       const { adminApiFetch, adminApiFormFetch } = await import('./lib/adminApi.ts');
       const requests = [];
       globalThis.fetch = async (url, init) => {
         requests.push({ url, credentials: init.credentials });
         return new Response('{}');
       };
       await adminApiFetch('/api/v1/auth/session');
       await adminApiFormFetch('/api/v1/admin/media', 'POST', new FormData());
       console.log(JSON.stringify({ origin: env.NEXT_PUBLIC_API_URL, requests }));`,
    ],
    { cwd: path.resolve(import.meta.dirname, '..'), env: childEnv, encoding: 'utf8' },
  );
}

describe('Express API origin configuration', () => {
  for (const input of ['https://api.example.test', 'https://api.example.test/']) {
    it(`constructs one API prefix from ${input}`, () => {
      const result = loadEnvironment(input);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        origin: 'https://api.example.test',
        requests: [
          { url: 'https://api.example.test/api/v1/auth/session', credentials: 'include' },
          { url: 'https://api.example.test/api/v1/admin/media', credentials: 'include' },
        ],
      });
    });
  }

  for (const suffix of ['/api/v1', '/api/v1/', '/other', '?version=1', '#api']) {
    it(`rejects an origin with ${suffix} before requests can be made`, () => {
      const result = loadEnvironment(`https://api.example.test${suffix}`);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /NEXT_PUBLIC_API_URL: must be an http\(s\) origin only/);
      assert.equal(result.stdout, '');
    });
  }

  it('requires the API origin in production', () => {
    const result = loadEnvironment(undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /NEXT_PUBLIC_API_URL/);
  });

  for (const input of [
    'not-a-url',
    'ftp://api.example.test',
    'https://user:dummy@api.example.test',
  ]) {
    it('rejects malformed, non-HTTP or credential-bearing configuration safely', () => {
      const result = loadEnvironment(input);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Invalid web environment configuration/);
      assert.equal(result.stdout, '');
    });
  }

  it('preserves the localhost development default', () => {
    const result = loadEnvironment(undefined, false);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).origin, 'http://localhost:4000');
  });
});
