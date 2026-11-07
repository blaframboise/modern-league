import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const d = '00000000-0000-4000-8000-000000000003';
const hash = 'a'.repeat(64);
test('Phase 8B real PostgreSQL: owner isolation, private storage, server-only writes, count and immutable provenance', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values ('${a}'),('${b}');
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text, metadata jsonb, created_at timestamptz not null default now());
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated;
      grant all on storage.objects to anon,authenticated;
      create policy deliberately_broad_existing_policy on storage.objects for all to anon,authenticated using(true) with check(true);`);
    await db.exec(await readFile(new URL('../supabase/migrations/202611060001_foundation.sql', import.meta.url), 'utf8'));
    // Reproduce typical Supabase service-role table defaults. Row triggers do not cover TRUNCATE.
    await db.exec('grant all on all tables in schema public to service_role;');
    await db.exec('begin; set local role service_role; truncate public.import_drafts cascade; rollback;');
    await db.exec(await readFile(new URL('../supabase/migrations/202611060002_secure_screenshot_import.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/202611060003_screenshot_retention_audit.sql', import.meta.url), 'utf8'));
    // The administrator predicate remains available to signed-in users, but not anonymously.
    assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.is_administrator()','EXECUTE') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege('authenticated','public.is_administrator()','EXECUTE') as allowed")).rows[0].allowed, true);
    for (const signature of ['public.attach_screenshot(uuid,uuid,text,text,integer)','public.append_screenshot_review(uuid,uuid,integer,jsonb,text,uuid[])','public.create_screenshot_draft(uuid,uuid,jsonb)','public.consume_screenshot_request(uuid,text)']) {
      for (const role of ['anon','authenticated','service_role']) {
        assert.equal((await db.query<{allowed:boolean}>(`select has_function_privilege($1,$2,'EXECUTE') as allowed`,[role,signature])).rows[0].allowed,role==='service_role');
      }
    }
    await db.exec('set role service_role');
    await assert.rejects(db.exec('truncate public.import_drafts cascade'));
    await db.exec('reset role');
    await assert.rejects(db.exec('truncate public.import_drafts cascade'), /Immutable history/);
    await db.exec(`insert into private.administrators(user_id,reason) values ('${a}','test'),('${b}','test');
      insert into public.import_drafts(id,created_by,original) values('${d}','${a}','{}');
      insert into storage.objects(bucket_id,name) values('tournament-sources','${a}/${d}/${hash}');`);
    // Persistent request controls are available only to the trusted service role.
    // Each action is separately counted; denied attempts do not reset the hour.
    for (let i = 0; i < 40; i++) {
      const result = await db.query<{remaining:number}>("select public.consume_screenshot_request($1,'upload') as remaining",[a]);
      assert.equal(Number(result.rows[0].remaining),39-i);
    }
    assert.equal(Number((await db.query<{remaining:number}>("select public.consume_screenshot_request($1,'upload') as remaining",[a])).rows[0].remaining),0);
    assert.equal(Number((await db.query<{remaining:number}>("select public.consume_screenshot_request($1,'upload') as remaining",[a])).rows[0].remaining),0);
    assert.equal(Number((await db.query<{remaining:number}>("select public.consume_screenshot_request($1,'create') as remaining",[a])).rows[0].remaining),59);
    await assert.rejects(db.query("select public.consume_screenshot_request($1,'unknown')",[a]),/Unsupported action/);
    await assert.rejects(db.query("select public.consume_screenshot_request($1,'upload')",[d]),/Forbidden/);
    // Reset only the upload window in this disposable database.
    await db.query("update private.screenshot_request_rates set window_started_at=now()-interval '2 hours' where actor=$1 and action='upload'",[a]);
    assert.equal(Number((await db.query<{remaining:number}>("select public.consume_screenshot_request($1,'upload') as remaining",[a])).rows[0].remaining),39);

    assert.deepEqual((await db.query('select public,file_size_limit from storage.buckets')).rows, [{ public: false, file_size_limit: 10485760 }]);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${a}';`);
    assert.equal((await db.query('select * from public.import_drafts')).rows.length, 1);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0); // no metadata, no access
    await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('tournament-sources','forged')`));
    await assert.rejects(db.exec(`insert into public.import_corrections(draft_id,revision,snapshot,reason) values('${d}',1,'{}','bypass')`));
    await assert.rejects(db.query(`select public.attach_screenshot('${d}','${a}','${hash}','image/png',10)`));
    await db.exec('reset role');
    await db.exec('set role service_role');
    await db.query(`select public.attach_screenshot('${d}','${a}','${hash}','image/png',10)`);
    await db.query(`select public.attach_screenshot('${d}','${a}','${hash}','image/png',10)`);
    assert.equal((await db.query('select * from public.screenshot_assets')).rows.length, 1);
    const snapshot = JSON.stringify({ values: {}, reason: 'Human source review' });
    await db.query(`select public.append_screenshot_review($1,$2,1,$3,'Human source review',$4::uuid[])`, [d,a,snapshot,[(await db.query<{id:string}>('select id from public.screenshot_assets')).rows[0].id]]);
    const sourceIds = (await db.query<{id:string}>('select id from public.screenshot_assets')).rows.map(row => row.id);
    await db.query(`select public.append_screenshot_review($1,$2,1,$3,'Human source review',$4::uuid[])`, [d,a,snapshot,sourceIds]);
    assert.equal((await db.query('select * from public.import_corrections')).rows.length, 1);
    await assert.rejects(db.query(`select public.append_screenshot_review($1,$2,1,'{"reason":"overwrite"}','overwrite',$3::uuid[])`, [d,a,sourceIds]));
    await assert.rejects(db.query(`select public.append_screenshot_review($1,$2,2,$3,'Human source review','{}'::uuid[])`, [d,a,snapshot]));
    await assert.rejects(db.query(`select public.append_screenshot_review($1,$2,2,$3,'Human source review',$4::uuid[])`, [d,b,snapshot,sourceIds]));

    await assert.rejects(db.exec('update public.import_corrections set reason=reason'));
    await assert.rejects(db.exec('delete from public.screenshot_assets'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${a}';`);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
    await assert.rejects(db.query(`select public.append_screenshot_review('${d}','${a}',2,'{}','fake','{}'::uuid[])`));
    await assert.rejects(db.exec(`update storage.objects set name='forged' returning *`).then(result => { if (!result[0].affectedRows) throw new Error('No mutation permitted'); }));
    await db.exec(`set request.jwt.claim.sub='${b}';`);
    for (const table of ['import_drafts','import_corrections','screenshot_assets','extraction_evidence']) assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await db.exec('set role anon');
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await db.exec('reset role');
    for (let i = 1; i < 8; i++) await db.query(`select public.attach_screenshot('${d}','${a}','${String(i).repeat(64)}','image/png',10)`);
    await assert.rejects(db.query(`select public.attach_screenshot('${d}','${a}','${'f'.repeat(64)}','image/png',10)`));
    await assert.rejects(db.query(`select public.attach_screenshot('${d}','${b}','${'f'.repeat(64)}','image/png',10)`));
    await assert.rejects(db.exec('delete from public.screenshot_assets'));
    await assert.rejects(db.exec("update public.screenshot_assets set mime_type='image/jpeg'"));
    const tables = ['players','player_identities','league_seasons','scheduled_events','import_drafts','import_corrections','extraction_evidence','screenshot_assets','approval_history','tournament_results','player_records','published_results'];
    for (const table of tables) {
      for (const role of ['anon','authenticated']) {
        const grants = (await db.query<{update:boolean;delete:boolean;truncate:boolean;insert:boolean}>(`select has_table_privilege($1,$2,'UPDATE') as update, has_table_privilege($1,$2,'DELETE') as delete, has_table_privilege($1,$2,'TRUNCATE') as truncate, has_table_privilege($1,$2,'INSERT') as insert`, [role,`public.${table}`])).rows[0];
        assert.deepEqual(grants, {update:false,delete:false,truncate:false,insert:false});
      }
    }
    assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','public.screenshot_assets','SELECT') as allowed")).rows[0].allowed,true);
    assert.equal((await db.query<{allowed:boolean}>("select has_column_privilege('anon','public.published_results','public_snapshot','SELECT') as allowed")).rows[0].allowed,true);
    assert.equal((await db.query<{allowed:boolean}>("select has_column_privilege('anon','public.published_results','published_by','SELECT') as allowed")).rows[0].allowed,false);
    assert.equal((await db.query('select * from public.published_results')).rows.length, 0);

    // Linked-source quota is enforced across all drafts for the same administrator.
    // Preload 190 MiB in three further drafts; the original draft has linked bytes too.
    // A 10 MiB attachment would exceed the 200 MiB owner quota, while a tiny one fits.
    const quotaDrafts = [
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000013',
      '00000000-0000-4000-8000-000000000014',
    ];
    for (const quotaDraft of quotaDrafts) {
      await db.query('insert into public.import_drafts(id,created_by,original) values ($1,$2,$3)', [quotaDraft,a,'{}']);
    }
    for (let index = 1; index <= 19; index++) {
      const quotaDraft = quotaDrafts[index <= 8 ? 0 : index <= 16 ? 1 : 2];
      const quotaHash = index.toString(16).padStart(64, '0');
      await db.query('insert into public.screenshot_assets(draft_id,object_path,mime_type,byte_size,sha256) values($1,$2,$3,$4,$5)', [
        quotaDraft, `${a}/${quotaDraft}/${quotaHash}`, 'image/png', 10485760, quotaHash,
      ]);
    }
    // Browser draft creation is unavailable; the service RPC must enforce quota.
    assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','public.import_drafts','INSERT') as allowed")).rows[0].allowed,false);
    const createDraftId = '00000000-0000-4000-8000-000000000088';
    await db.query("select public.create_screenshot_draft($1,$2,$3::jsonb)", [createDraftId,a,'{}']);
    await db.query("select public.create_screenshot_draft($1,$2,$3::jsonb)", [createDraftId,a,'{}']); // same-owner retry
    assert.equal((await db.query<{count:number}>('select count(*)::int as count from public.import_drafts where id=$1',[createDraftId])).rows[0].count,1);
    await assert.rejects(db.query("select public.create_screenshot_draft($1,$2,$3::jsonb)",[createDraftId,b,'{}']), /Draft unavailable/);
    await assert.rejects(db.query("select public.create_screenshot_draft($1,$2,$3::jsonb)", ['00000000-0000-4000-8000-000000000089',a,'null']), /Invalid draft original/);
    // Add synthetic drafts to the cap. These are local-disposable test rows only.
    await db.exec(`insert into public.import_drafts(id,created_by,original)
      select ('00000000-0000-4000-8000-' || lpad(to_hex(g),12,'0'))::uuid,
      '${a}'::uuid, '{}'::jsonb from generate_series(200, 694) g;`);
    await assert.rejects(db.query("select public.create_screenshot_draft($1,$2,$3::jsonb)", ['00000000-0000-4000-8000-000000000099',a,'{}']), /Administrator draft quota exceeded/);
    await db.query("select public.create_screenshot_draft($1,$2,$3::jsonb)", [createDraftId,a,'{}']); // existing retry remains legal at cap

    // Read-only monitoring counts Storage orphans without exposing paths.
    await db.query(`insert into storage.objects(bucket_id,name,metadata,created_at)
      values('tournament-sources','orphan-test', '{"size": "123"}', now() - interval '48 hours')`);
    const audit = await readFile(new URL('../supabase/verification/screenshot-storage-audit.sql', import.meta.url), 'utf8');
    await db.exec('begin read only');
    const auditRows = await db.query<{stored_objects:number;linked_objects:number;unlinked_objects:number;estimated_unlinked_bytes:number;unlinked_older_than_24h:number}>(audit);
    await db.exec('rollback');
    assert.equal(Number(auditRows.rows[0].stored_objects),2);
    assert.equal(Number(auditRows.rows[0].linked_objects),1);
    assert.equal(Number(auditRows.rows[0].unlinked_objects),1);
    assert.equal(Number(auditRows.rows[0].estimated_unlinked_bytes),123);
    assert.equal(Number(auditRows.rows[0].unlinked_older_than_24h),1);

    // Retention governance stays service-only: no browser read/write or delete.
    for (const role of ['anon','authenticated']) {
      assert.equal((await db.query<{ok:boolean}>(
        "select has_function_privilege($1,'public.record_screenshot_retention_event(uuid,text,text,text,jsonb)','EXECUTE') as ok",
        [role])).rows[0].ok,false);
    }
    assert.equal((await db.query<{ok:boolean}>(
      "select has_function_privilege('service_role','public.record_screenshot_retention_event(uuid,text,text,text,jsonb)','EXECUTE') as ok"
    )).rows[0].ok,true);
    const orphanPath = `${a}/${d}/${'b'.repeat(64)}`;
    await db.query(`insert into storage.objects(bucket_id,name,created_at,metadata)
      values('tournament-sources',$1,now()-interval '48 hours','{"size":"321"}')`,[orphanPath]);
    const retentionSql = await readFile(new URL('../supabase/verification/screenshot-retention-eligibility.sql',import.meta.url),'utf8');
    let eligible = await db.query<{object_path:string;retention_reason:string}>(retentionSql);
    assert.ok(eligible.rows.some(row=>row.object_path===orphanPath && row.retention_reason==='orphan_24h'));
    await assert.rejects(db.query(
      "select public.record_screenshot_retention_event($1,$2,'hold','test hold','{}'::jsonb)",
      [b,orphanPath]),/Forbidden/);
    await db.query(
      "select public.record_screenshot_retention_event($1,$2,'hold','Under appeal','{}'::jsonb)",[a,orphanPath]);
    eligible = await db.query(retentionSql);
    assert.ok(!eligible.rows.some((row:any)=>row.object_path===orphanPath));
    await assert.rejects(db.query(
      "select public.record_screenshot_retention_event($1,$2,'delete_requested','Cannot delete held source','{}'::jsonb)",[a,orphanPath]),/Source is held/);
    await db.query(
      "select public.record_screenshot_retention_event($1,$2,'release_hold','Appeal resolved','{}'::jsonb)",[a,orphanPath]);
    eligible = await db.query(retentionSql);
    assert.ok(eligible.rows.some((row:any)=>row.object_path===orphanPath));
    await db.query(
      "select public.record_screenshot_retention_event($1,$2,'delete_requested','Reviewed orphan cleanup','{}'::jsonb)",[a,orphanPath]);
    eligible = await db.query(retentionSql);
    assert.ok(!eligible.rows.some((row:any)=>row.object_path===orphanPath));
    await assert.rejects(db.exec("update private.screenshot_retention_events set reason='rewritten'"),/Immutable history/);
    await assert.rejects(db.exec("delete from private.screenshot_retention_events"),/Immutable history/);
    await assert.rejects(db.exec("truncate private.screenshot_retention_events"),/Immutable history/);
    // No byte removal happens by calling the retention journal.
    assert.equal((await db.query<{count:number}>(
      "select count(*)::int as count from storage.objects where name=$1",[orphanPath])).rows[0].count,1);

    const quotaHash = 'e'.repeat(64);
    await assert.rejects(
      db.query('select public.attach_screenshot($1,$2,$3,$4,$5)', [quotaDrafts[3],a,quotaHash,'image/png',10485760]),
      /Administrator source storage quota exceeded/,
    );
    assert.equal(
      (await db.query<{count:number}>('select count(*)::int as count from public.screenshot_assets where draft_id=$1', [quotaDrafts[3]])).rows[0].count,
      0,
    );
    await db.query('select public.attach_screenshot($1,$2,$3,$4,$5)', [quotaDrafts[3],a,quotaHash,'image/png',1]);
    assert.equal(
      (await db.query<{count:number}>('select count(*)::int as count from public.screenshot_assets where draft_id=$1', [quotaDrafts[3]])).rows[0].count,
      1,
    );
  } finally { await db.close(); }
});
