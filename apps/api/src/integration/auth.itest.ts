import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it, mock } from 'node:test';

import { API, SESSION_COOKIE, freshIp, startApi, type Api } from './support/harness.js';

/**
 * Admin authentication against the real app and a real database: the adversarial patterns proven by hand in
 * the Security and Admin Authentication tasks, now re-runnable. Wrong password, unknown account, suspended
 * account, brute force, forged and revoked sessions, and the whole password-reset flow including the email
 * hook (which is a hook, not delivery: no email provider exists, root CLAUDE.md 22 item 4).
 */

let api: Api;

before(async () => {
  api = await startApi('nexastack.test');
});

after(async () => {
  await api.stop();
});

afterEach(() => {
  mock.restoreAll();
});

const login = (body: unknown, ip = freshIp()) =>
  api.request(`${API}/auth/login`, { method: 'POST', body, ip });

describe('POST /auth/login', () => {
  it('signs in with the right password: envelope, HTTP-only cookie, no token or hash in the body, real session in the DB', async () => {
    const admin = await api.seedAdmin('admin');
    const reply = await login({ email: admin.email, password: admin.password });

    assert.equal(reply.status, 200);
    assert.equal(reply.body.success, true);
    assert.equal(reply.body.data.admin.email, admin.email);
    assert.equal(reply.body.data.admin.role, 'admin');

    const text = reply.text;
    assert.doesNotMatch(text, /passwordHash|\$2[aby]\$/, 'no password hash in the response');
    assert.doesNotMatch(
      text,
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./,
      'no JWT in the body: the token is only in the cookie',
    );

    const cookie = reply.setCookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
    assert.ok(cookie, 'a session cookie is set');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//i);
    const attributes = cookie.split('; ').slice(1);
    for (const expected of ['Domain=nexastack.test', 'Secure', 'Max-Age=28800']) {
      assert.ok(attributes.includes(expected), `missing cookie attribute ${expected}`);
    }

    const sessions = await api.models.AdminSession.find({ adminUserId: admin.id }).lean();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]!.revokedAt, null);
    const stored = await api.models.AdminUser.findById(admin.id).lean();
    assert.ok(stored?.lastLoginAt, 'lastLoginAt is recorded');
    assert.equal(
      await api.models.AdminActivityLog.countDocuments({
        adminUserId: admin.id,
        eventType: 'login_success',
      }),
      1,
    );
  });

  it('replaces the legacy API-host cookie and verifies the shared Super Admin session', async () => {
    const admin = await api.seedAdmin('super_admin');
    const reply = await api.request(`${API}/auth/login`, {
      method: 'POST',
      body: { email: admin.email, password: admin.password },
      cookie: `${SESSION_COOKIE}=stale`,
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.setCookies.length, 2);
    const [removed, issued] = reply.setCookies;
    assert.ok(removed && issued, 'received the legacy clearing cookie and the scoped session cookie');
    assert.ok(removed.startsWith(`${SESSION_COOKIE}=;`));
    assert.ok(removed.includes('Expires=Thu, 01 Jan 1970') && !removed.includes('Domain='));
    assert.ok(issued.includes('Domain=nexastack.test'));
    const cookie = issued.split(';')[0]!;
    const session = await api.request(`${API}/auth/session`, { cookie });
    assert.equal(session.status, 200);
    assert.equal(session.body.data.admin.role, 'super_admin');
    assert.equal(session.body.data.admin.mustChangePassword, false);
    assert.equal((await api.request(`${API}/admin/dashboard/stats`, { cookie })).status, 200);
    const logout = await api.request(`${API}/auth/logout`, { method: 'POST', cookie });
    assert.ok(logout.setCookies.some((c) => c.startsWith(`${SESSION_COOKIE}=;`) &&
      c.includes('Domain=nexastack.test') && c.includes('Expires=Thu, 01 Jan 1970')));
    assert.equal((await api.request(`${API}/auth/session`, { cookie })).status, 401);
  });

  it('is case-insensitive about the email address', async () => {
    const admin = await api.seedAdmin('admin');
    const reply = await login({ email: admin.email.toUpperCase(), password: admin.password });
    assert.equal(reply.status, 200);
  });

  it('refuses a wrong password, and gives an IDENTICAL response for a wrong password and an unknown account', async () => {
    const admin = await api.seedAdmin('admin');
    const wrongPassword = await login({ email: admin.email, password: 'Wrong-Password-999' });
    const unknownAccount = await login({
      email: 'nobody-here@example.com',
      password: 'Wrong-Password-999',
    });

    for (const reply of [wrongPassword, unknownAccount]) {
      assert.equal(reply.status, 401);
      assert.equal(reply.body.success, false);
      assert.equal(reply.body.error?.code, 'UNAUTHENTICATED');
      assert.equal(reply.setCookies.length, 0, 'no cookie on a failed login');
    }
    assert.deepEqual(
      wrongPassword.body,
      unknownAccount.body,
      'the response must not reveal which part was wrong',
    );
    assert.equal(await api.models.AdminSession.countDocuments({ adminUserId: admin.id }), 0);
    assert.ok(
      (await api.models.AdminActivityLog.countDocuments({ eventType: 'login_failure' })) >= 2,
      'failures are audit-logged',
    );
  });

  it('refuses a suspended account with 403 (after the right password) and creates no session', async () => {
    const admin = await api.seedAdmin('admin', { status: 'suspended' });
    const reply = await login({ email: admin.email, password: admin.password });
    assert.equal(reply.status, 403);
    assert.equal(reply.body.error?.code, 'FORBIDDEN');
    assert.equal(reply.setCookies.length, 0);
    assert.equal(await api.models.AdminSession.countDocuments({ adminUserId: admin.id }), 0);
    // A suspended account with the WRONG password is not told it is suspended.
    const wrong = await login({ email: admin.email, password: 'Wrong-Password-999' });
    assert.equal(wrong.status, 401);
  });

  it('rejects malformed input with 400 and a field-level error, never a 500', async () => {
    const empty = await login({});
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error?.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(empty.body.error?.details));

    const badEmail = await login({ email: 'not-an-email', password: 'Long-Enough-1' });
    assert.equal(badEmail.status, 400);

    const malformedJson = await api.request(`${API}/auth/login`, {
      method: 'POST',
      rawBody: '{"email": ',
      ip: freshIp(),
    });
    assert.equal(malformedJson.status, 400);
    assert.equal(malformedJson.body.error?.code, 'INVALID_JSON');
  });

  it('cannot be logged into with NoSQL operator objects (the injected filter never becomes a query)', async () => {
    const admin = await api.seedAdmin('admin');
    for (const body of [
      { email: { $ne: null }, password: { $ne: null } },
      { email: admin.email, password: { $gt: '' } },
      { email: { $regex: '.*' }, password: 'Test-Password-1234' },
      { email: [admin.email], password: 'Test-Password-1234' },
    ]) {
      const reply = await login(body);
      assert.equal(reply.status, 400, JSON.stringify(body));
      assert.equal(reply.setCookies.length, 0);
    }
    assert.equal(await api.models.AdminSession.countDocuments({ adminUserId: admin.id }), 0);
  });

  it('is rate limited: 5 attempts per IP, then 429 in the envelope, without affecting another IP', async () => {
    const admin = await api.seedAdmin('admin');
    const attacker = freshIp();
    for (let i = 0; i < 5; i++) {
      const reply = await login({ email: admin.email, password: 'Wrong-Password-999' }, attacker);
      assert.equal(reply.status, 401, `attempt ${i + 1}`);
    }
    const blocked = await login({ email: admin.email, password: admin.password }, attacker);
    assert.equal(blocked.status, 429, 'even the CORRECT password is refused once the limit is hit');
    assert.equal(blocked.body.success, false);
    assert.equal(blocked.body.error?.code, 'RATE_LIMITED');
    assert.equal(blocked.setCookies.length, 0);

    const someoneElse = await login({ email: admin.email, password: admin.password }, freshIp());
    assert.equal(someoneElse.status, 200);
  });
});

