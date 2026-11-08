import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabaseConfiguration } from '../data/client';
import { buildPublishedStandings } from '../data/publicStandings';
import type { PublicResultRow } from '../data/publicStandings';
import type { Standing } from '../scoring/standings';

const PAGE_SIZE=16;
const sampleNames=['Alex Morgan','Jordan Ellis','Taylor Brooks','Casey Parker','Morgan Reed','Sam Bennett','Avery Coleman','Riley Davis','Cameron Bailey','Quinn Foster','Jamie Rivera','Peyton Walsh','Drew Collins','Emerson Gray','Robin Hayes','Reese Mitchell','Charlie Quinn','Skyler James','Finley Woods','Harper Stone'];
type DisplayRow={playerId:string;name:string;rank:number;seasonPoints:number;totalPoints:number};
export const top16SampleRows:readonly DisplayRow[]=sampleNames.map((name,index)=>({
  playerId:'example-'+index,name,rank:index+1,
  seasonPoints:Math.max(0,70-index*3.25),
  totalPoints:Math.max(0,180-index*7.35),
}));
function formatDate(date:string){const [year,month,day]=date.split('-');return `${month}/${day}/${year}`;}
function displayRows(rows:readonly Standing[],seasonPoints:ReadonlyMap<string,number>,annualPoints:ReadonlyMap<string,number>):DisplayRow[]{
  return rows.filter(row=>row.regularEventCount>0||row.championshipPoints>0)
    .map(row=>({playerId:row.playerId,name:row.name,rank:row.rank,
      seasonPoints:seasonPoints.get(row.playerId)??0,totalPoints:annualPoints.get(row.playerId)??0}));
}
/** Separate, bookmarkable Top 16 presentation. No photo, no fake results in normal mode.
 * Use ?preview=1 solely for visibly labeled, local fictional layout testing.
 */
