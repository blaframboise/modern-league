import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const actor='11111111-1111-4111-8111-111111111111';
const result='55555555-5555-4555-8555-555555555555';
const a='66666666-6666-4666-8666-666666666666';
const b='77777777-7777-4777-8777-777777777777';
function revised(w1:number,w2:number){
 return [{playerId:a,wins:w1,losses:4-w1,draws:0,finalPosition:null},
   {playerId:b,wins:w2,losses:4-w2,draws:0,finalPosition:null}];
}
test('official corrections preserve publication and use an append-only effective public projection',async()=>{
 const db=new PGlite();
 try{
  await db.exec([
   'create role anon','create role authenticated','create role service_role bypassrls',
   'create schema auth','create table auth.users(id uuid primary key)',
   "create function auth.uid() returns uuid language sql stable as $$select '11111111-1111-4111-8111-111111111111'::uuid$$"
  ].join(';')+';');
  await db.exec(await readFile(new URL('../supabase/migrations/202611060001_foundation.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261108060000_official_result_corrections.sql',import.meta.url),'utf8'));
  await db.exec([
   "insert into auth.users values ('11111111-1111-4111-8111-111111111111')",
   "insert into private.administrators(user_id,reason) values ('11111111-1111-4111-8111-111111111111','test administrator')",
   "insert into public.players(id,display_name) values ('66666666-6666-4666-8666-666666666666','Player One'),('77777777-7777-4777-8777-777777777777','Player Two')",
   "insert into public.league_seasons(id,league_year,ordinal) values ('22222222-2222-4222-8222-222222222222',2027,1)",
   "insert into public.scheduled_events(id,season_id,league_year,kind,name,local_date,local_time,starts_at,scheduled_rounds) values ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',2027,'regular','Test',date '2027-01-04',time '18:00',timestamptz '2027-01-04 23:00:00+00',4)",
   "insert into public.import_drafts(id,created_by,original) values ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','{}')",
   "insert into public.approval_history(id,draft_id,revision,decision,actor,reason,validated_snapshot) values ('44444444-4444-4444-8444-444444444444','88888888-8888-4888-8888-888888888888',1,'approved','11111111-1111-4111-8111-111111111111','verified','{}')",
   "insert into public.tournament_results(id,event_id,approval_id,source_key,scheduled_rounds) values ('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','test:2027-01-04',4)"
  ].join(';')+';');
  const original={version:1,name:'Official test',date:'2027-01-04',year:2027,season:1,kind:'regular',scheduledRounds:4,
   players:[{playerId:a,name:'Player One',wins:3,losses:1,draws:0,finalPosition:null,points:7.5},
    {playerId:b,name:'Player Two',wins:2,losses:2,draws:0,finalPosition:null,points:5}]};
  await db.query("insert into public.published_results(result_id,public_snapshot,published_by) values ($1,$2::jsonb,$3)",
    [result,JSON.stringify(original),actor]);
  const call=(rev:number,players:unknown,reason:string,confirm:boolean)=>
    db.query('select public.correct_official_tournament($1,$2,$3::jsonb,$4,$5) as revision',
      [result,rev,JSON.stringify(players),reason,confirm]);
  await assert.rejects(call(0,revised(2,3),'',true),/reason/i);
  await assert.rejects(call(0,revised(2,3),'verified',false),/confirmation/i);
  assert.equal(((await call(0,revised(2,3),'store reported swapped scores',true)).rows[0] as {revision:number}).revision,1);
  const current=(await db.query<{public_snapshot:any}>('select public_snapshot from public.effective_published_results')).rows[0].public_snapshot;
  assert.equal(current.players[0].wins,2);
  assert.equal(current.players[1].wins,3);
  assert.equal(current.players[0].points,5);
  const unchanged=(await db.query<{public_snapshot:any}>('select public_snapshot from public.published_results')).rows[0].public_snapshot;
  assert.equal(unchanged.players[0].wins,3);
  await assert.rejects(call(0,revised(1,3),'stale change',true),/reload/i);
  await assert.rejects(call(1,revised(2,3),'no change',true),/No official result changes/i);
  await assert.rejects(call(1,[revised(2,3)[0]],'missing participant',true),/exactly once/i);
  await assert.rejects(call(1,revised(5,3),'invalid score',true),/Invalid match record/i);
  assert.equal(((await call(1,revised(1,3),'second correction',true)).rows[0] as {revision:number}).revision,2);
  assert.deepEqual((await db.query<{revision:number}>('select revision from public.official_result_corrections order by revision')).rows.map(r=>r.revision),[1,2]);
  await assert.rejects(db.exec('delete from public.official_result_corrections where revision=1'),/Immutable history/i);
  await db.exec('set role anon');
  assert.equal((await db.query('select result_id from public.effective_published_results')).rows.length,1);
  await assert.rejects(db.query('select * from public.official_result_corrections'),/permission denied/i);
  await assert.rejects(call(2,revised(2,2),'unauthorized',true),/permission denied/i);
 }finally{await db.close();}
});
