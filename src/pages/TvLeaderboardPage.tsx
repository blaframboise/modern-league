import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, RefreshCw } from 'lucide-react';
import { Brand } from '../components/Brand';
import { supabaseConfiguration } from '../data/client';
import { buildPublishedStandings } from '../data/publicStandings';
import type { PublicResultRow } from '../data/publicStandings';
import type { Standing } from '../scoring/standings';

const PAGE_SIZE=16;
const SAMPLE_NAMES=[
  'Alex Morgan','Jordan Ellis','Taylor Brooks','Casey Parker','Morgan Reed','Sam Bennett','Avery Coleman','Riley Davis',
  'Cameron Bailey','Quinn Foster','Jamie Rivera','Peyton Walsh','Drew Collins','Emerson Gray','Robin Hayes','Reese Mitchell',
  'Charlie Quinn','Skyler James','Finley Woods','Harper Stone','Noah Kim','Devin Harris','Ari Patel','Blake Jordan',
  'Ash Taylor','Kendall White','Robin Moore','Jules Fox','Ryan Lee','Franklin Reed','Bailey King','Dana Price',
  'Jesse Young','Nico Gray','Sidney Park','Ariel Woods','Rory Bennett','Chris Monroe','River Stone','Theo Carter',
  'Nia West','Rene Quinn','Cory Evans','Lee Monroe','Alexis Bell','Terry Blake','Remy North','Parker Jones',
];
type TvRow={id:string;rank:number;name:string;season:number;total:number};
export const tvSampleRows:readonly TvRow[]=SAMPLE_NAMES.map((name,i)=>({
  id:'preview-'+i,rank:i+1,name,season:Math.max(0,70-i*1.14),total:Math.max(0,146-i*2.37),
}));
export function tvSlice(rows:readonly TvRow[],page:number){
  const numberOfPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  const current=Math.min(Math.max(page,0),numberOfPages-1);
  return {page:current,count:numberOfPages,left:rows.slice(current*16,current*16+8),
    right:rows.slice(current*16+8,current*16+16)};
}
function leaderboardRows(rows:readonly Standing[],seasons:ReadonlyMap<string,number>,annual:ReadonlyMap<string,number>):TvRow[]{
  return rows.filter(p=>p.regularEventCount>0||p.championshipPoints>0)
    .map(p=>({id:p.playerId,rank:p.rank,name:p.name,
      season:seasons.get(p.playerId)??0,total:annual.get(p.playerId)??0}));
}
function dateLabel(value:string|null){if(!value)return 'Awaiting results';
 const [year,month,day]=value.split('-');return `${month}/${day}/${year}`;
}
/** Simplified broadcast design A. Real data is read exclusively from published_results.
 * Preview mode is always clearly marked and never persisted to league records.
 */
