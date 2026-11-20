import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { it } from 'node:test';
import { promisify } from 'node:util';

import { assertSafeTestUri } from '../../../../scripts/lib/mongod.mjs';
import { API, startApi } from './support/harness.js';

const run = promisify(execFile);

it('checks the target, arbitrates concurrent seeds, preserves the winner and authenticates it', async () => {
  const api = await startApi();
  try {
    // startApi sets this only after constructing a random database on the throwaway server.
    const uri = process.env.MONGODB_URI!;
    assertSafeTestUri(uri);
    const target = new URL(uri).host + '/' + api.dbName;
    const password = ' Fixture-Password-123 ';
    const command = (
      args: string[],
      email = 'First@Example.com',
      secret = password,
      testUri = uri,
    ) => {
      assertSafeTestUri(testUri);
      return run(process.execPath, ['--import', 'tsx', 'scripts/seed-admin.ts', ...args], {
        cwd: new URL('../../', import.meta.url),
        env: {
          ...process.env,
          MONGODB_URI: testUri,
          ADMIN_SEED_EMAIL: email,
          ADMIN_SEED_PASSWORD: secret,
        },
      });
    };

    const client = api.models.AdminUser.db.getClient();
    const emptyDb = client.db('empty_' + api.dbName);
    const emptyUri = new URL(uri);
    emptyUri.pathname = '/' + emptyDb.databaseName;
    const check = await command(['--check'], '', '', emptyUri.href);
    assert.match(check.stdout, /adminusers: 0/);
    assert.deepEqual(await emptyDb.listCollections().toArray(), []);
    await assert.rejects(command([]));
    await assert.rejects(command(['--target', 'wrong.example/wrong']));
    await assert.rejects(command(['--target', target], 'broken-email'));
    await assert.rejects(command(['--target', target], 'first@example.com', 'short'));
    await assert.rejects(command(['--target', target], 'first@example.com', '界'.repeat(25)));
    assert.equal(await api.models.AdminUser.countDocuments(), 0);

    const pair = await Promise.all([
      command(['--target', target]),
      command(['--target', target], ' Second@Example.com '),
    ]);
    assert.equal(
      pair.filter(({ stdout }) => stdout.includes('Created the active super_admin')).length,
      1,
    );
    const admin = await api.models.AdminUser.findOne().select('+passwordHash').orFail();
    assert.equal(admin.role, 'super_admin');
    assert.equal(admin.status, 'active');
    assert.equal(admin.mustChangePassword, false);
    assert.match(admin.passwordHash, /^\$2[ab]\$12\$/);

    await command(['--target', target], admin.email, 'Different-Password-123');
    assert.match((await command(['--check'])).stdout, /adminusers: 1/);
    const cookie = await api.loginAs({ email: admin.email.toUpperCase(), password });
    assert.equal((await api.request(`${API}/auth/session`, { cookie })).status, 200);
  } finally {
    await api.stop();
  }
});
