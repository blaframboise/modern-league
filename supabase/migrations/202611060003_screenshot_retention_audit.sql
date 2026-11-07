-- Phase 8B retention governance, proposal approved by league organizer.
-- Audited holds and review decisions only. No byte deletion is performed here.
-- Every event is append-only, actor-attributed, and service-only.
create table private.screenshot_retention_events (
  id uuid primary key default gen_random_uuid(),
  object_path text not null check (length(object_path) between 1 and 512),
  actor uuid not null references auth.users(id),
  event_type text not null check (event_type in
    ('hold','release_hold','delete_requested','delete_succeeded','delete_failed')),
  reason text not null check (length(trim(reason)) between 1 and 2000),
  policy_version integer not null default 1 check (policy_version=1),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  created_at timestamptz not null default now()
);
create index screenshot_retention_object_time on private.screenshot_retention_events(object_path,created_at,id);
alter table private.screenshot_retention_events enable row level security;
revoke all on private.screenshot_retention_events from public, anon, authenticated, service_role;
create trigger immutable before update or delete on private.screenshot_retention_events
  for each row execute function private.immutable_history();
create trigger immutable_truncate before truncate on private.screenshot_retention_events
  for each statement execute function private.immutable_history();

-- Record an operator's reviewed decision without giving the browser any direct
-- INSERT permission. Each event is attributable; there is no silent overwrite.
-- Storage deletion is intentionally not exposed by this RPC.
create function public.record_screenshot_retention_event(
  p_actor uuid,p_path text,p_event text,p_reason text,p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid; last_type text; begin
  perform 1 from private.administrators where user_id=p_actor for update;
  if not found then raise exception 'Forbidden'; end if;
  if p_path is null or length(p_path) not between 1 and 512
     or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}$'
  then raise exception 'Invalid source path'; end if;
  if p_event not in ('hold','release_hold','delete_requested','delete_succeeded','delete_failed')
     or p_event is null then raise exception 'Unsupported retention event'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 2000
     then raise exception 'Reason required'; end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object'
     then raise exception 'Invalid retention details'; end if;
  select event_type into last_type from private.screenshot_retention_events
    where object_path=p_path order by created_at desc,id desc limit 1;
  if last_type='delete_succeeded' then raise exception 'Source already deleted'; end if;
  if p_event='release_hold' and last_type is distinct from 'hold'
    then raise exception 'No active hold'; end if;
  if last_type='hold' and p_event in ('delete_requested','delete_succeeded')
    then raise exception 'Source is held'; end if;
  if p_event='delete_succeeded' and last_type is distinct from 'delete_requested'
    then raise exception 'Deletion was not requested'; end if;
  if p_event='delete_requested' and last_type='delete_succeeded'
    then raise exception 'Deletion already recorded'; end if;
  -- This RPC deliberately logs decisions, not proof of Storage state;
  -- caller must perform an independent actual Storage state verification.
  insert into private.screenshot_retention_events(object_path,actor,event_type,reason,details)
    values(p_path,p_actor,p_event,p_reason,p_details) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.record_screenshot_retention_event(uuid,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.record_screenshot_retention_event(uuid,text,text,text,jsonb)
  to service_role;

-- A recorded successful purge permanently revokes source download authorization.
-- Metadata is immutable and remains as an audit record, not a live file promise.
create or replace function public.can_read_tournament_source(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.is_administrator() and exists (
   select 1 from public.screenshot_assets a
   join public.import_drafts d on d.id=a.draft_id
   where a.object_path=p_path and d.created_by=auth.uid()
 ) and not exists (
   select 1 from private.screenshot_retention_events e
   where e.object_path=p_path and e.event_type='delete_succeeded'
 )
$$;

-- Lock out relinking an object while a reviewed purge is pending or completed.
-- An orphan upload retry must start a separately reviewed recovery rather than
-- silently restoring old evidence after it entered a deletion workflow.
create function private.reject_retired_source_link() returns trigger
language plpgsql set search_path = '' as $$
begin
 if exists (
  select 1 from private.screenshot_retention_events e
  where e.object_path=new.object_path and e.event_type in ('delete_requested','delete_succeeded')
 ) then raise exception 'Source retained for deletion review; cannot relink'; end if;
 return new;
end $$;
create trigger reject_retired_source_link before insert on public.screenshot_assets
 for each row execute function private.reject_retired_source_link();
