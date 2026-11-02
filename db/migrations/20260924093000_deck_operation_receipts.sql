-- One durable receipt per original request, independent of revision grouping.
create table public.deck_edit_receipts (
  page_id uuid not null references public.pages(id),
  operation_id uuid not null,
  version_id text not null,
  operation_index integer not null default 0 check(operation_index>=0),
  owner_email text not null,
  owner_name text,
  receipt jsonb not null,
  created_at timestamptz not null,
  primary key(page_id,operation_id),
  foreign key(page_id,version_id) references public.page_revisions(page_id,version_id),
  unique(page_id,version_id,operation_index),
  check(jsonb_typeof(receipt)='object'
    and jsonb_typeof(receipt->'id') is not distinct from 'string'
    and receipt->>'id'=operation_id::text
    and jsonb_typeof(receipt->'fingerprint') is not distinct from 'string'
    and jsonb_typeof(receipt->'inverse') is not distinct from 'array')
);
alter table public.deck_edit_receipts enable row level security;
revoke all on public.deck_edit_receipts from public, anon, authenticated;
grant select,insert,update,delete on public.deck_edit_receipts to service_role;

-- Old application instances must not reapply an ID accepted by a grouped save,
-- even if they do not yet know how to look up the separate receipt table.
create function public.guard_deck_edit_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_schema<>'public' or tg_table_name<>'page_revisions' or tg_op<>'INSERT' then raise exception 'invalid_trigger_context'; end if;
  if new.edit_operation_id is not null and exists(
    select 1 from public.deck_edit_receipts where page_id=new.page_id and operation_id=new.edit_operation_id
  ) then raise exception 'edit_operation_already_received' using errcode='23505'; end if;
  return new;
end $$;
create trigger page_revisions_guard_deck_receipt before insert on public.page_revisions
for each row execute function public.guard_deck_edit_receipt();

-- Keep single-operation writers compatible without giving older application
-- logins direct access to the new private table. Grouped receipts are inserted
-- by the atomic group commit instead of recording its synthetic group ID.
create function public.record_deck_edit_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_schema<>'public' or tg_table_name<>'page_revisions' or tg_op<>'INSERT' then raise exception 'invalid_trigger_context'; end if;
  if new.deck_collaboration is null or new.edit_operation_id is null or new.edit_receipt->>'batch'='true' then return null; end if;
  insert into public.deck_edit_receipts(page_id,operation_id,version_id,owner_email,owner_name,receipt,created_at)
  values(new.page_id,new.edit_operation_id,new.version_id,new.author_email,new.author_name,new.edit_receipt,new.created_at);
  return null;
end $$;
create trigger page_revisions_record_deck_receipt after insert on public.page_revisions
for each row execute function public.record_deck_edit_receipt();
revoke all on function public.guard_deck_edit_receipt(), public.record_deck_edit_receipt() from public, anon, authenticated;
grant execute on function public.guard_deck_edit_receipt(), public.record_deck_edit_receipt() to service_role;

-- Group markers cannot commit without every original receipt. This check is
-- deferred so the atomic writer can append the revision before its FK children.
create function public.require_deck_edit_receipts() returns trigger
language plpgsql security definer set search_path='' as $$
declare receipt_count integer; first_index integer; last_index integer; forward_ops jsonb; inverse_ops jsonb;
begin
  if tg_table_schema<>'public' or tg_table_name<>'page_revisions' or tg_op<>'INSERT' then raise exception 'invalid_trigger_context'; end if;
  if new.deck_collaboration is null or new.edit_operation_id is null or new.edit_receipt->>'batch' is distinct from 'true' then return null; end if;
  select count(*),min(operation_index),max(operation_index) into receipt_count,first_index,last_index
    from public.deck_edit_receipts where page_id=new.page_id and version_id=new.version_id;
  if receipt_count<1 or receipt_count>20 or receipt_count is distinct from (new.edit_receipt->>'batchSize')::integer
    or first_index<>0 or last_index<>receipt_count-1 then raise exception 'incomplete_deck_receipts' using errcode='23514'; end if;
  if exists(select 1 from public.deck_edit_receipts where page_id=new.page_id and version_id=new.version_id
    and (jsonb_typeof(receipt->'operations') is distinct from 'array' or jsonb_typeof(receipt->'span') is distinct from 'object'))
    then raise exception 'invalid_deck_receipt_operations' using errcode='23514'; end if;
  if exists(
    select 1 from (
      select receipt,coalesce(sum(jsonb_array_length(receipt->'operations')) over(order by operation_index rows between unbounded preceding and 1 preceding),0) as start_at
      from public.deck_edit_receipts where page_id=new.page_id and version_id=new.version_id
    ) spans where (receipt->'span'->>'start')::bigint is distinct from start_at
      or (receipt->'span'->>'end')::bigint is distinct from start_at+jsonb_array_length(receipt->'operations')
  ) then raise exception 'invalid_deck_receipt_span' using errcode='23514'; end if;
  select coalesce(jsonb_agg(op.value order by d.operation_index,op.ordinality),'[]'::jsonb) into forward_ops
    from public.deck_edit_receipts d cross join lateral jsonb_array_elements(d.receipt->'operations') with ordinality op(value,ordinality)
    where d.page_id=new.page_id and d.version_id=new.version_id;
  select coalesce(jsonb_agg(op.value order by d.operation_index desc,op.ordinality),'[]'::jsonb) into inverse_ops
    from public.deck_edit_receipts d cross join lateral jsonb_array_elements(d.receipt->'inverse') with ordinality op(value,ordinality)
    where d.page_id=new.page_id and d.version_id=new.version_id;
  if forward_ops is distinct from new.edit_receipt->'operations' or inverse_ops is distinct from new.edit_receipt->'inverse'
    then raise exception 'inconsistent_deck_receipts' using errcode='23514'; end if;
  return null;
