-- 専用サービスから届く状態を、所有者と単調増加する版で照合する。
alter table public.recordings add column service_revision bigint not null default 0;
alter table public.recordings add column audio_generation text;
alter table public.recordings add column mime_type text;
alter table public.recordings add column result_url text;
alter table public.recordings add column raw_generation text;
alter table public.recordings add column raw_sha256 text;

-- db-contract: reviewed 新規の録音台帳にだけ状態を反映する。削除と取消を古い通知で戻さない。
create function public.sync_recording_service(p_owner text,p_record jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare current_record public.recordings; recording_id uuid; incoming_revision bigint; incoming_state text;
begin
  recording_id := (p_record->>'id')::uuid;
  incoming_revision := (p_record->>'revision')::bigint;
  incoming_state := p_record->>'state';
  insert into public.recordings(id,owner_email,title,source_kind,byte_size,sha256)
    values(recording_id,p_owner,p_record->>'title',p_record->>'source',(p_record->>'bytes')::bigint,p_record->>'sha256')
    on conflict(id) do nothing;
  select * into current_record from public.recordings where id=recording_id and owner_email=p_owner for update;
  if not found then raise exception 'recording_not_found' using errcode='P0002'; end if;
  if current_record.sha256 <> p_record->>'sha256' or current_record.byte_size <> (p_record->>'bytes')::bigint then
    raise exception 'recording_content_conflict' using errcode='23514';
  end if;
  if current_record.deleted_at is not null or current_record.state='cancelled' or current_record.service_revision >= incoming_revision then
    return jsonb_build_object('id',recording_id,'state',current_record.state,'revision',current_record.service_revision,'deleted',current_record.deleted_at is not null,'acceptedAt',current_record.accepted_at);
  end if;
  if current_record.audio_key is not null and p_record->'audio' <> 'null'::jsonb and
    (current_record.audio_key <> p_record->'audio'->>'key' or current_record.audio_generation <> p_record->'audio'->>'generation') then
    raise exception 'recording_audio_conflict' using errcode='23514';
  end if;
  update public.recordings set
    service_revision=incoming_revision,
    state=incoming_state,
    duration_seconds=coalesce((p_record->>'seconds')::double precision,duration_seconds),
    accepted_at=coalesce(accepted_at,(p_record->>'acceptedAt')::timestamptz),
    audio_key=coalesce(audio_key,p_record->'audio'->>'key'),
    audio_generation=coalesce(audio_generation,p_record->'audio'->>'generation'),
    storage_verified_at=coalesce(storage_verified_at,(p_record->'audio'->>'verifiedAt')::timestamptz),
    raw_key=coalesce(raw_key,p_record->'raw'->>'key'),
    raw_generation=coalesce(raw_generation,p_record->'raw'->>'generation'),
    raw_sha256=coalesce(raw_sha256,p_record->'raw'->>'sha256'),
    mime_type=coalesce(p_record->>'mimeType',mime_type),
    result_url=coalesce(p_record->>'resultUrl',result_url)
  where id=recording_id;
  return jsonb_build_object('id',recording_id,'state',incoming_state,'revision',incoming_revision,'deleted',false,'acceptedAt',coalesce(current_record.accepted_at,(p_record->>'acceptedAt')::timestamptz));
end;
$$;
revoke all on function public.sync_recording_service(text,jsonb) from public, anon, authenticated;
grant execute on function public.sync_recording_service(text,jsonb) to service_role;
