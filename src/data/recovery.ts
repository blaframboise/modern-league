import type { SupabaseClient } from '@supabase/supabase-js';

type RecoveryAuth = Pick<SupabaseClient['auth'], 'setSession' | 'getUser' | 'updateUser'>;
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
  const result = await auth.setSession(callback);
  if (result.error || !result.data.session) throw new Error(invalidRecovery);
  const verified = await auth.getUser();
  if (verified.error || !verified.data.user) throw new Error(invalidRecovery);
}

export async function resetPassword(auth: RecoveryAuth, password: string, confirmation: string) {
  if (password !== confirmation) throw new Error('Passwords do not match.');
  if (password.length < 12) throw new Error('Use at least 12 characters.');
  const verified = await auth.getUser();
  if (verified.error || !verified.data.user) throw new Error(invalidRecovery);
  const result = await auth.updateUser({ password });
  if (result.error) throw new Error('Password update failed. Your link may have expired, or the password may not meet the account policy. Request a new link or retry.');
}

export function recoveryRedirect(origin: string, base: string) {
  return new URL(`${base}?recovery=1`, origin).href;
}
