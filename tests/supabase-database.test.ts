import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const admin = '00000000-0000-0000-0000-000000000001';
const ordinary = '00000000-0000-0000-0000-000000000002';
const draft = '00000000-0000-0000-0000-000000000003';
test('real PostgreSQL constraints and RLS fail closed', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${admin}'), ('${ordinary}');`);
    await db.exec(await readFile(new URL('../supabase/migrations/202611060001_foundation.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into private.administrators(user_id,reason) values ('${admin}','Test bootstrap');`);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${ordinary}';`);
    assert.deepEqual((await db.query('select public.is_administrator() as allowed')).rows, [{ allowed: false }]);
    await assert.rejects(db.exec(`insert into private.administrators(user_id,reason) values ('${ordinary}','Self promotion')`));
    await assert.rejects(db.exec(`insert into public.import_drafts(original) values ('{}')`));
    await db.exec(`set request.jwt.claim.sub = '${admin}';`);
    assert.deepEqual((await db.query('select public.is_administrator() as allowed')).rows, [{ allowed: true }]);
    await db.exec(`insert into public.import_drafts(id, original) values ('${draft}', '{}');`);
    await assert.rejects(db.exec(`insert into public.import_drafts(created_by,original) values ('${ordinary}', '{}')`));
    await db.exec(`insert into public.import_corrections(draft_id,revision,snapshot,reason) values ('${draft}',1,'{}','Correction')`);
    await assert.rejects(db.exec(`insert into public.import_corrections(draft_id,revision,snapshot,reason) values ('${draft}',1,'{}','Stale write')`));
    await assert.rejects(db.exec(`insert into public.import_corrections(draft_id,revision,snapshot,reason) values ('${draft}',3,'{}','Skipped revision')`));
    await assert.rejects(db.exec(`update public.import_drafts set original = '{}'`));
    await assert.rejects(db.exec(`delete from public.import_corrections`));
    for (const table of ['approval_history','tournament_results','player_records','published_results','screenshot_assets','extraction_evidence','players','scheduled_events']) {
      await assert.rejects(db.exec(`insert into public.${table} default values`));
    }
    await db.exec(`set request.jwt.claim.sub = '${ordinary}';`);
    assert.equal((await db.query('select * from public.import_drafts')).rows.length, 0);
    assert.equal((await db.query('select * from public.import_corrections')).rows.length, 0);
    await db.exec('set role anon');
    assert.equal((await db.query('select result_id, public_snapshot, published_at from public.published_results')).rows.length, 0);
    await assert.rejects(db.query('select * from public.import_drafts'));
    await assert.rejects(db.query('select * from public.screenshot_assets'));
    await assert.rejects(db.query('select * from public.player_identities'));
    await db.exec('reset role');
    await assert.rejects(db.exec(`update public.import_drafts set original = '{}'`));
    await assert.rejects(db.exec(`insert into public.league_seasons(league_year,ordinal) values (2027,5)`));
    await db.exec(`insert into public.players(id,display_name) values ('${admin}','Same name'),('${ordinary}','Same name');
      insert into public.league_seasons(id,league_year,ordinal) values ('${admin}',2027,1);
      insert into public.scheduled_events(id,season_id,league_year,kind,name,local_date,local_time,starts_at,scheduled_rounds)
      values ('${admin}','${admin}',2027,'regular','Test','2027-01-04','18:00','2027-01-04T23:00:00Z',3);
      insert into public.approval_history(id,draft_id,revision,decision,actor,reason,validated_snapshot)
      values ('${admin}','${draft}',1,'approved','${admin}','Test only','{}');
      insert into public.tournament_results(id,event_id,approval_id,source_key,scheduled_rounds)
      values ('${admin}','${admin}','${admin}','test',3);`);
    await assert.rejects(db.exec(`insert into public.player_records values ('${admin}','${admin}',3,3,1,0,1)`));
    await assert.rejects(db.exec(`insert into public.player_records values ('${admin}','${admin}',3,-1,0,0,1)`));
    await assert.rejects(db.exec(`insert into public.player_records values ('${admin}','${admin}',4,3,0,0,1)`));
    await db.exec(`insert into public.player_records values ('${admin}','${admin}',3,3,0,0,1)`);
    await assert.rejects(db.exec(`insert into public.player_records values ('${admin}','${admin}',3,3,0,0,1)`));
    await db.exec(`insert into public.published_results values ('${admin}','{"eventName":"Test public projection"}','${admin}',now()); set role anon;`);
    assert.equal((await db.query('select result_id, public_snapshot, published_at from public.published_results')).rows.length, 1);
    await assert.rejects(db.query('select * from public.tournament_results'));
    await assert.rejects(db.query('select published_by from public.published_results'));
  } finally { await db.close(); }
});