describe('sessions: forged, tampered, revoked, expired', () => {
  it('GET /auth/session returns the signed-in admin, and 401 with no cookie', async () => {
    const admin = await api.seedAdmin('content_editor');
    const cookie = await api.loginAs(admin);
    const ok = await api.request(`${API}/auth/session`, { cookie });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.admin.email, admin.email);
    assert.equal(ok.body.data.admin.role, 'content_editor');

    const none = await api.request(`${API}/auth/session`);
    assert.equal(none.status, 401);
    assert.equal(none.body.error?.code, 'UNAUTHENTICATED');
  });

  it('refuses a garbage, a tampered and a foreign-signed token', async () => {
    const admin = await api.seedAdmin('admin');
    const good = (await api.loginAs(admin)).split('=')[1]!;
    const [header, payload, signature] = good.split('.') as [string, string, string];
    const tamperedSignature = `${header}.${payload}.${signature.slice(0, -2)}${signature.endsWith('AA') ? 'BB' : 'AA'}`;
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;

    for (const token of [
      'garbage',
      '',
      good.slice(0, -5),
      tamperedSignature,
      noneAlg,
      `${header}.${payload}`,
    ]) {
      const reply = await api.request(`${API}/auth/session`, {
        cookie: `${SESSION_COOKIE}=${token}`,
      });
      assert.equal(reply.status, 401, `token "${token.slice(0, 20)}..." must be refused`);
    }
  });

  it('logout revokes the session for real: the SAME cookie stops working, and the record is marked revoked', async () => {
    const admin = await api.seedAdmin('admin');
    const cookie = await api.loginAs(admin);
    assert.equal((await api.request(`${API}/auth/session`, { cookie })).status, 200);

    const out = await api.request(`${API}/auth/logout`, { method: 'POST', cookie });
    assert.equal(out.status, 200);
    assert.equal(out.body.data.loggedOut, true);
    const cleared = out.setCookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
    assert.ok(
      cleared && /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(cleared),
      'the cookie is cleared',
    );

    assert.equal(
      (await api.request(`${API}/auth/session`, { cookie })).status,
      401,
      'the old cookie is dead',
    );
    const session = await api.models.AdminSession.findOne({ adminUserId: admin.id }).lean();
    assert.ok(session?.revokedAt, 'the session record is revoked, not just the cookie cleared');
  });

  it('an expired session is refused', async () => {
    const admin = await api.seedAdmin('admin');
    const cookie = await api.loginAs(admin);
    await api.models.AdminSession.updateMany(
      { adminUserId: admin.id },
      { expiresAt: new Date(Date.now() - 1000) },
    );
    assert.equal((await api.request(`${API}/auth/session`, { cookie })).status, 401);
  });

  it('suspending an account cuts off its existing session on the very next request', async () => {
    const admin = await api.seedAdmin('admin');
    const cookie = await api.loginAs(admin);
    assert.equal((await api.request(`${API}/auth/session`, { cookie })).status, 200);
    await api.models.AdminUser.updateOne({ _id: admin.id }, { status: 'suspended' });
    assert.equal((await api.request(`${API}/auth/session`, { cookie })).status, 401);
  });
});

