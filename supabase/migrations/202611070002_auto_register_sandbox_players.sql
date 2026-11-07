-- Allow a reviewed preseason tournament to establish the test registry atomically.
-- Empty player_id means "register a new test player"; nonempty ID is explicit mapping.
create function public.import_sandbox_tournament_with_players(
 p_draft uuid,p_revision integer,p_name text,p_season integer,p_rounds integer,p_links jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
 link jsonb; source_rows jsonb; row_source jsonb; source_name text;
 proposed_name text; matched_player uuid; resolved jsonb := '[]'::jsonb;
 result_id uuid; canonical text;
begin
 if not public.is_administrator() then raise exception 'Administrator required'; end if;
 if p_revision < 1 or p_season not between 1 and 4 or p_rounds not between 1 and 20
   or length(trim(coalesce(p_name,''))) not between 1 and 200
   or jsonb_typeof(p_links) is distinct from 'array' or jsonb_array_length(p_links) not between 1 and 64
 then raise exception 'Invalid test tournament'; end if;

 -- Serialize registry creation to avoid a race between two matching screens.
 perform pg_advisory_xact_lock(192027,1001);
 select snapshot->'values'->'results' into source_rows
 from public.import_corrections where draft_id=p_draft and revision=p_revision;
 if source_rows is null or jsonb_typeof(source_rows) <> 'array'
   or (select count(*) from public.import_corrections where draft_id=p_draft) <> p_revision
   or jsonb_array_length(source_rows) <> jsonb_array_length(p_links)
 then raise exception 'Current reviewed tournament is required'; end if;

 if (select count(distinct l->>'row_id') from jsonb_array_elements(p_links) l) <> jsonb_array_length(p_links)
 then raise exception 'Duplicate input rows'; end if;
 for link in select value from jsonb_array_elements(p_links)
 loop
   select value into row_source from jsonb_array_elements(source_rows) where value->>'rowId'=link->>'row_id';
   if row_source is null then raise exception 'Unrecognized screenshot row'; end if;
   source_name := trim(row_source->>'importedName');
   if source_name is null or length(source_name) not between 1 and 120 then
     raise exception 'Each imported player must have a name'; end if;
   if (link->>'player_id') is not null and length(trim(link->>'player_id')) > 0 then
     matched_player := (link->>'player_id')::uuid;
     if not exists(select 1 from public.sandbox_players where id=matched_player)
     then raise exception 'Unknown test player'; end if;
   else
     proposed_name := trim(link->>'display_name');
     if proposed_name is null or length(proposed_name) not between 2 and 120
     then raise exception 'New players require a verified display name'; end if;
     canonical := lower(regexp_replace(source_name,'\\s+',' ','g'));
     -- Exact-case-insensitive matches must be deliberately linked to existing IDs.
     if exists (
       select 1 from public.sandbox_players
       where lower(regexp_replace(trim(display_name),'\\s+',' ','g'))=canonical
     ) or exists (
       select 1 from public.sandbox_player_aliases
       where lower(regexp_replace(trim(alias),'\\s+',' ','g'))=canonical
     ) then raise exception 'A player with this Companion name already exists. Resolve their identity before importing.'; end if;
     insert into public.sandbox_players(display_name) values(proposed_name) returning id into matched_player;
   end if;
   -- An alias is grounded by explicit administrator approval of the review.
   insert into public.sandbox_player_aliases(player_id,alias)
   values(matched_player,source_name)
   on conflict(player_id,alias) do nothing;
   resolved := resolved || jsonb_build_array(
     jsonb_build_object('row_id',link->>'row_id','player_id',matched_player,
       'wins',link->'wins','losses',link->'losses','draws',link->'draws'));
 end loop;
 -- Reuse the strict domain review checks, unique player constraints and snapshot matching.
 select public.save_sandbox_tournament(p_draft,p_revision,p_name,p_season,p_rounds,resolved) into result_id;
 return result_id;
end $$;
revoke all on function public.import_sandbox_tournament_with_players(uuid,integer,text,integer,integer,jsonb) from public,anon;
grant execute on function public.import_sandbox_tournament_with_players(uuid,integer,text,integer,integer,jsonb) to authenticated;
