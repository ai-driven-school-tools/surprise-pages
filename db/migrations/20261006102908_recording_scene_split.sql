-- recording_scene_split: 1 本の録音を場面で分けるための「子の作成と系譜」（段階 2a・docs/recordings-scene-split.md）。足すだけの段。
-- 系譜の 3 列・人の決めたことの表・状態と命令の値・命令と同期の関数の置き換え・場面の扱いの設定の列を足す。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない

-- 系譜の正本はここだけ（候補の表にも決定の表にも子の目印を持たせない＝正本を 2 つにしない）。子にだけ入る。
alter table public.recordings add column split_from uuid references public.recordings(id) on delete set null;
alter table public.recordings add column split_start_seconds double precision check (split_start_seconds >= 0 and split_start_seconds <= 43200);
alter table public.recordings add column split_end_seconds double precision check (split_end_seconds > 0 and split_end_seconds <= 43200);

-- 状態: splitting＝人が「分ける」と決めたあと、子を切り出している最中。
alter table public.recordings drop constraint recordings_state_check;
alter table public.recordings add constraint recordings_state_check
  check (state in ('uploading','queued','transcribing','awaiting_context','organizing','splitting','complete','failed','cancelled'));

-- 命令: split（分ける）と keep_whole（分けずに 1 本で作る）。
alter table public.recording_commands drop constraint recording_commands_action_check;
alter table public.recording_commands add constraint recording_commands_action_check
  check (action in ('cancel','resume','context','split','keep_whole'));

alter table public.recording_events drop constraint recording_events_kind_check;
alter table public.recording_events add constraint recording_events_kind_check
  check (kind in ('accepted','started','awaiting_connection','failed','resumed','completed','shared','unshared','trashed','restored','resume_requested','cancel_requested','context_requested','split_requested','keep_whole_requested'));

-- 人の決めたこと（元の録音 1 本につき、候補の版 × 場面の数）。分け直すたびに候補の版が進み、古い版の行は残す。
-- 題・一言は原文由来なので、読むのは持ち主に返す口だけ（Pages の lib が絞る）。
create table public.recording_scenes (
  recording_id uuid not null references public.recordings(id),
  proposal_revision integer not null check (proposal_revision > 0 and proposal_revision <= 1000),
  position integer not null check (position between 1 and 8),
  start_seconds double precision not null check (start_seconds >= 0 and start_seconds <= 43200),
  end_seconds double precision not null check (end_seconds > 0 and end_seconds <= 43200),
  title text not null check (char_length(title) between 1 and 150),
  excerpt text check (excerpt is null or char_length(excerpt) <= 80),
  evidence jsonb check (evidence is null or jsonb_typeof(evidence) = 'object'),
  speech_ratio double precision check (speech_ratio is null or (speech_ratio >= 0 and speech_ratio <= 1)),
  decision text not null default 'proposed' check (decision in ('proposed','minutes','skip','merged')),
  merged_into integer check (merged_into is null or merged_into between 1 and 8),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (recording_id, proposal_revision, position),
  check (end_seconds > start_seconds),
  check ((decision = 'merged') = (merged_into is not null))
);
alter table public.recording_scenes enable row level security;
revoke all on public.recording_scenes from public, anon, authenticated;
grant select, insert, update, delete on public.recording_scenes to service_role;

-- 場面が複数あったときの扱い（auto＝自動で分ける / confirm＝分け方を確認してから / never＝分けない）。
-- strict な settings の外に置く（中に入れると、新しい鍵を保存したあと旧版へ戻したときに全録音の処理が止まる）。
alter table public.recording_ai_settings add column scene_policy text not null default 'confirm' check (scene_policy in ('auto','confirm','never'));