describe('a temporary password (mustChangePassword)', () => {
  it('blocks every route except changing the password, on the server (403 PASSWORD_CHANGE_REQUIRED)', async () => {
    const admin = await api.seedAdmin('admin', { mustChangePassword: true });
    const cookie = await api.loginAs(admin);

    const blocked = await api.request(`${API}/admin/enquiries`, { cookie });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error?.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await api.request(`${API}/admin/blog/posts`, { cookie })).status, 403);

    assert.equal(
      (await api.request(`${API}/auth/session`, { cookie })).status,
      200,
      'it can still read who it is',
    );
  });

  it('changing the password lifts the block, needs the current password, and refuses reuse of it', async () => {
    const admin = await api.seedAdmin('admin', { mustChangePassword: true });
    const cookie = await api.loginAs(admin);
    const change = (body: unknown) =>
      api.request(`${API}/auth/change-password`, { method: 'POST', cookie, body });

    assert.equal(
      (await change({ currentPassword: 'Wrong-Password-999', newPassword: 'Brand-New-Pass-77' }))
        .status,
      400,
    );
    assert.equal(
      (await change({ currentPassword: admin.password, newPassword: admin.password })).status,
      400,
    );
    assert.equal(
      (await change({ currentPassword: admin.password, newPassword: 'x'.repeat(73) })).status,
      400,
    );

    const ok = await change({ currentPassword: admin.password, newPassword: 'Brand-New-Pass-77' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.admin.mustChangePassword, false);

    assert.equal(
      (await api.request(`${API}/admin/enquiries`, { cookie })).status,
      200,
      'the block is lifted for the same session',
    );
    assert.equal(
      (await login({ email: admin.email, password: admin.password })).status,
      401,
      'the old password stops working',
    );
    assert.equal((await login({ email: admin.email, password: 'Brand-New-Pass-77' })).status, 200);
  });
});

