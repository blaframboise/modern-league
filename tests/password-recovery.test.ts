import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { captureRecovery, establishRecovery, resetPassword, recoveryRedirect } from '../src/data/recovery.ts';

const user = { id: 'recovery-user', aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
function fixture() {
  const updates: unknown[] = [];
  let expired = false;
  let logoutFails = false;
  const client = createClient('https://example.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (_input, init) => {
      if (logoutFails && String(_input).includes('/logout')) return new Response(JSON.stringify({ msg: 'unavailable' }), { status: 503 });
      if (expired) return new Response(JSON.stringify({ msg: 'expired', code: 'bad_jwt' }), { status: 401 });
      if (init?.method === 'PUT') updates.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const jwt = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.c2lnbmF0dXJl`;
  return { auth: client.auth, updates, expire: () => { expired = true; }, failLogout: () => { logoutFails = true; }, jwt };
}
function callback(jwt: string) {
  let cleaned = '';
  const result = captureRecovery(new URL(`https://blaframboise.github.io/modern-league/?recovery=1#access_token=${jwt}&refresh_token=refresh&type=recovery&expires_in=3600`), url => { cleaned = url; });
  assert.equal(cleaned, '/modern-league/#/reset-password');
  return result!;
}
test('Pages root callback establishes a verified Supabase session and updates password through Auth API', async () => {
  const f = fixture();
  assert.equal(recoveryRedirect('https://blaframboise.github.io', '/modern-league/'), 'https://blaframboise.github.io/modern-league/?recovery=1');
  await establishRecovery(f.auth, callback(f.jwt));
  await resetPassword(f.auth, 'a-long-new-password', 'a-long-new-password');
  assert.deepEqual(f.updates, [{ password: 'a-long-new-password', code_challenge: null, code_challenge_method: null }]);
});
test('mismatch and short passwords never reach updateUser', async () => {
  const f = fixture();
  await establishRecovery(f.auth, callback(f.jwt));
  await assert.rejects(resetPassword(f.auth, 'a-long-new-password', 'different-password'), /do not match/);
  await assert.rejects(resetPassword(f.auth, 'short', 'short'), /12 characters/);
  assert.deepEqual(f.updates, []);
  assert.ok((await f.auth.getSession()).data.session);
});
test('expired session cannot establish recovery or update password', async () => {
  const f = fixture(); f.expire();
  await assert.rejects(establishRecovery(f.auth, callback(f.jwt)), /invalid or expired/);
  await assert.rejects(resetPassword(f.auth, 'a-long-new-password', 'a-long-new-password'), /invalid or expired/);
  assert.deepEqual(f.updates, []);
});
test('missing, malformed, expired callback and bare reset route fail closed even with an existing session', async () => {
  const f = fixture();
  await establishRecovery(f.auth, callback(f.jwt));
  for (const suffix of ['?recovery=1', '?recovery=1#error=access_denied&error_code=otp_expired', '#/reset-password', '?recovery=1#access_token=bad&type=recovery', '?recovery=1#access_token=bad&refresh_token=bad&type=signup']) {
    const result = captureRecovery(new URL(`https://blaframboise.github.io/modern-league/${suffix}`), () => {});
    assert.ok(result);
    await assert.rejects(establishRecovery(f.auth, result), /invalid or expired/);
  }
  assert.equal(captureRecovery(new URL('https://blaframboise.github.io/modern-league/#/admin'), () => assert.fail()), null);
});

for (const failure of ['set-error', 'set-empty', 'set-throw', 'verify-error', 'verify-empty', 'verify-throw', 'update-error', 'update-throw', 'reset-verify-error', 'reset-verify-empty', 'reset-verify-throw']) {
  test(`failed recovery clears its isolated session: ${failure}`, async () => {
    const existing = fixture();
    await establishRecovery(existing.auth, callback(existing.jwt));
    const before = (await existing.auth.getSession()).data.session;
    const recovery = fixture();
    let verifications = 0;
    const auth = {
      setSession: async (tokens: Parameters<typeof recovery.auth.setSession>[0]) => {
        const result = await recovery.auth.setSession(tokens);
        // Model failures occurring AFTER the SDK has saved the session.
        if (failure === 'set-throw') throw new Error('set failed');
        if (failure === 'set-error') return { ...result, error: new Error('set failed') };
        if (failure === 'set-empty') return { ...result, data: { session: null, user: null } };
        return result;
      },
      getUser: async () => {
        verifications++;
        const fail = failure.startsWith('verify-') || (failure.startsWith('reset-verify-') && verifications > 1);
        if (fail && failure.endsWith('throw')) throw new Error('verification unavailable');
        if (fail && failure.endsWith('error')) return { data: { user: null }, error: new Error('verification failed') };
        if (fail) return { data: { user: null }, error: null };
        return recovery.auth.getUser();
      },
      updateUser: async () => {
        if (failure === 'update-throw') throw new Error('update unavailable');
        return { data: { user: null }, error: new Error('update failed') };
      },
      signOut: async (options: Parameters<typeof recovery.auth.signOut>[0]) => {
        assert.deepEqual(options, { scope: 'local' });
        return recovery.auth.signOut(options);
      },
    } as unknown as Parameters<typeof establishRecovery>[0];
    if (failure.startsWith('update-') || failure.startsWith('reset-')) {
      await establishRecovery(auth, callback(recovery.jwt));
      await assert.rejects(resetPassword(auth, 'a-long-new-password', 'a-long-new-password'));
    } else {
      await assert.rejects(establishRecovery(auth, callback(recovery.jwt)), /invalid or expired/);
    }
    assert.equal((await recovery.auth.getSession()).data.session, null);
    assert.deepEqual((await existing.auth.getSession()).data.session, before);
  });
}

test('cleanup still removes recovery session if server logout fails', async () => {
  const f = fixture();
  await establishRecovery(f.auth, callback(f.jwt));
  const auth = {
    getUser: async () => { throw new Error('offline'); },
    signOut: async (options: Parameters<typeof f.auth.signOut>[0]) => {
      f.failLogout(); // Local state must clear even when server revocation fails.
      const result = await f.auth.signOut(options);
      assert.ok(result.error);
      throw new Error('logout transport failed');
    },
  } as unknown as Parameters<typeof resetPassword>[0];
  await assert.rejects(resetPassword(auth, 'a-long-new-password', 'a-long-new-password'), /offline/);
  assert.equal((await f.auth.getSession()).data.session, null);
});
