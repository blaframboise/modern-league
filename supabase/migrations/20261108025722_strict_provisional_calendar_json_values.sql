-- Reject non-string values, including JSON null, in provisional calendar overrides.
create or replace function public.valid_proposal_overrides(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; d date; n integer;
begin
 if jsonb_typeof(p) <> 'object' then return false; end if;
 select count(*) into n from jsonb_each(p);
 if n > 105 then return false; end if;
 for k,v in select key,value from jsonb_each(p) loop
  if k !~ '^2027-[0-9]{2}-[0-9]{2}$' or jsonb_typeof(v) <> 'string' then return false; end if;
  begin d := k::date; exception when others then return false; end;
  if d < date '2027-01-01' or d > date '2027-12-31' or extract(isodow from d) not in (1,5) then return false; end if;
  if (v #>> '{}') not in ('modern','seasonal','annual','prerelease','tbd','none') then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;