-- db-contract: reviewed 既存の 3 つの命令の振る舞いは変えず、場面の分け方の 2 つ（split / keep_whole）を足す。どちらも持ち主の録音が「分け方の確認待ち」で、候補の版が今のものと同じときだけ受け、split は人の決定を recording_scenes に同じ取引で残す。
create or replace function public.request_recording_control(p_id uuid,p_owner text,p_revision integer,p_request uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare target public.recordings; prior public.recording_commands; offered public.recording_scene_proposals;
begin
  select * into target from public.recordings where id=p_id and owner_email=p_owner for update;
  if not found then raise exception 'recording_not_found' using errcode='P0002'; end if;
  if p_action not in ('cancel','resume','context','split','keep_whole') or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid_action' using errcode='22023'; end if;
  select * into prior from public.recording_commands where id=p_request;
  if found then
    if prior.recording_id=p_id and prior.revision=p_revision+1 and prior.action=p_action and prior.payload=p_payload then
      return jsonb_build_object('revision',target.revision,'requestId',p_request);
    end if;
    raise exception 'idempotency_key_conflict' using errcode='23505';
  end if;
  if target.deleted_at is not null then raise exception 'recording_not_found' using errcode='P0002'; end if;
  if target.revision<>p_revision then raise exception 'recording_conflict' using errcode='40001'; end if;
  if p_action='resume' and (target.accepted_at is null or target.state not in ('failed','cancelled','complete')) then raise exception 'not_resumable' using errcode='22023'; end if;
  if p_action='cancel' and target.state in ('complete','failed','cancelled') then raise exception 'not_processing' using errcode='22023'; end if;
  if p_action='context' and (target.state<>'awaiting_context' or p_payload->'context' is null) then raise exception 'not_awaiting_context' using errcode='22023'; end if;
  if p_action in ('split','keep_whole') then
    if target.state<>'awaiting_context' or target.waiting_reason is distinct from 'scenes' then raise exception 'not_awaiting_scenes' using errcode='22023'; end if;
    select * into offered from public.recording_scene_proposals where recording_id=p_id;
    if not found or offered.proposal->>'outcome'<>'scenes' or (offered.proposal->>'proposalRevision') is distinct from (p_payload->>'proposalRevision') then
      raise exception 'scene_proposal_stale' using errcode='22023';
    end if;
    if p_action='split' and jsonb_typeof(p_payload->'scenes')<>'array' then raise exception 'invalid_action' using errcode='22023'; end if;
  end if;
  update public.recording_commands set status='superseded',resolved_at=now() where recording_id=p_id and status='pending';
  insert into public.recording_commands(id,recording_id,revision,action,payload) values(p_request,p_id,target.revision+1,p_action,p_payload);
  if p_action='split' then
    insert into public.recording_scenes as held(recording_id,proposal_revision,position,start_seconds,end_seconds,title,excerpt,evidence,speech_ratio,decision,merged_into,confirmed_at,updated_at)
    select p_id,(p_payload->>'proposalRevision')::integer,(choice.value->>'position')::integer,
      (choice.value->>'startSeconds')::double precision,(choice.value->>'endSeconds')::double precision,choice.value->>'title',
      left(offer.value->>'excerpt',80),nullif(offer.value->'evidence','null'::jsonb),(offer.value->>'speechRatio')::double precision,
      choice.value->>'decision',(choice.value->>'mergedInto')::integer,now(),now()
    from jsonb_array_elements(p_payload->'scenes') as choice(value)
    left join lateral (
      select one.value from jsonb_array_elements(offered.proposal->'scenes') as one(value)
      where one.value->>'position'=choice.value->>'position' limit 1
    ) as offer on true
    on conflict (recording_id,proposal_revision,position) do update set
      start_seconds=excluded.start_seconds,end_seconds=excluded.end_seconds,title=excluded.title,excerpt=excluded.excerpt,
      evidence=excluded.evidence,speech_ratio=excluded.speech_ratio,decision=excluded.decision,merged_into=excluded.merged_into,
      confirmed_at=excluded.confirmed_at,updated_at=now();
  end if;
  update public.recordings set revision=revision+1,control_request_id=p_request,control_error=null,
    state=case when p_action='cancel' then 'cancelled' else state end where id=p_id;
  insert into public.recording_events(id,recording_id,kind,actor_email,request_key)
    values(p_request,p_id,case when p_action='cancel' then 'cancel_requested' when p_action='context' then 'context_requested'
      when p_action='split' then 'split_requested' when p_action='keep_whole' then 'keep_whole_requested' else 'resume_requested' end,p_owner,p_request);
  return jsonb_build_object('revision',target.revision+1,'requestId',p_request);
end;
$$;
revoke all on function public.request_recording_control(uuid,text,integer,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.request_recording_control(uuid,text,integer,uuid,text,jsonb) to service_role;

-- db-contract: reviewed 受領の確定は今までどおり冪等。適用済みの状態を命令ごとに決め、cancel 以外の命令を cancelled に倒していた作りを直す（split＝splitting、keep_whole＝queued）。
create or replace function public.ack_recording_control(p_request uuid,p_outcome text,p_error text default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare command public.recording_commands; target public.recordings; source_id uuid;
begin
  select recording_id into source_id from public.recording_commands where id=p_request;
  if not found then raise exception 'command_not_found' using errcode='P0002'; end if;
  select * into target from public.recordings where id=source_id for update;
  select * into command from public.recording_commands where id=p_request for update;
  if target.control_request_id is distinct from command.id or command.status='superseded' then
    return jsonb_build_object('outcome','superseded');
  end if;
  if command.status in ('applied','rejected') then return jsonb_build_object('outcome',command.status); end if;
  if p_outcome not in ('applied','rejected') then raise exception 'invalid_outcome' using errcode='22023'; end if;
  if target.deleted_at is not null and command.action<>'cancel' then return jsonb_build_object('outcome','superseded'); end if;
  update public.recording_commands set status=p_outcome,error_code=p_error,resolved_at=now() where id=p_request;
  if p_outcome='applied' then
    update public.recordings set control_error=null,state=case
      when command.action='resume' then 'queued'
      when command.action='context' then 'organizing'
      when command.action='split' then 'splitting'
      when command.action='keep_whole' then 'queued'
      when command.action='cancel' then 'cancelled'
      else state end,
      waiting_reason=case when command.action in ('split','keep_whole') then null else waiting_reason end
    where id=source_id;
  else
    update public.recordings set control_error=coalesce(p_error,'control_rejected') where id=source_id;
  end if;
  return jsonb_build_object('outcome',p_outcome);
end;
$$;
revoke all on function public.ack_recording_control(uuid,text,text) from public, anon, authenticated;
grant execute on function public.ack_recording_control(uuid,text,text) to service_role;

-- db-contract: reviewed 既存の録音同期の振る舞いは変えず、子の系譜（splitFrom / splitRange）を最初の 1 回だけ残す。元の録音は同じ持ち主のものに限り、録音日時は元の値（人が直したものを含む）＋開始秒を確からしさごと引き継ぐ。
create or replace function public.sync_recording_service(p_owner text,p_record jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare current_record public.recordings; parent public.recordings; recording_id uuid; incoming_revision bigint; incoming_state text;
  split_parent uuid; split_start double precision; split_end double precision; inherited_at timestamptz; inherited_confidence text;
begin
  recording_id := (p_record->>'id')::uuid;
  incoming_revision := (p_record->>'revision')::bigint;
  incoming_state := p_record->>'state';
  split_parent := (p_record->>'splitFrom')::uuid;
  split_start := (p_record->'splitRange'->>'startSeconds')::double precision;
  split_end := (p_record->'splitRange'->>'endSeconds')::double precision;
  if split_parent is not null then
    if split_parent=recording_id or split_start is null or split_end is null or split_start<0 or split_end<=split_start then
      raise exception 'recording_split_invalid' using errcode='22023';
    end if;
    select * into parent from public.recordings where id=split_parent and owner_email=p_owner;
    if not found then raise exception 'recording_split_parent_missing' using errcode='23503'; end if;
    if parent.recorded_at is not null then
      inherited_at := parent.recorded_at + make_interval(secs => split_start);
      inherited_confidence := parent.recorded_at_confidence;
    end if;
  end if;
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
    waiting_reason=case when incoming_state<>'awaiting_context' then null when p_record ? 'waitingReason' then p_record->>'waitingReason' else waiting_reason end,
    duration_seconds=coalesce((p_record->>'seconds')::double precision,duration_seconds),
    accepted_at=coalesce(accepted_at,(p_record->>'acceptedAt')::timestamptz),
    recorded_at=coalesce(recorded_at,inherited_at,(p_record->>'recordedAt')::timestamptz),
    recorded_at_confidence=case when recorded_at is not null then recorded_at_confidence
      when inherited_at is not null then inherited_confidence
      when p_record->>'recordedAt' is not null then 'metadata' else recorded_at_confidence end,
    transcript_characters=coalesce((p_record->>'transcriptCharacters')::integer,transcript_characters),
    audio_key=coalesce(audio_key,p_record->'audio'->>'key'),
    audio_generation=coalesce(audio_generation,p_record->'audio'->>'generation'),
    storage_verified_at=coalesce(storage_verified_at,(p_record->'audio'->>'verifiedAt')::timestamptz),
    raw_key=coalesce(raw_key,p_record->'raw'->>'key'),
    raw_generation=coalesce(raw_generation,p_record->'raw'->>'generation'),
    raw_sha256=coalesce(raw_sha256,p_record->'raw'->>'sha256'),
    mime_type=coalesce(p_record->>'mimeType',mime_type),
    result_url=coalesce(p_record->>'resultUrl',result_url),
    split_from=coalesce(split_from,split_parent),
    split_start_seconds=case when split_from is null then split_start else split_start_seconds end,
    split_end_seconds=case when split_from is null then split_end else split_end_seconds end
  where id=recording_id;
  return jsonb_build_object('id',recording_id,'state',incoming_state,'revision',incoming_revision,'deleted',false,'acceptedAt',coalesce(current_record.accepted_at,(p_record->>'acceptedAt')::timestamptz));
end;
$$;