end $$;
create constraint trigger page_revisions_require_deck_receipts after insert on public.page_revisions
deferrable initially deferred for each row execute function public.require_deck_edit_receipts();
revoke all on function public.require_deck_edit_receipts() from public, anon, authenticated;
grant execute on function public.require_deck_edit_receipts() to service_role;

-- Ordinary history is still one row per revision. The agent/editor operation
-- history expands grouped revisions, while retaining all pre-migration rows.
create function public.read_deck_edit_history(p_page uuid,p_operation uuid default null,p_offset bigint default 0,p_limit integer default 51)
returns table(version_id text,parent_version_id text,version_number integer,message text,author_name text,created_at timestamptz,edit_operation_id uuid,edit_receipt jsonb)
language sql stable security invoker set search_path='' as $$
  select r.version_id,r.parent_version_id,r.version_number,
    coalesce(d.receipt->>'summary',r.message),case when d.operation_id is not null then d.owner_name else r.author_name end,
    coalesce(d.created_at,r.created_at),coalesce(d.operation_id,r.edit_operation_id),
    coalesce(d.receipt,r.edit_receipt)
  from public.page_revisions r
  left join public.deck_edit_receipts d on d.page_id=r.page_id and d.version_id=r.version_id
  where r.page_id=p_page and (p_operation is null or coalesce(d.operation_id,r.edit_operation_id)=p_operation)
  order by r.version_number desc,d.operation_index desc
  offset greatest(0,p_offset) limit greatest(1,least(p_limit,51));
$$;
revoke all on function public.read_deck_edit_history(uuid,uuid,bigint,integer) from public, anon, authenticated;
grant execute on function public.read_deck_edit_history(uuid,uuid,bigint,integer) to service_role;

-- The existing writer owns HTML/head/outbox consistency. This wrapper adds the
-- original request receipts and holds the authorization generation until commit.
create function public.commit_deck_revision_group(p_revision jsonb,p_expected text,p_title text,p_html text,p_audience uuid,p_receipts jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare target uuid:=(p_revision->>'page_id')::uuid; current_audience uuid; deleted timestamptz; item jsonb; ordinal bigint;
begin
  if jsonb_typeof(p_receipts) is distinct from 'array' or jsonb_array_length(p_receipts) not between 1 and 20
    or p_revision->'edit_receipt'->>'batch' is distinct from 'true'
    or (p_revision->'edit_receipt'->>'batchSize')::integer is distinct from jsonb_array_length(p_receipts)
    then raise exception 'invalid_deck_group' using errcode='23514'; end if;
  select deleted_at into deleted from public.pages where id=target for update;
  if not found or deleted is not null then raise exception 'page_missing' using errcode='PT409'; end if;
  select audience into current_audience from public.deck_collaboration_rooms where page_id=target for update;
  if not found or p_audience is null or current_audience is distinct from p_audience then
    raise exception 'deck_audience_changed' using errcode='PT409';
  end if;
  if exists(select 1 from jsonb_array_elements(p_receipts) entries(value)
    join public.page_revisions r on r.page_id=target and r.edit_operation_id=(entries.value->'receipt'->>'id')::uuid)
    then raise exception 'edit_operation_already_received' using errcode='23505'; end if;
  perform public.commit_deck_revision(p_revision,p_expected,p_title,p_html);
  for item,ordinal in select value,ordinality from jsonb_array_elements(p_receipts) with ordinality loop
    insert into public.deck_edit_receipts(page_id,operation_id,version_id,operation_index,owner_email,owner_name,receipt,created_at)
    values(target,(item->'receipt'->>'id')::uuid,p_revision->>'version_id',ordinal-1,
      item->'author'->>'email',item->'author'->>'name',item->'receipt',(p_revision->>'created_at')::timestamptz);
  end loop;
end $$;
revoke all on function public.commit_deck_revision_group(jsonb,text,text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.commit_deck_revision_group(jsonb,text,text,text,uuid,jsonb) to service_role;