export function TvLeaderboardPage(){
  const [search,setSearch]=useSearchParams();
  const preview=search.get('preview')==='1';
  const period=['annual','1','2','3','4'].includes(search.get('period')??'')?search.get('period')!:'annual';
  const [rows,setRows]=useState<PublicResultRow[]|null>(null);
  const [error,setError]=useState('');
  const [page,setPage]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [seconds,setSeconds]=useState(15);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const stage=useRef<HTMLElement|null>(null);
  const refresh=useCallback(async()=>{
    if(preview)return;
    const client=supabaseConfiguration.client;
    if(!client){setError('Official results service is unavailable.');return;}
    try{
      const all:PublicResultRow[]=[];
      for(let start=0;start<10000;start+=250){
        const {data,error:readError}=await client.from('effective_published_results')
          .select('result_id,public_snapshot,published_at')
          .order('published_at',{ascending:true}).order('result_id',{ascending:true})
          .range(start,start+249);
        if(readError)throw Error(readError.message);
        all.push(...(data??[]));
        if((data??[]).length<250)break;
        if(start+250>=10000)throw Error('The official event limit was reached.');
      }
      setRows(all);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not retrieve official standings.');}
  },[preview]);
  useEffect(()=>{
    if(preview)return;
    void refresh();
    const timer=window.setInterval(()=>{void refresh();},5*60*1000);
    return()=>window.clearInterval(timer);
  },[refresh,preview]);
  useEffect(()=>{
    const update=()=>setIsFullscreen(document.fullscreenElement===stage.current);
    document.addEventListener('fullscreenchange',update);
    return()=>document.removeEventListener('fullscreenchange',update);
  },[]);
  const computed=useMemo(()=>{
    if(preview||rows===null)return null;
    try{return {data:buildPublishedStandings(rows),error:''};}
    catch(e){return {data:null,error:e instanceof Error?e.message:'The approved event records could not be scored.'};}
  },[preview,rows]);
  const official=computed?.data;
  const lastEvent=period==='annual'?official?.events[0]:
    official?.events.find(e=>e.season===Number(period)&&e.kind!=='annual');
  const activeSeason=official?.events.find(e=>e.kind!=='annual')?.season??1;
  const selectedSeason=period==='annual'?activeSeason:Number(period);
  const seasonal=official?.standings.seasons[selectedSeason-1]?.afterChampionship;
  const annual=official?.standings.annual;
  const selected=period==='annual'?annual:seasonal;
  const seasonScores=new Map(seasonal?.standings.map(x=>[x.playerId,x.totalPoints])??[]);
  const annualScores=new Map(annual?.standings.map(x=>[x.playerId,x.totalPoints])??[]);
  const players=preview?[...tvSampleRows]:leaderboardRows(selected?.standings??[],seasonScores,annualScores);
  const current=tvSlice(players,page);
  const showResults=preview||!!players.length;
  const updated=preview?'03/26/2027':dateLabel(lastEvent?.date??null);
  const setPeriod=(value:string)=>{const next=new URLSearchParams(search);if(value==='annual')next.delete('period');else next.set('period',value);
    setSearch(next);setPage(0);};
  const next=useCallback(()=>setPage(p=>(p+1)%Math.max(1,Math.ceil(players.length/16))),[players.length]);
  const previous=()=>setPage(p=>Math.max(p-1,0));
  useEffect(()=>{
    if(!playing||!showResults||current.count<=1)return;
    const timer=window.setInterval(next,seconds*1000);
    return()=>window.clearInterval(timer);
  },[playing,showResults,current.count,seconds,next]);
  useEffect(()=>{if(!showResults)setPlaying(false);},[showResults]);
  const fullscreen=async()=>{
    try{if(document.fullscreenElement===stage.current)await document.exitFullscreen();
      else await stage.current?.requestFullscreen();}
    catch{setError('Browser fullscreen was blocked. Use the browser full-screen option.');}
  };
  const board=(records:readonly TvRow[],label:string)=><div className="tv-broadcast-board" role="table" aria-label={label}>
    <div className="tv-broadcast-head" role="row"><span role="columnheader">#</span><span role="columnheader">Player</span>
      <span role="columnheader">Season pts</span><span role="columnheader">Total pts</span></div>
    {Array.from({length:8},(_,index)=>{
      const player=records[index];
      return <div role="row" className="tv-broadcast-row" key={player?.id??'empty-'+index}>
        <span role="cell" className="tv-broadcast-place">{player?.rank??'\u00a0'}</span>
        <span role="cell" className="tv-broadcast-player" title={player?.name??''}>{player?.name??'\u00a0'}</span>
        <span role="cell" className="tv-broadcast-score">{player?player.season.toFixed(2):'\u00a0'}</span>
        <span role="cell" className="tv-broadcast-score tv-broadcast-total">{player?player.total.toFixed(2):'\u00a0'}</span>
      </div>;
    })}
  </div>;
  return <section ref={stage} className={'tv-broadcast-stage'+(isFullscreen?' tv-broadcast-is-fullscreen':'')}>
    <div className="tv-broadcast-content">
      <div className="tv-broadcast-topline"><Brand/><span>2027 · {period==='annual'?'ANNUAL':`SEASON ${period}`} · STANDINGS</span></div>
      <header className="tv-broadcast-title"><h1>{period==='annual'?'Annual Leaderboard':`Season ${period} Leaderboard`}</h1>
        <p>As of {updated}</p></header>
      {preview&&<div className="tv-broadcast-preview">DEMONSTRATION DATA — FICTIONAL PLAYERS AND SCORES</div>}
      {error||computed?.error?<p className="tv-broadcast-status" role="alert">{error||computed?.error}</p>:
        !preview&&rows===null?<p className="tv-broadcast-status" role="status">Loading official standings…</p>:
        !showResults?<div className="tv-broadcast-status"><h2>Official results pending</h2>
          <p>TV standings will be available when the first 2027 tournament is published.</p></div>:
        <div className="tv-broadcast-boards">{board(current.left,'Left standings column')}{board(current.right,'Right standings column')}</div>}
      <footer className="tv-broadcast-foot">
        <span>{showResults?`Rankings ${page*16+1}–${Math.min((page+1)*16,players.length)} of ${players.length}`:'No published standings'}</span>
        <span>{showResults?`Slide ${current.page+1} of ${current.count}`:''}</span>
        <span>{preview?'PREVIEW ONLY':'MODERN LEAGUE · OFFICIAL RESULTS'}</span>
      </footer>
      <div className="tv-broadcast-controls" aria-label="TV display controls">
        <label>Standings <select value={period} onChange={e=>setPeriod(e.target.value)}>
          <option value="annual">2027 Annual</option>{[1,2,3,4].map(n=><option key={n} value={String(n)}>Season {n}</option>)}
        </select></label>
        <label>Advance <select value={seconds} onChange={e=>setSeconds(Number(e.target.value))}>
          {[8,15,25,30].map(n=><option key={n} value={n}>{n} sec</option>)}
        </select></label>
        <button type="button" disabled={!showResults||current.count<=1} onClick={previous} aria-label="Previous 16"><ChevronLeft size={18}/> Previous</button>
        <button type="button" disabled={!showResults||current.count<=1} onClick={()=>setPlaying(value=>!value)}
          aria-label={playing?'Pause slideshow':'Play slideshow'}>{playing?<Pause size={18}/>:<Play size={18}/>} {playing?'Pause':'Play'}</button>
        <button type="button" disabled={!showResults||current.count<=1} onClick={next} aria-label="Next 16">Next <ChevronRight size={18}/></button>
        <button type="button" onClick={()=>void fullscreen()} aria-label={isFullscreen?'Exit fullscreen':'Enter fullscreen'}>
          {isFullscreen?<Minimize size={18}/>:<Maximize size={18}/>} {isFullscreen?'Exit':'Fullscreen'}</button>
        {!preview&&<button type="button" onClick={()=>void refresh()} aria-label="Refresh official results"><RefreshCw size={17}/> Refresh</button>}
        <Link to="/leaderboards/top-16">Standings</Link>
        {preview&&<Link to="/leaderboards/tv">Official mode</Link>}
      </div>
    </div>
  </section>;
}
