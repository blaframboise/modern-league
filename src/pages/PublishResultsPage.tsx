import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabaseConfiguration } from '../data/client';
import { leagueRepository } from '../data/repository';
import { effectiveValues, potentialPlayers } from '../results';
import type { ImportDraft } from '../results';
import { suggestDisplayName } from '../importInfrastructure/displayNames';
import { fetchDraftLabels } from '../importInfrastructure/draftLabels';
import { resolveScheduledEvent } from '../calendar/importMatch';
import { parseCalendarOverrides } from '../calendar/scheduler';
import { calculateRegularEventPoints } from '../scoring/regular';
import { calculateChampionshipPoints } from '../scoring/championship';
import { ImportProgress } from '../components/ImportProgress';
import type { Json } from '../data/database';

type OfficialPlayer={id:string;display_name:string};
type Alias={player_id:string;alias:string};
type Linked={rowId:string;playerId:string;displayName:string};
type SavedCalendar={revision:number;overrides:ReturnType<typeof parseCalendarOverrides>};
type MatchRegistry='official'|'test';
const roundsKey=(id:string,revision:number)=>`modern-league:swiss-rounds:${id}:r${revision}`;
type SavedTest={id:string;draft_id:string;event_name:string;revision:number};
const mappingKey=(id:string,revision:number)=>`modern-league:player-matches:${id}:r${revision}`;

