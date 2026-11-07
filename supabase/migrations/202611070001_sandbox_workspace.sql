-- Phase 9: isolated pre-2027 test workspace; never joins official published results.
create table public.sandbox_players (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check (length(trim(display_name)) between 2 and 120),
 created_at timestamptz not null default now()
);
create table public.sandbox_player_aliases (
 player_id uuid not null references public.sandbox_players(id) on delete cascade,
 alias text not null check (length(trim(alias)) between 1 and 120),
 primary key (player_id, alias)
);
create table public.sandbox_tournaments (
 id uuid primary key default gen_random_uuid(),
 draft_id uuid not null unique references public.import_drafts(id),
 revision integer not null check (revision > 0),
 event_name text not null check (length(trim(event_name)) between 1 and 200),
 season_ordinal integer not null check (season_ordinal between 1 and 4),
 scheduled_rounds integer not null check (scheduled_rounds between 1 and 20),
 created_at timestamptz not null default now()
);
create table public.sandbox_results (
 tournament_id uuid not null references public.sandbox_tournaments(id) on delete cascade,
 row_id text not null check (length(trim(row_id)) between 1 and 120),
 player_id uuid not null references public.sandbox_players(id),
 wins integer not null check (wins >= 0),
 losses integer not null check (losses >= 0),
 draws integer not null check (draws >= 0),
 primary key (tournament_id,row_id),
 unique (tournament_id,player_id)
);
create index sandbox_results_player_id_idx on public.sandbox_results(player_id);
-- Only administrators can access sandbox tables, including anonymous read denial.
do $$ declare tab text; begin
 foreach tab in array array['sandbox_players','sandbox_player_aliases','sandbox_tournaments','sandbox_results'] loop
   execute format('alter table public.%I enable row level security',tab);
   execute format('revoke all on public.%I from public,anon,authenticated',tab);
   execute format('grant select,insert,update,delete on public.%I to authenticated',tab);
   execute format('create policy admin_sandbox_select on public.%I for select to authenticated using ((select public.is_administrator()))',tab);
   execute format('create policy admin_sandbox_insert on public.%I for insert to authenticated with check ((select public.is_administrator()))',tab);
   execute format('create policy admin_sandbox_update on public.%I for update to authenticated using ((select public.is_administrator())) with check ((select public.is_administrator()))',tab);
   execute format('create policy admin_sandbox_delete on public.%I for delete to authenticated using ((select public.is_administrator()))',tab);
 end loop;
end $$;

-- One atomic review-to-sandbox mapping operation. No official table is modified.
create function public.save_sandbox_tournament(
 p_draft uuid, p_revision integer, p_name text, p_season integer, p_rounds integer, p_links jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare saved uuid; latest jsonb; link jsonb; row_entry jsonb; source_rows jsonb; matched jsonb;
begin
 if not public.is_administrator() then raise exception 'Administrator required'; end if;
 if p_revision < 1 or p_season not between 1 and 4 or p_rounds not between 1 and 20
    or length(trim(coalesce(p_name,''))) not between 1 and 200
    or jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) = 0
    or jsonb_array_length(p_links) > 64 then raise exception 'Invalid sandbox tournament'; end if;
 select snapshot->'values' into latest
 from public.import_corrections where draft_id=p_draft and revision=p_revision;
 if latest is null or (select count(*) from public.import_corrections where draft_id=p_draft) <> p_revision then
    raise exception 'Latest reviewed revision required'; end if;
 source_rows := latest->'results';
 if jsonb_typeof(source_rows) <> 'array' or jsonb_array_length(source_rows) <> jsonb_array_length(p_links) then
    raise exception 'All reviewed participants must be assigned'; end if;
 for link in select value from jsonb_array_elements(p_links)
 loop
   if jsonb_typeof(link) <> 'object' or
     (link->>'row_id') is null or (link->>'player_id') is null or
     (link->>'wins') is null or (link->>'losses') is null or (link->>'draws') is null
     then raise exception 'Missing sandbox row fields'; end if;
   select value into matched from jsonb_array_elements(source_rows) where value->>'rowId' = link->>'row_id';
   if matched is null or
      (matched->>'wins')::integer is distinct from (link->>'wins')::integer or
      (matched->>'losses')::integer is distinct from (link->>'losses')::integer or
      (matched->>'draws')::integer is distinct from (link->>'draws')::integer then
      raise exception 'Sandbox rows differ from reviewed screenshot revision'; end if;
 end loop;
 insert into public.sandbox_tournaments(draft_id,revision,event_name,season_ordinal,scheduled_rounds)
 values(p_draft,p_revision,trim(p_name),p_season,p_rounds)
 on conflict(draft_id) do update set revision=excluded.revision,event_name=excluded.event_name,
 season_ordinal=excluded.season_ordinal,scheduled_rounds=excluded.scheduled_rounds
 returning id into saved;
 delete from public.sandbox_results where tournament_id=saved;
 insert into public.sandbox_results(tournament_id,row_id,player_id,wins,losses,draws)
 select saved,l->>'row_id',(l->>'player_id')::uuid,
        (l->>'wins')::integer,(l->>'losses')::integer,(l->>'draws')::integer
 from jsonb_array_elements(p_links) l;
 if exists (select 1 from public.sandbox_results where tournament_id=saved and wins+losses+draws > p_rounds)
 then raise exception 'Match totals exceed configured Swiss rounds'; end if;
 return saved;
end $$;
revoke all on function public.save_sandbox_tournament(uuid,integer,text,integer,integer,jsonb) from public,anon;
grant execute on function public.save_sandbox_tournament(uuid,integer,text,integer,integer,jsonb) to authenticated;
