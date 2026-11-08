import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabaseConfiguration } from '../data/client';
import { leagueRepository } from '../data/repository';
import { effectiveValues, potentialPlayers } from '../results';
import type { ImportDraft, ImportedResult } from '../results';
import { suggestDisplayName } from '../importInfrastructure/displayNames';
import { calculateStandings } from '../scoring/standings';
import { calculateRegularEventPoints } from '../scoring/regular';
import type { StandingsInput } from '../scoring/standings';
import type { Json } from '../data/database';

type Person = {id:string;display_name:string;created_at:string};
type Alias = {player_id:string;alias:string};
type Tournament = {id:string;draft_id:string;revision:number;event_name:string;season_ordinal:number;scheduled_rounds:number;created_at:string};
type Result = {tournament_id:string;row_id:string;player_id:string;wins:number;losses:number;draws:number};
type Entry = {row:ImportedResult;playerId:string;displayName:string};
const seasonIds=['s1','s2','s3','s4'];
const reviewName=(value:string) => suggestDisplayName(value);
function datedEventName(name:string,date:string):string {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if(!match)return name.trim();
  const suffix=match[2]+match[3]+match[1].slice(-2);
  const base=name.trim().replace(/\s+-\s+\d{6}$/,'');
  return base.endsWith(suffix)?base:`${base} - ${suffix}`;
}
export function TestWorkspacePage({editMode=false}:{editMode?:boolean}) {
  const [searchParams]=useSearchParams();
  const incomingDraft=searchParams.get('draft');
  const {client}=supabaseConfiguration;
  const [access,setAccess]=useState('Checking administrator access…');
  const [allowed,setAllowed]=useState(false);
  const [people,setPeople]=useState<Person[]>([]);
  const [aliases,setAliases]=useState<Alias[]>([]);
  const [draftOptions,setDraftOptions]=useState<{id:string}[]>([]);
  const [events,setEvents]=useState<Tournament[]>([]);
  const [savedResults,setSavedResults]=useState<Result[]>([]);
  const [draft,setDraft]=useState<ImportDraft|null>(null);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [draftId,setDraftId]=useState('');
  const [eventName,setEventName]=useState('');
  const [season,setSeason]=useState('1');
  const [rounds,setRounds]=useState('4');
  const [newName,setNewName]=useState('');
  const [aliasPlayer,setAliasPlayer]=useState('');
  const [aliasText,setAliasText]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [tab,setTab]=useState<'players'|'events'|'standings'>(editMode||incomingDraft?'events':'players');
  const [mappingReviewed,setMappingReviewed]=useState(false);

  async function refresh() {
    if (!client) return;
    const repository=leagueRepository(client);
    const [pr,ar,dr,ev,re]=await Promise.all([
      client.from('sandbox_players').select('*').order('display_name'),
      client.from('sandbox_player_aliases').select('*'),
      repository.drafts(),
      client.from('sandbox_tournaments').select('*').order('created_at'),
      client.from('sandbox_results').select('*'),
    ]);
    if(pr.error||ar.error||ev.error||re.error) throw new Error('Test workspace could not be loaded.');
    setPeople(pr.data ?? []);setAliases(ar.data ?? []);
    setDraftOptions(dr ?? []);setEvents(ev.data ?? []);setSavedResults(re.data ?? []);
  }
  useEffect(()=>{
    if(!client){setAccess('Supabase is not configured.');return;}
    let active=true;let generation=0;
    async function verify(){
      const version=++generation;
      try{
        const {data}=await client!.auth.getUser();
        const admin=!!data.user && await leagueRepository(client!).isAdministrator();
        if(!active||version!==generation)return;
        setAllowed(admin);setAccess(admin?'':'Administrator sign-in required.');
        if(admin)await refresh();
      }catch{if(active&&version===generation){setAllowed(false);setAccess('Unable to verify administrator access.');}}
    }
    void verify();
    const {data:{subscription}}=client.auth.onAuthStateChange(()=>setTimeout(()=>{if(active)void verify();},0));
    return ()=>{active=false;generation++;subscription.unsubscribe();};
  },[client]);
  async function action(job:()=>Promise<void>) {
    if(busy)return;
    setError('');setMessage('');setBusy(true);
    try{await job();}catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{setBusy(false);}
  }
  const roster=people.map(p=>({playerId:p.id,displayName:p.display_name,aliases:aliases.filter(a=>a.player_id===p.id).map(a=>a.alias)}));
  function propose(name:string):string {
    const matches=potentialPlayers(name,roster);
    return matches.length===1?matches[0].playerId:'';
  }
  async function loadDraft(id:string){
    if(!client||!id)return;
    await action(async()=>{
      const loaded=await leagueRepository(client).loadDraft(id);
      if(!loaded.corrections.length)throw new Error('Review and save the screenshot results first.');
      const values=effectiveValues(loaded);
      const existing=events.find(e=>e.draft_id===id);
      setDraft(loaded);setDraftId(id);setTab('events');setMappingReviewed(false);
      setEventName(existing?.event_name??values.tournament.name??'');
      setSeason(String(existing?.season_ordinal??1));
      setRounds(String(existing?.scheduled_rounds??values.tournament.scheduledRounds??4));
      setEntries(values.results.map(row=>({
        row,
        playerId:savedResults.find(r=>r.tournament_id===existing?.id && r.row_id===row.rowId)?.player_id??propose(row.importedName),
        displayName:reviewName(row.importedName),
      })));
      setMessage('Check the player identities, spelling and match records before registering this test tournament.');
    });
  }
  useEffect(()=>{
    if(allowed && incomingDraft && draftOptions.some(d=>d.id===incomingDraft) && draftId!==incomingDraft) void loadDraft(incomingDraft);
  },[allowed,incomingDraft,draftOptions,draftId]);

  async function createPlayer() {
    if(!client)return;
    await action(async()=>{
      const name=reviewName(newName);
      if(name.length<2||name.length>120)throw new Error('Enter a valid player display name.');
      const {error}=await client.from('sandbox_players').insert({display_name:name});
      if(error)throw new Error(error.message);
      setNewName('');await refresh();setMessage('Test player created. Similar names remain separate until reviewed.');
    });
  }
  async function addAlias(){
    if(!client||!aliasPlayer)return;
    await action(async()=>{
      const alias=aliasText.trim();
      if(!alias||alias.length>120)throw new Error('Enter a Companion name.');
      const {error}=await client.from('sandbox_player_aliases').insert({player_id:aliasPlayer,alias});
      if(error)throw new Error(error.message);
      setAliasText('');await refresh();setMessage('Companion name recorded for suggestions only.');
    });
  }
  async function saveEvent(){
    if(!client||!draft)return;
    await action(async()=>{
      const n=Number(rounds),s=Number(season);
      if(!Number.isSafeInteger(n)||n<1||n>20||!seasonIds[s-1])throw new Error('Choose a season and Swiss round count.');
      if(!mappingReviewed)throw new Error('Confirm that you reviewed the identities and results.');
      if(!entries.length||entries.some(e=>(!e.playerId&&!e.displayName.trim())||e.row.wins===null||e.row.losses===null||e.row.draws===null))
        throw new Error('Every player requires a name or existing match and a complete match record.');
      const existingIds=entries.filter(e=>e.playerId).map(e=>e.playerId);
      if(new Set(existingIds).size!==existingIds.length)throw new Error('One registered player appears more than once. Correct the mapping.');
      if(entries.some(e=>e.row.wins!+e.row.losses!+e.row.draws!>n))throw new Error('Match totals exceed scheduled rounds.');
      const links=entries.map(e=>({row_id:e.row.rowId,player_id:e.playerId||null,display_name:e.playerId?null:e.displayName.trim(),wins:e.row.wins!,losses:e.row.losses!,draws:e.row.draws!}));
      const response=await client.rpc('import_sandbox_tournament_with_players',{
        p_draft:draft.importId,p_revision:draft.corrections.length,p_name:datedEventName(eventName,effectiveValues(draft).tournament.date),
        p_season:s,p_rounds:n,p_links:links as unknown as Json,
      });
      if(response.error)throw new Error(response.error.message);
      await refresh();setTab('standings');setMappingReviewed(false);setMessage('Test tournament saved. The updated private standings are displayed below. Official standings remain unchanged.');
    });
  }
  const input:StandingsInput={
    year:2027,seasonIds,
    players:people.map(p=>({playerId:p.id,name:p.display_name})),
    regularEvents:events.map(event=>({
      eventId:event.id,year:2027,seasonId:`s${event.season_ordinal}`,
      results:savedResults.filter(r=>r.tournament_id===event.id).map(r=>({
        playerId:r.player_id,wins:r.wins,draws:r.draws,scheduledRounds:event.scheduled_rounds,
      }))
    })),championships:[],
  };
  let standings:ReturnType<typeof calculateStandings>|null=null;
  let scoringError='';
  try{standings=calculateStandings(input);}catch(e){scoringError=e instanceof Error?e.message:'Standings unavailable';}

  return <section className="container admin-page sandbox-workspace">
    <p className="eyebrow">ADMIN ONLY / PRESEASON TEST</p>
    <h1>{editMode ? "Edit a Tournament’s Results" : "Test workspace"}</h1>
    <p>No content on this page is official. All tournament points are simulated under the 2027 scoring rules; none are published to the public leaderboard.</p>
    {!allowed?<p role="status">{access} <Link to="/admin">Administrator sign in</Link></p>:<>
      {!editMode&&<nav className="sandbox-tabs" aria-label="Test workspace sections">
        <button aria-pressed={tab==='players'} onClick={()=>setTab('players')}>Players</button>
        <button aria-pressed={tab==='events'} onClick={()=>setTab('events')}>Tournament matching</button>
        <button aria-pressed={tab==='standings'} onClick={()=>setTab('standings')}>Test leaderboard</button>
      </nav>}
      {(error||message)&&<p role="status" className={error?'sandbox-error':'sandbox-success'}>{error||message}</p>}
      {tab==='players'&&<div className="sandbox-section">
        <h2>Registered test players ({people.length})</h2>
        <form onSubmit={e=>{e.preventDefault();void createPlayer();}}>
          <label>Preferred leaderboard name<input value={newName} maxLength={120} onChange={e=>setNewName(e.target.value)} placeholder="Firstname Lastname" required /></label>
          <button disabled={busy||!newName.trim()}>Add test player</button>
        </form>
        <p>A player’s display name is independent of the spelling used in Companion. Capitalization does not establish identity.</p>
        {people.length>0&&<><div className="sandbox-table"><table><thead><tr><th>Display name</th><th>Companion names</th></tr></thead><tbody>
          {people.map(p=><tr key={p.id}><td>{p.display_name}</td><td>{aliases.filter(a=>a.player_id===p.id).map(a=>a.alias).join(', ')||'—'}</td></tr>)}
        </tbody></table></div>
        <form onSubmit={e=>{e.preventDefault();void addAlias();}}>
          <label>Player<select required value={aliasPlayer} onChange={e=>setAliasPlayer(e.target.value)}><option value="">Choose player</option>{people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
          <label>Companion spelling<input required maxLength={120} value={aliasText} onChange={e=>setAliasText(e.target.value)} placeholder="Name as entered by player"/></label>
          <button disabled={busy||!aliasPlayer||!aliasText.trim()}>Add Companion name</button>
        </form></>}
      </div>}
      {tab==='events'&&<div className="sandbox-section">
        <h2>{editMode ? (draft ? "Review and save corrections" : "Saved tournaments") : "Confirm players and test results"}</h2>
        {!editMode&&<p>Select a saved screenshot review. Unrecognized players are registered automatically on save. Verify suggested existing matches.</p>}
        {!editMode&&<label>Reviewed screenshot <select value={draftId} disabled={busy} onChange={e=>{const id=e.target.value;if(id)void loadDraft(id);}}>
          <option value="">Select a private review</option>{draftOptions.map(d=><option key={d.id} value={d.id}>{events.find(e=>e.draft_id===d.id)?.event_name??`Reviewed draft ${d.id.slice(0,8)}`}</option>)}
        </select></label>}
        {editMode&&draft&&<button type="button" onClick={()=>{setDraft(null);setDraftId("");setMessage("");setError("");}} disabled={busy}>Back to saved tournaments</button>}
        {(!editMode||draft)&&draft&&<div className="sandbox-event-editor">
          <label>Test event name (date added automatically)<input value={eventName} maxLength={200} onChange={e=>{setEventName(e.target.value);setMappingReviewed(false)}}/></label>
          <label>Simulated 2027 season<select value={season} onChange={e=>{setSeason(e.target.value);setMappingReviewed(false)}}>{seasonIds.map((v,i)=><option key={v} value={String(i+1)}>Season {i+1}</option>)}</select></label>
          <label>Scheduled Swiss rounds<input type="number" min={1} max={20} value={rounds} onChange={e=>{setRounds(e.target.value);setMappingReviewed(false)}}/></label>
          <div className="sandbox-table sandbox-match-table"><table><thead><tr><th>Companion name</th><th>W</th><th>L</th><th>D</th><th>Place</th><th>Projected points</th><th>Test player / display name</th></tr></thead><tbody>
          {entries.map((entry,i)=><tr key={entry.row.rowId}>
            <td data-label="Companion name" className="match-player-name">{entry.row.importedName}</td>
            <td data-label="Wins">{entry.row.wins??'?'}</td><td data-label="Losses">{entry.row.losses??'?'}</td><td data-label="Draws">{entry.row.draws??'?'}</td><td data-label="Place">{entry.row.finalPosition??'—'}</td>
            <td data-label="Projected points">{Number.isSafeInteger(Number(rounds)) && Number(rounds)>0 && entry.row.wins!==null && entry.row.losses!==null && entry.row.draws!==null && entry.row.wins+entry.row.losses+entry.row.draws<=Number(rounds) ? calculateRegularEventPoints({wins:entry.row.wins,draws:entry.row.draws,scheduledRounds:Number(rounds)}).toFixed(2) : '—'}</td>
            <td data-label="Leaderboard player" className="match-player-select"><select aria-label={`Match ${entry.row.importedName}`} value={entry.playerId} disabled={busy} onChange={e=>{setEntries(previous=>previous.map((v,index)=>i===index?{...v,playerId:e.target.value}:v));setMappingReviewed(false)}}>
              <option value="">Register new test player</option>{people.map(p=><option value={p.id} key={p.id}>Existing: {p.display_name}</option>)}
            </select>{!entry.playerId && <input aria-label={`Display name for ${entry.row.importedName}`} maxLength={120} value={entry.displayName} disabled={busy} onChange={e=>{setEntries(previous=>previous.map((v,index)=>i===index?{...v,displayName:e.target.value}:v));setMappingReviewed(false)}} />}</td>
          </tr>)}</tbody></table></div>
          <p className="sandbox-note">Saved event name: {datedEventName(eventName,effectiveValues(draft).tournament.date)}</p>
          <p className="sandbox-note">Projected points use regular-event scoring only; placement does not affect regular-event points. To correct the screenshot values, return to <Link to={`/official-import?draft=${encodeURIComponent(draft.importId)}${editMode?'&return=edit-tournaments':''}`}>edit the screenshot results</Link> and edit its saved review. New players are created on save. Select an existing player only after confirming identity.</p>
          <label className="sandbox-confirm"><input type="checkbox" checked={mappingReviewed} onChange={e=>setMappingReviewed(e.target.checked)}/> I verified player identities, display names, match records and test-event details.</label>
          <button disabled={busy||!entries.length||!mappingReviewed} onClick={()=>void saveEvent()}>Save tournament and update test standings</button>
          <p className="sandbox-note">No official approvals or published results are created.</p>
        </div>}
        {events.length>0&&(!editMode||!draft)&&<div className="sandbox-table"><h3>{editMode?"Choose a tournament to edit":"Matched test tournaments"}</h3><table><thead><tr><th>Test event</th><th>Season</th><th>Rounds</th><th>Players</th><th>Actions</th></tr></thead><tbody>
          {events.map(ev=><tr key={ev.id}><td>{editMode?<button type="button" className="sandbox-event-link" disabled={busy} onClick={()=>void loadDraft(ev.draft_id)}>{ev.event_name}</button>:ev.event_name}</td><td>{ev.season_ordinal}</td><td>{ev.scheduled_rounds}</td><td>{savedResults.filter(r=>r.tournament_id===ev.id).length}</td><td><button type="button" disabled={busy} onClick={()=>void loadDraft(ev.draft_id)}>Edit test tournament</button></td></tr>)}
        </tbody></table></div>}
      </div>}
      {tab==='standings'&&<div className="sandbox-section">
        <h2>2027 scoring simulation</h2>
        <p>Private test leaderboard. These are hypothetical 2027 points calculated from the matched preseason imports—not published league results. <Link to="/official-import">Upload another tournament</Link>.</p>
        {scoringError&&<p role="alert">{scoringError}</p>}
        {standings&&<><label>Period<select value={season} onChange={e=>setSeason(e.target.value)}>{seasonIds.map((id,i)=><option key={id} value={String(i+1)}>Season {i+1}</option>)}<option value="5">Annual</option></select></label>
        <div className="sandbox-table"><table><thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Events</th></tr></thead><tbody>
        {(season==='5'?standings.annual.standings:standings.seasons[Number(season)-1].afterChampionship.standings).map(r=><tr key={r.playerId}><td>{r.rank}</td><td>{r.name}</td><td>{r.totalPoints.toFixed(2)}</td><td>{r.regularEventCount}</td></tr>)}
        </tbody></table></div></>}
        {!events.length&&<p>No matched tournament events yet. Add test players and match the reviewed screenshot first.</p>}
      </div>}
    </>}
  </section>;
}
