import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const actor='10000000-0000-4000-8000-000000000001';
const draft='10000000-0000-4000-8000-000000000002';
const hash='a'.repeat(64);
const objectPath=`${actor}/${draft}/${hash}`;
test('Approved retention eligibility honors inactive 90-day drafts, appeals and unpublished approvals',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    insert into auth.users values('${actor}');
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,created_at timestamptz default now());
    alter table storage.objects enable row level security;`);
  for (const file of ['202611060001_foundation.sql','202611060002_secure_screenshot_import.sql','202611060003_screenshot_retention_audit.sql','202611060004_screenshot_retention_review.sql'])
   await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  await db.exec(`insert into private.administrators(user_id,reason) values('${actor}','test');
    insert into public.import_drafts(id,created_by,created_at,original)
      values('${draft}','${actor}',now()-interval '91 days','{}');
    insert into public.screenshot_assets(draft_id,object_path,mime_type,byte_size,sha256,created_at)
      values('${draft}','${objectPath}','image/png',123,'${hash}',now()-interval '91 days');
    insert into storage.objects(bucket_id,name,metadata,created_at)
      values('tournament-sources','${objectPath}','{"size":"123"}',now()-interval '91 days');`);
  const eligibility=await readFile(new URL('../supabase/verification/screenshot-retention-eligibility.sql',import.meta.url),'utf8');
  let rows=(await db.query<{object_path:string;retention_reason:string}>(eligibility)).rows;
  const preview=await db.query<{object_path:string;retention_reason:string}>(
    'select object_path,retention_reason from public.preview_screenshot_retention($1)',[actor]);
  assert.ok(preview.rows.some(row=>row.object_path===objectPath && row.retention_reason==='abandoned_unapproved_90d'));
  assert.equal((await db.query<{ok:boolean}>("select has_function_privilege('authenticated','public.preview_screenshot_retention(uuid)','EXECUTE') as ok")).rows[0].ok,false);

  assert.ok(rows.some((r)=>r.object_path===objectPath && r.retention_reason==='abandoned_unapproved_90d'));
  // An approval makes the sources ineligible as abandoned, even before publishing.
  const approval='10000000-0000-4000-8000-000000000003';
  await db.exec(`insert into public.approval_history(id,draft_id,revision,decision,actor,reason,validated_snapshot)
    values('${approval}','${draft}',0,'approved','${actor}','synthetic fixture','{}');`);
  rows=(await db.query<{object_path:string;retention_reason:string}>(eligibility)).rows;
  assert.ok(!rows.some((r)=>r.object_path===objectPath));
  // The policy does not turn an unpublished approval into a published result.
  assert.equal((await db.query<{count:number}>('select count(*)::int as count from public.published_results')).rows[0].count,0);
 } finally {await db.close();}
});
