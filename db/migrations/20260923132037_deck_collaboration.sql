-- Durable collaboration state is committed alongside the unchanged HTML source.
alter table public.page_revisions add column deck_collaboration jsonb;
alter table public.page_revisions add constraint deck_collaboration_shape check (
  deck_collaboration is null or
  (jsonb_typeof(deck_collaboration) = 'object' and deck_collaboration->>'protocol' = '2'
   and jsonb_typeof(deck_collaboration->'fields') = 'object' and deck_collaboration->>'epoch' is not null)
);

-- Full HTML remains canonical for every accepted operation. Prefer the faster
-- built-in codec where available so compression does not serialize typing.
-- This changes future writes only; existing revisions are never rewritten.
-- Portable PostgreSQL builds without LZ4 retain their current codec.
do $$ begin
  if exists(select 1 from pg_catalog.pg_settings where name='default_toast_compression' and 'lz4'=any(enumvals)) then
    alter table public.page_revisions alter column html set compression lz4;
    alter table public.page_revisions alter column deck_collaboration set compression lz4;
    alter table public.page_revisions alter column edit_receipt set compression lz4;
  end if;
end $$;

create table public.deck_collaboration_rooms (
  page_id uuid primary key references public.pages(id),
  audience uuid not null default gen_random_uuid()
);
create table public.deck_collaboration_events (
  page_id uuid not null references public.pages(id),
  version_number integer not null,
  version_id text not null,
  created_at timestamptz not null default now(),
  primary key(page_id, version_number)
);
alter table public.deck_collaboration_rooms enable row level security;
alter table public.deck_collaboration_events enable row level security;
revoke all on public.deck_collaboration_rooms, public.deck_collaboration_events from public, anon, authenticated;
grant select, insert, update, delete on public.deck_collaboration_rooms, public.deck_collaboration_events to service_role;

create function public.require_deck_collaboration() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_schema<>'public' or tg_table_name<>'page_revisions' then raise exception 'invalid_trigger_context'; end if;
  if new.deck_collaboration is null and exists(select 1 from public.deck_collaboration_rooms where page_id=new.page_id) then
    raise exception 'deck_collaboration_protocol_required' using errcode='22000';
  end if;
  return new;
end $$;
create trigger page_revisions_require_collaboration before insert on public.page_revisions
for each row execute function public.require_deck_collaboration();

-- Existing keep_page_head_forward protects every writer's page pointer.
-- The private-table triggers use definer scope so older restricted application
-- logins keep working without new grants when collaboration is disabled.