describe('password reset, and its email hook', () => {
  /** The hook, spied on: what `mailer.ts` writes to the logger. Not delivery. */
  function spyOnMailer() {
    return mock.method(api.logger, 'info', () => {});
  }
  const callsFor = (spy: ReturnType<typeof spyOnMailer>, event: string) =>
    spy.mock.calls
      .map((call) => call.arguments[0] as { event?: string; email?: string; resetLink?: string })
      .filter((argument) => argument && typeof argument === 'object' && argument.event === event);

  it('a request for a REAL account fires the hook once with that address, stores only a HASH of the token', async () => {
    const admin = await api.seedAdmin('admin');
    const spy = spyOnMailer();

    const reply = await api.request(`${API}/auth/password-reset/request`, {
      method: 'POST',
      body: { email: admin.email },
    });
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body, { success: true, data: { requested: true } });

    const requested = callsFor(spy, 'password_reset.requested');
    assert.equal(requested.length, 1, 'the hook fires exactly once');
    assert.equal(requested[0]!.email, admin.email);

    const link = callsFor(spy, 'password_reset.link_dev_only')[0]?.resetLink;
    assert.ok(
      link?.startsWith(`${api.webOrigin}/admin/reset-password?token=`),
      'the link points at the web app',
    );
    const rawToken = new URL(link!).searchParams.get('token')!;

    const stored = await api.models.PasswordResetToken.find({ adminUserId: admin.id }).lean();
    assert.equal(stored.length, 1);
    assert.notEqual(stored[0]!.tokenHash, rawToken, 'the raw token is never stored');
    assert.match(stored[0]!.tokenHash, /^[0-9a-f]{64}$/, 'a SHA-256 hash is stored instead');
    const lifetimeMs = stored[0]!.expiresAt.getTime() - Date.now();
    assert.ok(lifetimeMs > 50 * 60_000 && lifetimeMs <= 60 * 60_000, 'valid for about an hour');
  });

  it('a request for an UNKNOWN account gives the same response, fires no hook and creates no token', async () => {
    const spy = spyOnMailer();
    const before = await api.models.PasswordResetToken.countDocuments();
    const reply = await api.request(`${API}/auth/password-reset/request`, {
      method: 'POST',
      body: { email: 'nobody-here@example.com' },
    });
    assert.deepEqual(reply.body, { success: true, data: { requested: true } });
    assert.equal(callsFor(spy, 'password_reset.requested').length, 0);
    assert.equal(await api.models.PasswordResetToken.countDocuments(), before);
  });

  it('the reset link works ONCE, sets the new password, and signs out every existing session', async () => {
    const admin = await api.seedAdmin('admin');
    const oldCookie = await api.loginAs(admin);
    const spy = spyOnMailer();
    await api.request(`${API}/auth/password-reset/request`, {
      method: 'POST',
      body: { email: admin.email },
    });
    const rawToken = new URL(
      callsFor(spy, 'password_reset.link_dev_only')[0]!.resetLink!,
    ).searchParams.get('token')!;

    const confirm = (token: string, newPassword = 'Reset-Password-4321') =>
      api.request(`${API}/auth/password-reset/confirm`, {
        method: 'POST',
        body: { token, newPassword },
      });

    assert.equal((await confirm('not-the-token')).status, 401, 'a wrong token is refused');
    const ok = await confirm(rawToken);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { success: true, data: { reset: true } });

    assert.equal(
      (await confirm(rawToken, 'Another-Password-1')).status,
      401,
      'the token cannot be used a second time',
    );
    assert.equal(
      (await api.request(`${API}/auth/session`, { cookie: oldCookie })).status,
      401,
      'old sessions are revoked',
    );
    assert.equal(
      (await login({ email: admin.email, password: admin.password })).status,
      401,
      'the old password is dead',
    );
    assert.equal(
      (await login({ email: admin.email, password: 'Reset-Password-4321' })).status,
      200,
    );
  });

  it('an expired reset token is refused', async () => {
    const admin = await api.seedAdmin('admin');
    const spy = spyOnMailer();
    await api.request(`${API}/auth/password-reset/request`, {
      method: 'POST',
      body: { email: admin.email },
    });
    const rawToken = new URL(
      callsFor(spy, 'password_reset.link_dev_only')[0]!.resetLink!,
    ).searchParams.get('token')!;
    await api.models.PasswordResetToken.updateMany(
      { adminUserId: admin.id },
      { expiresAt: new Date(Date.now() - 1000) },
    );
    const reply = await api.request(`${API}/auth/password-reset/confirm`, {
      method: 'POST',
      body: { token: rawToken, newPassword: 'Reset-Password-4321' },
    });
    assert.equal(reply.status, 401);
  });

  it('rejects a weak new password and NoSQL operators in the token', async () => {
    const short = await api.request(`${API}/auth/password-reset/confirm`, {
      method: 'POST',
      body: { token: 'abc', newPassword: 'short' },
    });
    assert.equal(short.status, 400);
    const operator = await api.request(`${API}/auth/password-reset/confirm`, {
      method: 'POST',
      body: { token: { $ne: '' }, newPassword: 'Reset-Password-4321' },
    });
    assert.equal(operator.status, 400);
  });

  it('is rate limited: 3 requests per hour per IP, then 429', async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i++) {
      const reply = await api.request(`${API}/auth/password-reset/request`, {
        method: 'POST',
        body: { email: 'nobody-here@example.com' },
        ip,
      });
      assert.equal(reply.status, 200, `request ${i + 1}`);
    }
    const blocked = await api.request(`${API}/auth/password-reset/request`, {
      method: 'POST',
      body: { email: 'nobody-here@example.com' },
      ip,
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error?.code, 'RATE_LIMITED');
  });
});
