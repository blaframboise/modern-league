import type { Snapshot } from '../scoring/standings';

/** Shared only by the explicitly fictional import-review demonstration. */
export function CumulativeLeaderboard({ title, snapshot, ended = false }: { title: string; snapshot: Snapshot; ended?: boolean }) {
  const recipients = snapshot.standings.filter(row => snapshot.cumulativeTitleRecipientIds.includes(row.playerId));
  return <section className="standings-panel" aria-label={title}>
    <h2>{title}</h2>
    <div className="standings-scroll"><table><caption>Sample data — fictional players and results</caption><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Points</th><th scope="col">Events</th></tr></thead>
      <tbody>{snapshot.standings.map(row => <tr key={row.playerId}><td>{row.rank}</td><th scope="row">{row.name}{!row.eligibleForCumulativeTitle && <span aria-label="Participation requirement not met">*</span>}</th><td>{row.totalPoints.toFixed(2)}</td><td>{row.regularEventCount}</td></tr>)}</tbody></table></div>
    <p className="muted">{ended ? '* Not eligible for the cumulative title.' : '* Has not yet met the participation requirement for the cumulative title.'}</p>
    <p><span className="gold">{ended ? 'Cumulative title recipient(s)' : 'Current eligible cumulative title leader(s)'}:</span> {recipients.map(row => row.name).join(', ') || 'None yet'}</p>
  </section>;
}

/** Public standings are never populated from fictional test fixtures. */
export function LeaderboardPage() {
  return <div className="container placeholder-page">
    <p className="eyebrow">THE PLAYERS / THE PURSUIT</p>
    <h1>Leaderboards<span className="gold">.</span></h1>
    <p className="page-description">The 2027 Modern Championship Series is preparing for its first official results.</p>
    <section className="empty-state" aria-label="Official standings status">
      <span className="pill">OFFICIAL RESULTS PENDING</span>
      <h2>Official standings are not yet published.</h2>
      <p>Preseason test tournaments are private and never count toward the public championship standings. Verified results will appear here after official approval and publication are enabled.</p>
    </section>
  </div>;
}
