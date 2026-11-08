-- Append-only, administrator-authorized official corrections; original publications remain immutable.
create table public.official_result_corrections (
  result_id uuid not null references public.published_results(result_id),
  revision integer not null check (revision > 0),
  previous_snapshot jsonb not null check (jsonb_typeof(previous_snapshot)='object'),
  corrected_snapshot jsonb not null check (jsonb_typeof(corrected_snapshot)='object'),
  actor uuid not null references auth.users(id),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  created_at timestamptz not null default now(),
  primary key(result_id,revision)
);
create index official_result_corrections_latest on public.official_result_corrections(result_id,revision desc);
alter table public.official_result_corrections enable row level security;
revoke all on public.official_result_corrections from public,anon,authenticated;
grant select on public.official_result_corrections to authenticated;
create policy official_correction_admin_read on public.official_result_corrections
  for select to authenticated using ((select public.is_administrator()));
create trigger immutable before update or delete on public.official_result_corrections
  for each row execute function private.immutable_history();

-- A public, explicitly column-limited projection. No screenshot, approval or correction audit data.
-- View ownership is intentional: only the published snapshot and its latest correction are exposed.
create view public.effective_published_results
with (security_barrier=true)
as select p.result_id,
  coalesce((select c.corrected_snapshot
    from public.official_result_corrections c
    where c.result_id=p.result_id
    order by c.revision desc limit 1),p.public_snapshot) as public_snapshot,
  p.published_at
from public.published_results p;
revoke all on public.effective_published_results from public,anon,authenticated;
grant select on public.effective_published_results to anon,authenticated;

create function public.correct_official_tournament(
  p_result uuid, p_expected_revision integer, p_players jsonb,
  p_reason text, p_confirm boolean
) returns integer
language plpgsql security definer set search_path=''
as $function$
declare
  v_actor uuid := auth.uid();
  v_original jsonb;
  v_previous jsonb;
  v_next jsonb;
  v_public_players jsonb := '[]'::jsonb;
  v_input jsonb;
  v_player jsonb;
  v_result jsonb;
  v_kind text;
  v_rounds integer;
  v_max numeric;
  v_w integer;
  v_l integer;
  v_d integer;
  v_place integer;
  v_count integer;
  v_group_count integer;
  v_points numeric;
  v_rev integer;
  v_seen text[] := '{}'::text[];
  v_positions integer[];
  v_pos integer;
  v_expect integer := 1;
  v_cursor integer := 1;
  v_size integer;
  v_id text;
