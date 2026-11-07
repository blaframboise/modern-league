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
