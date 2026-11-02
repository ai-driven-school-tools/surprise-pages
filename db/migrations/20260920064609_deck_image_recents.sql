create table public.deck_image_uses (
 owner_email text not null check(owner_email=lower(owner_email)),
 asset_id uuid not null references public.deck_image_assets(id),
 last_used_at timestamptz not null default now(),
 primary key(owner_email,asset_id)
);
create index deck_image_uses_recent on public.deck_image_uses(owner_email,last_used_at desc);
create index deck_image_uses_asset on public.deck_image_uses(asset_id);
alter table public.deck_image_uses enable row level security;
revoke all on public.deck_image_uses from public, anon, authenticated;
grant all on public.deck_image_uses to service_role;
insert into public.deck_image_uses(owner_email,asset_id,last_used_at)
 select owner_email,id,last_used_at from public.deck_image_assets on conflict do nothing;

create function public.record_deck_image(p_row jsonb)
returns setof public.deck_image_assets language plpgsql security invoker set search_path=public as $$
declare saved public.deck_image_assets;
begin
 insert into deck_image_assets(id,page_id,page_slug,owner_email,src,fingerprint,content_type,bytes,width,height,origin,source_page_url,source_name,title,parent_id)
 values((p_row->>'id')::uuid,(p_row->>'page_id')::uuid,p_row->>'page_slug',p_row->>'owner_email',p_row->>'src',p_row->>'fingerprint',p_row->>'content_type',(p_row->>'bytes')::bigint,(p_row->>'width')::integer,(p_row->>'height')::integer,p_row->>'origin',p_row->>'source_page_url',p_row->>'source_name',p_row->>'title',(p_row->>'parent_id')::uuid)
 on conflict(page_id,src) do update set last_used_at=now(),
 source_page_url=coalesce(deck_image_assets.source_page_url,excluded.source_page_url),
 source_name=coalesce(deck_image_assets.source_name,excluded.source_name),
 title=coalesce(deck_image_assets.title,excluded.title)
 returning * into saved;
 insert into deck_image_uses(owner_email,asset_id) values(p_row->>'owner_email',saved.id)
 on conflict(owner_email,asset_id) do update set last_used_at=now();
 return next saved;
end $$;
revoke all on function public.record_deck_image(jsonb) from public, anon, authenticated;
grant execute on function public.record_deck_image(jsonb) to service_role;
