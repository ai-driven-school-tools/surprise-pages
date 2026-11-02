-- Keep old full-snapshot callers while letting HTTP saves acknowledge without
-- fetching an entire document for every person waiting on the same commit.
create or replace function public.poll_deck_request_core(p_page uuid,p_operation uuid,p_owner text,p_fingerprint text,p_worker uuid,p_snapshot boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare accepted record; submitted record; head record; lease record; claimed jsonb; ids uuid[];
begin
  -- A busy writer should not make every waiter hold a database connection.
  perform 1 from public.pages where id=p_page for update skip locked;
  if not found then return jsonb_build_object('state','waiting'); end if;
  select receipt,owner_email into accepted from public.deck_edit_receipts where page_id=p_page and operation_id=p_operation;
  if not found then select edit_receipt as receipt,author_email as owner_email into accepted from public.page_revisions where page_id=p_page and edit_operation_id=p_operation; end if;
  if found then
    if accepted.receipt->>'fingerprint' is distinct from p_fingerprint or accepted.owner_email is distinct from p_owner then raise exception 'operation_identity_mismatch' using errcode='PT422'; end if;
    if p_snapshot then
    select version_id,version_number,html,deck_collaboration into head from public.page_revisions where page_id=p_page order by version_number desc limit 1;
    return jsonb_build_object('state','saved','receipt',accepted.receipt,'snapshot',jsonb_build_object('versionId',head.version_id,'versionNumber',head.version_number,'html',head.html,'collaboration',head.deck_collaboration));
    end if;
    -- Do not read the HTML or CRDT columns when a caller only needs a durable
    -- acknowledgement. Its authorized delta request names this exact version.
    select version_id,version_number into head from public.page_revisions where page_id=p_page order by version_number desc limit 1;
    return jsonb_build_object('state','acknowledged','receipt',jsonb_build_object('id',accepted.receipt->'id','fingerprint',accepted.receipt->'fingerprint','inverse',accepted.receipt->'inverse'),
      'head',jsonb_build_object('versionId',head.version_id,'versionNumber',head.version_number));
  end if;
  select * into submitted from public.deck_edit_submissions where page_id=p_page and operation_id=p_operation;
  if not found then raise exception 'submission_missing' using errcode='PT404'; end if;
  if submitted.owner_email is distinct from p_owner or submitted.fingerprint is distinct from p_fingerprint then raise exception 'operation_identity_mismatch' using errcode='PT422'; end if;
  if submitted.state in ('rejected','expired') then return jsonb_build_object('state','rejected','outcome',submitted.outcome); end if;
  update public.deck_edit_submissions set state='expired',request=null,payload_bytes=0,
    outcome='{"category":"generation","message":"保存の受付から3日が経過しました。直しかけを復旧欄で確認してください"}'::jsonb
    where page_id=p_page and state='pending' and expires_at<=clock_timestamp();
  if submitted.expires_at<=clock_timestamp() then return jsonb_build_object('state','rejected','outcome',jsonb_build_object('category','generation','message','保存の受付から3日が経過しました。直しかけを復旧欄で確認してください')); end if;
  select * into lease from public.deck_edit_processors where page_id=p_page for update;
  if lease.token is not null and lease.expires_at>clock_timestamp() then return jsonb_build_object('state','waiting'); end if;
  select jsonb_agg(jsonb_build_object('request',request,'author',jsonb_build_object('email',owner_email,'name',owner_name),'fingerprint',fingerprint) order by received_at,operation_id),array_agg(operation_id order by received_at,operation_id)
    into claimed,ids from (select * from public.deck_edit_submissions where page_id=p_page and state='pending' and expires_at>clock_timestamp() order by received_at,operation_id limit 20) candidates;
  if ids is null then return jsonb_build_object('state','waiting'); end if;
  update public.deck_edit_processors set token=p_worker,expires_at=clock_timestamp()+interval '15 seconds',operation_ids=ids,extension_ids=null where page_id=p_page;
  return jsonb_build_object('state','claimed','requests',claimed,'audience',
    (select audience from public.deck_collaboration_rooms where page_id=p_page));
end $$;

create or replace function public.poll_deck_request(p_page uuid,p_operation uuid,p_owner text,p_fingerprint text,p_worker uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select public.poll_deck_request_core(p_page,p_operation,p_owner,p_fingerprint,p_worker,true);
$$;
create or replace function public.poll_deck_request_metadata(p_page uuid,p_operation uuid,p_owner text,p_fingerprint text,p_worker uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select public.poll_deck_request_core(p_page,p_operation,p_owner,p_fingerprint,p_worker,false);
$$;
revoke all on function public.poll_deck_request_core(uuid,uuid,text,text,uuid,boolean),public.poll_deck_request_metadata(uuid,uuid,text,text,uuid) from public, anon, authenticated;

-- CREATE OR REPLACE preserves the old entry point's ACL. Preserve those exact
-- trusted callers on the new invoker core as well, including old installations
-- whose runtime role predates this migration. No owner-privilege workaround.
do $permissions$
declare allowed name;
begin
  if exists(
    select 1 from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
    left join pg_catalog.pg_roles r on r.oid=acl.grantee
    where p.oid='public.poll_deck_request(uuid,uuid,text,text,uuid)'::regprocedure
      and acl.privilege_type='EXECUTE' and (acl.grantee=0 or r.rolname in ('anon','authenticated'))
  ) or exists(
    select 1 from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated')
      and pg_catalog.has_function_privilege(r.oid,'public.poll_deck_request(uuid,uuid,text,text,uuid)'::regprocedure,'EXECUTE')
  ) then raise exception 'deck_poll_must_be_private'; end if;
  for allowed in
    select r.rolname from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
    join pg_catalog.pg_roles r on r.oid=acl.grantee
    where p.oid='public.poll_deck_request(uuid,uuid,text,text,uuid)'::regprocedure
      and acl.privilege_type='EXECUTE' and acl.grantee<>0
  loop
    execute pg_catalog.format('grant execute on function public.poll_deck_request_core(uuid,uuid,text,text,uuid,boolean),public.poll_deck_request_metadata(uuid,uuid,text,text,uuid) to %I',allowed);
  end loop;
end $permissions$;
