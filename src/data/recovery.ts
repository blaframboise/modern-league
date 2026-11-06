import type { SupabaseClient } from '@supabase/supabase-js';

type RecoveryAuth = Pick<SupabaseClient['auth'], 'setSession' | 'getUser' | 'updateUser' | 'signOut'>;
export const invalidRecovery = 'This recovery link is invalid or expired. Request a new link.';

// Capture and scrub Auth's fragment before HashRouter can interpret or replace it.
export function captureRecovery(url: URL, replace: (url: string) => void) {
  const fragment = new URLSearchParams(url.hash.slice(1));
  const requested = url.searchParams.has('recovery') || fragment.get('type') === 'recovery'
    || fragment.has('access_token') || fragment.has('error') || url.hash === '#/reset-password';
  if (!requested) return null;
  const access_token = fragment.get('access_token');
  const refresh_token = fragment.get('refresh_token');
  const valid = fragment.get('type') === 'recovery' && !!access_token && !!refresh_token
    && !fragment.has('error') && !url.searchParams.has('error');
  url.search = '';
  url.hash = '/reset-password';
  replace(url.pathname + url.hash);
  return valid ? { access_token, refresh_token } : { error: invalidRecovery };
}

export async function establishRecovery(auth: RecoveryAuth, callback: NonNullable<ReturnType<typeof captureRecovery>>) {
  if ('error' in callback) throw new Error(invalidRecovery);
  try {
    const result = await auth.setSession(callback);
    if (result.error || !result.data.session) throw new Error(invalidRecovery);
    const verified = await auth.getUser();
    if (verified.error || !verified.data.user) throw new Error(invalidRecovery);
  } catch {
    await clearRecovery(auth);
    throw new Error(invalidRecovery);
  }
}

// Call only with the dedicated, nonpersistent recovery client. Never sign out
// the shared administrator client, even when the callback is malformed.
async function clearRecovery(auth: RecoveryAuth) {
  try { await auth.signOut({ scope: 'local' }); }
  catch { /* The SDK clears local state before attempting server revocation. */ }
}

export async function resetPassword(auth: RecoveryAuth, password: string, confirmation: string) {
  // Correctable form errors retain the verified recovery attempt for a retry.
  if (password !== confirmation) throw new Error('Passwords do not match.');
  if (password.length < 12) throw new Error('Use at least 12 characters.');
  try {
    const verified = await auth.getUser();
    if (verified.error || !verified.data.user) throw new Error(invalidRecovery);
    const result = await auth.updateUser({ password });
    if (result.error) throw new Error('Password update failed. Request a new recovery link.');
  } catch (error) {
    await clearRecovery(auth);
    throw error;
  }
}

export function recoveryRedirect(origin: string, base: string) {
  return new URL(`${base}?recovery=1`, origin).href;
}