-- Validation/HTML preparation happens outside this short transaction. All writers
-- compare the head again while holding the page row lock; no network IO is held.
create function public.commit_deck_revision(p_revision jsonb, p_expected text, p_title text, p_html text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare target uuid := (p_revision->>'page_id')::uuid; head record; current_slug text;
begin
  select page_slug into current_slug from public.pages where id=target for update;
  if not found then raise exception 'page_missing'; end if;
  if p_revision->>'page_slug' is not null and p_revision->>'page_slug' is distinct from current_slug then
    raise exception 'page_moved' using errcode='PT409';
  end if;
  select version_id,version_number into head from public.page_revisions where page_id=target order by version_number desc limit 1;
  if head.version_id is distinct from p_expected
    or (p_revision->>'version_number')::integer <> coalesce(head.version_number,0)+1
    or p_revision->>'parent_version_id' is distinct from p_expected then
    -- A stale application head needs a fresh read. 40001 would make the REST
    -- transaction runner retry these same stale arguments indefinitely.
    raise exception 'revision_race' using errcode='PT409';
  end if;
  if p_revision->'deck_collaboration' is null or p_revision->'deck_collaboration'='null'::jsonb then
    raise exception 'collaboration_missing';
  end if;
  insert into public.deck_collaboration_rooms(page_id) values(target) on conflict do nothing;
  insert into public.page_revisions(page_id,version_number,version_id,parent_version_id,html,
    author_email,author_name,message,change_count,created_at,edit_operation_id,edit_receipt,deck_collaboration)
  values(target,(p_revision->>'version_number')::integer,p_revision->>'version_id',p_expected,coalesce(p_html,p_revision->>'html'),
    p_revision->>'author_email',p_revision->>'author_name',p_revision->>'message',(p_revision->>'change_count')::integer,
    (p_revision->>'created_at')::timestamptz,(p_revision->>'edit_operation_id')::uuid,nullif(p_revision->'edit_receipt','null'::jsonb),p_revision->'deck_collaboration');
  update public.pages set current_version_id=p_revision->>'version_id',title=p_title,
    updated_at=(p_revision->>'created_at')::timestamptz,deleted_at=null,created_by=coalesce(created_by,p_revision->>'author_email') where id=target;
  insert into public.deck_collaboration_events(page_id,version_number,version_id)
    values(target,(p_revision->>'version_number')::integer,p_revision->>'version_id');
  -- Classification is derived, unlike the body/receipt/outbox above. A broken
  -- index must not turn a durable document save into a reported failure. Older
  -- callers can omit these fields and continue to index separately.
  if p_revision->>'classifier_version' is not null and p_revision->>'document_kind' is not null then
    begin
      insert into public.page_catalog(page_id,version_id,classifier_version,kind)
        values(target,p_revision->>'version_id',(p_revision->>'classifier_version')::integer,p_revision->>'document_kind')
        on conflict(page_id,version_id,classifier_version) do update set kind=excluded.kind;
    exception when others then
      raise warning 'document_classification_needs_repair';
    end;
  end if;
end $$;
revoke all on function public.commit_deck_revision(jsonb,text,text,text), public.require_deck_collaboration() from public, anon, authenticated;
grant execute on function public.commit_deck_revision(jsonb,text,text,text), public.require_deck_collaboration() to service_role;

create function public.rotate_deck_audience() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_schema<>'public' or tg_table_name not in ('pages','page_permissions','groups','group_members','admins') then raise exception 'invalid_trigger_context'; end if;
  if tg_table_name='pages' then
    update public.deck_collaboration_rooms set audience=gen_random_uuid() where page_id=new.id;
  elsif tg_table_name='page_permissions' then
    update public.deck_collaboration_rooms set audience=gen_random_uuid() where page_id in (old.page_id,new.page_id);
  else
    update public.deck_collaboration_rooms set audience=gen_random_uuid()
      where page_id in (select id from public.pages where deleted_at is null);
  end if;
  return null;
end $$;
create trigger pages_collaboration_audience after update of visibility,deleted_at,created_by on public.pages
for each row when(old.visibility is distinct from new.visibility or old.deleted_at is distinct from new.deleted_at or old.created_by is distinct from new.created_by)
execute function public.rotate_deck_audience();
create trigger permissions_collaboration_audience after insert or update or delete on public.page_permissions
for each row execute function public.rotate_deck_audience();
create trigger groups_collaboration_audience after update or delete on public.groups
for each statement execute function public.rotate_deck_audience();
create trigger members_collaboration_audience after insert or update or delete on public.group_members
for each statement execute function public.rotate_deck_audience();
create trigger admins_collaboration_audience after insert or update or delete on public.admins
for each statement execute function public.rotate_deck_audience();
revoke all on function public.rotate_deck_audience() from public, anon, authenticated;
grant execute on function public.rotate_deck_audience() to service_role;

-- Optional Supabase adapter. Plain PostgreSQL/Neon installations keep working.
create function public.broadcast_deck_event() returns trigger
-- The narrowly scoped trigger may publish revision numbers without granting the
-- application login access to Supabase's private realtime schema.
language plpgsql security definer set search_path='' as $$
declare topic text;
begin
  if tg_table_schema<>'public' or tg_table_name not in ('deck_collaboration_rooms','deck_collaboration_events') then raise exception 'invalid_trigger_context'; end if;
  if tg_table_name='deck_collaboration_rooms' then
    topic := 'deck:'||old.page_id::text||':'||old.audience::text||':peers';
    execute 'select realtime.send($1,$2,$3,true)' using '{}'::jsonb,'refresh',topic;
  else
    select 'deck:'||page_id::text||':'||audience::text||':saved' into topic
      from public.deck_collaboration_rooms where page_id=new.page_id;
    execute 'select realtime.send($1,$2,$3,true)' using jsonb_build_object('versionNumber',new.version_number),'revision',topic;
  end if;
  return null;
end $$;
revoke all on function public.broadcast_deck_event() from public, anon, authenticated;
grant execute on function public.broadcast_deck_event() to service_role;
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute $policy$create policy deck_receive on realtime.messages for select to authenticated
      using ((extension='broadcast' and realtime.topic()=(auth.jwt()->>'deck_room')||':saved')
        or (extension in ('broadcast','presence') and realtime.topic()=(auth.jwt()->>'deck_room')||':peers'))$policy$;
    execute $policy$create policy deck_send on realtime.messages for insert to authenticated
      with check (extension in ('broadcast','presence') and realtime.topic()=(auth.jwt()->>'deck_room')||':peers')$policy$;
    create trigger deck_events_broadcast after insert on public.deck_collaboration_events for each row execute function public.broadcast_deck_event();
    create trigger deck_audience_broadcast after update of audience on public.deck_collaboration_rooms for each row execute function public.broadcast_deck_event();
  end if;
end $$;
