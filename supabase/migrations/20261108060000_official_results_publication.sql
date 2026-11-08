-- Phase 25: publish only an administrator-reviewed saved screenshot and verified identities.
-- Reuse the pre-existing official tables; sandbox records are never copied.
-- For 2027 future events are blocked until their local tournament day.
-- Each date is one league event; calendar revisions and all source rows are revalidated in SQL.
create or replace function public.publish_reviewed_tournament(
  p_draft uuid,
  p_revision integer,
  p_calendar_revision integer,
  p_links jsonb,
  p_reason text,
  p_confirm boolean
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_source jsonb;
  v_values jsonb;
  v_t jsonb;
  v_rows jsonb;
  v_calendar jsonb;
  v_calendar_revision integer;
  v_date date;
  v_kind text;
  v_kind_expected text;
  v_baseline text;
  v_season integer;
  v_year integer;
  v_season_id uuid;
  v_event_id uuid;
  v_approval_id uuid;
  v_result_id uuid;
  v_rounds integer;
  v_count integer;
  v_row jsonb;
  v_link jsonb;
  v_player_id uuid;
  v_name text;
  v_public_rows jsonb := '[]'::jsonb;
  v_points numeric;
  v_w integer;
  v_l integer;
  v_d integer;
  v_place integer;
  v_max integer;
  v_position_points numeric;
  v_swiss_points numeric;
  v_placements integer[];
  v_distinct_ids uuid[] := '{}';
  v_source_key text;
  v_name_event text;
begin
  if v_actor is null or not public.is_administrator() then
    raise exception 'Administrator access required';
  end if;
  if p_confirm is distinct from true or nullif(btrim(p_reason),'') is null then
    raise exception 'Explicit publication confirmation and reason required';
  end if;
  if p_revision < 1 or jsonb_typeof(p_links) is distinct from 'array' then
    raise exception 'Saved review and player mappings required';
  end if;
  select original into v_source from public.import_drafts where id=p_draft and created_by=v_actor for update;
  if v_source is null then raise exception 'No accessible saved screenshot review'; end if;
  if (select count(*) from public.import_corrections where draft_id=p_draft)<>p_revision then
    raise exception 'Screenshot review revision changed; reload before publishing';
  end if;
  select snapshot->'values' into v_values from public.import_corrections
    where draft_id=p_draft and revision=p_revision;
  if v_values is null or jsonb_typeof(v_values) <> 'object' then
    raise exception 'Reviewed source values are unavailable';
  end if;
  v_t := v_values->'tournament';
  v_rows := v_values->'results';
  if jsonb_typeof(v_t)<>'object' or jsonb_typeof(v_rows)<>'array' then
    raise exception 'Malformed saved tournament review';
  end if;
  if (select count(*) from public.approval_history where draft_id=p_draft)>0 then
    raise exception 'This reviewed draft was already decided';
  end if;
  if coalesce(v_t->>'date','') !~ '^2027-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Publication currently supports dated 2027 league events only';
  end if;
  begin v_date := (v_t->>'date')::date;
  exception when others then raise exception 'Invalid tournament date'; end;
  if to_char(v_date,'YYYY-MM-DD') <> v_t->>'date' then
    raise exception 'Invalid tournament date';
  end if;
  if v_date > (now() at time zone 'America/Detroit')::date then
    raise exception 'Future tournament results cannot be published';
  end if;
  if extract(isodow from v_date) not in (1,5) then
    raise exception 'Tournament date is outside the league schedule';
  end if;
  select revision,overrides into v_calendar_revision,v_calendar
    from public.proposed_calendar_settings where year=2027 for share;
  if v_calendar is null or v_calendar_revision<>p_calendar_revision then
    raise exception 'League calendar revision changed; recheck the date';
  end if;
  v_baseline := case
    when v_date in (date '2027-01-29',date '2027-04-02',date '2027-05-28',
                    date '2027-07-30',date '2027-09-24',date '2027-11-12') then 'prerelease'
    when v_date in (date '2027-03-26',date '2027-06-25',date '2027-09-17',date '2027-12-10') then 'seasonal'
    when v_date=date '2027-12-17' then 'annual'
    when v_date in (date '2027-12-24',date '2027-12-31') then 'tbd'
    else 'modern' end;
  v_kind:=coalesce(v_calendar->>to_char(v_date,'YYYY-MM-DD'),v_baseline);
  if v_kind not in ('modern','seasonal','annual') then
    raise exception 'The calendar date is not a scoring Modern League event';
  end if;
  select count(*) into v_season from (
    select d::date as day,coalesce(
      v_calendar->>to_char(d,'YYYY-MM-DD'),
      case
        when d::date in (date '2027-03-26',date '2027-06-25',date '2027-09-17',date '2027-12-10') then 'seasonal'
        when d::date=date '2027-12-17' then 'annual'
        when d::date in (date '2027-01-29',date '2027-04-02',date '2027-05-28',date '2027-07-30',date '2027-09-24',date '2027-11-12') then 'prerelease'
        when d::date in (date '2027-12-24',date '2027-12-31') then 'tbd'
        else 'modern'
      end) as kind
    from generate_series(date '2027-01-01',v_date,interval '1 day') d
    where extract(isodow from d) in (1,5)
  ) days where kind='seasonal';
  if v_kind='modern' then v_season:=v_season+1; end if;
  if v_season not between 1 and 4 then
    raise exception '2028 rollover requires a configured 2028 publication calendar';
  end if;
  v_year:=2027;
  v_kind_expected:=case when v_kind='modern' then 'regular' else v_kind end;
  if (v_t->>'kind') is distinct from v_kind_expected
     or (v_t->>'year')::integer is distinct from v_year
     or (v_kind='annual' and v_t ? 'seasonId')
     or (v_kind<>'annual' and (v_t->>'seasonId') is distinct from ('s'||v_season::text)) then
    raise exception 'Saved review classification does not match the current calendar';
  end if;
  v_name_event:=nullif(btrim(v_t->>'name'),'');
  if v_name_event is null or length(v_name_event)>200 then raise exception 'Review an event name'; end if;
  begin v_rounds:=(v_t->>'scheduledRounds')::integer;
  exception when others then raise exception 'Invalid official round count'; end;
  if v_rounds not between 1 and 20 then raise exception 'Review the official number of rounds (1-20)'; end if;
  v_count:=jsonb_array_length(v_rows);
  if v_count<1 or v_count>256 or jsonb_array_length(p_links)<>v_count then
    raise exception 'All reviewed tournament players must be mapped';
  end if;
  if (select count(distinct x->>'rowId') from jsonb_array_elements(v_rows) x)<>v_count
     or (select count(distinct x->>'rowId') from jsonb_array_elements(p_links) x)<>v_count
     or exists (select 1 from jsonb_array_elements(p_links) x where
          (select count(*) from jsonb_array_elements(v_rows) r where r->>'rowId'=x->>'rowId')<>1) then
    raise exception 'Every source row must be mapped once';
  end if;
  -- Explicit approval and calendar source-of-truth are captured together in one transaction.
  insert into public.approval_history(draft_id,revision,decision,actor,reason,validated_snapshot)
  values(p_draft,p_revision,'approved',v_actor,btrim(p_reason),v_values) returning id into v_approval_id;
  insert into public.league_seasons(league_year,ordinal) values(v_year,v_season)
    on conflict(league_year,ordinal) do update set ordinal=excluded.ordinal returning id into v_season_id;
  insert into public.scheduled_events(season_id,league_year,kind,name,local_date,local_time,time_zone,starts_at,scheduled_rounds)
  values(case when v_kind='annual' then null else v_season_id end,
      v_year,case v_kind when 'modern' then 'regular' else v_kind end,v_name_event,v_date,
      time '18:00','America/Detroit',(v_date+time '18:00') at time zone 'America/Detroit',v_rounds)
  returning id into v_event_id;
  v_source_key:='modern-league:'||v_date::text;
  insert into public.tournament_results(event_id,approval_id,decision,source_key,scheduled_rounds)
  values(v_event_id,v_approval_id,'approved',v_source_key,v_rounds) returning id into v_result_id;
  for v_row in select value from jsonb_array_elements(v_rows) loop
    select value into v_link from jsonb_array_elements(p_links) where value->>'rowId'=v_row->>'rowId';
    if v_link is null then raise exception 'Missing player identity mapping'; end if;
    v_name:=nullif(btrim(v_link->>'displayName'),'');
    if nullif(v_link->>'playerId','') is not null then
      begin v_player_id:=(v_link->>'playerId')::uuid;
      exception when others then raise exception 'Invalid player identity'; end;
      if not exists(select 1 from public.players where id=v_player_id) then raise exception 'Unknown official player identity'; end if;
    else
      if v_name is null or length(v_name)>120 then raise exception 'New player needs a display name'; end if;
      insert into public.players(display_name) values(v_name) returning id into v_player_id;
    end if;
    if v_player_id=any(v_distinct_ids) then raise exception 'Player mapped to multiple result rows'; end if;
    v_distinct_ids:=array_append(v_distinct_ids,v_player_id);
    if nullif(btrim(v_row->>'importedName'),'') is null then raise exception 'Incomplete official player name'; end if;
    if not exists (select 1 from public.player_identities
       where player_id=v_player_id and lower(btrim(alias))=lower(btrim(v_row->>'importedName'))) then
      insert into public.player_identities(player_id,alias) values(v_player_id,btrim(v_row->>'importedName'));
    end if;
    begin
      v_w:=(v_row->>'wins')::integer;
      v_l:=(v_row->>'losses')::integer;
      v_d:=(v_row->>'draws')::integer;
      v_place:=case when v_row->>'finalPosition' is null then null else (v_row->>'finalPosition')::integer end;
    exception when others then raise exception 'Every result must include valid W/L/D and placement where applicable'; end;
    if v_w is null or v_l is null or v_d is null or v_w<0 or v_l<0 or v_d<0 or v_w+v_l+v_d>v_rounds then
      raise exception 'Invalid recorded player rounds';
    end if;
    if v_kind<>'modern' and (v_place is null or v_place<1 or v_place>v_count) then
      raise exception 'Championship records require official final placements';
    end if;
    if v_kind='modern' then v_place:=null; end if;
    insert into public.player_records(result_id,player_id,scheduled_rounds,wins,losses,draws,final_position)
    values(v_result_id,v_player_id,v_rounds,v_w,v_l,v_d,v_place);
    v_max:=case v_kind when 'modern' then 10 when 'seasonal' then 40 else 120 end;
    v_swiss_points:=v_max * (case when v_kind='modern' then 1.0 else 0.75 end)
      * (3*v_w+v_d)::numeric / (3*v_rounds);
    v_position_points:=case when v_kind='modern' then 0
      when v_count=1 then 0
      else (v_max*0.25*(v_count-v_place)::numeric/(v_count-1)) end;
    v_points:=v_swiss_points+v_position_points;
    v_public_rows:=v_public_rows||jsonb_build_array(jsonb_build_object(
      'playerId',v_player_id,'name',(select display_name from public.players where id=v_player_id),
      'wins',v_w,'losses',v_l,'draws',v_d,'finalPosition',v_place,
      'points',round(v_points,2)));
  end loop;
  if v_kind<>'modern' and v_count<2 then raise exception 'Championship needs at least two competitors'; end if;
  if v_kind<>'modern' and not exists (select 1 from public.player_records
    where result_id=v_result_id and final_position=1) then raise exception 'Championship must include a first-place finisher'; end if;
  insert into public.published_results(result_id,public_snapshot,published_by)
  values(v_result_id,jsonb_build_object(
    'version',1,'date',v_date,'name',v_name_event,'year',v_year,
    'season',v_season,'kind',case v_kind when 'modern' then 'regular' else v_kind end,
    'scheduledRounds',v_rounds,'calendarRevision',v_calendar_revision,
    'players',v_public_rows),v_actor);
  return v_result_id;
end;
$function$;

revoke all on function public.publish_reviewed_tournament(uuid,integer,integer,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.publish_reviewed_tournament(uuid,integer,integer,jsonb,text,boolean) to authenticated;
-- Public projection contains names, tournament points, and results only; private identities, screenshots, drafts and audit notes stay restricted.
grant select on public.published_results to anon,authenticated;
