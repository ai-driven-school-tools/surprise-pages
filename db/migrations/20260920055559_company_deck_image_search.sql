-- Company-only Serper budget. Search terms and result URLs are never durable.
create table public.deck_image_search_usage (
 usage_day date not null,
 owner_email text not null check(owner_email=lower(owner_email)),
 requests integer not null default 0 check(requests>=0),
 primary key(usage_day,owner_email)
);
create index deck_image_search_usage_day on public.deck_image_search_usage(usage_day);
alter table public.deck_image_search_usage enable row level security;
revoke all on public.deck_image_search_usage from public, anon, authenticated;
grant all on public.deck_image_search_usage to service_role;

-- One transaction decides both limits, so simultaneous tabs cannot overspend.
create function public.consume_deck_image_search(
 p_day date,
 p_owner text,
 p_user_limit integer,
 p_company_limit integer
)
returns table(allowed boolean,user_count integer,company_count integer)
language plpgsql security invoker set search_path=public as $$
declare mine integer; company integer;
begin
 if p_owner<>lower(p_owner) or p_user_limit<1 or p_company_limit<p_user_limit then
  raise exception 'image_search_limit_invalid';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_day::text,17));
 select coalesce(sum(requests),0)::integer into company from deck_image_search_usage where usage_day=p_day;
 select coalesce(requests,0) into mine from deck_image_search_usage where usage_day=p_day and owner_email=p_owner;
 if not found then mine:=0; end if;
 if mine>=p_user_limit or company>=p_company_limit then
  return query select false,mine,company;return;
 end if;
 insert into deck_image_search_usage(usage_day,owner_email,requests) values(p_day,p_owner,1)
 on conflict(usage_day,owner_email) do update set requests=deck_image_search_usage.requests+1
 returning requests into mine;
 return query select true,mine,company+1;
end $$;
revoke all on function public.consume_deck_image_search(date,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_deck_image_search(date,text,integer,integer) to service_role;
