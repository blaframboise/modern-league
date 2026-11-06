import { useState } from 'react';
import { calculateStandings } from '../scoring/standings';
import type { Snapshot, StandingsInput } from '../scoring/standings';

// Fictional demonstration records only; no dates, imports, or live database.
const sample: StandingsInput = {
  year: 2027, seasonIds: ['s1', 's2', 's3', 's4'],
  players: [{ playerId: 'alex', name: 'Alex' }, { playerId: 'jordan', name: 'Jordan' }, { playerId: 'casey', name: 'Casey' }],
  regularEvents: Array.from({ length: 24 }, (_, index) => ({
    eventId: `sample-${index}`, year: 2027, seasonId: `s${Math.floor(index / 6) + 1}`,
    results: [
      ...(index % 6 < 5 ? [{ playerId: 'alex', wins: 4, draws: 0, scheduledRounds: 4 }] : []),
      { playerId: 'jordan', wins: 2, draws: 1, scheduledRounds: 4 },
      { playerId: 'casey', wins: 2, draws: 0, scheduledRounds: 4 },
    ],
  })), championships: [],
};
const calculated = calculateStandings(sample);
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
export function LeaderboardPage() {
  const [period, setPeriod] = useState('s1');
  const season = calculated.seasons.find(season => season.seasonId === period);
  return <div className="container placeholder-page"><p className="eyebrow">THE PLAYERS / THE PURSUIT</p><h1>Leaderboards<span className="gold">.</span></h1>
    <p className="page-description">Demonstration standings for the 2027 series. These are sample data, not official league results. No championships have been recorded in this example.</p>
    <label className="standings-filter">Standings period <select value={period} onChange={event => setPeriod(event.target.value)}>{sample.seasonIds.map((id, index) => <option key={id} value={id}>Season {index + 1}</option>)}<option value="annual">Annual</option></select></label>
    <p className="muted">Cumulative titles require {season ? 'six regular-event appearances in the season' : '20 regular-event appearances in the year'}. Every player keeps their earned leaderboard position.</p>
    {season ? <><CumulativeLeaderboard title="Regular Season Champion standings — before championship" snapshot={season.beforeChampionship} /><CumulativeLeaderboard title="Overall Season Champion standings — championship pending" snapshot={season.afterChampionship} /></> : <CumulativeLeaderboard title="Annual Overall Champion standings — championship pending" snapshot={calculated.annual} />}
  </div>;
}
