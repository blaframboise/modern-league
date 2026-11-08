-- Phase 10E: independent administrator correction of saved preseason results.
-- Screenshot review history and player matching remain untouched.
alter table public.sandbox_tournaments
  add column edit_revision integer not null default 0 check (edit_revision >= 0);

create table public.sandbox_result_edits (
  tournament_id uuid not null references public.sandbox_tournaments(id) on delete cascade,
  edit_revision integer not null check (edit_revision > 0),
  previous_results jsonb not null,
  corrected_results jsonb not null,
  actor uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  primary key (tournament_id,edit_revision)
);
alter table public.sandbox_result_edits enable row level security;
revoke all on public.sandbox_result_edits from public, anon, authenticated;
grant select, insert on public.sandbox_result_edits to authenticated;
create policy admin_result_edits_read on public.sandbox_result_edits
  for select to authenticated using ((select public.is_administrator()));
create policy admin_result_edits_insert on public.sandbox_result_edits
  for insert to authenticated with check ((select public.is_administrator()) and actor=(select auth.uid()));

create function public.correct_sandbox_tournament_results(
  p_tournament uuid, p_expected_edit_revision integer, p_results jsonb
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  event_row public.sandbox_tournaments%rowtype;
  entry jsonb;
  original jsonb;
  updated jsonb;
  seen text[] := array[]::text[];
  current_count integer;
  wins_value integer;
  losses_value integer;
  draws_value integer;
  row_key text;
begin
  if not public.is_administrator() or auth.uid() is null then
    raise exception 'Administrator required';
  end if;
  select * into event_row from public.sandbox_tournaments
    where id=p_tournament for update;
  if not found then raise exception 'Unknown test tournament'; end if;
  if p_expected_edit_revision is distinct from event_row.edit_revision then
    raise exception 'This tournament was edited elsewhere. Reload before saving.';
  end if;
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'Expected a complete results array';
  end if;
  select count(*) into current_count from public.sandbox_results where tournament_id=p_tournament;
  if jsonb_array_length(p_results) <> current_count or current_count=0 then
    raise exception 'Every existing player result must be included exactly once';
  end if;
  select jsonb_agg(jsonb_build_object('row_id',row_id,'wins',wins,'losses',losses,'draws',draws) order by row_id)
    into original from public.sandbox_results where tournament_id=p_tournament;
  for entry in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(entry) <> 'object' or
       (select count(*) from jsonb_object_keys(entry)) <> 4 or
       not (entry ?& array['row_id','wins','losses','draws']) or
       jsonb_typeof(entry->'row_id') <> 'string' or
       jsonb_typeof(entry->'wins') <> 'number' or
       jsonb_typeof(entry->'losses') <> 'number' or
       jsonb_typeof(entry->'draws') <> 'number'
    then raise exception 'Invalid result fields'; end if;
    row_key := entry->>'row_id';
    if row_key = any(seen) then raise exception 'Duplicate result row'; end if;
    seen := array_append(seen,row_key);
    wins_value := (entry->>'wins')::integer;
    losses_value := (entry->>'losses')::integer;
    draws_value := (entry->>'draws')::integer;
    if wins_value < 0 or losses_value < 0 or draws_value < 0
      or wins_value+losses_value+draws_value > event_row.scheduled_rounds
    then raise exception 'Match records must be nonnegative and fit scheduled rounds'; end if;
    update public.sandbox_results
      set wins=wins_value,losses=losses_value,draws=draws_value
      where tournament_id=p_tournament and row_id=row_key;
    if not found then raise exception 'Unknown result row'; end if;
  end loop;
  select jsonb_agg(jsonb_build_object('row_id',row_id,'wins',wins,'losses',losses,'draws',draws) order by row_id)
    into updated from public.sandbox_results where tournament_id=p_tournament;
  if updated = original then raise exception 'No result changes to save'; end if;
  update public.sandbox_tournaments set edit_revision=edit_revision+1 where id=p_tournament;
  insert into public.sandbox_result_edits(tournament_id,edit_revision,previous_results,corrected_results,actor)
    values(p_tournament,event_row.edit_revision+1,original,updated,auth.uid());
  return event_row.edit_revision+1;
end $$;
revoke all on function public.correct_sandbox_tournament_results(uuid,integer,jsonb) from public,anon;
grant execute on function public.correct_sandbox_tournament_results(uuid,integer,jsonb) to authenticated;