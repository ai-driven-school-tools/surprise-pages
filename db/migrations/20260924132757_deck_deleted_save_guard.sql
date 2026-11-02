-- Preserve deletion across queued and legacy edit writers. Explicit whole-document
-- restoration remains the responsibility of the existing publication path.
create or replace function public.guard_deck_submission() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; operation uuid; prior record; owner text; fingerprint text; deleted timestamptz;
begin
  if tg_table_schema<>'public' or tg_table_name not in ('page_revisions','deck_edit_receipts') or tg_op<>'INSERT' then raise exception 'invalid_trigger_context'; end if;
  target:=new.page_id;
  if tg_table_name='page_revisions' then operation:=new.edit_operation_id;owner:=new.author_email;fingerprint:=new.edit_receipt->>'fingerprint';
  else operation:=new.operation_id;owner:=new.owner_email;fingerprint:=new.receipt->>'fingerprint'; end if;
  if operation is null then return new; end if;
  select deleted_at into deleted from public.pages where id=target for update;
  if not found or deleted is not null then raise exception 'page_deleted' using errcode='PT410'; end if;
  select * into prior from public.deck_edit_submissions where page_id=target and operation_id=operation;
  if found then
    if prior.state in ('rejected','expired') or prior.state='pending' and prior.expires_at<=clock_timestamp() then raise exception 'edit_operation_not_applicable' using errcode='PT410'; end if;
    if prior.owner_email is distinct from owner or prior.fingerprint is distinct from fingerprint then raise exception 'operation_identity_mismatch' using errcode='PT422'; end if;
  end if;
  return new;
end $$;

