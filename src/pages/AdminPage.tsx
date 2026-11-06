import { useEffect, useState } from 'react';
import { supabaseConfiguration } from '../data/client';
import { leagueRepository } from '../data/repository';
import { recoveryRedirect } from '../data/recovery';

export function AdminPage() {
  const { client, error } = supabaseConfiguration;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('Checking session…');
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!client) return;
    let active = true;
    let generation = 0;
    async function refresh() {
      const request = ++generation;
      try {
        const { data, error } = await client!.auth.getUser();
        if (!active || request !== generation) return;
        setSignedIn(!!data.user);
        if (error || !data.user) { setStatus('Sign in with an administrator account.'); return; }
        const admin = await leagueRepository(client!).isAdministrator();
        if (active && request === generation) setStatus(admin ? 'Administrator verified. Durable approval and publication remain disabled in Phase 8A.' : 'Signed in. This account does not have administrator access.');
      } catch { if (active && request === generation) setStatus('Unable to verify administrator access.'); }
    }
    void refresh();
    const { data: { subscription } } = client.auth.onAuthStateChange(() => { setTimeout(() => { if (active) void refresh(); }, 0); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  return <section className="container admin-page"><p className="eyebrow">ADMINISTRATOR ACCESS</p><h1>League administration</h1>
    {!client ? <p>{error ?? 'Supabase is not configured. Fictional demonstrations remain available; nothing is saved to a database.'}</p> : <>
      <p role="status">{status}</p>
      {signedIn ? <button disabled={busy} onClick={async () => { setBusy(true); try { const result = await client.auth.signOut(); if (result.error) throw result.error; } catch { setStatus('Sign out failed. Please retry.'); } finally { setBusy(false); } }}>Sign out</button> :
      <form onSubmit={async event => { event.preventDefault(); setBusy(true); try {
        const result = await client.auth.signInWithPassword({ email, password });
        if (result.error) setStatus('Sign-in failed. Check your credentials.');
        setPassword('');
      } catch { setStatus('Sign-in unavailable. Please retry.'); } finally { setBusy(false); } }}>
        <label>Email <input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Password <input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button disabled={busy}>Sign in</button>
        <button type="button" disabled={busy || !email} onClick={async () => {
          setBusy(true);
          try {
            const result = await client.auth.resetPasswordForEmail(email, {
              redirectTo: recoveryRedirect(window.location.origin, import.meta.env.BASE_URL),
            });
            setStatus(result.error ? 'Unable to request recovery. Please retry later.' : 'If this account can recover its password, a recovery email will arrive shortly.');
          } catch { setStatus('Unable to request recovery. Please retry later.'); }
          finally { setBusy(false); }
        }}>Send password recovery email</button>
      </form>}
    </>}
  </section>;
}
