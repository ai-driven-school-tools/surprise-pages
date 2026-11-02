-- Derived document classification and private account preferences. Server access only.
create table public.page_catalog (
 page_id uuid not null references public.pages(id),
 version_id text not null,
 classifier_version integer not null,
 kind text not null check (kind in ('deck','document','page')),
 primary key(page_id,version_id,classifier_version)
);
create table public.page_favorites (
 owner_email text not null check(owner_email=lower(owner_email)),
 page_id uuid not null references public.pages(id),
 primary key(owner_email,page_id)
);
create table public.workspace_preferences (
 owner_email text primary key check(owner_email=lower(owner_email)),
 appearance text not null default 'system' check(appearance in ('system','light','dark'))
);
alter table public.page_catalog enable row level security;
alter table public.page_favorites enable row level security;
alter table public.workspace_preferences enable row level security;
revoke all on public.page_catalog, public.page_favorites, public.workspace_preferences from public, anon, authenticated;
grant all on public.page_catalog, public.page_favorites, public.workspace_preferences to service_role;
