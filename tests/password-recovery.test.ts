import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { captureRecovery, establishRecovery, resetPassword, recoveryRedirect } from '../src/data/recovery.ts';

const user = { id: 'recovery-user', aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
function fixture() {
  const updates: unknown[] = [];
  let expired = false;
  const client = createClient('https://example.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (_input, init) => {
      if (expired) return new Response(JSON.stringify({ msg: 'expired', code: 'bad_jwt' }), { status: 401 });
      if (init?.method === 'PUT') updates.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const jwt = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.c2lnbmF0dXJl`;
  return { auth: client.auth, updates, expire: () => { expired = true; }, jwt };
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