export function Top16LeaderboardPage(){
  const [params,setParams]=useSearchParams();
  const preview=params.get('preview')==='1';
  const period=['annual','1','2','3','4'].includes(params.get('period')??'')?params.get('period')!:'annual';
  const rawPage=Number(params.get('page')??'1');
  const pageNumber=Number.isSafeInteger(rawPage)&&rawPage>=1?rawPage:1;
  const [results,setResults]=useState<PublicResultRow[]|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(preview)return;
    const client=supabaseConfiguration.client;
    if(!client){setError('The official results service is not configured.');return;}
    let active=true;
    void(async()=>{
      try{
        const all:PublicResultRow[]=[];
        for(let start=0;start<10000;start+=250){
          const {data,error:readError}=await client.from('published_results')
            .select('result_id,public_snapshot,published_at')
            .order('published_at',{ascending:true}).order('result_id',{ascending:true})
            .range(start,start+249);
          if(readError)throw Error(readError.message);
          all.push(...(data??[]));
          if((data??[]).length<250)break;
          if(start+250>=10000)throw Error('Official results exceed the supported limit.');
        }
        if(active){setResults(all);setError('');}
      }catch(e){if(active)setError(e instanceof Error?e.message:'Could not load official results.');}
    })();
    return()=>{active=false;};
  },[preview]);
  const computed=useMemo(()=>{
    if(preview||results===null)return null;
    try{return {value:buildPublishedStandings(results),error:''};}
    catch(e){return {value:null,error:e instanceof Error?e.message:'Unable to calculate standings.'};}
  },[results,preview]);
  const data=computed?.value;
  const latestDate=data?.events[0]?.date??null;
  const activeSeason=data?.events.find(e=>e.kind!=='annual')?.season??1;
  const selectedSeason=period==='annual'?activeSeason:Number(period);
  const currentSeason=data?.standings.seasons[selectedSeason-1]?.afterChampionship;
  const annual=data?.standings.annual;
  const snapshot=period==='annual'?annual:currentSeason;
  const seasonalMap=new Map(currentSeason?.standings.map(r=>[r.playerId,r.totalPoints])??[]);
  const annualMap=new Map(annual?.standings.map(r=>[r.playerId,r.totalPoints])??[]);
  const rows=preview?[...top16SampleRows]:displayRows(snapshot?.standings??[],seasonalMap,annualMap);
  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  const currentPage=Math.min(pageNumber,totalPages);
  const batch=rows.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const first=batch.slice(0,8),second=batch.slice(8,16);
  const from=(currentPage-1)*PAGE_SIZE+1;
  const to=Math.min(currentPage*PAGE_SIZE,rows.length);
  const lastUpdated=preview?'03/26/2027':latestDate?formatDate(latestDate):'Awaiting first publication';
  const choose=(changes:Record<string,string|null>)=>{
    const next=new URLSearchParams(params);
    for(const [key,value] of Object.entries(changes)){if(value===null)next.delete(key);else next.set(key,value);}
    setParams(next);
  };
  const table=(part:DisplayRow[],label:string)=><table className="top16-table" aria-label={label}>
    <thead><tr><th scope="col">Place</th><th scope="col">Player</th><th scope="col">Season pts</th><th scope="col">Total pts</th></tr></thead>
    <tbody>{Array.from({length:8},(_,index)=>{
      const player=part[index];
      return <tr key={player?.playerId??'blank-'+index}>
        <td className="top16-rank">{player?player.rank:'\u00a0'}</td>
        <th scope="row">{player?.name??'\u00a0'}</th>
        <td className="top16-number">{player?player.seasonPoints.toFixed(2):'\u00a0'}</td>
        <td className="top16-number top16-total">{player?player.totalPoints.toFixed(2):'\u00a0'}</td>
      </tr>;
    })}</tbody>
  </table>;
  return <section className="container top16-page">
    <header className="top16-heading">
      <p className="eyebrow">2027 / MODERN LEAGUE</p>
      <h1>{period==='annual'?'Annual Leaderboard':`Season ${period} Leaderboard`}</h1>
      <p className="top16-asof">As of {lastUpdated}</p>
      {preview&&<p className="top16-preview-warning">LAYOUT PREVIEW — FICTIONAL NAMES AND POINTS, NOT LEAGUE RESULTS</p>}
    </header>
    <div className="top16-tools">
      <div className="top16-period" aria-label="Leaderboard period">
        <label htmlFor="top16-period-select">Standings</label>
        <select id="top16-period-select" value={period} onChange={e=>choose({period:e.target.value==='annual'?null:e.target.value,page:null})}>
          <option value="annual">2027 Annual</option>
          {[1,2,3,4].map(n=><option key={n} value={n}>Season {n}</option>)}
        </select>
      </div>
      <Link to="/leaderboards">Full leaderboard</Link>
      {!preview&&rows.length===0&&<Link to="?preview=1">Preview sample layout</Link>}
      {preview&&<button type="button" onClick={()=>choose({preview:null,page:null})}>Return to official data</button>}
    </div>
    {error||computed?.error?<div className="top16-empty" role="alert">Official standings unavailable: {error||computed?.error}</div>:
    !preview&&results===null?<p className="top16-empty" role="status">Loading official results…</p>:
    !preview&&rows.length===0?<div className="top16-empty"><h2>No published results yet</h2><p>The 2027 standings will populate after the first tournament is officially published.</p></div>:
    <>
      <div className="top16-tables">
        {table(first,`Players ${from} to ${Math.min(from+7,to)}`)}
        {table(second,`Players ${from+8} to ${to}`)}
      </div>
      <nav className="top16-pagination" aria-label="Leaderboard pages">
        <button type="button" disabled={currentPage===1} onClick={()=>choose({page:String(currentPage-1)})}>
          <ChevronLeft size={20} aria-hidden="true"/> Previous 16
        </button>
        <span>Places {from}–{to} of {rows.length}</span>
        <button type="button" disabled={currentPage>=totalPages} onClick={()=>choose({page:String(currentPage+1)})}>
          Next 16 <ChevronRight size={20} aria-hidden="true"/>
        </button>
      </nav>
      <p className="top16-note">Season pts reflect Season {selectedSeason}; Total pts are 2027 cumulative points. Ranking follows the selected standings period. Points are calculated from published tournament records only.</p>
    </>}
  </section>;
}