/** This is the only entry point for official publication; sandbox records never enter this flow. */
export function PublishResultsPage(){
  const client=supabaseConfiguration.client;
  const [params]=useSearchParams();
  const requestedDraft=params.get('draft');
  const [authorized,setAuthorized]=useState(false);
  const [loading,setLoading]=useState(true);
  const [status,setStatus]=useState('Checking administrator access…');
  const [drafts,setDrafts]=useState<{id:string;created_at?:string;original?:unknown}[]>([]);
  const [draftLabels,setDraftLabels]=useState<Record<string,string>>({});
  const autoResumeAttempted=useRef(false);
  const [draft,setDraft]=useState<ImportDraft|null>(null);
  const [players,setPlayers]=useState<OfficialPlayer[]>([]);
  const [aliases,setAliases]=useState<Alias[]>([]);
  const [testPlayers,setTestPlayers]=useState<OfficialPlayer[]>([]);
  const [testAliases,setTestAliases]=useState<Alias[]>([]);
  const [rehearsalDone,setRehearsalDone]=useState(false);
  const [savedTests,setSavedTests]=useState<SavedTest[]>([]);
  const [savedTestId,setSavedTestId]=useState('');
  const [linked,setLinked]=useState<Linked[]>([]);
  const [calendar,setCalendar]=useState<SavedCalendar|null>(null);
  const [reason,setReason]=useState('Administrator verified store results and all player identities.');
  const [roundsOverride,setRoundsOverride]=useState('');
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
  const enteredRounds=/^\d+$/.test(roundsOverride)?Number(roundsOverride):null;
  const rounds=values?.tournament.scheduledRounds ?? (rehearsal?enteredRounds:null);
  const recordsValid=!!rounds&&Number.isSafeInteger(rounds)&&rounds>0&&rounds<=20&&!!values?.results.length&&
    values.results.every(row=>row.importedName.trim()&&row.wins!==null&&row.losses!==null&&row.draws!==null&&
      Number.isSafeInteger(row.wins)&&Number.isSafeInteger(row.losses)&&Number.isSafeInteger(row.draws)&&
      row.wins>=0&&row.losses>=0&&row.draws>=0&&row.wins+row.losses+row.draws<=rounds&&
      (match?.status!=='matched'||match.kind==='regular'||!!row.finalPosition));
  const validationIssues:string[]=[];
  if(draft && values){
    if(!rounds || !Number.isSafeInteger(rounds) || rounds<1 || rounds>20)
      validationIssues.push('Swiss rounds: select the total rounds played (1–20) before continuing.');
    if(!values.results.length)validationIssues.push('No player results are saved. Return to screenshot review.');
    values.results.forEach((row,index)=>{
      const label=row.importedName.trim()||`Player ${index+1}`;
      const missing=[
        row.wins===null?'wins':null,row.losses===null?'losses':null,row.draws===null?'draws':null,
      ].filter(Boolean);
      if(missing.length)validationIssues.push(`${label}: missing ${missing.join(', ')}.`);
      else if(rounds && Number.isSafeInteger(rounds) &&
        row.wins!+row.losses!+row.draws!>rounds)
        validationIssues.push(`${label}: match record exceeds ${rounds} Swiss rounds.`);
      if(match?.status==='matched' && match.kind!=='regular' && !row.finalPosition)
        validationIssues.push(`${label}: championship final placement is missing.`);
    });
  }
  const duplicateIds=linked.filter(x=>x.playerId).map(x=>x.playerId);
  if(duplicateIds.length!==new Set(duplicateIds).size)validationIssues.push('Two rows are matched to the same registered player. Correct the selections below.');
  if(linked.some(x=>!x.playerId&&x.displayName.trim().length<2))
    validationIssues.push('Some new players have no display name. Enter at least two characters for every new player.');
  const canPublish=authorized&&!busy&&!publishedId&&confirmed&&!!reason.trim()&&
    !!draft?.corrections.length&&classMatches&&!future&&rosterValid&&recordsValid;
  const canCompleteRehearsal=authorized&&!busy&&rehearsal&&!rehearsalDone&&confirmed&&
    !!draft?.corrections.length&&!!reason.trim()&&rosterValid&&recordsValid;
  const blocker=!draft?'':validationIssues.length?validationIssues[0]:future?'This event is in the future. Publication is not yet available.':
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
        const [ds,pr,al,cal,testPr,testAl,previousTests]=await Promise.all([
          leagueRepository(client).drafts(),
          client.from('players').select('id,display_name').order('display_name'),
          client.from('player_identities').select('player_id,alias'),
          client.from('proposed_calendar_settings').select('revision,overrides').eq('year',2027).single(),
          client.from('sandbox_players').select('id,display_name').order('display_name'),
          client.from('sandbox_player_aliases').select('player_id,alias'),
          client.from('sandbox_tournaments').select('id,draft_id,event_name,revision'),
        ]);
        if(pr.error||al.error||cal.error||!cal.data||testPr.error||testAl.error||previousTests.error)
          throw Error('Unable to load the saved calendar and player registries.');
        const parsed=parseCalendarOverrides(cal.data.overrides);
        if(active){
          setAuthorized(true);setDrafts(ds??[]);setPlayers(pr.data??[]);setAliases(al.data??[]);
          setTestPlayers(testPr.data??[]);setTestAliases(testAl.data??[]);setSavedTests(previousTests.data??[]);
          setCalendar({revision:cal.data.revision,overrides:parsed});
          setStatus('Private administrator review · Nothing is published automatically.');
        }
      }catch(e){if(active)setStatus(e instanceof Error?e.message:'Publication unavailable.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[client]);

  useEffect(()=>{
    if(!client||!authorized||!drafts.length){setDraftLabels({});return;}
    let active=true;
    void fetchDraftLabels(client,drafts).then(labels=>{if(active)setDraftLabels(labels);})
      .catch(()=>{if(active)setError('Could not retrieve saved tournament names.');});
    return()=>{active=false;};
  },[client,authorized,drafts]);

  useEffect(()=>{
    if(!client||!authorized||!requestedDraft||!drafts.some(d=>d.id===requestedDraft))return;
    void loadDraft(requestedDraft);
  // One-time preselection; further selections are handled by the native select.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authorized,requestedDraft,drafts,client]);

  // When entering from Administration without a draft link, reopen the most recent
  // REVIEWED event. Never guess from an unfinished screenshot or repeatedly
  // override the administrator's manual selection.
  useEffect(()=>{
    if(!authorized||requestedDraft||autoResumeAttempted.current||!drafts.length||!Object.keys(draftLabels).length)return;
    autoResumeAttempted.current=true;
    const reviewed=[...drafts].reverse().find(item=>{
      const label=draftLabels[item.id];
      return label && !label.startsWith('Unreviewed screenshot');
    });
    if(reviewed)void loadDraft(reviewed.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authorized,requestedDraft,drafts,draftLabels]);

  async function loadDraft(id:string){
    if(!client)return;
    setBusy(true);setError('');setDraft(null);setConfirmed(false);setPublishedId('');setRehearsalDone(false);setSavedTestId('');setRoundsOverride('');
    try{
      const incoming=await leagueRepository(client).loadDraft(id);
      if(!incoming.corrections.length)throw Error('This screenshot has not been reviewed and saved.');
      setDraft(incoming);
      try {setRoundsOverride(localStorage.getItem(roundsKey(id,incoming.corrections.length))||'');} catch {setRoundsOverride('');}
      const seen=new Set<string>();
      const initial=effectiveValues(incoming).results.map(row=>{
        const selectedRoster=effectiveValues(incoming).tournament.date.slice(0,4)<'2027'
          ? testPlayers.map(p=>({playerId:p.id,displayName:p.display_name,aliases:testAliases.filter(a=>a.player_id===p.id).map(a=>a.alias)}))
          : roster;
        const candidates=potentialPlayers(row.importedName,selectedRoster);
        const playerId=candidates.length===1&&!seen.has(candidates[0].playerId)?candidates[0].playerId:'';
        if(playerId)seen.add(playerId);
        return {rowId:row.rowId,playerId,displayName:suggestDisplayName(row.importedName)};
      });
      // Keep incomplete selections on this device so an interrupted Home Screen
      // session can resume; actual test records are saved server-side on approval.
      try {
        const cached=JSON.parse(localStorage.getItem(mappingKey(id,incoming.corrections.length))||'null');
        if(Array.isArray(cached) && cached.length===initial.length &&
           initial.every(row=>cached.some((entry:Linked)=>entry.rowId===row.rowId)) &&
           cached.every((entry:Linked)=>typeof entry.playerId==='string' && typeof entry.displayName==='string')) {
          setLinked(initial.map(row=>cached.find((entry:Linked)=>entry.rowId===row.rowId)??row));
        } else setLinked(initial);
      } catch {setLinked(initial);}
      const saved=savedTests.find(t=>t.draft_id===id);
      if(saved)setStatus('Saved test tournament found. You can review the matching and test standings again.');
      else setStatus('Saved screenshot review loaded. Confirm each player match before saving a test event.');
    }catch(e){setError(e instanceof Error?e.message:'Unable to load review.');}
    finally{setBusy(false);}
  }

  function setPlayer(rowId:string,patch:Partial<Linked>){
    setConfirmed(false);
    setLinked(old=>{
      const next=old.map(item=>item.rowId===rowId?{...item,...patch}:item);
      if(draft) {
        try {localStorage.setItem(mappingKey(draft.importId,draft.corrections.length),JSON.stringify(next));}catch{/* device storage disabled */}
      }
      return next;
    });
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

  async function saveRehearsal(){
    if(!client||!draft||!values||!canCompleteRehearsal)return;
    setBusy(true);setError('');
    try {
      const response=await client.rpc('import_sandbox_tournament_with_players',{
        p_draft:draft.importId,
        p_revision:draft.corrections.length,
        p_name:`${values.tournament.name.trim()} - ${values.tournament.date}`,
        p_season:1,
        p_rounds:rounds!,
        p_links:linked.map(entry=>{
          const result=values.results.find(row=>row.rowId===entry.rowId)!;
          return {row_id:entry.rowId,player_id:entry.playerId||null,
            display_name:entry.playerId?null:entry.displayName.trim(),
            wins:result.wins,losses:result.losses,draws:result.draws};
        }) as unknown as Json,
      });
      if(response.error)throw Error(response.error.message);
      setSavedTestId(response.data);
      setRehearsalDone(true);setConfirmed(false);
      try {localStorage.removeItem(mappingKey(draft.importId,draft.corrections.length));localStorage.removeItem(roundsKey(draft.importId,draft.corrections.length));}catch{/* ignored */}
      setStatus('Saved to private TEST TOURNAMENTS. Player registrations, matches and results persist across sessions. Nothing was published officially.');
    }catch(e){setError(e instanceof Error?e.message:'Test save failed. No official results were changed.');}
    finally{setBusy(false);}
  }

  return <section className="container admin-page official-publication">
    <p className="eyebrow">ADMINISTRATION / OFFICIAL LEAGUE</p>
    <h1>{rehearsal?'Test Tournament — Player Matching':'Match and Publish Results'}</h1>
    {authorized&&<ImportProgress stage={publishedId||rehearsalDone?6:confirmed&&recordsValid&&rosterValid?5:4} draftId={draft?.importId} />}
    {!publishedId&&!savedTestId&&<p className="workflow-intro">Match the names from the reviewed screenshot to players. Check any missing event details, then use the final confirmation to save. Preseason events save to private test standings; eligible 2027 events use official publication.</p>}
    <p role="status">{status}</p>
    {!authorized?loading?<p>Checking access…</p>:<Link to="/admin">Administrator sign in</Link>:<>
      {(publishedId||savedTestId)&&<section className="submission-complete" role="status" aria-label="Tournament saved successfully">
        <div className="submission-complete-marker" aria-hidden="true">✓</div>
        <p className="eyebrow">{savedTestId?'PRIVATE TEST TOURNAMENT':'OFFICIAL TOURNAMENT'}</p>
        <h2>{savedTestId?'Test tournament saved':'Official tournament published'}</h2>
        <p><strong>{values?.tournament.name||'Tournament'}</strong> {values?.tournament.date? '· '+values.tournament.date:''}</p>
        <p>{savedTestId
          ?'Player matches and results are saved in the private test workspace. Official 2027 standings have not changed.'
          :'The tournament is recorded in the official league ledger. Review the public standings to confirm the published result.'}</p>
        <h3>Next: Review the saved results</h3>
        <div className="submission-next-actions">
          <Link className="submission-action submission-action-primary" to={savedTestId?'/test-workspace?view=standings':'/leaderboards'}>
            {savedTestId?'1. View test standings':'1. View official standings'}
          </Link>
          <Link className="submission-action" to={savedTestId?'/edit-tournaments':'/correct-official-results'}>
            {savedTestId?'2. Correct saved test results':'2. Correct official results'}
          </Link>
          <Link className="submission-action" to="/official-import">Upload another tournament</Link>
          <Link className="submission-action" to="/admin">Return to administration</Link>
        </div>
        <p className="submission-complete-note">Your saved tournament remains available after you close this app.</p>
      </section>}
      {!publishedId&&!savedTestId&&<section className="admin-resume-panel" aria-label="Resume saved tournament">
        <h2>Resume a tournament</h2>
        <p>Saved screenshot reviews remain available after closing the app. Choose the event by name and date.</p>
        <label htmlFor="reviewed-tournament-picker">Choose a saved event <span className="control-hint">Tap the bordered box to select a tournament</span></label>
        <select id="reviewed-tournament-picker" aria-label="Reviewed tournament" value={draft?.importId??''} disabled={busy} onChange={e=>void loadDraft(e.target.value)}>
          <option value="">Select saved screenshot review</option>
          {drafts.map(d=><option key={d.id} value={d.id}>{draftLabels[d.id]??`Loading saved event · ${d.id.slice(0,8)}`}</option>)}
        </select>
        <p className="admin-resume-note">{draft?'Review loaded. Player selections are retained on this device until saved.':busy?'Opening your most recent review…':'Select the event above to continue matching players.'}</p>
        {draft&&<div className="admin-resume-actions"><Link to={`/official-import?draft=${encodeURIComponent(draft.importId)}`}>Edit screenshot review</Link><Link to={`/test-workspace?view=standings`}>View test standings</Link></div>}
      </section>}
      {error&&<p className="import-error" role="alert">{error}</p>}
      {!publishedId&&!savedTestId&&draft&&values&&<>
        <div className="publication-summary">
          <strong>{values.tournament.name||'Unnamed tournament'}</strong>
          <p>Date: <time dateTime={values.tournament.date}>{values.tournament.date||'Missing'}</time></p>
          <p>Calendar: {match?.status==='matched'? `${match.code} · ${match.description}`:match?.status==='blocked'?match.message:'Calendar unavailable'}</p>
          <p>{values.results.length} player results · Review revision {draft.corrections.length}</p>
          {rehearsal&&<label className="required-rounds" htmlFor="verified-rounds">
            <strong>Swiss rounds played {values.tournament.scheduledRounds?'(from screenshot)':'— REQUIRED'}</strong>
            <span>Confirm the number of Swiss rounds from the store's results. This was not captured in tonight's saved screenshot review.</span>
            <select id="verified-rounds" aria-label="Swiss rounds played" disabled={busy||!!values.tournament.scheduledRounds}
              value={rounds?String(rounds):''} onChange={e=>{setRoundsOverride(e.target.value);setConfirmed(false);if(draft)try{localStorage.setItem(roundsKey(draft.importId,draft.corrections.length),e.target.value);}catch{/* unavailable */}}}>
              <option value="">Select number of rounds…</option>
              {Array.from({length:20},(_,i)=>i+1).map(n=><option value={n} key={n}>{n} round{n===1?'':'s'}</option>)}
            </select>
          </label>}
          {future&&<p className="import-error">Future events cannot be published before the tournament takes place.</p>}
          {rehearsal&&<p className="calendar-notice" role="status"><strong>2026 preseason rehearsal.</strong> This date is outside the official 2027 league. Matching and approval will SAVE an actual TEST tournament, register new TEST players and update private TEST standings. Official records remain untouched.</p>}
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
        <p className="import-hint">{roster.length} existing {registry} players available. Matching names are suggested but must be verified. Choosing a new player does not merge identities. {rehearsal?'New test players and matching results are saved to the private TEST registry when you approve.':'New players are registered only when the official event is successfully published.'}</p>
        <label>{rehearsal?'Rehearsal review note':'Publication reason'} <textarea rows={2} maxLength={2000} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);setRehearsalDone(false)}}/></label>
        {validationIssues.length>0&&<section className="validation-issues" role="alert">
          <h2>Complete these fields before saving</h2>
          <ul>{validationIssues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>
          <p>Missing or incorrect screenshot values can be fixed in <Link to={`/official-import?draft=${encodeURIComponent(draft.importId)}`}>screenshot review</Link>.</p>
        </section>}
        {blocker&&!validationIssues.length&&<p className="import-error" role="alert">{blocker}</p>}
        <label className="sandbox-confirm"><input type="checkbox"
          disabled={busy||future||(!classMatches&&!rehearsal)||!recordsValid||!rosterValid||!!publishedId||rehearsalDone}
          checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
          {rehearsal
            ?'I verified the store results, event date, match records, and every test-player identity. Complete this rehearsal without publishing official results.'
            :'I verified the store\'s results, date, scheduled rounds, final placements when applicable, and every player identity. Publish these records as official league results.'}
        </label>
        {rehearsal
          ?<button type="button" disabled={!canCompleteRehearsal} onClick={()=>void saveRehearsal()}>Save test tournament and update standings</button>
          :<button disabled={!canPublish} onClick={()=>void publish()}>{busy?'Publishing…':'Publish Results'}</button>}

        <p className="import-hint">Published results can be corrected only through the audited official correction workflow. Original publication history remains immutable.</p>
      </>}
    </>}
    {!publishedId&&!savedTestId&&<nav className="submission-footer-actions" aria-label="More administrator actions">
      <Link className="submission-action" to="/correct-official-results">Correct already published official results</Link>
      <Link className="submission-action" to="/admin">Back to administration</Link>
    </nav>}
  </section>;
}
