-- Phase 8A: fail-closed foundation. No seed data or publication endpoint.
create schema if not exists private;
revoke all on schema private from public;
create table private.administrators (
  user_id uuid primary key references auth.users(id),
  granted_at timestamptz not null default now(),
  reason text not null check (length(trim(reason)) > 0)
);
alter table private.administrators enable row level security;
create function public.is_administrator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.administrators where user_id = auth.uid())
$$;
revoke all on function public.is_administrator() from public;
grant execute on function public.is_administrator() to anon, authenticated;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) > 0)
);
-- Names are deliberately not unique; aliases never establish identity.
create table public.player_identities (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  alias text not null check (length(trim(alias)) > 0)
);
create table public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  league_year integer not null check (league_year >= 2027),
  ordinal integer not null check (ordinal between 1 and 4),
  unique (league_year, ordinal)
);
create table public.scheduled_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.league_seasons(id),
  league_year integer not null check (league_year >= 2027),
  kind text not null check (kind in ('regular','seasonal','annual')),
  name text not null check (length(trim(name)) > 0),
  local_date date not null,
  local_time time not null,
  time_zone text not null default 'America/Detroit',
  fold_offset text,
  starts_at timestamptz not null,
  scheduled_rounds integer not null check (scheduled_rounds > 0),
  check ((kind = 'annual' and season_id is null) or (kind <> 'annual' and season_id is not null))
);
create table public.import_drafts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  original jsonb not null check (jsonb_typeof(original) = 'object')
);
-- Each revision stores the entire domain snapshot, including value-bound evidence.
-- Browser data is untrusted; saving never establishes readiness or approval.
create table public.import_corrections (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.import_drafts(id),
  revision integer not null check (revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  reason text not null check (length(trim(reason)) > 0),
  actor uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (draft_id, revision)
);
create table public.extraction_evidence (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.import_drafts(id),
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  created_at timestamptz not null default now()
);
create table public.screenshot_assets (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.import_drafts(id),
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$')
);
create table public.approval_history (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.import_drafts(id),
  revision integer not null check (revision >= 0),
  decision text not null check (decision in ('approved','rejected')),
  actor uuid not null references auth.users(id),
  reason text not null check (length(trim(reason)) > 0),
  validated_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (draft_id),
  unique (id, decision)
);
create table public.tournament_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.scheduled_events(id),
  approval_id uuid not null unique,
  decision text not null default 'approved' check (decision = 'approved'),
  source_key text not null unique check (length(trim(source_key)) > 0),
  scheduled_rounds integer not null check (scheduled_rounds > 0),
  foreign key (approval_id, decision) references public.approval_history(id, decision),
  unique (id, scheduled_rounds)
);
create table public.player_records (
  result_id uuid not null,
  player_id uuid not null references public.players(id),
  scheduled_rounds integer not null,
  wins integer not null check (wins >= 0),
  losses integer not null check (losses >= 0),
  draws integer not null check (draws >= 0),
  final_position integer check (final_position > 0),
  primary key (result_id, player_id),
  foreign key (result_id, scheduled_rounds) references public.tournament_results(id, scheduled_rounds),
  check (wins::bigint + losses + draws <= scheduled_rounds)
);
-- Public projection contains only explicitly reviewed public fields, never source evidence.
create table public.published_results (
  result_id uuid primary key references public.tournament_results(id),
  public_snapshot jsonb not null check (jsonb_typeof(public_snapshot) = 'object'),
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now()
);
create function private.immutable_history() returns trigger
language plpgsql set search_path = '' as $$ begin
  raise exception 'Immutable history: append a new review action instead';
end $$;
do $$ declare t text; begin
  foreach t in array array['players','player_identities','league_seasons','scheduled_events','import_drafts','import_corrections','extraction_evidence','screenshot_assets','approval_history','tournament_results','player_records','published_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy admin_read on public.%I for select to authenticated using (public.is_administrator())', t);
  end loop;
  foreach t in array array['import_drafts','import_corrections','extraction_evidence','screenshot_assets','approval_history','tournament_results','player_records','published_results'] loop
    execute format('create trigger immutable before update or delete on public.%I for each row execute function private.immutable_history()', t);
  end loop;
end $$;
revoke select on public.published_results from authenticated;
grant select (result_id, public_snapshot, published_at) on public.published_results to anon, authenticated;
create policy public_read on public.published_results for select to anon, authenticated using (true);
-- Only safe draft persistence is enabled. Official writes and uploads remain closed.
grant insert on public.import_drafts, public.import_corrections to authenticated;
create policy admin_create_draft on public.import_drafts for insert to authenticated
  with check (public.is_administrator() and created_by = auth.uid());
create policy admin_append_correction on public.import_corrections for insert to authenticated
  with check (public.is_administrator() and actor = auth.uid()
    and exists (select 1 from public.import_drafts d where d.id = draft_id)
    and revision = coalesce((select max(c.revision) from public.import_corrections c where c.draft_id = import_corrections.draft_id), 0) + 1);
-- Unique revision atomically rejects concurrent edits; clients must reload on conflict.
-- No grants or policies enable browser approval/publication, registry/calendar editing,
-- or Storage access. A later reviewed server transaction must validate the domain.
