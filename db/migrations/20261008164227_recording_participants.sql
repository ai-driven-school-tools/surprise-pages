-- recording_participants: 録音の参加者（docs/recordings-participants.md）。足すだけの段。
-- 候補の鏡の表・人が直した顔ぶれの表・決め方の列・待ち理由と命令の値・命令と受領の関数の置き換えを足す。
-- 組織の印（organization_id）は、この表より後に入った組織の移行に合わせて 20261008184521_recording_participants_organization.sql で足す
-- （印の列・移す・複合の外部キー・印を写す番人・組織を引数に取る報告の関数）。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない

-- 候補の鏡（recording_scene_proposals と同じ作り）。正本は処理側の受付で、ここは鏡。持ち主にだけ返す（名前とメールは個人情報）。
create table public.recording_participant_proposals (
  recording_id uuid primary key references public.recordings(id),
  sequence bigint not null check (sequence > 0),
  proposal jsonb not null check (jsonb_typeof(proposal) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.recording_participant_proposals enable row level security;
revoke all on public.recording_participant_proposals from public, anon, authenticated;
grant select, insert, update, delete on public.recording_participant_proposals to service_role;

-- 人が直した顔ぶれ（録音 1 本につき、人 1 つが 1 行）。key は社員ならメールアドレス、社外の人なら name: ＋ 正規化した名前。
--   decision: kept（候補をそのまま）/ added（足した）/ removed（外した）。外した記録は残す（作り直しで候補が同じ人をまた連れてきても、外した記録が勝つ）。
--   confirmed_at: 「この顔ぶれで作る」か作り直しで処理側へ渡した時刻。下書きのあいだは空。
create table public.recording_participants (
  recording_id uuid not null references public.recordings(id),
  key text not null check (char_length(key) between 1 and 260),
  name text not null check (char_length(name) between 1 and 200),
  email text check (email is null or char_length(email) <= 254),
  origin text not null check (origin in ('owner','calendar','speech','manual')),
  decision text not null check (decision in ('kept','added','removed')),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  primary key (recording_id, key)
);
alter table public.recording_participants enable row level security;
revoke all on public.recording_participants from public, anon, authenticated;
grant select, insert, update, delete on public.recording_participants to service_role;

-- 参加者の決め方（confirm＝確認してから作る / auto＝自動で決める）。strict な settings の外（場面の扱いと同じ理由）。
alter table public.recording_ai_settings add column participant_policy text not null default 'confirm' check (participant_policy in ('auto','confirm'));

-- 命令: participants（顔ぶれを決めた）。resume には payload.participants として顔ぶれを添える（命令の種類は増やさない）。
alter table public.recording_commands drop constraint recording_commands_action_check;
alter table public.recording_commands add constraint recording_commands_action_check
  check (action in ('cancel','resume','context','split','keep_whole','participants'));

alter table public.recording_events drop constraint recording_events_kind_check;
alter table public.recording_events add constraint recording_events_kind_check
  check (kind in ('accepted','started','awaiting_connection','failed','resumed','completed','shared','unshared','trashed','restored','resume_requested','cancel_requested','context_requested','split_requested','keep_whole_requested','participants_requested'));

-- 処理側から届いた候補を 1 文で受ける（report_recording_scenes と同じ約束）。
--   found  … 録音があり、送ってきた持ち主のものか（偽なら窓口は「見つかりません」を返す）
--   stored … 今回の分を残したか。ごみ箱の録音と、持っている番号（sequence）以下の報告は、失敗にせず黙って捨てる
create function public.report_recording_participants(p_owner text, p_id uuid, p_proposal jsonb)
returns jsonb language sql security invoker set search_path = public as $$
  with target as (
    select id, deleted_at from public.recordings where id = p_id and owner_email = p_owner
  ), written as (
    insert into public.recording_participant_proposals as held (recording_id, sequence, proposal, updated_at)
    select id, (p_proposal->>'sequence')::bigint, p_proposal, now() from target where deleted_at is null
    on conflict (recording_id) do update
      set sequence = excluded.sequence, proposal = excluded.proposal, updated_at = now()
      where held.sequence < excluded.sequence
    returning 1
  )
  select jsonb_build_object('found', exists(select 1 from target), 'stored', exists(select 1 from written));
$$;
revoke all on function public.report_recording_participants(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.report_recording_participants(text, uuid, jsonb) to service_role;

-- db-contract: reviewed 既存の 5 つの命令の振る舞いは変えず、参加者の顔ぶれの命令（participants）を足す。持ち主の録音が「参加者の確認待ち」で、候補の版が今のものと同じときだけ受け、顔ぶれの行（recording_participants）に確定の時刻を同じ取引で打つ。resume に顔ぶれが添っていれば同じく確定の時刻を打つ。
create or replace function public.request_recording_control(p_id uuid,p_owner text,p_revision integer,p_request uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare target public.recordings; prior public.recording_commands; offered public.recording_scene_proposals; proposed public.recording_participant_proposals;
begin
  select * into target from public.recordings where id=p_id and owner_email=p_owner for update;
  if not found then raise exception 'recording_not_found' using errcode='P0002'; end if;
  if p_action not in ('cancel','resume','context','split','keep_whole','participants') or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid_action' using errcode='22023'; end if;
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
  if p_action='participants' then
    if target.state<>'awaiting_context' or target.waiting_reason is distinct from 'participants' then raise exception 'not_awaiting_participants' using errcode='22023'; end if;
    if jsonb_typeof(p_payload->'participants')<>'object' then raise exception 'invalid_action' using errcode='22023'; end if;
    select * into proposed from public.recording_participant_proposals where recording_id=p_id;
    if not found or (proposed.proposal->>'proposalRevision') is distinct from (p_payload->'participants'->>'proposalRevision') then
      raise exception 'participant_proposal_stale' using errcode='22023';
    end if;
  end if;
  if p_action='resume' and p_payload->'participants' is not null and jsonb_typeof(p_payload->'participants')<>'object' then raise exception 'invalid_action' using errcode='22023'; end if;
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
  -- 顔ぶれを渡したら、人の直した行に確定の時刻を打つ（下書きは窓口が先に書いている。行が無い＝候補のままの人は、処理側が命令の中身で知る）
  if (p_action='participants' or (p_action='resume' and p_payload->'participants' is not null)) then
    update public.recording_participants set confirmed_at=now(),updated_at=now() where recording_id=p_id;
  end if;
  update public.recordings set revision=revision+1,control_request_id=p_request,control_error=null,
    state=case when p_action='cancel' then 'cancelled' else state end where id=p_id;
  insert into public.recording_events(id,recording_id,kind,actor_email,request_key)
    values(p_request,p_id,case when p_action='cancel' then 'cancel_requested' when p_action='context' then 'context_requested'
      when p_action='split' then 'split_requested' when p_action='keep_whole' then 'keep_whole_requested'
      when p_action='participants' then 'participants_requested' else 'resume_requested' end,p_owner,p_request);
  return jsonb_build_object('revision',target.revision+1,'requestId',p_request);
end;
$$;
revoke all on function public.request_recording_control(uuid,text,integer,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.request_recording_control(uuid,text,integer,uuid,text,jsonb) to service_role;

-- db-contract: reviewed 受領の確定は今までどおり冪等。participants の applied は organizing（顔ぶれが決まり、まとまりへ進む）にし、待ち理由を外す。ほかの命令の振る舞いは変えない。
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
      when command.action='participants' then 'organizing'
      when command.action='cancel' then 'cancelled'
      else state end,
      waiting_reason=case when command.action in ('split','keep_whole','participants') then null else waiting_reason end
    where id=source_id;
  else
    update public.recordings set control_error=coalesce(p_error,'control_rejected') where id=source_id;
  end if;
  return jsonb_build_object('outcome',p_outcome);
end;
$$;
revoke all on function public.ack_recording_control(uuid,text,text) from public, anon, authenticated;
grant execute on function public.ack_recording_control(uuid,text,text) to service_role;
