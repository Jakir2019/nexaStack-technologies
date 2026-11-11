import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import type { ApiFailure, ApiResponse } from '@nexastack/shared';

// Exercise the real middleware/router stack without loading .env or connecting to MongoDB.
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/nexastack_test';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.WEB_APP_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.TRUST_PROXY = '0';

const { createApp } = await import('../app.js');
let server: Server;
let origin: string;

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server = createApp().listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve()));
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
});

function request(path: string, init?: RequestInit) {
  return fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
}

describe('API routing contract', () => {
  it('serves liveness independently of database readiness', async () => {
    const response = await request('/health');
    assert.equal(response.status, 200);
    const body = (await response.json()) as ApiResponse<{ status: string }>;
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');

    const ready = await request('/health/ready');
    assert.equal(ready.status, 503);
    assert.equal(((await ready.json()) as ApiFailure).error.code, 'SERVICE_UNAVAILABLE');
  });

  for (const path of [
    '/',
    '/api/v1',
    '/api/v1/health',
    '/api/v1/api/v1/auth/session',
    '/auth/session',
    '/api/v1/no-such-route',
    '/api/v1/auth/login', // Browser navigation is GET; login requires POST.
  ]) {
    it(`GET ${path} preserves the exact unmatched-route response`, async () => {
      const response = await request(path);
      assert.equal(response.status, 404);
      assert.match(response.headers.get('content-type') ?? '', /application\/json/);
      assert.ok(response.headers.get('x-request-id'));
      assert.deepEqual(await response.json(), {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'This endpoint does not exist. Check the method and URL.',
        },
      });
    });
  }

  it('reaches POST login validation with the correct prefix and CSRF headers', async () => {
    const response = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
        'X-Requested-With': 'nexastack-admin',
      },
      body: '{}',
    });
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as ApiFailure).error.code, 'VALIDATION_ERROR');
  });

  for (const path of [
    '/api/v1/auth/session',
    '/api/v1/admin/dashboard/stats',
    '/api/v1/admin/enquiries',
    '/api/v1/admin/quotations',
    '/api/v1/admin/blog/posts',
    '/api/v1/admin/media',
    '/api/v1/admin/users',
  ]) {
    it(`GET ${path} remains protected without a session`, async () => {
      const response = await request(path);
      assert.equal(response.status, 401);
      assert.equal(((await response.json()) as ApiFailure).error.code, 'UNAUTHENTICATED');
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    });
  }

  it('allows the configured browser preflight with credentials and CSRF header', async () => {
    const response = await request('/api/v1/auth/login', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-requested-with',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.match(response.headers.get('access-control-allow-headers') ?? '', /x-requested-with/i);
  });
});
