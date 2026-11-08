import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublishedStandings, parsePublishedEvent } from '../src/data/publicStandings.ts';
import type { PublicResultRow } from '../src/data/publicStandings.ts';

const make=(date:string,kind:'regular'|'seasonal'|'annual',season:number,records:{id:string;name:string;wins:number;losses:number;draws:number;place?:number|null}[]):PublicResultRow=>({
  result_id:'official-'+date, published_at:date+'T23:00:00Z',
  public_snapshot:{version:1,name:'Eternal Games Modern',date,year:2027,season,kind,scheduledRounds:4,
    players:records.map(r=>({playerId:r.id,name:r.name,wins:r.wins,losses:r.losses,draws:r.draws,finalPosition:r.place??null,points:999}))},
});
test('no official publications produce no people, results, or title recipients',()=>{
  const result=buildPublishedStandings([]);
  assert.equal(result.events.length,0);
  assert.equal(result.standings.annual.standings.length,0);
  assert.deepEqual(result.standings.annual.cumulativeTitleRecipientIds,[]);
});
test('recompute REG points from WDL and rounds; do not trust supplied snapshot points',()=>{
  const result=buildPublishedStandings([make('2027-01-04','regular',1,[
    {id:'a',name:'Player A',wins:3,losses:1,draws:0},
    {id:'b',name:'Player B',wins:2,losses:1,draws:1},
  ])]);
  assert.equal(result.events.length,1);
  const first=result.standings.seasons[0].afterChampionship.standings.find(x=>x.playerId==='a')!;
  assert.equal(first.regularPoints,7.5);
  assert.equal(first.regularEventCount,1);
  assert.equal(first.eligibleForCumulativeTitle,false);
  assert.equal(result.standings.annual.standings.find(x=>x.playerId==='b')?.regularPoints,5.833333333333333);
});
test('SC points from official placement and Swiss rounds, preserving tournament-vs-title distinction',()=>{
  const result=buildPublishedStandings([make('2027-03-26','seasonal',1,[
    {id:'a',name:'Player A',wins:4,losses:0,draws:0,place:1},
    {id:'b',name:'Player B',wins:2,losses:2,draws:0,place:2},
  ])]);
  assert.equal(result.standings.seasons[0].championshipRecorded,true);
  assert.deepEqual(result.standings.seasons[0].tournamentChampionIds,['a']);
  const one=result.standings.seasons[0].afterChampionship.standings.find(x=>x.playerId==='a')!;
  assert.equal(one.championshipPoints,40);
  assert.equal(one.eligibleForCumulativeTitle,false);
});
test('annual LC points keep independent winner, with no invented cumulative title',()=>{
  const result=buildPublishedStandings([make('2027-12-17','annual',4,[
    {id:'a',name:'Player A',wins:4,losses:0,draws:0,place:1},
    {id:'b',name:'Player B',wins:2,losses:2,draws:0,place:2},
  ])]);
  assert.equal(result.standings.annualChampionshipRecorded,true);
  assert.deepEqual(result.standings.annualTournamentChampionIds,['a']);
  assert.equal(result.standings.annual.standings.find(x=>x.playerId==='a')?.championshipPoints,120);
  assert.deepEqual(result.standings.annual.cumulativeTitleRecipientIds,[]);
});
test('fail closed on unknown projection fields, duplicate events and inconsistent records',()=>{
  const good=make('2027-01-04','regular',1,[{id:'a',name:'Player A',wins:2,losses:2,draws:0}]);
  assert.throws(()=>buildPublishedStandings([good,good]),/Duplicate official tournament/);
  assert.throws(()=>parsePublishedEvent({...good,public_snapshot:{...(good.public_snapshot as object),version:2}}),/Unsupported/);
  assert.throws(()=>parsePublishedEvent({...good,public_snapshot:{...(good.public_snapshot as object),date:'2027-02-30'}}),/Invalid official tournament date/);
  assert.throws(()=>parsePublishedEvent({...good,public_snapshot:{...(good.public_snapshot as object),players:[
    {playerId:'a',name:'A',wins:5,losses:0,draws:0,finalPosition:null}]}}),/exceeds/);
  assert.throws(()=>parsePublishedEvent({...good,public_snapshot:{...(good.public_snapshot as object),players:[
    {playerId:'a',name:'A',wins:2,losses:2,draws:0,finalPosition:null},
    {playerId:'a',name:'A',wins:2,losses:2,draws:0,finalPosition:null}]}}),/Duplicate official player/);
});
