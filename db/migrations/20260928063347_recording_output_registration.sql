alter table public.recording_artifacts add column source_references jsonb not null default '[]'::jsonb;

-- db-contract: reviewed 録音の成果物は、所有者確認済みの生成元と閲覧依存を固定してから既存投稿口で本文を積む。
create function public.prepare_recording_output(p_owner text,p_generation uuid,p_inputs jsonb,p_kind text,p_basis text,p_repositories jsonb,p_references jsonb,p_context text,p_selected jsonb,p_pipeline text,p_title text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare generation public.recording_generations; artifact public.recording_artifacts; target public.pages; source_id text; source_position bigint; known_inputs jsonb; slug text;
begin
  if jsonb_typeof(p_inputs)<>'array' or jsonb_array_length(p_inputs)<1 or jsonb_array_length(p_inputs)>10 or p_kind not in ('minutes','transcript') or p_basis not in ('audio_only','repository_enriched') then
    raise exception 'invalid_recording_output' using errcode='22023';
  end if;
  insert into public.recording_generations(id,owner_email,request_key,grouping,context_mode,selected_repositories,pipeline_version,state)
    values(p_generation,p_owner,p_generation,case when jsonb_array_length(p_inputs)=1 then 'single' else 'merged' end,p_context,p_selected,p_pipeline,'publishing') on conflict(id) do nothing;
  select * into generation from public.recording_generations where id=p_generation and owner_email=p_owner for update;
  if not found then raise exception 'recording_not_found' using errcode='P0002'; end if;
  if generation.context_mode<>p_context or generation.selected_repositories<>p_selected or generation.pipeline_version<>p_pipeline then
    raise exception 'generation_configuration_changed' using errcode='40001';
  end if;
  for source_id,source_position in select value,ordinality-1 from jsonb_array_elements_text(p_inputs) with ordinality loop
    perform 1 from public.recordings where id=source_id::uuid and owner_email=p_owner and deleted_at is null and state<>'cancelled' and accepted_at is not null for share;
    if not found then raise exception 'recording_not_found' using errcode='P0002'; end if;
  end loop;
  select jsonb_agg(recording_id::text order by position) into known_inputs from public.recording_generation_inputs where generation_id=p_generation;
  if known_inputs is null then
    for source_id,source_position in select value,ordinality-1 from jsonb_array_elements_text(p_inputs) with ordinality loop
      insert into public.recording_generation_inputs(generation_id,recording_id,owner_email,position) values(p_generation,source_id::uuid,p_owner,source_position);
    end loop;
  elsif known_inputs<>p_inputs then
    raise exception 'generation_sources_changed' using errcode='40001';
  end if;
  slug:='internal/recordings/'||p_generation::text||'/'||p_kind||case when p_basis='repository_enriched' then '-with-context' else '' end;
  insert into public.pages(page_slug,visibility,title,created_by,recording_protected) values(slug,'restricted',p_title,p_owner,true) on conflict(page_slug) do nothing;
  select * into target from public.pages where page_slug=slug for update;
  if target.created_by is distinct from p_owner or not target.recording_protected or target.visibility<>'restricted' or target.deleted_at is not null then
    raise exception 'recording_output_conflict' using errcode='23514';
  end if;
  select * into artifact from public.recording_artifacts where generation_id=p_generation and kind=p_kind and basis=p_basis;
  if found then
    if artifact.page_id<>target.id or artifact.repositories<>p_repositories or artifact.source_references<>p_references then
      raise exception 'recording_references_changed' using errcode='40001';
    end if;
  else
    insert into public.recording_artifacts(id,generation_id,kind,basis,page_id,repositories,source_references)
      values(gen_random_uuid(),p_generation,p_kind,p_basis,target.id,p_repositories,p_references);
  end if;
  if target.current_version_id is not null and not exists (
    select 1 from public.recording_artifacts a join public.pages p on p.id=a.page_id
      where a.generation_id=p_generation and (p.current_version_id is null or p.deleted_at is not null)
  ) then
    update public.recording_generations set state='complete',completed_at=coalesce(completed_at,now()),error_stage=null where id=p_generation;
  end if;
  return jsonb_build_object('pageSlug',slug,'versionId',target.current_version_id);
end;
$$;
revoke all on function public.prepare_recording_output(text,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.prepare_recording_output(text,uuid,jsonb,text,text,jsonb,jsonb,text,jsonb,text,text) to service_role;
