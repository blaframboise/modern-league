-- Follow-up: make the public effective view security-invoker while keeping audit metadata private.
-- Public users may read only the same corrected player snapshot already exposed by the view.
-- Reasons, actors, and previous snapshots remain accessible only through an admin-checked RPC.
revoke all on public.official_result_corrections from public,anon,authenticated;
grant select(result_id,revision,corrected_snapshot) on public.official_result_corrections to anon,authenticated;
drop policy official_correction_admin_read on public.official_result_corrections;
create policy official_public_snapshot_read on public.official_result_corrections
  for select to anon,authenticated using (true);
alter view public.effective_published_results set (security_invoker=true);

create function public.official_correction_history(p_result uuid) returns jsonb
language plpgsql security definer set search_path=''
as $function$
begin
  if auth.uid() is null or not public.is_administrator() then
    raise exception 'Administrator access required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'result_id',c.result_id,
      'revision',c.revision,
      'reason',c.reason,
      'actor',c.actor,
      'created_at',c.created_at,
      'previous_snapshot',c.previous_snapshot,
      'corrected_snapshot',c.corrected_snapshot
    ) order by c.revision)
    from public.official_result_corrections c where c.result_id=p_result
  ),'[]'::jsonb);
end;
$function$;
revoke all on function public.official_correction_history(uuid) from public,anon,authenticated;
grant execute on function public.official_correction_history(uuid) to authenticated;
