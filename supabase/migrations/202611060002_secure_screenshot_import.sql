-- REVIEW ONLY. Requires the verified/reconciled Phase 8A foundation; do not db push blindly.
-- Phase 8B drafts use the existing immutable originals/correction journal.
-- Restrict pre-existing draft access to the owning administrator.
drop policy admin_read on public.import_drafts;
create policy admin_read on public.import_drafts for select to authenticated
 using (public.is_administrator() and created_by = auth.uid());
drop policy admin_read on public.import_corrections;
create policy admin_read on public.import_corrections for select to authenticated
 using (public.is_administrator() and exists (select 1 from public.import_drafts d where d.id = draft_id and d.created_by = auth.uid()));
drop policy admin_append_correction on public.import_corrections;
-- Trusted server replays the domain before appending. Remove direct browser correction writes.
revoke insert on public.import_corrections from authenticated;

alter table public.screenshot_assets add column created_at timestamptz not null default now();
alter table public.screenshot_assets add constraint screenshot_draft_hash unique(draft_id, sha256);
drop policy admin_read on public.screenshot_assets;
create policy admin_read on public.screenshot_assets for select to authenticated
 using (public.is_administrator() and exists (select 1 from public.import_drafts d where d.id = draft_id and d.created_by = auth.uid()));
drop policy admin_read on public.extraction_evidence;
create policy admin_read on public.extraction_evidence for select to authenticated
 using (public.is_administrator() and exists (select 1 from public.import_drafts d where d.id = draft_id and d.created_by = auth.uid()));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-sources','tournament-sources',false,10485760,array['image/jpeg','image/png','image/webp']);
-- SECURITY DEFINER avoids granting anonymous users metadata access just to evaluate a policy.
create function public.can_read_tournament_source(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.is_administrator() and exists (
 select 1 from public.screenshot_assets a join public.import_drafts d on d.id = a.draft_id
 where a.object_path = p_path and d.created_by = auth.uid())
$$;
revoke all on function public.can_read_tournament_source(text) from public;
grant execute on function public.can_read_tournament_source(text) to anon, authenticated;
-- No browser INSERT/UPDATE/DELETE or signed upload policy. Edge Function writes only.
-- Downloads use authenticated Storage requests, not signed/public URLs.
create policy tournament_source_owner_read on storage.objects for select to authenticated
 using (bucket_id = 'tournament-sources' and public.can_read_tournament_source(name));

-- Count/hash checks serialize per draft. Invoked only after server validates bytes.
create function public.attach_screenshot(p_draft uuid, p_actor uuid, p_hash text, p_mime text, p_size integer)
returns public.screenshot_assets language plpgsql security definer set search_path = '' as $$
declare asset public.screenshot_assets; begin
 if not exists(select 1 from private.administrators where user_id = p_actor) then raise exception 'Forbidden'; end if;
 perform 1 from public.import_drafts where id = p_draft and created_by = p_actor for update;
 if not found then raise exception 'Draft not found'; end if;
 select * into asset from public.screenshot_assets where draft_id = p_draft and sha256 = p_hash;
 if found then return asset; end if;
 if (select count(*) from public.screenshot_assets where draft_id = p_draft) >= 8 then raise exception 'Image count limit'; end if;
 insert into public.screenshot_assets(draft_id,object_path,mime_type,byte_size,sha256)
 values (p_draft,p_actor::text || '/' || p_draft::text || '/' || p_hash,p_mime,p_size,p_hash) returning * into asset;
 return asset;
end $$;
revoke all on function public.attach_screenshot(uuid,uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.attach_screenshot(uuid,uuid,text,text,integer) to service_role;
-- Original/correction/evidence/asset UPDATE and DELETE guards remain intact.
-- No approval/publication grants or endpoints added.
-- Restrictive guards prevent a broad pre-existing Storage policy from opening this bucket.
create policy tournament_source_read_guard on storage.objects as restrictive for select to anon, authenticated
 using (bucket_id <> 'tournament-sources' or public.can_read_tournament_source(name));
create policy tournament_source_insert_guard on storage.objects as restrictive for insert to anon, authenticated
 with check (bucket_id <> 'tournament-sources');
create policy tournament_source_update_guard on storage.objects as restrictive for update to anon, authenticated
 using (bucket_id <> 'tournament-sources') with check (bucket_id <> 'tournament-sources');
create policy tournament_source_delete_guard on storage.objects as restrictive for delete to anon, authenticated
 using (bucket_id <> 'tournament-sources');
grant select, insert on public.import_drafts, public.import_corrections, public.screenshot_assets to service_role;

-- Commit ownership/admin/source-set checks under the same parent lock as asset attachment.
-- Domain replay remains mandatory in Edge code; this RPC is service-only.
create function public.append_screenshot_review(p_draft uuid, p_actor uuid, p_revision integer,
 p_snapshot jsonb, p_reason text, p_sources uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare existing public.import_corrections; begin
 if not exists(select 1 from private.administrators where user_id = p_actor) then raise exception 'Forbidden'; end if;
 perform 1 from public.import_drafts where id = p_draft and created_by = p_actor for update;
 if not found then raise exception 'Draft not found'; end if;
 select * into existing from public.import_corrections where draft_id = p_draft and revision = p_revision;
 if found then
   if existing.snapshot = p_snapshot and existing.reason = p_reason then return; end if;
   raise exception 'Stale revision';
 end if;
 if p_revision <> coalesce((select max(revision) from public.import_corrections where draft_id = p_draft),0) + 1
 then raise exception 'Stale revision'; end if;
 if p_sources is null or cardinality(p_sources) = 0 or
   (select array_agg(id order by id) from public.screenshot_assets where draft_id = p_draft)
   is distinct from (select array_agg(s order by s) from unnest(p_sources) s)
 then raise exception 'Source set changed; review before retry'; end if;
 if p_snapshot->>'reason' is distinct from p_reason then raise exception 'Reason mismatch'; end if;
 insert into public.import_corrections(draft_id,revision,snapshot,reason,actor)
 values(p_draft,p_revision,p_snapshot,p_reason,p_actor);
end $$;
revoke all on function public.append_screenshot_review(uuid,uuid,integer,jsonb,text,uuid[]) from public,anon,authenticated;
grant execute on function public.append_screenshot_review(uuid,uuid,integer,jsonb,text,uuid[]) to service_role;

-- Phase 8A row-level guards cannot intercept TRUNCATE (which also bypasses RLS).
-- Preserve append-only journals even under broad Supabase service-role defaults.
do $$ declare t text; begin
 foreach t in array array['import_drafts','import_corrections','extraction_evidence','screenshot_assets','approval_history','tournament_results','player_records','published_results'] loop
   execute format('revoke truncate on public.%I from public, anon, authenticated, service_role', t);
   execute format('create trigger immutable_truncate before truncate on public.%I for each statement execute function private.immutable_history()', t);
 end loop;
end $$;
