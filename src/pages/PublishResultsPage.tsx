import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabaseConfiguration } from '../data/client';
import { leagueRepository } from '../data/repository';
import { effectiveValues, potentialPlayers } from '../results';
import type { ImportDraft } from '../results';
import { suggestDisplayName } from '../importInfrastructure/displayNames';
import { resolveScheduledEvent } from '../calendar/importMatch';
import { parseCalendarOverrides } from '../calendar/scheduler';
import { calculateRegularEventPoints } from '../scoring/regular';
import { calculateChampionshipPoints } from '../scoring/championship';
import type { Json } from '../data/database';

type OfficialPlayer={id:string;display_name:string};
type Alias={player_id:string;alias:string};
type Linked={rowId:string;playerId:string;displayName:string};
type SavedCalendar={revision:number;overrides:ReturnType<typeof parseCalendarOverrides>};
type MatchRegistry='official'|'test';

/** This is the only entry point for official publication; sandbox records never enter this flow. */
export function PublishResultsPage(){
  const client=supabaseConfiguration.client;
  const [params]=useSearchParams();
  const requestedDraft=params.get('draft');
  const [authorized,setAuthorized]=useState(false);
  const [loading,setLoading]=useState(true);
  const [status,setStatus]=useState('Checking administrator access…');
  const [drafts,setDrafts]=useState<{id:string}[]>([]);
  const [draft,setDraft]=useState<ImportDraft|null>(null);
  const [players,setPlayers]=useState<OfficialPlayer[]>([]);
  const [aliases,setAliases]=useState<Alias[]>([]);
  const [testPlayers,setTestPlayers]=useState<OfficialPlayer[]>([]);
  const [testAliases,setTestAliases]=useState<Alias[]>([]);
  const [rehearsalDone,setRehearsalDone]=useState(false);
  const [linked,setLinked]=useState<Linked[]>([]);
  const [calendar,setCalendar]=useState<SavedCalendar|null>(null);
  const [reason,setReason]=useState('Administrator verified store results and all player identities.');
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [publishedId,setPublishedId]=useState('');
  const values=draft?effectiveValues(draft):null;
  const match=calendar&&values?resolveScheduledEvent(values.tournament.date,calendar.overrides):null;
  const rehearsal=match?.status==='historical';
  const registry:MatchRegistry=rehearsal?'test':'official';
  const availablePlayers=rehearsal?testPlayers:players;
  const availableAliases=rehearsal?testAliases:aliases;
  const roster=useMemo(()=>availablePlayers.map(p=>({
    playerId:p.id,displayName:p.display_name,
    aliases:availableAliases.filter(a=>a.player_id===p.id).map(a=>a.alias),
  })),[availablePlayers,availableAliases]);
  const classMatches=match?.status==='matched' &&
    values?.tournament.kind===match.kind &&
    values?.tournament.year===match.competitionYear &&
    (values?.tournament.seasonId??'')===(match.seasonId??'');
  const todayParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date());
  const datePart=(name:string)=>todayParts.find(x=>x.type===name)?.value??'';
  const today=`${datePart('year')}-${datePart('month')}-${datePart('day')}`;
  const future=!!values&&values.tournament.date>today;
  const distinctExisting=linked.filter(r=>r.playerId).map(r=>r.playerId);
  const rosterValid=!!linked.length&&linked.length===values?.results.length &&
    distinctExisting.length===new Set(distinctExisting).size &&
    linked.every(x=>x.playerId||x.displayName.trim().length>=2);
  const rounds=values?.tournament.scheduledRounds;
  const recordsValid=!!rounds&&Number.isSafeInteger(rounds)&&rounds>0&&!!values?.results.length&&
    values.results.every(row=>row.importedName.trim()&&row.wins!==null&&row.losses!==null&&row.draws!==null&&
      Number.isSafeInteger(row.wins)&&Number.isSafeInteger(row.losses)&&Number.isSafeInteger(row.draws)&&
      row.wins>=0&&row.losses>=0&&row.draws>=0&&row.wins+row.losses+row.draws<=rounds&&
      (match?.status!=='matched'||match.kind==='regular'||!!row.finalPosition));
  const canPublish=authorized&&!busy&&!publishedId&&confirmed&&!!reason.trim()&&
    !!draft?.corrections.length&&classMatches&&!future&&rosterValid&&recordsValid;
  const canCompleteRehearsal=authorized&&!busy&&rehearsal&&!rehearsalDone&&confirmed&&
    !!draft?.corrections.length&&!!reason.trim()&&rosterValid&&recordsValid;
  const blocker=!draft?'':future?'This event is in the future. Publication is not yet available.':
    !recordsValid?'Some player results or scheduled rounds are missing or invalid. Return to screenshot review to correct them.':
    !rosterValid?'Resolve duplicate player selections and fill in every new player name (at least two characters).':
    !classMatches&&!rehearsal?'This event is not eligible for official 2027 publication. Check its date and calendar classification.':
    !reason.trim()?'Enter a verification reason.':'';

  useEffect(()=>{
    if(!client){setLoading(false);setStatus('Supabase is unavailable.');return;}
    let active=true;
    void (async()=>{
      try{
        const {data:identity}=await client.auth.getUser();
        if(!identity.user||!(await leagueRepository(client).isAdministrator()))throw Error('Administrator sign-in required.');
        const [ds,pr,al,cal,testPr,testAl]=await Promise.all([
          leagueRepository(client).drafts(),
          client.from('players').select('id,display_name').order('display_name'),
          client.from('player_identities').select('player_id,alias'),
          client.from('proposed_calendar_settings').select('revision,overrides').eq('year',2027).single(),
          client.from('sandbox_players').select('id,display_name').order('display_name'),
          client.from('sandbox_player_aliases').select('player_id,alias'),
        ]);
        if(pr.error||al.error||cal.error||!cal.data||testPr.error||testAl.error)
          throw Error('Unable to load the saved calendar and player registries.');
        const parsed=parseCalendarOverrides(cal.data.overrides);
        if(active){
          setAuthorized(true);setDrafts(ds??[]);setPlayers(pr.data??[]);setAliases(al.data??[]);
          setTestPlayers(testPr.data??[]);setTestAliases(testAl.data??[]);
          setCalendar({revision:cal.data.revision,overrides:parsed});
          setStatus('Private administrator review · Nothing is published automatically.');
        }
      }catch(e){if(active)setStatus(e instanceof Error?e.message:'Publication unavailable.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[client]);

  useEffect(()=>{
    if(!client||!authorized||!requestedDraft||!drafts.some(d=>d.id===requestedDraft))return;
    void loadDraft(requestedDraft);
  // One-time preselection; further selections are handled by the native select.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authorized,requestedDraft,drafts,client]);

  async function loadDraft(id:string){
    if(!client)return;
    setBusy(true);setError('');setDraft(null);setConfirmed(false);setPublishedId('');setRehearsalDone(false);
    try{
      const incoming=await leagueRepository(client).loadDraft(id);
      if(!incoming.corrections.length)throw Error('This screenshot has not been reviewed and saved.');
      setDraft(incoming);
      const seen=new Set<string>();
      const initial=effectiveValues(incoming).results.map(row=>{
        const selectedRoster=incoming.original.tournament.date.slice(0,4)<'2027'
          ? testPlayers.map(p=>({playerId:p.id,displayName:p.display_name,aliases:testAliases.filter(a=>a.player_id===p.id).map(a=>a.alias)}))
          : roster;
        const candidates=potentialPlayers(row.importedName,selectedRoster);
        const playerId=candidates.length===1&&!seen.has(candidates[0].playerId)?candidates[0].playerId:'';
        if(playerId)seen.add(playerId);
        return {rowId:row.rowId,playerId,displayName:suggestDisplayName(row.importedName)};
      });
      setLinked(initial);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load review.');}
    finally{setBusy(false);}
  }

  function setPlayer(rowId:string,patch:Partial<Linked>){
    setConfirmed(false);
    setLinked(old=>old.map(item=>item.rowId===rowId?{...item,...patch}:item));
  }
  let points:string[]=[];
  try{
    if(recordsValid&&values&&match?.status==='matched'){
      if(match.kind==='regular')points=values.results.map(r=>calculateRegularEventPoints({
        wins:r.wins!,draws:r.draws!,scheduledRounds:rounds!,
      }).toFixed(2));
      else {
        const calculated=calculateChampionshipPoints({
          year:2027,kind:match.kind,scheduledSwissRounds:rounds!,
          participants:values.results.map(r=>({
            playerId:r.rowId,swiss:{wins:r.wins!,losses:r.losses!,draws:r.draws!},finalPosition:r.finalPosition!,
          })),
        });
        points=calculated.map(x=>x.totalPoints.toFixed(2));
      }
    }
  }catch{points=[];}

  async function publish(){
    if(!client||!draft||!calendar||!canPublish)return;
    setBusy(true);setError('');setConfirmed(false);
    try{
      const {data,error:rpcError}=await client.rpc('publish_reviewed_tournament',{
        p_draft:draft.importId,p_revision:draft.corrections.length,
        p_calendar_revision:calendar.revision,
        p_links:linked.map(r=>({rowId:r.rowId,playerId:r.playerId||null,displayName:r.playerId?null:r.displayName.trim()})) as unknown as Json,
        p_reason:reason.trim(),p_confirm:true,
      });
      if(rpcError)throw Error(rpcError.message);
      setPublishedId(data);
      setStatus('Tournament published to the official ledger. Public leaderboard aggregation is a separate step.');
    }catch(e){setError(e instanceof Error?e.message:'Publication failed; no result was published.');}
    finally{setBusy(false);}
  }

  return <section className="container admin-page official-publication">
    <p className="eyebrow">ADMINISTRATION / OFFICIAL LEAGUE</p>
    <h1>Publish Results</h1>
    <p>Step 2 of 3: Match each reviewed screenshot name to a player, verify the complete roster, then approve the final step. Nothing publishes automatically.</p>
    <p role="status">{status}</p>
    {!authorized?loading?<p>Checking access…</p>:<Link to="/admin">Administrator sign in</Link>:<>
      <label>Reviewed tournament
        <select value={draft?.importId??''} disabled={busy} onChange={e=>void loadDraft(e.target.value)}>
          <option value="">Select saved screenshot review</option>
          {drafts.map(d=><option key={d.id} value={d.id}>Draft {d.id.slice(0,8)}</option>)}
        </select>
      </label>
      {error&&<p className="import-error" role="alert">{error}</p>}
      {draft&&values&&<>
        <div className="publication-summary">
          <strong>{values.tournament.name||'Unnamed tournament'}</strong>
          <p>Date: <time dateTime={values.tournament.date}>{values.tournament.date||'Missing'}</time></p>
          <p>Calendar: {match?.status==='matched'? `${match.code} · ${match.description}`:match?.status==='blocked'?match.message:'Calendar unavailable'}</p>
          <p>{rounds??'Unknown'} official Swiss rounds · {values.results.length} player results · Review revision {draft.corrections.length}</p>
          {future&&<p className="import-error">Future events cannot be published before the tournament takes place.</p>}
          {rehearsal&&<p className="calendar-notice" role="status"><strong>2026 preseason rehearsal.</strong> This draft cannot become an official 2027 result. Match against existing TEST players and complete the review below without publishing or registering official players.</p>}
          {!rehearsal&&!classMatches&&<p className="import-error">This event does not match an eligible 2027 league event. <Link to={`/official-import?draft=${draft.importId}`}>Review the tournament again</Link> before publishing.</p>}
        </div>
        <div className="sandbox-table publication-table"><table>
          <thead><tr><th>Store player</th><th>W-L-D</th><th>Place</th><th>Points preview</th><th>{rehearsal?'Test player':'Official player'}</th></tr></thead>
          <tbody>{values.results.map((row,i)=>{
            const selection=linked.find(x=>x.rowId===row.rowId);
            return <tr key={row.rowId}>
              <th scope="row">{row.importedName}</th>
              <td>{row.wins??'?'}-{row.losses??'?'}-{row.draws??'?'}</td>
              <td>{row.finalPosition??'—'}</td>
              <td>{points[i]??'—'}</td>
              <td><select aria-label={`Match ${row.importedName}`} disabled={busy} value={selection?.playerId??''}
                  onChange={e=>setPlayer(row.rowId,{playerId:e.target.value})}>
                <option value="">{rehearsal?'New test player (rehearsal only)':'Register new player'}</option>
                {availablePlayers.map(player=><option value={player.id} key={player.id}>Existing: {player.display_name}</option>)}
              </select>
              {!selection?.playerId&&<input aria-label={`Name for ${row.importedName}`} maxLength={120}
                disabled={busy} value={selection?.displayName??''} onChange={e=>setPlayer(row.rowId,{displayName:e.target.value})}/>}
              </td>
            </tr>;
          })}</tbody>
        </table></div>
        <p className="import-hint">{roster.length} existing {registry} players available. Matching names are suggested but must be verified. Choosing a new player does not merge identities. {rehearsal?'This rehearsal does not create or save player identities.':'New players are registered only when the official event is successfully published.'}</p>
        <label>{rehearsal?'Rehearsal review note':'Publication reason'} <textarea rows={2} maxLength={2000} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);setRehearsalDone(false)}}/></label>
        {blocker&&<p className="import-error" role="alert">{blocker}</p>}
        <label className="sandbox-confirm"><input type="checkbox"
          disabled={busy||future||(!classMatches&&!rehearsal)||!recordsValid||!rosterValid||!!publishedId||rehearsalDone}
          checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
          {rehearsal
            ?'I verified the store results, event date, match records, and every test-player identity. Complete this rehearsal without publishing official results.'
            :'I verified the store\'s results, date, scheduled rounds, final placements when applicable, and every player identity. Publish these records as official league results.'}
        </label>
        {rehearsal
          ?<button type="button" disabled={!canCompleteRehearsal} onClick={()=>{setRehearsalDone(true);setConfirmed(false);setStatus('Preseason matching rehearsal completed in this session. No official results or players were created.');}}>Complete matching rehearsal</button>
          :<button disabled={!canPublish} onClick={()=>void publish()}>{busy?'Publishing…':'Publish Results'}</button>}
        {rehearsalDone&&<p className="sandbox-success" role="status">Matching rehearsal finished. Nothing was published or saved to official standings.</p>}
        {publishedId&&<p className="sandbox-success" role="status">Published official tournament result {publishedId}. The event is now part of the official records.</p>}
        <p className="import-hint">Published results can be corrected only through the audited official correction workflow. Original publication history remains immutable.</p>
      </>}
    </>}
    <p><Link to="/correct-official-results">Correct already published official results</Link></p>
    <p><Link to="/admin">Back to administration</Link></p>
  </section>;
}
