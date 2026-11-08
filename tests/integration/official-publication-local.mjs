// Full official path against disposable local Supabase only. Never uses production credentials.
// AI recognition is intentionally replaced by a human-reviewed synthetic screenshot transcript.
// PostgreSQL's future-date guard is first asserted, then adjusted ONLY inside the disposable
// local database to simulate January 2027 (the CI runner is still in November 2026).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { unresolvedOriginal } from '../../src/importInfrastructure/validation.ts';
import { fieldPaths } from '../../src/importInfrastructure/evidence.ts';
import { buildPublishedStandings } from '../../src/data/publicStandings.ts';

const raw=execFileSync('supabase',['status','-o','env'],{encoding:'utf8'});
const settings=Object.fromEntries(raw.split(/\r?\n/).map(line=>{
 const m=line.match(/^([A-Z_]+)=(.*)$/);return m?[m[1],m[2].replace(/^["']|["']$/g,'')]:[];
}).filter(x=>x.length));
const url=settings.API_URL,anonKey=settings.ANON_KEY??settings.PUBLISHABLE_KEY;
const secret=settings.SERVICE_ROLE_KEY??settings.SECRET_KEY;
assert.ok(url&&/^(http:\/\/127\.0\.0\.1|http:\/\/localhost):/.test(url),'Refuse remote Supabase');
assert.ok(anonKey&&secret,'Local API keys required');
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,secret,opts),publicClient=createClient(url,anonKey,opts);
const container=execFileSync('docker',['ps','--filter','name=supabase_db_','--format','{{.Names}}'],{encoding:'utf8'}).trim().split('\n')[0];
assert.ok(container,'Disposable database not found');
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Ve8AAAAASUVORK5CYII=','base64'));

function sql(command){
 return execFileSync('docker',['exec',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',command],{encoding:'utf8'});
}
async function actor(admin){
 const email='official-ci-'+randomUUID()+'@example.test',password='Temporary-Test-'+randomUUID()+'!';
 const created=await service.auth.admin.createUser({email,password,email_confirm:true});
 assert.ifError(created.error);
 if(admin)sql("insert into private.administrators(user_id,reason) values ('"+created.data.user.id+"','isolated test only')");
 const client=createClient(url,anonKey,opts);
 const signed=await client.auth.signInWithPassword({email,password});
 assert.ifError(signed.error);
 return {client,token:signed.data.session.access_token,id:created.data.user.id};
}
async function edge(action,owner,draft,body,mime='application/json'){
 const response=await fetch(url+'/functions/v1/screenshot-import?action='+action,{
  method:'POST',headers:{apikey:anonKey,authorization:'Bearer '+owner.token,origin:'https://league.example','x-draft-id':draft,'content-type':mime},
  body:body instanceof Uint8Array?Buffer.from(body):JSON.stringify(body??{}),
 });
 const payload=await response.json();
 assert.equal(response.status,200,action+': '+JSON.stringify(payload));
 return payload;
}
function effective(rows){return buildPublishedStandings(rows.map(x=>({
 result_id:x.result_id,public_snapshot:x.public_snapshot,published_at:x.published_at
})));}
async function main(){
 const owner=await actor(true),notAdmin=await actor(false);
 const draft=randomUUID();
 await edge('create',owner,draft);
 const image=await edge('upload',owner,draft,png,'image/png');
 assert.ok(image.id,'Uploaded PNG must have an evidence asset ID');
 const reviewed=unresolvedOriginal();
 reviewed.tournament={...reviewed.tournament,name:'CI FNM Modern',date:'2027-01-04',year:2027,kind:'regular',seasonId:'s1',scheduledRounds:3};
 reviewed.results=[
  {rowId:'p1',importedName:'Test Player One',playerId:null,wins:3,losses:0,draws:0,finalPosition:1},
  {rowId:'p2',importedName:'Test Player Two',playerId:null,wins:2,losses:1,draws:0,finalPosition:2},
 ];
 const source=[image.id];
 const evidence=fieldPaths(reviewed).map(path=>({path,sources:source,note:'Manual transcription verified against synthetic fixture'}));
 await edge('correct',owner,draft,{revision:1,values:reviewed,reason:'Human-reviewed synthetic tournament fixture',confirm:[],sources:source,evidence});
 const calendar=await owner.client.from('proposed_calendar_settings').select('revision').eq('year',2027).single();
 assert.ifError(calendar.error);
 const links=[{rowId:'p1',playerId:null,displayName:'Test Player One'},{rowId:'p2',playerId:null,displayName:'Test Player Two'}];
 const args={p_draft:draft,p_revision:1,p_calendar_revision:calendar.data.revision,p_links:links,p_reason:'Synthetic CI publication',p_confirm:true};
 const unauthorized=await notAdmin.client.rpc('publish_reviewed_tournament',args);
 assert.ok(unauthorized.error,'Non-admin must not publish');
 const future=await owner.client.rpc('publish_reviewed_tournament',args);
 assert.match(future.error?.message??'',/Future tournament/i,'Production date guard must block future events');
 assert.equal((await publicClient.from('effective_published_results').select('result_id')).data.length,0);

 // Rewrite exactly one date comparison inside the disposable CI function only.
 // A mismatched function body fails the test rather than relaxing any other guard.
 const original="if v_date > (now() at time zone 'America/Detroit')::date then";
 const simulated="if v_date > date '2027-02-01' then";
 const escaped=s=>s.replaceAll("'","''");
 const patch='do $$ declare fn text; begin select pg_get_functiondef('+
  "'public.publish_reviewed_tournament(uuid,integer,integer,jsonb,text,boolean)'::regprocedure) into fn;"+
  "if position('"+escaped(original)+"' in fn)=0 then raise exception 'Date guard changed'; end if;"+
  "fn:=replace(fn,'"+escaped(original)+"','"+escaped(simulated)+"'); execute fn; end $$;";
 sql(patch);
 const published=await owner.client.rpc('publish_reviewed_tournament',args);
 assert.ifError(published.error);
 const id=published.data;
 assert.match(id,/^[a-f0-9-]{36}$/);
 assert.ok((await owner.client.rpc('publish_reviewed_tournament',args)).error,'Replay must fail');
 const publicRows=await publicClient.from('effective_published_results').select('result_id,public_snapshot,published_at');
 assert.ifError(publicRows.error);
 assert.equal(publicRows.data.length,1);
 assert.equal(effective(publicRows.data).events.length,1);
 let snapshot=publicRows.data[0].public_snapshot;
 assert.equal(snapshot.players.length,2);
 const people=snapshot.players;
 assert.equal(people[0].wins,3);
 assert.equal(people[1].wins,2);
 const corrected=people.map((p,i)=>({playerId:p.playerId,wins:i===0?2:3,losses:i===0?1:0,draws:0,finalPosition:null}));
 const correctionArgs={p_result:id,p_expected_revision:0,p_players:corrected,p_reason:'Store corrected swapped W-L records',p_confirm:true};
 assert.ok((await notAdmin.client.rpc('correct_official_tournament',correctionArgs)).error,'Non-admin correction forbidden');
 const revision=await owner.client.rpc('correct_official_tournament',correctionArgs);
 assert.ifError(revision.error);assert.equal(revision.data,1);
 assert.ok((await owner.client.rpc('correct_official_tournament',correctionArgs)).error,'Stale edit must fail');
 const after=await publicClient.from('effective_published_results').select('result_id,public_snapshot,published_at');
 assert.ifError(after.error);assert.equal(after.data.length,1);
 snapshot=after.data[0].public_snapshot;
 assert.equal(snapshot.players[0].wins,2);
 assert.equal(snapshot.players[1].wins,3);
 const updated=effective(after.data);
 assert.equal(updated.events.length,1);
 assert.equal(updated.standings.annual.standings.find(x=>x.playerId===people[0].playerId).regularPoints,20/3);
 assert.equal(updated.standings.annual.standings.find(x=>x.playerId===people[1].playerId).regularPoints,10);
 const rawPublication=await owner.client.from('published_results').select('public_snapshot').eq('result_id',id).single();
 assert.ifError(rawPublication.error);
 assert.equal(rawPublication.data.public_snapshot.players[0].wins,3,'Original evidence must remain unchanged');
 const audit=await owner.client.rpc('official_correction_history',{p_result:id});
 assert.ifError(audit.error);assert.equal(audit.data.length,1);
 assert.equal(audit.data[0].previous_snapshot.players[0].wins,3);
 assert.equal(audit.data[0].corrected_snapshot.players[0].wins,2);
 const anonAudit=await publicClient.rpc('official_correction_history',{p_result:id});
 assert.ok(anonAudit.error,'Public audit history must remain private');
 const privateData=await publicClient.from('official_result_corrections').select('reason');
 assert.ok(privateData.error,'Reasons cannot leak');
 const thirdParty=await notAdmin.client.from('official_result_corrections').select('actor');
 assert.ok(thirdParty.error,'Actor cannot leak');
 console.log('PASS isolated actual Supabase upload, human review, player registration, official publish, duplicate prevention, corrections, standing recompute, immutable source, admin audit, anon security');
}
await main();
