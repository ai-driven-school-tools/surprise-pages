-- Private account themes. Only the application server can access these records.
create table public.deck_my_themes (
 owner_email text not null check(owner_email=lower(owner_email)),
 id uuid not null, name text not null, head_version uuid not null,
 deleted_at timestamptz, updated_at timestamptz not null default now(),
 primary key(owner_email,id)
);
create table public.deck_theme_versions (
 owner_email text not null, version uuid not null, theme_id uuid not null,
 name text not null, snapshot jsonb not null, logo_key text,
 fingerprint text not null, deleted boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(owner_email,version),
 foreign key(owner_email,theme_id) references public.deck_my_themes(owner_email,id)
);
create table public.deck_theme_requests (
 owner_email text not null, request_id uuid not null, fingerprint text not null,
 theme_id uuid not null, version uuid not null,
 expires_at timestamptz not null default now()+interval '3 days',
 primary key(owner_email,request_id),
 foreign key(owner_email,version) references public.deck_theme_versions(owner_email,version)
);
alter table public.deck_my_themes enable row level security;
alter table public.deck_theme_versions enable row level security;
alter table public.deck_theme_requests enable row level security;
revoke all on public.deck_my_themes,public.deck_theme_versions,public.deck_theme_requests from public, anon, authenticated;
grant all on public.deck_my_themes,public.deck_theme_versions,public.deck_theme_requests to service_role;
create index deck_my_themes_by_owner on public.deck_my_themes(owner_email,updated_at desc) where deleted_at is null;

create function public.save_deck_my_theme(p_owner text,p_id uuid,p_version uuid,p_expected uuid,p_name text,p_snapshot jsonb,p_logo_key text,p_fingerprint text,p_deleted boolean)
returns setof public.deck_theme_versions language plpgsql security invoker set search_path=public as $$
declare prior public.deck_theme_versions; current_theme public.deck_my_themes;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner||p_id::text,0));
 select * into prior from deck_theme_versions where owner_email=p_owner and version=p_version;
 if found then
  if prior.fingerprint<>p_fingerprint then raise exception 'theme_request_conflict'; end if;
  return next prior;return;
 end if;
 select * into current_theme from deck_my_themes where owner_email=p_owner and id=p_id for update;
 if p_expected is null then
  if found then raise exception 'theme_conflict'; end if;
  insert into deck_my_themes(owner_email,id,name,head_version) values(p_owner,p_id,p_name,p_version);
 else
  if not found or current_theme.deleted_at is not null or current_theme.head_version<>p_expected then raise exception 'theme_conflict'; end if;
  update deck_my_themes set name=p_name,head_version=p_version,deleted_at=case when p_deleted then now() else null end,updated_at=now() where owner_email=p_owner and id=p_id;
 end if;
 insert into deck_theme_versions(owner_email,version,theme_id,name,snapshot,logo_key,fingerprint,deleted)
 values(p_owner,p_version,p_id,p_name,p_snapshot,p_logo_key,p_fingerprint,p_deleted) returning * into prior;
 return next prior;
end $$;

create function public.pin_deck_my_theme(p_owner text,p_request uuid,p_fingerprint text,p_id uuid,p_version uuid)
returns setof public.deck_theme_versions language plpgsql security invoker set search_path=public as $$
declare receipt public.deck_theme_requests; current_theme public.deck_my_themes;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner||p_request::text,1));
 select * into receipt from deck_theme_requests where owner_email=p_owner and request_id=p_request;
 if found then
  if receipt.fingerprint<>p_fingerprint then raise exception 'theme_request_conflict'; end if;
  if receipt.expires_at<=now() then raise exception 'theme_expired'; end if;
  return query select * from deck_theme_versions where owner_email=p_owner and version=receipt.version;return;
 end if;
 select * into current_theme from deck_my_themes where owner_email=p_owner and id=p_id for update;
 if not found or current_theme.deleted_at is not null or current_theme.head_version<>p_version then raise exception 'theme_unavailable'; end if;
 insert into deck_theme_requests(owner_email,request_id,fingerprint,theme_id,version) values(p_owner,p_request,p_fingerprint,p_id,p_version);
 return query select * from deck_theme_versions where owner_email=p_owner and version=p_version;
end $$;
revoke all on function public.save_deck_my_theme(text,uuid,uuid,uuid,text,jsonb,text,text,boolean) from public, anon, authenticated;
revoke all on function public.pin_deck_my_theme(text,uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.save_deck_my_theme(text,uuid,uuid,uuid,text,jsonb,text,text,boolean) to service_role;
grant execute on function public.pin_deck_my_theme(text,uuid,text,uuid,uuid) to service_role;
