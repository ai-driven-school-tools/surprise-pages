-- Drafts contain operations only. The canonical document remains revision HTML.
create table public.page_edit_drafts (
 id uuid primary key,
 page_id uuid not null references public.pages(id),
 owner_email text not null,
 base_version_id text not null,
 operations jsonb not null check (jsonb_typeof(operations) = 'array'),
 summary text not null,
 client text not null,
 fingerprint text not null,
 verification jsonb,
 unresolved jsonb not null default '[]'::jsonb,
 restore_version_id text,
 restore_assets jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create index page_edit_drafts_expiry on public.page_edit_drafts(expires_at);
create index page_edit_drafts_page on public.page_edit_drafts(page_id, created_at desc);
alter table public.page_edit_drafts enable row level security;
revoke all on public.page_edit_drafts from public, anon, authenticated;
grant select,insert,update,delete on public.page_edit_drafts to service_role;
