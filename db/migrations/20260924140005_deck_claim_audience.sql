-- Capture the permission generation in the claim response, before the worker
-- reauthorizes each actor. Commit still compares it under the existing lock.
create or replace function public.poll_deck_request(p_page uuid,p_operation uuid,p_owner text,p_fingerprint text,p_worker uuid)
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
    select version_id,version_number,html,deck_collaboration into head from public.page_revisions where page_id=p_page order by version_number desc limit 1;
    return jsonb_build_object('state','saved','receipt',accepted.receipt,'snapshot',jsonb_build_object('versionId',head.version_id,'versionNumber',head.version_number,'html',head.html,'collaboration',head.deck_collaboration));
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
  update public.deck_edit_processors set token=p_worker,expires_at=clock_timestamp()+interval '15 seconds',operation_ids=ids where page_id=p_page;
  return jsonb_build_object('state','claimed','requests',claimed,'audience',
    (select audience from public.deck_collaboration_rooms where page_id=p_page));
end $$;
