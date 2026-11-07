import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('read-only dashboard catalog query exactly describes the historical Phase 8A migration', async () => {
 const db = new PGlite();
 try {
   await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
     create table auth.users(id uuid primary key);
     create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
   await db.exec(await readFile(new URL('../supabase/migrations/202611060001_foundation.sql',import.meta.url),'utf8'));
   const sql = await readFile(new URL('../supabase/verification/phase8a-inventory.sql',import.meta.url),'utf8');
   await db.exec('begin read only');
   const result = await db.query(sql);
   await db.exec('rollback');
   const reference = JSON.parse(await readFile(new URL('../docs/PHASE8A_REFERENCE.json',import.meta.url),'utf8'));
   assert.deepEqual(result.rows,reference);
   assert.equal(result.rows.length,287);
   const columns = result.rows.filter((row: any) => row.section==='columns');
   assert.equal(columns.length,68);
   assert.equal(columns.filter((row: any) => row.definition.includes('; not_null=t;')).length,65);
   // PG18 represents these same NOT NULL flags twice. Older catalogs have no 'n' rows.
   const rawNotNull = await db.query<{count:number}>(`select count(*)::int as count
     from pg_constraint c join pg_namespace n on n.oid=c.connamespace
     where n.nspname in ('public','private') and c.contype='n'`);
   const version = (await db.query<{version:number}>("select current_setting('server_version_num')::int as version")).rows[0].version;
   assert.equal(rawNotNull.rows[0].count,version>=180000 ? 65 : 0);
   assert.ok(!result.rows.some((row: any) => row.section==='constraints' && row.definition.startsWith('NOT NULL ')));
   // Genuine loss of NOT NULL must still change the column inventory.
   await db.exec('begin; alter table public.screenshot_assets alter column sha256 drop not null');
   const nullableDrift = await db.query(sql);
   assert.notDeepEqual(nullableDrift.rows,reference);
   assert.ok(nullableDrift.rows.some((row: any) => row.section==='columns' && row.object_name==='public.screenshot_assets.sha256' && row.definition.includes('; not_null=f;')));
   await db.exec('rollback');
   // PG18's NOT VALID nullability is not equivalent to the validated foundation.
   if (version>=180000) {
     await db.exec('begin; alter table public.screenshot_assets alter column sha256 drop not null; alter table public.screenshot_assets add constraint review_pending_not_null not null sha256 not valid');
     const validationDrift = await db.query(sql);
     assert.notDeepEqual(validationDrift.rows,reference);
     assert.ok(validationDrift.rows.some((row: any) => row.section==='constraints' && row.object_name==='public.screenshot_assets.review_pending_not_null' && row.definition.includes('validated=false')));
     await db.exec('rollback');
   }
   // A constraint's suffix is not its type: keep real CHECK constraints named *_not_null.
   await db.exec('begin; alter table public.screenshot_assets add constraint review_not_null check(byte_size>0)');
   const checkDrift = await db.query(sql);
   assert.notDeepEqual(checkDrift.rows,reference);
   assert.ok(checkDrift.rows.some((row: any) => row.section==='constraints' && row.object_name==='public.screenshot_assets.review_not_null' && row.definition.startsWith('CHECK')));
   await db.exec('rollback');

   await db.exec(`create schema storage;
     create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
     create table storage.objects(id uuid,bucket_id text,name text); alter table storage.objects enable row level security;`);
   await db.exec('begin read only');
   const environment = await db.exec(await readFile(new URL('../supabase/verification/environment-inventory.sql',import.meta.url),'utf8'));
   await db.exec('rollback');
   assert.equal(environment.at(-1)!.rows.length,0); // No accidental pending-8B collisions.
   // Execute the beginner checklist's aggregate and ledger queries under READ ONLY too.
   const checklist = await readFile(new URL('../docs/MIGRATION_READINESS.md',import.meta.url),'utf8');
   const blocks = [...checklist.matchAll(/```sql\n([\s\S]*?)```/g)].map(match => match[1]);
   assert.equal(blocks.length,3);
   await db.exec('begin read only');
   const aggregates = await db.exec(blocks[0]);
   assert.ok(aggregates.every(result => String(Object.values(result.rows[0])[0])==='0'));
   assert.equal((await db.query<{ledger_table:null}>(blocks[1])).rows[0].ledger_table,null);
   await db.exec('rollback');
   await db.exec(`create schema supabase_migrations;
     create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
     insert into supabase_migrations.schema_migrations values('202611060001','foundation',array['synthetic']);`);
   await db.exec('begin read only');
   const ledger = await db.query(blocks[2]);
   await db.exec('rollback');
   assert.deepEqual(ledger.rows,[{version:'202611060001',recorded_name:'foundation',statement_count:1}]);
   // Unexpected column privileges are visible even without a table-level grant.
   await db.exec('grant insert(sha256) on public.screenshot_assets to authenticated');
   const drift = await db.query(sql);
   assert.notDeepEqual(drift.rows,reference);
   assert.ok(drift.rows.some((row: any) => row.section==='column_privileges' && row.object_name==='public.screenshot_assets.sha256:authenticated:INSERT'));
 } finally { await db.close(); }
});
