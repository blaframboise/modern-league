-- Retention execution v1: administrator-initiated cleanup of unlinked
-- tournament source objects ONLY. Linked images are intentionally not deleted.
-- Preparation obtains the same administrator row lock as attach_screenshot,
-- then creates a durable deletion request. A failed Storage call is retriable.
create function public.prepare_orphan_screenshot_cleanup(p_actor uuid,p_path text,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare last_id uuid; last_type text; source_created timestamptz; request_id uuid; begin
 perform 1 from private.administrators where user_id=p_actor for update;
 if not found then raise exception 'Forbidden'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 2000
 then raise exception 'Reason required'; end if;
 if p_path is null or length(p_path)>512
   or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}$'
   or split_part(p_path,'/',1)<>p_actor::text
 then raise exception 'Invalid or foreign source path'; end if;
 select id,event_type into last_id,last_type
 from private.screenshot_retention_events
 where object_path=p_path order by created_at desc,id desc limit 1;
 if last_type='delete_requested' then return last_id; end if;
 if last_type in ('hold','delete_succeeded')
 then raise exception 'Source held or already deleted'; end if;
 select o.created_at into source_created from storage.objects o
 where o.bucket_id='tournament-sources' and o.name=p_path;
 if not found or source_created > now()-interval '24 hours'
 then raise exception 'Not an eligible orphan'; end if;
 if exists(select 1 from public.screenshot_assets a where a.object_path=p_path)
 then raise exception 'Source linked to immutable evidence'; end if;
 insert into private.screenshot_retention_events(object_path,actor,event_type,reason,details)
 values(p_path,p_actor,'delete_requested',p_reason,jsonb_build_object('mode','orphan_cleanup_v1'))
 returning id into request_id;
 return request_id;
end $$;
revoke all on function public.prepare_orphan_screenshot_cleanup(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.prepare_orphan_screenshot_cleanup(uuid,text,text) to service_role;

-- Called only AFTER the trusted Storage API removal and an independent absence
-- check. It does not remove bytes itself and refuses to log success if metadata
-- still exists or the path has gained an asset link.
create function public.finish_orphan_screenshot_cleanup(p_actor uuid,p_path text,p_request uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare recent_id uuid; recent_type text; completed uuid; begin
 perform 1 from private.administrators where user_id=p_actor for update;
 if not found or split_part(p_path,'/',1)<>p_actor::text
 then raise exception 'Forbidden'; end if;
 select id,event_type into recent_id,recent_type
 from private.screenshot_retention_events
 where object_path=p_path order by created_at desc,id desc limit 1;
 if recent_type='delete_succeeded' then return recent_id; end if;
 if recent_type is distinct from 'delete_requested' or recent_id<>p_request
 then raise exception 'Deletion request unavailable or superseded'; end if;
 if exists(select 1 from storage.objects o where o.bucket_id='tournament-sources' and o.name=p_path)
 then raise exception 'Storage object still present'; end if;
 if exists(select 1 from public.screenshot_assets a where a.object_path=p_path)
 then raise exception 'Linked source cannot be orphan-purged'; end if;
 insert into private.screenshot_retention_events(object_path,actor,event_type,reason,details)
 values(p_path,p_actor,'delete_succeeded','Confirmed object removal',
        jsonb_build_object('mode','orphan_cleanup_v1','request_id',p_request))
 returning id into completed;
 return completed;
end $$;
revoke all on function public.finish_orphan_screenshot_cleanup(uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.finish_orphan_screenshot_cleanup(uuid,text,uuid) to service_role;
