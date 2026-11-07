-- Phase 8B retention review. A privileged, read-only owner-scoped API.
-- Private view is not in the Data API exposed schemas; only a trusted Edge
-- Function may call the service-only RPC after JWT/admin validation.
create view private.screenshot_retention_candidates as
with source_activity as (
  select d.id as draft_id, d.created_by,
         greatest(d.created_at,
           coalesce((select max(a.created_at) from public.screenshot_assets a where a.draft_id=d.id),d.created_at),
           coalesce((select max(c.created_at) from public.import_corrections c where c.draft_id=d.id),d.created_at)
         ) as last_activity
  from public.import_drafts d
), published_years as (
  select ah.draft_id, se.league_year
  from public.approval_history ah
  join public.tournament_results tr on tr.approval_id=ah.id
  join public.scheduled_events se on se.id=tr.event_id
  join public.published_results pr on pr.result_id=tr.id
  where ah.decision='approved'
), candidates as (
  select o.name as object_path, null::uuid as asset_id, null::uuid as draft_id,
    'orphan_24h'::text as retention_reason, o.created_at as activity_at
  from storage.objects o
  where o.bucket_id='tournament-sources'
    and o.created_at <= now()-interval '24 hours'
    and not exists (select 1 from public.screenshot_assets a where a.object_path=o.name)
  union all
  select a.object_path, a.id, a.draft_id,
    case when py.draft_id is not null then 'published_year_plus_one'
         else 'abandoned_unapproved_90d' end as retention_reason,
    case when py.draft_id is not null
         then make_timestamptz(py.league_year+2,1,1,0,0,0,'UTC')
         else sa.last_activity end as activity_at
  from public.screenshot_assets a
  join source_activity sa on sa.draft_id=a.draft_id
  left join published_years py on py.draft_id=a.draft_id
  where (
      (py.draft_id is not null
       and now() >= make_timestamptz(py.league_year+2,1,1,0,0,0,'UTC'))
      or
      (py.draft_id is null
       and not exists(select 1 from public.approval_history ah where ah.draft_id=a.draft_id)
       and sa.last_activity <= now()-interval '90 days')
    )
)
select c.object_path,c.asset_id,c.draft_id,c.retention_reason,c.activity_at
from candidates c
where coalesce((
 select e.event_type from private.screenshot_retention_events e
 where e.object_path=c.object_path
 order by e.created_at desc,e.id desc limit 1
),'') not in ('hold','delete_requested','delete_succeeded')
order by c.retention_reason,c.activity_at,c.object_path;

revoke all on private.screenshot_retention_candidates from public,anon,authenticated,service_role;

create function public.preview_screenshot_retention(p_actor uuid)
returns table (object_path text,asset_id uuid,draft_id uuid,retention_reason text,activity_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not exists(select 1 from private.administrators where user_id=p_actor)
 then raise exception 'Forbidden'; end if;
 return query select c.object_path,c.asset_id,c.draft_id,c.retention_reason,c.activity_at
 from private.screenshot_retention_candidates c
 where split_part(c.object_path,'/',1)=p_actor::text
 order by c.activity_at,c.object_path limit 100;
end $$;
revoke all on function public.preview_screenshot_retention(uuid) from public,anon,authenticated;
grant execute on function public.preview_screenshot_retention(uuid) to service_role;
