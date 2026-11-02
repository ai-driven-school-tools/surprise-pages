-- recording_organization: 録音を組織ごとに閉じる（複数組織対応の D3）。設計の正本は docs/multi-organization.md の「録音を組織ごとに」。
-- 足すだけで、既存の表・行・関数は 1 つも書き換えない（前の版のアプリは古い関数を呼び続ける。古い関数を消すのは縮める段の別の PR）。
--
-- 1. organizations.recordings_enabled … 組織の設定「録音」（lib/organization-settings.ts の recordings）。既定は使わない（false）。
--    最初の組織（最初の組織）だけ使う側に移す（会社の行なので company-seed の印で囲む。配布版の新しい設置には入れない）
-- 2. 組織を取る保存先の関数 12 本（台帳 lib/tenant-tables.json の keyed で「直す段 D3」だったもの）。中身は古い関数と同じで、
--    読む行・書く行の全部を p_organization_id で絞り、書く行には組織の印を必ず入れる（印を写す番人に頼らない＝2 つ目の組織ができても印の無い行を作らない）。
--    録音の共有先を変える古い関数 change_recording_access は A4の org_change_recording_access に置き換え済みで、アプリはもう呼ばない。
--
-- 決まり（docs/db-migrations.md）
-- - 足す → 移す → 縮める の段を踏む。消す・名前を変える・NOT NULL を付けるは、別の PR に分ける（DB contract の関門が見る）
-- - 当てるのは CI（main に入るとステージングへ、本番は承認つきの実行で）。管理画面から手で当てない
-- - 列の既定値（DEFAULT）に組織の目印を入れない（印の無い書き込みを黙って 最初の組織 に倒さない・A1 の決まり）

-- ---------------------------------------------------------------------------
-- 1. 組織の設定「録音」
-- ---------------------------------------------------------------------------
alter table public.organizations add column recordings_enabled boolean not null default false;
comment on column public.organizations.recordings_enabled is
  '組織の設定「録音」。真で、かつ契約の段が録音を開ける段のときだけ録音の機能が開く（lib/organization-features.ts）。文字起こしの処理側が受けるのはいま 最初の組織 の組織だけ';

-- company-seed: begin
update public.organizations set recordings_enabled = true where id = '00000000-0000-4000-8000-000000000001';
-- company-seed: end

-- ---------------------------------------------------------------------------
-- 2. 組織を取る録音の関数
-- ---------------------------------------------------------------------------

-- 処理の進み具合（report_recording_progress の組織つきの形）
create function public.org_report_recording_progress(p_organization_id uuid, p_owner text, p_id uuid, p_progress jsonb)
returns jsonb language sql security invoker set search_path = public as $$
  with target as (
    select id, deleted_at from public.recordings where organization_id = p_organization_id and id = p_id and owner_email = p_owner
  ), written as (
    insert into public.recording_progress as held (organization_id, recording_id, sequence, progress, updated_at)
    select p_organization_id, id, (p_progress->>'sequence')::bigint, p_progress, now() from target where deleted_at is null
    on conflict (recording_id) do update
      set sequence = excluded.sequence, progress = excluded.progress, updated_at = now()
      where held.sequence < excluded.sequence and held.organization_id = p_organization_id
    returning 1
  )
  select jsonb_build_object('found', exists(select 1 from target), 'stored', exists(select 1 from written));
