-- READ-ONLY retention eligibility. Requires Phase 8B migration.
-- Sources are suggestions for an operator's review, NOT deletion instructions.
-- Policy agreed by league organizer: orphan >=24 hours; abandoned unapproved
-- draft >=90 days since any draft/source/review activity; published result source
-- >=1 year following end of its competitive year. Never delete if status unclear.
-- Result contains private object paths; run only with privileged operator access.
-- IMPORTANT: No automated task reads this query or removes Storage objects.
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
where not exists (
  select 1 from private.screenshot_retention_events e
  where e.object_path=c.object_path and e.event_type in ('hold','delete_requested','delete_succeeded')
)
order by c.retention_reason,c.activity_at,c.object_path;
