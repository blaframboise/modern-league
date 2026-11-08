import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabaseConfiguration } from '../data/client';
import { leagueRepository } from '../data/repository';
import type { Json } from '../data/database';

type EventRow = { id:string; event_name:string; edit_revision:number; scheduled_rounds:number; created_at:string };
type Player = { id:string; display_name:string };
type MatchResult = { tournament_id:string; row_id:string; player_id:string; wins:number; losses:number; draws:number };
type Correction = Pick<MatchResult,'row_id'|'wins'|'losses'|'draws'>;

export function EditTournamentResultsPage() {
  const { client }=supabaseConfiguration;
  const [authorized,setAuthorized]=useState(false);
  const [access,setAccess]=useState('Checking administrator access…');
  const [events,setEvents]=useState<EventRow[]>([]);
  const [players,setPlayers]=useState<Player[]>([]);
  const [results,setResults]=useState<MatchResult[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [edits,setEdits]=useState<Correction[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const selected=events.find(t=>t.id===selectedId);
  const originals=results.filter(r=>r.tournament_id===selectedId);
  const changed=edits.length===originals.length && edits.some(r=>{
    const previous=originals.find(o=>o.row_id===r.row_id);
    return previous && (previous.wins!==r.wins||previous.losses!==r.losses||previous.draws!==r.draws);
  });
  const valid=!!selected && edits.length===originals.length && edits.length>0 && edits.every(r=>
    [r.wins,r.losses,r.draws].every(n=>Number.isSafeInteger(n)&&n>=0) &&
    r.wins+r.losses+r.draws<=selected.scheduled_rounds
  );

  async function refresh(){
    if(!client)return;
    const [ev,pl,re]=await Promise.all([
      client.from('sandbox_tournaments').select('*').order('created_at',{ascending:false}),
      client.from('sandbox_players').select('id,display_name'),
      client.from('sandbox_results').select('*'),
    ]);
    if(ev.error||pl.error||re.error)throw new Error('Could not load saved test tournament results.');
    setEvents(ev.data??[]);setPlayers(pl.data??[]);setResults(re.data??[]);
    return {events:ev.data??[],results:re.data??[]};
  }
  useEffect(()=>{
    if(!client){setAccess('Supabase is not configured.');return;}
    let alive=true;
    async function verify(){
      try {
        const {data}=await client!.auth.getUser();
        const admin=!!data.user && await leagueRepository(client!).isAdministrator();
        if(!alive)return;
        setAuthorized(admin);
        setAccess(admin?'':'Administrator sign-in required.');
        if(admin)await refresh();
      }catch{if(alive){setAuthorized(false);setAccess('Unable to verify administrator access.');}}
    }
    void verify();
    const {data:{subscription}}=client.auth.onAuthStateChange(()=>setTimeout(()=>{if(alive)void verify();},0));
    return()=>{alive=false;subscription.unsubscribe();};
  },[client]);

  function open(event:EventRow){
    const rows=results.filter(r=>r.tournament_id===event.id);
    setSelectedId(event.id);
    setEdits(rows.map(({row_id,wins,losses,draws})=>({row_id,wins,losses,draws})));
    setError('');setNotice('');
  }
  function update(rowId:string,key:'wins'|'losses'|'draws',value:string){
    const parsed=value.trim()===''?NaN:Number(value);
    setEdits(old=>old.map(row=>row.row_id===rowId?{...row,[key]:parsed}:row));
    setNotice('');
  }
  async function save(){
    if(!client||!selected||busy||!valid||!changed)return;
    setBusy(true);setError('');setNotice('');
    try{
      const {error:failure}=await client.rpc('correct_sandbox_tournament_results',{
        p_tournament:selected.id,p_expected_edit_revision:selected.edit_revision,p_results:edits as unknown as Json,
      });
      if(failure)throw new Error(failure.message);
      await refresh();
      setSelectedId(null);setEdits([]);
      setNotice('Changes saved. Private test standings will use the corrected results. No official results were published.');
    }catch(e){setError(e instanceof Error?e.message:'Correction could not be saved.');}
    finally{setBusy(false);}
  }

  return <section className="container admin-page sandbox-workspace">
    <p className="eyebrow">ADMIN ONLY / PRESEASON TEST</p>
    <h1>Edit a Tournament’s Results</h1>
    <p>Correct saved match records directly. Player identities remain unchanged. This does not re-verify screenshots or publish official standings.</p>
    {!authorized?<p role="status">{access} <Link to="/admin">Administrator sign in</Link></p>:<div className="sandbox-section">
      {(notice||error)&&<p role="status" className={error?'sandbox-error':'sandbox-success'}>{error||notice}</p>}
      {!selected?<><h2>Saved tournaments</h2>
        <div className="sandbox-event-list" aria-label="Saved tournaments">
          {events.length===0?<p>No saved test tournaments yet.</p>:events.map(event=>
            <button key={event.id} type="button" onClick={()=>open(event)} disabled={busy}>
              <strong>{event.event_name}</strong>
              <span>{results.filter(r=>r.tournament_id===event.id).length} players · {event.scheduled_rounds} rounds</span>
            </button>)}
        </div>
      </>:<>
        <button type="button" disabled={busy} onClick={()=>{setSelectedId(null);setEdits([]);setError('');}}>Back to tournaments</button>
        <h2>{selected.event_name}</h2>
        <p>Enter corrected wins, losses, and draws. All existing player matches are preserved.</p>
        <div className="sandbox-table sandbox-correction-table">
          <table><thead><tr><th>Player</th><th>Wins</th><th>Losses</th><th>Draws</th></tr></thead><tbody>
            {originals.map(original=>{
              const values=edits.find(r=>r.row_id===original.row_id);
              return <tr key={original.row_id}>
                <td data-label="Player" className="correction-player">{players.find(p=>p.id===original.player_id)?.display_name??'Unknown player'}</td>
                {(['wins','losses','draws'] as const).map(key=><td key={key} data-label={key}>
                  <input aria-label={`${players.find(p=>p.id===original.player_id)?.display_name??'Unknown player'} ${key}`}
                    type="number" inputMode="numeric" step={1} min={0} max={selected.scheduled_rounds}
                    value={Number.isNaN(values?.[key])?'':values?.[key]??''}
                    disabled={busy} onChange={event=>update(original.row_id,key,event.target.value)}/>
                </td>)}
              </tr>;
            })}
          </tbody></table>
        </div>
        <p className="sandbox-note">Each player’s total matches must be no greater than {selected.scheduled_rounds} scheduled rounds. Changes are recorded in an administrator audit history.</p>
        <button type="button" disabled={busy||!valid||!changed} onClick={()=>void save()}>
          {busy?'Saving…':'Save Changes'}
        </button>
        {!valid&&<p role="alert" className="sandbox-error">Enter whole, nonnegative match counts within the scheduled rounds.</p>}
      </>}
    </div>}
  </section>;
}