begin
  if v_actor is null or not public.is_administrator() then
    raise exception 'Administrator access required';
  end if;
  if p_confirm is distinct from true or nullif(btrim(p_reason),'') is null
    or length(btrim(p_reason)) > 2000 then
    raise exception 'Explicit confirmation and correction reason required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0
    or jsonb_typeof(p_players) is distinct from 'array' then
    raise exception 'Expected revision and full corrected player array required';
  end if;

  -- Serialize corrections for this event even though its original row stays immutable.
  select p.public_snapshot into v_original
    from public.published_results p where p.result_id=p_result for update;
  if not found then raise exception 'Unknown officially published tournament'; end if;
  select coalesce(max(c.revision),0) into v_rev
    from public.official_result_corrections c where c.result_id=p_result;
  if v_rev<>p_expected_revision then
    raise exception 'Official results changed; reload before editing';
  end if;
  v_previous:=v_original;
  if v_rev>0 then
    select c.corrected_snapshot into v_previous
      from public.official_result_corrections c
      where c.result_id=p_result and c.revision=v_rev;
  end if;
  if v_original->>'version'<>'1' then raise exception 'Unsupported official snapshot format'; end if;
  v_kind:=v_original->>'kind';
  if v_kind not in ('regular','seasonal','annual') then raise exception 'Unknown event category'; end if;
  v_rounds:=(v_original->>'scheduledRounds')::integer;
  if v_rounds<1 then raise exception 'Invalid scheduled round count'; end if;
  v_count:=jsonb_array_length(v_previous->'players');
  if v_count<1 or v_count>256 or jsonb_array_length(p_players)<>v_count then
    raise exception 'Every original player must be corrected exactly once';
  end if;
  if v_kind<>'regular' and v_count<2 then raise exception 'Championship needs two competitors'; end if;

  -- Verify complete identities, score totals and championship competition ranks.
  for v_input in select value from jsonb_array_elements(p_players) loop
    if jsonb_typeof(v_input) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_input))<>5
      or not (v_input ?& array['playerId','wins','losses','draws','finalPosition']) then
      raise exception 'Corrected player entry has unsupported or missing fields';
    end if;
    v_id:=v_input->>'playerId';
    if v_id is null or v_id=any(v_seen) then raise exception 'Duplicate or missing player'; end if;
    v_seen:=array_append(v_seen,v_id);
    if not exists(select 1 from jsonb_array_elements(v_previous->'players') x
      where x->>'playerId'=v_id) then raise exception 'Unrecognized player'; end if;
    if jsonb_typeof(v_input->'wins')<>'number' or
       jsonb_typeof(v_input->'losses')<>'number' or
       jsonb_typeof(v_input->'draws')<>'number' or
       (v_kind<>'regular' and jsonb_typeof(v_input->'finalPosition')<>'number') or
       (v_kind='regular' and jsonb_typeof(v_input->'finalPosition')<>'null') then
      raise exception 'Invalid score or placement type';
    end if;
    begin
      v_w:=(v_input->>'wins')::integer;
      v_l:=(v_input->>'losses')::integer;
      v_d:=(v_input->>'draws')::integer;
      v_place:=case when v_kind='regular' then null else (v_input->>'finalPosition')::integer end;
    exception when others then raise exception 'Scores and placements must be integers'; end;
    if v_w<0 or v_l<0 or v_d<0 or v_w+v_l+v_d>v_rounds
      or (v_place is not null and (v_place<1 or v_place>v_count)) then
      raise exception 'Invalid match record or championship placement';
    end if;
  end loop;

  if v_kind<>'regular' then
    select array_agg((x->>'finalPosition')::integer order by (x->>'finalPosition')::integer)
      into v_positions from jsonb_array_elements(p_players) x;
    -- Competition ranks: 1,1,3 is valid; 1,2,2 valid; 1,1,2 invalid.
    while v_cursor<=v_count loop
      v_pos:=v_positions[v_cursor];
      if v_pos<>v_expect then raise exception 'Championship ranks are not competition ranks'; end if;
      v_size:=1;
      while v_cursor+v_size<=v_count and v_positions[v_cursor+v_size]=v_pos loop
        v_size:=v_size+1;
      end loop;
      v_cursor:=v_cursor+v_size;
      v_expect:=v_expect+v_size;
    end loop;
  end if;

  v_max:=case v_kind when 'regular' then 10 when 'seasonal' then 40 else 120 end;
  for v_player in select value from jsonb_array_elements(v_previous->'players') loop
    select x.value into v_result from jsonb_array_elements(p_players) x
      where x.value->>'playerId'=v_player->>'playerId';
    v_w:=(v_result->>'wins')::integer;
    v_l:=(v_result->>'losses')::integer;
    v_d:=(v_result->>'draws')::integer;
    v_place:=case when v_kind='regular' then null else (v_result->>'finalPosition')::integer end;
    v_points:=v_max*(case when v_kind='regular' then 1.0 else 0.75 end)
      *(3*v_w+v_d)::numeric/(3*v_rounds);
    if v_place is not null then
      select count(*) into v_group_count from jsonb_array_elements(p_players) x
        where (x->>'finalPosition')::integer=v_place;
      v_points:=v_points+v_max*0.25*
        (v_count-v_place-(v_group_count-1)::numeric/2)/(v_count-1);
    end if;
    -- Only the whitelisted result fields can change; names and IDs retain original provenance.
    v_public_players:=v_public_players||jsonb_build_array(
      jsonb_build_object('playerId',v_player->>'playerId','name',v_player->>'name',
        'wins',v_w,'losses',v_l,'draws',v_d,'finalPosition',v_place,
        'points',round(v_points,2)));
  end loop;
  v_next:=jsonb_set(v_original,'{players}',v_public_players,false);
  if v_next=v_previous then raise exception 'No official result changes were supplied'; end if;
  insert into public.official_result_corrections
    (result_id,revision,previous_snapshot,corrected_snapshot,actor,reason)
  values(p_result,v_rev+1,v_previous,v_next,v_actor,btrim(p_reason));
  return v_rev+1;
end;
$function$;
revoke all on function public.correct_official_tournament(uuid,integer,jsonb,text,boolean)
  from public,anon,authenticated;
grant execute on function public.correct_official_tournament(uuid,integer,jsonb,text,boolean)
  to authenticated;
