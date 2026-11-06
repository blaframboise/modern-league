import { useEffect, useState } from 'react';
import type { createBrowserClient } from '../data/client';
import { resetPassword } from '../data/recovery';

export function PasswordRecoveryPage({ session, client }: { session: Promise<void>; client: ReturnType<typeof createBrowserClient> }) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Verifying recovery link…');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void session.then(() => { if (active) { setReady(true); setStatus('Enter your new password.'); } }, error => { if (active) setStatus(error.message); });
    return () => { active = false; };
  }, [session]);
  return <main className="container admin-page"><h1>Reset your password</h1><p role="status">{status}</p>
    {ready && <form onSubmit={async event => {
      event.preventDefault();
      if (!client || busy) return;
      setBusy(true);
      try {
        await resetPassword(client.auth, password, confirmation);
        setReady(false); setPassword(''); setConfirmation('');
        try {
          const signedOut = await client.auth.signOut({ scope: 'local' });
          setStatus(signedOut.error ? 'Password updated. Recovery state cleared locally; server sign-out could not be confirmed.' : 'Password updated. Sign in with your new password.');
        } catch { setStatus('Password updated. Recovery state cleared locally; server sign-out could not be confirmed.'); }
      } catch (error) {
        if (!(await client.auth.getSession()).data.session) {
          setReady(false); setPassword(''); setConfirmation('');
        }
        setStatus(error instanceof Error ? error.message : 'Unable to update password. Request a new recovery link.');
      }
      finally { setBusy(false); }
    }}>
      <label>New password <input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <label>Confirm new password <input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      <button disabled={busy}>Update password</button>
    </form>}
    <p><a href={import.meta.env.PROD ? `${import.meta.env.BASE_URL}#/admin` : '/admin'}>Administrator sign in / request a new link</a></p>
  </main>;
}
