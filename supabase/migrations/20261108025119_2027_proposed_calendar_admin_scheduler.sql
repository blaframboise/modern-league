-- 2027 planning scheduler. Public read is for an expressly provisional preview only.
-- Official events and published results are unchanged.
create function public.valid_proposal_overrides(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v text; d date; n integer;
begin
 if jsonb_typeof(p) <> 'object' then return false; end if;
 select count(*) into n from jsonb_each(p);
 if n > 105 then return false; end if;
 for k,v in select key,value #>> '{}' from jsonb_each(p) loop
  if k !~ '^2027-[0-9]{2}-[0-9]{2}$' then return false; end if;
  begin d := k::date; exception when others then return false; end;
  if d < date '2027-01-01' or d > date '2027-12-31' or extract(isodow from d) not in (1,5) then return false; end if;
  if v not in ('modern','seasonal','annual','prerelease','tbd','none') then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function public.valid_proposal_overrides(jsonb) from public;
grant execute on function public.valid_proposal_overrides(jsonb) to anon,authenticated;

create table public.proposed_calendar_settings(
 year integer primary key check(year=2027),
 revision integer not null default 0 check(revision>=0),
 overrides jsonb not null default '{}'::jsonb check(public.valid_proposal_overrides(overrides)),
 updated_at timestamptz not null default now()
);
alter table public.proposed_calendar_settings enable row level security;
revoke all on public.proposed_calendar_settings from anon,authenticated;
grant select on public.proposed_calendar_settings to anon,authenticated;
grant update(revision,overrides) on public.proposed_calendar_settings to authenticated;
create policy proposal_public_read on public.proposed_calendar_settings for select
 to anon,authenticated using(true);
create policy proposal_admin_update on public.proposed_calendar_settings for update
 to authenticated using((select public.is_administrator()))
 with check((select public.is_administrator()));

create function public.validate_proposed_calendar_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.year <> old.year or new.revision <> old.revision+1 then
  raise exception 'Calendar revision mismatch';
 end if;
 new.updated_at := now();
 return new;
end $$;
revoke all on function public.validate_proposed_calendar_revision() from public;
create trigger proposed_calendar_revision before update on public.proposed_calendar_settings
 for each row execute function public.validate_proposed_calendar_revision();
insert into public.proposed_calendar_settings(year) values(2027);
