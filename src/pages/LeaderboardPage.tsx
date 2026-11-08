import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Snapshot } from '../scoring/standings';
import { supabaseConfiguration } from '../data/client';
import { buildPublishedStandings } from '../data/publicStandings';
import type { PublicResultRow } from '../data/publicStandings';

/** Used only by explicitly fictional demonstrations; never by the public page. */
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

/** Only the public published_results projection is fetched; private drafts and sandbox
 * tables never appear in this module. The scoring engine independently recomputes totals.
 */
export function LeaderboardPage() {
  const [resultRows,setResultRows]=useState<PublicResultRow[]|null>(null);
  const [error,setError]=useState('');
  const [period,setPeriod]=useState('annual');
  useEffect(()=>{
    const client=supabaseConfiguration.client;
    if(!client){setError('The league results service is not configured.');return;}
    let active=true;
    void (async()=>{
      try{
        const all:PublicResultRow[]=[];
        const pageSize=250;
        for(let start=0;start<10000;start+=pageSize){
          const {data,error:readError}=await client.from('published_results')
            .select('result_id,public_snapshot,published_at')
            .order('published_at',{ascending:true}).order('result_id',{ascending:true})
            .range(start,start+pageSize-1);
          if(readError)throw Error(readError.message);
          all.push(...(data??[]));
          if((data??[]).length<pageSize)break;
          if(start+pageSize>=10000)throw Error('League results exceed the supported page limit.');
        }
        if(active){setResultRows(all);setError('');}
      }catch(e){
        if(active){setResultRows(null);setError(e instanceof Error?e.message:'Unable to read published tournament results.');}
      }
    })();
    return()=>{active=false;};
  },[]);
  const projection=useMemo(()=>{
    if(resultRows===null)return null;
    try{return {data:buildPublishedStandings(resultRows),error:''};}
    catch(e){return {data:null,error:e instanceof Error?e.message:'Unable to calculate official standings.'};}
  },[resultRows]);
  const scoring=projection?.data;
  const snapshot=period==='annual'?scoring?.standings.annual:
    scoring?.standings.seasons[Number(period)-1]?.afterChampionship;
  const current=period==='annual'?scoring?.events:scoring?.events.filter(e=>e.season===Number(period)&&e.kind!=='annual');
  const visible=snapshot?.standings.filter(p=>p.regularEventCount>0||p.championshipPoints>0)??[];
  const latest=scoring?.events[0];
  return <section className="container public-leaderboard">
    <header className="public-leaderboard-head">
      <p className="eyebrow">THE PLAYERS / THE PURSUIT</p>
      <h1>Leaderboards<span className="gold">.</span></h1>
      <p className="page-description">Official 2027 Modern League standings calculated only from administrator-published Eternal Games tournament results. Rankings update when additional results are approved.</p>
    </header>
    {error||projection?.error?<section className="empty-state" role="alert">
      <h2>Official standings unavailable</h2>
      <p>{error||projection?.error} No private test results have been substituted.</p>
    </section>:resultRows===null?<p role="status">Loading official tournament results…</p>:!scoring||scoring.events.length===0?
      <section className="empty-state" aria-label="Official standings status">
        <span className="pill">OFFICIAL RESULTS PENDING</span>
        <h2>Official standings are not yet published.</h2>
        <p>The 2027 competition has no published results yet. Preseason test tournaments remain private and never count toward league standings.</p>
        <p><Link to="/leaderboards/top-16?preview=1">Preview the simple two-column leaderboard layout</Link></p>
      </section>:<>
      <div className="public-leaderboard-facts">
        <div><span>Published events</span><strong>{scoring.events.length}</strong></div>
        <div><span>Players recorded</span><strong>{scoring.standings.annual.standings.filter(row=>row.regularEventCount>0||row.championshipPoints>0).length}</strong></div>
        <div><span>Most recent event</span><strong>{latest?.date}</strong></div>
      </div>
      <p className="public-leaderboard-top16-link"><Link to="/leaderboards/top-16">View the two-column Top 16 leaderboard</Link></p>
      <nav className="public-leaderboard-periods" aria-label="Standings period">
        <button type="button" aria-pressed={period==='annual'} onClick={()=>setPeriod('annual')}>2027 Annual</button>
        {[1,2,3,4].map(n=><button type="button" key={n} aria-pressed={period===String(n)} onClick={()=>setPeriod(String(n))}>Season {n}</button>)}
      </nav>
      <section className="public-leaderboard-standing" aria-live="polite" aria-label={period==='annual'?'Annual standings':`Season ${period} standings`}>
        <div className="public-leaderboard-section-head">
          <div><p className="eyebrow">{period==='annual'?'2027 / ANNUAL STANDINGS':`2027 / SEASON ${period}`}</p>
            <h2>{period==='annual'?'Overall League Standings':`Season ${period} Standings`}</h2></div>
          <p>{current?.length??0} published events</p>
        </div>
        {visible.length===0?<p className="public-leaderboard-empty">No results published for this period.</p>:
        <div className="standings-scroll"><table>
          <caption>Current standings · cumulative titles have not been finalized</caption>
          <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Regular</th><th scope="col">Championship</th><th scope="col">Total</th><th scope="col">REG events</th><th scope="col">Title eligibility</th></tr></thead>
          <tbody>{visible.map(row=><tr key={row.playerId}>
            <td>{row.rank}</td><th scope="row">{row.name}</th>
            <td>{row.regularPoints.toFixed(2)}</td><td>{row.championshipPoints.toFixed(2)}</td>
            <td><strong>{row.totalPoints.toFixed(2)}</strong></td><td>{row.regularEventCount}</td>
            <td>{row.eligibleForCumulativeTitle?'Requirement met':`${Math.max(0,(period==='annual'?20:6)-row.regularEventCount)} more REG`}</td>
          </tr>)}</tbody>
        </table></div>}
        <p className="public-leaderboard-note">Standings are provisional until the period is formally finalized. A championship tournament winner and cumulative Champion are distinct honors. Participation requirements apply to titles, not tournament entry. Crowns are awarded only when final titles are confirmed.</p>
      </section>
      <section className="public-leaderboard-events" aria-label="Official published events">
        <div className="public-leaderboard-section-head"><div><p className="eyebrow">OFFICIAL EVENT RECORD</p><h2>Published tournaments</h2></div></div>
        <div className="standings-scroll"><table>
          <thead><tr><th scope="col">Date</th><th scope="col">Event</th><th scope="col">Type</th><th scope="col">Players</th></tr></thead>
          <tbody>{scoring.events.map(event=><tr key={event.resultId}>
            <td>{event.date}</td><th scope="row">{event.name}</th>
            <td>{event.kind==='regular'?'REG':event.kind==='seasonal'?'SC':'LC'}</td>
            <td>{event.players.length}</td>
          </tr>)}</tbody>
        </table></div>
      </section>
      <p className="public-leaderboard-note">For official result disputes, contact Eternal Games and notify the league administrator within seven calendar days. <Link to="/rules">Full rules</Link>.</p>
    </>}
  </section>;
}
