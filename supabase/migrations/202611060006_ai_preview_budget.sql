-- Phase 8C preview-only AI request accounting. No publication or saved AI result.
-- Administrative $5 monthly application-side budget: reserve 25 cents/request
-- before sending an image, maximum 20 requests per administrator per UTC month.
-- This is a conservative authorization allowance, NOT a provider billing cap.
-- Calls which fail or time out are not refunded automatically.
create table private.screenshot_ai_budgets (
  actor uuid not null references auth.users(id),
  month_utc date not null,
  reserved_cents integer not null check (reserved_cents between 0 and 500),
  attempts integer not null check (attempts between 0 and 20),
  primary key(actor,month_utc)
);
alter table private.screenshot_ai_budgets enable row level security;
revoke all on private.screenshot_ai_budgets from public,anon,authenticated,service_role;

create function public.reserve_screenshot_ai_budget(p_actor uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare reserved integer; begin
 perform 1 from private.administrators where user_id=p_actor for update;
 if not found then raise exception 'Forbidden'; end if;
 insert into private.screenshot_ai_budgets(actor,month_utc,reserved_cents,attempts)
 values(p_actor,date_trunc('month',pg_catalog.now() at time zone 'UTC')::date,25,1)
 on conflict (actor,month_utc) do update
  set reserved_cents=private.screenshot_ai_budgets.reserved_cents +
       case when private.screenshot_ai_budgets.reserved_cents<=475 then 25 else 0 end,
      attempts=private.screenshot_ai_budgets.attempts +
       case when private.screenshot_ai_budgets.reserved_cents<=475 then 1 else 0 end
 returning reserved_cents into reserved;
 if reserved>=500 then return 0; end if;
 return 500-reserved;
end $$;
revoke all on function public.reserve_screenshot_ai_budget(uuid) from public,anon,authenticated;
grant execute on function public.reserve_screenshot_ai_budget(uuid) to service_role;
