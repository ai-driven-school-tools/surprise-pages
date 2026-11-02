-- db-contract: reviewed 所有者と版を行ロック下で確認し、新規録音の操作要求だけを追加する。
create function public.request_recording_control(p_id uuid,p_owner text,p_revision integer,p_request uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare target public.recordings; prior public.recording_commands;
begin
  select * into target from public.recordings where id=p_id and owner_email=p_owner for update;
  if not found then raise exception 'recording_not_found' using errcode='P0002'; end if;
  if p_action not in ('cancel','resume','context') or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid_action' using errcode='22023'; end if;
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
  update public.recording_commands set status='superseded',resolved_at=now() where recording_id=p_id and status='pending';
  insert into public.recording_commands(id,recording_id,revision,action,payload) values(p_request,p_id,target.revision+1,p_action,p_payload);
  update public.recordings set revision=revision+1,control_request_id=p_request,control_error=null,
    state=case when p_action='cancel' then 'cancelled' else state end where id=p_id;
  insert into public.recording_events(id,recording_id,kind,actor_email,request_key)
    values(p_request,p_id,case when p_action='cancel' then 'cancel_requested' when p_action='context' then 'context_requested' else 'resume_requested' end,p_owner,p_request);
  return jsonb_build_object('revision',target.revision+1,'requestId',p_request);
end;
$$;
revoke all on function public.request_recording_control(uuid,text,integer,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.request_recording_control(uuid,text,integer,uuid,text,jsonb) to service_role;

-- db-contract: reviewed 操作の受領を冪等に確定する。新しい所有者操作がある場合は古い受領で状態を戻さない。
create function public.ack_recording_control(p_request uuid,p_outcome text,p_error text default null)
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
      else 'cancelled' end where id=source_id;
  else
    update public.recordings set control_error=coalesce(p_error,'control_rejected') where id=source_id;
  end if;
  return jsonb_build_object('outcome',p_outcome);
end;
$$;
revoke all on function public.ack_recording_control(uuid,text,text) from public, anon, authenticated;
grant execute on function public.ack_recording_control(uuid,text,text) to service_role;
