import { calculateStandings } from '../scoring/standings.ts';
import type { StandingsInput } from '../scoring/standings.ts';

export interface PublishedEvent {
  resultId:string;
  date:string;
  name:string;
  kind:'regular'|'seasonal'|'annual';
  season:number;
  year:number;
  scheduledRounds:number;
  players:readonly {playerId:string;name:string;wins:number;losses:number;draws:number;finalPosition:number|null}[];
}
export interface PublicResultRow {result_id:string;public_snapshot:unknown;published_at:string}
const object=(v:unknown):Record<string,unknown>=>{
  if(!v || typeof v!=='object'||Array.isArray(v))throw Error('Malformed official tournament snapshot.');
  return v as Record<string,unknown>;
};
const str=(v:unknown,label:string):string=>{
  if(typeof v!=='string'||!v.trim())throw Error(`Missing official ${label}.`);
  return v;
};
const integer=(v:unknown,label:string,min=0):number=>{
  if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min)throw Error(`Invalid official ${label}.`);
  return v;
};
/** Explicitly allowlist public projection fields. Never expose draft/source/identity metadata. */
export function parsePublishedEvent(row:PublicResultRow):PublishedEvent{
  const v=object(row.public_snapshot);
  if(v.version!==1)throw Error('Unsupported official result format.');
  const date=str(v.date,'date');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)
    throw Error('Invalid official tournament date.');
  const year=integer(v.year,'competitive year',2027);
  if(year!==2027)throw Error('Unconfigured competitive year in official standings.');
  const season=integer(v.season,'season',1);
  if(season>4)throw Error('Invalid official season.');
  const kind=v.kind;
  if(kind!=='regular'&&kind!=='seasonal'&&kind!=='annual')throw Error('Invalid official event type.');
  const rounds=integer(v.scheduledRounds,'rounds',1);
  if(!Array.isArray(v.players)||!v.players.length||v.players.length>256)throw Error('Official event needs players.');
  const identities=new Set<string>();
  const sourcePlayers=v.players as unknown[];
  const players=sourcePlayers.map((player:unknown)=>{
    const p=object(player),playerId=str(p.playerId,'player ID');
    if(identities.has(playerId))throw Error('Duplicate official player entry.');
    identities.add(playerId);
    const wins=integer(p.wins,'wins'),losses=integer(p.losses,'losses'),draws=integer(p.draws,'draws');
    if(wins+losses+draws>rounds)throw Error('Player record exceeds official event rounds.');
    const finalPosition=p.finalPosition===null?null:integer(p.finalPosition,'placement',1);
    if(kind!=='regular'&&finalPosition===null)throw Error('Championship placement is missing.');
    if(finalPosition!==null&&finalPosition>sourcePlayers.length)throw Error('Invalid official placement.');
    return {playerId,name:str(p.name,'display name'),wins,losses,draws,finalPosition};
  });
  return {resultId:str(row.result_id,'result ID'),date,name:str(v.name,'event name'),kind,
    year,season,scheduledRounds:rounds,players};
}
export function buildPublishedStandings(rows:readonly PublicResultRow[]){
  const parsed=rows.map(parsePublishedEvent);
  const dates=new Set<string>(),ids=new Set<string>();
  for(const event of parsed){
    if(dates.has(event.date)||ids.has(event.resultId))throw Error('Duplicate official tournament in public results.');
    dates.add(event.date);ids.add(event.resultId);
  }
  const names=new Map<string,string>();
  for(const event of parsed)for(const player of event.players)names.set(player.playerId,player.name);
  const input:StandingsInput={
    year:2027,seasonIds:['s1','s2','s3','s4'],
    players:[...names].map(([playerId,name])=>({playerId,name})),
    regularEvents:parsed.filter(e=>e.kind==='regular').map(e=>({
      eventId:e.resultId,year:e.year,seasonId:`s${e.season}`,
      results:e.players.map(p=>({playerId:p.playerId,wins:p.wins,draws:p.draws,scheduledRounds:e.scheduledRounds})),
    })),
    championships:parsed.filter(e=>e.kind!=='regular').map(e=>({
      eventId:e.resultId,year:e.year,kind:e.kind as 'seasonal'|'annual',
      ...(e.kind==='seasonal'?{seasonId:`s${e.season}`}:{}),
      scheduledSwissRounds:e.scheduledRounds,
      participants:e.players.map(p=>({playerId:p.playerId,swiss:{wins:p.wins,losses:p.losses,draws:p.draws},finalPosition:p.finalPosition!})),
    })),
  };
  return {events:parsed.sort((a,b)=>b.date.localeCompare(a.date)),standings:calculateStandings(input)};
}
