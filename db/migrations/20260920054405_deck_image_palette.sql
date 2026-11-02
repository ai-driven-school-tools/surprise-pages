-- Searchable image index. Slide HTML and immutable page revisions remain authoritative.
create table public.deck_image_assets (
 id uuid primary key,
 page_id uuid not null references public.pages(id),
 page_slug text not null,
 owner_email text not null check(owner_email=lower(owner_email)),
 src text not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 content_type text not null check(content_type like 'image/%'),
 bytes bigint not null check(bytes>0 and bytes<=10485760),
 width integer not null check(width>0),
 height integer not null check(height>0),
 origin text not null check(origin in ('upload','url','search','reuse','existing')),
 source_page_url text,
 source_name text,
 title text,
 parent_id uuid references public.deck_image_assets(id),
 created_at timestamptz not null default now(),
 last_used_at timestamptz not null default now(),
 unique(page_id,src)
);
create index deck_image_assets_page on public.deck_image_assets(page_id,last_used_at desc);
create index deck_image_assets_owner on public.deck_image_assets(owner_email,last_used_at desc);
create index deck_image_assets_parent on public.deck_image_assets(parent_id) where parent_id is not null;

alter table public.deck_image_assets enable row level security;
revoke all on public.deck_image_assets from public, anon, authenticated;
grant all on public.deck_image_assets to service_role;
