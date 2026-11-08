import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabaseConfiguration } from '../data/client';
import { leagueRepository } from '../data/repository';
import { parsePublishedEvent } from '../data/publicStandings';
import type { PublicResultRow } from '../data/publicStandings';
import type { Json } from '../data/database';

type Player = {playerId:string;name:string;wins:number;losses:number;draws:number;finalPosition:number|null};
type Edited = Pick<Player,'playerId'|'wins'|'losses'|'draws'|'finalPosition'>;
type Audit = {result_id:string;revision:number;reason:string;actor:string;created_at:string;previous_snapshot:Json;corrected_snapshot:Json};
const toEdits=(players:readonly Player[]):Edited[]=>players.map(({playerId,wins,losses,draws,finalPosition})=>({playerId,wins,losses,draws,finalPosition}));
const textNumber=(value:string):number=>/^\d+$/.test(value.trim())?Number(value):NaN;

export function CorrectOfficialResultsPage(){
  const client=supabaseConfiguration.client;
  const [authorized,setAuthorized]=useState(false);
  const [status,setStatus]=useState('Checking administrator access…');
  const [rows,setRows]=useState<PublicResultRow[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [history,setHistory]=useState<Audit[]>([]);
  const [edits,setEdits]=useState<Edited[]>([]);
  const [reason,setReason]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const selectedRow=rows.find(row=>row.result_id===selectedId);
  let event:ReturnType<typeof parsePublishedEvent>|null=null;
  try {if(selectedRow)event=parsePublishedEvent(selectedRow);}catch{ /* Fail closed on a malformed published snapshot. */ }
  const revision=history.length?Math.max(...history.map(item=>item.revision)):0;
  const changeCount=event?edits.filter(item=>{
    const initial=event!.players.find(p=>p.playerId===item.playerId);
    return initial&&(initial.wins!==item.wins||initial.losses!==item.losses||
      initial.draws!==item.draws||initial.finalPosition!==item.finalPosition);
  }).length:0;
  const valid=!!event&&edits.length===event.players.length&&edits.every(item=>
    [item.wins,item.losses,item.draws].every(n=>Number.isSafeInteger(n)&&n>=0)&&
    item.wins+item.losses+item.draws<=event!.scheduledRounds&&
    (event!.kind==='regular'?item.finalPosition===null:
      item.finalPosition!==null&&Number.isSafeInteger(item.finalPosition)&&
      item.finalPosition>=1&&item.finalPosition<=event!.players.length)
  );
  const canSave=authorized&&!busy&&!!event&&valid&&changeCount>0&&confirmed&&reason.trim().length>0;

  async function load(){
    if(!client)return;
    const all:PublicResultRow[]=[];
    for(let start=0;start<10000;start+=250){
      const response=await client.from('effective_published_results').select('result_id,public_snapshot,published_at')
        .order('published_at',{ascending:false}).order('result_id',{ascending:true}).range(start,start+249);
      if(response.error)throw Error(response.error.message);
      all.push(...response.data);
      if(response.data.length<250)break;
      if(start+250>=10000)throw Error('Too many published events to display.');
    }
    setRows(all);
    return all;
  }
  async function loadHistory(id:string){
    if(!client||!id){setHistory([]);return [];}
    const response=await client.from('official_result_corrections')
      .select('result_id,revision,reason,actor,created_at,previous_snapshot,corrected_snapshot')
      .eq('result_id',id).order('revision',{ascending:true});
    if(response.error)throw Error(response.error.message);
    const records=response.data as Audit[];
    setHistory(records);
    return records;
  }
  useEffect(()=>{
    if(!client){setStatus('Supabase is unavailable.');return;}
    let active=true;
    void (async()=>{
      try{
        const {data}=await client.auth.getUser();
        const admin=!!data.user&&await leagueRepository(client).isAdministrator();
        if(!active)return;
        setAuthorized(admin);
        if(!admin){setStatus('Administrator sign-in required.');return;}
        await load();
        if(active)setStatus('Select a published tournament to correct. Changes are audited.');
      }catch(e){if(active)setStatus(e instanceof Error?e.message:'Unable to load official results.');}
    })();
    return()=>{active=false;};
  },[client]);

  async function selectTournament(id:string){
    setSelectedId(id);setHistory([]);setEdits([]);setConfirmed(false);setReason('');setError('');setMessage('');
    if(!id||!client)return;
    const row=rows.find(r=>r.result_id===id);
    if(!row)return;
    try{
      const parsed=parsePublishedEvent(row);
      await loadHistory(id);
      setEdits(toEdits(parsed.players));
    }catch(e){setError(e instanceof Error?e.message:'Unable to load tournament.');}
  }
  function update(id:string,key:'wins'|'losses'|'draws'|'finalPosition',value:string){
    setConfirmed(false);setMessage('');
    const number=value.trim()===''?NaN:textNumber(value);
    setEdits(previous=>previous.map(p=>p.playerId===id?{...p,[key]:number}:p));
  }
  async function save(){
    if(!client||!selectedId||!canSave)return;
    setBusy(true);setError('');setMessage('');setConfirmed(false);
    try{
      const response=await client.rpc('correct_official_tournament',{
        p_result:selectedId,p_expected_revision:revision,p_players:edits as unknown as Json,
        p_reason:reason.trim(),p_confirm:true,
      });
      if(response.error)throw Error(response.error.message);
      const updated=await load();
      await loadHistory(selectedId);
      const row=updated.find(x=>x.result_id===selectedId);
      if(!row)throw Error('Saved correction was not returned by the public projection.');
      setEdits(toEdits(parsePublishedEvent(row).players));
      setReason('');
      setMessage(`Official correction revision ${response.data} saved. The public standings projection now uses the corrected result.`);
    }catch(e){setError(e instanceof Error?e.message:'Official correction failed; reload and review.');}
    finally{setBusy(false);}
  }

  return <section className="container admin-page sandbox-workspace">
    <p className="eyebrow">ADMINISTRATION / OFFICIAL LEAGUE</p>
    <h1>Correct Published Results</h1>
    <p>Correct an already published tournament. The original publication is never overwritten; every correction is permanently recorded with a reason and administrator identity. This is not the private test workspace.</p>
    <p role="status">{status}</p>
    {!authorized?<p><Link to="/admin">Administrator sign in</Link></p>:<>
      <label>Published tournament
        <select disabled={busy} value={selectedId} onChange={e=>void selectTournament(e.target.value)}>
          <option value="">Select an official event</option>
          {rows.map(row=>{
            let label=row.result_id;
            try{const item=parsePublishedEvent(row);label=`${item.date} — ${item.name}`;}catch{}
            return <option key={row.result_id} value={row.result_id}>{label}</option>;
          })}
        </select>
      </label>
      {rows.length===0&&<p>No official results have been published. No correction is possible.</p>}
      {error&&<p className="import-error" role="alert">{error}</p>}
      {message&&<p className="sandbox-success" role="status">{message}</p>}
      {event&&<div className="sandbox-section">
        <h2>{event.name} — {event.date}</h2>
        <p>{event.kind} · {event.scheduledRounds} scheduled Swiss rounds · {event.players.length} players · Current correction revision {revision}</p>
        <p>Change only the results that need correction. Player identities, event date, and event type cannot be changed here. Championship placements must use competition ranks (for example 1, 1, 3).</p>
        <div className="sandbox-table sandbox-correction-table"><table>
          <thead><tr><th>Player</th><th>Current W–L–D</th><th>Corrected W</th><th>Corrected L</th><th>Corrected D</th>{event.kind!=='regular'&&<><th>Current place</th><th>Corrected place</th></>}</tr></thead>
          <tbody>{event.players.map(player=>{
            const corrected=edits.find(x=>x.playerId===player.playerId);
            return <tr key={player.playerId}>
              <th scope="row">{player.name}</th>
              <td>{player.wins}–{player.losses}–{player.draws}</td>
              {(['wins','losses','draws'] as const).map(key=><td key={key}><input
                type="number" min={0} max={event!.scheduledRounds} inputMode="numeric"
                aria-label={`${player.name} corrected ${key}`} disabled={busy}
                value={Number.isFinite(corrected?.[key])?corrected?.[key]:''}
                onChange={e=>update(player.playerId,key,e.target.value)}/></td>)}
              {event.kind!=='regular'&&<>
                <td>{player.finalPosition}</td>
                <td><input type="number" min={1} max={event.players.length} inputMode="numeric"
                  aria-label={`${player.name} corrected placement`} disabled={busy}
                  value={corrected?.finalPosition??''}
                  onChange={e=>update(player.playerId,'finalPosition',e.target.value)}/></td>
              </>}
            </tr>;
          })}</tbody>
        </table></div>
        <p>{changeCount} player records changed.</p>
        <label>Correction reason (required)<textarea disabled={busy} maxLength={2000}
          value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false)}} rows={3}/></label>
        <label className="sandbox-confirm"><input type="checkbox" disabled={busy||!valid||changeCount===0}
          checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
          I verified this correction against the official tournament records and understand that it immediately changes the public standings.
        </label>
        <button type="button" disabled={!canSave} onClick={()=>void save()}>{busy?'Saving correction…':'Save audited official correction'}</button>
        <details><summary>Official correction history ({history.length})</summary>
          {history.length===0?<p>Original publication; no corrections recorded.</p>:
            <ol>{history.map(item=><li key={item.revision}><strong>Revision {item.revision}</strong> — {new Date(item.created_at).toLocaleString()} — {item.reason}
              <details><summary>Original and corrected snapshots</summary><pre>{JSON.stringify({previous:item.previous_snapshot,corrected:item.corrected_snapshot},null,2)}</pre></details>
            </li>)}</ol>}
        </details>
      </div>}
    </>}
  </section>;
}