create or replace function public.submit_deck_request(p_page uuid,p_operation uuid,p_owner text,p_name text,p_fingerprint text,p_request text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior record; accepted record; count_page integer; count_owner integer; bytes_page bigint; bytes_owner bigint; size integer:=octet_length(p_request); payload jsonb:=p_request::jsonb; deleted timestamptz; collaboration jsonb;
begin
  select deleted_at into deleted from public.pages where id=p_page for update;
  if not found then raise exception 'page_missing' using errcode='PT409'; end if;
  select receipt->>'fingerprint' as fingerprint,owner_email into accepted from public.deck_edit_receipts where page_id=p_page and operation_id=p_operation;
  if not found then select edit_receipt->>'fingerprint' as fingerprint,author_email as owner_email into accepted from public.page_revisions where page_id=p_page and edit_operation_id=p_operation; end if;
  if found then
    if accepted.fingerprint is distinct from p_fingerprint or accepted.owner_email is distinct from p_owner then raise exception 'operation_identity_mismatch' using errcode='PT422'; end if;
    return jsonb_build_object('replayed',true);
  end if;
  if deleted is not null then raise exception 'page_deleted' using errcode='PT410'; end if;
  select deck_collaboration into collaboration from public.page_revisions where page_id=p_page order by version_number desc limit 1;
  if collaboration is null or not exists(select 1 from public.deck_collaboration_rooms where page_id=p_page) then
    raise exception 'deck_collaboration_inactive' using errcode='PT426';
  end if;
  select fingerprint,owner_email into prior from public.deck_edit_submissions where page_id=p_page and operation_id=p_operation;
  if found then
    if prior.fingerprint is distinct from p_fingerprint or prior.owner_email is distinct from p_owner then raise exception 'operation_identity_mismatch' using errcode='PT422'; end if;
    return jsonb_build_object('replayed',true); -- Retries never replace their actor, payload, basis or expiry.
  end if;
  if size>2097152 or jsonb_typeof(payload) is distinct from 'object'
    or payload->>'id' is distinct from p_operation::text or payload->>'author' is distinct from p_owner
    or payload->>'protocol' is distinct from '2' or payload->>'client' is distinct from 'browser'
    then raise exception 'invalid_deck_submission' using errcode='23514'; end if;
  update public.deck_edit_submissions set state='expired',request=null,payload_bytes=0,
    outcome='{"category":"generation","message":"保存の受付から3日が経過しました。直しかけを復旧欄で確認してください"}'::jsonb
    where page_id=p_page and state='pending' and expires_at<=clock_timestamp();
  select count(*),count(*) filter(where owner_email=p_owner),coalesce(sum(payload_bytes),0),coalesce(sum(payload_bytes) filter(where owner_email=p_owner),0)
    into count_page,count_owner,bytes_page,bytes_owner from public.deck_edit_submissions where page_id=p_page and state='pending';
  if count_page>=128 or count_owner>=32 or bytes_page+size>33554432 or bytes_owner+size>8388608 then raise exception 'deck_submission_busy' using errcode='PT429'; end if;
  insert into public.deck_edit_submissions(page_id,operation_id,owner_email,owner_name,fingerprint,request,payload_bytes)
    values(p_page,p_operation,p_owner,p_name,p_fingerprint,p_request,size);
  insert into public.deck_edit_processors(page_id) values(p_page) on conflict do nothing;
  return jsonb_build_object('replayed',false);
end $$;

create or replace function public.finish_deck_requests(p_page uuid,p_token uuid,p_expected text,p_audience uuid,p_revision jsonb,p_title text,p_html text,p_receipts jsonb,p_rejected jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare head text; audience uuid; lease record; item jsonb; entry record; deleted timestamptz;
begin
  select deleted_at into deleted from public.pages where id=p_page for update;
  if not found then raise exception 'page_missing' using errcode='PT409'; end if;
  select * into lease from public.deck_edit_processors where page_id=p_page for update;
  if lease.token is distinct from p_token or p_token is null or lease.expires_at<=clock_timestamp() then raise exception 'deck_processor_expired' using errcode='PT412'; end if;
  select version_id into head from public.page_revisions where page_id=p_page order by version_number desc limit 1;
  select r.audience into audience from public.deck_collaboration_rooms r where page_id=p_page for update;
  if head is distinct from p_expected or audience is distinct from p_audience or p_audience is null then raise exception 'deck_basis_changed' using errcode='PT409'; end if;
  if jsonb_typeof(p_receipts) is distinct from 'array' or jsonb_typeof(p_rejected) is distinct from 'array'
    or jsonb_array_length(p_receipts)+jsonb_array_length(p_rejected)>20 then raise exception 'invalid_deck_outcomes'; end if;
  -- Deletion rotates the audience. A newly authorized refusal may finish, but
  -- no edit may create a revision or revive the document. Restoration rotates
  -- the audience again, invalidating refusals prepared while it was deleted.
  if deleted is not null and (jsonb_array_length(p_receipts)>0 or p_revision is not null) then
    raise exception 'page_deleted' using errcode='PT409';
  end if;
  if (select count(distinct id) from (
    select value->'receipt'->>'id' as id from jsonb_array_elements(p_receipts)
    union all select value->>'id' from jsonb_array_elements(p_rejected)
  ) outcomes)<>jsonb_array_length(p_receipts)+jsonb_array_length(p_rejected) then raise exception 'duplicate_deck_outcomes' using errcode='23514'; end if;
  for item in select value from jsonb_array_elements(p_receipts) loop
    select * into entry from public.deck_edit_submissions where page_id=p_page and operation_id=(item->'receipt'->>'id')::uuid;
    if not found or not(entry.operation_id=any(lease.operation_ids)) or entry.state<>'pending'
      or entry.fingerprint is distinct from item->'receipt'->>'fingerprint' or entry.owner_email is distinct from item->'author'->>'email'
      then raise exception 'deck_outcome_race' using errcode='PT409'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_rejected) loop
    if coalesce(item->'outcome'->>'category','') not in ('operation','generation') or jsonb_typeof(item->'outcome'->'message') is distinct from 'string'
      or length(item->'outcome'->>'message')>2000 then raise exception 'invalid_deck_refusal' using errcode='23514'; end if;
    select * into entry from public.deck_edit_submissions where page_id=p_page and operation_id=(item->>'id')::uuid;
    if not found or not(entry.operation_id=any(lease.operation_ids)) or entry.state<>'pending' or entry.fingerprint is distinct from item->>'fingerprint'
      or exists(select 1 from public.deck_edit_receipts where page_id=p_page and operation_id=entry.operation_id)
      or exists(select 1 from public.page_revisions where page_id=p_page and edit_operation_id=entry.operation_id)
      then raise exception 'deck_outcome_race' using errcode='PT409'; end if;
  end loop;
  if jsonb_array_length(p_receipts)>0 then
    if p_revision is null or p_revision->>'page_id' is distinct from p_page::text then raise exception 'invalid_deck_revision'; end if;
    perform public.commit_deck_revision_group(p_revision,p_expected,p_title,p_html,p_audience,p_receipts);
  elsif p_revision is not null then raise exception 'unexpected_deck_revision'; end if;
  for item in select value from jsonb_array_elements(p_rejected) loop
    update public.deck_edit_submissions set state='rejected',request=null,payload_bytes=0,outcome=item->'outcome'
      where page_id=p_page and operation_id=(item->>'id')::uuid and state='pending';
    if not found then raise exception 'deck_outcome_race' using errcode='PT409'; end if;
  end loop;
  if lease.expires_at<=clock_timestamp() then raise exception 'deck_processor_expired' using errcode='PT412'; end if;
  update public.deck_edit_processors set token=null,expires_at=null,operation_ids='{}' where page_id=p_page and token=p_token;
end $$;
