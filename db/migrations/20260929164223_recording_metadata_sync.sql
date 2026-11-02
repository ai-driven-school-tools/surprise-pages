-- 録音時刻と認識原文の文字数を、元音声の受付台帳へ追加する。
alter table public.recordings add column transcript_characters integer check (transcript_characters between 0 and 10000000);

-- db-contract: reviewed 既存の録音同期を保ち、確かな録音時刻と原文文字数だけを追加する。古い版・削除済み・取消済みは従来どおり更新しない。
create or replace function public.sync_recording_service(p_owner text,p_record jsonb)
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
    recorded_at=coalesce(recorded_at,(p_record->>'recordedAt')::timestamptz),
    recorded_at_confidence=case when recorded_at is null and p_record->>'recordedAt' is not null then 'metadata' else recorded_at_confidence end,
    transcript_characters=coalesce((p_record->>'transcriptCharacters')::integer,transcript_characters),
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
