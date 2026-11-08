import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabaseConfiguration } from '../data/client';
import { leagueRepository } from '../data/repository';
import { fullSchedulerRows, parseCalendarOverrides, updateCalendarChoice, validateCalendarConfiguration } from '../calendar/scheduler';
import type { CalendarOverrides, SchedulerType } from '../calendar/scheduler';
import type { Json } from '../data/database';

const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
const cols:[SchedulerType,string][]=[['modern','REG'],['seasonal','SC'],['annual','LC'],['prerelease','PR'],['tbd','TBD']];
const dayCode=(date:string)=>{
  const day=new Date(date+'T12:00:00Z').getUTCDay()===1?'M':'F';
  return day+date.slice(5,7)+date.slice(8,10);
};
function sameOverrides(a:CalendarOverrides,b:CalendarOverrides){
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  return [...keys].every(k=>a[k]===b[k]);
}
export function CalendarSchedulerPage(){
  const client=supabaseConfiguration.client;
  const [authorized,setAuthorized]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [status,setStatus]=useState('Checking administrator access…');
  const [revision,setRevision]=useState(0);
  const [saved,setSaved]=useState<CalendarOverrides>({});
  const [draft,setDraft]=useState<CalendarOverrides>({});
  const rows=useMemo(()=>fullSchedulerRows(draft),[draft]);
  const changed=!sameOverrides(saved,draft);
  const count=rows.reduce((x,r)=>{x[r.kind]=(x[r.kind]??0)+1;return x;},{} as Record<SchedulerType,number>);
  const check=()=>{try{validateCalendarConfiguration(draft);return '';}catch(e){return e instanceof Error?e.message:'Invalid calendar';}};
  const validation=check();
  useEffect(()=>{
    if(!client){setStatus('Supabase is unavailable. Scheduler cannot be saved.');return;}
    let live=true;
    async function load(){
      try{
        const {data:identity}=await client!.auth.getUser();
        if(!identity.user||!(await leagueRepository(client!).isAdministrator()))throw Error('Administrator sign-in required.');
        const {data,error}=await client!.from('proposed_calendar_settings').select('year,revision,overrides').eq('year',2027).single();
        if(error||!data)throw Error('Could not load the saved scheduler.');
        const overrides=parseCalendarOverrides(data.overrides);
        validateCalendarConfiguration(overrides);
        if(live){setAuthorized(true);setRevision(data.revision);setDraft(overrides);setSaved(overrides);setLoaded(true);setStatus('Loaded current 2027 planning schedule.');}
      }catch(e){if(live)setStatus(e instanceof Error?e.message:'Scheduler unavailable.');}
    }
    void load();
    return ()=>{live=false;};
  },[client]);
  async function save(){
    if(!client||!authorized||busy||!loaded||!changed||validation)return;
    setBusy(true);setStatus('Saving provisional calendar…');
    try{
      // One conditional update protects against overwriting an intervening admin edit.
      const {data,error}=await client.from('proposed_calendar_settings')
        .update({overrides:draft as Json,revision:revision+1})
        .eq('year',2027).eq('revision',revision)
        .select('year,revision,overrides').maybeSingle();
      if(error)throw error;
      if(!data)throw Error('This calendar was changed in another session. Reload the page to compare before saving.');
      const savedNow=parseCalendarOverrides(data.overrides);
      setRevision(data.revision);setSaved(savedNow);setDraft(savedNow);
      setStatus('Saved. The calendar preview now uses this planning schedule. Official events are unchanged.');
    }catch(e){setStatus(e instanceof Error?e.message:'Calendar save failed.');}
    finally{setBusy(false);}
  }
  return <div className="container calendar-scheduler-page">
    <p className="eyebrow">ADMINISTRATION / 2027 PLANNING</p><h1>Event scheduler<span className="gold">.</span></h1>
    <p className="page-description">Expand a month to classify its Monday/Friday dates. One checkbox per date. Clear the selected checkbox to remove a date from the calendar. These edits update the provisional preview, not the official tournament registry.</p>
    <p role="status" className="calendar-scheduler-status">{status}</p>
    {authorized&&loaded&&<>
      <div className="calendar-scheduler-toolbar">
        <div className="calendar-scheduler-totals">{cols.map(([kind,label])=><span key={kind}>{label} <strong>{count[kind]??0}</strong></span>)}<span>OFF <strong>{count.none??0}</strong></span></div>
        <div className="calendar-scheduler-actions"><Link to="/calendar-preview">Preview calendar</Link><button type="button" disabled={!changed||busy} onClick={()=>setDraft({...saved})}>Discard edits</button><button type="button" disabled={!changed||!!validation||busy} onClick={()=>void save()}>Save calendar changes</button></div>
      </div>
      {validation&&<p className="calendar-scheduler-warning" role="alert">{validation}</p>}
      {(count.seasonal??0)<4||(count.annual??0)<1?<p className="calendar-scheduler-warning">Planning schedule incomplete: {count.seasonal??0} of 4 seasonal championships and {count.annual??0} of 1 league championship assigned. You can save it while dates are undecided.</p>:null}
      <div className="calendar-scheduler-months">{months.map((month,i)=>{
        const m=String(i+1).padStart(2,'0');
        const entries=rows.filter(r=>r.date.slice(5,7)===m);
        return <details key={m} className="calendar-scheduler-month">
          <summary><span>{month}</span><span>{entries.filter(r=>r.kind!=='none').length} shown / {entries.length} dates</span></summary>
          <div className="calendar-scheduler-scroll"><table>
            <thead><tr><th scope="col">Date</th>{cols.map(([_,label])=><th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{entries.map(row=><tr key={row.date} className={row.kind==='none'?'is-off':''}>
              <th scope="row"><time dateTime={row.date}>{dayCode(row.date)}</time><span className="calendar-scheduler-full-date">{row.date}</span></th>
              {cols.map(([kind,label])=><td key={kind}><input type="checkbox" checked={row.kind===kind}
                aria-label={`${row.date} ${label}`} onChange={e=>setDraft(current=>updateCalendarChoice(current,row.date,e.target.checked?kind:'none'))}/></td>)}
            </tr>)}</tbody>
          </table></div>
        </details>;
      })}</div>
      <div className="calendar-scheduler-bottom"><button type="button" disabled={!changed||!!validation||busy} onClick={()=>void save()}>Save calendar changes</button><p>Changes remain unsaved until you select Save. You can remove any date, including a championship; the calendar will show an incomplete schedule until a replacement is selected.</p></div>
    </>}
    <Link to="/admin" className="back-link">Back to administration</Link>
  </div>;
}
