import { useCallback, useEffect, useState } from 'react';

type BuildInfo = { version: string; builtAt: string; commit: string };
const current: BuildInfo = __MODERN_LEAGUE_BUILD__;
export function isDifferentBuild(a: BuildInfo, b: BuildInfo): boolean {
  return a.commit !== b.commit || a.builtAt !== b.builtAt || a.version !== b.version;
}
function buildDate(stamp: string): string {
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? 'Time unavailable'
    : new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
}
export function reloadLatestBuild() {
  // Revisit index.html through a new URL so an installed iOS home-screen app
  // does not need to be force-closed. Keep the current #/ route and query.
  const url = new URL(window.location.href);
  url.searchParams.set('ml-update', String(Date.now()));
  window.location.replace(url.toString());
}
export function AppVersionPanel() {
  const [latest, setLatest] = useState<BuildInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}version.json?check=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw Error('Build information unavailable');
      const info: BuildInfo = await response.json();
      if (!info || typeof info.version !== 'string' || typeof info.commit !== 'string' || typeof info.builtAt !== 'string') {
        throw Error('Build information invalid');
      }
      setLatest(info);
      setError('');
    } catch {
      setError('Cannot check for an update. Check your connection.');
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void check();
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);
  const update = !!latest && isDifferentBuild(current, latest);
  return <section className="app-version" aria-label="Application version">
    <div>
      <p className="eyebrow">APP VERSION</p>
      <p><strong>v{current.version}</strong> <span className="muted">· build {current.commit.slice(0, 7)}</span></p>
      <p className="muted">Built {buildDate(current.builtAt)}</p>
      {update && <p role="status">New version available: v{latest.version}, built {buildDate(latest.builtAt)}.</p>}
      {!update && latest && <p role="status">This is the latest deployed version.</p>}
      {error && <p role="status">{error}</p>}
    </div>
    <div className="app-version-actions">
      <button type="button" onClick={() => void check()} disabled={checking}>{checking ? 'Checking…' : 'Check for updates'}</button>
      <button type="button" onClick={reloadLatestBuild}>{update ? 'Install latest version' : 'Refresh app'}</button>
    </div>
  </section>;
}