$$;
revoke all on function public.org_report_recording_progress(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.org_report_recording_progress(uuid, text, uuid, jsonb) to service_role;

-- 場面の分け方の提案（report_recording_scenes の組織つきの形）
create function public.org_report_recording_scenes(p_organization_id uuid, p_owner text, p_id uuid, p_proposal jsonb)
returns jsonb language sql security invoker set search_path = public as $$
  with target as (
    select id, deleted_at from public.recordings where organization_id = p_organization_id and id = p_id and owner_email = p_owner
  ), written as (
    insert into public.recording_scene_proposals as held (organization_id, recording_id, sequence, proposal, updated_at)
    select p_organization_id, id, (p_proposal->>'sequence')::bigint, p_proposal, now() from target where deleted_at is null
    on conflict (recording_id) do update
      set sequence = excluded.sequence, proposal = excluded.proposal, updated_at = now()
      where held.sequence < excluded.sequence and held.organization_id = p_organization_id
    returning 1
  )
  select jsonb_build_object('found', exists(select 1 from target), 'stored', exists(select 1 from written));
$$;
revoke all on function public.org_report_recording_scenes(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.org_report_recording_scenes(uuid, text, uuid, jsonb) to service_role;

-- カレンダーをつなぐ（begin / finish / disconnect の組織つきの形）。人ごとの接続の行は主キーがアドレスのまま（縮める段で組織を含める）なので、
-- 別の組織の行に当たったときは書き換えない（where の組織の条件）。録音はいま 最初の組織 の組織だけに出す
create function public.org_begin_recording_calendar(p_organization_id uuid, p_owner text, p_operation uuid, p_state text, p_verifier text, p_expires timestamptz)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  insert into public.recording_calendar_controls as held (organization_id, owner_email, operation_id) values (p_organization_id, p_owner, p_operation)
    on conflict (owner_email) do update set operation_id = excluded.operation_id where held.organization_id = p_organization_id;
  if not found then return false; end if;
  insert into public.recording_calendar_pending (organization_id, state_hash, owner_email, encrypted_verifier, expires_at, operation_id)
    values (p_organization_id, p_state, p_owner, p_verifier, p_expires, p_operation);
  return true;
end;
$$;
revoke all on function public.org_begin_recording_calendar(uuid, text, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.org_begin_recording_calendar(uuid, text, uuid, text, text, timestamptz) to service_role;

create function public.org_finish_recording_calendar(p_organization_id uuid, p_owner text, p_operation uuid, p_google_sub text, p_credentials text, p_expires timestamptz)
returns boolean language plpgsql security invoker set search_path = public as $$
declare current_operation uuid;
begin
  select operation_id into current_operation from public.recording_calendar_controls
    where organization_id = p_organization_id and owner_email = p_owner for update;
  if current_operation is distinct from p_operation then return false; end if;
  insert into public.recording_calendar_connections as held (organization_id, owner_email, google_sub, encrypted_credentials, expires_at, revision)
    values (p_organization_id, p_owner, p_google_sub, p_credentials, p_expires, p_operation)
    on conflict (owner_email) do update set google_sub = excluded.google_sub,
      encrypted_credentials = excluded.encrypted_credentials, expires_at = excluded.expires_at,
      revision = excluded.revision, lease_id = null, lease_until = null, revoked_at = null, updated_at = now()
      where held.organization_id = p_organization_id;
  return found;
end;
$$;
revoke all on function public.org_finish_recording_calendar(uuid, text, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.org_finish_recording_calendar(uuid, text, uuid, text, text, timestamptz) to service_role;

create function public.org_disconnect_recording_calendar(p_organization_id uuid, p_owner text, p_operation uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  insert into public.recording_calendar_controls as held (organization_id, owner_email, operation_id) values (p_organization_id, p_owner, p_operation)
    on conflict (owner_email) do update set operation_id = excluded.operation_id where held.organization_id = p_organization_id;
  if not found then return false; end if;
  update public.recording_calendar_connections set revoked_at = now(), encrypted_credentials = '', revision = p_operation
    where organization_id = p_organization_id and owner_email = p_owner;
  return true;
end;
$$;
revoke all on function public.org_disconnect_recording_calendar(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.org_disconnect_recording_calendar(uuid, text, uuid) to service_role;

-- GitHub をつなぐ（begin / finish / disconnect の組織つきの形）。カレンダーと同じ形
create function public.org_begin_recording_github(p_organization_id uuid, p_owner text, p_operation uuid, p_state text, p_verifier text, p_expires timestamptz)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  insert into public.recording_github_controls as held (organization_id, owner_email, operation_id) values (p_organization_id, p_owner, p_operation)
    on conflict (owner_email) do update set operation_id = excluded.operation_id where held.organization_id = p_organization_id;
  if not found then return false; end if;
  insert into public.recording_github_pending (organization_id, state_hash, owner_email, encrypted_verifier, expires_at, operation_id)
    values (p_organization_id, p_state, p_owner, p_verifier, p_expires, p_operation);
  return true;
end;
$$;
revoke all on function public.org_begin_recording_github(uuid, text, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.org_begin_recording_github(uuid, text, uuid, text, text, timestamptz) to service_role;

create function public.org_finish_recording_github(p_organization_id uuid, p_owner text, p_operation uuid, p_user bigint, p_login text, p_credentials text, p_expires timestamptz, p_refresh_expires timestamptz)
returns boolean language plpgsql security invoker set search_path = public as $$
declare current_operation uuid;
begin
  select operation_id into current_operation from public.recording_github_controls
    where organization_id = p_organization_id and owner_email = p_owner for update;
  if current_operation is distinct from p_operation then return false; end if;
  insert into public.recording_github_connections as held (organization_id, owner_email, github_user_id, github_login, encrypted_credentials, expires_at, refresh_expires_at, revision)
    values (p_organization_id, p_owner, p_user, p_login, p_credentials, p_expires, p_refresh_expires, p_operation)
    on conflict (owner_email) do update set github_user_id = excluded.github_user_id, github_login = excluded.github_login,
      encrypted_credentials = excluded.encrypted_credentials, expires_at = excluded.expires_at, refresh_expires_at = excluded.refresh_expires_at,
      revision = excluded.revision, lease_id = null, lease_until = null, revoked_at = null, updated_at = now()
      where held.organization_id = p_organization_id;
  return found;
end;
$$;
revoke all on function public.org_finish_recording_github(uuid, text, uuid, bigint, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.org_finish_recording_github(uuid, text, uuid, bigint, text, text, timestamptz, timestamptz) to service_role;

create function public.org_disconnect_recording_github(p_organization_id uuid, p_owner text, p_operation uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  insert into public.recording_github_controls as held (organization_id, owner_email, operation_id) values (p_organization_id, p_owner, p_operation)
    on conflict (owner_email) do update set operation_id = excluded.operation_id where held.organization_id = p_organization_id;
  if not found then return false; end if;
  update public.recording_github_connections set revoked_at = now(), encrypted_credentials = '', revision = p_operation
    where organization_id = p_organization_id and owner_email = p_owner;
  return true;
end;
$$;
revoke all on function public.org_disconnect_recording_github(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.org_disconnect_recording_github(uuid, text, uuid) to service_role;

-- 録音の操作の依頼（request_recording_control の組織つきの形）。依頼の目印（p_request）は全体で一意の主キーなので、
-- 別の組織の依頼と目印が重なったら「別の依頼」として断る（中身を返さない）
create function public.org_request_recording_control(p_organization_id uuid, p_id uuid, p_owner text, p_revision integer, p_request uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare target public.recordings; prior public.recording_commands; offered public.recording_scene_proposals; proposed public.recording_participant_proposals;
begin
  select * into target from public.recordings where organization_id = p_organization_id and id = p_id and owner_email = p_owner for update;
  if not found then raise exception 'recording_not_found' using errcode = 'P0002'; end if;
  if p_action not in ('cancel','resume','context','split','keep_whole','participants') or jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid_action' using errcode = '22023'; end if;
  select * into prior from public.recording_commands where id = p_request;
  if found then
    if prior.organization_id = p_organization_id and prior.recording_id = p_id and prior.revision = p_revision + 1 and prior.action = p_action and prior.payload = p_payload then
      return jsonb_build_object('revision', target.revision, 'requestId', p_request);
    end if;
    raise exception 'idempotency_key_conflict' using errcode = '23505';
  end if;
  if target.deleted_at is not null then raise exception 'recording_not_found' using errcode = 'P0002'; end if;
  if target.revision <> p_revision then raise exception 'recording_conflict' using errcode = '40001'; end if;
  if p_action = 'resume' and (target.accepted_at is null or target.state not in ('failed','cancelled','complete')) then raise exception 'not_resumable' using errcode = '22023'; end if;
  if p_action = 'cancel' and target.state in ('complete','failed','cancelled') then raise exception 'not_processing' using errcode = '22023'; end if;
  if p_action = 'context' and (target.state <> 'awaiting_context' or p_payload->'context' is null) then raise exception 'not_awaiting_context' using errcode = '22023'; end if;
  if p_action in ('split','keep_whole') then
    if target.state <> 'awaiting_context' or target.waiting_reason is distinct from 'scenes' then raise exception 'not_awaiting_scenes' using errcode = '22023'; end if;
    select * into offered from public.recording_scene_proposals where organization_id = p_organization_id and recording_id = p_id;
    if not found or offered.proposal->>'outcome' <> 'scenes' or (offered.proposal->>'proposalRevision') is distinct from (p_payload->>'proposalRevision') then
      raise exception 'scene_proposal_stale' using errcode = '22023';
    end if;
    if p_action = 'split' and jsonb_typeof(p_payload->'scenes') <> 'array' then raise exception 'invalid_action' using errcode = '22023'; end if;
  end if;
  if p_action = 'participants' then
    if target.state <> 'awaiting_context' or target.waiting_reason is distinct from 'participants' then raise exception 'not_awaiting_participants' using errcode = '22023'; end if;
    if jsonb_typeof(p_payload->'participants') <> 'object' then raise exception 'invalid_action' using errcode = '22023'; end if;
    select * into proposed from public.recording_participant_proposals where organization_id = p_organization_id and recording_id = p_id;
    if not found or (proposed.proposal->>'proposalRevision') is distinct from (p_payload->'participants'->>'proposalRevision') then
      raise exception 'participant_proposal_stale' using errcode = '22023';
    end if;
  end if;
  if p_action = 'resume' and p_payload->'participants' is not null and jsonb_typeof(p_payload->'participants') <> 'object' then raise exception 'invalid_action' using errcode = '22023'; end if;
  update public.recording_commands set status = 'superseded', resolved_at = now()
    where organization_id = p_organization_id and recording_id = p_id and status = 'pending';
  insert into public.recording_commands (organization_id, id, recording_id, revision, action, payload)
    values (p_organization_id, p_request, p_id, target.revision + 1, p_action, p_payload);
  if p_action = 'split' then
    insert into public.recording_scenes as held (organization_id, recording_id, proposal_revision, position, start_seconds, end_seconds, title, excerpt, evidence, speech_ratio, decision, merged_into, confirmed_at, updated_at)
    select p_organization_id, p_id, (p_payload->>'proposalRevision')::integer, (choice.value->>'position')::integer,
      (choice.value->>'startSeconds')::double precision, (choice.value->>'endSeconds')::double precision, choice.value->>'title',
      left(offer.value->>'excerpt', 80), nullif(offer.value->'evidence', 'null'::jsonb), (offer.value->>'speechRatio')::double precision,
      choice.value->>'decision', (choice.value->>'mergedInto')::integer, now(), now()
    from jsonb_array_elements(p_payload->'scenes') as choice(value)
    left join lateral (
      select one.value from jsonb_array_elements(offered.proposal->'scenes') as one(value)
      where one.value->>'position' = choice.value->>'position' limit 1
    ) as offer on true
    on conflict (recording_id, proposal_revision, position) do update set
      start_seconds = excluded.start_seconds, end_seconds = excluded.end_seconds, title = excluded.title, excerpt = excluded.excerpt,
      evidence = excluded.evidence, speech_ratio = excluded.speech_ratio, decision = excluded.decision, merged_into = excluded.merged_into,
      confirmed_at = excluded.confirmed_at, updated_at = now()
      where held.organization_id = p_organization_id;
  end if;
  if (p_action = 'participants' or (p_action = 'resume' and p_payload->'participants' is not null)) then
    update public.recording_participants set confirmed_at = now(), updated_at = now()
      where organization_id = p_organization_id and recording_id = p_id;
  end if;
  update public.recordings set revision = revision + 1, control_request_id = p_request, control_error = null,
    state = case when p_action = 'cancel' then 'cancelled' else state end
    where organization_id = p_organization_id and id = p_id;
  insert into public.recording_events (organization_id, id, recording_id, kind, actor_email, request_key)
    values (p_organization_id, p_request, p_id, case when p_action = 'cancel' then 'cancel_requested' when p_action = 'context' then 'context_requested'
      when p_action = 'split' then 'split_requested' when p_action = 'keep_whole' then 'keep_whole_requested'
      when p_action = 'participants' then 'participants_requested' else 'resume_requested' end, p_owner, p_request);
  return jsonb_build_object('revision', target.revision + 1, 'requestId', p_request);
end;
$$;
revoke all on function public.org_request_recording_control(uuid, uuid, text, integer, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.org_request_recording_control(uuid, uuid, text, integer, uuid, text, jsonb) to service_role;

-- 処理側が依頼を受け取ったと知らせる（ack_recording_control の組織つきの形）。別の組織の依頼の目印は「無い」と同じ
create function public.org_ack_recording_control(p_organization_id uuid, p_request uuid, p_outcome text, p_error text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare command public.recording_commands; target public.recordings; source_id uuid;
begin
  select recording_id into source_id from public.recording_commands where organization_id = p_organization_id and id = p_request;
  if not found then raise exception 'command_not_found' using errcode = 'P0002'; end if;
  select * into target from public.recordings where organization_id = p_organization_id and id = source_id for update;
  select * into command from public.recording_commands where organization_id = p_organization_id and id = p_request for update;
  if target.control_request_id is distinct from command.id or command.status = 'superseded' then
    return jsonb_build_object('outcome', 'superseded');
  end if;
  if command.status in ('applied','rejected') then return jsonb_build_object('outcome', command.status); end if;
  if p_outcome not in ('applied','rejected') then raise exception 'invalid_outcome' using errcode = '22023'; end if;
  if target.deleted_at is not null and command.action <> 'cancel' then return jsonb_build_object('outcome', 'superseded'); end if;
  update public.recording_commands set status = p_outcome, error_code = p_error, resolved_at = now()
    where organization_id = p_organization_id and id = p_request;
  if p_outcome = 'applied' then
    update public.recordings set control_error = null, state = case
      when command.action = 'resume' then 'queued'
      when command.action = 'context' then 'organizing'
      when command.action = 'split' then 'splitting'
      when command.action = 'keep_whole' then 'queued'
      when command.action = 'participants' then 'organizing'
      when command.action = 'cancel' then 'cancelled'
      else state end,
      waiting_reason = case when command.action in ('split','keep_whole','participants') then null else waiting_reason end
    where organization_id = p_organization_id and id = source_id;
  else
    update public.recordings set control_error = coalesce(p_error, 'control_rejected')
      where organization_id = p_organization_id and id = source_id;
  end if;
  return jsonb_build_object('outcome', p_outcome);
end;
$$;
revoke all on function public.org_ack_recording_control(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.org_ack_recording_control(uuid, uuid, text, text) to service_role;

-- 議事録のページの置き場を用意する（prepare_recording_output の組織つきの形）。ページの呼び名の一意は組織の中（全体で一意の古い縛りが
-- 残っている間は、別の組織に同じ呼び名があると「別のもの」として断る）。どの縛りに当たっても入れないだけにする（on conflict do nothing）
create function public.org_prepare_recording_output(p_organization_id uuid, p_owner text, p_generation uuid, p_inputs jsonb, p_kind text, p_basis text, p_repositories jsonb, p_references jsonb, p_context text, p_selected jsonb, p_pipeline text, p_title text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare generation public.recording_generations; artifact public.recording_artifacts; target public.pages; source_id text; source_position bigint; known_inputs jsonb; slug text;
begin
  if jsonb_typeof(p_inputs) <> 'array' or jsonb_array_length(p_inputs) < 1 or jsonb_array_length(p_inputs) > 10 or p_kind not in ('minutes','transcript') or p_basis not in ('audio_only','repository_enriched') then
    raise exception 'invalid_recording_output' using errcode = '22023';
  end if;
  insert into public.recording_generations (organization_id, id, owner_email, request_key, grouping, context_mode, selected_repositories, pipeline_version, state)
    values (p_organization_id, p_generation, p_owner, p_generation, case when jsonb_array_length(p_inputs) = 1 then 'single' else 'merged' end, p_context, p_selected, p_pipeline, 'publishing')
    on conflict (id) do nothing;
  select * into generation from public.recording_generations where organization_id = p_organization_id and id = p_generation and owner_email = p_owner for update;
  if not found then raise exception 'recording_not_found' using errcode = 'P0002'; end if;
  if generation.context_mode <> p_context or generation.selected_repositories <> p_selected or generation.pipeline_version <> p_pipeline then
    raise exception 'generation_configuration_changed' using errcode = '40001';
  end if;
  for source_id, source_position in select value, ordinality - 1 from jsonb_array_elements_text(p_inputs) with ordinality loop
    perform 1 from public.recordings where organization_id = p_organization_id and id = source_id::uuid and owner_email = p_owner
      and deleted_at is null and state <> 'cancelled' and accepted_at is not null for share;
    if not found then raise exception 'recording_not_found' using errcode = 'P0002'; end if;
  end loop;
  select jsonb_agg(recording_id::text order by position) into known_inputs from public.recording_generation_inputs
    where organization_id = p_organization_id and generation_id = p_generation;
  if known_inputs is null then
    for source_id, source_position in select value, ordinality - 1 from jsonb_array_elements_text(p_inputs) with ordinality loop
      insert into public.recording_generation_inputs (organization_id, generation_id, recording_id, owner_email, position)
        values (p_organization_id, p_generation, source_id::uuid, p_owner, source_position);
    end loop;
  elsif known_inputs <> p_inputs then
    raise exception 'generation_sources_changed' using errcode = '40001';
  end if;
  slug := 'internal/recordings/' || p_generation::text || '/' || p_kind || case when p_basis = 'repository_enriched' then '-with-context' else '' end;
  insert into public.pages (organization_id, page_slug, visibility, title, created_by, recording_protected)
    values (p_organization_id, slug, 'restricted', p_title, p_owner, true) on conflict do nothing;
  select * into target from public.pages where organization_id = p_organization_id and page_slug = slug for update;
  if not found or target.created_by is distinct from p_owner or not target.recording_protected or target.visibility <> 'restricted' or target.deleted_at is not null then
    raise exception 'recording_output_conflict' using errcode = '23514';
  end if;
  select * into artifact from public.recording_artifacts
    where organization_id = p_organization_id and generation_id = p_generation and kind = p_kind and basis = p_basis;
  if found then
    if artifact.page_id <> target.id or artifact.repositories <> p_repositories or artifact.source_references <> p_references then
      raise exception 'recording_references_changed' using errcode = '40001';
    end if;
  else
    insert into public.recording_artifacts (organization_id, id, generation_id, kind, basis, page_id, repositories, source_references)
      values (p_organization_id, gen_random_uuid(), p_generation, p_kind, p_basis, target.id, p_repositories, p_references);
  end if;
  if target.current_version_id is not null and not exists (
    select 1 from public.recording_artifacts a join public.pages p on p.organization_id = a.organization_id and p.id = a.page_id
      where a.organization_id = p_organization_id and a.generation_id = p_generation and (p.current_version_id is null or p.deleted_at is not null)
  ) then
    update public.recording_generations set state = 'complete', completed_at = coalesce(completed_at, now()), error_stage = null
      where organization_id = p_organization_id and id = p_generation;
  end if;
  return jsonb_build_object('pageSlug', slug, 'versionId', target.current_version_id);
end;
$$;
revoke all on function public.org_prepare_recording_output(uuid, text, uuid, jsonb, text, text, jsonb, jsonb, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.org_prepare_recording_output(uuid, text, uuid, jsonb, text, text, jsonb, jsonb, text, jsonb, text, text) to service_role;

-- 処理側からの受付の同期（sync_recording_service の組織つきの形）。録音の目印は全体で一意の主キーなので、
-- 別の組織に同じ目印の録音があれば「見つからない」として断る（中身を返さない）
create function public.org_sync_recording_service(p_organization_id uuid, p_owner text, p_record jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
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
    if split_parent = recording_id or split_start is null or split_end is null or split_start < 0 or split_end <= split_start then
      raise exception 'recording_split_invalid' using errcode = '22023';
    end if;
    select * into parent from public.recordings where organization_id = p_organization_id and id = split_parent and owner_email = p_owner;
    if not found then raise exception 'recording_split_parent_missing' using errcode = '23503'; end if;
    if parent.recorded_at is not null then
      inherited_at := parent.recorded_at + make_interval(secs => split_start);
      inherited_confidence := parent.recorded_at_confidence;
    end if;
  end if;
  insert into public.recordings (organization_id, id, owner_email, title, source_kind, byte_size, sha256)
    values (p_organization_id, recording_id, p_owner, p_record->>'title', p_record->>'source', (p_record->>'bytes')::bigint, p_record->>'sha256')
    on conflict (id) do nothing;
  select * into current_record from public.recordings where organization_id = p_organization_id and id = recording_id and owner_email = p_owner for update;
  if not found then raise exception 'recording_not_found' using errcode = 'P0002'; end if;
  if current_record.sha256 <> p_record->>'sha256' or current_record.byte_size <> (p_record->>'bytes')::bigint then
    raise exception 'recording_content_conflict' using errcode = '23514';
  end if;
  if current_record.deleted_at is not null or current_record.state = 'cancelled' or current_record.service_revision >= incoming_revision then
    return jsonb_build_object('id', recording_id, 'state', current_record.state, 'revision', current_record.service_revision, 'deleted', current_record.deleted_at is not null, 'acceptedAt', current_record.accepted_at);
  end if;
  if current_record.audio_key is not null and p_record->'audio' <> 'null'::jsonb and
    (current_record.audio_key <> p_record->'audio'->>'key' or current_record.audio_generation <> p_record->'audio'->>'generation') then
    raise exception 'recording_audio_conflict' using errcode = '23514';
  end if;
  update public.recordings set
    service_revision = incoming_revision,
    state = incoming_state,
    waiting_reason = case when incoming_state <> 'awaiting_context' then null when p_record ? 'waitingReason' then p_record->>'waitingReason' else waiting_reason end,
    duration_seconds = coalesce((p_record->>'seconds')::double precision, duration_seconds),
    accepted_at = coalesce(accepted_at, (p_record->>'acceptedAt')::timestamptz),
    recorded_at = coalesce(recorded_at, inherited_at, (p_record->>'recordedAt')::timestamptz),
    recorded_at_confidence = case when recorded_at is not null then recorded_at_confidence
      when inherited_at is not null then inherited_confidence
      when p_record->>'recordedAt' is not null then 'metadata' else recorded_at_confidence end,
    transcript_characters = coalesce((p_record->>'transcriptCharacters')::integer, transcript_characters),
    audio_key = coalesce(audio_key, p_record->'audio'->>'key'),
    audio_generation = coalesce(audio_generation, p_record->'audio'->>'generation'),
    storage_verified_at = coalesce(storage_verified_at, (p_record->'audio'->>'verifiedAt')::timestamptz),
    raw_key = coalesce(raw_key, p_record->'raw'->>'key'),
    raw_generation = coalesce(raw_generation, p_record->'raw'->>'generation'),
    raw_sha256 = coalesce(raw_sha256, p_record->'raw'->>'sha256'),
    mime_type = coalesce(p_record->>'mimeType', mime_type),
    result_url = coalesce(p_record->>'resultUrl', result_url),
    split_from = coalesce(split_from, split_parent),
    split_start_seconds = case when split_from is null then split_start else split_start_seconds end,
    split_end_seconds = case when split_from is null then split_end else split_end_seconds end
  where organization_id = p_organization_id and id = recording_id;
  return jsonb_build_object('id', recording_id, 'state', incoming_state, 'revision', incoming_revision, 'deleted', false, 'acceptedAt', coalesce(current_record.accepted_at, (p_record->>'acceptedAt')::timestamptz));
end;
$$;
revoke all on function public.org_sync_recording_service(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.org_sync_recording_service(uuid, text, jsonb) to service_role;
